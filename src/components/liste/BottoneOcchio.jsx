// src/components/liste/BottoneOcchio.jsx
// Il bottone a occhio che mostra/nasconde gli importi delle liste viaggio, e
// la maschera mostrata al posto dell'importo. Separato da SaldoNascosto
// (react/no-multi-comp): lo usano anche il dettaglio lista, dove un unico
// occhio nell'intestazione svela tutti gli importi dei movimenti.
import { Icona } from "../ui/Icona.jsx";

export const MASCHERA = "•••••• €";

// `etichetta` completa l'aria-label: "Mostra saldo", "Nascondi importi"…
export function BottoneOcchio({ visibile, onToggle, etichetta }) {
  const azione = `${visibile ? "Nascondi" : "Mostra"} ${etichetta}`;
  return (
    <button
      type="button"
      className="lv-occhio"
      // L'occhio sta spesso dentro una riga cliccabile: né il click né i
      // tasti devono risalire fino a lei, altrimenti svelare il saldo
      // aprirebbe la lista.
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-pressed={visibile}
      aria-label={azione}
      title={azione}
    >
      <Icona nome={visibile ? "occhioBarrato" : "occhio"} dimensione={18} />
    </button>
  );
}
