// ─── useIsMounted (criticità #11) ──────────────────────────────────────────
// Predicato stabile "questo componente è ancora montato?", da interrogare DOPO
// ogni `await` e prima di scrivere nello stato.
//
// PERCHÉ ESISTE. Il pattern che ha generato il rilievo è ovunque nei modali:
//
//     setSaving(true);
//     await onSave(form);     // ← il genitore chiude il modale qui dentro
//     setSaving(false);       // ← su un componente che non esiste più
//
// In `ClienteModal` non è un caso di scuola: `ClientiView.handleSave` termina
// con `setModal(null)`, quindi lo smontaggio è la conseguenza NORMALE del
// salvataggio riuscito, non un caso limite. Stessa forma per i pannelli che
// fanno una fetch al mount e possono essere chiusi mentre è in volo
// (`TaskAttachments` dentro lo slide-over, `ClienteListePanel`): l'utente
// chiude, la risposta arriva dopo.
//
// React 18 non stampa più il warning "Can't perform a React state update on an
// unmounted component" e la scrittura è di fatto un no-op, quindi non è un
// leak — ma non per questo il codice è corretto: dice di voler fare una cosa
// che non può fare, e chi lo legge non sa se lo smontaggio sia previsto o una
// svista. Il guard rende esplicito che quel ramo è atteso, ed è lo STESSO
// contratto di `isCurrent()` in useDebouncedTableSubscription (caveat #21) —
// una convenzione sola per "la risposta è arrivata tardi, lasciala cadere".
//
// La funzione ritornata ha identità stabile: si può mettere fra le dipendenze
// di un useCallback/useEffect senza rianimarli.
import { useCallback, useEffect, useRef } from "react";

export function useIsMounted() {
  // Parte da `true` e non da `false`: fra il primo render e l'esecuzione
  // dell'effetto il componente È montato, e un `await` risolto in quella
  // finestra (una promise già risolta, una risposta dalla cache) verrebbe
  // altrimenti scartato a torto.
  const montato = useRef(true);

  useEffect(() => {
    montato.current = true;
    return () => { montato.current = false; };
  }, []);

  return useCallback(() => montato.current, []);
}
