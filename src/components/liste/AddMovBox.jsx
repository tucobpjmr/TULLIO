// Riquadro "Nuovo movimento" del dettaglio lista. Vive in un file suo perché
// ListaDetail.jsx ne conteneva quattro, di componenti: questo, l'editor di cella
// e i due campi in linea della testata. Ognuno ha stato e salvataggio propri e
// con gli altri condivide solo il `dispatch`.
import { useEffect, useRef, useState } from "react";
import { METODI, parseImporto, todayISO } from "../../lib/listeApi.js";
import { useListeWrite } from "./listePersistence.js";
import { SegnoSeg } from "./modals/SegnoSeg.jsx";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { validaCampi, obbligatorio, interpretabile, primoCampoInvalido } from "../../lib/validators.js";

// Criticità #10 — le regole del riquadro, dichiarate una volta e fuori dal
// componente perché sono costanti. `importo` si interpreta col SEGNO scelto
// nel form, ed è il motivo per cui un validatore riceve anche gli altri
// valori: "1.000,00" è valido o no a seconda del segno solo per il parser.
const REGOLE = {
  data: obbligatorio("Indica la data del movimento."),
  desc: obbligatorio("La descrizione non può essere vuota."),
  imp: interpretabile((v, f) => parseImporto(v, f.segno), "Importo non valido: usa una cifra come 1.250,00."),
};
// Ordine VISIVO dei campi: è quello che decide dove va il focus (vedi
// primoCampoInvalido), e nel riquadro il tipo sta fra descrizione e importo.
const ORDINE = ["data", "desc", "imp"];

// Riquadro "Nuovo movimento": sta in cima al foglio e si apre col tasto ＋
// della barra. In fondo alla pagina, su liste lunghe, richiedeva di scorrere
// tutti i movimenti prima di poterne registrare uno nuovo.
export function AddMovBox({ listaId, dispatch, onSaved, onClose, onBulk }) {
  const [data, setData] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [segno, setSegno] = useState(1);
  const [imp, setImp] = useState("");
  const [metodo, setMetodo] = useState("");
  const [saving, setSaving] = useState(false);
  // Criticità #10: un messaggio PER CAMPO, non un toast che li nomina tutti e
  // tre e sparisce da solo lasciando il form identico a com'era.
  const [errori, setErrori] = useState({});
  const descRef = useRef(null);
  const dataRef = useRef(null);
  const impRef = useRef(null);
  const rifCampo = { data: dataRef, desc: descRef, imp: impRef };
  const esegui = useListeWrite(dispatch);

  useEffect(() => { descRef.current?.focus(); }, []);

  // L'errore di un campo si spegne appena lo si tocca: tenerlo acceso mentre
  // l'utente sta correggendo proprio quel campo è rumore, e la ri-validazione
  // arriva comunque al prossimo invio.
  const aggiorna = (campo, set) => (valore) => {
    set(valore);
    setErrori((prec) => (prec[campo] ? { ...prec, [campo]: undefined } : prec));
  };

  const submit = async () => {
    if (saving) return;
    const valori = { data, desc, imp, segno };
    const trovati = validaCampi(valori, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      // Il focus sul primo campo sbagliato è metà del rimedio: senza, chi usa
      // la tastiera resta sul bottone e deve ritrovare il campo da sé.
      rifCampo[primo]?.current?.focus();
      return;
    }
    setErrori({});
    const importo = parseImporto(imp, segno);
    setSaving(true);
    const { ok } = await esegui("registraMovimento", {
      listaId, data, descrizione: desc.trim(), importo, metodo: metodo || null,
    });
    setSaving(false);
    if (!ok) return;
    // Il riquadro resta aperto e pronto per il movimento successivo: azzeriamo
    // solo descrizione e importo, data e metodo si ripetono quasi sempre.
    setDesc("");
    setImp("");
    setErrori({});
    await onSaved();
    descRef.current?.focus();
  };

  return (
    <div className="lv-add-box">
      <div className="lv-add-head">
        <h3>Nuovo movimento</h3>
        <button className="lv-icon-btn" title="Chiudi" aria-label="Chiudi il riquadro" onClick={onClose}>✕</button>
      </div>
      <div className="lv-form-grid">
        <div className="lv-field">
          <label htmlFor="mv-data">Data</label>
          <input
            id="mv-data" type="date" ref={dataRef} value={data}
            onChange={(e) => aggiorna("data", setData)(e.target.value)}
            {...ariaCampo("mv-data-err", errori.data)}
          />
          <FieldError id="mv-data-err">{errori.data}</FieldError>
        </div>
        <div className="lv-field">
          <label htmlFor="mv-desc">Descrizione</label>
          <input
            id="mv-desc" ref={descRef} value={desc}
            onChange={(e) => aggiorna("desc", setDesc)(e.target.value)}
            placeholder="Es. BONIFICO DA ROSSI MARIO"
            {...ariaCampo("mv-desc-err", errori.desc)}
          />
          <FieldError id="mv-desc-err">{errori.desc}</FieldError>
        </div>
        <div className="lv-field">
          <label>Tipo</label>
          <SegnoSeg segno={segno} onChange={setSegno} />
        </div>
        <div className="lv-field">
          <label htmlFor="mv-imp">Importo €</label>
          <input
            id="mv-imp" inputMode="decimal" ref={impRef} value={imp}
            onChange={(e) => aggiorna("imp", setImp)(e.target.value)}
            placeholder="0,00"
            {...ariaCampo("mv-imp-err", errori.imp)}
          />
          <FieldError id="mv-imp-err">{errori.imp}</FieldError>
        </div>
        <div className="lv-field">
          <label htmlFor="mv-met">Metodo</label>
          <select id="mv-met" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODI.map((v) => <option key={v || "none"} value={v}>{v ? v.toUpperCase() : "—"}</option>)}
          </select>
        </div>
        <div className="lv-field" style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="lv-btn primary" style={{ width: "100%" }} disabled={saving} onClick={submit}>
            {saving ? "Registro…" : "Registra"}
          </button>
        </div>
      </div>
      <button className="lv-btn sm" style={{ marginTop: 12 }} onClick={onBulk}>
        + Inserisci più movimenti insieme
      </button>
    </div>
  );
}
