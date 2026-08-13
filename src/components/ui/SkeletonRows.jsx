// Variante a RIGHE dello scheletro di caricamento, per i pannelli che elencano
// voci in colonna invece che una griglia di card: "Scadenze Prossime" e
// "Carico di Lavoro Team" nella Dashboard.
//
// Sta in un file suo e non dentro SkeletonCards.jsx perché è un secondo
// componente con un layout diverso, non una variante del primo (vedi
// docs/CLAUDE.md, "Un file, una responsabilità").
import { rowCenterGap10 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const colGap12 = { display: "flex", flexDirection: "column", gap: 12 };
const boxW30H30 = { width: 30, height: 30, borderRadius: "50%", flexShrink: 0 };
const boxMb6H11 = { height: 11, width: "60%", borderRadius: 4, marginBottom: 6 };
const boxH9R4 = { height: 9, width: "35%", borderRadius: 4 };
export function SkeletonRows({ count = 4, avatar = true, label = "Caricamento in corso" }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      style={colGap12}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={rowCenterGap10}>
          {avatar && (
            <div className="skeleton" style={boxW30H30} />
          )}
          <div className="vd-flex-1-min0">
            <div className="skeleton" style={boxMb6H11} />
            <div className="skeleton" style={boxH9R4} />
          </div>
        </div>
      ))}
    </div>
  );
}
