// src/components/tasks/TaskCommenti.jsx
// "Attività & commenti" del pannello task: lo storico e la casella per
// aggiungerne uno.
//
// PERCHÉ È USCITO DA TaskSlideOver.jsx (M-5, audit del 25 agosto). Stessa
// ragione degli assegnatari, con una in più: il testo digitato è l'unico dato
// del pannello che non esista già altrove — i campi persistono al blur sul
// task, il commento vive solo qui finché non è scritto — quindi la regola che
// lo protegge (M-4: la casella si svuota DOPO la conferma, non prima) e lo
// stato che protegge devono stare nello stesso file. Finché erano separati dal
// resto del pannello per sola distanza verticale, ogni carattere digitato
// ri-renderizzava anche i campi, gli allegati e la cronologia.
import { useState } from "react";
import { formatDate } from "../../lib/taskUtils.js";
import { newId } from "../../lib/mappers.js";
import { MentionText } from "../ui/MentionText.jsx";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { useSalvataggio } from "../../hooks/useSalvataggio.js";
import { useDispatch } from "../../state/DispatchContext.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF13White2, boxFlex1F12, rowCenterMiddle, rowCenterMiddle2, rowFlex1Gap6,
  rowGap10, rowGap8, rowGap8Mt6, txtF11Bold2, txtF12Bold, txtF13Text,
} from "./taskSlideOverStyles.js";

/**
 * @param {object} props
 * @param {string} props.taskId
 * @param {Array}  props.commenti  `task.comments` — { id, user, text, time }.
 */
export function TaskCommenti({ taskId, commenti = [] }) {
  const dispatch = useDispatch();
  const { currentUserId, getMember } = useAppData();
  const [bozza, setBozza] = useState("");

  // M-4 · La casella si svuota DOPO la conferma, non prima (vedi
  // hooks/useSalvataggio.js).
  const { salva: invia, inVolo, errore } = useSalvataggio(
    (testo) => dispatch({
      type: "ADD_COMMENT",
      payload: {
        taskId,
        comment: {
          // ⚠️ B-4 (audit del 26 agosto) · L'id serve QUI, non solo a chi
          // arriva dal database. `Comments.create` costruisce la riga da
          // `{ task_id, user_id, text }` e ignora tutto il resto, quindi
          // questo valore non raggiunge mai il server: è l'identità della
          // riga OTTIMISTICA, cioè di quella che React deve saper distinguere
          // mentre la scrittura è in volo. Senza, `key={c.id}` sarebbe
          // `undefined` — e due commenti inviati prima che il realtime
          // riporti il thread avrebbero la STESSA chiave.
          id: newId(),
          user: getMember(currentUserId)?.name || "Utente",
          text: testo,
          time: new Date().toISOString(),
        },
      },
    }),
    {
      alSuccesso: () => setBozza(""),
      messaggioErrore: "Commento non inviato. Il testo è ancora qui, riprova.",
    },
  );

  const inviaCommento = () => {
    const testo = bozza.trim();
    if (!testo) return;
    invia(testo);
  };

  const mieIniziali = (getMember(currentUserId)?.name || "")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div>
      <div style={txtF11Bold2}>
        ATTIVITÀ & COMMENTI ({commenti.length})
      </div>
      <div style={stiliComuni.colGap10}>
        {/* B-4 · `key={c.id}` e non l'indice: i commenti arrivano da due
            strade che possono cambiarne l'ordine sotto React — il dispatch
            ottimistico `ADD_COMMENT` e il merge realtime `MERGE_TASK_COMMENTS`
            — e con la chiave posizionale l'inserimento di un commento non in
            coda ri-renderizza ogni riga sotto invece di spostarle. */}
        {commenti.map((c) => (
          <div key={c.id} style={rowGap10}>
            <div style={rowCenterMiddle}>
              {c.user.split(" ").map(w => w[0]).join("").slice(0, 2)}
            </div>
            <div style={stiliComuni.flex1}>
              <div style={rowGap8}>
                <span style={txtF12Bold}>{c.user}</span>
                <span style={stiliComuni.txtF11Muted}>{formatDate(c.time)}</span>
              </div>
              <div style={txtF13Text}><MentionText text={c.text} /></div>
            </div>
          </div>
        ))}

        <div style={rowGap8Mt6}>
          <div style={rowCenterMiddle2}>{mieIniziali}</div>
          <div style={stiliComuni.flex1}>
            <div style={rowFlex1Gap6}>
              <input
                id="vd-commento"
                value={bozza}
                onChange={e => setBozza(e.target.value)}
                onKeyDown={e => e.key === "Enter" && inviaCommento()}
                placeholder="Aggiungi un commento..."
                style={boxFlex1F12}
                {...ariaCampo("vd-commento-err", errore)} />
              {/* Spento solo per la durata della scrittura: è la stessa
                  distinzione di ProfileEditor fra «operazione già partita» e
                  «campo mancante», che invece va detto. */}
              <button onClick={inviaCommento} disabled={inVolo} style={boxF13White2}>
                {inVolo ? "…" : "↑"}
              </button>
            </div>
            <FieldError id="vd-commento-err">{errore}</FieldError>
          </div>
        </div>
      </div>
    </div>
  );
}
