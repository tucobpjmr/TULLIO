// AppDataContext — il contratto che sostituisce lo specchio globale.
//
// Questi test coprono le tre proprietà per cui la migrazione è stata fatta, e
// che appGlobals.js non poteva garantire:
//
//   1. Un cambio di team RI-RENDERIZZA i consumatori. Con le globali un
//      componente memoizzato continuava a mostrare il verdetto vecchio, perché
//      React non osservava la variabile di modulo.
//   2. I permessi si calcolano sul team del provider, non su un default.
//   3. Usare l'hook fuori dal provider è un ERRORE esplicito, non un fallback
//      silenzioso ai dati demo: un fallback ricreerebbe esattamente il valore
//      globale implicito che si voleva eliminare.
import { describe, it, expect, vi } from "vitest";
import { memo } from "react";
import { render, screen } from "@testing-library/react";
import { AppDataProvider, useAppData } from "../state/AppDataContext.jsx";

const TEAM_ADMIN = [{ id: "u1", name: "Uno", role: "Admin", active: true, pending: false }];
const TEAM_JUNIOR = [{ id: "u1", name: "Uno", role: "Junior Agent", active: true, pending: false }];

// Task assegnato a un altro: un Admin può modificarlo, un Junior Agent no.
const TASK = { id: "t1", title: "Volo Roma", category: "booking", assignees: ["altro"] };

// `memo` di proposito: è il caso che con le globali dava il risultato sbagliato.
const VerdettoPermesso = memo(function VerdettoPermesso() {
  const { io } = useAppData();
  return <span data-testid="verdetto">{io.modificaTask(TASK) ? "SI" : "NO"}</span>;
});

const Wrapper = ({ team }) => (
  <AppDataProvider team={team} categories={{}} currentUserId="u1">
    <VerdettoPermesso />
  </AppDataProvider>
);

describe("AppDataContext — i permessi seguono lo state renderizzato", () => {
  it("calcola il verdetto sul team del provider, non su un default", () => {
    render(<Wrapper team={TEAM_ADMIN} />);
    expect(screen.getByTestId("verdetto").textContent).toBe("SI");
  });

  it("cambiare il team ri-renderizza anche un consumatore memoizzato", () => {
    const { rerender } = render(<Wrapper team={TEAM_ADMIN} />);
    expect(screen.getByTestId("verdetto").textContent).toBe("SI");

    // Stesso utente, stesso task: cambia solo il ruolo nel team. È la prova
    // che il verdetto è funzione dello state e non di una variabile di modulo.
    rerender(<Wrapper team={TEAM_JUNIOR} />);
    expect(screen.getByTestId("verdetto").textContent).toBe("NO");
  });

  // Il value è memoizzato su [team, categories, currentUserId] PER RIFERIMENTO:
  // vale finché il provider riceve gli stessi oggetti, come fa VoyageDeskInner
  // passando `state.team` / `state.categories` dal reducer. Un letterale inline
  // (`categories={{}}`) sarebbe un oggetto nuovo a ogni render e vanificherebbe
  // la memoizzazione di tutti i consumatori — da qui la costante qui sotto.
  it("il value non cambia identità se team/categorie/utente non cambiano", () => {
    const CATS_STABILI = {};
    const visti = [];
    function Spia() {
      visti.push(useAppData());
      return null;
    }
    const albero = (extra) => (
      <AppDataProvider team={TEAM_ADMIN} categories={CATS_STABILI} currentUserId="u1">
        <Spia />
        <span>{extra}</span>
      </AppDataProvider>
    );
    const { rerender } = render(albero("a"));
    rerender(albero("b"));
    expect(visti.length).toBe(2);
    expect(visti[0]).toBe(visti[1]); // stessa identità → i figli memo non si invalidano
  });
});

