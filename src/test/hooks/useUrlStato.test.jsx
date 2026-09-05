// `useUrlStato` — «la vista e il task aperto vivono anche nell'URL».
//
// PERCHÉ QUESTO TEST ESISTE. A-2 dell'audit del 5 settembre: l'app non aveva
// URL, e le tre proprietà che questo hook introduce si rompono tutte in
// SILENZIO — un link che non porta dove dice, un «indietro» che impila invece
// di tornare, un refresh che perde il posto. Nessuna di esse fa fallire un
// test funzionale: si vedono solo usando l'app, cioè tardi.
//
// ⚠️ PERCHÉ L'ARMATURA HA UNO STATO E NON UN `vi.fn()`. La prima stesura di
// questo file usava un dispatch spia, e falliva su un caso che nell'app
// funziona: senza uno stato che SEGUE il dispatch, il render dopo il mount ha
// `pronto` già vero e la vista ancora quella vecchia, cioè una combinazione
// che React non produce mai — `setPronto` e il `SET_VIEW` iniziale partono
// dallo stesso effetto e vengono accorpati nello stesso render. Una spia
// avrebbe misurato una proprietà dell'armatura, non dell'hook. `useProva`
// rifà il giro completo (dispatch → stato → riflesso), che è anche l'unico
// modo di esercitare il ramo in cui il reducer RIFIUTA la vista.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useState, useRef, useCallback } from "react";
import { renderHook, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useUrlStato, VISTE, daRicerca, aRicerca } from "../../hooks/useUrlStato.js";

/** Porta la barra degli indirizzi a `url` senza passare dall'hook. */
const vaiA = (url) => window.history.replaceState(null, "", url);

/** L'URL corrente, path + query. */
const urlCorrente = () => window.location.pathname + window.location.search;

const TASK = { id: "t-1", title: "Pratica Rossi", deletedAt: null };
const TASK_CESTINATO = { id: "t-2", title: "Vecchia", deletedAt: "2026-09-01T00:00:00Z" };
const TASKS = [TASK, TASK_CESTINATO];

/**
 * Il giro completo: un `dispatch` che applica davvero l'azione allo stato,
 * come fa il reducer. `accetta` è il guard dei permessi — `SET_VIEW` verso una
 * vista negata non muove lo stato, esattamente come `_denied` nel reducer.
 */
function useProva({ vistaIniziale = "dashboard", taskIdIniziale = null, tasks = TASKS, accetta } = {}) {
  const [vista, setVista] = useState(vistaIniziale);
  const [taskId, setTaskId] = useState(taskIdIniziale);
  const azioniRif = useRef([]);
  // In un ref per tenere `dispatch` a identità stabile, come quello vero.
  const accettaRif = useRef(accetta);
  accettaRif.current = accetta;

  const dispatch = useCallback((azione) => {
    azioniRif.current.push(azione);
    if (azione.type === "SET_VIEW") {
      if (accettaRif.current && !accettaRif.current(azione.payload)) return;
      setVista(azione.payload);
    }
    if (azione.type === "SET_SELECTED_TASK") setTaskId(azione.payload?.id ?? null);
  }, []);

  useUrlStato({ vista, taskId, tasks, dispatch });
  return { vista, taskId, azioni: azioniRif.current, setVista, setTaskId };
}

const monta = (opzioni) => renderHook(() => useProva(opzioni));

beforeEach(() => {
  vaiA("/");
});

describe("useUrlStato — lo stato si riflette nell'URL", () => {
  it("un avvio senza parametri lascia `/` e non dispatcha niente", () => {
    const { result } = monta();
    expect(urlCorrente()).toBe("/");
    // La dashboard è il default e non si scrive: dispatcharla azzererebbe
    // `listeTarget` e costerebbe un render per non cambiare nulla.
    expect(result.current.azioni).toEqual([]);
  });

  it("cambiare vista scrive `?v=` e IMPILA una voce di cronologia", () => {
    const { result } = monta();
    const prima = window.history.length;
    act(() => result.current.setVista("calendar"));
    expect(urlCorrente()).toBe("/?v=calendar");
    // È la metà che fa funzionare il tasto Indietro: senza `pushState` la
    // cronologia resterebbe di una voce sola.
    expect(window.history.length).toBe(prima + 1);
  });

  it("aprire un task scrive `?task=`, chiuderlo lo toglie", () => {
    const { result } = monta({ vistaIniziale: "archivio" });
    act(() => result.current.setTaskId("t-1"));
    expect(urlCorrente()).toBe("/?v=archivio&task=t-1");
    act(() => result.current.setTaskId(null));
    expect(urlCorrente()).toBe("/?v=archivio");
  });

  it("uno stato invariato NON riscrive la cronologia", () => {
    const { result, rerender } = monta();
    act(() => result.current.setVista("trash"));
    const dopoPrimaNavigazione = window.history.length;
    // Un render qualunque (un toast, un carattere digitato) non deve impilare
    // una voce identica alla corrente: il confronto testuale con `ultimo` è
    // ciò che lo impedisce.
    act(() => rerender());
    act(() => result.current.setVista("trash"));
    expect(window.history.length).toBe(dopoPrimaNavigazione);
  });
});

