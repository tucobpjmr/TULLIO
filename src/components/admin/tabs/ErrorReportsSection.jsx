// src/components/admin/tabs/ErrorReportsSection.jsx
// Le SEGNALAZIONI D'ERRORE: la metà cercabile del codice `VD-…` dettato al
// telefono.
//
// M-1 dell'audit del 2 settembre. `error_reports` esiste dal 1 settembre
// (A-4 dell'audit UX/errori) ma non aveva ancora un lettore: la tabella
// c'era, la policy di lettura per gli admin pure, ma chi RICEVE la
// telefonata — un admin, che per definizione non ha una console Supabase
// aperta davanti — non aveva un posto in cui cercare il codice. Stessa forma
// di AuditLogSection.jsx, che questo file affianca: stesso `useCaricamento`,
// stesso export CSV, stessa scelta di un file a sé (un file, un componente).
//
// ⚠️ Andava fatta DOPO C-1 e A-3 (tetti, limite di frequenza, retention),
// non prima: un elenco delle duecento segnalazioni più recenti su una
// tabella senza quei limiti avrebbe mostrato il rumore, non i guasti — ed è
// il motivo per cui non esisteva già.
import { useMemo, useState } from "react";
import { ErrorReports } from "../../../lib/api.js";
import { useCaricamento } from "../../../hooks/useCaricamento.js";
import { cardStyle, btnGhost } from "../adminStyles.js";
import { downloadFile, escapeCSV } from "../adminExport.js";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo, non
// ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
// ⚠️ titoloSezione/txtF32Mb8/txtF11Mt6/gridGap2/txtFlex1F13/txtF11MutedNowrap
// e rowCenterGap8 sono in styles/common.js: i primi sei perché questo file è
// la terza copia (con AdminLogTab.jsx e AuditLogSection.jsx) a rendere
// misurabile la duplicazione; rowCenterGap8 perché è identico a una forma già
// promossa.
const rowGap2 = { display: "flex", flexDirection: "column", gap: 2, padding: "8px 4px", borderBottom: "1px solid var(--surface2)" };
const txtF12Codice = { fontSize: 12, fontWeight: 700, color: "var(--navy)", fontFamily: "monospace" };
const txtF12Attore = { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" };

const formatoAssoluto = (iso) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });

export const ErrorReportsSection = () => {
  const [ricaricaAl, setRicaricaAl] = useState(0);
  // `ErrorReports.list()` è retta dalla RLS come AuditLog: per chi non è
  // admin torna un elenco VUOTO, non un errore. Questa sezione è montata
  // solo dentro il pannello Admin, che ha già il proprio gate.
  const { dato, caricando, errore } = useCaricamento(
    () => ErrorReports.list({ limit: 200 }),
    [ricaricaAl],
    { iniziale: [] },
  );
  const voci = useMemo(() => dato ?? [], [dato]);

  const esportaCSV = () => {
    const headers = ["Codice", "Data/ora", "Origine", "Utente", "Messaggio", "URL", "Stack"];
    const rows = voci.map((v) => [
      v.code,
      formatoAssoluto(v.at),
      v.origin,
      v.user_name ?? v.user_id ?? "anonimo",
      v.message,
      v.url ?? "",
      v.stack ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
      `voyagedesk-segnalazioni-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  return (
    <div>
      <div style={stiliComuni.titoloSezione}>SEGNALAZIONI D'ERRORE</div>
      <p style={stiliComuni.txtF12MutedMb12}>
        Il codice <code>VD-…</code> dettato al telefono si cerca qui. Scritte
        automaticamente da un errore non gestito, di tutto il team. Ultime 200.
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
          // Stessa distinzione di AuditLogSection: «vuoto» e «non lo so» sono
          // due risposte diverse, e qui confonderle vorrebbe dire mostrare
          // «nessuna segnalazione» mentre in realtà non si è potuto leggere.
          <div style={stiliComuni.statoVuotoCentrato}>
            <div style={stiliComuni.txtF32Mb8}>⚠️</div>
            <div style={stiliComuni.txtF14}>Segnalazioni non disponibili</div>
            <div style={stiliComuni.txtF11Mt6}>Non è stato possibile leggerle: riprova con «Aggiorna».</div>
          </div>
        ) : voci.length === 0 ? (
          <div style={stiliComuni.statoVuotoCentrato}>
            <div style={stiliComuni.txtF32Mb8}>✅</div>
            <div style={stiliComuni.txtF14}>Nessuna segnalazione</div>
            <div style={stiliComuni.txtF11Mt6}>Un errore non gestito comparirebbe qui, con il proprio codice.</div>
          </div>
        ) : (
          <div style={stiliComuni.gridGap2}>
            {voci.map((v) => (
              <div key={v.id} style={rowGap2}>
                <div style={stiliComuni.rowCenterGap8}>
                  <span style={txtF12Codice}>{v.code}</span>
                  <span style={stiliComuni.txtFlex1F13}>{v.message}</span>
                  <span style={txtF12Attore}>{v.user_name ?? "anonimo"}</span>
                  <span style={stiliComuni.txtF11MutedNowrap}>{formatoAssoluto(v.at)}</span>
                </div>
                <span style={stiliComuni.txtF11MutedNowrap}>{v.origin}{v.url ? ` · ${v.url}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
