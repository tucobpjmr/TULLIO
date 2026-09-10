// src/components/chat/useInvioMessaggi.js
// I tre modi di mandare qualcosa in una conversazione: testo, vocale, file.
//
// M-5 dell'audit del 10 settembre. Le tre funzioni stavano in
// ConversationView, e con loro l'unico ref di coordinamento che restava dopo
// il typing: `mountedRef`. Serve a `sendVoice` e `sendFile` — le sole due
// operazioni che ATTRAVERSANO un await (l'upload su Storage) e possono quindi
// tornare quando la chat è già chiusa — e a nessun altro. Tenerlo dove è
// usato è il punto del rilievo: un ref che protegge un solo await non ha
// ragione di stare nel corpo di una vista da 530 righe, dove sembra una
// proprietà della vista.
//
// COSA RESTA FUORI DI QUI: la scrittura vera. `commands.sendMessage` è il
// comando del pannello (chat/chatCommands.js), che sa di ottimismo, rollback
// e RLS. Qui si COSTRUISCE il messaggio e si decide se un upload deve
// precederlo — cioè la parte che dipende da cosa l'utente ha in mano.

import { useCallback, useEffect, useRef } from "react";
import { Messages as MessagesAPI } from "../../lib/api.js";
import { isUuid } from "../../lib/mappers.js";
import { MAX_FILE_SIZE, fileKindFromName } from "./chatFiles.js";
import { randomWaveform } from "./message/VoiceRecorder.jsx";
import { parseTaskLink } from "./message/MessageTextContent.jsx";
import { testoEccezione } from "../../lib/errori.js";

/**
 * @param {object} opzioni
 * @param {any} opzioni.conv
 * @param {string} opzioni.myId
 * @param {any} opzioni.cv        lo stato del composer (input, replyingTo, …)
 * @param {(a: any) => void} opzioni.cvd
 * @param {any} opzioni.commands
 * @param {(a: any) => void} opzioni.dispatch  il dispatch dell'app, per i toast
 * @param {() => void} opzioni.stopTyping
 */
export function useInvioMessaggi({ conv, myId, cv, cvd, commands, dispatch, stopTyping }) {
  // Guardia unmount: un setState dopo l'unmount (utente che chiude la chat a
  // metà upload) genera un warning React e perde la callback d'errore.
  const montato = useRef(true);
  useEffect(() => {
    montato.current = true;
    return () => { montato.current = false; };
  }, []);

  const toastErrore = useCallback((messaggio) => {
    dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: messaggio } });
  }, [dispatch]);

  const sendText = useCallback(() => {
    const { input, replyingTo, pendingTaskRef } = cv;
    if (!input.trim()) return;
    // Se il testo che sta partendo contiene ancora un pattern "🔗 Riferimento
    // task: …" (perché viene da un prefill, o perché l'utente l'ha tenuto),
    // allega il taskRef come uuid.
    const testo = input.trim();
    const haAncoraIlLink = parseTaskLink(testo) !== null;
    commands.sendMessage(conv.id, {
      id: "m" + Date.now(), sender: myId, type: "text",
      text: testo, time: new Date().toISOString(),
      readBy: [myId],
      replyTo: replyingTo?.id,
      ...(haAncoraIlLink && pendingTaskRef ? { taskRef: pendingTaskRef } : {}),
    });
    stopTyping();
    cvd({ type: "AFTER_SEND" });
  }, [conv.id, myId, cv, cvd, commands, stopTyping]);

  // Riceve il payload dal VoiceRecorder: { blob, duration, waveform, mimeType }.
  // Carica l'audio reale solo su conversazioni vere (uuid); sui mock o quando
  // il microfono non era disponibile (blob null) resta un vocale simulato.
  const sendVoice = useCallback(async ({ blob, duration, waveform, mimeType }) => {
    let fileUrl = null;
    let fileType = null;
    if (blob && isUuid(conv.id)) {
      const { path, error } = await MessagesAPI.uploadVoice(blob, conv.id, mimeType || "audio/webm");
      if (!montato.current) return;
      if (error || !path) {
        console.error("[chat] voice upload", error);
        toastErrore(`Invio vocale fallito: ${testoEccezione(error)}`);
        cvd({ type: "RECORDING", v: false });
        return;
      }
      fileUrl = path;
      fileType = mimeType || null;
    }
    commands.sendMessage(conv.id, {
      id: "m" + Date.now(), sender: myId, type: "voice",
      duration, waveform: waveform || randomWaveform(), fileUrl, fileType,
      time: new Date().toISOString(),
      readBy: [myId],
    });
    cvd({ type: "RECORDING", v: false });
  }, [conv.id, myId, cvd, commands, toastErrore]);

  const sendFile = useCallback(async (file) => {
    if (!file || cv.uploading) return;
    // Validazione client del limite del bucket (vedi migration
    // 20260611_chat_files_storage.sql): senza, l'utente vede l'errore solo
    // dopo aver caricato fino al rifiuto di Storage.
    if (file.size > MAX_FILE_SIZE) {
      toastErrore(`File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
      return;
    }
    // Conv mock (id non-uuid, smoke-test senza login): nessuno storage, il
    // messaggio resta solo locale senza fileUrl.
    let fileUrl = null;
    if (isUuid(conv.id)) {
      cvd({ type: "UPLOADING", v: true });
      const { path, error } = await MessagesAPI.uploadFile(file, conv.id);
      if (!montato.current) return;
      cvd({ type: "UPLOADING", v: false });
      if (error || !path) {
        console.error("[chat] upload", error);
        toastErrore(`Upload fallito: ${testoEccezione(error)}`);
        return;
      }
      fileUrl = path;
    }
    commands.sendMessage(conv.id, {
      id: "m" + Date.now(), sender: myId, type: "file",
      fileName: file.name, fileSize: file.size,
      fileType: fileKindFromName(file.name), fileUrl,
      time: new Date().toISOString(),
      readBy: [myId],
    });
  }, [conv.id, myId, cv.uploading, cvd, commands, toastErrore]);

  return { sendText, sendVoice, sendFile };
}
