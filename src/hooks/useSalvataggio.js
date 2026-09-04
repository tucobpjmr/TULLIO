// ─── useSalvataggio (A-2, M-1, M-4 dell'audit performance/UX del 16 agosto) ──
// Le tre cose che ogni salvataggio di questa app deve fare, in un posto solo:
// non partire due volte, NON chiudere né svuotare finché l'esito non è noto, e
// dire in chiaro — accanto ai dati, non in un toast che passa — che quei dati
// sono ancora lì.
//
// PERCHÉ ESISTE. Il progetto sa già come si fa: le quattro tab del
// BulkTaskCreator e `ProfileEditor` aspettano l'esito e restano aperte in
// errore, con commenti che spiegano perché («il modale resta aperto con file e
// mappatura intatti, altrimenti l'operatore dovrebbe ricaricare il CSV e
// rimappare tutto»). Tre call site facevano il contrario:
//
//   • QuickAddTask   → `onClose()` incondizionato dopo l'await: la task appare
//                      e sparisce, e titolo/cliente/allegati non esistono più
//   • ClientiView    → `setModal(null)` senza attendere affatto i dispatch, il
//                      che rendeva IRRAGGIUNGIBILE il `saving` che
//                      ClienteModal disegna («Salvataggio...» in un ramo che
//                      non può eseguire)
//   • TaskSlideOver  → `setNewComment("")` prima di sapere com'era andata
//
// La differenza fra i due gruppi non era una decisione: era l'ordine in cui
// sono stati scritti, e quale file si era aperto per copiarne la forma. Finché
// la regola vive nei commenti di chi l'ha applicata, il prossimo form la
// riprodurrà o no per caso. Qui è una funzione: usarla è la strada più corta.
//
// ─── IL CONTRATTO ──────────────────────────────────────────────────────────
// `esegui(...argomenti)` è la scrittura, e ritorna quello che ritorna
// `useSyncedDispatch`: `{ error }`. Tre esiti, non due:
//
//   • `{ error }`            → FALLITO. `errore` si accende, `alSuccesso` non
//                              viene chiamato, il chiamante resta come sta. Il
//                              toast col messaggio del database lo mostra già
//                              il registry di persistenza: qui non se ne
//                              aggiunge un secondo, si dice l'unica cosa che
//                              il toast non dice — «i dati sono ancora qui».
//   • `{ error: null }`      → RIUSCITO. `alSuccesso()` chiude o svuota.
//   • `{ avviso }`           → RIUSCITO A METÀ, e questo è il caso che senza un
//                              contratto condiviso si scrive male. QuickAddTask
//                              crea la task e POI carica gli allegati: se salta
//                              un upload la task esiste, quindi riprovare
//                              creerebbe un doppione. `avviso` tiene aperto il
//                              pannello per dire dove recuperare il pezzo
//                              mancante e BLOCCA ulteriori tentativi — che è
//                              la differenza fra «riprova» e «no, quello no».
//
// Un `throw` di `esegui` viene catturato e trattato come fallimento. Non è
// zelo difensivo: `QuickAddTask` aveva `setBusy(true)` senza try, quindi una
// qualunque eccezione (rete che cade a metà upload) lasciava `busy` a `true`
// per sempre — modale congelata, bottone spento, nessun messaggio.
import { useCallback, useEffect, useRef, useState } from "react";
import { useIsMounted } from "./useIsMounted.js";
import { isPermessoNegato } from "../lib/esitoScrittura.js";

const MESSAGGIO_PREDEFINITO = "Salvataggio non riuscito. I dati sono ancora qui, riprova.";

/**
 * @param {(...args: any[]) => Promise<{error?: any, avviso?: string}|void>} esegui
 *        la scrittura vera e propria.
 * @param {object} [opzioni]
 * @param {() => void} [opzioni.alSuccesso]  chiude la modale, svuota la casella:
 *        l'azione che PRIMA veniva fatta comunque. Chiamata solo a esito noto e
 *        positivo, e solo se il componente è ancora montato.
 * @param {string|((error:any)=>string)} [opzioni.messaggioErrore]  il testo
 *        inline in caso di fallimento. Il default parla di «dati», che è vero
 *        per un form; chi salva altro (un commento) passa il proprio.
 * @returns {{salva: Function, azzera: Function, inVolo: boolean, errore: string, avviso: string, bloccato: boolean}}
 */