describe("useUrlStato — l'URL si applica allo stato al mount", () => {
  it("`?v=archivio` applica la vista SENZA impilare una voce", () => {
    // È il caso che `pronto` esiste per coprire, e ciò che lo distingue NON è
    // la URL finale — è la stessa nei due casi — ma quante voci di cronologia
    // sono servite per arrivarci. Senza `pronto` il primo riflesso gira con
    // `activeView` ancora a "dashboard", scrive `/` consumando la sostituzione
    // iniziale, e il render successivo impila `/?v=archivio`: due voci per un
    // avvio, cioè un Indietro che non esce dall'app.
    vaiA("/?v=archivio");
    const prima = window.history.length;
    const { result } = monta();
    expect(result.current.vista).toBe("archivio");
    expect(urlCorrente()).toBe("/?v=archivio");
    expect(window.history.length).toBe(prima);
  });

  it("`?v=liste&lista=<id>` passa l'intent di apertura mirata", () => {
    vaiA("/?v=liste&lista=abc");
    const { result } = monta();
    expect(result.current.azioni).toContainEqual(
      { type: "SET_VIEW", payload: "liste", lista: "abc" });
  });

  it("`?lista=` è CONSUMATO: la normalizzazione lo toglie dalla URL", () => {
    // Come `?task=`/`?chat=` in usePushNavigation. Se restasse, ogni voce di
    // cronologia lo porterebbe con sé e un «indietro» riaprirebbe la lista.
    vaiA("/?v=liste&lista=abc");
    monta();
    expect(urlCorrente()).toBe("/?v=liste");
  });

  it("una vista che non esiste viene ignorata, non passata al reducer", () => {
    // Un `?v=` scritto a mano non deve poter mettere `activeView` fuori enum:
    // la vista resterebbe montata sul `default` dello switch, con la sidebar
    // che non evidenzia niente.
    vaiA("/?v=pippo");
    const { result } = monta();
    expect(result.current.azioni).toEqual([]);
    expect(urlCorrente()).toBe("/");
  });

  it("una vista NEGATA dai permessi non monta, e la URL si corregge", () => {
    // `?v=admin` da un link ricevuto, con un profilo che non è admin: il
    // rifiuto lo fa già il reducer (`canAccessAdmin`), qui si verifica che
    // questo hook non aggiunga un secondo controllo e non lasci in barra una
    // URL che afferma una vista che non è montata.
    vaiA("/?v=admin");
    const prima = window.history.length;
    const { result } = monta({ accetta: (v) => v !== "admin" });
    expect(result.current.azioni).toContainEqual({ type: "SET_VIEW", payload: "admin" });
    expect(result.current.vista).toBe("dashboard");
    expect(urlCorrente()).toBe("/");
    // La correzione SOSTITUISCE: una voce in più per dire «no» sarebbe una
    // voce da riattraversare all'indietro.
    expect(window.history.length).toBe(prima);
  });

  it("la normalizzazione iniziale SOSTITUISCE, non impila", () => {
    vaiA("/?v=archivio&task=t-1&lista=abc");
    const prima = window.history.length;
    monta();
    // Mettere in forma canonica una URL non è una navigazione: una voce in
    // più qui costringerebbe a premere Indietro due volte per uscire.
    expect(window.history.length).toBe(prima);
  });

  it("i parametri di terzi sopravvivono alla normalizzazione", () => {
    vaiA("/?utm_source=mail&v=trash");
    monta();
    expect(urlCorrente()).toBe("/?v=trash&utm_source=mail");
  });
});

