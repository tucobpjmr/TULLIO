// src/components/liste/listeStyles.jsx
// CSS del modulo "Liste Viaggio", portato da `liste-buoni-viaggio/index.html`.
//
// Il CSS sorgente non era namespacizzato: stilava elementi nudi (body, button,
// input/select/textarea) e definiva variabili --surface/--border che collidono
// per NOME e per VALORE con quelle globali di VoyageDesk (FontLoader in
// src/VoyageDesk.jsx). Copiarlo tal quale avrebbe riscritto il font DM Sans e
// le superfici dell'intera app. Regole applicate nel porting:
//
//  1. tutte le variabili rinominate con prefisso --lv-*;
//  2. tutte le classi generiche prefissate .lv-* (.card→.lv-card, .btn→.lv-btn,
//     .badge→.lv-badge, .toolbar→.lv-toolbar, table.mov→table.lv-mov…);
//  3. ogni selettore è scopato sotto la radice .lv-root — i selettori nudi
//     body / button / input,select,textarea diventano .lv-root,
//     .lv-root button, .lv-root input…;
//  4. il font Inter è importato qui e non in <head>: fuori da .lv-root l'app
//     continua a usare DM Sans;
//  5. il toast #toast della SPA non è portato: il modulo usa il Toast React
//     dell'app (state.toast / dispatch SHOW_TOAST).
//
// Il contenuto del modulo mantiene di proposito la propria identità visiva
// (blu #0F4C81, impaginazione "foglio cartaceo"): solo la chrome di
// navigazione — bottone in Dashboard, breadcrumb — segue lo stile Tullio.
export const ListeStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    .lv-root{
      --lv-bg:#F6F7F9; --lv-surface:#FFFFFF; --lv-ink:#1B1F24; --lv-muted:#69707A;
      --lv-border:#E3E6EA; --lv-primary:#0F4C81; --lv-primary-dark:#0B3A63;
      --lv-pos:#157F3D; --lv-neg:#B23A2E; --lv-stamp:#C0392B;
      --lv-radius:10px; --lv-shadow:0 1px 3px rgba(16,24,40,.07);
      font-family:'Inter',system-ui,sans-serif;
      background:var(--lv-bg); color:var(--lv-ink); font-size:15px; line-height:1.5;
      -webkit-font-smoothing:antialiased;
    }
    .lv-root *{box-sizing:border-box}
    .lv-root button{font-family:inherit;cursor:pointer}
    .lv-root input,.lv-root select,.lv-root textarea{font-family:inherit;font-size:15px}
    .lv-root .lv-num{font-variant-numeric:tabular-nums}

    /* ---------- layout ---------- */
    .lv-main{max-width:920px;margin:0 auto;padding:20px 16px 80px}

    /* ---------- buttons ---------- */
    .lv-root .lv-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--lv-border);background:var(--lv-surface);color:var(--lv-ink);padding:8px 14px;border-radius:8px;font-size:14px;font-weight:500;transition:background .12s}
    .lv-root .lv-btn:hover{background:#F1F3F6}
    .lv-root .lv-btn.primary{background:var(--lv-primary);border-color:var(--lv-primary);color:#fff}
    .lv-root .lv-btn.primary:hover{background:var(--lv-primary-dark)}
    .lv-root .lv-btn.danger{color:var(--lv-neg);border-color:#EAD2CF}
    .lv-root .lv-btn.sm{padding:5px 10px;font-size:13px}
    .lv-root .lv-btn:disabled{opacity:.5;cursor:not-allowed}
    .lv-root .lv-btn:focus-visible,.lv-root input:focus-visible,.lv-root select:focus-visible{outline:2px solid var(--lv-primary);outline-offset:1px}

    /* ---------- cards / lists ---------- */
    .lv-root .lv-card{background:var(--lv-surface);border:1px solid var(--lv-border);border-radius:var(--lv-radius);box-shadow:var(--lv-shadow)}
    .lv-root .lv-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
    .lv-root .lv-toolbar input[type=search]{flex:1;min-width:180px;padding:9px 12px;border:1px solid var(--lv-border);border-radius:8px;background:var(--lv-surface)}
    .lv-root .lv-toolbar select{padding:9px 10px;border:1px solid var(--lv-border);border-radius:8px;background:var(--lv-surface)}
    .lv-root .lv-sel-lbl{display:flex;align-items:center;gap:6px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--lv-muted);font-weight:600}
    .lv-root .lv-lista-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--lv-border);cursor:pointer;transition:background .1s;text-align:left;width:100%;background:none;border-left:none;border-right:none;border-top:none;font:inherit;color:inherit}
    .lv-root .lv-lista-row:last-child{border-bottom:none}
    .lv-root .lv-lista-row:hover{background:#F8FAFC}
    .lv-root .lv-lista-row .who{flex:1;min-width:0}
    .lv-root .lv-lista-row .who b{font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lv-root .lv-lista-row .who span{font-size:13px;color:var(--lv-muted)}
    .lv-root .lv-saldo{font-weight:600;font-size:15px}
    .lv-root .lv-saldo.pos{color:var(--lv-pos)}
    .lv-root .lv-saldo.neg{color:var(--lv-neg)}
    .lv-root .lv-saldo.zero{color:var(--lv-muted)}
    .lv-root .lv-badge{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:99px;white-space:nowrap}
    .lv-root .lv-badge.attiva{background:#E7F3EC;color:var(--lv-pos)}
    .lv-root .lv-badge.esaurita{background:#F6E8E6;color:var(--lv-stamp)}
    .lv-root .lv-empty{padding:40px 20px;text-align:center;color:var(--lv-muted)}

    /* ---------- detail ---------- */
    .lv-root .lv-detail-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px}
    .lv-root .lv-detail-head h1{font-size:22px;font-weight:700;letter-spacing:-.02em}
    .lv-root .lv-detail-head .sub{color:var(--lv-muted);font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}
    .lv-root .lv-detail-head .grow{flex:1;min-width:200px}
    /* titolo modificabile con un tocco: bersaglio ampio anche sul telefono */
    .lv-root .lv-tit-btn{border:1px dashed transparent;background:none;color:var(--lv-muted);font:inherit;text-align:left;padding:3px 6px;margin-left:-6px;border-radius:6px;cursor:pointer}
    .lv-root .lv-tit-btn:hover{background:#F1F5F9;color:var(--lv-ink)}
    .lv-root .lv-tit-btn .pen{opacity:.6;font-size:12px}
    .lv-root .lv-tit-btn.add{border-color:var(--lv-border)}
    .lv-root .lv-tit-edit{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1 1 100%}
    .lv-root .lv-tit-edit input{font:inherit;padding:7px 9px;border:1px solid var(--lv-border);border-radius:8px;background:#fff;color:var(--lv-ink);min-width:0;flex:1 1 180px}
    .lv-root .lv-saldo-box{background:var(--lv-surface);border:1px solid var(--lv-border);border-radius:var(--lv-radius);padding:12px 18px;text-align:right}
    .lv-root .lv-saldo-box .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lv-muted);font-weight:600}
    .lv-root .lv-saldo-box .val{font-size:24px;font-weight:700}

    /* documento — firma visiva: la lista come il foglio cartaceo */
    .lv-root .lv-foglio{position:relative;overflow:hidden}
    .lv-root table.lv-mov{width:100%;border-collapse:collapse}
    .lv-root table.lv-mov th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--lv-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--lv-border);font-weight:600}
    .lv-root table.lv-mov td{padding:11px 12px;border-bottom:1px solid #EEF0F3;vertical-align:top}
    .lv-root table.lv-mov tr:last-child td{border-bottom:none}
    .lv-root table.lv-mov .imp{text-align:right;font-weight:600;white-space:nowrap}
    .lv-root table.lv-mov .imp.pos{color:var(--lv-pos)}
    .lv-root table.lv-mov .imp.neg{color:var(--lv-neg)}
    .lv-root table.lv-mov .met{color:var(--lv-muted);font-size:13px;text-transform:uppercase}
    .lv-root table.lv-mov .dt{white-space:nowrap;color:var(--lv-muted);font-size:13px}
    .lv-root table.lv-mov .act{text-align:right;white-space:nowrap}
    .lv-root .lv-icon-btn{border:none;background:none;color:var(--lv-muted);padding:8px 10px;border-radius:6px;font-size:16px;line-height:1}
    .lv-root .lv-icon-btn:hover{background:#F1F3F6;color:var(--lv-ink)}
    .lv-root table.lv-mov td.act{padding-left:4px;padding-right:4px}
    .lv-root .lv-stamp{position:absolute;right:18px;top:14px;transform:rotate(-8deg);border:3px solid var(--lv-stamp);color:var(--lv-stamp);font-weight:700;letter-spacing:.08em;padding:4px 12px;border-radius:6px;font-size:14px;opacity:.85;pointer-events:none}

    /* ---------- forms ---------- */
    .lv-root .lv-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
    .lv-root .lv-field label{display:block;font-size:12px;font-weight:600;color:var(--lv-muted);margin-bottom:4px}
    .lv-root .lv-field input,.lv-root .lv-field select{width:100%;padding:9px 11px;border:1px solid var(--lv-border);border-radius:8px;background:#fff}
    .lv-root .lv-seg{display:flex;border:1px solid var(--lv-border);border-radius:8px;overflow:hidden}
    .lv-root .lv-seg button{flex:1;border:none;background:#fff;padding:9px 4px;font-size:14px;font-weight:500;color:var(--lv-muted)}
    .lv-root .lv-seg button.on-pos{background:#E7F3EC;color:var(--lv-pos);font-weight:600}
    .lv-root .lv-seg button.on-neg{background:#F6E8E6;color:var(--lv-neg);font-weight:600}
    /* riquadro di inserimento: in cima al foglio, sotto la barra dei comandi */
    .lv-root .lv-add-box{padding:16px;border-bottom:1px solid var(--lv-border);background:#FBFCFD;border-radius:var(--lv-radius) var(--lv-radius) 0 0}
    .lv-root .lv-add-box h3{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--lv-muted)}
    .lv-root .lv-add-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
    .lv-root .lv-btn .plus{font-weight:700;line-height:1}

    /* ---------- modal ---------- */
    .lv-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:650}
    .lv-overlay .lv-modal{background:#fff;border-radius:12px;max-width:440px;width:100%;padding:22px;max-height:90vh;overflow:auto}
    .lv-overlay .lv-modal.wide{max-width:600px}
    .lv-overlay .lv-modal h2{font-size:17px;margin-bottom:14px}
    .lv-overlay .lv-modal .row{margin-bottom:12px}
    .lv-overlay .lv-modal .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}

    /* ---------- storico ---------- */
    .lv-root .lv-hist{padding:14px 16px;font-size:13px;color:var(--lv-muted)}
    .lv-root .lv-hist li{list-style:none;padding:4px 0;border-bottom:1px dashed #EEF0F3}
    .lv-root .lv-hist li:last-child{border:none}
    .lv-root details summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--lv-muted);padding:12px 16px}

    /* ---------- modifica in linea dei campi ---------- */
    /* La card .lv-foglio ha overflow:hidden per la scritta ESAURITA in
       diagonale: senza questo contenitore una tabella troppo larga verrebbe
       tagliata invece che scorrere, nascondendo i pulsanti di riga. */
    .lv-root .lv-tab-wrap{overflow-x:auto}
    .lv-root table.lv-mov td.editable{cursor:pointer}
    .lv-root table.lv-mov td.editable:hover{background:#F1F5F9}
    .lv-root table.lv-mov td.editable:active{background:#E6EDF5}
    .lv-root .lv-met-inline{display:none;width:fit-content;margin-top:6px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--lv-muted);background:#F1F3F6;border-radius:99px;padding:3px 9px}
    .lv-root tr.lv-edit-row td{background:#FBFCFD;padding:14px 16px}
    .lv-root .lv-cell-edit label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--lv-muted);margin-bottom:6px}
    .lv-root .lv-cell-edit input,.lv-root .lv-cell-edit select{width:100%;padding:10px 11px;border:1px solid var(--lv-border);border-radius:8px;background:#fff}
    .lv-root .lv-cell-edit-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
    .lv-root .lv-hint{padding:10px 14px;font-size:12px;color:var(--lv-muted);border-top:1px solid var(--lv-border)}

    /* ---------- inserimento multiplo ---------- */
    .lv-overlay .lv-bulk-hint{font-size:12px;color:#69707A;margin-bottom:14px}
    .lv-overlay .lv-bulk-row{border:1px solid #E3E6EA;border-radius:8px;padding:10px;margin-bottom:8px;background:#FBFCFD}
    .lv-overlay .lv-bulk-row input{width:100%;padding:9px 11px;border:1px solid #E3E6EA;border-radius:8px;background:#fff}
    .lv-overlay .lv-bulk-bottom{display:flex;gap:8px;align-items:center;margin-top:8px}
    .lv-overlay .lv-bulk-seg{flex:0 0 92px}
    .lv-overlay .lv-bulk-seg button{padding:9px 0;font-size:16px;font-weight:600}
    .lv-overlay .lv-bulk-bottom .lv-bulk-imp{flex:1;min-width:0;text-align:right;font-variant-numeric:tabular-nums}
    .lv-overlay .lv-bulk-tot{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:2px solid #E3E6EA;margin-top:14px;padding-top:10px;font-size:15px}
    .lv-overlay .lv-bulk-tot b{font-size:19px;font-weight:700}
    .lv-overlay .lv-bulk-tot b.pos{color:#157F3D}
    .lv-overlay .lv-bulk-tot b.neg{color:#B23A2E}

    /* ---------- riepilogo cliente (anteprima e stampa) ---------- */
    /* Documento che si consegna al cliente: nessuna colonna Metodo e nessuno
       storico — quelle sono informazioni interne, stanno nella copia agente. */
    .lv-root .lv-riep{padding:2px}
    .lv-root .lv-riep-brand{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--lv-muted);font-weight:600}
    .lv-root .lv-riep h2{font-size:19px;margin:6px 0 16px;font-weight:700}
    .lv-root .lv-riep-cliente{font-size:17px;font-weight:700;letter-spacing:-.01em}
    .lv-root .lv-riep-tit{color:var(--lv-muted);font-size:14px;margin-top:3px}
    .lv-root table.lv-riep-mov{width:100%;border-collapse:collapse;margin-top:18px}
    .lv-root table.lv-riep-mov th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--lv-muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--lv-border);font-weight:600}
    .lv-root table.lv-riep-mov td{padding:10px;border-bottom:1px solid #EEF0F3;vertical-align:top}
    .lv-root table.lv-riep-mov .dt{white-space:nowrap;color:var(--lv-muted);font-size:13px;width:96px;font-variant-numeric:tabular-nums}
    .lv-root table.lv-riep-mov .imp{text-align:right;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
    .lv-root table.lv-riep-mov .imp.pos{color:var(--lv-pos)}
    .lv-root table.lv-riep-mov .imp.neg{color:var(--lv-neg)}
    .lv-root .lv-riep-vuoto{margin-top:18px;color:var(--lv-muted);font-size:14px}
    .lv-root .lv-riep-saldo{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:18px;padding-top:12px;border-top:2px solid var(--lv-border);font-size:15px}
    .lv-root .lv-riep-saldo b{font-size:21px;font-weight:700}
    .lv-root .lv-riep-esaurita{margin-top:14px;border:2px solid var(--lv-stamp);color:var(--lv-stamp);font-weight:700;letter-spacing:.08em;text-align:center;padding:6px;border-radius:6px}
    .lv-root .lv-riep-foot{margin-top:20px;font-size:11px;color:var(--lv-muted)}

    /* ---------- stampa ---------- */
    /* Il riepilogo è montato in un portal figlio diretto di <body> proprio per
       poter nascondere tutto il resto: sidebar e topbar sono ANTENATI della
       vista, non fratelli, e da dentro l'albero non sarebbero escludibili. */
    @media print{
      body.lv-printing > *:not(#lv-print-root){display:none!important}
      body.lv-printing #lv-print-root{background:#fff}
      body.lv-printing #lv-print-root .lv-overlay{position:static;background:none;padding:0;display:block}
      body.lv-printing #lv-print-root .lv-modal{max-width:none;width:auto;max-height:none;overflow:visible;padding:0;border-radius:0;box-shadow:none}
      body.lv-printing .no-print{display:none!important}
      @page{margin:16mm}
    }

    @media (max-width:560px){
      .lv-root table.lv-mov .met{display:none}
      .lv-root .lv-met-inline{display:block}
      .lv-root table.lv-mov th,.lv-root table.lv-mov td{padding:10px 8px}
      /* min-width: senza, il browser crede che la colonna possa stringersi a
         un carattere e spezza le parole anche quando ci sarebbe spazio. */
      .lv-root table.lv-mov td.desc{overflow-wrap:anywhere;min-width:116px}
      .lv-root table.lv-mov .dt{font-size:12px}
      .lv-root table.lv-mov .imp{font-size:14px}
      .lv-root table.lv-mov td.act{padding-left:0;padding-right:2px}
      .lv-root .lv-icon-btn{padding:7px 8px}
      .lv-root .lv-detail-head h1{font-size:19px}
      .lv-root .lv-saldo-box .val{font-size:20px}
      .lv-main{padding:16px 12px 80px}
    }
    @media (prefers-reduced-motion:reduce){.lv-root *{transition:none!important}}
  `}</style>
);

export default ListeStyles;
