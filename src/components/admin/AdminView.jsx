// ─── ADMIN VIEW ──────────────────────────────────────────────
// Il guscio dell'area Admin: barra dei tab e instradamento. I cinque tab
// vivono in ./tabs/ — erano cinque componenti nello stesso file, ognuno con la
// propria logica di export, validazione e chiamate API.
//
// Come le altre cinque viste, questa NON riceve più `state` (vedi
// VoyageDesk.jsx e state/TasksContext.jsx sul perché): era l'unica eccezione, e
// la drillava a tutte e cinque le tab. `state` cambia identità dopo qualunque
// azione — un toast, un carattere nella ricerca della Topbar — quindi finché
// era una prop ogni carattere digitato ridisegnava l'intera area Admin,
// statistiche comprese, ed era anche l'unica vista dove `memo` non poteva
// agganciarsi a nulla.
//
// Le prop rimaste sono le sole fette che non vivono già in un contesto e hanno
// identità stabile finché quella fetta non cambia davvero. Team, categorie e
// utente corrente non compaiono perché le tab li leggono da AppDataContext; i
// task da TasksContext.
import { memo, useState } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { AdminTeamTab } from "./tabs/AdminTeamTab.jsx";
import { AdminIOTab } from "./tabs/AdminIOTab.jsx";
import { AdminStatsTab } from "./tabs/AdminStatsTab.jsx";
import { AdminCategoriesTab } from "./tabs/AdminCategoriesTab.jsx";
import { AdminLogTab } from "./tabs/AdminLogTab.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const mb24 = { marginBottom: 24 };
const txtF28Bold = { fontSize: 28, color: "var(--heading)", margin: 0, fontWeight: 700 };
const txtF14Muted = { color: "var(--text-muted)", fontSize: 14, marginTop: 4 };
const rowGap4Mb20 = {
  display: "flex", gap: 4, marginBottom: 20,
  borderBottom: "1px solid var(--border)",
  overflowX: "auto", whiteSpace: "nowrap",
};

export const AdminView = memo(function AdminView({
  agencyName, notices, activityLog, messageTemplates,
}) {
  const [tab, setTab] = useState("team");
  const { isMobile } = useViewport();

  const tabs = [
    { id: "team", icon: "👥", label: "Team" },
    { id: "io", icon: "📤", label: "Import / Export" },
    { id: "stats", icon: "📊", label: "Sistema" },
    { id: "cats", icon: "🏷️", label: "Categorie" },
    { id: "log", icon: "📋", label: "Log attività" },
  ];

  return (
    <div className="vd-pad" style={{ padding: isMobile ? 16 : 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={mb24}>
        <h1 className="playfair" style={txtF28Bold}>
          ⚙️ Amministrazione
        </h1>
        <p style={txtF14Muted}>
          Gestione team, categorie, import/export, statistiche e log attività
        </p>
      </div>

      {/* Tab nav */}
      <div style={rowGap4Mb20}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px", background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
                color: active ? "var(--navy)" : "var(--text-muted)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit", marginBottom: -1, flexShrink: 0,
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="fade-in" key={tab}>
        {tab === "team" && <AdminTeamTab />}
        {tab === "io" && <AdminIOTab agencyName={agencyName} notices={notices} />}
        {tab === "stats" && <AdminStatsTab messageTemplates={messageTemplates} />}
        {tab === "cats" && <AdminCategoriesTab />}
        {tab === "log" && <AdminLogTab activityLog={activityLog} />}
      </div>
    </div>
  );
});

