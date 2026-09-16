// src/components/documenti/DocumentoCard.jsx
// La scheda di un documento nell'elenco dell'archivio.
//
// NON mostra un'anteprima dell'immagine, ed è una scelta di sicurezza prima
// che di prestazioni: una griglia di anteprime significherebbe centinaia di
// documenti di identità leggibili a colpo d'occhio da chiunque passi accanto
// allo schermo, e centinaia di signed URL generate per una vista in cui
// l'operatore sta solo cercando un nome. L'immagine si apre su richiesta, una
// alla volta, dalla modale di dettaglio.
import { memo } from "react";
import { etichettaTipo } from "./documentiModello.js";
import { statoScadenza, testoScadenza, ETICHETTE_STATO } from "./scadenze.js";
import { formatFileSize } from "../../lib/fileUtils.js";
import { scheda, schedaTestata, nomePasseggero, rigaMeta, pastigliaStato } from "./documentiStyles.js";

export const DocumentoCard = memo(function DocumentoCard({ documento, oggi, onApri }) {
  const stato = statoScadenza(documento, oggi);
  const { testo, colore } = ETICHETTE_STATO[stato];
  // Il colore è l'unica proprietà dinamica: senza di essa questo oggetto
  // sarebbe costante e la regola sugli style letterali lo rifiuterebbe. Con
  // essa è legittimo, ed è il motivo per cui non vive in documentiStyles.js.
  const stilePastiglia = { ...pastigliaStato, color: colore };

  return (
    <button type="button" style={scheda} onClick={() => onApri(documento)}>
      <div style={schedaTestata}>
        <span style={nomePasseggero} title={documento.passeggero}>{documento.passeggero}</span>
        <span style={stilePastiglia}>{testo}</span>
      </div>
      <div style={rigaMeta}>
        <span>{etichettaTipo(documento.tipo)}</span>
        {documento.numero && <span>N. {documento.numero}</span>}
      </div>
      <div style={rigaMeta}>
        <span>{testoScadenza(documento, oggi)}</span>
        {documento.fileSize ? <span>{formatFileSize(documento.fileSize)}</span> : null}
      </div>
    </button>
  );
});
