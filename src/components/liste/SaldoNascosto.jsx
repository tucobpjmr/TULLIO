// src/components/liste/SaldoNascosto.jsx
// Saldo di una lista che parte NASCOSTO e si svela con l'icona a occhio.
// Le schermate delle liste si aprono spesso davanti al cliente al banco: gli
// importi non devono essere leggibili a colpo d'occhio. Usato nella home del
// modulo (ListaRow), nel dettaglio di una lista e nel pannello liste della
// scheda cliente. Lo stato è locale a ogni istanza e non persiste:
// ricaricando torna nascosto. Gli importi dei movimenti del dettaglio usano
// MASCHERA e BottoneOcchio con un unico stato per tutta la tabella.
import { useState } from "react";
import { BottoneOcchio, MASCHERA } from "./BottoneOcchio.jsx";
import { eur, saldoClass } from "./listeFormato.js";

// `etichetta` completa l'aria-label dell'occhio ("Mostra saldo", "Mostra
// totale"): due occhi nello stesso pannello devono restare distinguibili.
// `classe` aggiunge classi all'importo (es. `val` nel box SALDO del dettaglio).
export function SaldoNascosto({ valore, etichetta = "saldo", grassetto = false, classe = "" }) {
  const [visibile, setVisibile] = useState(false);
  const Tag = grassetto ? "b" : "span";
  return (
    <span className="lv-saldo-wrap">
      <Tag className={`${classe} lv-saldo lv-num ${visibile ? saldoClass(Number(valore)) : "zero"}`}>
        {visibile ? eur(valore) : MASCHERA}
      </Tag>
      <BottoneOcchio visibile={visibile} onToggle={() => setVisibile((v) => !v)} etichetta={etichetta} />
    </span>
  );
}

// Props per rendere "cliccabile come un bottone" un <div> di riga: la riga
// contiene il bottone dell'occhio e un <button> dentro un <button> non è HTML
// valido. Invio e Spazio aprono come farebbe un bottone.
export function propsRigaApribile(onOpen) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}