// ─── M-2 · `io` e `per(id)` sono due superfici, non una con un parametro ───
describe("AppDataContext — io e per(id)", () => {
  // Un team in cui i due utenti hanno ruoli diversi: è l'unico modo di
  // distinguere «io» da «qualcun altro» guardando il risultato.
  const TEAM_MISTO = [
    { id: "u1", name: "Uno", role: "Admin", active: true, pending: false },
    { id: "j1", name: "Junior", role: "Junior Agent", active: true, pending: false },
  ];
  const leggi = (currentUserId, f) => {
    let esito;
    function Spia() { esito = f(useAppData()); return null; }
    render(
      <AppDataProvider team={TEAM_MISTO} categories={{}} currentUserId={currentUserId}>
        <Spia />
      </AppDataProvider>
    );
    return esito;
  };

  it("`io` è `per(currentUserId)`: il 28° caso su 29", () => {
    expect(leggi("u1", (ctx) => ctx.io.isAdmin())).toBe(true);
    expect(leggi("j1", (ctx) => ctx.io.isAdmin())).toBe(false);
  });

  it("`per(id)` risponde su QUALCUN ALTRO, ed è il caso raro che ora si vede", () => {
    // È `isJuniorAgent(m.id)` di UserSwitcher, l'unico dei ventinove call site
    // in cui l'id non era `currentUserId`. Prima aveva la stessa forma degli
    // altri ventotto e nulla lo distingueva.
    expect(leggi("u1", (ctx) => ctx.per("j1").isJuniorAgent())).toBe(true);
    expect(leggi("u1", (ctx) => ctx.io.isJuniorAgent())).toBe(false);
  });

  it("il verdetto su un task segue chi lo chiede", () => {
    // Task di un altro: l'Admin lo modifica, il Junior Agent no.
    expect(leggi("u1", (ctx) => ctx.io.modificaTask(TASK))).toBe(true);
    expect(leggi("u1", (ctx) => ctx.per("j1").modificaTask(TASK))).toBe(false);
  });

  it("`io` ha l'identità stabile del value: sopravvive a un render qualunque", () => {
    // È la proprietà che il rilievo dava per persa. `io` nasce dentro lo stesso
    // `useMemo` delle diciassette voci che sostituisce, quindi un consumatore
    // che lo mette in un array di dipendenze non ricalcola per niente.
    const CATS_STABILI = {};
    const visti = [];
    function Spia() { visti.push(useAppData().io); return null; }
    const albero = (extra) => (
      <AppDataProvider team={TEAM_MISTO} categories={CATS_STABILI} currentUserId="u1">
        <Spia />
        <span>{extra}</span>
      </AppDataProvider>
    );
    const { rerender } = render(albero("a"));
    rerender(albero("b"));
    expect(visti[0]).toBe(visti[1]);
  });
});

describe("AppDataContext — nessun fallback implicito", () => {
  it("useAppData() fuori dal provider solleva invece di ripiegare sui mock", () => {
    // React logga l'errore di render sulla console: silenziato per non sporcare
    // l'output del test, che sta verificando proprio quel throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Nudo() {
      useAppData();
      return null;
    }
    expect(() => render(<Nudo />)).toThrow(/AppDataProvider/);
    spy.mockRestore();
  });
});

describe("AppDataContext — dizionario categorie", () => {
  it("le categorie disponibili sono filtrate per ruolo (il Driver vede solo transfer)", () => {
    const CATS = { booking: { label: "Booking" }, transfer: { label: "Transfer" } };
    const TEAM_DRIVER = [{ id: "d1", name: "Driver", role: "Driver", active: true, pending: false }];
    let disponibili;
    function Spia() {
      disponibili = useAppData().io.categorieDisponibili();
      return null;
    }
    render(
      <AppDataProvider team={TEAM_DRIVER} categories={CATS} currentUserId="d1">
        <Spia />
      </AppDataProvider>
    );
    expect(Object.keys(disponibili)).toEqual(["transfer"]);
  });
});
