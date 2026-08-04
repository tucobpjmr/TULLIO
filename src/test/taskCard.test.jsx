// TaskCard / TaskRow — il markup di un task in un posto solo.
//
// Prima questo scheletro era riscritto a mano in otto punti. I test qui sotto
// coprono le due cose che il refactor rischiava di rompere in silenzio:
// il contratto degli slot (ogni coda passa badge/meta/footer diversi, e devono
// finire dove il chiamante si aspetta) e i fallback che erano copia-incollati
// in ogni call site — categoria mancante, cliente assente, scadenza assente.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TaskCard, TaskRow } from "../components/tasks/TaskCard.jsx";

const task = (over = {}) => ({
  id: "t1", title: "Volo Roma → Tokyo", category: "booking",
  priority: "high", status: "todo", client: "Rossi", ...over,
});

describe("TaskCard — contenuto di base", () => {
  it("mostra titolo, categoria e cliente", () => {
    render(<TaskCard task={task()} />);
    expect(screen.getByText("Volo Roma → Tokyo")).toBeTruthy();
    expect(screen.getByText(/Prenotazioni|booking/i)).toBeTruthy();
    expect(screen.getByText("👤 Rossi")).toBeTruthy();
  });

  it("senza cliente non stampa la riga meta vuota", () => {
    const { container } = render(<TaskCard task={task({ client: null })} />);
    expect(container.textContent).not.toContain("👤");
  });

  it("una categoria non più nel dizionario non fa crashare la card", () => {
    // Caso reale: l'admin elimina una categoria mentre dei task la usano.
    // Il fallback era ripetuto verbatim in ogni call site; ora vive qui.
    render(<TaskCard task={task({ category: "categoria-cancellata" })} />);
    expect(screen.getByText("📋")).toBeTruthy();
    expect(screen.getByText(/categoria-cancellata/)).toBeTruthy();
  });

  it("showCategory={false} toglie il chip (l'Archivio mette i badge sotto il titolo)", () => {
    render(<TaskCard task={task()} showCategory={false} subheader={<span>✓ Completata</span>} />);
    expect(screen.queryByText(/Prenotazioni|booking/i)).toBeNull();
    expect(screen.getByText("✓ Completata")).toBeTruthy();
  });
});

describe("TaskCard — slot", () => {
  it("badges, meta e footer finiscono nella card", () => {
    render(
      <TaskCard
        task={task()}
        badges={<span>BADGE</span>}
        meta={<span>META</span>}
        footer={<button>FOOTER</button>}
      />,
    );
    expect(screen.getByText("BADGE")).toBeTruthy();
    expect(screen.getByText("META")).toBeTruthy();
    expect(screen.getByRole("button", { name: "FOOTER" })).toBeTruthy();
  });

  it("il meta sta nella stessa riga del cliente, il footer no", () => {
    // Serve a garantire che la scadenza (passata come meta da ogni coda) resti
    // accanto al cliente e non finisca in un blocco a sé.
    render(<TaskCard task={task()} meta={<span>📅 domani</span>} footer={<span>AZIONI</span>} />);
    const rigaMeta = screen.getByText("👤 Rossi").parentElement;
    expect(within(rigaMeta).getByText("📅 domani")).toBeTruthy();
    expect(within(rigaMeta).queryByText("AZIONI")).toBeNull();
  });
});

describe("TaskCard — interazione", () => {
  it("onOpen riceve il task al click sulla card", () => {
    const onOpen = vi.fn();
    const t = task();
    render(<TaskCard task={t} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("Volo Roma → Tokyo"));
    expect(onOpen).toHaveBeenCalledWith(t);
  });

  it("senza onOpen la card non è cliccabile", () => {
    const { container } = render(<TaskCard task={task()} />);
    expect(container.firstChild.style.cursor).toBe("");
  });

  it("clickTitleOnly: il click sul footer non apre il dettaglio", () => {
    // È il caso della coda Urgenti: il footer contiene il bottone "contatta",
    // che deve aprire la chat e non il task.
    const onOpen = vi.fn();
    render(
      <TaskCard task={task()} onOpen={onOpen} clickTitleOnly
        footer={<button>contatta</button>} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "contatta" }));
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Volo Roma → Tokyo"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("TaskCard — stile parametrico", () => {
  it("border e accent arrivano dal chiamante (ogni coda ha la sua semantica)", () => {
    const { container } = render(
      <TaskCard task={task()} border="1px solid rgb(1, 2, 3)" accent="rgb(4, 5, 6)" />,
    );
    // Con l'accento i quattro lati non coincidono più, quindi la shorthand
    // `border` risulta vuota: si controllano i lati singoli.
    expect(container.firstChild.style.borderTop).toContain("rgb(1, 2, 3)");
    expect(container.firstChild.style.borderLeft).toContain("rgb(4, 5, 6)");
  });

  it("senza accent non viene disegnato il bordo sinistro", () => {
    const { container } = render(<TaskCard task={task()} border="1px solid rgb(1, 2, 3)" />);
    expect(container.firstChild.style.borderLeftWidth).toBe("1px");
  });

  it("hoverLift solleva e riabbassa la card", () => {
    const { container } = render(<TaskCard task={task()} hoverLift />);
    const card = container.firstChild;
    fireEvent.mouseEnter(card);
    expect(card.style.transform).toBe("translateY(-1px)");
    fireEvent.mouseLeave(card);
    expect(card.style.transform).toBe("none");
  });

  it("senza hoverLift il mouse non tocca lo stile", () => {
    const { container } = render(<TaskCard task={task()} />);
    fireEvent.mouseEnter(container.firstChild);
    expect(container.firstChild.style.transform).toBe("");
  });
});

describe("TaskRow", () => {
  it("mostra icona categoria, titolo, sottotitolo e slot in coda", () => {
    render(<TaskRow task={task()} subtitle="📅 domani" trailing={<span>ALTA</span>} />);
    expect(screen.getByText("Volo Roma → Tokyo")).toBeTruthy();
    expect(screen.getByText("📅 domani")).toBeTruthy();
    expect(screen.getByText("ALTA")).toBeTruthy();
  });

  it("senza sottotitolo non aggiunge una seconda riga", () => {
    render(<TaskRow task={task()} />);
    const titolo = screen.getByText("Volo Roma → Tokyo");
    expect(titolo.parentElement.children.length).toBe(1);
  });

  it("onOpen riceve il task al click", () => {
    const onOpen = vi.fn();
    const t = task();
    render(<TaskRow task={t} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("Volo Roma → Tokyo"));
    expect(onOpen).toHaveBeenCalledWith(t);
  });

  it("l'hover torna allo sfondo di partenza, non a un bianco fisso", () => {
    // Regressione reale del vecchio markup del Calendario: onMouseLeave
    // rimetteva "#fff" invece dello sfondo originale della riga.
    const { container } = render(<TaskRow task={task()} background="rgb(9, 9, 9)" />);
    const row = container.firstChild;
    fireEvent.mouseEnter(row);
    expect(row.style.background).toBe("var(--surface2)");
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe("rgb(9, 9, 9)");
  });
});
