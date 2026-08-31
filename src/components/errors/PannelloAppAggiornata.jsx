// src/components/errors/PannelloAppAggiornata.jsx
// A-4 · La via d'uscita per un chunk lazy mancante — il caso PIÙ FREQUENTE in
// produzione: succede a OGNI deploy con una scheda aperta, perché gli hash dei
// file cambiano e quelli vecchi spariscono dal server.
//
// `isChunkMancante` (lib/errorReporting.js) sa già distinguerlo da un bug vero,
// ma finché lo sapeva solo l'handler globale i tre error boundary — che
// catturano CORRETTAMENTE l'errore di render che un chunk 404 produce dentro
// `Suspense` — applicavano il pannello generico del proprio dominio: «Questa
// sezione ha avuto un problema» con «← Torna alla Dashboard», o «Non è stato
// possibile aprire questo pannello» con «Chiudi». Entrambe le frasi sono FALSE
// in questo caso, ed entrambe le vie d'uscita richiudono il ciclo — si torna,
// si riclicca, il chunk manca ancora, stesso pannello — perché nessuna delle
// due ricarica la pagina, l'unica azione che ripara davvero.
//
// Non è un pannello d'ERRORE: non c'è niente di rotto lato applicazione e
// niente da segnalare (nessun codice di segnalazione — non c'è nulla da
// diagnosticare) — è un annuncio, e per questo non porta né ⚠️ né il tono
// dei tre pannelli di dominio. È UNO per tutti e tre i boundary di proposito:
// il rimedio (ricaricare) non dipende da quale dei tre ha catturato l'errore.
//
// Posizionato a tutto schermo con z-index sopra ogni altro livello (Z.modalFull):
// deve coprire correttamente sia quando sostituisce l'intera app (boundary di
// primo livello) sia quando sostituisce solo una vista o un overlay già
// posizionati.
import { Z } from '../../styles/tokens.js';

const wrap = {
  position: 'fixed', inset: 0, zIndex: Z.modalFull,
  display: 'grid', placeItems: 'center',
  background: '#0f172a', color: '#e2e8f0',
  fontFamily: '"DM Sans",system-ui,sans-serif',
  padding: 'calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom))',
};
const box = {
  maxWidth: 460, width: '100%', textAlign: 'center',
  background: '#111c33', border: '1px solid #1e293b', borderRadius: 16,
  padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
const icona = { fontSize: 36, marginBottom: 10 };
const titolo = {
  margin: '0 0 8px', fontFamily: '"Playfair Display",serif',
  fontSize: 22, fontWeight: 700,
};
const testo = { margin: '0 0 20px', fontSize: 13.5, opacity: 0.85, lineHeight: 1.5 };
const bottone = {
  padding: '10px 20px', borderRadius: 10, border: 'none',
  background: '#d4a843', color: '#0f172a', fontWeight: 700,
  cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
};

export function PannelloAppAggiornata() {
  return (
    <div className="fade-in" style={wrap}>
      <div style={box}>
        <div style={icona} aria-hidden="true">🚀</div>
        <h2 className="playfair" style={titolo}>Tullio è stato aggiornato</h2>
        <p style={testo}>
          Questa scheda sta ancora usando la versione precedente. Ricarica per
          continuare: non perderai nulla di ciò che hai già salvato.
        </p>
        <button onClick={() => window.location.reload()} style={bottone}>Ricarica</button>
      </div>
    </div>
  );
}

export default PannelloAppAggiornata;