describe("useUrlStato — indietro e avanti", () => {
  it("`popstate` riporta vista e task nello stato", () => {
    const { result } = monta();
    vaiA("/?v=archivio&task=t-1");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(result.current.vista).toBe("archivio");
    expect(result.current.taskId).toBe("t-1");
  });

  it("un task cestinato o sparito CHIUDE il dettaglio senza toast", () => {
    // È una navigazione all'indietro, non un tentativo di aprire qualcosa:
    // `openTaskById` alza un toast «non più disponibile» ed è giusto lì,
    // sarebbe sbagliato qui.
    const { result } = monta({ vistaIniziale: "archivio", taskIdIniziale: "t-1" });
    vaiA("/?v=archivio&task=t-2");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(result.current.azioni).toContainEqual({ type: "SET_SELECTED_TASK", payload: null });
    expect(result.current.taskId).toBe(null);
  });

  it("dopo `popstate` il riflesso non scrive AFFATTO nella cronologia", () => {
    // La proprietà che rende usabile il tasto Indietro. Due meccanismi la
    // proteggono insieme — `ultimo` aggiornato PRIMA dei dispatch e
    // `sostituisci` alzato — e per questo l'asserzione non è su
    // `history.length`: quella passa anche togliendone uno (verificato per
    // mutazione), perché la scrittura di troppo diventa un `replaceState`, che
    // non impila. Contare le CHIAMATE distingue «non ha impilato» da «non ha
    // scritto», che è ciò che l'hook promette.
    const { result } = monta();
    act(() => result.current.setVista("calendar"));
    vaiA("/");
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(result.current.vista).toBe("dashboard");
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(urlCorrente()).toBe("/");
    push.mockRestore();
    replace.mockRestore();
  });

  it("un `popstate` verso una vista NEGATA corregge la URL sostituendo", () => {
    // Il ramo che `sostituisci` alzato nel gestore di popstate protegge, e
    // l'unico che lo esercita: qui il dispatch NON muove lo stato, quindi il
    // riflesso deve scrivere — e deve farlo sostituendo, o la correzione
    // diventerebbe una voce di cronologia da riattraversare. Il caso è raro
    // (un admin declassato durante la sessione che preme Indietro) ma è
    // l'unico in cui quella riga ha un effetto: senza un test, sarebbe una
    // difesa che nessuno può dire se funziona.
    const { result } = monta({ accetta: (v) => v !== "admin" });
    act(() => result.current.setVista("calendar"));
    vaiA("/?v=admin");
    const prima = window.history.length;
    const push = vi.spyOn(window.history, "pushState");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(result.current.vista).toBe("calendar");
    expect(urlCorrente()).toBe("/?v=calendar");
    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(prima);
    push.mockRestore();
  });

  it("non ridispatcha ciò che è già vero", () => {
    const { result } = monta({ vistaIniziale: "trash" });
    const quante = result.current.azioni.length;
    vaiA("/?v=trash");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(result.current.azioni.length).toBe(quante);
  });

  it("smontando toglie il listener", () => {
    const { result, unmount } = monta();
    const quante = result.current.azioni.length;
    unmount();
    vaiA("/?v=calendar");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(result.current.azioni.length).toBe(quante);
  });
});

describe("useUrlStato — le funzioni pure", () => {
  it("daRicerca ricade sulla dashboard su un valore fuori enum", () => {
    expect(daRicerca("?v=pippo").vista).toBe("dashboard");
    expect(daRicerca("").vista).toBe("dashboard");
  });

  it("aRicerca dà la STESSA stringa per lo stesso stato", () => {
    // Il confronto con `ultimo` è testuale: se l'ordine dei parametri
    // dipendesse dall'ordine di arrivo, uno stato invariato scriverebbe una
    // voce di cronologia a ogni render.
    const a = aRicerca({ vista: "archivio", task: "x" }, "?task=x&v=archivio", "/");
    const b = aRicerca({ vista: "archivio", task: "x" }, "?v=archivio&task=x", "/");
    expect(a).toBe(b);
    expect(a).toBe("/?v=archivio&task=x");
  });
});

describe("useUrlStato — l'elenco delle viste non può divergere in silenzio", () => {
  it("VISTE coincide con i `case` di renderView in VoyageDeskInner.jsx", () => {
    // `VISTE` è la SECONDA definizione di «quali viste esistono»: la prima è
    // lo switch che le monta. Confrontarle leggendo il sorgente — come
    // persistenceGuards.test.js fa con i case del reducer — è ciò che rende
    // impossibile aggiungere una vista e scoprire mesi dopo che il suo link
    // non funziona.
    const sorgente = readFileSync(join(process.cwd(), "src", "VoyageDeskInner.jsx"), "utf8");
    const corpo = sorgente.slice(sorgente.indexOf("const renderView"));
    const casi = new Set([...corpo.matchAll(/^\s*case\s+"([a-z]+)":/gm)].map(m => m[1]));
    expect(casi.size).toBeGreaterThan(0);   // controllo positivo: il parsing ha trovato qualcosa
    expect([...VISTE].sort()).toEqual([...casi].sort());
  });
});
