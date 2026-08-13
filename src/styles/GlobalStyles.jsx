// src/styles/GlobalStyles.jsx
// Foglio di stile globale dell'app: variabili tema (--navy, --gold, --sky…),
// import dei font, keyframes delle animazioni e le poche classi utility
// condivise (vd-app-shell, vd-sheet-full, vd-modal-mh, vd-bottom-nav).
//
// Vive in un file suo e non in VoyageDesk.jsx perché è una risorsa di
// presentazione globale, non una responsabilità dell'orchestratore: chi cerca
// "dove è definito --gold" non deve leggere 130 righe di CSS in mezzo alla
// logica di idratazione e subscription.
export const GlobalStyles = () => (
  <style>{`
    /* UNICA richiesta di font dell'app (Playfair Display, DM Sans, Inter —
       quest'ultimo per il solo modulo Liste viaggio, listeStyles.jsx).
       M-6 dell'audit del 13 agosto: era un @import qui dentro, scoperto dal
       browser solo dopo che React monta questo componente — bundle JS,
       parse ed esecuzione già passati. Il <link rel="stylesheet"> in
       index.html (con i preconnect a googleapis/gstatic) lo scarica invece
       in parallelo al parse dell'HTML iniziale, senza aspettare il mount. */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0F2044;
      --navy-light: #1a3060;
      --navy-dark: #08152d;
      --sky: #D0EEF9;
      --gold: #D4A843;
      --gold-light: #e8c46a;
      --gold-dark: #b8902e;
      --surface: #FAFAF7;
      --surface2: #F0EEE8;
      --surface3: #E8E5DC;
      --success: #2D7A4F;
      --warning: #C8832A;
      --danger: #C0392B;
      --text: #1A1A2E;
      --text-muted: #6B6B80;
      --text-light: #9999AA;
      --border: #E0DDD5;
      /* Token semantici per le superfici contenuti:
         --card  = superficie card (sostituisce gli "#fff" inline dei contenuti)
         --heading = titoli su card (sostituisce "color: var(--navy)" nei contenuti). */
      --card: #ffffff;
      --card2: #F7F6F2;
      --heading: var(--navy);
      /* --safe-top/bottom/left/right (safe area iPhone) sono definiti in
         index.html: servono anche fuori dall'app montata (LoginScreen,
         ErrorBoundary), che non renderizzano questo FontLoader. */
      color-scheme: light;
    }
    body { font-family: 'DM Sans', sans-serif; background: var(--surface); color: var(--text); transition: background 0.2s ease, color 0.2s ease; }
    .playfair { font-family: 'Playfair Display', serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--gold-dark); }
    .drag-over { outline: 2px dashed var(--gold); background: rgba(212,168,67,0.07) !important; }
    .dragging { opacity: 0.4; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideRight { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
    @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
    @keyframes toastIn { from { transform:translateY(80px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    @keyframes toastOut { to { transform:translateY(80px); opacity:0; } }
    @keyframes recordPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.5); } 50% { box-shadow: 0 0 0 12px rgba(192,57,43,0); } }
    @keyframes wave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
    @keyframes typing { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .record-pulse { animation: recordPulse 1.5s ease infinite; }
    /* Niente "forwards": con animation-fill-mode:forwards l'elemento TRATTIENE
       per sempre il transform del keyframe finale (translateY(0)/translateX(0)),
       e un transform != none rende l'elemento containing block per i discendenti
       position:fixed — i modali montati dentro una vista animata finivano così
       centrati sull'altezza della vista (scrollabile) invece che sul viewport,
       comparendo troppo in basso. Lo stato finale di questi keyframe coincide
       con lo stato naturale dell'elemento (opacity 1, nessuna traslazione),
       quindi togliere "forwards" non cambia nulla visivamente ma libera il
       containing block a fine animazione. I modali usano comunque ModalPortal
       (vedi ui/ModalPortal.jsx): questa è la difesa a monte, quello il fix. */
    .fade-in { animation: fadeIn 0.3s ease; }
    .slide-right { animation: slideRight 0.3s ease; }
    .slide-up { animation: slideUp 0.35s ease; }
    .skeleton { animation: pulse 1.5s ease infinite; background: linear-gradient(90deg, var(--surface2) 25%, var(--surface3) 50%, var(--surface2) 75%); background-size: 200% 100%; }
    .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(15,32,68,0.12); }

    /* ─── UTILITY (M-1, avvio) ───
       Inizio del design system tracciato da M-1 (audit del 13 agosto,
       docs/AUDIT_ARCHITETTURA_2026-08-13.md): i tre pattern qui sotto erano
       ripetuti IDENTICI — stessa stringa, stesso valore — in 21+9+10 punti del
       codice (misurato via grep sul valore esatto della proprietà style,
       non una stima). Convertirli in classi non cambia un solo pixel reso: i
       valori sono copiati, non normalizzati. Non è l'intero rilievo (restano
       oltre 1400 style inline sparsi su un'ottantina di file): è la parte che
       si può chiudere in una sessione senza una verifica visiva del browser
       su ognuno degli 104 file coinvolti — vedi il documento sopra per lo
       stato reale e il percorso per il resto. */
    .vd-flex-1-min0 { flex: 1; min-width: 0; }
    .vd-field-label { font-size: 11px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 4px; display: block; }
    .vd-field-label-lg { font-size: 12px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 5px; }

    /* ─── RESPONSIVE ─── */
    /* Griglie adattive: collassano su tablet/mobile via media query.
       Gli stili inline restano il default desktop; queste regole hanno la priorità grazie a !important. */
    @media (max-width: 1024px) {
      .vd-grid-kpi { grid-template-columns: repeat(2, 1fr) !important; }
      .vd-grid-2col, .vd-grid-3col, .vd-grid-dash-main { grid-template-columns: 1fr 1fr !important; }
      .vd-grid-dash-main > * { grid-column: auto !important; }
      .vd-pad { padding: 18px !important; }
    }
    @media (max-width: 640px) {
      .vd-grid-kpi, .vd-grid-2col, .vd-grid-3col, .vd-grid-dash-main,
      .vd-grid-collapse { grid-template-columns: 1fr !important; }
      .vd-grid-dash-main > * { grid-column: auto !important; }
      .vd-pad { padding: 14px !important; }
      .vd-hide-mobile { display: none !important; }
      .vd-row-wrap { flex-wrap: wrap !important; }
    }
    /* ─── UTILITY SAFE AREA ───
       .vd-safe-top: da applicare a ogni testata che tocca il bordo superiore
       dello schermo (topbar, header dei pannelli a tutta altezza). Il padding
       spinge il contenuto sotto la status bar mentre lo sfondo dell'elemento
       continua a riempirla: nessuna striscia vuota, nessun pulsante coperto. */
    .vd-safe-top { padding-top: var(--safe-top); }
    .vd-safe-bottom { padding-bottom: var(--safe-bottom); }

    /* Bottom nav: solo mobile/tablet */
    .vd-bottom-nav { display: none; }
    @media (max-width: 1024px) {
      .vd-bottom-nav {
        display: flex;
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 450;
        background: var(--sky); border-top: 1px solid rgba(212,168,67,0.3);
        /* calc invece di env() secco: la vecchia forma "padding: 6px 4px env(...)"
           su un telefono senza tacca collassava il padding inferiore a 0 e le
           icone toccavano il bordo. */
        padding: 6px calc(4px + var(--safe-left)) calc(6px + var(--safe-bottom)) calc(4px + var(--safe-right));
        justify-content: space-around; align-items: stretch;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.25);
      }
      .vd-main-scroll { padding-bottom: calc(70px + var(--safe-bottom)) !important; }
    }
    /* ─── MODALI / SCHEDE: viewport dinamico (fix iOS Safari) ───
       Su Safari iOS le unità "vh" si riferiscono al viewport GRANDE (barre del
       browser nascoste): un modale centrato alto 90vh sfora l'area realmente
       visibile e il footer (es. il pulsante "Salva") finisce fuori schermo o
       dietro la bottom-nav, risultando irraggiungibile. "dvh" = altezza del
       viewport DINAMICO (cambia quando compaiono/scompaiono le barre), quindi il
       contenuto sta sempre dentro lo schermo visibile. La doppia dichiarazione
       (vh poi dvh) è un fallback: i browser che non conoscono dvh ignorano la
       seconda riga e usano vh. */
    .vd-modal-mh { max-height: 90vh; max-height: calc(90dvh - var(--safe-top) - var(--safe-bottom)); }
    .vd-sheet-full { height: 100vh; height: 100dvh; }
    .vd-app-shell { height: 100vh; height: 100dvh; }
    @media (max-width: 1024px) {
      /* Mobile/tablet: lascia spazio alla bottom-nav (~64px + safe-area) così il
         footer del modale resta sopra di essa e tappabile, senza sovrapposizioni.
         Gli insets sono sottratti anche qui: i modali sono centrati nel viewport
         pieno, quindi togliere l'altezza degli insets tiene la testata sotto la
         status bar e il footer sopra l'home indicator. */
      .vd-modal-mh { max-height: calc(100dvh - 76px - var(--safe-top) - var(--safe-bottom)); }
    }
  `}</style>
);
