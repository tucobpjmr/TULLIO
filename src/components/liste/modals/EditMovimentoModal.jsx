import { useRef, useState } from "react";
import { parseImporto } from "../listeFormato.js";
import { LvOverlay } from "./LvOverlay.jsx";
import { MetodoSelect } from "./MetodoSelect.jsx";
import { SegnoSeg } from "./SegnoSeg.jsx";
import { useSalvataggioLista } from "../useSalvataggioLista.js";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import { validaCampi, primoCampoInvalido } from "../../../lib/validators.js";
import { REGOLE_MOVIMENTO, ORDINE_MOVIMENTO } from "../regoleMovimento.js";

// ─── Modifica di un movimento già registrato ───────────────────────────────
// Form completo in modale: i campi in riga (modifica in linea) su schermo
// stretto non ci stanno tutti, questa è la via utilizzabile anche da telefono.
//
// M-1 dell'audit UX/errori del 31 agosto. Era ancora sulla frase che
// `validators.js` cita testualmente come l'anti-pattern da cui è nato
// («Compila data, descrizione e importo» via toast): non diceva QUALE campo
// mancasse, scompariva da solo, e per uno screen reader non c'era alcun
// legame fra il messaggio e l'input. `AddMovBox` — stessi campi, stesso
// denaro — era già migrato; correggere un movimento è l'operazione più
// delicata delle due, non la meno curata.
export function EditMovimentoModal({ movimento, onSave, onClose }) {
  const [data, setData] = useState(movimento.data_movimento);
  const [desc, setDesc] = useState(movimento.descrizione);
  const [segno, setSegno] = useState(Number(movimento.importo) < 0 ? -1 : 1);
  const [imp, setImp] = useState(Math.abs(Number(movimento.importo)).toFixed(2).replace(".", ","));
  const [metodo, setMetodo] = useState(movimento.metodo || null);
  const [errori, setErrori] = useState({});
  const dataRef = useRef(null);
  const descRef = useRef(null);
  const impRef = useRef(null);
  const rifCampo = { data: dataRef, desc: descRef, imp: impRef };

  const { salva, inVolo } = useSalvataggioLista(onSave.run);

  // L'errore di un campo si spegne appena lo si tocca: tenerlo acceso mentre
  // l'utente sta correggendo proprio quel campo è rumore, e la ri-validazione
  // arriva comunque al prossimo invio (stessa regola di AddMovBox).
  const aggiorna = (campo, set) => (valore) => {
    set(valore);
    setErrori((prec) => (prec[campo] ? { ...prec, [campo]: undefined } : prec));
  };

  const submit = () => {
    const valori = { data, desc, imp, segno };
    const trovati = validaCampi(valori, REGOLE_MOVIMENTO);
    const primo = primoCampoInvalido(trovati, ORDINE_MOVIMENTO);
    if (primo) {
      setErrori(trovati);
      rifCampo[primo]?.current?.focus();
      return;
    }
    setErrori({});
    salva({ id: movimento.id, data, descrizione: desc.trim(), importo: parseImporto(imp, segno), metodo });
  };

  return (
    <LvOverlay onClose={onClose}>
      {/* M-4 · `<form>` e non `<div>`: Invio deve inviare, come in AddMovBox.
          `noValidate` perché la validazione è la nostra (per campo). */}
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <h2>Modifica movimento</h2>
        <div className="row lv-field">
          <label htmlFor="ed-data">Data</label>
          <input
            id="ed-data" type="date" ref={dataRef} value={data}
            onChange={(e) => aggiorna("data", setData)(e.target.value)}
            {...ariaCampo("ed-data-err", errori.data)}
          />
          <FieldError id="ed-data-err">{errori.data}</FieldError>
        </div>
        <div className="row lv-field">
          <label htmlFor="ed-desc">Descrizione</label>
          <input
            id="ed-desc" ref={descRef} value={desc}
            onChange={(e) => aggiorna("desc", setDesc)(e.target.value)}
            {...ariaCampo("ed-desc-err", errori.desc)}
          />
          <FieldError id="ed-desc-err">{errori.desc}</FieldError>
        </div>
        <div className="row lv-field">
          <label>Tipo</label>
          <SegnoSeg segno={segno} onChange={setSegno} />
        </div>
        <div className="row lv-field">
          <label htmlFor="ed-imp">Importo €</label>
          <input
            id="ed-imp" inputMode="decimal" ref={impRef} value={imp}
            onChange={(e) => aggiorna("imp", setImp)(e.target.value)}
            {...ariaCampo("ed-imp-err", errori.imp)}
          />
          <FieldError id="ed-imp-err">{errori.imp}</FieldError>
        </div>
        <div className="row lv-field">
          <label htmlFor="ed-met">Metodo</label>
          <MetodoSelect id="ed-met" value={metodo} onChange={setMetodo} />
        </div>
        <div className="actions">
          <button type="button" className="lv-btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="lv-btn primary" disabled={inVolo}>
            {inVolo ? "Salvo…" : "Salva modifiche"}
          </button>
        </div>
      </form>
    </LvOverlay>
  );
}
