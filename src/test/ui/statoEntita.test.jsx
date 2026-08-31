// A-3 dell'audit UX/errori del 31 agosto — il riquadro del terzo stato.
//
// La proprietà che conta, e che è facile perdere in una rifattorizzazione: il
// riquadro si AGGIUNGE alla vista, non la sostituisce. Ciò che era stato
// caricato prima dell'errore — o le altre entità della stessa schermata —
// resta utilizzabile. Sostituire tutto sarebbe la reazione sproporzionata che
// ViewErrorBoundary esiste per non avere.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatoEntita } from "../../components/ui/StatoEntita.jsx";

const contenuto = <p>Archivio vuoto</p>;

describe("StatoEntita", () => {
  it("senza errori è trasparente: disegna solo i figli", () => {
    render(<StatoEntita voci={[{ chiave: "tasks", etichetta: "l'archivio", stato: null }]}>
      {contenuto}
    </StatoEntita>);
    expect(screen.getByText("Archivio vuoto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Riprova/i })).not.toBeInTheDocument();
  });

  it("con un errore avverte E lascia i figli a schermo", () => {
    render(
      <StatoEntita voci={[{
        chiave: "tasks", etichetta: "l'archivio",
        stato: { messaggio: "Caricamento task fallito", riprova: vi.fn() },
      }]}>
        {contenuto}
      </StatoEntita>,
    );
    expect(screen.getByText(/Non è stato possibile caricare l'archivio/)).toBeInTheDocument();
    // La frase che disinnesca la bugia: sotto c'è ancora «Archivio vuoto», e
    // senza questa riga l'utente lo leggerebbe come un fatto.
    expect(screen.getByText(/non è l'elenco completo/i)).toBeInTheDocument();
    expect(screen.getByText("Archivio vuoto")).toBeInTheDocument();
  });

  it("«Riprova» chiama la ricarica di QUELLA entità", async () => {
    const riprova = vi.fn();
    render(
      <StatoEntita voci={[{
        chiave: "tasks", etichetta: "l'archivio",
        stato: { messaggio: "boom", riprova },
      }]}>
        {contenuto}
      </StatoEntita>,
    );
    screen.getByRole("button", { name: /Riprova/i }).click();
    expect(riprova).toHaveBeenCalledTimes(1);
  });

  it("due entità rotte nella stessa vista danno due riquadri distinti", () => {
    // È il caso della Dashboard, che vive di `tasks` E `notices`: un riquadro
    // solo costringerebbe a una frase generica («alcuni dati») che non dice
    // quale elenco guardare con sospetto.
    render(
      <StatoEntita voci={[
        { chiave: "tasks", etichetta: "le task", stato: { messaggio: "a", riprova: vi.fn() } },
        { chiave: "notices", etichetta: "la bacheca avvisi", stato: { messaggio: "b", riprova: vi.fn() } },
      ]}>
        {contenuto}
      </StatoEntita>,
    );
    expect(screen.getByText(/Non è stato possibile caricare le task/)).toBeInTheDocument();
    expect(screen.getByText(/Non è stato possibile caricare la bacheca avvisi/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Riprova/i })).toHaveLength(2);
  });

  it("è `status` e non `alert`: l'interruzione l'ha già fatta il toast", () => {
    // Ripetere l'annuncio interrompente a ogni render della vista sarebbe
    // rumore per chi usa uno screen reader: qui la notizia non è nuova, è la
    // condizione che resta.
    const { container } = render(
      <StatoEntita voci={[{
        chiave: "tasks", etichetta: "le task",
        stato: { messaggio: "boom", riprova: vi.fn() },
      }]}>
        {contenuto}
      </StatoEntita>,
    );
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("senza voci non tocca nulla", () => {
    render(<StatoEntita voci={[]}>{contenuto}</StatoEntita>);
    expect(screen.getByText("Archivio vuoto")).toBeInTheDocument();
  });
});
