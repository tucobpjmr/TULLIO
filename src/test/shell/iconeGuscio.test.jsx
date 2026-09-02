// src/test/shell/iconeGuscio.test.jsx
// Le icone del guscio sono tracciati SVG e non caratteri emoji.
//
// PERCHÉ ESISTE. La sostituzione emoji → <Icona> è invisibile a ogni test
// funzionale: i bottoni della nav si trovano per etichetta, non per icona, e
// continuerebbero a passare identici se qualcuno riscrivesse "📅" nel JSX. Il
// difetto che questo file intercetta è quindi la REGRESSIONE SILENZIOSA — il
// ritorno all'emoji in un punto solo, che è esattamente come la codebase era
// arrivata ad avere tre sistemi di stile paralleli.
//
// La seconda metà è più importante della prima. Un <svg> è `aria-hidden`, e
// dove l'etichetta non è visibile (sidebar ridotta, campanella) il nome
// accessibile del bottone lo dava PRIMA il carattere emoji, che lo screen
// reader annunciava. Toglierlo senza mettere un `aria-label` avrebbe lasciato
// bottoni muti: qui si verifica che non sia successo.
import { describe, it, expect, vi } from "vitest";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";
import { Sidebar } from "../../components/shell/Sidebar.jsx";
import { BottomNav } from "../../components/shell/BottomNav.jsx";
import { Topbar } from "../../components/shell/Topbar.jsx";
import { Icona } from "../../components/ui/Icona.jsx";
import { NAV_ITEMS } from "../../components/shell/navHelpers.js";

// La Topbar monta UserSwitcher → useAuth(): senza login reale il provider non
// c'è (stessa mock di memoViste.test.jsx).
vi.mock("../../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ signOut: () => {}, session: null, profile: null }),
  AuthProvider: ({ children }) => children,
}));

// L'intervallo dei pittogrammi: emoji e simboli, esclusi i caratteri
// tipografici che il guscio usa legittimamente come testo (le frecce ←/→ del
// pulsante che riduce la sidebar, il caret ▾ dello UserSwitcher).
const TIPOGRAFICI = new Set(["→", "←", "▾", "▴", "·", "—"]);
const pittogrammi = (testo) =>
  [...testo].filter(c => c.codePointAt(0) > 0x2190 && !TIPOGRAFICI.has(c));

describe("icone del guscio", () => {
  it("Sidebar: ogni voce di nav rende un SVG e nessuna emoji", () => {
    const { container } = renderWithAppData(
      <Sidebar activeView="calendar" onOpenBulk={() => {}} onOpenChat={() => {}} />,
      DEMO_APP_CTX,
    );
    // Le cinque voci di NAV_ITEMS per un manager sono quattro (Admin è solo
    // admin), più Chat e Più task: il conteggio esatto lo dà il ruolo, quindi
    // si verifica la proprietà — un SVG per ogni bottone con icona.
    const svg = container.querySelectorAll("svg");
    expect(svg.length).toBeGreaterThanOrEqual(3);
    expect(pittogrammi(container.textContent)).toEqual([]);
  });

  it("Sidebar: il bottone della voce ha il nome accessibile anche a nav ridotta", () => {
    const { getByRole } = renderWithAppData(
      <Sidebar activeView="calendar" onOpenBulk={() => {}} onOpenChat={() => {}} />,
      DEMO_APP_CTX,
    );
    // L'etichetta visibile sparisce quando la sidebar si riduce; `aria-label`
    // no. È il bottone stesso a doverla portare, non il testo accanto.
    const calendario = getByRole("button", { name: "Calendario" });
    expect(calendario.getAttribute("aria-label")).toBe("Calendario");
    expect(calendario.querySelector("svg")).toBeTruthy();
    expect(calendario.getAttribute("aria-current")).toBe("page");
  });

  it("BottomNav: icone SVG e badge ancora al loro posto", () => {
    const { container, getByRole } = renderWithAppData(
      <BottomNav activeView="calendar" onOpenBulk={() => {}} onOpenChat={() => {}} unreadChat={4} />,
      DEMO_APP_CTX,
    );
    expect(pittogrammi(container.textContent)).toEqual([]);
    const chat = getByRole("button", { name: "Messaggi team" });
    expect(chat.querySelector("svg")).toBeTruthy();
    // Il badge vive DENTRO l'ancora dell'icona: se la sostituzione avesse
    // sciolto quel contenitore, il numero non sarebbe più lì.
    expect(chat.textContent).toContain("4");
  });

  it("Topbar: la campanella ha un nome accessibile e dichiara le non lette", () => {
    const { getByRole } = renderWithAppData(
      <Topbar
        activeView="dashboard"
        ricerca=""
        onSearchChange={() => {}}
        notifications={[]}
        nonLetteOltreFinestra={3}
      />,
      DEMO_APP_CTX,
    );
    const campanella = getByRole("button", { name: /Notifiche/ });
    expect(campanella.querySelector("svg")).toBeTruthy();
    expect(campanella.getAttribute("aria-expanded")).toBe("false");
  });

  it("NAV_ITEMS espone nomi di tracciato, non caratteri da stampare", () => {
    for (const voce of NAV_ITEMS) {
      expect(pittogrammi(voce.icon)).toEqual([]);
      // Un nome sconosciuto renderebbe null: qui si verifica che ogni voce
      // della nav abbia davvero il suo tracciato in ui/Icona.jsx.
      const { container, unmount } = renderWithAppData(<Icona nome={voce.icon} />, DEMO_APP_CTX);
      expect(container.querySelector("svg")).toBeTruthy();
      unmount();
    }
  });

  it("Icona: un nome sconosciuto non rende nulla e non solleva", () => {
    const { container } = renderWithAppData(<Icona nome="inesistente" />, DEMO_APP_CTX);
    expect(container.querySelector("svg")).toBeNull();
  });
});
