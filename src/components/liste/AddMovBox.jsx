// Riquadro "Nuovo movimento" del dettaglio lista. Vive in un file suo perché
// ListaDetail.jsx ne conteneva quattro, di componenti: questo, l'editor di cella
// e i due campi in linea della testata. Ognuno ha stato e salvataggio propri e
// con gli altri condivide solo il `dispatch`.
import { useEffect, useRef, useState } from "react";
import { METODI, parseImporto, todayISO } from "../../lib/listeApi.js";
import { useListeWrite } from "./listePersistence.js";
import { SegnoSeg } from "./modals/SegnoSeg.jsx";

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
  const descRef = useRef(null);
  const esegui = useListeWrite(dispatch);

  useEffect(() => { descRef.current?.focus(); }, []);

  const submit = async () => {
    if (saving) return;
    const importo = parseImporto(imp, segno);
    if (!data || !desc.trim() || importo === null) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Compila data, descrizione e importo" } });
      return;
    }
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
          <input id="mv-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="lv-field">
          <label htmlFor="mv-desc">Descrizione</label>
          <input id="mv-desc" ref={descRef} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Es. BONIFICO DA ROSSI MARIO" />
        </div>
        <div className="lv-field">
          <label>Tipo</label>
          <SegnoSeg segno={segno} onChange={setSegno} />
        </div>
        <div className="lv-field">
          <label htmlFor="mv-imp">Importo €</label>
          <input id="mv-imp" inputMode="decimal" value={imp} onChange={(e) => setImp(e.target.value)} placeholder="0,00" />
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
