// src/components/ui/Icona.jsx
// Le icone di linea del guscio (Topbar, Sidebar, BottomNav).
//
// PERCHÉ ESISTE. Fino a qui ogni icona dell'app era un carattere emoji scritto
// nel JSX ("📅", "🔔", "🗑️"). Tre difetti che nessuna scelta di stile poteva
// correggere:
//
//   1. NON EREDITA IL COLORE. L'emoji è disegnata dal sistema operativo con la
//      sua tavolozza: nella voce di nav attiva, dove il testo diventa navy o
//      bianco, l'icona restava identica. Un tracciato SVG con
//      `stroke: currentColor` cambia colore insieme al testo che accompagna —
//      è il motivo principale per cui il guscio sembrava assemblato.
//   2. È DIVERSA SU OGNI PIATTAFORMA. Lo stesso "🗑️" ha forma, peso e colore
//      diversi su iOS, Android, Windows e Linux; l'allineamento verticale pure.
//      Su un'app usata da desktop dell'agenzia E dai telefoni degli agenti in
//      trasferta, l'interfaccia non era la stessa per due persone diverse.
//   3. LO SCREEN READER LEGGE IL NOME DELL'EMOJI. "Calendario" diventava
//      "emoji calendario"; qui le icone sono `aria-hidden` e l'etichetta
//      accanto (o l'`aria-label` del bottone) resta l'unico testo annunciato.
//
// PERCHÉ NON UNO SPRITE <symbol> + <use>. Uno sprite condiviso è più compatto
// quando la stessa icona compare decine di volte, ma va montato una sola volta
// in cima all'albero e introduce id globali: due cose che questo componente non
// richiede a chi lo usa. Qui le icone a schermo sono meno di dieci e ognuna si
// disegna da sé — nessun punto di montaggio, nessuna collisione di id, nessun
// ordine di render da rispettare.
//
// PERCHÉ NON UNA LIBRERIA. `docs/CLAUDE.md`, "Cosa NON fare": niente librerie
// UI esterne. La dipendenza unica del progetto resta SheetJS.
import { memo } from "react";

// ─── TRACCIATI ───────────────────────────────────────────────────────────────
// Griglia 24×24, tratto 1.7, estremità e giunzioni arrotondate: gli attributi
// comuni stanno sull'<svg>, così ogni voce qui sotto è solo la forma.
// I nomi sono quelli del DOMINIO (la voce di nav), non del disegno: la voce
// "Archivio" resta `archivio` anche se un domani la si disegnasse diversamente.
const TRACCIATI = {
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  clienti: <><circle cx="12" cy="8" r="3.6" /><path d="M4.6 20.4c0-3.7 3.3-6.2 7.4-6.2s7.4 2.5 7.4 6.2" /></>,
  archivio: <><path d="M3.2 8.6h17.6V19a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2z" /><rect x="2" y="4" width="20" height="4.6" rx="1" /><path d="M10 13h4" /></>,
  cestino: <><path d="M4 7h16M9.5 7V4.8h5V7M6 7l1 13a1.8 1.8 0 0 0 1.8 1.7h6.4A1.8 1.8 0 0 0 17 20L18 7" /><path d="M10.5 11v6.5M13.5 11v6.5" /></>,
  admin: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14.4a1.6 1.6 0 0 0 .33 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.33 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.11a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .33-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.11a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.33-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.33H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.11a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.33 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.11a1.6 1.6 0 0 0-1.47 1z" /></>,
  chat: <path d="M21 12.4c0 4-4 7.2-9 7.2-1 0-2-.13-2.9-.37L4 21l1.3-3.6C3.9 16 3 14.3 3 12.4c0-4 4-7.2 9-7.2s9 3.2 9 7.2z" />,
  piuTask: <><rect x="7.5" y="2.8" width="13.7" height="16" rx="2" /><path d="M16.8 21.2H4.6a1.8 1.8 0 0 1-1.8-1.8V6.6" /><path d="M11 7.6h6.4M11 11.4h6.4M11 15h4" /></>,
  ricerca: <><circle cx="11" cy="11" r="6.4" /><path d="M15.9 15.9l4.6 4.6" /></>,
  notifiche: <><path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.4 18h15.2z" /><path d="M10 21h4" /></>,
};

// Lo stile è costante e vive qui, non nel JSX (M-1 dell'audit del 12 agosto,
// e la regola ESLint `no-restricted-syntax` che ne discende).
//
// `display: block` non è cosmesi: un <svg> è per default inline e si allinea
// alla linea di base, che aggiunge sotto l'icona lo spazio del discendente.
// In una riga flex allineata al centro quello spazio si legge come icona
// disallineata verso l'alto — e nella BottomNav sfalsa anche il badge, che è
// posizionato rispetto a questo elemento.
const svgBase = { display: "block", flexShrink: 0 };

// ─── ICONA ───────────────────────────────────────────────────────────────────
// `nome` è una chiave di TRACCIATI. Un nome sconosciuto rende `null` invece di
// sollevare: un'icona mancante è un difetto di presentazione, e non è una
// ragione sufficiente perché la barra di navigazione che la contiene sparisca
// dietro la ErrorBoundary.
//
// `memo` per coerenza con NavBadge e con le altre foglie del guscio: le prop
// sono due primitive, quindi il bail-out è sempre valido.
export const Icona = memo(function Icona({ nome, dimensione = 20 }) {
  const tracciato = TRACCIATI[nome];
  if (!tracciato) return null;
  return (
    <svg
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={svgBase}
      aria-hidden="true"
      focusable="false"
    >
      {tracciato}
    </svg>
  );
});
