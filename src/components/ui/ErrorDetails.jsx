// src/components/ui/ErrorDetails.jsx
// ─── CRITICITÀ #9 · cosa si mostra di un errore, e a chi ───────────────────
// Il riquadro sotto il messaggio dei tre error boundary (globale, di vista,
// di overlay). Esiste come componente unico perché la REGOLA deve essere una
// sola: i tre boundary avevano tre riquadri copiati, e una policy replicata
// tre volte è una policy che fra sei mesi esiste in due varianti.
//
// La regola:
//   DEV        → messaggio + stack dei componenti a schermo. È dove serve, e
//                chi lo legge è chi lo sa leggere.
//   PRODUZIONE → un CODICE DI SEGNALAZIONE. Il dettaglio completo va in
//                console (lo scrive il boundary in componentDidCatch, con lo
//                stesso codice accanto), non davanti al cliente seduto alla
//                scrivania di fronte.
//
// `import.meta.env.DEV` è letto a ogni render e non in una costante di
// modulo: Vite lo sostituisce comunque con un letterale a build time — quindi
// il ramo morto esce dal bundle di produzione — ma leggerlo qui lo rende
// pilotabile da `vi.stubEnv` nei test, che altrimenti non potrebbero
// esercitare il ramo di produzione affatto.
export function ErrorDetails({ error, info, codice, tone = "light" }) {
  const scuro = tone === "dark";
  const cornice = {
    margin: "0 0 16px", borderRadius: 10,
    background: scuro ? "#020617" : "var(--surface)",
    border: `1px solid ${scuro ? "#1e293b" : "var(--border)"}`,
  };
  const accento = scuro ? "#fca5a5" : "var(--danger, #b91c1c)";

  if (import.meta.env.DEV) {
    return (
      <pre style={{
        ...cornice, padding: 12,
        color: accento, fontSize: 12, lineHeight: 1.45,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        maxHeight: 240, overflow: "auto",
      }}>
        {String(error?.message || error)}
        {info?.componentStack ? `\n${info.componentStack}` : ""}
      </pre>
    );
  }

  return (
    <div style={{ ...cornice, padding: "12px 14px" }}>
      <div style={{
        fontSize: 11, marginBottom: 4, letterSpacing: 0.4,
        color: scuro ? "rgba(226,232,240,0.6)" : "var(--text-muted)",
      }}>
        CODICE DI SEGNALAZIONE
      </div>
      {/* `user-select: all`: questo codice esiste per essere copiato o dettato,
          e un doppio tap deve selezionarlo tutto anche su mobile. */}
      <code style={{
        fontSize: 15, fontWeight: 700, letterSpacing: 1, color: accento,
        userSelect: "all", WebkitUserSelect: "all",
      }}>{codice}</code>
    </div>
  );
}
