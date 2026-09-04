// src/components/admin/tabs/AdminLogTab.jsx
// Registro attività: le azioni tracciate dal reducer (LOGGED_ACTIONS),
// filtrabili per tipo ed esportabili in CSV.
import { useState } from "react";
import { cardStyle, btnGhost, btnDanger } from "../adminStyles.js";
import { downloadFile, escapeCSV } from "../adminExport.js";
import { useConfirm } from "../../../state/ConfirmContext.jsx";
import * as stiliComuni from "../../../styles/common.js";
import { useDispatch } from "../../../state/DispatchContext.jsx";
import { AuditLogSection } from "./AuditLogSection.jsx";
import { ErrorReportsSection } from "./ErrorReportsSection.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
// ⚠️ titoloSezione/txtF32Mb8/txtF11Mt6/gridGap2/txtFlex1F13/txtF11MutedNowrap
// sono ora in styles/common.js (M-1 dell'audit del 2 settembre): ricorrevano
// già identiche qui e in AuditLogSection.jsx, ed ErrorReportsSection.jsx è
// stata la terza copia che ha reso la duplicazione misurabile.
const separatore = { height: 1, background: "var(--border)", margin: "28px 0 20px" };
const rowCenterGap12 = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "8px 4px", borderBottom: "1px solid var(--surface2)",
};
const txtF16TxtCenter = { fontSize: 16, width: 24, textAlign: "center" };

// ─── ADMIN TAB: LOG ATTIVITÀ ───────────────────────────────────────────────
export const AdminLogTab = ({ activityLog = [] }) => {
  const dispatch = useDispatch();
  const conferma = useConfirm();
  const [filter, setFilter] = useState("all");

  const groups = {
    all: () => activityLog,
    task: () => activityLog.filter(l => ["ADD_TASK","ADD_TASKS_BULK","UPDATE_TASK","MOVE_TASK","ADD_COMMENT"].includes(l.type)),
    trash: () => activityLog.filter(l => ["DELETE_TASK","RESTORE_TASK","PURGE_TASK","EMPTY_TRASH"].includes(l.type)),
    admin: () => activityLog.filter(l => l.type.includes("TEAM_MEMBER") || l.type.includes("CATEGORY") || l.type === "RESTORE_BACKUP"),
  };
  const list = groups[filter]();

  const exportLogCSV = () => {
    const headers = ["Data/ora", "Tipo", "Descrizione"];
    const rows = list.map(l => [
      new Date(l.time).toLocaleString("it-IT"),
      l.type,
      (l.text || "").replace(/\n/g, " "),
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
      `voyagedesk-log-${filter}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  const iconFor = (type) => {
    if (type.includes("DELETE") || type.includes("PURGE") || type.includes("EMPTY")) return "🗑️";
    if (type.includes("RESTORE")) return "↻";
    if (type.includes("ADD_TASK")) return "➕";
    if (type.includes("UPDATE_TASK")) return "✏️";
    if (type === "MOVE_TASK") return "🔄";
    if (type === "ADD_COMMENT") return "💬";
    if (type.includes("TEAM")) return "👤";
    if (type.includes("CATEGORY")) return "🏷️";
    if (type.includes("BACKUP")) return "💾";
    return "•";
  };

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "ora";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      {/* A-2 dell'audit sicurezza del 26 agosto. La tab ha ora DUE metà, ed è
          la correzione vera: fino a qui esisteva solo la seconda.

          Sopra il registro di controllo — durevole, di tutto il team, scritto
          dal database. Sotto la cronologia di questa sessione, che resta
          perché è utile (mostra subito l'effetto di ciò che si è appena fatto,
          incluse le azioni non privilegiate che nel registro non entrano) ma
          smette di essere l'unica cosa presente.

          Il rilievo A-1 dell'11 agosto aveva già fatto dire a questa tab la
          verità sui propri limiti, con il paragrafo qui sotto. Era la
          correzione giusta e non bastava: un avviso spiega perché il registro
          che manca non c'è, non lo sostituisce. */}
      <AuditLogSection />

      <div style={separatore} />

      {/* M-1 dell'audit del 2 settembre: il codice VD-… dettato al telefono
          ora ha un posto in cui essere cercato, non solo scritto. */}
      <ErrorReportsSection />

      <div style={separatore} />

      <div style={stiliComuni.titoloSezione}>ATTIVITÀ DI QUESTA SESSIONE</div>
      <p style={stiliComuni.txtF12MutedMb12}>
        Solo questo dispositivo, da quando hai aperto la pagina · non include le azioni
        di altri utenti e non viene conservata alla chiusura. Le operazioni privilegiate
        stanno nel registro di controllo qui sopra.
      </p>
      <div style={stiliComuni.rowCenterBetween}>
        <div style={stiliComuni.rowGap4}>
          {[
            { id: "all", label: "Tutte" },
            { id: "task", label: "Task" },
            { id: "trash", label: "Cestino" },
            { id: "admin", label: "Admin" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--border)", cursor: "pointer",
              background: filter === f.id ? "var(--navy)" : "var(--card)",
              color: filter === f.id ? "#fff" : "var(--text)",
              fontFamily: "inherit",
            }}>{f.label}</button>
          ))}
        </div>
        {activityLog.length > 0 && (
          <div style={stiliComuni.rowGap8}>
            <button onClick={exportLogCSV} disabled={list.length === 0} style={{
              ...btnGhost, opacity: list.length === 0 ? 0.5 : 1,
              cursor: list.length === 0 ? "not-allowed" : "pointer",
            }}>📄 Esporta CSV</button>
            <button onClick={async () => {
              const ok = await conferma({
                title: "Svuotare il log attività?",
                body: "La cronologia delle azioni viene cancellata. L'operazione non è reversibile.",
                cta: "Svuota", danger: true,
              });
              if (ok) dispatch({ type: "CLEAR_ACTIVITY_LOG" });
            }} style={btnDanger}>🔥 Svuota log</button>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        {list.length === 0 ? (
          <div style={stiliComuni.statoVuotoCentrato}>
            <div style={stiliComuni.txtF32Mb8}>📋</div>
            <div style={stiliComuni.txtF14}>Nessuna attività registrata{filter !== "all" ? " in questo filtro" : " ancora"}</div>
            <div style={stiliComuni.txtF11Mt6}>Le azioni di questa sessione appariranno qui (ultime 100)</div>
          </div>
        ) : (
          <div style={stiliComuni.gridGap2}>
            {list.map(l => (
              <div key={l.id} style={rowCenterGap12}>
                <div style={txtF16TxtCenter}>{iconFor(l.type)}</div>
                <div style={stiliComuni.txtFlex1F13}>{l.text}</div>
                <div style={stiliComuni.txtF11MutedNowrap}>{formatRel(l.time)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
