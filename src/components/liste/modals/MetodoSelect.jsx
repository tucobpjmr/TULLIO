// Select del metodo di pagamento, condivisa dai modali dei movimenti.
import { METODI } from "../listeApi.js";

export const MetodoSelect = ({ value, onChange, id }) => (
  <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
    {METODI.map((v) => (
      <option key={v || "none"} value={v}>{v ? v.toUpperCase() : "—"}</option>
    ))}
  </select>
);
