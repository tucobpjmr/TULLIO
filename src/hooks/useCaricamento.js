// src/hooks/useCaricamento.js
//
// ─── M-4 (audit del 26 agosto) · «CARICA AL MOUNT, SCARTA IL TARDIVO» ──────
//
// La domanda è una — «la risposta è arrivata tardi, la scarto?» — e il
// progetto le aveva già dato due risposte: `useIsMounted()` (per chi ha un
// `await` dentro un GESTORE) e `isCurrent()` di `useDebouncedTableSubscription`
// (per chi ricarica su evento), che il commento di `useIsMounted` dichiara
// essere «lo STESSO contratto». Restava scoperto il terzo caso, quello di un
// EFFETTO che carica: era scritto a mano con tre nomi di flag diversi
// (`alive`, `annullato`, `cancelled`) e — il difetto vero — tre gestioni
// dell'errore incompatibili fra loro, scelte una per copia e mai insieme:
// silenzio, `console.error`, stato d'errore con «Riprova».
//
// Qui l'errore non ha un default: o lo si dichiara con `suErrore`, o resta in
// `errore` da disegnare. Il silenzio smette di essere ciò che si eredita
// copiando il vicino e torna a essere una scelta.
//
// ⚠️ COPRE DUE CORSE, non una. Lo smontaggio E il cambio di dipendenza —
// l'ultima risposta ARRIVATA non è per forza l'ultima richiesta FATTA. Le nove
// copie coprivano metà per volta a seconda di chi le aveva scritte.
//
// ⛔ NON è la primitiva di tutto ciò che ha un flag booleano in un effetto, e
// dei nove call site che l'audit aveva contato ne assorbe TRE. Gli altri sei
// hanno la stessa FORMA e un contenuto diverso, e forzarli qui dentro
// significherebbe riaprire il caso per caso dentro la primitiva:
//   · `ui/Avatar.jsx` — per un data URI o una URL pubblica risolve
//     SINCRONAMENTE, senza promessa: `src/test/avatar.test.jsx` lo verifica
//     con un `it` non-async e spiega perché («nessun frame con l'immagine
//     assente, che su decine di avatar per schermata sarebbe un lampeggio»).
//     Passare da qui vuol dire un microtask, cioè quel frame.
//   · `hooks/useRicercaClienti.js` — è una ricerca DEBOUNCED che riparte a
//     ogni battuta, non un caricamento al mount: il `setTimeout` è metà del
//     suo contratto.
//   · `chat/message/VoiceRecorder.jsx` — la pulizia non SCARTA la risposta
//     tardiva, la usa: deve fermare le tracce del microfono
//     (`stream.getTracks().forEach(t => t.stop())`). Scartarla in silenzio
//     lascerebbe il microfono acceso.
//   · `hooks/usePushNavigation.js` — non produce alcun dato: ripara la
//     sottoscrizione push e il flag protegge solo un `console.warn`.
//   · `hooks/useDebouncedTableSubscription.js` e `hooks/usePresence.js` — sono
//     ciclo di vita di un CANALE, con gen-counter e timer. Il primo è per
//     giunta una delle due risposte già esistenti alla stessa domanda.
// Sono programmi diversi, non varianti di questo.
import { useEffect, useState } from "react";

/**
 * Carica un dato in un effetto, scartando la risposta che arriva tardi.
 *
 * @template T
 * @param {() => (Promise<T|{data: T, error: unknown}>|T|{data: T, error: unknown})} carica
 * @param {unknown[]} deps le dipendenze che fanno ripartire il caricamento
 * @param {{iniziale?: T, suErrore?: (e: unknown) => void}} [opzioni]
 * @returns {{dato: T, caricando: boolean, errore: unknown}}
 */
export function useCaricamento(carica, deps, { iniziale = null, suErrore } = {}) {
  const [dato, setDato] = useState(iniziale);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    let corrente = true;
    setCaricando(true);
    setErrore(null);
    Promise.resolve(carica())
      .then((r) => {
        if (!corrente) return;
        // La forma `{ data, error }` del data layer, o un valore nudo. Il
        // riconoscimento è sulla CHIAVE e non sul valore: `{ data: null,
        // error: null }` è una risposta legittima («non c'è niente da
        // caricare»), e confrontare con `r.error` soltanto la scambierebbe
        // per un valore nudo.
        if (r && typeof r === "object" && "error" in r) {
          if (r.error) { setErrore(r.error); suErrore?.(r.error); return; }
          setDato(r.data);
          return;
        }
        setDato(r);
      })
      .catch((e) => { if (corrente) { setErrore(e); suErrore?.(e); } })
      // Su errore il dato NON si azzera: resta l'ultimo buono. Una vista che
      // mostra dati vecchi accanto a un errore dichiarato è onesta; una che
      // li svuota afferma che non ce ne sono.
      .finally(() => { if (corrente) setCaricando(false); });
    return () => { corrente = false; };
    // `carica` e `suErrore` sono fuori di proposito: sono quasi sempre
    // funzioni nuove a ogni render, e metterle qui farebbe ripartire il
    // caricamento a ogni render. Le dipendenze vere le dichiara il chiamante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { dato, caricando, errore };
}