export function useSalvataggio(esegui, { alSuccesso, messaggioErrore = MESSAGGIO_PREDEFINITO } = {}) {
  const [inVolo, setInVolo] = useState(false);
  const [errore, setErrore] = useState("");
  const [avviso, setAvviso] = useState("");
  const montato = useIsMounted();

  // Il freno al doppio invio è un REF, non lo stato `inVolo`: fra due click
  // ravvicinati React può non aver ancora ri-renderizzato, quindi entrambi i
  // gestori leggerebbero `inVolo === false` e partirebbero due scritture. Il
  // ref cambia nello stesso turno in cui parte la prima. `inVolo` resta, ma
  // per quello che serve davvero allo stato: DIPINGERE l'attesa.
  const inVoloRif = useRef(false);
  // `avviso` blocca i tentativi successivi per la stessa ragione, ma con un
  // ciclo di vita diverso: non si spegne più, perché la cosa da fare non è
  // riprovare — è chiudere.
  const bloccatoRif = useRef(false);

  // Le funzioni del chiamante vivono in un ref, aggiornato dopo ogni commit.
  // Due effetti, entrambi voluti: `salva` ha identità STABILE (si può passare a
  // un componente `memo` senza rianimarlo, che è la premessa dichiarata della
  // memoizzazione in questo progetto) e il call site non deve avvolgere
  // `esegui` in un `useCallback` con la lista di dipendenze giusta — cosa che
  // con un form intero nella closure si sbaglia volentieri, e si sbaglia in
  // silenzio salvando i valori di due render fa.
  //
  // L'assegnazione sta in un effetto e non nel corpo del render perché il corpo
  // può eseguire senza che il risultato venga committato (render interrotto,
  // StrictMode); un salvataggio parte da un'interazione, che avviene sempre
  // DOPO il commit — quindi il ref è già quello del render a schermo.
  const rif = useRef({ esegui, alSuccesso, messaggioErrore });
  useEffect(() => { rif.current = { esegui, alSuccesso, messaggioErrore }; });

  const salva = useCallback(async (...argomenti) => {
    if (inVoloRif.current || bloccatoRif.current) return null;
    inVoloRif.current = true;
    setInVolo(true);
    setErrore("");

    let esito;
    try {
      esito = await rif.current.esegui(...argomenti);
    } catch (e) {
      esito = { error: e instanceof Error ? e : new Error(String(e)) };
    }
    inVoloRif.current = false;

    // Smontati mentre la scrittura era in volo: l'esito torna al chiamante ma
    // non si tocca lo stato. È lo stesso contratto di useIsMounted() che i
    // modali applicavano a mano — assorbito qui, così ClienteModal non deve
    // più ricordarselo.
    if (!montato()) return esito;
    setInVolo(false);

    if (esito?.error) {
      // A-1 dell'audit del 4 settembre. Entrambi i rami NON chiamano
      // `alSuccesso`: il pannello resta aperto con i dati dentro, che è la
      // cosa che conta e che prima non succedeva su un rifiuto di permesso
      // (vedi il preambolo di lib/esitoScrittura.js).
      //
      // Differiscono solo sul TESTO. Un rifiuto di permesso ha già il suo
      // messaggio — il toast che il reducer alza in `_denied()`, garantito su
      // ogni azione con `guard` da permessoNegatoContract.test.js — e il testo
      // inline predefinito dice «riprova»: un consiglio giusto per una
      // scrittura fallita e sbagliato qui, dove riprovare fallirà identico.
      // Due messaggi che si contraddicono sullo stesso gesto sono il difetto
      // che «Compensazione» (M-1) ha già chiuso una volta nel reducer; qui si
      // evita di riaprirlo, lasciando parlare il toast.
      if (!isPermessoNegato(esito.error)) {
        const m = rif.current.messaggioErrore;
        setErrore(typeof m === "function" ? m(esito.error) : m);
      }
      return esito;
    }
    if (esito?.avviso) {
      bloccatoRif.current = true;
      setAvviso(esito.avviso);
      return esito;
    }
    rif.current.alSuccesso?.();
    return esito;
  }, [montato]);

  // Spegne il messaggio d'errore senza tentare una scrittura. Serve a chi
  // MOSTRA l'esito del salvataggio nello stesso posto in cui mostra altro —
  // ImportTab ha un banner solo per «file illeggibile» e «importazione non
  // riuscita» — e ha un'azione che riporta il pannello allo stato di partenza
  // (là è «cambia file»): senza questo, `errore` si spegnerebbe solo al
  // tentativo successivo, e il banner resterebbe a parlare di un import che
  // l'utente ha già abbandonato.
  //
  // NON tocca `avviso` né `bloccato`, ed è deliberato: quel blocco esiste
  // perché la scrittura è RIUSCITA a metà, e la cosa da fare non è riprovare —
  // è chiudere. Un `azzera` che lo spegnesse riaprirebbe esattamente il caso
  // che `avviso` esiste per chiudere (il secondo batch di task duplicate).
  const azzera = useCallback(() => setErrore(""), []);

  return { salva, azzera, inVolo, errore, avviso, bloccato: !!avviso };
}
