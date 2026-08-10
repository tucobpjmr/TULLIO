// src/state/ConfirmContext.jsx
// ─── CRITICITÀ #8 · via i modali bloccanti del browser ─────────────────────
// `window.confirm` era usato in 17 punti e `alert` in 4, in 14 file, mentre
// l'app aveva già un modale di conferma (ConfirmModal, nel modulo Liste) e un
// sistema di toast per gli errori. Due modi di chiedere la stessa cosa, e il
// peggiore vinceva per numero.
//
// Cosa costa davvero un `confirm()`:
//   • BLOCCA il thread. Non è un modo di dire: durante l'attesa React non
//     renderizza, i timer non scattano, gli eventi realtime si accodano. In
//     un'app dove un'altra persona può modificare la stessa lista nello
//     stesso momento, "l'interfaccia è ferma finché non rispondi" non è
//     neutro.
//   • Non è l'app. Il font è quello del sistema, i pulsanti sono in inglese o
//     nella lingua del browser, il testo non può essere formattato — e su
//     Safari/iOS compare in cima allo schermo, staccato dall'elemento su cui
//     si è appena premuto. In un gestionale in italiano, un "OK / Cancel" di
//     sistema è la parte che sembra rotta.
//   • Non distingue le azioni distruttive. Svuotare il cestino ed eliminare
//     un allegato hanno lo stesso identico aspetto di "vuoi continuare?".
//   • È sopprimibile. I browser offrono "impedisci a questa pagina di creare
//     altre finestre di dialogo": da quel momento `confirm()` ritorna `false`
//     SENZA CHIEDERE NULLA, e l'utente si trova con azioni che semplicemente
//     non funzionano più, senza spiegazione.
//
// ─── PERCHÉ UN CONTEXT E NON UN COMPONENTE PER SITO ────────────────────────
// La forma imperativa è ciò che rende la sostituzione possibile su 17 punti:
//
//     if (!(await conferma({ title: "…" }))) return;      // era window.confirm
//
// Un `<ConfirmModal>` montato a mano in ogni chiamante avrebbe richiesto uno
// stato locale, un ramo di render e la SPEZZATURA del flusso in due funzioni
// (apri / poi-fai) in ognuno dei 17: è il tipo di conversione che si fa bene
// nei primi cinque file e si sbaglia negli ultimi dodici. Qui la promise tiene
// insieme il flusso, e ogni sito resta una riga.
//
// L'hook SOLLEVA fuori dal provider, come useAppData(): un fallback silenzioso
// a `window.confirm` reintrodurrebbe di nascosto proprio ciò che questo modulo
// esiste per togliere, e lo farebbe nel punto meno visibile possibile.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.jsx";

const ConfirmContext = createContext(null);

// Una stringa sola è la forma più frequente ("Eliminare questo avviso?"): la
// accettiamo come titolo, così i siti semplici restano semplici.
const normalizza = (opzioni) => (
  typeof opzioni === "string" ? { title: opzioni } : { ...opzioni }
);

export function ConfirmProvider({ children }) {
  const [richiesta, setRichiesta] = useState(null);
  // Il `resolve` della promise in attesa vive in una ref e NON nello stato:
  // risolverlo dentro un updater di setState significherebbe un effetto
  // collaterale in una funzione che React può eseguire due volte (StrictMode)
  // o rieseguire in Concurrent — la stessa regola per cui le scritture della
  // chat sono comandi espliciti e non differenze dedotte in un updater.
  const risolviRef = useRef(null);

  const congeda = useCallback((esito) => {
    const risolvi = risolviRef.current;
    risolviRef.current = null;
    setRichiesta(null);
    risolvi?.(esito);
  }, []);

  const conferma = useCallback((opzioni) => new Promise((risolvi) => {
    // Una seconda richiesta mentre una è aperta (doppio click, due handler che
    // partono insieme): la precedente si chiude come "annullata" invece di
    // restare appesa per sempre — una promise mai risolta è un `await` che non
    // ritorna, cioè una funzione che si ferma a metà senza dirlo a nessuno.
    risolviRef.current?.(false);
    risolviRef.current = risolvi;
    setRichiesta(normalizza(opzioni));
  }), []);

  // Stessa ragione allo smontaggio: chi stava aspettando riceve `false`.
  useEffect(() => () => {
    risolviRef.current?.(false);
    risolviRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={conferma}>
      {children}
      <ConfirmDialog
        open={!!richiesta}
        title={richiesta?.title}
        body={richiesta?.body}
        cta={richiesta?.cta}
        annulla={richiesta?.annulla}
        danger={richiesta?.danger}
        onConfirm={() => congeda(true)}
        onCancel={() => congeda(false)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Ritorna `conferma(opzioni) => Promise<boolean>`.
 *
 *   const conferma = useConfirm();
 *   if (!(await conferma({
 *     title: "Svuotare il cestino?",
 *     body: "12 task verranno eliminati definitivamente. Azione irreversibile.",
 *     cta: "Svuota", danger: true,
 *   }))) return;
 *
 * `danger: true` colora l'azione di rosso E sposta il focus iniziale su
 * "Annulla": su un'operazione irreversibile, un Invio premuto per abitudine
 * non deve confermarla.
 */
export function useConfirm() {
  const conferma = useContext(ConfirmContext);
  if (!conferma) {
    throw new Error(
      "useConfirm() richiede <ConfirmProvider> (src/state/ConfirmContext.jsx). " +
      "Nei test usa renderWithAppData(), che lo monta già.",
    );
  }
  return conferma;
}
