// src/components/admin/tabs/AuditLogSection.jsx
// Il REGISTRO DI CONTROLLO: la metà durevole della tab «Log attività».
//
// A-2 dell'audit sicurezza del 26 agosto. Fino a quel rilievo questa tab
// mostrava soltanto `state.activityLog` — stato React in memoria, tetto 100
// voci, azzerato a ogni reload e locale alla singola scheda. Con filtri per
// tipo ed export CSV aveva l'aspetto di un audit trail, e non lo era: un admin
// che l'apriva per sapere chi avesse disattivato un collega trovava una lista
// vuota.
//
// Qui c'è la tabella `audit_log`, che le operazioni privilegiate scrivono dal
// DATABASE (trigger su users e clients, trigger di TRUNCATE sul modulo Liste) e
// dalle Edge Function con service_role — cioè dai punti che nessun percorso
// client può saltare. È un file a sé e non un secondo componente dentro
// AdminLogTab per la convenzione del repo (un file, un componente; B-3
// dell'audit del 13 agosto) e perché `react/no-multi-comp` è un numero
// misurato da verifica:convenzioni.
import { useMemo, useState } from "react";
import { AuditLog } from "../../../lib/api.js";
import { useCaricamento } from "../../../hooks/useCaricamento.js";
import { cardStyle, btnGhost } from "../adminStyles.js";
import { downloadFile, escapeCSV } from "../adminExport.js";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo, non
// ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF32Mb8 = { fontSize: 32, marginBottom: 8 };
const txtF11Mt6 = { fontSize: 11, marginTop: 6 };
const gridGap2 = { display: "grid", gap: 2 };
const rowCenterGap12 = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "8px 4px", borderBottom: "1px solid var(--surface2)",
};
const txtF16TxtCenter = { fontSize: 16, width: 24, textAlign: "center" };
const txtFlex1F13 = { flex: 1, fontSize: 13, color: "var(--text)" };
const txtF11Muted = { fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" };
const txtF12Attore = { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" };
const titoloSezione = { fontSize: 13, fontWeight: 700, letterSpacing: 0.3, marginBottom: 4 };

// Il vocabolario delle azioni, in un posto solo. Le chiavi sono quelle scritte
// dai trigger e dalle Edge Function (migrazione 20260826214000): se ne compare
// una non prevista si mostra la chiave grezza invece di inventare una frase —
// un registro che non sa dire cosa è successo deve dirlo, non arrotondare.
const AZIONI = {
  "user.privilegi":         { icona: "🔑", testo: (v) => `Privilegi modificati per ${v.target_id?.slice(0, 8) ?? "un utente"}` },
  "user.eliminato":         { icona: "🗑️", testo: (v) => `Utente eliminato: ${v.details?.name ?? v.target_id?.slice(0, 8) ?? "—"}` },
  "user.hard_delete":       { icona: "🗑️", testo: (v) => `Account eliminato definitivamente${v.details?.residuo ? " (residuo di un invito interrotto)" : ""}` },
  "user.bannato":           { icona: "⛔", testo: () => "Accesso revocato: sessione bannata" },
  "user.sbloccato":         { icona: "✅", testo: () => "Accesso ripristinato" },
  "user.invitato":          { icona: "✉️", testo: (v) => `Invito inviato con ruolo ${v.details?.role ?? "—"}` },
  "user.invito_reinviato":  { icona: "✉️", testo: () => "Invito reinviato" },
  "clienti.import":         { icona: "📥", testo: (v) => `Import anagrafica: ${v.details?.righe ?? "?"} clienti` },
  "clienti.eliminati":      { icona: "🗑️", testo: (v) => `Eliminati ${v.details?.righe ?? "?"} clienti` },
  "liste.reset_totale":     { icona: "🔥", testo: () => "RESET TOTALE del modulo Liste viaggio" },
};

const descrivi = (v) => AZIONI[v.action]?.testo(v) ?? v.action;
const iconaDi = (v) => AZIONI[v.action]?.icona ?? "•";

const formatoAssoluto = (iso) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });

export const AuditLogSection = () => {
  const [ricaricaAl, setRicaricaAl] = useState(0);
  // `AuditLog.list()` è retta dalla RLS: per chi non è admin torna un elenco
  // VUOTO, non un errore — è ciò che PostgREST fa quando la policy non
  // seleziona righe. Questa sezione è comunque montata solo dentro il pannello
  // Admin, che ha già il suo gate.
  const { dato, caricando, errore } = useCaricamento(
    () => AuditLog.list({ limit: 200 }),
    [ricaricaAl],
    { iniziale: [] },
  );
  const voci = useMemo(() => dato ?? [], [dato]);

  const esportaCSV = () => {
    const headers = ["Data/ora", "Attore", "Azione", "Descrizione", "Oggetto"];
    const rows = voci.map((v) => [
      formatoAssoluto(v.at),
      v.actor_name ?? v.actor_id ?? "—",
      v.action,
      descrivi(v),
      v.target_id ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
      `voyagedesk-audit-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  return (
    <div>
      <div style={titoloSezione}>REGISTRO DI CONTROLLO</div>
      <p style={stiliComuni.txtF12MutedMb12}>
        Operazioni privilegiate di tutto il team, scritte dal database e conservate.
        Non si può modificare né svuotare: è append-only. Ultime 200 voci.
      </p>

      <div style={stiliComuni.rowCenterBetween}>
        <div style={stiliComuni.rowGap8}>
          <button onClick={() => setRicaricaAl((n) => n + 1)} style={btnGhost}>↻ Aggiorna</button>
          <button
            onClick={esportaCSV}
            disabled={voci.length === 0}
            style={{
              ...btnGhost,
              opacity: voci.length === 0 ? 0.5 : 1,
              cursor: voci.length === 0 ? "not-allowed" : "pointer",
            }}
          >📄 Esporta CSV</button>
        </div>
      </div>

      <div style={cardStyle}>
        {caricando ? (
          <div style={stiliComuni.statoVuotoCentrato}><div style={stiliComuni.txtF14}>Caricamento…</div></div>
        ) : errore ? (
          // Un registro di controllo che non si carica non deve mostrare zero
          // voci: «vuoto» e «non lo so» sono due risposte diverse, e su questa
          // tabella confonderle è il difetto peggiore possibile.
          <div style={stiliComuni.statoVuotoCentrato}>
            <div style={txtF32Mb8}>⚠️</div>
            <div style={stiliComuni.txtF14}>Registro non disponibile</div>
            <div style={txtF11Mt6}>Non è stato possibile leggerlo: riprova con «Aggiorna».</div>
          </div>
        ) : voci.length === 0 ? (
          <div style={stiliComuni.statoVuotoCentrato}>
            <div style={txtF32Mb8}>🛡️</div>
            <div style={stiliComuni.txtF14}>Nessuna operazione privilegiata registrata</div>
            <div style={txtF11Mt6}>
              Compaiono qui inviti, cambi di ruolo, revoche d'accesso, eliminazioni e import.
            </div>
          </div>
        ) : (
          <div style={gridGap2}>
            {voci.map((v) => (
              <div key={v.id} style={rowCenterGap12}>
                <div style={txtF16TxtCenter}>{iconaDi(v)}</div>
                <div style={txtFlex1F13}>{descrivi(v)}</div>
                <div style={txtF12Attore}>{v.actor_name ?? "—"}</div>
                <div style={txtF11Muted}>{formatoAssoluto(v.at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
