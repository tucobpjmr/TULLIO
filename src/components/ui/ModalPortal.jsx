// ─── MODAL PORTAL ────────────────────────────────────────────────────────────
// Sgancia un overlay `position: fixed` dalla gerarchia in cui è dichiarato e lo
// monta su document.body.
//
// PERCHÉ SERVE. Per spec CSS un antenato con `transform` diverso da "none"
// diventa containing block per i discendenti `position: fixed`: quel fixed non
// si posiziona più rispetto al viewport ma rispetto all'antenato. Le viste
// dell'app entrano con le classi d'animazione .fade-in/.slide-up/.slide-right,
// i cui keyframe finali contengono un translate; alcune card modali usano
// inoltre un `transform: translate(-50%,-50%)` inline permanente.
// Un modale dichiarato dentro uno di questi wrapper veniva quindi centrato
// sull'altezza del contenitore — spesso molto più alto del viewport, essendo
// scrollabile — e compariva troppo in basso, fuori schermo su mobile
// (segnalato su "+ Aggiungi categoria" in Amministrazione; stesso sintomo già
// visto e risolto col portale nel modulo Liste, vedi liste/listeModals.jsx).
//
// PERCHÉ QUI BASTA IL PORTALE NUDO. A differenza di listeModals.jsx — che deve
// riavvolgere il contenuto in .lv-root perché il CSS del modulo Liste è scopato
// sotto quella classe — gli stili usati da questi modali sono globali: le
// variabili --navy/--card/--border/... stanno su :root e il font su `body`
// (vedi FontLoader in VoyageDesk.jsx), quindi `fontFamily: "inherit"` continua
// a risolvere in 'DM Sans' anche sotto document.body. Nessun wrapper aggiuntivo
// è necessario.
import { createPortal } from "react-dom";

export const ModalPortal = ({ children }) => createPortal(children, document.body);
