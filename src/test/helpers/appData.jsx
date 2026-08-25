// src/test/helpers/appData.jsx
// Helper di render per i componenti che consumano useAppData().
//
// Prima della migrazione i test impostavano il team e l'utente corrente con
// setTeam()/setCurrentUser() — cioè scrivendo variabili globali di modulo, con
// tutti i difetti del caso: l'ordine dei test contava, un `beforeEach`
// dimenticato faceva passare (o fallire) il test per via dello stato lasciato
// da un altro file, e nulla nel corpo del test dichiarava da quale team
// dipendesse l'asserzione.
//
// Qui il contesto è esplicito e locale al singolo render:
//
//   renderWithAppData(<Trash />, {
//     team: TEAM_FIXTURE, currentUserId: "dario", dispatch: vi.fn(),
//   });
//
// `state` accetta direttamente uno state del reducer, così i test che già ne
// costruiscono uno non devono ripetere gli stessi tre campi:
//
//   renderWithAppData(<Dashboard state={s} … />, s);

import { render } from "@testing-library/react";
import { DispatchProvider } from "../../state/DispatchContext.jsx";
import { AppDataProvider } from "../../state/AppDataContext.jsx";
import { TasksProvider } from "../../state/TasksContext.jsx";
import { StoricoTaskProvider } from "../../state/StoricoTaskContext.jsx";
import { ClientiCompletiProvider } from "../../state/ClientiCompletiContext.jsx";
import { ClientsProvider } from "../../state/ClientsContext.jsx";
import { ConfirmProvider } from "../../state/ConfirmContext.jsx";
import { INITIAL_TEAM } from "../../state/mockData.js";
import { INITIAL_CATEGORIES } from "../../state/taskCategories.js";

// Contesto demo: gli stessi valori che appGlobals aveva come default di modulo
// (INITIAL_TEAM / INITIAL_CATEGORIES / "marco"). I test che non hanno un'opinione
// sul team lo usavano già — implicitamente, senza dirlo. Ora lo dichiarano.
export const DEMO_APP_CTX = {
  team: INITIAL_TEAM,
  categories: INITIAL_CATEGORIES,
  currentUserId: "marco",
};

// `tasks` e `clients` viaggiano per contesto come team/categorie/utente (vedi
// state/TasksContext.jsx). Sono qui e non in una seconda funzione perché la
// firma di questo helper accetta già uno state del reducer intero —
// `renderWithAppData(<Dashboard … />, s)` — e in quello `s.tasks` e `s.clients`
// ci sono di loro: chi passa uno state non deve cambiare nulla.
// A-3: `richiediStorico` e `storicoInCorso` esistono perché le viste che
// guardano lo storico dei task (Archivio, Cestino, statistiche, export,
// ricerca avanzata) lo chiedono al mount — vedi state/StoricoTaskContext.jsx.
// Il default è la situazione dei test che non hanno un'opinione in merito: i
// task passati SONO già tutto ciò che c'è, quindi richiesta no-op e nessuna
// attesa. Un test che vuole osservare la finestra di caricamento passa
// `storicoInCorso: true`; uno che vuole verificare che la vista chieda davvero
// il corpus intero passa una spia come `richiediStorico`.
export function withAppData(
  ui,
  {
    dispatch = () => {},
    team = [], categories = {}, currentUserId = null, tasks = [], clients = [],
    richiediStorico = () => {}, storicoInCorso = false,
    richiediClienti = () => {}, clientiInCorso = false,
  } = {},
) {
  return (
    // M-2 (25 agosto): `dispatch` arriva per contesto come team/task/clienti,
    // quindi i test lo passano QUI e non come prop del componente sotto esame.
    // Il default è un no-op: un test che non ha un'opinione sulle scritture non
    // deve dichiararne una, ma uno che le osserva passa la propria spia.
    <DispatchProvider dispatch={dispatch}>
      <AppDataProvider team={team} categories={categories} currentUserId={currentUserId}>
        <TasksProvider tasks={tasks}>
         <StoricoTaskProvider richiedi={richiediStorico} caricando={storicoInCorso}>
          <ClientsProvider clients={clients}>
            {/* M-1 (passo 2): come sopra per lo storico — i clienti passati SONO
                già tutto ciò che c'è per un test, quindi richiesta no-op e
                nessuna attesa. Un test che vuole osservare la finestra passa
                `clientiInCorso: true`; uno che vuole verificare che la vista
                chieda davvero l'anagrafica passa una spia come
                `richiediClienti`. */}
            <ClientiCompletiProvider richiedi={richiediClienti} caricando={clientiInCorso}>
              {/* Criticità #8: useConfirm() solleva fuori dal provider, come
                  useAppData(). Sta qui e non nei singoli test perché la conferma è
                  infrastruttura dell'app — un test che monta una vista non deve
                  sapere che quella vista, in fondo a un handler, chiede conferma. */}
              <ConfirmProvider>{ui}</ConfirmProvider>
            </ClientiCompletiProvider>
          </ClientsProvider>
         </StoricoTaskProvider>
        </TasksProvider>
      </AppDataProvider>
    </DispatchProvider>
  );
}

/**
 * Solo il DispatchProvider, per i test che montano un componente il quale
 * consuma `dispatch` ma nessuno degli altri provider di dominio (ToastStack,
 * ProfileEditor, i modali di admin). Evita di montargli addosso cinque
 * provider che non gli servono per il gusto di avere un helper solo.
 */
export const withDispatch = (ui, dispatch = () => {}) => (
  <DispatchProvider dispatch={dispatch}>{ui}</DispatchProvider>
);

export function renderWithAppData(ui, ctx = {}, options) {
  const utils = render(withAppData(ui, ctx), options);
  // `rerender` di testing-library rimonta l'elemento NUDO: senza questo
  // override il secondo render perderebbe il provider e useAppData()
  // solleverebbe. `nextCtx` permette anche di ri-renderizzare con un contesto
  // diverso (es. "e adesso l'utente è un Driver"), che prima si otteneva
  // mutando una globale tra un render e l'altro.
  return {
    ...utils,
    rerender: (next, nextCtx = ctx) => utils.rerender(withAppData(next, nextCtx)),
  };
}
