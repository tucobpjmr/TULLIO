import { useState } from "react";
import { parseImporto } from "../listeFormato.js";
import { LvOverlay } from "./LvOverlay.jsx";
import { MetodoSelect } from "./MetodoSelect.jsx";
import { SegnoSeg } from "./SegnoSeg.jsx";
import { useSalvataggioLista } from "../useSalvataggioLista.js";

// ─── Modifica di un movimento già registrato ───────────────────────────────
// Form completo in modale: i campi in riga (modifica in linea) su schermo
// stretto non ci stanno tutti, questa è la via utilizzabile anche da telefono.
export function EditMovimentoModal({ movimento, onSave, onClose }) {
  const [data, setData] = useState(movimento.data_movimento);
  const [desc, setDesc] = useState(movimento.descrizione);
  const [segno, setSegno] = useState(Number(movimento.importo) < 0 ? -1 : 1);
  const [imp, setImp] = useState(Math.abs(Number(movimento.importo)).toFixed(2).replace(".", ","));
  const [metodo, setMetodo] = useState(movimento.metodo || null);

  const { salva, inVolo } = useSalvataggioLista(onSave.run);

  const submit = () => {
    const importo = parseImporto(imp, segno);
    if (!data || !desc.trim() || importo === null) {
      return onSave.onError("Compila data, descrizione e importo");
    }
    salva({ id: movimento.id, data, descrizione: desc.trim(), importo, metodo });
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Modifica movimento</h2>
      <div className="row lv-field">
        <label htmlFor="ed-data">Data</label>
        <input id="ed-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-desc">Descrizione</label>
        <input id="ed-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label>Tipo</label>
        <SegnoSeg segno={segno} onChange={setSegno} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-imp">Importo €</label>
        <input id="ed-imp" inputMode="decimal" value={imp} onChange={(e) => setImp(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-met">Metodo</label>
        <MetodoSelect id="ed-met" value={metodo} onChange={setMetodo} />
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={inVolo} onClick={submit}>
          {inVolo ? "Salvo…" : "Salva modifiche"}
        </button>
      </div>
    </LvOverlay>
  );
}
