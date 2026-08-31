// Riquadro "Nuovo movimento" del dettaglio lista. Vive in un file suo perché
// ListaDetail.jsx ne conteneva quattro, di componenti: questo, l'editor di cella
// e i due campi in linea della testata. Ognuno ha stato e salvataggio propri e
// con gli altri condivide solo il `dispatch`.
import { useEffect, useRef, useState } from "react";
import { METODI, parseImporto, todayISO } from "./listeFormato.js";
import { useListeWrite } from "./listePersistence.js";
import { useSalvataggioLista } from "./useSalvataggioLista.js";
import { SegnoSeg } from "./modals/SegnoSeg.jsx";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { validaCampi, primoCampoInvalido } from "../../lib/validators.js";
// M-1 · le regole sono condivise con EditMovimentoModal (stesso denaro, stessi
// campi, sia in registrazione sia in correzione — vedi regoleMovimento.js).
import { REGOLE_MOVIMENTO, ORDINE_MOVIMENTO } from "./regoleMovimento.js";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowEnd = { display: "flex", alignItems: "flex-end" };
const wFull = { width: "100%" };

// Riquadro "Nuovo movimento": sta in cima al foglio e si apre col tasto ＋
// della barra. In fondo alla pagina, su liste lunghe, richiedeva di scorrere
// tutti i movimenti prima di poterne registrare uno nuovo.
export function AddMovBox({ listaId, onSaved, onClose, onBulk }) {
  const [data, setData] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [segno, setSegno] = useState(1);
  const [imp, setImp] = useState("");
  const [metodo, setMetodo] = useState("");
  // Criticità #10: un messaggio PER CAMPO, non un toast che li nomina tutti e
  // tre e sparisce da solo lasciando il form identico a com'era.
  const [errori, setErrori] = useState({});
  const descRef = useRef(null);
  const dataRef = useRef(null);
  const impRef = useRef(null);
  const rifCampo = { data: dataRef, desc: descRef, imp: impRef };
  const esegui = useListeWrite();

  useEffect(() => { descRef.current?.focus(); }, []);

  // L'errore di un campo si spegne appena lo si tocca: tenerlo acceso mentre
  // l'utente sta correggendo proprio quel campo è rumore, e la ri-validazione
  // arriva comunque al prossimo invio.
  const aggiorna = (campo, set) => (valore) => {
    set(valore);
    setErrori((prec) => (prec[campo] ? { ...prec, [campo]: undefined } : prec));
  };

  // A-2 · L'unico file del modulo che il controllo «form che scrivono senza
  // attendere l'esito» vedeva — e nemmeno lui, finché `scriveDavvero` non ha
  // imparato il secondo verbo di scrittura dell'app (A-1). Validazione e invio
  // restano due cose distinte: i messaggi PER CAMPO sono qui sopra, il freno
  // al doppio invio e il guard di smontaggio vengono dal contratto.
  const { salva, inVolo } = useSalvataggioLista(
    async (payload) => (await esegui("registraMovimento", payload)).ok,
    {
      // Il riquadro resta aperto e pronto per il movimento successivo:
      // azzeriamo solo descrizione e importo, data e metodo si ripetono quasi
      // sempre.
      alSuccesso: () => {
        setDesc("");
        setImp("");
        setErrori({});
        onSaved();
        descRef.current?.focus();
      },
    },
  );

  const submit = () => {
    const valori = { data, desc, imp, segno };
    const trovati = validaCampi(valori, REGOLE_MOVIMENTO);
    const primo = primoCampoInvalido(trovati, ORDINE_MOVIMENTO);
    if (primo) {
      setErrori(trovati);
      // Il focus sul primo campo sbagliato è metà del rimedio: senza, chi usa
      // la tastiera resta sul bottone e deve ritrovare il campo da sé.
      rifCampo[primo]?.current?.focus();
      return;
    }
    setErrori({});
    salva({
      listaId, data, descrizione: desc.trim(), importo: parseImporto(imp, segno),
      metodo: metodo || null,
    });
  };

  return (
    // M-4 · `<form>` e non `<div>`: è ciò che dà a Invio il significato che
    // l'utente si aspetta in un modulo — questo è il form a frequenza più
    // alta del gestionale, pensato apposta per la ripetizione (vedi
    // `alSuccesso` sopra). `noValidate` perché la validazione è la nostra (per
    // campo, con REGOLE): quella nativa del browser mostrerebbe un secondo
    // popup non tradotto sopra i nostri FieldError.
    <form className="lv-add-box" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="lv-add-head">
        <h3>Nuovo movimento</h3>
        <button type="button" className="lv-icon-btn" title="Chiudi" aria-label="Chiudi il riquadro" onClick={onClose}>✕</button>
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
        <div className="lv-field" style={rowEnd}>
          <button type="submit" className="lv-btn primary" style={wFull} disabled={inVolo}>
            {inVolo ? "Registro…" : "Registra"}
          </button>
        </div>
      </div>
      {/* M-4 · `type="button"`: senza, ogni bottone dentro un `<form>` senza
          `type` esplicito È un submit — questo aprirebbe il pannello bulk
          registrando anche il movimento corrente. */}
      <button type="button" className="lv-btn sm" style={stiliComuni.mt12} onClick={onBulk}>
        + Inserisci più movimenti insieme
      </button>
    </form>
  );
}
