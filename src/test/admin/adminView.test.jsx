// AdminView e le sue cinque tab — test di montaggio dopo M-1.
//
// PERCHÉ ESISTE. Fino a questa sessione AdminView era l'unica delle sei viste a
// ricevere `state` intero, e lo drillava a tutte e cinque le tab. L'audit di
// agosto (M-1) non la classificava come un problema di prestazioni — l'area
// Admin non è quella dove si passa la giornata — ma come l'eccezione che rende
// l'invariante non verificabile: «le invarianti con un'eccezione sono quelle
// che si perdono».
//
// Questi test sono il modo di renderla verificabile. Montano ogni tab SENZA
// prop `state`, con i dati che arrivano solo da AppDataContext (team,
// categorie) e da TasksContext (task): se qualcuno reintroducesse una lettura
// da `state.qualcosa` il render solleverebbe qui, non in produzione dentro il
// ViewErrorBoundary.
//
// Le asserzioni sono volutamente grosse — un conteggio, un nome, un'etichetta —
// perché ciò che devono intercettare è la vista che smette di leggere dal
// contesto, non il dettaglio del markup.
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData } from "../helpers/appData.jsx";

// AdminTeamTab monta Avatar/ContactActions e chiama Users.listContacts() al
// mount; AdminIOTab importa lib/xlsx. Senza queste mock il file non arriva
// nemmeno a importare (il client Supabase pretende URL e chiave). Stesso
// schema di dashboardQueues.test.jsx.
vi.mock("../../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../../lib/api.js", () => ({
  Users: {
    getAvatarUrl: vi.fn().mockResolvedValue({ url: null, error: null }),
    listContacts: vi.fn().mockResolvedValue({ data: [], error: null }),
    getContacts: vi.fn().mockResolvedValue({ data: null, error: null }),
    invite: vi.fn().mockResolvedValue({ error: null }),
  },
}));

const { AdminView } = await import("../../components/admin/AdminView.jsx");

const TEAM = [
  { id: "marco", name: "Marco Bianchi", role: "admin", avatar: "MB", color: "#0F2044", active: true },
  { id: "sara", name: "Sara Verdi", role: "agent", seniority: "senior", avatar: "SV", color: "#C8832A", active: true },
  { id: "nuovo", name: "Luca Pending", role: "agent", avatar: "LP", color: "#777", active: true, pending: true },
];

const CATEGORIES = {
  booking: { label: "Prenotazioni", icon: "✈️", color: "#0F2044", bg: "#E8ECF4" },
  payment: { label: "Pagamenti", icon: "💰", color: "#2D7A4F", bg: "#E6F4EC" },
};

const TASKS = [
  { id: "t1", title: "Volo Roma → Tokyo", category: "booking", status: "todo", assignees: ["sara"] },
  { id: "t2", title: "Saldo Rossi", category: "payment", status: "done", assignees: ["sara"] },
  { id: "t3", title: "Vecchio", category: "booking", status: "todo", assignees: [], deletedAt: "2026-01-01T00:00:00Z" },
  { id: "t4", title: "Hotel Kyoto", category: "booking", status: "todo", assignees: ["sara"] },
];

const CTX = { team: TEAM, categories: CATEGORIES, currentUserId: "marco", tasks: TASKS };

const dispatch = () => {};

// Le prop che restano ad AdminView: le sole fette dello state che non vivono
// in un contesto. Passarle esplicitamente è il punto — se un giorno tornassero
// a essere lette da `state`, questo oggetto non basterebbe più.
const PROPS = {
  dispatch,
  agencyName: "VoyageDesk",
  notices: [],
  activityLog: [
    { id: "log-1", time: new Date().toISOString(), type: "ADD_TASK", text: 'Creato task "Volo Roma → Tokyo"' },
  ],
  messageTemplates: [{ id: "tpl-1", label: "Sollecito acconto", text: "Gentile cliente…" }],
};

const apri = (tab) => {
  const utils = renderWithAppData(<AdminView {...PROPS} />, CTX);
  // fireEvent e non .click(): il click nudo non passa da act(), quindi il
  // setState del cambio tab non viene applicato e si asserirebbe sempre sulla
  // tab Team.
  if (tab) fireEvent.click(screen.getByRole("button", { name: new RegExp(tab, "i") }));
  return utils;
};

// Diverse etichette dell'area Admin sono spezzate fra più nodi ("📦 <b>2</b>
// task pronti per l'export"): getByText su una stringa non le trova. Qui
// cerchiamo sul testo dell'elemento intero.
const testoCompleto = (atteso) => (_, el) =>
  el?.textContent?.replace(/\s+/g, " ").trim().includes(atteso) ?? false;

describe("AdminView — nessuna tab riceve `state`", () => {
  it("monta il guscio con i cinque tab", () => {
    apri();
    for (const label of ["Team", "Import / Export", "Sistema", "Categorie", "Log attività"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });

  it("Team legge il team dal contesto, non da una prop", () => {
    apri();
    // Il membro pending finisce nella sezione approvazioni, gli attivi in elenco:
    // basta che entrambi compaiano per sapere che `team` è arrivato.
    expect(screen.getByText("Sara Verdi")).toBeInTheDocument();
    expect(screen.getByText("Luca Pending")).toBeInTheDocument();
  });

  it("Categorie legge categorie e task dal contesto", () => {
    apri("Categorie");
    expect(screen.getByText("Prenotazioni")).toBeInTheDocument();
    expect(screen.getByText("Pagamenti")).toBeInTheDocument();
    // usageCount ignora le cestinate: booking ha t1, t4 attive e t3 nel
    // cestino, quindi 2 — non 3.
    expect(screen.getByText(/2 task usano questa categoria/)).toBeInTheDocument();
    expect(screen.getByText(/1 task usano questa categoria/)).toBeInTheDocument();
  });

  it("Sistema conta i task dal contesto e riceve i template come prop", () => {
    apri("Sistema");
    // 3 attivi (t3 è nel cestino) e 1 completato: se i task non arrivassero
    // dal contesto i conteggi sarebbero tutti a zero.
    expect(screen.getByText("Task attivi")).toBeInTheDocument();
    expect(screen.getByText("1 nel cestino")).toBeInTheDocument();
    expect(screen.getByText("33% completion")).toBeInTheDocument();
    expect(screen.getByText("Sollecito acconto")).toBeInTheDocument();
  });

  it("Log attività rende le voci passate come prop", () => {
    apri("Log attività");
    expect(screen.getByText('Creato task "Volo Roma → Tokyo"')).toBeInTheDocument();
  });

  it("Import / Export conta i task esportabili dal contesto", () => {
    apri("Import / Export");
    // Il conteggio esclude di default le cestinate: 3 su 4.
    expect(
      screen.getAllByText(testoCompleto("3 task pronti per l'export")).length
    ).toBeGreaterThan(0);
  });
});
