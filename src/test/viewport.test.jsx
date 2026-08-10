// src/test/viewport.test.jsx
// P2-7: ViewportContext deve aggiornarsi (e ri-renderizzare i suoi 40
// consumatori) solo al cambio di FASCIA, non a ogni pixel attraversato da un
// resize — e la soglia propria di Sidebar.jsx (1280, "narrow"/"wide" nel
// desktop) deve continuare a funzionare, perché non coincide con le fasce
// pubblicate da questo contesto (640/1024). L'audit segnalava il rischio
// esplicitamente: nessun test copriva né l'uno né l'altro comportamento
// prima di questo file.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ViewportProvider, useViewport } from "../components/Viewport.jsx";
import { Sidebar } from "../components/shell/Sidebar.jsx";
import { withAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

function setWidth(px) {
  window.innerWidth = px;
  window.dispatchEvent(new Event("resize"));
}

// Il resize passa da un `requestAnimationFrame` (per coalescere i pixel
// intermedi di un trascinamento): senza aspettarlo, l'effetto del provider
// non ha ancora girato quando l'assert legge il DOM.
async function flushRaf() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(r));
  });
}

function Probe() {
  const vp = useViewport();
  return <div data-testid="vp">{vp.width}/{vp.isMobile ? "m" : vp.isTablet ? "t" : "d"}</div>;
}

describe("ViewportProvider — fasce, non pixel (P2-7)", () => {
  beforeEach(() => { window.innerWidth = 1400; });

  it("non aggiorna il value per un resize dentro la stessa fascia", async () => {
    render(<ViewportProvider><Probe /></ViewportProvider>);
    expect(screen.getByTestId("vp").textContent).toBe("1400/d");
    setWidth(1350); // resta sopra 1280: nessuna fascia (640/1024/1280) cambia
    await flushRaf();
    // `width` non si aggiorna: il pixel esatto non serve a isMobile/isTablet/
    // isDesktop, ed è esattamente il render a vuoto che P2-7 elimina.
    expect(screen.getByTestId("vp").textContent).toBe("1400/d");
  });

  it("aggiorna il value al superamento della soglia 1024 (desktop → tablet)", async () => {
    render(<ViewportProvider><Probe /></ViewportProvider>);
    setWidth(1000);
    await flushRaf();
    expect(screen.getByTestId("vp").textContent).toBe("1000/t");
  });

  it("aggiorna il value al superamento della soglia 640 (tablet → mobile)", async () => {
    window.innerWidth = 800;
    render(<ViewportProvider><Probe /></ViewportProvider>);
    setWidth(600);
    await flushRaf();
    expect(screen.getByTestId("vp").textContent).toBe("600/m");
  });
});

describe("Sidebar — l'auto-collapse a 1280 resta corretto dopo P2-7", () => {
  it("si collassa entrando nella fascia desktop stretta (1025–1280)", async () => {
    window.innerWidth = 1400;
    const dispatch = vi.fn();
    render(
      <ViewportProvider>
        {withAppData(<Sidebar collapsed={false} dispatch={dispatch} />, DEMO_APP_CTX)}
      </ViewportProvider>,
    );
    setWidth(1200);
    await flushRaf();
    expect(dispatch).toHaveBeenCalledWith({ type: "TOGGLE_SIDEBAR" });
  });

  it("si ri-espande tornando sopra i 1280", async () => {
    window.innerWidth = 1200;
    const dispatch = vi.fn();
    render(
      <ViewportProvider>
        {withAppData(<Sidebar collapsed dispatch={dispatch} />, DEMO_APP_CTX)}
      </ViewportProvider>,
    );
    setWidth(1400);
    await flushRaf();
    expect(dispatch).toHaveBeenCalledWith({ type: "TOGGLE_SIDEBAR" });
  });

  it("non tocca sidebarCollapsed per un resize dentro la stessa fascia desktop", async () => {
    window.innerWidth = 1400;
    const dispatch = vi.fn();
    render(
      <ViewportProvider>
        {withAppData(<Sidebar collapsed={false} dispatch={dispatch} />, DEMO_APP_CTX)}
      </ViewportProvider>,
    );
    setWidth(1350); // resta sopra 1280
    await flushRaf();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
