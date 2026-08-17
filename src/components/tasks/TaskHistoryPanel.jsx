// ─── CRONOLOGIA DI UN TASK ───────────────────────────────────────────────────
// Il pannello CRONOLOGIA dello slide-over. Era un blocco dentro
// TaskSlideOver.jsx che leggeva `task.history`, cioè un campo dello stato
// globale riempito dall'idratazione; ora la cronologia se la carica lui, per il
// solo task che si sta guardando.
//
// PERCHÉ (A-3, passo 3 — audit performance/UX del 16 agosto, secondo
// passaggio). `task_history` è l'unica tabella dell'app che CRESCE E NON SI
// POTA MAI: una riga per ogni cambio di stato, priorità, scadenza,
// assegnatario o cestinamento. 660 righe il 17 agosto 2026, ~14,8 al giorno,
// proiezione a dodici mesi ~5.500. Fino a ieri veniva letta INTERA in due
// punti — annidata dentro `TASK_SELECT_WITH_COMMENTS` a ogni idratazione, e
// piatta a ogni evento realtime su `task_history` — per alimentare un campo
// che ha un lettore solo: questo pannello, che ne guarda UN task per volta e
// solo mentre è aperto.
//
// Il costo non era la dimensione in sé ma la sua forma: `fetchAllRows` pagina
// in modo SERIALE, quindi a 5.500 righe erano sei round-trip in fila su un
// percorso che scattava a ogni modifica fatta da chiunque in agenzia, quasi
// sempre con questo pannello chiuso.
//
// STESSO SCHEMA DI `TaskAttachments`, che è il vicino di casa in questo file e
// nello slide-over: stato locale, fetch al mount, `useIsMounted` perché lo
// slide-over si chiude con un tap sull'overlay e la risposta arriva quando
// arriva. La differenza è che qui c'è anche il realtime — vedi sotto.
import { useCallback, useState } from "react";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import { useDebouncedTableSubscription } from "../../hooks/useDebouncedTableSubscription.js";
import { TaskThreads } from "../../lib/api.js";
import { fromDbHistory } from "../../lib/mappers.js";
import { HISTORY_ICONS, historyDescribe } from "./taskHistory.js";
import { formatDate } from "../../lib/taskUtils.js";
import { flex1, txtF11Muted, txtF12Muted2 } from "../../styles/common.js";
import {
  colGap8, rowGap82, rowStartGap10, txtF11Bold2, txtF12Bold, txtF12Light, txtF14TxtCenter,
} from "./taskSlideOverStyles.js";

export function TaskHistoryPanel({ taskId }) {
  const { getMember } = useAppData();
  const [righe, setRighe] = useState([]);
  // Criticità #6, applicata a un pannello invece che a un'entità: «nessuna
  // cronologia» e «cronologia non ancora caricata» sono due frasi diverse, e
  // qui la prima è quella che si legge male — la cronologia è il posto in cui
  // si va a vedere CHI ha cambiato cosa, tipicamente quando qualcosa non
  // torna. Si chiude sul successo e sull'errore, come i flag di
  // useAppHydration: uno scheletro perpetuo è disonesto quanto un vuoto.
  const [caricando, setCaricando] = useState(true);
  const montato = useIsMounted();

  const carica = useCallback(async (isCurrent) => {
    const { data, error } = await TaskThreads.historyForTask(taskId);
    if (!montato() || (isCurrent && !isCurrent())) return;
    // L'errore NON diventa un toast. È l'unico punto di questo intervento in
    // cui il canale d'errore si restringe di proposito: la cronologia è un
    // pannello secondario dentro un pannello, e un toast rosso a schermo
    // intero per «non sono riuscito a leggere chi ha cambiato la priorità»
    // sarebbe sproporzionato rispetto a ciò che l'utente stava facendo
    // (aprire un task). Lo dice qui sotto, dove lo si stava guardando.
    if (error) console.error("[VoyageDesk] TaskThreads.historyForTask", error);
    setRighe(error ? null : (data || []).map(fromDbHistory));
    setCaricando(false);
  }, [taskId, montato]);

  // Realtime, ma SOLO su questo task e SOLO mentre il pannello è montato.
  //
  // `filterEvent` scarta gli eventi degli altri task prima che alimentino il
  // debounce: senza, avremmo semplicemente spostato il difetto: una rilettura
  // per ogni modifica fatta da chiunque, che è precisamente ciò che A-3
  // toglie. Il pre-image `payload.old` serve alle DELETE (purge di un task),
  // dove `payload.new` è vuoto.
  //
  // `deps: [taskId]` fa ri-sottoscrivere quando si passa da un task all'altro
  // senza smontare il pannello, e la nuova idratazione iniziale della
  // sottoscrizione (`tabelle = null`) è anche il fetch al mount: non serve una
  // useEffect separata accanto a questa.
  useDebouncedTableSubscription(["task_history"], carica, {
    deps: [taskId],
    filterEvent: (payload) =>
      payload?.new?.task_id === taskId || payload?.old?.task_id === taskId,
  });

  return (
    <div>
      <div style={txtF11Bold2}>
        CRONOLOGIA {caricando ? "" : `(${righe?.length ?? 0})`}
      </div>
      <div style={colGap8}>
        {(righe || [])
          .slice()
          .sort((a, b) => new Date(a.time) - new Date(b.time))
          .map(h => (
            <div key={h.id} style={rowStartGap10}>
              <div style={txtF14TxtCenter}>
                {HISTORY_ICONS[h.action] || "•"}
              </div>
              <div style={flex1}>
                <div style={rowGap82}>
                  <span style={txtF12Bold}>{h.actor || "Sistema"}</span>
                  <span style={txtF11Muted}>{formatDate(h.time)}</span>
                </div>
                <div style={txtF12Muted2}>{historyDescribe(h, getMember)}</div>
              </div>
            </div>
          ))}
        {caricando && (
          <div style={txtF12Light}>Caricamento della cronologia…</div>
        )}
        {/* Tre stati e non due: `null` è «la lettura è fallita», e dirlo
            «Nessuna cronologia disponibile» sarebbe la stessa bugia degli
            elenchi che si dichiarano vuoti prima di aver caricato. */}
        {!caricando && righe === null && (
          <div style={txtF12Light}>Cronologia non disponibile.</div>
        )}
        {!caricando && righe?.length === 0 && (
          <div style={txtF12Light}>Nessuna cronologia disponibile.</div>
        )}
      </div>
    </div>
  );
}
