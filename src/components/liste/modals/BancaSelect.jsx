// Select della banca di appoggio (BNL / BANCO NAPOLI), condivisa dai form dei
// movimenti. Chi la monta la mostra solo se `metodoConBanca(metodo)`.
import { BANCHE, BANCA_LABEL } from "../listeFormato.js";

export const BancaSelect = ({ value, onChange, id }) => (
  <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
    {BANCHE.map((v) => (
      <option key={v || "none"} value={v}>{v ? BANCA_LABEL[v] : "—"}</option>
    ))}
  </select>
);
