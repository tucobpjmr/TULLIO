// src/state/AppProviders.jsx
// I cinque provider di dominio, in un componente solo.
//
// PERCHÉ ESISTE (M-3, audit di architettura del 15 agosto). L'annidamento
// viveva nel `return` di `VoyageDeskInner`, dove cinque tag di apertura e
// cinque di chiusura racchiudevano centoquaranta righe di JSX: per capire
// quali provider fossero montati bisognava leggere l'inizio e la fine della
// vista, e l'indentazione a scaletta rendeva ogni aggiunta un diff che tocca
// tutto il file. Il guscio torna a fare una cosa sola — comporre.
//
// ⚠️ L'ORDINE NON È ARBITRARIO e non va cambiato per estetica:
//
//   • `AppDataProvider` sta più in alto perché team/categorie/utente sono ciò
//     da cui dipendono le decisioni di autorizzazione, e le usano tutti;
//   • `TasksProvider` e `ClientsProvider` sono DUE provider e non uno, così
//     l'arrivo di un cliente importato non invalida le viste che guardano i
//     task (vedi state/ClientsContext.jsx);
//   • `StoricoTaskProvider` sta sotto `TasksProvider` perché descrive una
//     proprietà di ciò che quel provider contiene: se la finestra
//     dell'idratazione sia già stata completata (A-3);
//   • `ConfirmProvider` sta DENTRO i provider di dominio e non fuori: la
//     finestra di conferma è parte dell'app, non della shell del browser, e i
//     suoi call site sono componenti che leggono anche i dati.
//
// Nessun `value` è costruito qui: ogni provider memoizza il proprio (regola
// `VIETATO_CONTEXT_VALUE_LETTERALE` in eslint.config.js). Questo file è
// annidamento e basta — se un giorno dovesse calcolare qualcosa, la domanda
// giusta è a quale provider appartenga quel calcolo.
import { AppDataProvider } from "./AppDataContext.jsx";
import { TasksProvider } from "./TasksContext.jsx";
import { StoricoTaskProvider } from "./StoricoTaskContext.jsx";
import { ClientsProvider } from "./ClientsContext.jsx";
import { ConfirmProvider } from "./ConfirmContext.jsx";

export function AppProviders({
  team, categories, currentUserId, tasks, clients,
  richiediStorico, storicoInCorso, children,
}) {
  return (
    <AppDataProvider team={team} categories={categories} currentUserId={currentUserId}>
      <TasksProvider tasks={tasks}>
        <StoricoTaskProvider richiedi={richiediStorico} caricando={storicoInCorso}>
          <ClientsProvider clients={clients}>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ClientsProvider>
        </StoricoTaskProvider>
      </TasksProvider>
    </AppDataProvider>
  );
}
