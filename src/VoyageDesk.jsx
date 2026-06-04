
import { useState, useReducer, useContext, createContext, useRef, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";

// ─── GOOGLE FONTS ──────────────────────────────────────────────────────────
const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0F2044;
      --navy-light: #1a3060;
      --navy-dark: #08152d;
      --gold: #D4A843;
      --gold-light: #e8c46a;
      --gold-dark: #b8902e;
      --surface: #FAFAF7;
      --surface2: #F0EEE8;
      --surface3: #E8E5DC;
      --success: #2D7A4F;
      --warning: #C8832A;
      --danger: #C0392B;
      --text: #1A1A2E;
      --text-muted: #6B6B80;
      --text-light: #9999AA;
      --border: #E0DDD5;
    }
    body { font-family: 'DM Sans', sans-serif; background: var(--surface); color: var(--text); }
    .playfair { font-family: 'Playfair Display', serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--gold-dark); }
    .drag-over { outline: 2px dashed var(--gold); background: rgba(212,168,67,0.07) !important; }
    .dragging { opacity: 0.4; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideRight { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
    @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
    @keyframes toastIn { from { transform:translateY(80px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    @keyframes toastOut { to { transform:translateY(80px); opacity:0; } }
    @keyframes recordPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.5); } 50% { box-shadow: 0 0 0 12px rgba(192,57,43,0); } }
    @keyframes wave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
    @keyframes typing { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
    .record-pulse { animation: recordPulse 1.5s ease infinite; }
    .fade-in { animation: fadeIn 0.3s ease forwards; }
    .slide-right { animation: slideRight 0.3s ease forwards; }
    .slide-up { animation: slideUp 0.35s ease forwards; }
    .skeleton { animation: pulse 1.5s ease infinite; background: linear-gradient(90deg, var(--surface2) 25%, var(--surface3) 50%, var(--surface2) 75%); background-size: 200% 100%; }
    .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(15,32,68,0.12); }

    /* ─── RESPONSIVE ─── */
    /* Griglie adattive: collassano su tablet/mobile via media query.
       Gli stili inline restano il default desktop; queste regole hanno la priorità grazie a !important. */
    @media (max-width: 1024px) {
      .vd-grid-kpi { grid-template-columns: repeat(2, 1fr) !important; }
      .vd-grid-2col, .vd-grid-3col, .vd-grid-dash-main { grid-template-columns: 1fr 1fr !important; }
      .vd-grid-dash-main > * { grid-column: auto !important; }
      .vd-pad { padding: 18px !important; }
    }
    @media (max-width: 640px) {
      .vd-grid-kpi, .vd-grid-2col, .vd-grid-3col, .vd-grid-dash-main,
      .vd-grid-collapse { grid-template-columns: 1fr !important; }
      .vd-grid-dash-main > * { grid-column: auto !important; }
      .vd-pad { padding: 14px !important; }
      .vd-hide-mobile { display: none !important; }
      .vd-row-wrap { flex-wrap: wrap !important; }
    }
    /* Bottom nav: solo mobile/tablet */
    .vd-bottom-nav { display: none; }
    @media (max-width: 1024px) {
      .vd-bottom-nav {
        display: flex;
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 450;
        background: var(--navy-dark); border-top: 1px solid rgba(212,168,67,0.2);
        padding: 6px 4px env(safe-area-inset-bottom, 6px);
        justify-content: space-around; align-items: stretch;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.25);
      }
      .vd-main-scroll { padding-bottom: 70px !important; }
    }
  `}</style>
);

// ─── VIEWPORT (responsive) ─────────────────────────────────────────────────
const ViewportContext = createContext({ width: 1280, isMobile: false, isTablet: false, isDesktop: true });

const useViewport = () => useContext(ViewportContext);

const ViewportProvider = ({ children }) => {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    // Assicura il meta viewport per il rendering mobile corretto
    if (typeof document !== "undefined" && !document.querySelector('meta[name="viewport"]')) {
      const m = document.createElement("meta");
      m.name = "viewport";
      m.content = "width=device-width, initial-scale=1, viewport-fit=cover";
      document.head.appendChild(m);
    }
    let raf = null;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const vp = {
    width,
    isMobile: width <= 640,
    isTablet: width > 640 && width <= 1024,
    isDesktop: width > 1024,
  };
  return <ViewportContext.Provider value={vp}>{children}</ViewportContext.Provider>;
};

// ─── MOCK DATA ─────────────────────────────────────────────────────────────
// Utente attualmente loggato. `let` per supportare lo switcher utente (v0.8).
// Il reducer mantiene in sync state.currentUserId con questo riferimento globale.
let CURRENT_USER = "marco";
const _syncCurrentUser = (id) => { CURRENT_USER = id; };

// TEAM e CATEGORIES sono mutabili (gestiti dall'Admin via reducer).
// Sono `let` perché getMember e altre utility leggono il riferimento corrente.
// Il reducer aggiorna sia state.team/state.categories sia questi array in-place.
let TEAM = [
  { id: "marco", name: "Marco Ferretti", role: "Manager", avatar: "MF", color: "#0F2044", capacity: 12, active: true, pending: false },
  { id: "sofia", name: "Sofia Conti", role: "Senior Agent", avatar: "SC", color: "#2D7A4F", capacity: 10, active: true, pending: false },
  { id: "luca", name: "Luca Moretti", role: "Junior Agent", avatar: "LM", color: "#C8832A", capacity: 8, active: true, pending: false },
  { id: "giulia", name: "Giulia Ricci", role: "Driver", avatar: "GR", color: "#7B4F9E", capacity: 6, active: true, pending: false },
  { id: "roberto", name: "Roberto Esposito", role: "Admin", avatar: "RE", color: "#C0392B", capacity: 9, active: true, pending: false },
  { id: "elena", name: "Elena Marini", role: "Junior Agent", avatar: "EM", color: "#0EA5E9", capacity: 8, active: false, pending: true },
  { id: "matteo", name: "Matteo De Luca", role: "Senior Agent", avatar: "MD", color: "#DB2777", capacity: 10, active: false, pending: true },
];

let CATEGORIES = {
  booking: { label: "Booking", icon: "✈️", color: "#3B82F6", bg: "#EFF6FF" },
  hotel: { label: "Hotel", icon: "🏨", color: "#8B5CF6", bg: "#F5F3FF" },
  visa: { label: "Visa & Doc.", icon: "🛂", color: "#EF4444", bg: "#FEF2F2" },
  client: { label: "Clienti", icon: "👤", color: "#06B6D4", bg: "#ECFEFF" },
  payment: { label: "Pagamenti", icon: "💰", color: "#F59E0B", bg: "#FFFBEB" },
  marketing: { label: "Marketing", icon: "📣", color: "#EC4899", bg: "#FDF2F8" },
  supplier: { label: "Fornitori", icon: "🤝", color: "#10B981", bg: "#ECFDF5" },
  admin: { label: "Admin", icon: "📋", color: "#6B7280", bg: "#F9FAFB" },
  itinerary: { label: "Itinerario", icon: "🗺️", color: "#F97316", bg: "#FFF7ED" },
  transfer: { label: "Transfer", icon: "🚐", color: "#7B4F9E", bg: "#F3F0F9" },
};

const PRIORITIES = {
  critical: { label: "Critico", color: "#C0392B", bg: "#FEE2E2" },
  high: { label: "Alto", color: "#C8832A", bg: "#FEF3C7" },
  medium: { label: "Medio", color: "#D4A843", bg: "#FFFBEB" },
  low: { label: "Basso", color: "#2D7A4F", bg: "#D1FAE5" },
};

const STATUSES = ["todo", "inprogress", "awaiting_client", "awaiting_supplier", "done"];
const STATUS_LABELS = {
  todo: "Da Fare",
  inprogress: "In Corso",
  awaiting_client: "Attesa Cliente",
  awaiting_supplier: "Attesa Fornitore",
  done: "Completato",
};
const STATUS_COLORS = {
  todo: "#6B7280",
  inprogress: "#3B82F6",
  awaiting_client: "#F59E0B",
  awaiting_supplier: "#8B5CF6",
  done: "#2D7A4F",
};

const now = new Date();
const d = (daysOffset, h = 10, m = 0) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + daysOffset);
  dt.setHours(h, m, 0, 0);
  return dt.toISOString();
};

const INITIAL_TASKS = [
  { id: "t1", title: "Confermare voli Maldive - Famiglia Rossi", category: "booking", priority: "critical", status: "inprogress", assignees: ["sofia"], client: "Famiglia Rossi", clientId: "cl-rossi", supplierId: "sp-emirates", dueDate: d(1, 17, 0), estimatedHours: 2, description: "Verificare disponibilità posti business class e confermare prenotazione. Contattare Emirates per upgrade disponibili.", comments: [{ user: "Marco Ferretti", text: "Priorità massima, cliente VIP", time: d(-1) }] },
  { id: "t2", title: "Visto Giappone - Coppia Bianchi", category: "visa", priority: "critical", status: "todo", assignees: ["roberto"], client: "Coppia Bianchi", clientId: "cl-bianchi", supplierId: "sp-visti", dueDate: d(2, 9, 0), estimatedHours: 3, description: "Raccogliere documentazione per visto turistico Giappone. Luna di miele prevista per il mese prossimo.", comments: [] },
  { id: "t3", title: "Hotel Overwater Bungalow - Maldive", category: "hotel", priority: "high", status: "inprogress", assignees: ["sofia", "luca"], client: "Famiglia Rossi", clientId: "cl-rossi", supplierId: "sp-fourseasons", dueDate: d(3, 12, 0), estimatedHours: 1.5, description: "Contattare Four Seasons Kuda Huraa per disponibilità bungalow sull'acqua. Budget: 1500€/notte.", comments: [{ user: "Sofia Conti", text: "Four Seasons ha confermato 2 bungalow disponibili", time: d(-2) }] },
  { id: "t4", title: "Proposta incentive travel TechCorp", category: "itinerary", priority: "high", status: "awaiting_client", assignees: ["marco"], client: "Azienda TechCorp", clientId: "cl-techcorp", dueDate: d(4, 14, 0), estimatedHours: 5, description: "Preparare proposta dettagliata per viaggio incentive 50 persone. Destinazioni candidate: Dubrovnik, Marrakech, Lisbona.", comments: [{ user: "Marco Ferretti", text: "Proposta inviata, attesa risposta", time: d(-1) }] },
  { id: "t5", title: "Pagamento acconto Famiglia Rossi", category: "payment", priority: "high", status: "todo", assignees: ["roberto"], client: "Famiglia Rossi", clientId: "cl-rossi", dueDate: d(0, 16, 0), estimatedHours: 0.5, description: "Richiedere acconto del 30% per prenotazione Maldive. Totale viaggio: 12.400€.", comments: [] },
  { id: "t6", title: "Transfer aeroporto - Coppia Bianchi", category: "supplier", priority: "medium", status: "todo", assignees: ["giulia"], client: "Coppia Bianchi", clientId: "cl-bianchi", supplierId: "sp-ncc", dueDate: d(5, 8, 0), estimatedHours: 1, description: "Organizzare transfer NCC per partenza verso MXP. Volo KL 1656 ore 11:30.", comments: [] },
  { id: "t7", title: "Newsletter Giugno - Offerte Estate", category: "marketing", priority: "medium", status: "inprogress", assignees: ["luca"], client: null, clientId: null, dueDate: d(6, 18, 0), estimatedHours: 4, description: "Creare newsletter mensile con offerte last minute estate 2025. Target: 2.400 contatti.", comments: [{ user: "Luca Moretti", text: "Bozza al 60%, aggiungo le foto Grecia", time: d(0) }] },
  { id: "t8", title: "Contratto con nuovo fornitore bus", category: "supplier", priority: "medium", status: "awaiting_supplier", assignees: ["marco", "roberto"], client: null, clientId: null, supplierId: "sp-ncc", dueDate: d(7, 10, 0), estimatedHours: 2, description: "Finalizzare accordo quadro con Autoservizi Meridionali per trasporti gruppi 2025/2026.", comments: [] },
  { id: "t9", title: "Itinerario dettagliato Giappone 14 giorni", category: "itinerary", priority: "high", status: "inprogress", assignees: ["sofia"], client: "Coppia Bianchi", clientId: "cl-bianchi", dueDate: d(3, 11, 0), estimatedHours: 6, description: "Strutturare itinerario Tokyo-Kyoto-Osaka-Hiroshima. Inserire esperienze di nicchia: cerimonia del tè, tempio Fushimi Inari alba.", comments: [{ user: "Sofia Conti", text: "Aggiunto ryokan a Kyoto su richiesta della coppia", time: d(-1) }] },
  { id: "t10", title: "Aggiornare sito web pacchetti autunno", category: "marketing", priority: "low", status: "todo", assignees: ["luca"], client: null, clientId: null, dueDate: d(10, 17, 0), estimatedHours: 3, description: "Pubblicare nuovi pacchetti autunno: Foliage Canada, Halloween New York, Dolomiti.", comments: [] },
  { id: "t11", title: "Check-in online TechCorp - voli Barcelona", category: "booking", priority: "high", status: "done", assignees: ["sofia"], client: "Azienda TechCorp", clientId: "cl-techcorp", dueDate: d(-1, 9, 0), estimatedHours: 1, description: "Completare check-in online per 50 partecipanti. Assegnare posti preferenziali ai manager.", comments: [{ user: "Sofia Conti", text: "Check-in completato ✓ Tutti i posti assegnati", time: d(-1) }] },
  { id: "t12", title: "Richiesta polizza assicurativa viaggio", category: "admin", priority: "medium", status: "done", assignees: ["roberto"], client: "Famiglia Rossi", clientId: "cl-rossi", supplierId: "sp-allianz", dueDate: d(-2, 15, 0), estimatedHours: 0.5, description: "Polizza annullamento + medica per 4 persone. Confrontare Allianz, Generali, AXA.", comments: [{ user: "Roberto Esposito", text: "Polizza Allianz emessa, €342 totale", time: d(-2) }] },
  { id: "t13", title: "Followup chiamata TechCorp - decisione destinazione", category: "client", priority: "critical", status: "awaiting_client", assignees: ["marco"], client: "Azienda TechCorp", clientId: "cl-techcorp", dueDate: d(1, 10, 30), estimatedHours: 1, description: "Chiamata con HR Director TechCorp per confermare destinazione incentive. Budget approvato 85.000€.", comments: [] },
  { id: "t14", title: "Prenotare ryokan Kyoto - Bianchi", category: "hotel", priority: "high", status: "inprogress", assignees: ["sofia"], client: "Coppia Bianchi", clientId: "cl-bianchi", supplierId: "sp-ryokan", dueDate: d(2, 16, 0), estimatedHours: 2, description: "Prenotare Tawaraya Ryokan o Hiiragiya per 2 notti. Suite tradizionale con vista giardino zen.", comments: [] },
  { id: "t15", title: "Fattura acconto TechCorp", category: "payment", priority: "medium", status: "todo", assignees: ["roberto"], client: "Azienda TechCorp", clientId: "cl-techcorp", dueDate: d(4, 11, 0), estimatedHours: 0.5, description: "Emettere fattura acconto 50% per evento incentive. Importo: 42.500€ + IVA.", comments: [] },
  { id: "t16", title: "Aggiornamento CRM clienti Q2", category: "admin", priority: "low", status: "todo", assignees: ["roberto", "luca"], client: null, clientId: null, dueDate: d(14, 17, 0), estimatedHours: 4, description: "Aggiornare schede clienti con dati viaggi 2025. Aggiungere preferenze e note speciali.", comments: [] },
  { id: "t17", title: "Transfer hotel-aeroporto Bianchi Malpensa", category: "supplier", priority: "medium", status: "todo", assignees: ["giulia"], client: "Coppia Bianchi", clientId: "cl-bianchi", supplierId: "sp-ncc", dueDate: d(8, 6, 0), estimatedHours: 0.5, description: "NCC privato per 2 persone + bagagli. Partenza alle 06:45, volo ANA 785.", comments: [] },
  { id: "t18", title: "Social media post - Maldive promo", category: "marketing", priority: "low", status: "done", assignees: ["luca"], client: null, clientId: null, dueDate: d(-3, 17, 0), estimatedHours: 1.5, description: "Post Instagram + Facebook con foto Maldive stagione monsoni. CTA: richiedi preventivo.", comments: [{ user: "Luca Moretti", text: "Post pubblicato, +156 interazioni in 24h", time: d(-3) }] },
  { id: "t19", title: "Documenti sanitari Maldive - Rossi", category: "visa", priority: "high", status: "done", assignees: ["roberto"], client: "Famiglia Rossi", clientId: "cl-rossi", supplierId: "sp-visti", dueDate: d(-1, 12, 0), estimatedHours: 1, description: "Verificare requisiti sanitari entrata Maldive. Raccogliere certificati vaccinazione richiesti.", comments: [{ user: "Roberto Esposito", text: "Non richieste vaccinazioni specifiche, documentazione OK", time: d(-1) }] },
  { id: "t20", title: "Presentazione corporate travel policy TechCorp", category: "client", priority: "medium", status: "awaiting_client", assignees: ["marco", "sofia"], client: "Azienda TechCorp", clientId: "cl-techcorp", dueDate: d(5, 15, 0), estimatedHours: 3, description: "Preparare slide con policy viaggi corporate, livelli classe, hotel preferred, tool di prenotazione.", comments: [] },
  { id: "t21", title: "Escursioni snorkeling Maldive", category: "booking", priority: "medium", status: "inprogress", assignees: ["luca"], client: "Famiglia Rossi", clientId: "cl-rossi", dueDate: d(6, 10, 0), estimatedHours: 1.5, description: "Prenotare 3 escursioni snorkeling e 1 sessione di immersione guidata con istruttore certificato.", comments: [] },
  { id: "t22", title: "Revisione contratti stagione invernale", category: "admin", priority: "low", status: "todo", assignees: ["marco"], client: null, clientId: null, dueDate: d(20, 10, 0), estimatedHours: 5, description: "Revisione annuale contratti fornitori: tour operator, hotel chains, compagnie aeree.", comments: [] },
  // ─── Coda globale: task non assegnati (in attesa che qualcuno li prenda in carico) ───
  { id: "t23", title: "Nuova richiesta crociera Caraibi - Famiglia Marchetti", category: "client", priority: "high", status: "todo", assignees: [], client: "Famiglia Marchetti", clientId: "cl-marchetti", dueDate: d(2, 11, 0), estimatedHours: 1, description: "Richiesta arrivata via form sito: crociera 7 notti per 4 persone, partenza Miami. Da contattare entro 48h.", comments: [] },
  { id: "t24", title: "Blocco urgente Hotel Atene per gruppo studenti", category: "hotel", priority: "critical", status: "todo", assignees: [], client: "Liceo Manzoni", clientId: "cl-manzoni", dueDate: d(1, 12, 0), estimatedHours: 2, description: "30 camere a Plaka per fine Maggio. Tariffa già negoziata, serve solo conferma e invio rooming list.", comments: [] },
  { id: "t25", title: "Preventivo viaggio nozze Vietnam - Sposi Conte", category: "itinerary", priority: "medium", status: "todo", assignees: [], client: "Sposi Conte", clientId: "cl-conte", dueDate: d(5, 17, 0), estimatedHours: 3, description: "14 giorni Vietnam classico: Hanoi - Halong - Hoi An - Saigon. Budget medio-alto, esperienze locali.", comments: [] },
  // ─── Task Transfer assegnati a Giulia (Driver) ───
  { id: "t26", title: "Transfer Linate → Hotel Principe - Famiglia Rossi", category: "transfer", priority: "high", status: "todo", assignees: ["giulia"], client: "Famiglia Rossi", clientId: "cl-rossi", dueDate: d(1, 14, 30), estimatedHours: 1, description: "Pickup arrivo volo AZ1234 ore 14:00, 4 pax + 6 bagagli. Van 8 posti.", comments: [] },
  { id: "t27", title: "Transfer Hotel → Stazione Centrale - Coppia Bianchi", category: "transfer", priority: "medium", status: "inprogress", assignees: ["giulia"], client: "Coppia Bianchi", clientId: "cl-bianchi", dueDate: d(3, 9, 0), estimatedHours: 0.5, description: "Pickup hotel ore 09:00, treno Frecciarossa 9:55 per Roma. 2 pax + 3 bagagli.", comments: [] },
];

const NOTIFICATIONS = [
  { id: "n1", type: "overdue", title: "Task scaduto: Visto Giappone - Coppia Bianchi", time: "5 min fa", read: false },
  { id: "n2", type: "assigned", title: "Nuovo task assegnato: Newsletter Giugno", time: "1 ora fa", read: false },
  { id: "n3", type: "comment", title: "Sofia ha commentato su Hotel Overwater Bungalow", time: "2 ore fa", read: false },
  { id: "n4", type: "deadline", title: "Scadenza domani: Conferma voli Maldive", time: "3 ore fa", read: true },
  { id: "n5", type: "comment", title: "Luca ha aggiornato: Newsletter Giugno", time: "4 ore fa", read: true },
  { id: "n6", type: "deadline", title: "Scadenza oggi: Pagamento acconto Famiglia Rossi", time: "8 ore fa", read: true },
];

// ─── CLIENTI (CRM base v0.9.5) ─────────────────────────────────────────────
// Tipologia cliente: cambia icona + colore in lista e nei chip.
const CLIENT_TYPES = {
  famiglia: { label: "Famiglia", icon: "👨‍👩‍👧", color: "#3B82F6", bg: "#EFF6FF" },
  coppia: { label: "Coppia", icon: "💑", color: "#EC4899", bg: "#FDF2F8" },
  azienda: { label: "Azienda", icon: "🏢", color: "#0F2044", bg: "#EEF2FF" },
  gruppo: { label: "Gruppo", icon: "👥", color: "#10B981", bg: "#ECFDF5" },
  individuale: { label: "Individuale", icon: "👤", color: "#6B7280", bg: "#F9FAFB" },
};

const _clientStamp = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

const INITIAL_CLIENTS = [
  {
    id: "cl-rossi", name: "Famiglia Rossi", type: "famiglia",
    contactPerson: "Marco Rossi", email: "marco.rossi@example.com", phone: "+39 333 1234567",
    notes: "Cliente VIP. Adora destinazioni esotiche, budget alto. Preferenze: business class, esperienze esclusive.",
    createdAt: _clientStamp(120), updatedAt: _clientStamp(2), deletedAt: null,
  },
  {
    id: "cl-bianchi", name: "Coppia Bianchi", type: "coppia",
    contactPerson: "Giulia Bianchi", email: "g.bianchi@example.com", phone: "+39 339 7654321",
    notes: "Luna di miele. Prima volta in Giappone. Interessati a esperienze culturali autentiche (ryokan, tè).",
    createdAt: _clientStamp(80), updatedAt: _clientStamp(5), deletedAt: null,
  },
  {
    id: "cl-techcorp", name: "Azienda TechCorp", type: "azienda",
    contactPerson: "Anna Verdi (HR Director)", email: "hr@techcorp.it", phone: "+39 02 12345678",
    notes: "Incentive 50 persone, budget 85.000€. Approvazione interna richiesta su destinazione. Preferenze: Dubrovnik, Marrakech, Lisbona.",
    createdAt: _clientStamp(60), updatedAt: _clientStamp(1), deletedAt: null,
  },
  {
    id: "cl-marchetti", name: "Famiglia Marchetti", type: "famiglia",
    contactPerson: "Stefano Marchetti", email: "marchetti.family@example.com", phone: "+39 320 9988776",
    notes: "Richiesta arrivata da form sito. Crociera Caraibi 7 notti per 4 persone, partenza Miami. Da contattare entro 48h.",
    createdAt: _clientStamp(3), updatedAt: _clientStamp(3), deletedAt: null,
  },
  {
    id: "cl-manzoni", name: "Liceo Manzoni", type: "gruppo",
    contactPerson: "Prof. Ruggeri", email: "ruggeri@liceomanzoni.it", phone: "+39 011 5556677",
    notes: "Gruppo 30 studenti + 3 docenti. Viaggio istruzione Atene fine Maggio. Tariffa hotel Plaka già negoziata.",
    createdAt: _clientStamp(45), updatedAt: _clientStamp(7), deletedAt: null,
  },
  {
    id: "cl-conte", name: "Sposi Conte", type: "coppia",
    contactPerson: "Davide Conte", email: "davide.conte@example.com", phone: "+39 348 1122334",
    notes: "Viaggio nozze Vietnam classico, 14 giorni: Hanoi - Halong - Hoi An - Saigon. Budget medio-alto, esperienze locali.",
    createdAt: _clientStamp(20), updatedAt: _clientStamp(4), deletedAt: null,
  },
];

// Mappa nomi cliente legacy (campo `task.client` testo) → ID anagrafica clienti.
// Usato per migrare al volo: se task.clientId è assente ma `task.client` matcha un nome noto, risolviamo.
const _LEGACY_CLIENT_NAME_TO_ID = {
  "Famiglia Rossi": "cl-rossi",
  "Coppia Bianchi": "cl-bianchi",
  "Azienda TechCorp": "cl-techcorp",
  "Famiglia Marchetti": "cl-marchetti",
  "Liceo Manzoni": "cl-manzoni",
  "Sposi Conte": "cl-conte",
};

// ─── FORNITORI (v0.9.7) ────────────────────────────────────────────────────
// Tipologie fornitori coerenti con le esigenze di un'agenzia / tour operator.
const SUPPLIER_TYPES = {
  hotel: { label: "Hotel / Resort", icon: "🏨", color: "#8B5CF6", bg: "#F5F3FF" },
  transport: { label: "Trasporti / NCC", icon: "🚐", color: "#7B4F9E", bg: "#F3F0F9" },
  airline: { label: "Compagnia aerea", icon: "✈️", color: "#3B82F6", bg: "#EFF6FF" },
  insurance: { label: "Assicurazioni", icon: "🛡️", color: "#10B981", bg: "#ECFDF5" },
  "tour-operator": { label: "Tour operator", icon: "🌍", color: "#F97316", bg: "#FFF7ED" },
  visa: { label: "Visti / Consolato", icon: "🛂", color: "#EF4444", bg: "#FEF2F2" },
  other: { label: "Altro", icon: "🤝", color: "#6B7280", bg: "#F9FAFB" },
};

const INITIAL_SUPPLIERS = [
  {
    id: "sp-fourseasons", name: "Four Seasons Resort Maldives Kuda Huraa", type: "hotel",
    contactPerson: "Reservations Office", email: "reservations.kudahuraa@fourseasons.com", phone: "+960 664 4888",
    address: "North Malé Atoll, Maldive",
    services: "Overwater bungalow, beach villas, all-inclusive packages",
    notes: "Partner preferito per Maldive VIP. Tariffe nette concordate per Marzo-Maggio.",
    createdAt: _clientStamp(180), updatedAt: _clientStamp(10), deletedAt: null,
  },
  {
    id: "sp-emirates", name: "Emirates", type: "airline",
    contactPerson: "Trade Sales Italy", email: "trade.italy@emirates.com", phone: "+39 02 36046000",
    address: "Via Larga 23, 20122 Milano",
    services: "Voli business/first class, upgrade su disponibilità",
    notes: "Tariffe IATA + commissione standard. Codice agenzia attivo.",
    createdAt: _clientStamp(200), updatedAt: _clientStamp(15), deletedAt: null,
  },
  {
    id: "sp-ncc", name: "Autoservizi Meridionali NCC", type: "transport",
    contactPerson: "Antonio Russo", email: "antonio@autosrvmer.it", phone: "+39 02 8765432",
    address: "Via dei Mercati 8, 20149 Milano",
    services: "Transfer privati MXP/LIN, van 8-16 posti, autisti multilingua",
    notes: "Accordo quadro 2025/2026 in chiusura. Tariffe scontate per gruppi >8 pax.",
    createdAt: _clientStamp(90), updatedAt: _clientStamp(3), deletedAt: null,
  },
  {
    id: "sp-allianz", name: "Allianz Global Assistance", type: "insurance",
    contactPerson: "Customer Care B2B", email: "agenzie@allianz-assistance.it", phone: "+39 02 26609300",
    address: "Via Cordusio 4, 20123 Milano",
    services: "Polizze annullamento, medico/bagaglio, multi-rischio",
    notes: "Login portale agenzie attivo. Emissione immediata fino a 200k€ assicurati.",
    createdAt: _clientStamp(150), updatedAt: _clientStamp(8), deletedAt: null,
  },
  {
    id: "sp-ryokan", name: "Tawaraya Ryokan", type: "hotel",
    contactPerson: "Yumiko Sato", email: "info@tawarayaryokan.com", phone: "+81 75 211 5566",
    address: "Fuyacho-dori, Anekoji-agaru, Nakagyo-ku, Kyoto",
    services: "Ryokan tradizionale, kaiseki, vista giardino zen",
    notes: "Prenotare con almeno 60 giorni di anticipo. Comunicazione via email in inglese.",
    createdAt: _clientStamp(110), updatedAt: _clientStamp(6), deletedAt: null,
  },
  {
    id: "sp-visti", name: "Visti Express Italia", type: "visa",
    contactPerson: "Marina Bellucci", email: "info@vistiexpress.it", phone: "+39 06 4555888",
    address: "Via Cavour 76, 00184 Roma",
    services: "Visti turistici/business per Giappone, Cina, USA, Russia. Gestione completa pratica.",
    notes: "Tempi medi 7-10 gg lavorativi. Fee fissa + spese consolari.",
    createdAt: _clientStamp(60), updatedAt: _clientStamp(2), deletedAt: null,
  },
];

// ─── TASK TEMPLATES ────────────────────────────────────────────────────────
const TASK_TEMPLATES = [
  {
    id: "event-corp",
    name: "Evento corporate / Incentive",
    icon: "🎯",
    description: "Set completo per organizzare un viaggio incentive aziendale",
    tasks: [
      { title: "Briefing iniziale con cliente", category: "client", priority: "high", dayOffset: -45, estimatedHours: 2 },
      { title: "Proposta destinazioni e budget", category: "itinerary", priority: "high", dayOffset: -40, estimatedHours: 5 },
      { title: "Conferma destinazione cliente", category: "client", priority: "critical", dayOffset: -35, estimatedHours: 1 },
      { title: "Prenotazione voli gruppo", category: "booking", priority: "critical", dayOffset: -30, estimatedHours: 4 },
      { title: "Prenotazione hotel di gruppo", category: "hotel", priority: "high", dayOffset: -28, estimatedHours: 3 },
      { title: "Organizzazione transfer aeroportuali", category: "supplier", priority: "medium", dayOffset: -14, estimatedHours: 2 },
      { title: "Polizza viaggio gruppo", category: "admin", priority: "medium", dayOffset: -10, estimatedHours: 1 },
      { title: "Voucher e documenti ai partecipanti", category: "admin", priority: "high", dayOffset: -5, estimatedHours: 2 },
    ],
  },
  {
    id: "honeymoon",
    name: "Viaggio di nozze",
    icon: "💍",
    description: "Pacchetto completo per una luna di miele",
    tasks: [
      { title: "Consulenza preferenze coppia", category: "client", priority: "high", dayOffset: -90, estimatedHours: 2 },
      { title: "Proposta itinerario personalizzato", category: "itinerary", priority: "high", dayOffset: -75, estimatedHours: 5 },
      { title: "Conferma destinazione e budget", category: "client", priority: "critical", dayOffset: -60, estimatedHours: 1 },
      { title: "Prenotazione voli", category: "booking", priority: "critical", dayOffset: -55, estimatedHours: 2 },
      { title: "Prenotazione hotel/resort", category: "hotel", priority: "critical", dayOffset: -50, estimatedHours: 3 },
      { title: "Esperienze speciali (cene, escursioni)", category: "booking", priority: "high", dayOffset: -30, estimatedHours: 3 },
      { title: "Documenti viaggio e visti", category: "visa", priority: "high", dayOffset: -25, estimatedHours: 2 },
      { title: "Saldo finale e consegna voucher", category: "payment", priority: "high", dayOffset: -10, estimatedHours: 1 },
    ],
  },
  {
    id: "family",
    name: "Viaggio famiglia",
    icon: "👨‍👩‍👧",
    description: "Pacchetto vacanza per nucleo familiare",
    tasks: [
      { title: "Briefing famiglia e preferenze", category: "client", priority: "medium", dayOffset: -45, estimatedHours: 1.5 },
      { title: "Proposta destinazioni family-friendly", category: "itinerary", priority: "high", dayOffset: -40, estimatedHours: 3 },
      { title: "Prenotazione voli famiglia", category: "booking", priority: "high", dayOffset: -30, estimatedHours: 2 },
      { title: "Prenotazione hotel con servizi bambini", category: "hotel", priority: "high", dayOffset: -28, estimatedHours: 2 },
      { title: "Assicurazione viaggio", category: "admin", priority: "medium", dayOffset: -14, estimatedHours: 1 },
      { title: "Consegna documentazione completa", category: "admin", priority: "medium", dayOffset: -5, estimatedHours: 1 },
    ],
  },
  {
    id: "incoming",
    name: "Visita incoming / Ospitalità",
    icon: "🛬",
    description: "Accoglienza di un cliente o gruppo in arrivo",
    tasks: [
      { title: "Conferma arrivo e voli", category: "booking", priority: "high", dayOffset: -14, estimatedHours: 1 },
      { title: "Prenotazione transfer NCC", category: "supplier", priority: "high", dayOffset: -10, estimatedHours: 1 },
      { title: "Prenotazione hotel", category: "hotel", priority: "high", dayOffset: -10, estimatedHours: 1.5 },
      { title: "Programma esperienze/visite", category: "itinerary", priority: "medium", dayOffset: -7, estimatedHours: 3 },
      { title: "Prenotazione ristoranti", category: "supplier", priority: "medium", dayOffset: -5, estimatedHours: 1 },
      { title: "Welcome kit e brief operativo", category: "admin", priority: "medium", dayOffset: -2, estimatedHours: 1 },
    ],
  },
];

// ─── CONTEXT & REDUCER ─────────────────────────────────────────────────────
const AppContext = createContext(null);

// Mutazione in-place per mantenere il riferimento alle costanti TEAM/CATEGORIES
const _syncTeam = (newTeam) => { TEAM.length = 0; newTeam.forEach(m => TEAM.push(m)); };
const _syncCategories = (newCats) => {
  Object.keys(CATEGORIES).forEach(k => { delete CATEGORIES[k]; });
  Object.entries(newCats).forEach(([k, v]) => { CATEGORIES[k] = v; });
};

// Azioni che generano una voce nel log attività
const LOGGED_ACTIONS = new Set([
  "ADD_TASK", "ADD_TASKS_BULK", "UPDATE_TASK", "MOVE_TASK", "ADD_COMMENT",
  "DELETE_TASK", "RESTORE_TASK", "PURGE_TASK", "EMPTY_TRASH",
  "ADD_TEAM_MEMBER", "UPDATE_TEAM_MEMBER", "APPROVE_TEAM_MEMBER", "TOGGLE_TEAM_MEMBER_ACTIVE", "REMOVE_TEAM_MEMBER",
  "ADD_CATEGORY", "UPDATE_CATEGORY", "REMOVE_CATEGORY",
  "RESTORE_BACKUP",
  "ADD_NOTICE", "UPDATE_NOTICE", "DELETE_NOTICE",
  "ADD_CLIENT", "UPDATE_CLIENT", "DELETE_CLIENT",
  "ADD_SUPPLIER", "UPDATE_SUPPLIER", "DELETE_SUPPLIER",
]);

const buildLogEntry = (action, state) => {
  const t = action.type;
  const stamp = new Date().toISOString();
  const taskOf = id => state.tasks.find(x => x.id === id)?.title || id;
  const map = {
    ADD_TASK: () => `Creato task "${action.payload.title}"`,
    ADD_TASKS_BULK: () => `Creati ${action.payload.length} task in blocco`,
    UPDATE_TASK: () => `Aggiornato task "${taskOf(action.payload.id)}"`,
    MOVE_TASK: () => `Task "${taskOf(action.payload.taskId)}" spostato in ${STATUS_LABELS[action.payload.newStatus]}`,
    ADD_COMMENT: () => `Commento su "${taskOf(action.payload.taskId)}"`,
    DELETE_TASK: () => `Task "${taskOf(action.payload)}" nel cestino`,
    RESTORE_TASK: () => `Ripristinato task "${taskOf(action.payload)}"`,
    PURGE_TASK: () => `Eliminato definitivamente "${taskOf(action.payload)}"`,
    EMPTY_TRASH: () => `Cestino svuotato`,
    ADD_TEAM_MEMBER: () => `Aggiunto agente "${action.payload.name}"`,
    UPDATE_TEAM_MEMBER: () => `Modificato agente "${action.payload.name || action.payload.id}"`,
    APPROVE_TEAM_MEMBER: () => `Approvato agente "${getMember(action.payload)?.name || action.payload}"`,
    TOGGLE_TEAM_MEMBER_ACTIVE: () => `Agente "${getMember(action.payload)?.name || action.payload}" attivato/disattivato`,
    REMOVE_TEAM_MEMBER: () => `Rimosso agente "${getMember(action.payload)?.name || action.payload}"`,
    ADD_CATEGORY: () => `Aggiunta categoria "${action.payload.label}"`,
    UPDATE_CATEGORY: () => `Modificata categoria "${action.payload.key}"`,
    REMOVE_CATEGORY: () => `Rimossa categoria "${action.payload}"`,
    RESTORE_BACKUP: () => `Backup ripristinato`,
    ADD_NOTICE: () => `Pubblicato avviso in bacheca`,
    UPDATE_NOTICE: () => `Modificato avviso in bacheca`,
    DELETE_NOTICE: () => `Rimosso avviso dalla bacheca`,
    ADD_CLIENT: () => `Aggiunto cliente "${action.payload.name}"`,
    UPDATE_CLIENT: () => `Modificato cliente "${action.payload.name || action.payload.id}"`,
    DELETE_CLIENT: () => {
      const cl = (state.clients || []).find(c => c.id === action.payload);
      return `Cliente "${cl?.name || action.payload}" nel cestino`;
    },
    ADD_SUPPLIER: () => `Aggiunto fornitore "${action.payload.name}"`,
    UPDATE_SUPPLIER: () => `Modificato fornitore "${action.payload.name || action.payload.id}"`,
    DELETE_SUPPLIER: () => {
      const sp = (state.suppliers || []).find(s => s.id === action.payload);
      return `Fornitore "${sp?.name || action.payload}" nel cestino`;
    },
  };
  return { id: `log-${stamp}-${Math.random().toString(36).slice(2,7)}`, time: stamp, type: t, text: (map[t] || (() => t))() };
};

function baseReducer(state, action) {
  const uid = state.currentUserId;
  const _denied = (msg = "Non hai i permessi per questa azione") =>
    ({ ...state, toast: { message: msg, type: "error" } });

  switch (action.type) {
    case "SET_VIEW": {
      // Solo admin può aprire la vista Admin
      if (action.payload === "admin" && !canAccessAdmin(uid)) {
        return _denied("Non hai i permessi per accedere all'Admin");
      }
      // Driver non vede la vista Clienti
      if (action.payload === "clients" && !canViewClients(uid)) {
        return _denied("Non hai i permessi per accedere ai Clienti");
      }
      // Driver non vede la vista Fornitori (v0.9.7)
      if (action.payload === "suppliers" && !canViewSuppliers(uid)) {
        return _denied("Non hai i permessi per accedere ai Fornitori");
      }
      return { ...state, activeView: action.payload };
    }
    case "SET_SELECTED_TASK": {
      // Non permettere di aprire un task non visibile
      if (action.payload && !canViewTask(action.payload, uid)) {
        return _denied("Non hai i permessi per visualizzare questa task");
      }
      return { ...state, selectedTask: action.payload };
    }
    case "SET_SELECTED_CLIENT": {
      // Aperto/chiuso da Clienti view (e da chip cliente in TaskSlideOver)
      return { ...state, selectedClient: action.payload };
    }
    case "SET_SELECTED_SUPPLIER": {
      // Aperto/chiuso da Fornitori view (e da chip fornitore in TaskSlideOver) — v0.9.7
      return { ...state, selectedSupplier: action.payload };
    }
    case "SET_CURRENT_USER": {
      const newId = action.payload;
      const m = getMember(newId);
      if (!m) return state;
      _syncCurrentUser(newId);
      // Se l'utente non può più accedere alla view corrente, riporta a dashboard
      let activeView = state.activeView;
      if (activeView === "admin" && !canAccessAdmin(newId)) activeView = "dashboard";
      if (activeView === "clients" && !canViewClients(newId)) activeView = "dashboard";
      if (activeView === "suppliers" && !canViewSuppliers(newId)) activeView = "dashboard";
      return {
        ...state,
        currentUserId: newId,
        activeView,
        selectedTask: null,
        selectedClient: null,
        selectedSupplier: null,
        toast: { message: `Ora stai usando l'app come ${m.name} (${m.role})`, type: "success" },
      };
    }
    case "MOVE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload.taskId);
      if (!prev) return state;
      if (!canEditTask(prev, uid)) return _denied();
      const prevStatus = prev?.status;
      const tasks = state.tasks.map(t =>
        t.id === action.payload.taskId ? { ...t, status: action.payload.newStatus } : t
      );
      const toast = action.swipe
        ? { message: `✓ Spostato in "${STATUS_LABELS[action.payload.newStatus]}"`, type: "success", undoable: true }
        : { message: `Task spostato in "${STATUS_LABELS[action.payload.newStatus]}"`, type: "success" };
      const lastAction = action.swipe
        ? { type: "MOVE_TASK", taskId: action.payload.taskId, prevStatus }
        : state.lastAction;
      return { ...state, tasks, toast, lastAction };
    }
    case "ADD_TASK": {
      if (!canCreateTaskCategory(action.payload.category, uid)) {
        return _denied("Non puoi creare task di questa categoria");
      }
      const tasks = [action.payload, ...state.tasks];
      return { ...state, tasks, toast: { message: "Task creato con successo!", type: "success" } };
    }
    case "ADD_TASKS_BULK": {
      const bad = action.payload.find(t => !canCreateTaskCategory(t.category, uid));
      if (bad) return _denied("Alcune task hanno categorie che non puoi creare");
      const tasks = [...action.payload, ...state.tasks];
      return { ...state, tasks, toast: { message: `${action.payload.length} task creati!`, type: "success" } };
    }
    case "UPDATE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload.id);
      if (!prev) return state;
      if (!canEditTask(prev, uid)) return _denied();
      const tasks = state.tasks.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t);
      const selectedTask = state.selectedTask?.id === action.payload.id
        ? { ...state.selectedTask, ...action.payload }
        : state.selectedTask;
      const toast = action.swipe
        ? { message: action.toastMessage || "Task aggiornato!", type: "success", undoable: true }
        : { message: "Task aggiornato!", type: "success" };
      const lastAction = action.swipe && prev
        ? { type: "UPDATE_TASK", taskId: action.payload.id, prevSnapshot: prev }
        : state.lastAction;
      return { ...state, tasks, selectedTask, toast, lastAction };
    }
    case "ADD_COMMENT": {
      const prev = state.tasks.find(t => t.id === action.payload.taskId);
      if (!prev) return state;
      if (!canViewTask(prev, uid)) return _denied("Non puoi commentare questa task");
      const tasks = state.tasks.map(t =>
        t.id === action.payload.taskId
          ? { ...t, comments: [...(t.comments || []), action.payload.comment] }
          : t
      );
      const selectedTask = state.selectedTask?.id === action.payload.taskId
        ? { ...state.selectedTask, comments: [...(state.selectedTask.comments || []), action.payload.comment] }
        : state.selectedTask;
      return { ...state, tasks, selectedTask };
    }
    case "DELETE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload);
      if (!prev) return state;
      if (!canEditTask(prev, uid)) return _denied();
      const tasks = state.tasks.map(t =>
        t.id === action.payload ? { ...t, deletedAt: new Date().toISOString() } : t
      );
      const selectedTask = state.selectedTask?.id === action.payload ? null : state.selectedTask;
      const toast = action.swipe
        ? { message: "🗑️ Spostato nel cestino", type: "success", undoable: true }
        : { message: "Task spostato nel cestino", type: "success" };
      const lastAction = action.swipe
        ? { type: "DELETE_TASK", taskId: action.payload }
        : state.lastAction;
      return { ...state, tasks, selectedTask, toast, lastAction };
    }
    case "RESTORE_TASK": {
      if (!isAdmin(uid)) return _denied("Solo Admin può gestire il cestino");
      const tasks = state.tasks.map(t =>
        t.id === action.payload ? { ...t, deletedAt: null } : t
      );
      return { ...state, tasks, toast: { message: "Task ripristinato!", type: "success" } };
    }
    case "PURGE_TASK": {
      if (!isAdmin(uid)) return _denied("Solo Admin può gestire il cestino");
      const tasks = state.tasks.filter(t => t.id !== action.payload);
      return { ...state, tasks, toast: { message: "Task eliminato definitivamente", type: "success" } };
    }
    case "EMPTY_TRASH": {
      if (!isAdmin(uid)) return _denied("Solo Admin può svuotare il cestino");
      const count = state.tasks.filter(t => t.deletedAt).length;
      const tasks = state.tasks.filter(t => !t.deletedAt);
      return { ...state, tasks, toast: { message: `Cestino svuotato (${count} task eliminati)`, type: "success" } };
    }

    // ─── ADMIN: TEAM ───
    case "ADD_TEAM_MEMBER": {
      const team = [...state.team, action.payload];
      _syncTeam(team);
      return { ...state, team, toast: { message: `Agente "${action.payload.name}" aggiunto`, type: "success" } };
    }
    case "UPDATE_TEAM_MEMBER": {
      const team = state.team.map(m => m.id === action.payload.id ? { ...m, ...action.payload } : m);
      _syncTeam(team);
      return { ...state, team, toast: { message: "Agente aggiornato", type: "success" } };
    }
    case "APPROVE_TEAM_MEMBER": {
      const team = state.team.map(m => m.id === action.payload ? { ...m, pending: false, active: true } : m);
      _syncTeam(team);
      return { ...state, team, toast: { message: "Agente approvato e attivato!", type: "success" } };
    }
    case "TOGGLE_TEAM_MEMBER_ACTIVE": {
      const team = state.team.map(m => m.id === action.payload ? { ...m, active: !m.active } : m);
      _syncTeam(team);
      const target = team.find(m => m.id === action.payload);
      return { ...state, team, toast: { message: target?.active ? "Agente attivato" : "Agente disattivato", type: "success" } };
    }
    case "REMOVE_TEAM_MEMBER": {
      // Non rimuove davvero se ha task assegnati: si limita a disattivare e segnare pending=false
      const team = state.team.filter(m => m.id !== action.payload);
      _syncTeam(team);
      return { ...state, team, toast: { message: "Agente rimosso", type: "success" } };
    }

    // ─── ADMIN: CATEGORIES ───
    case "ADD_CATEGORY": {
      const { key, ...rest } = action.payload;
      const categories = { ...state.categories, [key]: rest };
      _syncCategories(categories);
      return { ...state, categories, toast: { message: `Categoria "${rest.label}" aggiunta`, type: "success" } };
    }
    case "UPDATE_CATEGORY": {
      const { key, ...rest } = action.payload;
      const categories = { ...state.categories, [key]: { ...state.categories[key], ...rest } };
      _syncCategories(categories);
      return { ...state, categories, toast: { message: "Categoria aggiornata", type: "success" } };
    }
    case "REMOVE_CATEGORY": {
      const { [action.payload]: _, ...rest } = state.categories;
      _syncCategories(rest);
      return { ...state, categories: rest, toast: { message: "Categoria rimossa", type: "success" } };
    }

    // ─── ADMIN: AGENZIA & BACKUP ───
    case "SET_AGENCY_NAME": {
      return { ...state, agencyName: action.payload };
    }
    case "RESTORE_BACKUP": {
      const { tasks, team, categories, agencyName, notices, clients, suppliers } = action.payload;
      if (team) _syncTeam(team);
      if (categories) _syncCategories(categories);
      return {
        ...state,
        tasks: tasks ?? state.tasks,
        team: team ?? state.team,
        categories: categories ?? state.categories,
        agencyName: agencyName ?? state.agencyName,
        notices: notices ?? state.notices,
        clients: clients ?? state.clients,
        suppliers: suppliers ?? state.suppliers,
        toast: { message: "Backup ripristinato con successo!", type: "success" }
      };
    }
    case "CLEAR_ACTIVITY_LOG": {
      return { ...state, activityLog: [], toast: { message: "Log attività svuotato", type: "success" } };
    }

    // ─── BACHECA AVVISI ───
    case "ADD_NOTICE": {
      const notices = [action.payload, ...state.notices];
      return { ...state, notices, toast: { message: "Avviso pubblicato in bacheca", type: "success" } };
    }
    case "UPDATE_NOTICE": {
      const notices = state.notices.map(n =>
        n.id === action.payload.id
          ? { ...n, ...action.payload, updatedAt: new Date().toISOString() }
          : n
      );
      return { ...state, notices, toast: { message: "Avviso aggiornato", type: "success" } };
    }
    case "DELETE_NOTICE": {
      const notices = state.notices.filter(n => n.id !== action.payload);
      return { ...state, notices, toast: { message: "Avviso rimosso dalla bacheca", type: "success" } };
    }
    case "TOGGLE_PIN_NOTICE": {
      const notices = state.notices.map(n =>
        n.id === action.payload ? { ...n, pinned: !n.pinned } : n
      );
      return { ...state, notices };
    }

    // ─── CLIENTI (v0.9.5) ───
    case "ADD_CLIENT": {
      if (!canManageClients(uid)) return _denied("Non puoi gestire i clienti");
      const now = new Date().toISOString();
      const client = { createdAt: now, updatedAt: now, deletedAt: null, ...action.payload };
      const clients = [client, ...(state.clients || [])];
      return { ...state, clients, toast: { message: `Cliente "${client.name}" aggiunto`, type: "success" } };
    }
    case "UPDATE_CLIENT": {
      if (!canManageClients(uid)) return _denied("Non puoi gestire i clienti");
      const now = new Date().toISOString();
      const clients = (state.clients || []).map(c =>
        c.id === action.payload.id ? { ...c, ...action.payload, updatedAt: now } : c
      );
      return { ...state, clients, toast: { message: "Cliente aggiornato", type: "success" } };
    }
    case "DELETE_CLIENT": {
      if (!canManageClients(uid)) return _denied("Non puoi gestire i clienti");
      // Soft-delete: i task collegati restano (mantengono il nome legacy nel campo `client`),
      // ma il riferimento `clientId` resta utile se il cliente viene ripristinato in futuro.
      const clients = (state.clients || []).map(c =>
        c.id === action.payload ? { ...c, deletedAt: new Date().toISOString() } : c
      );
      return { ...state, clients, toast: { message: "Cliente rimosso", type: "success" } };
    }

    // ─── FORNITORI (v0.9.7) ───
    case "ADD_SUPPLIER": {
      if (!canManageSuppliers(uid)) return _denied("Non puoi gestire i fornitori");
      const now = new Date().toISOString();
      const supplier = { createdAt: now, updatedAt: now, deletedAt: null, ...action.payload };
      const suppliers = [supplier, ...(state.suppliers || [])];
      return { ...state, suppliers, toast: { message: `Fornitore "${supplier.name}" aggiunto`, type: "success" } };
    }
    case "UPDATE_SUPPLIER": {
      if (!canManageSuppliers(uid)) return _denied("Non puoi gestire i fornitori");
      const now = new Date().toISOString();
      const suppliers = (state.suppliers || []).map(s =>
        s.id === action.payload.id ? { ...s, ...action.payload, updatedAt: now } : s
      );
      return { ...state, suppliers, toast: { message: "Fornitore aggiornato", type: "success" } };
    }
    case "DELETE_SUPPLIER": {
      if (!canManageSuppliers(uid)) return _denied("Non puoi gestire i fornitori");
      const suppliers = (state.suppliers || []).map(s =>
        s.id === action.payload ? { ...s, deletedAt: new Date().toISOString() } : s
      );
      return { ...state, suppliers, toast: { message: "Fornitore rimosso", type: "success" } };
    }

    case "CLEAR_TOAST": return { ...state, toast: null };
    case "UNDO_LAST_ACTION": {
      const la = state.lastAction;
      if (!la) return state;
      if (la.type === "MOVE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? { ...t, status: la.prevStatus } : t);
        return { ...state, tasks, toast: { message: "Azione annullata", type: "success" }, lastAction: null };
      }
      if (la.type === "DELETE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? { ...t, deletedAt: null } : t);
        return { ...state, tasks, toast: { message: "Azione annullata", type: "success" }, lastAction: null };
      }
      if (la.type === "UPDATE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? la.prevSnapshot : t);
        const selectedTask = state.selectedTask?.id === la.taskId ? la.prevSnapshot : state.selectedTask;
        return { ...state, tasks, selectedTask, toast: { message: "Azione annullata", type: "success" }, lastAction: null };
      }
      return state;
    }
    case "SET_SEARCH": return { ...state, searchQuery: action.payload };
    case "TOGGLE_NOTIF": return { ...state, showNotif: !state.showNotif };
    case "SET_FILTER": return { ...state, filters: { ...state.filters, ...action.payload } };
    case "TOGGLE_SIDEBAR": return { ...state, sidebarCollapsed: !state.sidebarCollapsed };

    // ─── PROFILO PERSONALE (non admin-only) ───
    case "UPDATE_OWN_PROFILE": {
      const uid = state.currentUserId;
      const { name, avatar, color, email, phone, photoUrl } = action.payload;
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (avatar !== undefined) updates.avatar = avatar;
      if (color !== undefined) updates.color = color;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (photoUrl !== undefined) updates.photoUrl = photoUrl;
      const team = state.team.map(m => m.id === uid ? { ...m, ...updates } : m);
      _syncTeam(team);
      return { ...state, team, toast: { message: "Profilo aggiornato!", type: "success" } };
    }

    default: return state;
  }
}

// Azioni che richiedono ruolo Admin (vedono pre-check nel wrapper sotto)
const ADMIN_ONLY_ACTIONS = new Set([
  "ADD_TEAM_MEMBER", "UPDATE_TEAM_MEMBER", "APPROVE_TEAM_MEMBER",
  "TOGGLE_TEAM_MEMBER_ACTIVE", "REMOVE_TEAM_MEMBER",
  "ADD_CATEGORY", "UPDATE_CATEGORY", "REMOVE_CATEGORY",
  "SET_AGENCY_NAME", "RESTORE_BACKUP", "CLEAR_ACTIVITY_LOG",
]);

// Wrapper che aggiunge automaticamente al log le azioni rilevanti
function reducer(state, action) {
  // Pre-check permessi Admin (centralizzato — non sporca i singoli case)
  if (ADMIN_ONLY_ACTIONS.has(action.type) && !isAdmin(state.currentUserId)) {
    return { ...state, toast: { message: "Solo Admin può eseguire questa azione", type: "error" } };
  }
  const next = baseReducer(state, action);
  if (LOGGED_ACTIONS.has(action.type) && next !== state) {
    const entry = buildLogEntry(action, state);
    const activityLog = [entry, ...(next.activityLog || [])].slice(0, 100);
    return { ...next, activityLog };
  }
  return next;
}

const NOTICE_COLORS = ["#FEF3C7", "#FCE7F3", "#D1FAE5", "#DBEAFE", "#E9D5FF"]; // giallo, rosa, verde, azzurro, lilla

const INITIAL_NOTICES = [
  {
    id: "n1",
    text: "📅 Riunione settimanale del team\nLunedì ore 9:30 in sala riunioni — agenda condivisa via mail.",
    color: "#FEF3C7",
    author: "marco",
    pinned: true,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "n2",
    text: "🌞 Promo Summer attiva!\nSconti -15% su pacchetti Grecia/Croazia fino al 30 Giugno. Riferimento offerta: SUMMER26.",
    color: "#FCE7F3",
    author: "sofia",
    pinned: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "n3",
    text: "🏨 Nuovo fornitore confermato\nAegean Hotels Group - vedere allegato in mail di Roberto per tariffe nette 2026.",
    color: "#D1FAE5",
    author: "roberto",
    pinned: false,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
];

const initialState = {
  tasks: INITIAL_TASKS,
  team: TEAM,
  categories: CATEGORIES,
  clients: INITIAL_CLIENTS, // v0.9.5: anagrafica clienti CRM
  suppliers: INITIAL_SUPPLIERS, // v0.9.7: anagrafica fornitori
  agencyName: "VoyageDesk",
  notices: INITIAL_NOTICES,
  activityLog: [],
  activeView: "dashboard",
  selectedTask: null,
  selectedClient: null, // v0.9.5: cliente aperto in scheda modificabile
  selectedSupplier: null, // v0.9.7: fornitore aperto in scheda modificabile
  toast: null,
  searchQuery: "",
  showNotif: false,
  sidebarCollapsed: false,
  filters: { assignee: "", category: "", priority: "", status: "", client: "" },
  lastAction: null, // { type, payload, undo: () => state-patch } per swipe-actions undo
  currentUserId: CURRENT_USER, // v0.8: utente loggato (con switcher in Topbar)
};

// ─── UTILS ─────────────────────────────────────────────────────────────────
const getMember = id => TEAM.find(m => m.id === id);
// Agenti selezionabili come assegnatari (attivi e non in attesa di approvazione)
const getAssignableTeam = () => TEAM.filter(m => m.active !== false && !m.pending);
const formatDate = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};
const formatTime = iso => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};
const isOverdue = task => task.status !== "done" && task.dueDate && new Date(task.dueDate) < new Date();
const getDayKey = iso => iso ? new Date(iso).toDateString() : null;
const isActiveTask = t => !t.deletedAt;
const getActiveTasks = tasks => tasks.filter(isActiveTask);
const getTrashedTasks = tasks => tasks.filter(t => t.deletedAt);

// ─── CLIENTI: utils (v0.9.5) ───
// `clients` arriva da state.clients in scope chiamante — qui i lookup operano su un array.
const getClient = (clients, id) => (clients || []).find(c => c?.id === id);
// Restituisce il nome visualizzabile dato un task: prima cerca clientId nella anagrafica,
// poi fallback sul campo legacy `task.client` (testo), poi su una stringa vuota.
const getTaskClientName = (task, clients) => {
  if (!task) return "";
  const byId = task.clientId ? getClient(clients, task.clientId) : null;
  if (byId) return byId.name;
  return task.client || "";
};
// Risolve via mappa legacy: se un task ha solo il vecchio campo `client` testo
// e il nome è uno noto, ne ricaviamo l'ID. Utile in pochi punti di compatibilità.
const resolveLegacyClientId = (task) => {
  if (!task) return null;
  if (task.clientId) return task.clientId;
  if (task.client && _LEGACY_CLIENT_NAME_TO_ID[task.client]) return _LEGACY_CLIENT_NAME_TO_ID[task.client];
  return null;
};

// ─── FORNITORI: utils (v0.9.7) ───
const getSupplier = (suppliers, id) => (suppliers || []).find(s => s?.id === id);

// ─── PERMESSI (v0.8) ──────────────────────────────────────────────────────
// Ruoli logici derivati dal campo `role` del team member.
// - Admin       → tutto
// - Manager     → come Senior/Junior Agent (gestione propria coda + globale + visualizza urgenti altrui)
// - Senior/Junior Agent → idem Manager
// - Driver      → solo task categoria "transfer", solo coda personale
const getRoleType = (userId) => {
  const m = getMember(userId);
  if (!m) return "agent";
  const r = (m.role || "").toLowerCase();
  if (r.includes("admin")) return "admin";
  if (r.includes("driver")) return "driver";
  if (r.includes("manager")) return "manager";
  return "agent"; // senior/junior agent
};

const isAdmin = (userId) => getRoleType(userId) === "admin";
const isDriver = (userId) => getRoleType(userId) === "driver";

// Task è "mio" se sono nell'array assignees
const isMyTask = (task, userId) => task.assignees?.includes(userId);

// Task è "in coda globale" se non ha assegnatari
const isInGlobalQueue = (task) => !task.assignees || task.assignees.length === 0;

// Task è "urgente" (< 24h alla scadenza, non ancora done)
const HOURS_24 = 24 * 60 * 60 * 1000;
const isUrgent = (task) => {
  if (!task.dueDate || task.status === "done") return false;
  const diff = new Date(task.dueDate).getTime() - Date.now();
  return diff >= 0 && diff <= HOURS_24;
};
// (Nota: gli scaduti — diff < 0 — non sono considerati "urgenti < 24h": già visibili come overdue di chi li ha)

// Può visualizzare il task?
const canViewTask = (task, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") {
    // Solo le proprie task transfer
    return isMyTask(task, userId);
  }
  // manager/agent: proprie + globali + urgenti altrui
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  if (isUrgent(task)) return true;
  return false;
};

// Può modificare il task?
const canEditTask = (task, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") {
    return task.category === "transfer" && (isMyTask(task, userId) || isInGlobalQueue(task));
  }
  // manager/agent: proprie + globali (non urgenti altrui — quelli sono read-only)
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  return false;
};

// Può creare un task con questa categoria?
const canCreateTaskCategory = (category, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") return category === "transfer";
  return true; // manager/agent: tutte le categorie
};

// Può accedere all'Admin?
const canAccessAdmin = (userId) => isAdmin(userId);

// Può gestire l'anagrafica clienti (CRUD)? (v0.9.5)
// Driver no: vede solo i clienti delle proprie transfer task in read-only via TaskSlideOver.
const canManageClients = (userId) => !isDriver(userId);
// Può vedere la vista Clienti? (v0.9.5)
const canViewClients = (userId) => !isDriver(userId);

// Può gestire l'anagrafica fornitori (CRUD)? (v0.9.7)
// Stessa regola dei clienti: tutti tranne Driver.
const canManageSuppliers = (userId) => !isDriver(userId);
const canViewSuppliers = (userId) => !isDriver(userId);

// Categorie selezionabili nei form per questo utente
const getAvailableCategories = (userId) => {
  if (isDriver(userId)) {
    return { transfer: CATEGORIES.transfer };
  }
  return CATEGORIES;
};

// Filtra una lista di task secondo le regole di visibilità
const getVisibleTasks = (tasks, userId) => tasks.filter(t => canViewTask(t, userId));

// ─── SWIPE ACTIONS (mobile/tablet) ─────────────────────────────────────────
// Wrapper riusabile: swipe verso destra rivela 3 bottoni (Completato / Cestino / Inoltra).
// Soglia 40% larghezza card → si "blocca aperto". Tap fuori chiude.
// Su desktop è trasparente. Disabilitato anche se l'utente non può editare la task.
const SwipeActions = ({ task, dispatch, children, disabled = false }) => {
  const { isDesktop } = useViewport();
  const [offset, setOffset] = useState(0);          // px di traslazione attuale
  const [opened, setOpened] = useState(false);      // stato "aperto" (bottoni visibili)
  const [showForward, setShowForward] = useState(false);
  const containerRef = useRef(null);
  const startX = useRef(null);
  const startY = useRef(null);
  const tracking = useRef(false);
  const containerWidth = useRef(0);

  const OPEN_WIDTH = 210; // larghezza pannello bottoni rivelato (3 bottoni × 70)

  // Disabilita su desktop / disabilitato esplicitamente / no permessi di edit (v0.8)
  // Leggo il currentUserId dal globale (sincronizzato dal reducer).
  const canEdit = canEditTask(task, CURRENT_USER);
  const swipeEnabled = !isDesktop && !disabled && canEdit;

  // tap fuori per chiudere
  useEffect(() => {
    if (!opened) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpened(false);
        setOffset(0);
        setShowForward(false);
      }
    };
    document.addEventListener("touchstart", handler, { passive: true });
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("mousedown", handler);
    };
  }, [opened]);

  const onTouchStart = (e) => {
    if (!swipeEnabled) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    tracking.current = false;
    containerWidth.current = containerRef.current?.offsetWidth || 300;
  };

  const onTouchMove = (e) => {
    if (!swipeEnabled || startX.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    // determina se è uno swipe orizzontale (più orizzontale che verticale)
    if (!tracking.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        tracking.current = true;
      } else {
        startX.current = null;
        return;
      }
    }

    // permetti solo swipe destro (dx > 0), max OPEN_WIDTH (+ piccolo overshoot)
    const newOffset = Math.max(0, Math.min(dx, OPEN_WIDTH + 30));
    setOffset(newOffset);
  };

  const onTouchEnd = () => {
    if (!swipeEnabled || startX.current === null) {
      startX.current = null;
      return;
    }
    const threshold = containerWidth.current * 0.4;
    if (offset >= threshold) {
      setOffset(OPEN_WIDTH);
      setOpened(true);
    } else {
      setOffset(0);
      setOpened(false);
    }
    startX.current = null;
    tracking.current = false;
  };

  const closeAndDo = (fn) => {
    setOpened(false);
    setOffset(0);
    setShowForward(false);
    setTimeout(fn, 50);
  };

  const handleComplete = (e) => {
    e.stopPropagation();
    closeAndDo(() => dispatch({ type: "MOVE_TASK", payload: { taskId: task.id, newStatus: "done" }, swipe: true }));
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    closeAndDo(() => dispatch({ type: "DELETE_TASK", payload: task.id, swipe: true }));
  };

  const handleForwardToggle = (e) => {
    e.stopPropagation();
    setShowForward(s => !s);
  };

  const handleForwardTo = (e, memberId) => {
    e.stopPropagation();
    const member = getMember(memberId);
    closeAndDo(() => dispatch({
      type: "UPDATE_TASK",
      payload: { id: task.id, assignees: [memberId] },
      swipe: true,
      toastMessage: `↪ Inoltrato a ${member?.name || memberId}`,
    }));
  };

  if (!swipeEnabled) {
    return <>{children}</>;
  }

  const assignable = getAssignableTeam();

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", overflow: "visible", touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pannello bottoni sotto la card (rivelato da sinistra) */}
      {offset > 0 && (
        <div
          style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: OPEN_WIDTH, display: "flex",
            borderRadius: 10, overflow: "hidden",
            boxShadow: "inset 0 0 0 1px var(--border)",
          }}
        >
          {/* Completato */}
          <button
            onClick={handleComplete}
            aria-label="Completato"
            style={{
              flex: 1, background: "var(--success)", color: "#fff", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px",
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            <span>Fatto</span>
          </button>
          {/* Cestino */}
          <button
            onClick={handleDelete}
            aria-label="Cestino"
            style={{
              flex: 1, background: "var(--danger)", color: "#fff", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px",
            }}
          >
            <span style={{ fontSize: 20 }}>🗑</span>
            <span>Cestino</span>
          </button>
          {/* Inoltra */}
          <button
            onClick={handleForwardToggle}
            aria-label="Inoltra"
            style={{
              flex: 1, background: "var(--gold)", color: "var(--navy)", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px", position: "relative",
            }}
          >
            <span style={{ fontSize: 18 }}>↪</span>
            <span>Inoltra</span>
          </button>
        </div>
      )}

      {/* Forward menu (lista agenti) */}
      {showForward && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            zIndex: 30, background: "#fff",
            border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            minWidth: 200, maxHeight: 240, overflowY: "auto",
            padding: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", padding: "6px 10px 4px", letterSpacing: 0.5 }}>
            INOLTRA A
          </div>
          {assignable.map(m => (
            <button
              key={m.id}
              onClick={e => handleForwardTo(e, m.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", background: "transparent", border: "none",
                borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                color: "var(--text)", textAlign: "left",
              }}
              onMouseDown={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseUp={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar memberId={m.id} size={26} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Card traslata */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: tracking.current ? "none" : "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)",
          position: "relative",
          zIndex: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ─── AVATAR ────────────────────────────────────────────────────────────────
const Avatar = ({ memberId, size = 28 }) => {
  const m = getMember(memberId);
  if (!m) return null;
  if (m.photoUrl) {
    return (
      <img src={m.photoUrl} alt={m.name} title={m.name} style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", flexShrink: 0, border: "2px solid white",
      }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: m.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 600, color: "#fff",
      flexShrink: 0, border: "2px solid white",
    }} title={m.name}>{m.avatar}</div>
  );
};

// ─── PRIORITY BADGE ────────────────────────────────────────────────────────
const PriorityBadge = ({ priority }) => {
  const p = PRIORITIES[priority] || PRIORITIES.medium;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: p.bg, color: p.color, letterSpacing: 0.3
    }}>{p.label}</span>
  );
};

// ─── CATEGORY CHIP ─────────────────────────────────────────────────────────
const CategoryChip = ({ category, small }) => {
  const c = CATEGORIES[category] || CATEGORIES.admin;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: small ? 11 : 12, fontWeight: 500,
      padding: small ? "2px 6px" : "3px 8px", borderRadius: 99,
      background: c.bg, color: c.color,
    }}>{c.icon} {c.label}</span>
  );
};

// ─── STATUS BADGE ──────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
    background: STATUS_COLORS[status] + "20", color: STATUS_COLORS[status]
  }}>{STATUS_LABELS[status]}</span>
);

// ─── TOAST ─────────────────────────────────────────────────────────────────
const Toast = ({ toast, dispatch }) => {
  const { isDesktop } = useViewport();
  useEffect(() => {
    if (!toast) return;
    const duration = toast.undoable ? 5000 : 3000;
    const t = setTimeout(() => dispatch({ type: "CLEAR_TOAST" }), duration);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  const handleUndo = () => {
    dispatch({ type: "UNDO_LAST_ACTION" });
  };
  return (
    <div style={{
      position: "fixed", bottom: isDesktop ? 24 : 80, left: "50%", transform: "translateX(-50%)",
      background: toast.type === "success" ? "#0F2044" : "#C0392B",
      color: "#fff", padding: "10px 16px 10px 20px", borderRadius: 10,
      fontSize: 14, fontWeight: 500, zIndex: 9999, boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
      animation: "toastIn 0.3s ease", display: "flex", alignItems: "center", gap: 12,
      whiteSpace: "nowrap", maxWidth: "calc(100vw - 24px)",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>{toast.type === "success" ? "✓" : "✗"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{toast.message}</span>
      </span>
      {toast.undoable && (
        <button
          onClick={handleUndo}
          style={{
            background: "var(--gold)", color: "var(--navy)", border: "none",
            padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3, flexShrink: 0,
          }}
        >↶ Annulla</button>
      )}
    </div>
  );
};

// ─── ADVANCED SEARCH PANEL ─────────────────────────────────────────────────
const AdvancedSearchPanel = ({ tasks, dispatch, onClose }) => {
  const { isMobile } = useViewport();
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cats, setCats] = useState([]);
  const [stats, setStats] = useState([]);
  const [agents, setAgents] = useState([]);
  const [includeTrashed, setIncludeTrashed] = useState(false);

  const panelRef = useRef(null);
  const keywordRef = useRef(null);

  useEffect(() => { keywordRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const toggle = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const resetAll = () => {
    setKeyword(""); setDateFrom(""); setDateTo("");
    setCats([]); setStats([]); setAgents([]); setIncludeTrashed(false);
  };

  const hasFilters = keyword.trim() || dateFrom || dateTo || cats.length || stats.length || agents.length || includeTrashed;

  const results = useMemo(() => {
    if (!hasFilters) return [];
    const k = keyword.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? (() => { const d = new Date(dateTo); d.setHours(23,59,59,999); return d; })() : null;

    return tasks.filter(t => {
      if (!includeTrashed && t.deletedAt) return false;
      if (cats.length && !cats.includes(t.category)) return false;
      if (stats.length && !stats.includes(t.status)) return false;
      if (agents.length && !(t.assignees || []).some(a => agents.includes(a))) return false;
      if (from) {
        if (!t.dueDate) return false;
        if (new Date(t.dueDate) < from) return false;
      }
      if (to) {
        if (!t.dueDate) return false;
        if (new Date(t.dueDate) > to) return false;
      }
      if (k) {
        const hay = [
          t.title || "",
          t.description || "",
          t.client || "",
          ...(t.comments || []).map(c => c.text || ""),
        ].join(" ").toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    }).sort((a,b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [tasks, keyword, dateFrom, dateTo, cats, stats, agents, includeTrashed, hasFilters]);

  const openTask = (t) => {
    dispatch({ type: "SET_SELECTED_TASK", payload: t });
    onClose();
  };

  const chipBase = (active, color) => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: `1px solid ${active ? color : "var(--border)"}`,
    background: active ? color : "#fff",
    color: active ? "#fff" : "var(--text)",
    transition: "all 0.15s", userSelect: "none",
  });

  const sectionTitle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 };

  return (
    <div
      ref={panelRef}
      className="fade-in"
      style={{
        position: isMobile ? "fixed" : "absolute",
        top: isMobile ? 64 : "calc(100% + 8px)",
        left: isMobile ? 8 : 0,
        right: isMobile ? 8 : "auto",
        width: isMobile ? "auto" : 680, maxHeight: "calc(100vh - 80px)", overflow: "hidden",
        background: "var(--surface)", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        border: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        zIndex: 200,
      }}
    >
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#fff",
      }}>
        <div className="playfair" style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
          🎛️ Ricerca avanzata
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {hasFilters && (
            <button onClick={resetAll} style={{
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "var(--text-muted)",
              cursor: "pointer", fontWeight: 500,
            }}>Reset</button>
          )}
          <button onClick={onClose} style={{
            background: "transparent", border: "none", fontSize: 18,
            cursor: "pointer", color: "var(--text-muted)", lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", overflowY: "auto", maxHeight: 380 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Parola chiave</div>
          <input
            ref={keywordRef}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="Cerca in titolo, descrizione, cliente, commenti..."
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8,
              border: "1px solid var(--border)", fontSize: 13, outline: "none",
              fontFamily: "inherit", boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = "var(--gold)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Scadenza</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Da</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
                width: "100%", padding: "7px 10px", borderRadius: 6,
                border: "1px solid var(--border)", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>A</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
                width: "100%", padding: "7px 10px", borderRadius: 6,
                border: "1px solid var(--border)", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Categoria</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(CATEGORIES).map(([key, c]) => {
              const active = cats.includes(key);
              return (
                <div key={key} onClick={() => toggle(cats, setCats, key)} style={chipBase(active, c.color)}>
                  <span>{c.icon}</span>{c.label}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Status</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STATUSES.map(s => {
              const active = stats.includes(s);
              return (
                <div key={s} onClick={() => toggle(stats, setStats, s)} style={chipBase(active, STATUS_COLORS[s])}>
                  {STATUS_LABELS[s]}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Agente</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TEAM.filter(m => !m.pending).map(m => {
              const active = agents.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggle(agents, setAgents, m.id)} style={chipBase(active, m.color)}>
                  <span style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: active ? "rgba(255,255,255,0.25)" : m.color,
                    color: "#fff", fontSize: 9, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>{m.avatar}</span>
                  {m.name.split(" ")[0]}
                </div>
              );
            })}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text)" }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          🗑️ Includi task nel cestino
        </label>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#fff", maxHeight: 320 }}>
        {!hasFilters && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Imposta uno o più filtri per iniziare la ricerca
          </div>
        )}
        {hasFilters && results.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Nessun task corrisponde ai filtri
          </div>
        )}
        {hasFilters && results.length > 0 && (
          <>
            <div style={{
              padding: "8px 18px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: 1, background: "var(--surface2)",
              borderBottom: "1px solid var(--border)", position: "sticky", top: 0,
            }}>
              {results.length} {results.length === 1 ? "risultato" : "risultati"}
            </div>
            {results.map(t => {
              const cat = CATEGORIES[t.category];
              const prio = PRIORITIES[t.priority];
              const overdue = isOverdue(t);
              return (
                <div
                  key={t.id}
                  onClick={() => openTask(t)}
                  style={{
                    padding: "10px 18px", borderBottom: "1px solid var(--border)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                    transition: "background 0.15s",
                    opacity: t.deletedAt ? 0.6 : 1,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: cat.bg, color: cat.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0,
                  }}>{cat.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "var(--text)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {t.deletedAt && <span style={{ color: "var(--danger)", marginRight: 6 }}>🗑️</span>}
                      {t.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 10 }}>
                      <span>{STATUS_LABELS[t.status]}</span>
                      {t.client && <span>• {t.client}</span>}
                      {t.dueDate && (
                        <span style={{ color: overdue ? "var(--danger)" : "var(--text-muted)" }}>
                          • {formatDate(t.dueDate)}{overdue ? " (scaduto)" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                    background: prio.bg, color: prio.color, flexShrink: 0,
                  }}>{prio.label}</div>
                  <div style={{ display: "flex", marginLeft: 4 }}>
                    {(t.assignees || []).slice(0, 3).map((aid, i) => (
                      <div key={aid} style={{ marginLeft: i ? -6 : 0 }}>
                        <Avatar memberId={aid} size={22} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

// ─── TOPBAR ────────────────────────────────────────────────────────────────
const Topbar = ({ state, dispatch, onOpenChat, unreadChat }) => {
  const { isMobile } = useViewport();
  const unread = NOTIFICATIONS.filter(n => !n.read).length;
  const [advOpen, setAdvOpen] = useState(false);
  return (
    <div style={{
      height: 58, background: "var(--navy)", display: "flex", alignItems: "center",
      padding: isMobile ? "0 12px" : "0 20px", gap: isMobile ? 8 : 16, position: "sticky", top: 0, zIndex: 100,
      borderBottom: "1px solid rgba(212,168,67,0.2)", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: isMobile ? 0 : 12 }}>
        <div style={{
          width: 32, height: 32, background: "var(--gold)", borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0
        }}>✈️</div>
        <div className="vd-hide-mobile">
          <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>VoyageDesk</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 1.5 }}>TRAVEL MANAGEMENT</div>
        </div>
      </div>

      {/* Search + Advanced */}
      <div style={{ flex: 1, maxWidth: 520, position: "relative", display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>🔍</div>
          <input
            value={state.searchQuery}
            onChange={e => dispatch({ type: "SET_SEARCH", payload: e.target.value })}
            placeholder={isMobile ? "Cerca..." : "Cerca task, clienti, categorie... (Ctrl+K)"}
            style={{
              width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, padding: "7px 12px 7px 36px", color: "#fff", fontSize: 13,
              outline: "none", transition: "all 0.2s", boxSizing: "border-box",
            }}
            onFocus={e => { e.target.style.background = "rgba(255,255,255,0.13)"; e.target.style.borderColor = "var(--gold)"; }}
            onBlur={e => { e.target.style.background = "rgba(255,255,255,0.08)"; e.target.style.borderColor = "rgba(255,255,255,0.15)"; }}
          />
        </div>
        <button
          onClick={() => setAdvOpen(o => !o)}
          title="Ricerca avanzata"
          aria-label="Apri ricerca avanzata"
          style={{
            background: advOpen ? "var(--gold)" : "rgba(255,255,255,0.08)",
            border: `1px solid ${advOpen ? "var(--gold)" : "rgba(255,255,255,0.15)"}`,
            borderRadius: 8, width: 36, height: 34, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, flexShrink: 0, transition: "all 0.2s",
          }}
        >🎛️</button>
        {advOpen && (
          <AdvancedSearchPanel
            tasks={state.tasks}
            dispatch={dispatch}
            onClose={() => setAdvOpen(false)}
          />
        )}
      </div>

      <div className="vd-hide-mobile" style={{ flex: 1 }} />

      {/* Chat */}
      <button onClick={onOpenChat} title="Messaggi team" style={{
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8, width: 36, height: 36, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative"
      }}>
        💬
        {unreadChat > 0 && <span style={{
          position: "absolute", top: -4, right: -4, background: "var(--gold)",
          borderRadius: "50%", minWidth: 16, height: 16, fontSize: 10, fontWeight: 700,
          color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px",
        }}>{unreadChat}</span>}
      </button>

      {/* Notifications */}
      <div style={{ position: "relative" }}>
        <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, width: 36, height: 36, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative"
        }}>
          🔔
          {unread > 0 && <span style={{
            position: "absolute", top: -4, right: -4, background: "var(--gold)",
            borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700,
            color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center"
          }}>{unread}</span>}
        </button>
        {state.showNotif && <NotificationsPanel dispatch={dispatch} />}
      </div>

      {/* User switcher (v0.8) */}
      <UserSwitcher state={state} dispatch={dispatch} />
    </div>
  );
};

// ─── USER SWITCHER (v0.8) ──────────────────────────────────────────────────
// Dropdown nella Topbar per cambiare l'utente loggato (mock multi-utente).
// ─── PROFILE EDITOR ───────────────────────────────────────────────────────
const AVATAR_EMOJIS = ["😊", "😎", "🧑‍💼", "👩‍💻", "🧑‍✈️", "👨‍🔧", "🦸", "🌟", "🎯", "🚀", "✈️", "🏝️"];
const AVATAR_COLORS = ["#0F2044", "#2D7A4F", "#C8832A", "#7B4F9E", "#C0392B", "#0EA5E9", "#DB2777", "#059669", "#6366F1", "#EA580C", "#0891B2", "#4F46E5"];

const ProfileEditor = ({ member, dispatch, onClose }) => {
  const { isMobile } = useViewport();
  const [name, setName] = useState(member.name || "");
  const [avatar, setAvatar] = useState(member.avatar || "");
  const [color, setColor] = useState(member.color || "#0F2044");
  const [email, setEmail] = useState(member.email || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [photoUrl, setPhotoUrl] = useState(member.photoUrl || "");
  const [avatarMode, setAvatarMode] = useState(member.photoUrl ? "photo" : "emoji"); // "emoji" | "photo"
  const fileRef = useRef(null);

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Immagine troppo grande (max 2 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUrl(reader.result);
      setAvatarMode("photo");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      avatar: avatarMode === "photo" ? (name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()) : avatar,
      color,
      email: email.trim(),
      phone: phone.trim(),
      photoUrl: avatarMode === "photo" ? photoUrl : null,
    };
    dispatch({ type: "UPDATE_OWN_PROFILE", payload });
    onClose();
  };

  const initials = name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";

  const fieldLabel = (text) => (
    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>{text}</label>
  );

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", outline: "none",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 1000 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: "#fff", borderRadius: 16, zIndex: 1001,
        width: isMobile ? "calc(100vw - 32px)" : 480, maxWidth: "100%",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          background: "var(--navy)", padding: "20px 22px",
          borderRadius: "16px 16px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Preview avatar */}
            {avatarMode === "photo" && photoUrl ? (
              <img src={photoUrl} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,0.3)" }} />
            ) : (
              <div style={{
                width: 52, height: 52, borderRadius: "50%", background: color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: "#fff",
                border: "3px solid rgba(255,255,255,0.3)",
              }}>{avatar || initials}</div>
            )}
            <div>
              <div className="playfair" style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Modifica profilo</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{member.role}</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
            width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* ── Avatar Mode Toggle ── */}
          <div>
            {fieldLabel("AVATAR")}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "var(--surface2)", borderRadius: 10, padding: 3 }}>
              <button onClick={() => setAvatarMode("emoji")} style={{
                flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer",
                background: avatarMode === "emoji" ? "var(--navy)" : "transparent",
                color: avatarMode === "emoji" ? "#fff" : "var(--text)",
                fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              }}>Emoji / Iniziali</button>
              <button onClick={() => setAvatarMode("photo")} style={{
                flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer",
                background: avatarMode === "photo" ? "var(--navy)" : "transparent",
                color: avatarMode === "photo" ? "#fff" : "var(--text)",
                fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              }}>📷 Foto</button>
            </div>

            {avatarMode === "emoji" ? (
              <div>
                {/* Emoji grid */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {AVATAR_EMOJIS.map(e => (
                    <button key={e} onClick={() => setAvatar(e)} style={{
                      width: 38, height: 38, borderRadius: 8,
                      border: avatar === e ? "2px solid var(--gold)" : "1px solid var(--border)",
                      background: avatar === e ? "var(--gold)" + "20" : "#fff",
                      cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{e}</button>
                  ))}
                  {/* Initials option */}
                  <button onClick={() => setAvatar(initials)} style={{
                    width: 38, height: 38, borderRadius: 8,
                    border: !AVATAR_EMOJIS.includes(avatar) ? "2px solid var(--gold)" : "1px solid var(--border)",
                    background: !AVATAR_EMOJIS.includes(avatar) ? color : "#fff",
                    color: !AVATAR_EMOJIS.includes(avatar) ? "#fff" : "var(--text)",
                    cursor: "pointer", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{initials}</button>
                </div>
                {/* Color picker */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4 }}>COLORE</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {AVATAR_COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)} style={{
                      width: 28, height: 28, borderRadius: "50%", background: c, border: color === c ? "3px solid var(--gold)" : "2px solid transparent",
                      cursor: "pointer", transition: "transform 0.1s",
                    }} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                {photoUrl ? (
                  <div style={{ position: "relative" }}>
                    <img src={photoUrl} alt="" style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--border)" }} />
                    <button onClick={() => { setPhotoUrl(""); setAvatarMode("emoji"); }} style={{
                      position: "absolute", top: -4, right: -4,
                      width: 24, height: 24, borderRadius: "50%", background: "var(--danger)", color: "#fff",
                      border: "2px solid #fff", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>✕</button>
                  </div>
                ) : (
                  <div style={{
                    width: 100, height: 100, borderRadius: "50%", border: "2px dashed var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-muted)", fontSize: 12,
                  }}>Nessuna foto</div>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
                <button onClick={() => fileRef.current?.click()} style={{
                  background: "var(--surface2)", border: "1px solid var(--border)",
                  padding: "8px 20px", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: "var(--text)",
                }}>📷 {photoUrl ? "Cambia foto" : "Carica foto"}</button>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>JPG, PNG — max 2 MB</div>
              </div>
            )}
          </div>

          {/* ── Nome ── */}
          <div>
            {fieldLabel("NOME VISUALIZZATO")}
            <input
              value={name} onChange={e => setName(e.target.value)}
              style={inputStyle} placeholder="Il tuo nome"
              onFocus={e => e.target.style.borderColor = "var(--gold)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
          </div>

          {/* ── Email + Telefono ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              {fieldLabel("EMAIL")}
              <input
                value={email} onChange={e => setEmail(e.target.value)}
                type="email" style={inputStyle} placeholder="nome@agenzia.it"
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>
            <div>
              {fieldLabel("TELEFONO")}
              <input
                value={phone} onChange={e => setPhone(e.target.value)}
                type="tel" style={inputStyle} placeholder="+39 333 123 4567"
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>
          </div>

          {/* ── Ruolo (read-only) ── */}
          <div>
            {fieldLabel("RUOLO (non modificabile)")}
            <div style={{
              padding: "10px 12px", borderRadius: 8, background: "var(--surface2)",
              fontSize: 14, color: "var(--text-muted)", fontWeight: 500,
            }}>{member.role}</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 22px 18px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 10,
        }}>
          <button onClick={onClose} style={{
            background: "#fff", color: "var(--text)", border: "1px solid var(--border)",
            padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
            fontWeight: 600, fontFamily: "inherit",
          }}>Annulla</button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            style={{
              background: name.trim() ? "var(--navy)" : "var(--surface3)",
              color: name.trim() ? "#fff" : "var(--text-muted)",
              border: "none",
              padding: "10px 20px", borderRadius: 8,
              cursor: name.trim() ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              boxShadow: name.trim() ? "0 4px 14px rgba(15,32,68,0.3)" : "none",
            }}
          >✓ Salva profilo</button>
        </div>
      </div>
    </>
  );
};

const UserSwitcher = ({ state, dispatch }) => {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const ref = useRef(null);
  const curr = getMember(state.currentUserId) || { name: "—", role: "—", avatar: "??", color: "#999" };

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h, { passive: true });
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);

  // Tutti i membri non-pending, ordinati per ruolo (Admin, Manager, Senior, Junior, Driver)
  const order = { admin: 0, manager: 1, "senior agent": 2, "junior agent": 3, driver: 4 };
  const candidates = TEAM
    .filter(m => !m.pending)
    .slice()
    .sort((a, b) => (order[(a.role || "").toLowerCase()] ?? 99) - (order[(b.role || "").toLowerCase()] ?? 99));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Cambia utente"
        aria-label="Cambia utente loggato"
        style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, padding: "3px 8px 3px 4px", fontFamily: "inherit",
        }}
      >
        {curr.photoUrl ? (
          <img src={curr.photoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: curr.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff",
          }}>{curr.avatar}</div>
        )}
        <div className="vd-hide-mobile" style={{ textAlign: "left" }}>
          <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{curr.name}</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>{curr.role}</div>
        </div>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 12px 30px rgba(0,0,0,0.2)", zIndex: 200,
          minWidth: 240, padding: 6,
        }}>
          {/* Profilo personale */}
          <button
            onClick={() => { setShowProfile(true); setOpen(false); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 10px", background: "transparent",
              border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              color: "var(--navy)", textAlign: "left", borderBottom: "1px solid var(--border)", marginBottom: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>👤</span>
            <span style={{ fontWeight: 600 }}>Modifica profilo</span>
          </button>

          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "8px 10px 4px", letterSpacing: 1 }}>
            ACCEDI COME (DEMO MULTI-RUOLO)
          </div>
          {candidates.map(m => {
            const active = m.id === state.currentUserId;
            return (
              <button
                key={m.id}
                onClick={() => { dispatch({ type: "SET_CURRENT_USER", payload: m.id }); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", background: active ? "var(--surface2)" : "transparent",
                  border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                  color: "var(--text)", textAlign: "left",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {m.photoUrl ? (
                  <img src={m.photoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", background: m.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                  }}>{m.avatar}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
                {active && <span style={{ color: "var(--success)", fontSize: 14 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Profile Editor Modal */}
      {showProfile && <ProfileEditor member={curr} dispatch={dispatch} onClose={() => setShowProfile(false)} />}
    </div>
  );
};

// ─── NOTIFICATIONS PANEL ───────────────────────────────────────────────────
const NotificationsPanel = ({ dispatch }) => {
  const { isMobile } = useViewport();
  const icons = { overdue: "⚠️", assigned: "📋", comment: "💬", deadline: "📅" };
  return (
    <div className="slide-right" style={{
      position: isMobile ? "fixed" : "absolute",
      top: isMobile ? 56 : "calc(100% + 8px)",
      right: isMobile ? 12 : 0,
      left: isMobile ? 12 : "auto",
      width: isMobile ? "auto" : "min(360px, calc(100vw - 24px))",
      background: "#fff", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
      border: "1px solid var(--border)", overflow: "hidden", zIndex: 200,
    }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="playfair" style={{ fontWeight: 600, fontSize: 15 }}>Notifiche</div>
        <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
      </div>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {NOTIFICATIONS.map(n => (
          <div key={n.id} style={{
            padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start",
            background: n.read ? "transparent" : "rgba(212,168,67,0.07)",
            borderBottom: "1px solid var(--border)",
            transition: "background 0.2s", cursor: "default",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icons[n.type]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{n.time}</div>
            </div>
            {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)", flexShrink: 0, marginTop: 4 }} />}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── SIDEBAR ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard", icon: "📊", label: "Dashboard", roles: ["admin", "manager", "agent", "driver"] },
  { id: "calendar", icon: "📅", label: "Calendario", roles: ["admin", "manager", "agent", "driver"] },
  { id: "clients", icon: "🧳", label: "Clienti", roles: ["admin", "manager", "agent"] }, // v0.9.5
  { id: "suppliers", icon: "🤝", label: "Fornitori", roles: ["admin", "manager", "agent"] }, // v0.9.7
  { id: "team", icon: "👥", label: "Team", roles: ["admin", "manager", "agent"] },
  { id: "trash", icon: "🗑️", label: "Cestino", roles: ["admin"] },
  { id: "admin", icon: "⚙️", label: "Admin", roles: ["admin"] },
];

// Filtra NAV_ITEMS in base al ruolo dell'utente loggato
const getNavItemsForUser = (userId) => {
  const role = getRoleType(userId);
  return NAV_ITEMS.filter(it => !it.roles || it.roles.includes(role));
};

// Calcola i contatori da mostrare come badge sulle voci nav.
// `dashboard` → task in coda globale (assignees=[] e non cestinati).
// `admin` → agenti in attesa di approvazione (pending=true).
// Driver: nessun badge dashboard (non vede la coda globale).
const getNavBadges = (state) => {
  const uid = state.currentUserId;
  const role = getRoleType(uid);
  const queue = role === "driver"
    ? 0
    : state.tasks.filter(t => !t.deletedAt && (!t.assignees || t.assignees.length === 0)).length;
  const pending = role === "admin"
    ? (state.team || []).filter(m => m.pending).length
    : 0;
  return { dashboard: queue, admin: pending };
};

// Badge contatore riusabile (pillola dorata, mostrato solo se count > 0)
const NavBadge = ({ count, variant = "dot" }) => {
  if (!count) return null;
  const text = count > 99 ? "99+" : String(count);
  if (variant === "dot") {
    return (
      <span style={{
        position: "absolute", top: -4, right: -6,
        minWidth: 16, height: 16, padding: "0 4px",
        borderRadius: 999, background: "var(--gold)", color: "var(--navy)",
        fontSize: 9, fontWeight: 700, lineHeight: "16px", textAlign: "center",
        border: "1.5px solid var(--navy-dark)", boxSizing: "content-box",
      }}>{text}</span>
    );
  }
  // inline (per sidebar espansa: dopo la label)
  return (
    <span style={{
      marginLeft: "auto", minWidth: 18, padding: "1px 6px", borderRadius: 999,
      background: "var(--gold)", color: "var(--navy)", fontSize: 10, fontWeight: 700,
      lineHeight: 1.4, textAlign: "center",
    }}>{text}</span>
  );
};

const Sidebar = ({ state, dispatch }) => {
  const { isDesktop } = useViewport();
  if (!isDesktop) return null;
  const col = state.sidebarCollapsed;
  const navItems = getNavItemsForUser(state.currentUserId);
  const badges = getNavBadges(state);
  return (
    <div style={{
      width: col ? 60 : 210, background: "var(--navy-dark)", color: "#fff",
      display: "flex", flexDirection: "column",
      transition: "width 0.25s ease", flexShrink: 0,
      borderRight: "1px solid rgba(212,168,67,0.15)", position: "relative",
    }}>
      <button onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })} style={{
        position: "absolute", top: 12, right: col ? "50%" : 8,
        transform: col ? "translateX(50%)" : "none",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 6, width: 24, height: 24, cursor: "pointer", color: "rgba(255,255,255,0.5)",
        fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
      }}>{col ? "→" : "←"}</button>

      <div style={{ marginTop: 48, padding: col ? "0 8px" : "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map(item => {
          const active = state.activeView === item.id;
          const badge = badges[item.id] || 0;
          return (
            <button key={item.id} onClick={() => dispatch({ type: "SET_VIEW", payload: item.id })} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: col ? "10px 8px" : "10px 12px",
              borderRadius: 8, cursor: "pointer", border: "none",
              background: active ? "rgba(212,168,67,0.18)" : "transparent",
              color: active ? "var(--gold)" : "rgba(255,255,255,0.6)",
              fontSize: 14, fontWeight: active ? 600 : 400,
              transition: "all 0.2s", textAlign: "left",
              borderLeft: active ? "2px solid var(--gold)" : "2px solid transparent",
            }}>
              <span style={{ position: "relative", fontSize: 16, flexShrink: 0, display: "inline-flex" }}>
                {item.icon}
                {col && <NavBadge count={badge} variant="dot" />}
              </span>
              {!col && <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>{item.label}</span>}
              {!col && <NavBadge count={badge} variant="inline" />}
            </button>
          );
        })}
      </div>

      {!col && (
        <div style={{ marginTop: "auto", padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 8 }}>TEAM ONLINE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {getAssignableTeam().slice(0, 4).map(m => (
              <div key={m.id} title={m.name} style={{
                width: 26, height: 26, borderRadius: "50%", background: m.color,
                fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", border: "2px solid var(--navy-dark)",
                position: "relative"
              }}>
                {m.avatar}
                <div style={{ position: "absolute", bottom: 0, right: 0, width: 7, height: 7, borderRadius: "50%", background: "#2D7A4F", border: "1px solid var(--navy-dark)" }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── BOTTOM NAV (mobile/tablet) ────────────────────────────────────────────
const BottomNav = ({ state, dispatch }) => {
  const navItems = getNavItemsForUser(state.currentUserId);
  const badges = getNavBadges(state);
  return (
    <nav className="vd-bottom-nav" aria-label="Navigazione principale">
      {navItems.map(item => {
        const active = state.activeView === item.id;
        const badge = badges[item.id] || 0;
        return (
          <button
            key={item.id}
            onClick={() => dispatch({ type: "SET_VIEW", payload: item.id })}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 3, padding: "6px 2px",
              background: "transparent", border: "none", cursor: "pointer",
              color: active ? "var(--gold)" : "rgba(255,255,255,0.55)",
              borderTop: active ? "2px solid var(--gold)" : "2px solid transparent",
              transition: "color 0.2s",
            }}
          >
            <span style={{ position: "relative", fontSize: 19, lineHeight: 1, display: "inline-flex" }}>
              {item.icon}
              <NavBadge count={badge} variant="dot" />
            </span>
            <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>
              {item.label.split(" ")[0]}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

// ─── BULK TASK CREATOR (stili helper) ──────────────────────────────────────
const bulkInputStyle = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 6,
  padding: "7px 9px", fontSize: 12.5, fontFamily: "inherit",
  background: "#fff", outline: "none",
};
const bulkBtnPrimary = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600,
};
const bulkBtnGhost = {
  background: "transparent", border: "1px solid var(--border)",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 500,
};
const bulkIconBtnSmall = {
  background: "var(--surface2)", border: "none", borderRadius: 6,
  width: 22, height: 22, cursor: "pointer", fontSize: 13, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
};

// ─── BULK: MANUAL TAB ──────────────────────────────────────────────────────
const ManualTab = ({ onCreate, onClose }) => {
  const [common, setCommon] = useState({ client: "", category: "booking", priority: "medium", assignee: "" });
  const emptyRow = () => ({ key: Math.random().toString(36).slice(2), title: "", category: "", priority: "", assignee: "", dueDate: "" });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);

  const updateRow = (key, field, value) => setRows(rs => rs.map(r => r.key === key ? { ...r, [field]: value } : r));
  const addRow = () => setRows(rs => [...rs, emptyRow()]);
  const removeRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : rs);

  const validRows = rows.filter(r => r.title.trim());

  const handleCreate = () => {
    const ts = Date.now();
    const tasks = validRows.map((r, idx) => ({
      id: "t" + ts + "-" + idx,
      title: r.title.trim(),
      category: r.category || common.category,
      priority: r.priority || common.priority,
      status: "todo",
      assignees: (r.assignee || common.assignee) ? [r.assignee || common.assignee] : [],
      client: common.client.trim() || null,
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      estimatedHours: 1,
      description: "",
      comments: [],
    }));
    onCreate(tasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
          IMPOSTAZIONI COMUNI (usate se la riga non specifica)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <input value={common.client} onChange={e => setCommon({ ...common, client: e.target.value })} placeholder="Cliente" style={bulkInputStyle} />
          <select value={common.category} onChange={e => setCommon({ ...common, category: e.target.value })} style={bulkInputStyle}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={common.priority} onChange={e => setCommon({ ...common, priority: e.target.value })} style={bulkInputStyle}>
            {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={common.assignee} onChange={e => setCommon({ ...common, assignee: e.target.value })} style={bulkInputStyle}>
            <option value="">— Assegna a —</option>
            {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "0 4px", letterSpacing: 0.5 }}>
          <div>#</div><div>TITOLO *</div><div>CATEGORIA</div><div>PRIORITÀ</div><div>ASSEGNATO</div><div>SCADENZA</div><div></div>
        </div>
        {rows.map((r, idx) => (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>{idx + 1}</div>
            <input value={r.title} onChange={e => updateRow(r.key, "title", e.target.value)} placeholder="Titolo task..." style={bulkInputStyle} />
            <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
              <option value="">— default —</option>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={r.priority} onChange={e => updateRow(r.key, "priority", e.target.value)} style={bulkInputStyle}>
              <option value="">—</option>
              {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={r.assignee} onChange={e => updateRow(r.key, "assignee", e.target.value)} style={bulkInputStyle}>
              <option value="">—</option>
              {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name.split(" ")[0]}</option>)}
            </select>
            <input type="date" value={r.dueDate} onChange={e => updateRow(r.key, "dueDate", e.target.value)} style={bulkInputStyle} />
            <button onClick={() => removeRow(r.key)} disabled={rows.length === 1} style={{
              background: "transparent", border: "none", cursor: rows.length === 1 ? "not-allowed" : "pointer",
              fontSize: 14, color: "var(--text-muted)", opacity: rows.length === 1 ? 0.3 : 1,
            }}>✕</button>
          </div>
        ))}
        <button onClick={addRow} style={{
          background: "transparent", border: "1px dashed var(--border)", borderRadius: 8,
          padding: "9px", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          color: "var(--text-muted)", marginTop: 4,
        }}>+ Aggiungi riga</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{validRows.length} task da creare</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0} style={{
            ...bulkBtnPrimary, opacity: validRows.length === 0 ? 0.5 : 1, cursor: validRows.length === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {validRows.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: DUPLICATE TAB ───────────────────────────────────────────────────
const DuplicateTab = ({ tasks, onCreate, onClose }) => {
  const [selected, setSelected] = useState({});
  const [titleSuffix, setTitleSuffix] = useState(" (copia)");
  const [dayOffset, setDayOffset] = useState(0);
  const [search, setSearch] = useState("");

  const toggle = (id) => setSelected(s => {
    const next = { ...s };
    if (next[id]) delete next[id]; else next[id] = 1;
    return next;
  });
  const setCount = (id, n) => setSelected(s => ({ ...s, [id]: Math.max(1, n) }));

  const filtered = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.client?.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = Object.values(selected).reduce((a, c) => a + (c || 0), 0);

  const handleCreate = () => {
    const newTasks = [];
    const ts = Date.now();
    Object.entries(selected).forEach(([taskId, count]) => {
      const src = tasks.find(t => t.id === taskId);
      if (!src) return;
      for (let i = 0; i < count; i++) {
        let due = src.dueDate;
        if (due && dayOffset) {
          const d = new Date(due);
          d.setDate(d.getDate() + dayOffset);
          due = d.toISOString();
        }
        newTasks.push({
          ...src,
          id: "t" + ts + "-" + newTasks.length,
          title: src.title + titleSuffix + (count > 1 ? ` ${i + 1}` : ""),
          status: "todo",
          comments: [],
          dueDate: due,
        });
      }
    });
    onCreate(newTasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>SUFFISSO TITOLO</div>
          <input value={titleSuffix} onChange={e => setTitleSuffix(e.target.value)} style={bulkInputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>OFFSET SCADENZA (giorni)</div>
          <input type="number" value={dayOffset} onChange={e => setDayOffset(parseInt(e.target.value) || 0)} style={bulkInputStyle} />
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca task da duplicare..." style={{ ...bulkInputStyle, padding: "9px 12px" }} />

      <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nessun task trovato</div>
        ) : filtered.map(t => {
          const count = selected[t.id] || 0;
          const isSel = count > 0;
          return (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
              cursor: "pointer",
            }} onClick={() => toggle(t.id)}>
              <input type="checkbox" checked={isSel} readOnly style={{ cursor: "pointer" }} />
              <span style={{ fontSize: 14 }}>{CATEGORIES[t.category]?.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {CATEGORIES[t.category]?.label} • {t.client || "—"} • {formatDate(t.dueDate)}
                </div>
              </div>
              {isSel && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setCount(t.id, count - 1)} disabled={count <= 1} style={{ ...bulkIconBtnSmall, opacity: count <= 1 ? 0.4 : 1 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{count}</span>
                  <button onClick={() => setCount(t.id, count + 1)} style={bulkIconBtnSmall}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{totalCount} copie da creare</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={totalCount === 0} style={{
            ...bulkBtnPrimary, opacity: totalCount === 0 ? 0.5 : 1, cursor: totalCount === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {totalCount} copie</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: IMPORT TAB ──────────────────────────────────────────────────────
const ImportTab = ({ onCreate, onClose }) => {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const wb = XLSX.read(data, { type: "binary", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
        if (!json.length) { setError("Il file è vuoto o non contiene righe leggibili."); return; }
        const cols = Object.keys(json[0]);
        setRows(json); setColumns(cols);
        const find = (kws) => cols.find(c => kws.some(kw => c.toLowerCase().includes(kw)));
        setMapping({
          title: find(["titolo", "title", "nome", "task"]) || "",
          category: find(["categoria", "category", "tipo"]) || "",
          priority: find(["priorit", "priority"]) || "",
          status: find(["stato", "status"]) || "",
          client: find(["cliente", "client"]) || "",
          dueDate: find(["scadenz", "due", "data"]) || "",
          assignee: find(["assegn", "assign", "owner", "responsab"]) || "",
          estimatedHours: find(["ore", "hours"]) || "",
          description: find(["descriz", "descr", "note"]) || "",
        });
      } catch (err) {
        setError("Impossibile leggere il file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const normCat = (v) => {
    if (!v) return "admin";
    const s = String(v).toLowerCase().trim();
    return Object.keys(CATEGORIES).find(k => k === s || CATEGORIES[k].label.toLowerCase() === s) || "admin";
  };
  const normPrio = (v) => {
    if (!v) return "medium";
    const s = String(v).toLowerCase().trim();
    return Object.keys(PRIORITIES).find(k => k === s || PRIORITIES[k].label.toLowerCase() === s) || "medium";
  };
  const normStat = (v) => {
    if (!v) return "todo";
    const s = String(v).toLowerCase().trim();
    return STATUSES.find(k => k === s || STATUS_LABELS[k].toLowerCase() === s) || "todo";
  };
  const normAssignee = (v) => {
    if (!v) return null;
    const s = String(v).toLowerCase().trim();
    const m = TEAM.find(mm => mm.id === s || mm.name.toLowerCase().includes(s) || s.includes(mm.name.toLowerCase().split(" ")[0]));
    return m?.id || null;
  };
  const normDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const validRows = mapping.title ? rows.filter(r => String(r[mapping.title] || "").trim()) : [];

  const handleCreate = () => {
    const ts = Date.now();
    const tasks = validRows.map((r, idx) => {
      const assignee = mapping.assignee ? normAssignee(r[mapping.assignee]) : null;
      return {
        id: "t" + ts + "-" + idx,
        title: String(r[mapping.title]).trim(),
        category: normCat(mapping.category ? r[mapping.category] : null),
        priority: normPrio(mapping.priority ? r[mapping.priority] : null),
        status: normStat(mapping.status ? r[mapping.status] : null),
        assignees: assignee ? [assignee] : [],
        client: mapping.client ? (String(r[mapping.client] || "").trim() || null) : null,
        dueDate: mapping.dueDate ? normDate(r[mapping.dueDate]) : null,
        estimatedHours: mapping.estimatedHours ? (parseFloat(r[mapping.estimatedHours]) || 1) : 1,
        description: mapping.description ? String(r[mapping.description] || "").trim() : "",
        comments: [],
      };
    });
    onCreate(tasks);
    onClose();
  };

  const reset = () => { setRows([]); setColumns([]); setMapping({}); setFileName(""); setError(null); };

  const fields = [
    { key: "title", label: "Titolo *" }, { key: "category", label: "Categoria" },
    { key: "priority", label: "Priorità" }, { key: "status", label: "Stato" },
    { key: "client", label: "Cliente" }, { key: "dueDate", label: "Scadenza" },
    { key: "assignee", label: "Assegnato" }, { key: "estimatedHours", label: "Ore stimate" },
    { key: "description", label: "Descrizione" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!rows.length && (
        <div onClick={() => fileInputRef.current?.click()} style={{
          border: "2px dashed var(--border)", borderRadius: 12,
          padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "var(--surface)",
          transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "rgba(212,168,67,0.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>📥</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Clicca per caricare CSV o Excel</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Formati supportati: .csv, .xlsx, .xls</div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
        </div>
      )}

      {error && (
        <div style={{ background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)", padding: "12px 14px", borderRadius: 10, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 13 }}>📄 <strong>{fileName}</strong> — {rows.length} righe, {columns.length} colonne</div>
            <button onClick={reset} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia file</button>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>MAPPATURA COLONNE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {fields.map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>{f.label}</div>
                  <select value={mapping[f.key] || ""} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))} style={bulkInputStyle}>
                    <option value="">— non mappato —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
              ANTEPRIMA (prime 5 righe)
            </div>
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>{columns.map(c => (
                    <th key={c} style={{ padding: "8px 10px", background: "var(--surface2)", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", position: "sticky", top: 0 }}>{c}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{columns.map(c => (
                      <td key={c} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(r[c] || "")}
                      </td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {validRows.length} task validi {!mapping.title && rows.length > 0 && "(mappa il TITOLO)"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0 || !mapping.title} style={{
            ...bulkBtnPrimary,
            opacity: (validRows.length === 0 || !mapping.title) ? 0.5 : 1,
            cursor: (validRows.length === 0 || !mapping.title) ? "not-allowed" : "pointer",
          }}>✓ Importa {validRows.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: TEMPLATE TAB ────────────────────────────────────────────────────
const TemplateTab = ({ onCreate, onClose }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [client, setClient] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [defaultAssignee, setDefaultAssignee] = useState("");

  const tpl = TASK_TEMPLATES.find(t => t.id === selectedId);
  const previewTasks = tpl && eventDate ? tpl.tasks.map(t => {
    const d = new Date(eventDate);
    d.setDate(d.getDate() + t.dayOffset);
    return { ...t, dueDate: d.toISOString() };
  }) : [];

  const handleCreate = () => {
    if (!tpl || !eventDate) return;
    const ts = Date.now();
    const tasks = previewTasks.map((t, idx) => ({
      id: "t" + ts + "-" + idx,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: "todo",
      assignees: defaultAssignee ? [defaultAssignee] : [],
      client: client.trim() || null,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      description: "",
      comments: [],
    }));
    onCreate(tasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!selectedId ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {TASK_TEMPLATES.map(t => (
            <div key={t.id} onClick={() => setSelectedId(t.id)} className="hover-lift" style={{
              padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border)",
              cursor: "pointer", background: "#fff",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 28 }}>{t.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.tasks.length} task</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{t.description}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 22 }}>{tpl.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{tpl.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{tpl.tasks.length} task</div>
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>CLIENTE</div>
              <input value={client} onChange={e => setClient(e.target.value)} placeholder="Es. Famiglia Rossi" style={bulkInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>DATA EVENTO *</div>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>ASSEGNA A</div>
              <select value={defaultAssignee} onChange={e => setDefaultAssignee(e.target.value)} style={bulkInputStyle}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          {eventDate && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
                ANTEPRIMA — {previewTasks.length} TASK
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {previewTasks.map((t, idx) => (
                  <div key={idx} style={{
                    padding: "8px 12px", borderBottom: idx === previewTasks.length - 1 ? "none" : "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                  }}>
                    <span style={{ fontSize: 14 }}>{CATEGORIES[t.category]?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        📅 {new Date(t.dueDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{previewTasks.length} task pronti</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={!tpl || !eventDate} style={{
            ...bulkBtnPrimary,
            opacity: (!tpl || !eventDate) ? 0.5 : 1,
            cursor: (!tpl || !eventDate) ? "not-allowed" : "pointer",
          }}>✓ Crea {previewTasks.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK TASK CREATOR (modale principale) ─────────────────────────────────
const BulkTaskCreator = ({ existingTasks, onCreate, onClose }) => {
  const [tab, setTab] = useState("manual");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 16, width: 820, maxWidth: "100%",
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 30px 80px rgba(0,0,0,0.25)", border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📑</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Crea più task</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 1.2, marginTop: 2 }}>MANUALE · DUPLICA · IMPORT · TEMPLATE</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          {[
            { id: "manual", icon: "✏️", label: "Manuale" },
            { id: "duplicate", icon: "🔁", label: "Duplica" },
            { id: "import", icon: "📥", label: "Importa file" },
            { id: "template", icon: "📋", label: "Da template" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "12px 8px", background: tab === t.id ? "#fff" : "transparent",
              border: "none", borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--navy)" : "var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s",
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {tab === "manual" && <ManualTab onCreate={onCreate} onClose={onClose} />}
          {tab === "duplicate" && <DuplicateTab tasks={existingTasks} onCreate={onCreate} onClose={onClose} />}
          {tab === "import" && <ImportTab onCreate={onCreate} onClose={onClose} />}
          {tab === "template" && <TemplateTab onCreate={onCreate} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
};

// ─── AI DAY PLANNER ────────────────────────────────────────────────────────
const AIDayPlanner = ({ tasks, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const today = new Date();

    // I task attivi assegnati a Marco
    const myTasks = tasks.filter(t =>
      t.assignees?.includes(CURRENT_USER) && t.status !== "done"
    );

    // Task di altri operatori: scaduti, oppure urgenti e ancora in "todo"
    // (proxy ragionevole per "non visti / non presi in carico")
    const othersNeglected = tasks.filter(t => {
      if (!t.assignees || t.assignees.includes(CURRENT_USER)) return false;
      if (t.status === "done") return false;
      const urgent = t.priority === "critical" || t.priority === "high";
      const overdue = isOverdue(t);
      const untouched = t.status === "todo";
      return overdue || (urgent && untouched);
    });

    const compact = (t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      client: t.client,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      assignees: t.assignees?.map(a => getMember(a)?.name).filter(Boolean),
      overdue: isOverdue(t),
      category: t.category,
    });

    const prompt = `Sei un assistente operativo per un'agenzia viaggi. Pianifica oggi (${today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}) per Marco Ferretti (Manager).

MIEI TASK ATTIVI:
${JSON.stringify(myTasks.map(compact))}

TASK URGENTI/SCADUTI DI ALTRI OPERATORI CHE SEMBRANO NEGLETTI (potrebbero non averli visti):
${JSON.stringify(othersNeglected.map(compact))}

Rispondi SOLO con JSON valido, senza markdown e senza testo prima o dopo. Schema:
{
  "summary": "1-2 frasi che inquadrano la giornata",
  "schedule": [{ "time": "HH:MM", "duration": "30min", "taskId": "tX", "action": "cosa fare in concreto", "why": "perché ora" }],
  "alerts": [{ "taskId": "tX", "owner": "Nome", "severity": "alta|media", "suggestion": "azione consigliata (sollecito, escalation, presa in carico)" }],
  "tips": ["consiglio breve e concreto"]
}

Regole:
- Orario: 09:00-18:00, pausa pranzo 13:00-14:00.
- Pianifica solo i MIEI task nel campo "schedule"; ordina per priorità (critical/overdue prima).
- I task di ALTRI operatori vanno SOLO in "alerts" (massimo 3, i più urgenti).
- Per i campi "taskId" usa esattamente gli id forniti.
- Massimo 2 "tips", brevi.`;

    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error("Errore di rete (HTTP " + r.status + ")");
        return r.json();
      })
      .then(data => {
        if (cancelled) return;
        const text = (data.content || []).map(b => b.text || "").join("").trim();
        const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(clean);
        setPlan(parsed);
      })
      .catch(e => { if (!cancelled) setError(e.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tasks]);

  const findTask = (id) => tasks.find(t => t.id === id);
  const sevColor = { alta: "var(--danger)", media: "var(--warning)" };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 16, width: 640, maxWidth: "100%",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 30px 80px rgba(0,0,0,0.25)", border: "1px solid var(--border)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: "var(--gold)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>✨</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>
                Pianifica la mia giornata
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, letterSpacing: 1.2, marginTop: 2 }}>
                ASSISTENTE AI
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
            width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤔</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Sto analizzando i tuoi task...</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Carico, priorità e scadenze del team
              </div>
              <div style={{ marginTop: 16, height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                <div className="skeleton" style={{ height: "100%", width: "60%" }} />
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)",
              padding: "14px 16px", borderRadius: 10, fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Impossibile generare il piano</div>
              <div style={{ fontSize: 12 }}>{error}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                L'assistente AI funziona solo in ambiente Claude.ai (l'API key è iniettata dalla piattaforma).
              </div>
            </div>
          )}

          {plan && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Summary */}
              {plan.summary && (
                <div style={{
                  background: "var(--surface2)", borderLeft: "3px solid var(--gold)",
                  padding: "12px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                }}>{plan.summary}</div>
              )}

              {/* Schedule */}
              {plan.schedule?.length > 0 && (
                <div>
                  <div className="playfair" style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                    🗓️ Programma della giornata
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {plan.schedule.map((s, i) => {
                      const t = findTask(s.taskId);
                      return (
                        <div key={i} style={{
                          display: "flex", gap: 12, padding: "10px 12px",
                          border: "1px solid var(--border)", borderRadius: 10, background: "#fff",
                        }}>
                          <div style={{
                            display: "flex", flexDirection: "column", alignItems: "center",
                            minWidth: 54, paddingTop: 2,
                          }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>{s.time}</div>
                            {s.duration && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.duration}</div>}
                          </div>
                          <div style={{ width: 1, background: "var(--border)" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                              {t && <CategoryChip category={t.category} small />}
                              {t && <PriorityBadge priority={t.priority} />}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                              {t?.title || s.action}
                            </div>
                            {s.action && t && (
                              <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4 }}>{s.action}</div>
                            )}
                            {s.why && (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
                                💡 {s.why}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Alerts */}
              {plan.alerts?.length > 0 && (
                <div>
                  <div className="playfair" style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                    🚨 Task di altri operatori da monitorare
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {plan.alerts.map((a, i) => {
                      const t = findTask(a.taskId);
                      const color = sevColor[a.severity] || "var(--warning)";
                      return (
                        <div key={i} style={{
                          background: color + "12", border: `1px solid ${color}40`,
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{t?.title || a.taskId}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                Resp. {a.owner}{t?.dueDate && ` • scadenza ${formatDate(t.dueDate)}`}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color, textTransform: "uppercase",
                              padding: "2px 8px", borderRadius: 99, background: "#fff", flexShrink: 0,
                            }}>{a.severity}</span>
                          </div>
                          <div style={{ fontSize: 12, marginTop: 6, color: "var(--text)" }}>
                            👉 {a.suggestion}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tips */}
              {plan.tips?.length > 0 && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(212,168,67,0.08), rgba(212,168,67,0.02))",
                  border: "1px dashed rgba(212,168,67,0.4)",
                  borderRadius: 10, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-dark)", letterSpacing: 1, marginBottom: 6 }}>
                    ✨ CONSIGLI
                  </div>
                  <ul style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--text)" }}>
                    {plan.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0, background: "var(--surface)",
        }}>
          <button onClick={onClose} style={{
            padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>Chiudi</button>
        </div>
      </div>
    </div>
  );
};

// ─── NOTICE BOARD (bacheca avvisi) ─────────────────────────────────────────
const NoticeBoard = ({ notices, dispatch }) => {
  const [editing, setEditing] = useState(null); // null | { id?, text, color }
  const [creating, setCreating] = useState(false);
  const { isMobile } = useViewport();

  // Pinned in alto, poi per data
  const sorted = [...notices].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "ora";
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} g fa`;
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  };

  return (
    <div style={{
      background: "linear-gradient(180deg, #faf5e6 0%, #f5efd9 100%)",
      backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 23px, rgba(139,90,43,0.04) 23px, rgba(139,90,43,0.04) 24px), repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(139,90,43,0.03) 23px, rgba(139,90,43,0.03) 24px)",
      backgroundColor: "#faf5e6",
      border: "1px solid #d4c08a",
      borderRadius: 12, padding: isMobile ? "14px 12px 16px" : "18px 22px 22px",
      boxShadow: "inset 0 2px 6px rgba(139,90,43,0.1), 0 2px 10px rgba(0,0,0,0.05)",
      minWidth: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: "var(--navy)", color: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>📌</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              Bacheca avvisi
            </div>
            <div style={{ fontSize: 11, color: "#8b6f3a", marginTop: 2 }}>
              Visibile a tutto il team • chiunque può aggiungere o modificare
            </div>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: "var(--navy)", color: "#fff", border: "none",
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 5,
            boxShadow: "0 2px 8px rgba(15,32,68,0.3)",
          }}
        >
          + Nuovo avviso
        </button>
      </div>

      {/* Board */}
      {sorted.length === 0 ? (
        <div style={{
          padding: "30px 20px", textAlign: "center", color: "#8b6f3a",
          fontSize: 13, fontStyle: "italic",
        }}>
          ✨ Nessun avviso in bacheca. Clicca "+ Nuovo avviso" per pubblicarne uno.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16, padding: "6px 4px",
        }}>
          {sorted.map((n, idx) => {
            const author = getMember(n.author);
            const rotation = ((n.id.charCodeAt(n.id.length - 1) % 5) - 2) * 0.7; // -1.4 a +1.4 deg
            return (
              <div
                key={n.id}
                style={{
                  background: n.color,
                  padding: "14px 14px 12px",
                  borderRadius: 4,
                  position: "relative",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                  transform: `rotate(${rotation}deg)`,
                  transition: "transform 0.2s, box-shadow 0.2s",
                  minHeight: 130,
                  display: "flex", flexDirection: "column",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "rotate(0deg) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.15), 0 2px 5px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                  e.currentTarget.style.boxShadow = "0 3px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)";
                }}
              >
                {/* Pin in alto */}
                {n.pinned && (
                  <div style={{
                    position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
                    fontSize: 18, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
                  }}>📌</div>
                )}

                {/* Toolbar actions */}
                <div style={{
                  position: "absolute", top: 6, right: 6,
                  display: "flex", gap: 2, opacity: 0.6,
                }}>
                  <button
                    onClick={() => dispatch({ type: "TOGGLE_PIN_NOTICE", payload: n.id })}
                    title={n.pinned ? "Rimuovi pin" : "Fissa in alto"}
                    style={noticeBtnStyle}
                  >{n.pinned ? "📍" : "📌"}</button>
                  <button
                    onClick={() => setEditing({ id: n.id, text: n.text, color: n.color, pinned: n.pinned })}
                    title="Modifica"
                    style={noticeBtnStyle}
                  >✏️</button>
                  <button
                    onClick={() => {
                      if (window.confirm("Eliminare questo avviso?")) {
                        dispatch({ type: "DELETE_NOTICE", payload: n.id });
                      }
                    }}
                    title="Elimina"
                    style={noticeBtnStyle}
                  >✕</button>
                </div>

                {/* Testo avviso */}
                <div style={{
                  fontSize: 13, lineHeight: 1.45, color: "#3d2f10",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  flex: 1, marginTop: 10, marginRight: 50,
                }}>
                  {n.text}
                </div>

                {/* Footer: autore + data */}
                <div style={{
                  marginTop: 10, paddingTop: 8,
                  borderTop: "1px dashed rgba(61,47,16,0.2)",
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 10, color: "#5d4920",
                }}>
                  {author && (
                    <>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", background: author.color,
                        color: "#fff", fontSize: 8, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{author.avatar}</div>
                      <span style={{ fontWeight: 600 }}>{author.name.split(" ")[0]}</span>
                    </>
                  )}
                  <span style={{ marginLeft: "auto" }}>{formatRel(n.updatedAt || n.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <NoticeEditorModal
          notice={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) {
              dispatch({ type: "UPDATE_NOTICE", payload: { id: editing.id, ...data } });
            } else {
              dispatch({
                type: "ADD_NOTICE",
                payload: {
                  id: "n" + Date.now(),
                  ...data,
                  author: CURRENT_USER,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              });
            }
            setCreating(false); setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const noticeBtnStyle = {
  background: "rgba(255,255,255,0.6)", border: "none", borderRadius: 4,
  width: 22, height: 22, cursor: "pointer", fontSize: 11,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, lineHeight: 1,
};

const NoticeEditorModal = ({ notice, onClose, onSave }) => {
  const [text, setText] = useState(notice?.text || "");
  const [color, setColor] = useState(notice?.color || NOTICE_COLORS[0]);
  const [pinned, setPinned] = useState(notice?.pinned || false);
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const submit = () => {
    if (!text.trim()) return;
    onSave({ text: text.trim(), color, pinned });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 12, padding: 24,
        width: "90%", maxWidth: 520,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>
          {notice ? "✏️ Modifica avviso" : "📌 Nuovo avviso"}
        </h3>

        {/* Preview live */}
        <div style={{
          background: color, padding: "12px 14px", borderRadius: 4,
          marginBottom: 16, minHeight: 80,
          boxShadow: "0 3px 8px rgba(0,0,0,0.12)",
          fontSize: 13, lineHeight: 1.45, color: "#3d2f10",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {text || <span style={{ color: "#8b6f3a", fontStyle: "italic" }}>Anteprima dell'avviso...</span>}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Scrivi qui il tuo avviso..."
          rows={4}
          maxLength={500}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: "1px solid var(--border)", fontSize: 13,
            outline: "none", fontFamily: "inherit", resize: "vertical",
            boxSizing: "border-box", lineHeight: 1.45,
          }}
          onFocus={e => e.target.style.borderColor = "var(--gold)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"}
        />
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 4 }}>
          {text.length}/500
        </div>

        {/* Colore */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Colore post-it
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {NOTICE_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 34, height: 34, borderRadius: 6, background: c,
                  cursor: "pointer", border: color === c ? "2px solid var(--navy)" : "2px solid transparent",
                  transition: "transform 0.15s",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  transform: color === c ? "scale(1.1)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Pin */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, cursor: "pointer", color: "var(--text)" }}>
          <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
          📌 Fissa questo avviso in cima alla bacheca
        </label>

        {/* Footer buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)",
            background: "#fff", color: "var(--text)", fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}>Annulla</button>
          <button onClick={submit} disabled={!text.trim()} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: text.trim() ? "var(--navy)" : "var(--text-light)",
            color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: text.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{notice ? "💾 Salva modifiche" : "📌 Pubblica avviso"}</button>
        </div>
      </div>
    </div>
  );
};

// ─── PERSONAL QUEUE (le mie task — v0.8) ───────────────────────────────────
// v0.9.4: per Driver mostra agenda transfer-oriented (chip Oggi/Domani/Tutte,
// raggruppata per giorno con orario in evidenza). Per altri ruoli resta la
// griglia auto-fill già presente da v0.8.
const PersonalQueue = ({ tasks, dispatch, me }) => {
  const { isMobile } = useViewport();
  const driverMode = me && getRoleType(me.id) === "driver";
  const [dayFilter, setDayFilter] = useState("today");

  // Conteggi per chip filtro (sempre calcolati per Driver, indipendenti dal filter attivo)
  const driverCounts = useMemo(() => {
    if (!driverMode) return null;
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const startTomorrow = new Date(startToday); startTomorrow.setDate(startTomorrow.getDate() + 1);
    const startDayAfter = new Date(startToday); startDayAfter.setDate(startToday.getDate() + 2);
    let today = 0, tomorrow = 0;
    tasks.forEach(t => {
      if (!t.dueDate) return;
      const d = new Date(t.dueDate);
      if (d >= startToday && d < startTomorrow) today++;
      else if (d >= startTomorrow && d < startDayAfter) tomorrow++;
    });
    return { today, tomorrow, all: tasks.length };
  }, [tasks, driverMode]);

  // Task filtrate per il filtro giorno attivo (solo Driver)
  const filtered = useMemo(() => {
    if (!driverMode || dayFilter === "all") return tasks;
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const startTomorrow = new Date(startToday); startTomorrow.setDate(startTomorrow.getDate() + 1);
    const startDayAfter = new Date(startToday); startDayAfter.setDate(startToday.getDate() + 2);
    return tasks.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      if (dayFilter === "today") return d >= startToday && d < startTomorrow;
      if (dayFilter === "tomorrow") return d >= startTomorrow && d < startDayAfter;
      return false;
    });
  }, [tasks, dayFilter, driverMode]);

  // Raggruppa per giorno per la vista agenda (driver-only)
  const grouped = useMemo(() => {
    if (!driverMode) return null;
    const map = new Map();
    filtered.forEach(t => {
      const key = t.dueDate ? getDayKey(t.dueDate) : "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "__none__") return 1;
        if (b === "__none__") return -1;
        return new Date(a) - new Date(b);
      })
      .map(([key, list]) => ({
        key,
        date: key === "__none__" ? null : new Date(key),
        tasks: list,
      }));
  }, [filtered, driverMode]);

  // Label "Oggi · gio 14 dic" / "Domani · ven 15 dic" / "lun 16 dic"
  const formatAgendaDay = (date) => {
    if (!date) return "Senza data";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const datePart = d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
    if (d.getTime() === today.getTime()) return `Oggi · ${datePart}`;
    if (d.getTime() === tomorrow.getTime()) return `Domani · ${datePart}`;
    return datePart;
  };

  const renderCard = (t, opts = {}) => {
    const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
    const prio = PRIORITIES[t.priority];
    const overdue = isOverdue(t);
    const urgent = isUrgent(t);
    const card = (
      <div
        style={{
          background: "#fff", borderRadius: 10,
          border: `1px solid ${overdue ? "rgba(192,57,43,0.4)" : urgent ? "rgba(200,131,42,0.4)" : "var(--border)"}`,
          padding: 12, display: "flex", flexDirection: opts.driver ? "row" : "column",
          gap: opts.driver ? 12 : 8,
          cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
          borderLeft: `3px solid ${prio.color}`,
          alignItems: opts.driver ? "stretch" : "stretch",
        }}
        onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
      >
        {opts.driver && t.dueDate && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minWidth: 62, padding: "4px 8px", borderRight: "1px solid var(--surface3)",
            background: overdue ? "rgba(192,57,43,0.05)" : "var(--surface)",
            borderRadius: 6,
          }}>
            <div style={{
              fontSize: 19, fontWeight: 700, lineHeight: 1, color: overdue ? "var(--danger)" : "var(--navy)",
              fontVariantNumeric: "tabular-nums",
            }}>{formatTime(t.dueDate)}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 3, letterSpacing: 0.5 }}>
              ORARIO
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 8px", borderRadius: 999,
              background: cat.bg, color: cat.color,
              fontSize: 11, fontWeight: 600,
            }}>
              <span>{cat.icon}</span> {cat.label}
            </div>
            <StatusBadge status={t.status} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
            {t.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
            {t.client && <span>👤 {t.client}</span>}
            {t.dueDate && !opts.driver && (
              <span style={{ color: overdue ? "var(--danger)" : urgent ? "var(--warning)" : "var(--text-muted)", fontWeight: (overdue || urgent) ? 700 : 400 }}>
                📅 {formatDate(t.dueDate)}{overdue ? " ⚠ scaduto" : urgent ? " ⏱ < 24h" : ""}
              </span>
            )}
            {t.dueDate && opts.driver && (overdue || urgent) && (
              <span style={{ color: overdue ? "var(--danger)" : "var(--warning)", fontWeight: 700 }}>
                {overdue ? "⚠ scaduto" : "⏱ < 24h"}
              </span>
            )}
            {t.estimatedHours > 0 && <span>⏱️ {t.estimatedHours}h</span>}
          </div>
        </div>
      </div>
    );
    return (
      <SwipeActions key={t.id} task={t} dispatch={dispatch}>
        {card}
      </SwipeActions>
    );
  };

  const empty = tasks.length === 0;
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(15,32,68,0.04) 0%, rgba(15,32,68,0.01) 100%)",
      border: "1px solid rgba(15,32,68,0.15)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: me?.color || "var(--navy)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>{me?.avatar || "?"}</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              {driverMode ? "Le mie corse — agenda" : "La mia coda — task assegnate a me"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {driverMode
                ? "Filtra per giorno • orario in evidenza • clicca per i dettagli"
                : "Ordinate per scadenza • clicca una card per i dettagli"}
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--navy)", color: "#fff",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{driverMode ? filtered.length : tasks.length} {(driverMode ? filtered.length : tasks.length) === 1 ? "task" : "task"}</div>
        )}
      </div>

      {/* Driver: chip filtro giorno */}
      {driverMode && !empty && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            { id: "today", label: "Oggi", count: driverCounts.today },
            { id: "tomorrow", label: "Domani", count: driverCounts.tomorrow },
            { id: "all", label: "Tutte", count: driverCounts.all },
          ].map(opt => {
            const on = dayFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setDayFilter(opt.id)}
                style={{
                  padding: "6px 12px", borderRadius: 999,
                  border: `1px solid ${on ? "var(--navy)" : "var(--border)"}`,
                  background: on ? "var(--navy)" : "#fff",
                  color: on ? "#fff" : "var(--text)",
                  cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  transition: "background 0.15s",
                }}
              >
                {opt.label}
                <span style={{
                  background: on ? "rgba(255,255,255,0.2)" : "var(--surface2)",
                  color: on ? "#fff" : "var(--text-muted)",
                  padding: "1px 7px", borderRadius: 99, fontSize: 10.5, fontWeight: 700,
                }}>{opt.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>🎉</span>
          {driverMode
            ? "Nessuna corsa assegnata. Buon riposo!"
            : "Nessuna task aperta a tuo nome. Buon lavoro!"}
        </div>
      ) : driverMode ? (
        grouped.length === 0 ? (
          <div style={{
            padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
            color: "var(--text-muted)", fontSize: 13,
          }}>
            <span style={{ fontSize: 18 }}>🗓️</span>
            Nessuna corsa per il filtro selezionato.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {grouped.map(group => (
              <section key={group.key}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
                  paddingBottom: 6, borderBottom: "1px solid var(--surface3)",
                }}>
                  <span style={{ color: "var(--navy)" }}>{formatAgendaDay(group.date)}</span>
                  <span style={{
                    background: "var(--surface2)", padding: "1px 7px", borderRadius: 99,
                    fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
                    letterSpacing: 0,
                  }}>{group.tasks.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.tasks.map(t => renderCard(t, { driver: true }))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {tasks.map(t => renderCard(t))}
        </div>
      )}
    </div>
  );
};

// ─── URGENT OTHERS QUEUE (scadenza <24h, non mie — read-only — v0.8) ──────
const UrgentOthersQueue = ({ tasks, dispatch, onOpenChat, uid }) => {
  const { isMobile } = useViewport();
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(200,131,42,0.07) 0%, rgba(200,131,42,0.01) 100%)",
      border: "1px solid rgba(200,131,42,0.35)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--warning)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700,
          }}>⏱</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              Urgenti del team — scadenza entro 24h
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Solo visualizzazione • clicca sull'agente per scrivergli in chat
            </div>
          </div>
        </div>
        <div style={{
          background: "var(--warning)", color: "#fff",
          padding: "4px 12px", borderRadius: 999,
          fontSize: 13, fontWeight: 700,
        }}>{tasks.length}</div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
        gap: 10,
      }}>
        {tasks.map(t => {
          const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
          const prio = PRIORITIES[t.priority];
          const owner = getMember(t.assignees?.[0]);
          return (
            <div
              key={t.id}
              style={{
                background: "#fff", borderRadius: 10,
                border: "1px solid rgba(200,131,42,0.3)",
                padding: 12, display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 8px", borderRadius: 999,
                  background: cat.bg, color: cat.color,
                  fontSize: 11, fontWeight: 600,
                }}>
                  <span>{cat.icon}</span> {cat.label}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                  background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                }}>{prio.label}</div>
              </div>

              <div
                onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35, cursor: "pointer" }}
              >
                {t.title}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                {t.client && <span>👤 {t.client}</span>}
                {t.dueDate && (
                  <span style={{ color: "var(--warning)", fontWeight: 700 }}>
                    ⏱ {formatDate(t.dueDate)} ({formatTime(t.dueDate)})
                  </span>
                )}
              </div>

              {/* Owner cliccabile → apre chat con link al task */}
              {owner && (
                <button
                  onClick={() => onOpenChat && onOpenChat({ toUser: owner.id, taskLink: t.id })}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface3)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--surface2)"}
                  title={`Scrivi a ${owner.name}`}
                >
                  <Avatar memberId={owner.id} size={24} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{owner.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>💬 contatta</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── UNASSIGNED QUEUE (coda globale) ───────────────────────────────────────
const UnassignedQueue = ({ tasks, dispatch, onTake }) => {
  const { isMobile } = useViewport();
  const empty = tasks.length === 0;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(212,168,67,0.05) 0%, rgba(212,168,67,0.01) 100%)",
      border: "1px solid rgba(212,168,67,0.3)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--gold)", color: "var(--navy)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700,
          }}>🙋</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              Coda globale — task da prendere in carico
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Task non assegnati • visibili a tutto il team • clicca "Prendi in carico" per autoassegnarti
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--gold)", color: "var(--navy)",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{tasks.length} in attesa</div>
        )}
      </div>

      {/* Lista */}
      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✨</span>
          Nessun task in coda. Tutti gli incarichi hanno un proprietario!
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {tasks.map(t => {
            const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const overdue = isOverdue(t);
            const card = (
              <div
                style={{
                  background: "#fff", borderRadius: 10,
                  border: `1px solid ${overdue ? "rgba(192,57,43,0.3)" : "var(--border)"}`,
                  padding: 12, display: "flex", flexDirection: "column", gap: 10,
                  cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                {/* Top row: category + priority */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", borderRadius: 999,
                    background: cat.bg, color: cat.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span>{cat.icon}</span> {cat.label}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                    background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                  }}>{prio.label}</div>
                </div>

                {/* Title */}
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                  {t.title}
                </div>

                {/* Meta */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                  {t.client && <span>👤 {t.client}</span>}
                  {t.dueDate && (
                    <span style={{ color: overdue ? "var(--danger)" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}>
                      📅 {formatDate(t.dueDate)}{overdue ? " (scaduto)" : ""}
                    </span>
                  )}
                  {t.estimatedHours > 0 && <span>⏱️ {t.estimatedHours}h</span>}
                </div>

                {/* Take ownership button */}
                <button
                  onClick={e => { e.stopPropagation(); onTake(t); }}
                  style={{
                    background: "var(--gold)", color: "var(--navy)",
                    border: "none", borderRadius: 8,
                    padding: "8px 12px", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 6,
                    fontFamily: "inherit",
                    transition: "background 0.15s, transform 0.15s",
                    marginTop: 2,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--gold-light)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--gold)"; }}
                >
                  🙋 Prendi in carico
                </button>
              </div>
            );
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                {card}
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── QUEUE TAB (Dashboard tab card) ───────────────────────────────────────
const QueueTab = ({ active, onClick, icon, label, count, isMobile, dangerCount }) => {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--navy)" : "transparent",
        color: active ? "#fff" : "var(--text)",
        border: active ? "none" : "1px solid var(--border)",
        borderRadius: 10,
        padding: isMobile ? "10px 6px" : "12px 10px",
        cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 4,
        transition: "background 0.15s, transform 0.1s",
        fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface2)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ fontSize: isMobile ? 18 : 20 }}>{icon}</div>
      <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>{label}</div>
      <div style={{
        background: active ? "rgba(255,255,255,0.2)" : dangerCount && count > 0 ? "var(--danger)" : "var(--surface3)",
        color: active ? "#fff" : dangerCount && count > 0 ? "#fff" : "var(--text-muted)",
        fontSize: 11, fontWeight: 700,
        padding: "1px 8px", borderRadius: 999, minWidth: 22, textAlign: "center",
      }}>{count}</div>
    </button>
  );
};

// ─── OVERDUE QUEUE (task scaduti visibili) ────────────────────────────────
const OverdueQueue = ({ tasks, dispatch }) => {
  const { isMobile } = useViewport();
  const empty = tasks.length === 0;
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(192,57,43,0.05) 0%, rgba(192,57,43,0.01) 100%)",
      border: "1px solid rgba(192,57,43,0.2)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--danger)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>📅</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              Task scadute
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Ordinate per data di scadenza • richiedono attenzione immediata
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--danger)", color: "#fff",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{tasks.length}</div>
        )}
      </div>

      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          Nessuna task scaduta. Tutto in regola!
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {tasks.map(t => {
            const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const card = (
              <div
                style={{
                  background: "#fff", borderRadius: 10,
                  border: "1px solid rgba(192,57,43,0.4)",
                  padding: 12, display: "flex", flexDirection: "column", gap: 8,
                  cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
                  borderLeft: `3px solid ${prio.color}`,
                }}
                onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", borderRadius: 999,
                    background: cat.bg, color: cat.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span>{cat.icon}</span> {cat.label}
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                  {t.title}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                  {t.client && <span>👤 {t.client}</span>}
                  {t.dueDate && (
                    <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                      📅 {formatDate(t.dueDate)} ⚠ scaduto
                    </span>
                  )}
                  {t.assignees?.length > 0 && (
                    <span>👥 {t.assignees.map(a => getMember(a)?.name?.split(" ")[0]).filter(Boolean).join(", ")}</span>
                  )}
                </div>
              </div>
            );
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                {card}
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── DASHBOARD ─────────────────────────────────────────────────────────────
const Dashboard = ({ state, dispatch, onOpenChat }) => {
  const { isMobile } = useViewport();
  const [showAIPlanner, setShowAIPlanner] = useState(false);
  const [activeQueue, setActiveQueue] = useState("personal");
  const uid = state.currentUserId;
  const role = getRoleType(uid);
  const me = getMember(uid);
  const allTasks = getActiveTasks(state.tasks);
  // Filtro permessi: solo task visibili all'utente
  const tasks = getVisibleTasks(allTasks, uid);

  const agentWorkload = getAssignableTeam().map(m => ({
    ...m,
    count: allTasks.filter(t => t.assignees?.includes(m.id) && t.status !== "done").length
  }));

  const next7 = tasks
    .filter(t => t.status !== "done" && t.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 6);

  // ─── 3 code distinte (v0.8) ───
  // Coda globale: task non assegnati (Driver non la vede)
  const showGlobalQueue = role !== "driver";
  const unassigned = showGlobalQueue
    ? allTasks.filter(t => isInGlobalQueue(t) && canViewTask(t, uid)).sort((a, b) => {
        const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const dp = prioOrder[a.priority] - prioOrder[b.priority];
        if (dp !== 0) return dp;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      })
    : [];

  // Coda personale: task dove sono assegnatario, non completati
  const personalQueue = allTasks
    .filter(t => isMyTask(t, uid) && t.status !== "done")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

  // Urgenti altrui: task con scadenza < 24h, non mie, non in coda globale (Driver non li vede)
  const showUrgentOthers = role !== "driver" && role !== "admin";
  const urgentOthers = showUrgentOthers
    ? allTasks
      .filter(t => !isMyTask(t, uid) && !isInGlobalQueue(t) && isUrgent(t))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    : [];

  // Scadute: tutti i task visibili scaduti, non completati
  const overdueTasks = tasks
    .filter(t => t.status !== "done" && isOverdue(t))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const takeOwnership = (task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: { id: task.id, assignees: [uid] }
    });
  };

  const firstName = me?.name?.split(" ")[0] || "ciao";

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24, minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700 }}>
            Buongiorno, {firstName} ☀️
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 2 }}>
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            {role !== "admin" && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", background: "var(--surface3)", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.3 }}>{me?.role}</span>}
          </div>
        </div>
        <button onClick={() => setShowAIPlanner(true)} style={{
          background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%)",
          color: "var(--navy)", border: "none",
          padding: "10px 18px", borderRadius: 8, cursor: "pointer",
          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 4px 14px rgba(212,168,67,0.4)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(212,168,67,0.5)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(212,168,67,0.4)"; }}
        >
          <span>✨</span> Pianifica la mia giornata
        </button>
      </div>

      {/* ─── BACHECA AVVISI ─── */}
      <NoticeBoard notices={state.notices} dispatch={dispatch} />

      {/* ─── TAB CODE ─── */}
      <div style={{
        background: "#fff", borderRadius: 12, padding: isMobile ? 8 : 10,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: `repeat(${(showGlobalQueue ? 1 : 0) + 1 + 1 + (showUrgentOthers ? 1 : 0)}, 1fr)`,
        gap: isMobile ? 6 : 8,
      }}>
        {showGlobalQueue && (
          <QueueTab
            active={activeQueue === "global"}
            onClick={() => setActiveQueue("global")}
            icon="🌐" label="Coda Globale" count={unassigned.length}
            isMobile={isMobile}
          />
        )}
        <QueueTab
          active={activeQueue === "personal"}
          onClick={() => setActiveQueue("personal")}
          icon="👤" label="Coda Personale" count={personalQueue.length}
          isMobile={isMobile}
        />
        <QueueTab
          active={activeQueue === "overdue"}
          onClick={() => setActiveQueue("overdue")}
          icon="📅" label="Scadute" count={overdueTasks.length}
          isMobile={isMobile} dangerCount
        />
        {showUrgentOthers && (
          <QueueTab
            active={activeQueue === "urgent"}
            onClick={() => setActiveQueue("urgent")}
            icon="⚠️" label="Urgenti" count={urgentOthers.length}
            isMobile={isMobile} dangerCount
          />
        )}
      </div>

      {/* ─── SEZIONE CODA FILTRATA ─── */}
      {activeQueue === "personal" && (
        <PersonalQueue tasks={personalQueue} dispatch={dispatch} me={me} />
      )}
      {activeQueue === "global" && showGlobalQueue && (
        <UnassignedQueue tasks={unassigned} dispatch={dispatch} onTake={takeOwnership} />
      )}
      {activeQueue === "overdue" && (
        <OverdueQueue tasks={overdueTasks} dispatch={dispatch} />
      )}
      {activeQueue === "urgent" && showUrgentOthers && (
        <UrgentOthersQueue tasks={urgentOthers} dispatch={dispatch} onOpenChat={onOpenChat} uid={uid} />
      )}

      <div className="vd-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Upcoming deadlines */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Scadenze Prossime</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {next7.map(t => (
              <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: 8, cursor: "pointer", transition: "background 0.15s",
                  background: isOverdue(t) ? "rgba(192,57,43,0.05)" : "transparent",
                  border: `1px solid ${isOverdue(t) ? "rgba(192,57,43,0.15)" : "var(--border)"}`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = isOverdue(t) ? "rgba(192,57,43,0.05)" : "transparent"}
              >
                <span style={{ fontSize: 16 }}>{CATEGORIES[t.category]?.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: isOverdue(t) ? "var(--danger)" : "var(--text-muted)" }}>
                    {isOverdue(t) ? "⚠️ Scaduto • " : ""}{formatDate(t.dueDate)}
                  </div>
                </div>
                <PriorityBadge priority={t.priority} />
              </div>
            ))}
          </div>
        </div>

        {/* Agent workload */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Carico di Lavoro Team</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {agentWorkload.map(m => {
              const pct = Math.min(100, Math.round((m.count / m.capacity) * 100));
              const barColor = pct > 85 ? "var(--danger)" : pct > 65 ? "var(--warning)" : "var(--success)";
              return (
                <div key={m.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                    <Avatar memberId={m.id} size={30} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: barColor }}>{m.count}/{m.capacity}</div>
                  </div>
                  <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showAIPlanner && <AIDayPlanner tasks={tasks} onClose={() => setShowAIPlanner(false)} />}
    </div>
  );
};

// ─── QUICK ADD TASK FORM ───────────────────────────────────────────────────
const QuickAddTask = ({ onAdd, onClose, clients, suppliers, dispatch }) => {
  // Categorie filtrate per il ruolo dell'utente loggato (v0.8)
  const availableCats = getAvailableCategories(CURRENT_USER);
  const firstCatKey = Object.keys(availableCats)[0] || "booking";

  const [form, setForm] = useState({
    title: "", category: firstCatKey, priority: "medium",
    status: "todo", assignees: [], dueDate: "",
    clientId: "", supplierId: "", description: ""
  });
  const [showClientCreate, setShowClientCreate] = useState(false);
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);

  // Anagrafiche attive ordinate alfabeticamente per i picker (v0.9.5/v0.9.7)
  const activeClients = (clients || [])
    .filter(c => !c.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeSuppliers = (suppliers || [])
    .filter(s => !s.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const selectedClient = activeClients.find(c => c.id === form.clientId);
    const selectedSupplier = activeSuppliers.find(s => s.id === form.supplierId);
    onAdd({
      id: "t" + Date.now(),
      title: form.title,
      category: form.category,
      priority: form.priority,
      status: form.status,
      assignees: form.assignees,
      clientId: selectedClient?.id || null,
      client: selectedClient?.name || null,
      supplierId: selectedSupplier?.id || null,
      description: form.description,
      comments: [],
      estimatedHours: 1,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
    });
    onClose();
  };

  const inp = (field) => ({
    value: form[field],
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
    style: {
      width: "100%", border: "1px solid var(--border)", borderRadius: 8,
      padding: "8px 10px", fontSize: 13, background: "var(--surface)",
      outline: "none", fontFamily: "inherit",
    }
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 14, padding: 28, width: 500, maxWidth: "100%",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 30px 80px rgba(0,0,0,0.2)", border: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div className="playfair" style={{ fontSize: 20, fontWeight: 700 }}>Nuovo Task</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>TITOLO *</label>
            <input {...inp("title")} placeholder="Descrivi brevemente il task..." />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>CATEGORIA</label>
              <select {...inp("category")} style={{ ...inp("category").style, cursor: "pointer" }}>
                {Object.entries(availableCats).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>PRIORITÀ</label>
              <select {...inp("priority")} style={{ ...inp("priority").style, cursor: "pointer" }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>ASSEGNA A</label>
              <select
                value={form.assignees[0] || ""}
                onChange={e => setForm(p => ({ ...p, assignees: e.target.value ? [e.target.value] : [] }))}
                style={{ ...inp("category").style, cursor: "pointer" }}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>SCADENZA</label>
              <input type="datetime-local" {...inp("dueDate")} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>CLIENTE</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={form.clientId}
                onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}
                style={{ ...inp("category").style, cursor: "pointer", flex: 1 }}
              >
                <option value="">— Nessuno —</option>
                {activeClients.map(c => {
                  const type = CLIENT_TYPES[c.type] || CLIENT_TYPES.individuale;
                  return <option key={c.id} value={c.id}>{type.icon} {c.name}</option>;
                })}
              </select>
              {canManageClients(CURRENT_USER) && (
                <button
                  type="button"
                  onClick={() => setShowClientCreate(true)}
                  title="Crea nuovo cliente"
                  style={{
                    padding: "0 12px", borderRadius: 8, border: "1px solid var(--navy)",
                    background: "#fff", color: "var(--navy)", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >+ Nuovo</button>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>FORNITORE</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={form.supplierId}
                onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))}
                style={{ ...inp("category").style, cursor: "pointer", flex: 1 }}
              >
                <option value="">— Nessuno —</option>
                {activeSuppliers.map(s => {
                  const type = SUPPLIER_TYPES[s.type] || SUPPLIER_TYPES.other;
                  return <option key={s.id} value={s.id}>{type.icon} {s.name}</option>;
                })}
              </select>
              {canManageSuppliers(CURRENT_USER) && (
                <button
                  type="button"
                  onClick={() => setShowSupplierCreate(true)}
                  title="Crea nuovo fornitore"
                  style={{
                    padding: "0 12px", borderRadius: 8, border: "1px solid var(--navy)",
                    background: "#fff", color: "var(--navy)", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >+ Nuovo</button>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>DESCRIZIONE</label>
            <textarea {...inp("description")} rows={3} placeholder="Dettagli del task..." style={{ ...inp("description").style, resize: "vertical" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500
          }}>Annulla</button>
          <button onClick={handleSubmit} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600
          }}>✓ Crea Task</button>
        </div>
      </div>

      {/* Modale "Nuovo cliente" inline (v0.9.5) — pre-seleziona il cliente appena creato */}
      {showClientCreate && (
        <ClientEditModal
          client={null}
          onClose={() => setShowClientCreate(false)}
          dispatch={dispatch}
          canManage={true}
          onCreated={(c) => setForm(p => ({ ...p, clientId: c.id }))}
        />
      )}

      {/* Modale "Nuovo fornitore" inline (v0.9.7) — analoga a sopra */}
      {showSupplierCreate && (
        <SupplierEditModal
          supplier={null}
          onClose={() => setShowSupplierCreate(false)}
          dispatch={dispatch}
          canManage={true}
          onCreated={(s) => setForm(p => ({ ...p, supplierId: s.id }))}
        />
      )}
    </div>
  );
};

// ─── TASK DETAIL SLIDE-OVER ────────────────────────────────────────────────
const TaskSlideOver = ({ task, dispatch, clients, suppliers }) => {
  const { isMobile } = useViewport();
  const [newComment, setNewComment] = useState("");
  const [editingAssignees, setEditingAssignees] = useState(false);
  const [draftAssignees, setDraftAssignees] = useState(task?.assignees || []);
  const canEdit = task ? canEditTask(task, CURRENT_USER) : false;
  // v0.9.5: risolvi il cliente dall'anagrafica via clientId o mappa legacy
  const linkedClient = task ? getClient(clients || [], resolveLegacyClientId(task)) : null;
  // v0.9.7: risolvi il fornitore dall'anagrafica via supplierId
  const linkedSupplier = task ? getSupplier(suppliers || [], task.supplierId) : null;

  // Resetta la bozza se cambia il task aperto o se l'editor viene chiuso
  useEffect(() => {
    setDraftAssignees(task?.assignees || []);
    setEditingAssignees(false);
  }, [task?.id]);

  if (!task) return null;

  const handleComment = () => {
    if (!newComment.trim()) return;
    const me = getMember(CURRENT_USER);
    dispatch({
      type: "ADD_COMMENT", payload: {
        taskId: task.id,
        comment: { user: me?.name || "Utente", text: newComment, time: new Date().toISOString() }
      }
    });
    setNewComment("");
  };

  const handleStatusChange = (e) => {
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: e.target.value } });
  };

  const handleDelete = () => {
    if (window.confirm(`Spostare nel cestino "${task.title}"?`)) {
      dispatch({ type: "DELETE_TASK", payload: task.id });
    }
  };

  const toggleDraftAssignee = (id) => {
    setDraftAssignees(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const saveAssignees = () => {
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, assignees: draftAssignees } });
    setEditingAssignees(false);
  };

  const cancelAssigneeEdit = () => {
    setDraftAssignees(task.assignees || []);
    setEditingAssignees(false);
  };

  return (
    <>
      <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })}
        style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 500 }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 480, height: "100vh",
        background: "#fff", zIndex: 600, boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          background: "var(--navy)", padding: "18px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <CategoryChip category={task.category} />
              <PriorityBadge priority={task.priority} />
              {isOverdue(task) && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "#FEE2E2", padding: "2px 8px", borderRadius: 99 }}>⚠️ Scaduto</span>}
            </div>
            <div className="playfair" style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{task.title}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={handleDelete} title="Sposta nel cestino" style={{
              background: "rgba(220,38,38,0.15)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 13,
              transition: "background 0.2s"
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,0.4)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(220,38,38,0.15)"}
            >🗑️</button>
            <button onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })} style={{
              background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Status select */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>STATO</div>
              <select value={task.status} onChange={handleStatusChange} style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "7px 10px", fontSize: 13, fontFamily: "inherit",
                background: "white", cursor: "pointer"
              }}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>SCADENZA</div>
              <div style={{ fontSize: 13, fontWeight: 500, padding: "7px 10px", background: "var(--surface2)", borderRadius: 8 }}>
                {formatDate(task.dueDate)} {formatTime(task.dueDate) && `ore ${formatTime(task.dueDate)}`}
              </div>
            </div>
          </div>

          {/* Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>ASSEGNATI</span>
                {canEdit && !editingAssignees && (
                  <button
                    onClick={() => setEditingAssignees(true)}
                    title="Modifica assegnatari"
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--navy)", fontSize: 11, fontWeight: 600, padding: 0,
                    }}
                  >✎ modifica</button>
                )}
              </div>

              {!editingAssignees && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {task.assignees?.map(id => {
                    const m = getMember(id);
                    return m ? (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface2)", padding: "4px 8px", borderRadius: 99 }}>
                        <Avatar memberId={id} size={20} />
                        <span style={{ fontSize: 12 }}>{m.name.split(" ")[0]}</span>
                      </div>
                    ) : null;
                  })}
                  {!task.assignees?.length && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Non assegnato</span>}
                </div>
              )}

              {editingAssignees && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {getAssignableTeam().map(m => {
                      const on = draftAssignees.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleDraftAssignee(m.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            background: on ? m.color : "var(--surface2)",
                            color: on ? "#fff" : "var(--text)",
                            border: on ? "1px solid " + m.color : "1px solid var(--border)",
                            padding: "4px 9px", borderRadius: 99, cursor: "pointer",
                            fontSize: 12, fontFamily: "inherit", transition: "all 0.15s",
                          }}
                        >
                          <Avatar memberId={m.id} size={18} />
                          <span>{m.name.split(" ")[0]}</span>
                          {on && <span style={{ marginLeft: 2, fontSize: 10 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={saveAssignees} style={{
                      padding: "6px 12px", borderRadius: 6, border: "none",
                      background: "var(--navy)", color: "#fff", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    }}>Salva</button>
                    <button onClick={cancelAssigneeEdit} style={{
                      padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)",
                      background: "transparent", color: "var(--text)", cursor: "pointer",
                      fontSize: 12, fontFamily: "inherit",
                    }}>Annulla</button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>CLIENTE</div>
              {linkedClient ? (
                <button
                  onClick={() => dispatch({ type: "SET_SELECTED_CLIENT", payload: linkedClient })}
                  title="Apri scheda cliente"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", borderRadius: 99,
                    background: (CLIENT_TYPES[linkedClient.type] || CLIENT_TYPES.individuale).bg,
                    color: (CLIENT_TYPES[linkedClient.type] || CLIENT_TYPES.individuale).color,
                    border: "1px solid transparent", cursor: "pointer",
                    fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  }}
                >
                  <span>{(CLIENT_TYPES[linkedClient.type] || CLIENT_TYPES.individuale).icon}</span>
                  {linkedClient.name}
                  <span style={{ fontSize: 10, opacity: 0.7 }}>→</span>
                </button>
              ) : task.client ? (
                <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" }}>
                  {task.client}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>—</div>
              )}
            </div>
          </div>

          {/* FORNITORE (v0.9.7) — visibile solo se il task ha supplierId */}
          {linkedSupplier && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>FORNITORE</div>
              <button
                onClick={() => dispatch({ type: "SET_SELECTED_SUPPLIER", payload: linkedSupplier })}
                title="Apri scheda fornitore"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 99,
                  background: (SUPPLIER_TYPES[linkedSupplier.type] || SUPPLIER_TYPES.other).bg,
                  color: (SUPPLIER_TYPES[linkedSupplier.type] || SUPPLIER_TYPES.other).color,
                  border: "1px solid transparent", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                }}
              >
                <span>{(SUPPLIER_TYPES[linkedSupplier.type] || SUPPLIER_TYPES.other).icon}</span>
                {linkedSupplier.name}
                <span style={{ fontSize: 10, opacity: 0.7 }}>→</span>
              </button>
            </div>
          )}

          {/* ORE */}
          {task.estimatedHours && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>ORE STIMATE</div>
              <div style={{ fontSize: 13 }}>{task.estimatedHours}h</div>
            </div>
          )}

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>DESCRIZIONE</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", background: "var(--surface2)", padding: 12, borderRadius: 8 }}>
              {task.description || <span style={{ color: "var(--text-muted)" }}>Nessuna descrizione.</span>}
            </div>
          </div>

          {/* Attachments placeholder */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>ALLEGATI</div>
            <div style={{
              border: "2px dashed var(--border)", borderRadius: 8, padding: "20px",
              textAlign: "center", color: "var(--text-muted)", fontSize: 13, cursor: "pointer"
            }}>📎 Trascina file qui o clicca per caricare</div>
          </div>

          {/* Comments */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>
              ATTIVITÀ & COMMENTI ({task.comments?.length || 0})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(task.comments || []).map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "var(--navy)",
                    fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#fff", flexShrink: 0
                  }}>
                    {c.user.split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{c.user}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDate(c.time)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2, lineHeight: 1.5 }}>{c.text}</div>
                  </div>
                </div>
              ))}

              {/* New comment */}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", background: "var(--gold)",
                  fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
                  justifyContent: "center", color: "var(--navy)", flexShrink: 0
                }}>MF</div>
                <div style={{ flex: 1, display: "flex", gap: 6 }}>
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleComment()}
                    placeholder="Aggiungi un commento..."
                    style={{
                      flex: 1, border: "1px solid var(--border)", borderRadius: 8,
                      padding: "7px 10px", fontSize: 12, fontFamily: "inherit"
                    }} />
                  <button onClick={handleComment} style={{
                    background: "var(--navy)", color: "#fff", border: "none",
                    borderRadius: 8, padding: "0 12px", cursor: "pointer", fontSize: 13
                  }}>↑</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── CALENDAR PLANNER (unificato: mese + settimana + distribuzione agenti) ──
// v0.9.6: vista settimanale ridisegnata — desktop time-grid orario, mobile day-tab + lista
const WEEK_START_HOUR = 6;   // 06:00 prima riga
const WEEK_END_HOUR = 22;    // 22:00 esclusa (ultima riga è 21:00)
const WEEK_HOUR_COUNT = WEEK_END_HOUR - WEEK_START_HOUR;
const WEEK_ROW_HEIGHT = 56;  // px per ora (desktop)

const CalendarPlanner = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [viewMode, setViewMode] = useState("month"); // "month" | "week"
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  // v0.9.6: indice del giorno selezionato in vista settimana mobile.
  // Quando si cambia settimana, riallineiamo all'eventuale "oggi" della nuova settimana.
  const [weekDayIdx, setWeekDayIdx] = useState(0);
  const uid = state.currentUserId;

  // ── Month helpers ──
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const getTasksForCalDay = (day) => {
    const d = new Date(year, month, day).toDateString();
    return state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate && new Date(t.dueDate).toDateString() === d);
  };

  // ── Week helpers ──
  const getWeekDays = (offset) => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  };
  const weekDays = getWeekDays(weekOffset);
  const dayNames = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  // ── Distribuzione agenti (settimana corrente in vista week, settimana del mese selezionato in vista month) ──
  const agentWeekDays = viewMode === "week" ? weekDays : (() => {
    // In vista mese, usiamo la settimana corrente
    return getWeekDays(0);
  })();

  // ── Vista settimana v2 (v0.9.6) ──
  // Quando cambia weekOffset, prova a riallineare il giorno mobile a "oggi" se è nella nuova settimana.
  useEffect(() => {
    const todayInWeek = weekDays.findIndex(d => d.toDateString() === new Date().toDateString());
    setWeekDayIdx(todayInWeek >= 0 ? todayInWeek : 0);
    // weekDays è ricalcolato a ogni render: useEffect su weekOffset basta
  }, [weekOffset]);

  // Task di un giorno *e* ora specifici (start = ora intera). Senza dueDate → esclusi.
  const getTasksForDayHour = (day, hour) =>
    state.tasks.filter(t => {
      if (!isActiveTask(t) || !canViewTask(t, uid) || !t.dueDate) return false;
      const td = new Date(t.dueDate);
      return td.toDateString() === day.toDateString() && td.getHours() === hour;
    });

  // Task all-day di un giorno (con dueDate ma fuori dal range orario visualizzato).
  // Pratico per task notturni o senza orario significativo.
  const getOffHourTasks = (day) =>
    state.tasks.filter(t => {
      if (!isActiveTask(t) || !canViewTask(t, uid) || !t.dueDate) return false;
      const td = new Date(t.dueDate);
      if (td.toDateString() !== day.toDateString()) return false;
      const h = td.getHours();
      return h < WEEK_START_HOUR || h >= WEEK_END_HOUR;
    });

  // Posizione "now line" rispetto alla griglia (null se oggi non è in questa settimana o fuori range)
  const nowLine = (() => {
    const now = new Date();
    const idx = weekDays.findIndex(d => d.toDateString() === now.toDateString());
    if (idx < 0) return null;
    const h = now.getHours() + now.getMinutes() / 60;
    if (h < WEEK_START_HOUR || h >= WEEK_END_HOUR) return null;
    return { dayIdx: idx, top: (h - WEEK_START_HOUR) * WEEK_ROW_HEIGHT };
  })();

  // Per la vista mobile: task del giorno selezionato ordinati per orario
  const selectedDayDate = weekDays[Math.max(0, Math.min(6, weekDayIdx))];
  const selectedDayTasksSorted = selectedDayDate
    ? state.tasks
        .filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate &&
          new Date(t.dueDate).toDateString() === selectedDayDate.toDateString())
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    : [];

  // ── Toggle style ──
  const toggleBtn = (mode, label) => (
    <button
      onClick={() => { setViewMode(mode); setSelectedDay(null); }}
      style={{
        background: viewMode === mode ? "var(--navy)" : "transparent",
        color: viewMode === mode ? "#fff" : "var(--text)",
        border: viewMode === mode ? "none" : "1px solid var(--border)",
        borderRadius: 8, padding: isMobile ? "6px 12px" : "6px 16px",
        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >{label}</button>
  );

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22 }}>

      {/* ─── Header con toggle + navigazione ─── */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, textTransform: viewMode === "month" ? "capitalize" : "none" }}>
            {viewMode === "month" ? monthName : "Settimana"}
          </div>
          {viewMode === "week" && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
              {weekDays[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — {weekDays[6].toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 4, background: "var(--surface2)", borderRadius: 10, padding: 3 }}>
            {toggleBtn("month", isMobile ? "Mese" : "📅 Mese")}
            {toggleBtn("week", isMobile ? "Sett." : "📆 Settimana")}
          </div>
          {/* Nav buttons */}
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => viewMode === "month" ? setCurrentMonth(new Date(year, month - 1)) : setWeekOffset(w => w - 1)} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>←</button>
            <button onClick={() => { viewMode === "month" ? setCurrentMonth(new Date()) : setWeekOffset(0); setSelectedDay(null); }} style={{
              background: "var(--gold)", color: "var(--navy)", border: "none",
              borderRadius: 8, padding: "0 14px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 700
            }}>Oggi</button>
            <button onClick={() => viewMode === "month" ? setCurrentMonth(new Date(year, month + 1)) : setWeekOffset(w => w + 1)} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>→</button>
          </div>
        </div>
      </div>

      {/* ─── VISTA MESE ─── */}
      {viewMode === "month" && (
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)", overflow: "hidden" }}>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--navy)", padding: "10px 0" }}>
            {dayNames.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`e${i}`} style={{ minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayTasks = getTasksForCalDay(day);
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              return (
                <div key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)} style={{
                  minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                  padding: isMobile ? "5px 3px" : "8px 6px", cursor: dayTasks.length ? "pointer" : "default",
                  background: selectedDay === day ? "rgba(212,168,67,0.08)" : "#fff",
                  transition: "background 0.15s", display: "flex", flexDirection: "column", alignItems: isMobile ? "center" : "stretch",
                }}>
                  <div style={{
                    width: isMobile ? 24 : 26, height: isMobile ? 24 : 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: isToday ? 700 : 400,
                    background: isToday ? "var(--navy)" : "transparent",
                    color: isToday ? "#fff" : "var(--text)", marginBottom: 4
                  }}>{day}</div>
                  {isMobile ? (
                    dayTasks.length > 0 && (
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
                        {dayTasks.slice(0, 4).map(t => (
                          <span key={t.id} style={{ width: 6, height: 6, borderRadius: "50%", background: CATEGORIES[t.category]?.color || "var(--navy)" }} />
                        ))}
                      </div>
                    )
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {dayTasks.slice(0, 3).map(t => (
                        <div key={t.id} onClick={e => { e.stopPropagation(); dispatch({ type: "SET_SELECTED_TASK", payload: t }); }} style={{
                          fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 3,
                          background: CATEGORIES[t.category]?.color + "20",
                          color: CATEGORIES[t.category]?.color,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          cursor: "pointer",
                        }}>{CATEGORIES[t.category]?.icon} {t.title}</div>
                      ))}
                      {dayTasks.length > 3 && <div style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 4 }}>+{dayTasks.length - 3} altri</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Day detail (month view) ─── */}
      {viewMode === "month" && selectedDay && (() => {
        const dayTasks = getTasksForCalDay(selectedDay);
        if (!dayTasks.length) return null;
        return (
          <div className="slide-up" style={{
            background: "#fff", borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 20px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)", border: "1px solid var(--border)"
          }}>
            <div className="playfair" style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
              Task del {selectedDay} {monthName}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayTasks.map(t => {
                const row = (
                  <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                    borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                    transition: "background 0.15s", background: "#fff",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <span style={{ fontSize: 18 }}>{CATEGORIES[t.category]?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.client ? `${t.client} • ` : ""}{formatTime(t.dueDate)}</div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                );
                return (
                  <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                    {row}
                  </SwipeActions>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── VISTA SETTIMANA — DESKTOP: time-grid orario ─── */}
      {viewMode === "week" && !isMobile && (
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid var(--border)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
        }}>
          {/* Header giorni */}
          <div style={{ display: "grid", gridTemplateColumns: "62px repeat(7, 1fr)", background: "var(--navy)" }}>
            <div style={{ padding: "10px 6px", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>Ora</div>
            {weekDays.map((day, i) => {
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div key={i} style={{
                  padding: "10px 6px", textAlign: "center",
                  background: isToday ? "var(--gold)" : "transparent",
                  color: isToday ? "var(--navy)" : "rgba(255,255,255,0.85)",
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{dayNames[i]}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Strip "all-day" / fuori orario, se ci sono task notturni o senza orario significativo */}
          {weekDays.some(d => getOffHourTasks(d).length > 0) && (
            <div style={{
              display: "grid", gridTemplateColumns: "62px repeat(7, 1fr)",
              background: "var(--surface2)", borderBottom: "1px solid var(--border)",
            }}>
              <div style={{
                padding: "6px 6px", fontSize: 9, fontWeight: 600, color: "var(--text-muted)",
                textAlign: "center", borderRight: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>FUORI ORARIO</div>
              {weekDays.map((day, i) => {
                const offTasks = getOffHourTasks(day);
                return (
                  <div key={i} style={{
                    padding: "4px 4px", borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                    display: "flex", flexDirection: "column", gap: 2,
                  }}>
                    {offTasks.map(t => {
                      const cat = CATEGORIES[t.category] || { color: "#6B7280", icon: "📋" };
                      return (
                        <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} title={t.title} style={{
                          background: cat.color + "18", borderLeft: `3px solid ${cat.color}`,
                          padding: "3px 6px", borderRadius: "0 4px 4px 0", cursor: "pointer",
                          fontSize: 10, color: "var(--text)", whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis",
                        }}>{cat.icon} {t.title}</div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Griglia oraria */}
          <div style={{ position: "relative" }}>
            {/* Now line: assoluta sopra tutto */}
            {nowLine && (
              <div style={{
                position: "absolute", left: 62, right: 0, top: nowLine.top,
                height: 2, background: "var(--danger)", zIndex: 5,
                pointerEvents: "none",
              }}>
                <div style={{
                  position: "absolute", left: `calc(${(100 / 7) * nowLine.dayIdx}% - 6px)`,
                  top: -5, width: 12, height: 12, borderRadius: "50%",
                  background: "var(--danger)", border: "2px solid #fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }} />
              </div>
            )}

            {/* Righe orarie */}
            {Array.from({ length: WEEK_HOUR_COUNT }, (_, hi) => {
              const hour = WEEK_START_HOUR + hi;
              return (
                <div key={hour} style={{
                  display: "grid", gridTemplateColumns: "62px repeat(7, 1fr)",
                  height: WEEK_ROW_HEIGHT, borderTop: "1px solid var(--surface3)",
                }}>
                  {/* Etichetta ora */}
                  <div style={{
                    fontSize: 11, color: "var(--text-muted)", padding: "3px 8px",
                    textAlign: "right", borderRight: "1px solid var(--border)",
                    fontVariantNumeric: "tabular-nums",
                  }}>{String(hour).padStart(2, "0")}:00</div>

                  {weekDays.map((day, di) => {
                    const tasks = getTasksForDayHour(day, hour);
                    const isToday = day.toDateString() === new Date().toDateString();
                    return (
                      <div key={di} style={{
                        borderLeft: di === 0 ? "none" : "1px solid var(--surface3)",
                        padding: "3px 4px",
                        display: "flex", flexDirection: "column", gap: 2,
                        background: isToday ? "rgba(212,168,67,0.04)" : "transparent",
                        overflow: "hidden",
                      }}>
                        {tasks.map(t => {
                          const cat = CATEGORIES[t.category] || { color: "#6B7280", icon: "📋" };
                          const prio = PRIORITIES[t.priority] || { color: "#6B7280" };
                          return (
                            <div
                              key={t.id}
                              onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                              title={`${t.title} — ${formatTime(t.dueDate)}`}
                              style={{
                                background: cat.color + "1a",
                                borderLeft: `3px solid ${cat.color}`,
                                borderRadius: "0 4px 4px 0",
                                padding: "3px 6px", cursor: "pointer",
                                fontSize: 11, lineHeight: 1.25,
                                color: "var(--text)", display: "flex", gap: 4, alignItems: "baseline",
                                overflow: "hidden",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = cat.color + "30"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = cat.color + "1a"; }}
                            >
                              <span style={{ fontSize: 10, fontWeight: 700, color: cat.color, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                                {formatTime(t.dueDate)}
                              </span>
                              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>
                                {cat.icon} {t.title}
                              </span>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: prio.color, flexShrink: 0 }} title={prio.label} />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── VISTA SETTIMANA — MOBILE: day tabs + lista verticale ─── */}
      {viewMode === "week" && isMobile && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Tab strip giorni con scroll snap */}
          <div style={{
            display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6,
            scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch",
          }}>
            {weekDays.map((day, i) => {
              const isToday = day.toDateString() === new Date().toDateString();
              const isActive = i === weekDayIdx;
              const count = state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate &&
                new Date(t.dueDate).toDateString() === day.toDateString()).length;
              return (
                <button
                  key={i}
                  onClick={() => setWeekDayIdx(i)}
                  style={{
                    flex: "0 0 auto", minWidth: 64, padding: "8px 10px",
                    borderRadius: 10, border: "none", cursor: "pointer",
                    background: isActive ? "var(--navy)" : isToday ? "var(--gold)" : "#fff",
                    color: isActive ? "#fff" : "var(--navy)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    fontFamily: "inherit", display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 2, scrollSnapAlign: "start",
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600, opacity: isActive ? 0.7 : 0.6, textTransform: "uppercase", letterSpacing: 0.5 }}>{dayNames[i]}</span>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>{day.getDate()}</span>
                  {count > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                      background: isActive ? "var(--gold)" : "var(--surface2)",
                      color: isActive ? "var(--navy)" : "var(--text-muted)",
                      marginTop: 1,
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Lista task del giorno */}
          <div style={{
            background: "#fff", borderRadius: 12, padding: "14px 12px",
            border: "1px solid var(--border)", boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
          }}>
            <div className="playfair" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: "var(--navy)" }}>
              {selectedDayDate?.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
              {selectedDayDate?.toDateString() === new Date().toDateString() && (
                <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "var(--gold)", color: "var(--navy)" }}>OGGI</span>
              )}
            </div>
            {selectedDayTasksSorted.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                🗓️ Nessun task per questo giorno.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selectedDayTasksSorted.map(t => {
                  const cat = CATEGORIES[t.category] || { color: "#6B7280", icon: "📋", label: t.category };
                  const prio = PRIORITIES[t.priority];
                  const card = (
                    <div
                      onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                      style={{
                        display: "flex", gap: 10, padding: 10, borderRadius: 10,
                        background: "#fff", border: "1px solid var(--border)",
                        borderLeft: `3px solid ${prio.color}`,
                        cursor: "pointer", alignItems: "stretch",
                      }}
                    >
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        minWidth: 54, padding: "2px 6px", borderRight: "1px solid var(--surface3)",
                        background: "var(--surface)", borderRadius: 6,
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: cat.color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                          {formatTime(t.dueDate)}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                            padding: "2px 7px", borderRadius: 99,
                            background: cat.bg || (cat.color + "18"), color: cat.color,
                          }}>{cat.icon} {cat.label}</span>
                          <StatusBadge status={t.status} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{t.title}</div>
                        {t.client && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>👤 {t.client}</div>}
                      </div>
                    </div>
                  );
                  return (
                    <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                      {card}
                    </SwipeActions>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── DISTRIBUZIONE AGENTI (sempre visibile) ─── */}
      <div style={{ background: "#fff", borderRadius: 12, padding: isMobile ? "14px 12px" : "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
        <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Distribuzione Settimanale per Agente</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", background: "var(--surface2)", borderRadius: "8px 0 0 0", fontWeight: 600, fontSize: 11, color: "var(--text-muted)", width: 150 }}>Agente</th>
                {agentWeekDays.map((d, i) => (
                  <th key={i} style={{
                    padding: "8px 6px", background: "var(--surface2)", fontSize: 11, fontWeight: 600,
                    color: d.toDateString() === new Date().toDateString() ? "var(--gold)" : "var(--text-muted)",
                    textAlign: "center", minWidth: 70
                  }}>
                    {dayNames[i]}<br />{d.getDate()}
                  </th>
                ))}
                <th style={{ padding: "8px 6px", background: "var(--surface2)", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", borderRadius: "0 8px 0 0" }}>TOT</th>
              </tr>
            </thead>
            <tbody>
              {getAssignableTeam().map(m => (
                <tr key={m.id}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar memberId={m.id} size={24} />
                      <span style={{ fontWeight: 500 }}>{m.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {agentWeekDays.map((day, i) => {
                    const count = state.tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      new Date(t.dueDate).toDateString() === day.toDateString()
                    ).length;
                    return (
                      <td key={i} style={{
                        padding: "8px 6px", textAlign: "center", borderBottom: "1px solid var(--border)",
                        background: count > 0 ? m.color + "12" : "transparent",
                      }}>
                        {count > 0 ? (
                          <span style={{ fontWeight: 700, color: m.color, fontSize: 14 }}>{count}</span>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--navy)" }}>
                    {state.tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      agentWeekDays.some(d => new Date(t.dueDate).toDateString() === d.toDateString())
                    ).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
const Team = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [selectedMember, setSelectedMember] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const uid = state.currentUserId;

  const memberTasks = (memberId) =>
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.assignees?.includes(memberId));

  const filtered = selectedMember
    ? memberTasks(selectedMember).filter(t => !filterStatus || t.status === filterStatus)
    : [];

  const roleColors = { Manager: "#0F2044", "Senior Agent": "#2D7A4F", "Junior Agent": "#C8832A", Driver: "#7B4F9E", Admin: "#C0392B" };

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28 }}>
      <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, marginBottom: 22 }}>Team & Assegnazioni</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16, marginBottom: 28 }}>
        {getAssignableTeam().map(m => {
          const tasks = memberTasks(m.id);
          const active = tasks.filter(t => t.status !== "done");
          const done = tasks.filter(t => t.status === "done");
          const pct = Math.min(100, Math.round((active.length / m.capacity) * 100));
          const barColor = pct > 85 ? "var(--danger)" : pct > 65 ? "var(--warning)" : "var(--success)";
          const isSelected = selectedMember === m.id;

          return (
            <div key={m.id} className="hover-lift" onClick={() => setSelectedMember(isSelected ? null : m.id)} style={{
              background: "#fff", borderRadius: 12, padding: "20px 16px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `2px solid ${isSelected ? m.color : "var(--border)"}`,
              cursor: "pointer", textAlign: "center", transition: "all 0.2s",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: m.color,
                fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", margin: "0 auto 10px"
              }}>{m.avatar}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 99,
                background: roleColors[m.role] + "15", color: roleColors[m.role], marginTop: 4, display: "inline-block"
              }}>{m.role}</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12, marginBottom: 8 }}>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{active.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Attivi</div>
                </div>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--success)" }}>{done.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Completati</div>
                </div>
              </div>

              <div style={{ height: 5, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{active.length}/{m.capacity} capacità</div>
            </div>
          );
        })}
      </div>

      {selectedMember && (() => {
        const m = getMember(selectedMember);
        if (!m) return null;
        return (
          <div className="slide-up" style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar memberId={selectedMember} size={40} />
                <div>
                  <div className="playfair" style={{ fontSize: 16, fontWeight: 700 }}>Task di {m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
                border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer"
              }}>
                <option value="">Tutti gli stati</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 14 }}>
                  Nessun task trovato per questo filtro
                </div>
              ) : filtered.map(t => (
                <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                  transition: "background 0.15s"
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontSize: 18 }}>{CATEGORIES[t.category]?.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {t.client && `👤 ${t.client} • `}📅 {formatDate(t.dueDate)}
                    </div>
                  </div>
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── CLIENTI: vista lista + modal CRUD (v0.9.5) ────────────────────────────
const ClientsView = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const uid = state.currentUserId;
  const canManage = canManageClients(uid);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showTrashed, setShowTrashed] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const clientsAll = state.clients || [];
  const activeClients = clientsAll.filter(c => showTrashed ? !!c.deletedAt : !c.deletedAt);

  // Conteggio task attivi collegati per cliente (anche via mappa legacy)
  const taskCountByClient = useMemo(() => {
    const map = new Map();
    (state.tasks || []).forEach(t => {
      if (t.deletedAt) return;
      const cid = resolveLegacyClientId(t);
      if (!cid) return;
      map.set(cid, (map.get(cid) || 0) + 1);
    });
    return map;
  }, [state.tasks]);

  const filtered = activeClients.filter(c => {
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${c.name} ${c.contactPerson || ""} ${c.email || ""} ${c.phone || ""} ${c.notes || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
      {/* Header */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700 }}>
            🧳 Clienti
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
            {clientsAll.filter(c => !c.deletedAt).length} clienti attivi · {filtered.length} in elenco
          </div>
        </div>
        {canManage && !showTrashed && (
          <button onClick={() => setShowNew(true)} style={{
            background: "var(--navy)", color: "#fff", border: "none",
            padding: "10px 16px", borderRadius: 8, cursor: "pointer",
            fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6,
          }}>+ Nuovo cliente</button>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, referente, email, note…"
          style={{
            flex: "1 1 240px", border: "1px solid var(--border)", borderRadius: 8,
            padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px",
            fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer",
          }}
        >
          <option value="all">Tutti i tipi</option>
          {Object.entries(CLIENT_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showTrashed} onChange={e => setShowTrashed(e.target.checked)} />
          Mostra rimossi
        </label>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{
          padding: "40px 20px", textAlign: "center", color: "var(--text-muted)",
          fontSize: 13, background: "#fff", borderRadius: 10, border: "1px dashed var(--border)",
        }}>
          {search || typeFilter !== "all"
            ? "Nessun cliente corrisponde ai filtri."
            : showTrashed
              ? "Nessun cliente rimosso."
              : 'Ancora nessun cliente. Premi "Nuovo cliente" per crearne uno.'}
        </div>
      ) : (
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {filtered.map(c => {
            const type = CLIENT_TYPES[c.type] || CLIENT_TYPES.individuale;
            const taskCount = taskCountByClient.get(c.id) || 0;
            return (
              <div
                key={c.id}
                onClick={() => dispatch({ type: "SET_SELECTED_CLIENT", payload: c })}
                style={{
                  background: "#fff", borderRadius: 10, padding: 14, cursor: "pointer",
                  border: "1px solid var(--border)", borderLeft: `3px solid ${type.color}`,
                  display: "flex", flexDirection: "column", gap: 8,
                  transition: "transform 0.15s, box-shadow 0.15s",
                  opacity: c.deletedAt ? 0.6 : 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", borderRadius: 999,
                    background: type.bg, color: type.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span>{type.icon}</span> {type.label}
                  </span>
                  {taskCount > 0 && (
                    <span style={{
                      background: "var(--surface2)", color: "var(--text-muted)",
                      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                    }} title={`${taskCount} task attivi collegati`}>📋 {taskCount}</span>
                  )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>
                  {c.name}
                </div>
                {c.contactPerson && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>👤 {c.contactPerson}</div>
                )}
                {(c.email || c.phone) && (
                  <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
                    {c.email && <span style={{ wordBreak: "break-all" }}>✉️ {c.email}</span>}
                    {c.phone && <span>☎️ {c.phone}</span>}
                  </div>
                )}
                {c.notes && (
                  <div style={{
                    fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.45,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>{c.notes}</div>
                )}
                {c.deletedAt && (
                  <div style={{ fontSize: 10, color: "var(--danger)", fontStyle: "italic" }}>
                    Rimosso il {formatDate(c.deletedAt)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modale "Nuovo cliente" — locale alla vista (entry point dedicato).
          La modale di modifica è renderizzata a livello root (vedi VoyageDeskInner)
          così può essere aperta anche da chip cliente nel TaskSlideOver. */}
      {showNew && canManage && (
        <ClientEditModal
          client={null}
          onClose={() => setShowNew(false)}
          dispatch={dispatch}
          canManage={canManage}
        />
      )}
    </div>
  );
};

// Modale creazione/modifica/lettura di un cliente.
// - client === null → modalità creazione.
// - canManage === false → modalità sola lettura (utile per quando viene aperto da TaskSlideOver).
// - onCreated(newClient) → callback opzionale per pre-selezionare un cliente appena creato
//   dal picker in QuickAddTask.
const ClientEditModal = ({ client, onClose, dispatch, canManage, taskCount = 0, onCreated }) => {
  const isNew = !client;
  const [form, setForm] = useState({
    name: client?.name || "",
    type: client?.type || "famiglia",
    contactPerson: client?.contactPerson || "",
    email: client?.email || "",
    phone: client?.phone || "",
    notes: client?.notes || "",
  });

  const handleSave = () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      type: form.type,
      contactPerson: form.contactPerson.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim(),
    };
    if (isNew) {
      const newClient = { id: `cl-${Date.now()}`, ...payload };
      dispatch({ type: "ADD_CLIENT", payload: newClient });
      if (onCreated) onCreated(newClient);
    } else {
      dispatch({ type: "UPDATE_CLIENT", payload: { id: client.id, ...payload } });
    }
    onClose();
  };

  const handleDelete = () => {
    if (!client) return;
    const hint = taskCount > 0
      ? `\n\n${taskCount} task collegati continueranno a mostrare il nome del cliente (campo legacy).`
      : "";
    if (!window.confirm(`Rimuovere "${client.name}" dall'anagrafica clienti?${hint}`)) return;
    dispatch({ type: "DELETE_CLIENT", payload: client.id });
    onClose();
  };

  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
    fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", outline: "none",
  };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 };
  const readOnly = !canManage || !!client?.deletedAt;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, padding: 16 }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 12, padding: 24, width: 560, maxWidth: "100%",
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="playfair" style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)" }}>
              {isNew ? "Nuovo cliente" : client.name}
            </div>
            {!isNew && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {taskCount > 0 && <span>📋 {taskCount} task collegati</span>}
                <span>Creato il {formatDate(client.createdAt)}</span>
                {client.updatedAt && client.updatedAt !== client.createdAt && <span>Aggiornato il {formatDate(client.updatedAt)}</span>}
                {client.deletedAt && <span style={{ color: "var(--danger)" }}>· Rimosso</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Nome *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              disabled={readOnly}
              placeholder="Es. Famiglia Rossi"
              style={inputStyle}
            />
          </div>

          <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Tipologia</label>
              <select
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                disabled={readOnly}
                style={{ ...inputStyle, cursor: readOnly ? "default" : "pointer" }}
              >
                {Object.entries(CLIENT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Referente</label>
              <input
                value={form.contactPerson}
                onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))}
                disabled={readOnly}
                placeholder="Persona di contatto"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                disabled={readOnly}
                placeholder="cliente@example.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                disabled={readOnly}
                placeholder="+39 333 1234567"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Note</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              disabled={readOnly}
              rows={5}
              placeholder="Preferenze, budget, allergie, dettagli operativi…"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 20, flexWrap: "wrap" }}>
          {!isNew && canManage && !client?.deletedAt && (
            <button onClick={handleDelete} style={{
              padding: "9px 16px", borderRadius: 8, border: "1px solid var(--danger)",
              background: "transparent", color: "var(--danger)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}>🗑 Rimuovi cliente</button>
          )}
          <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
            <button onClick={onClose} style={{
              padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
              background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
            }}>{readOnly ? "Chiudi" : "Annulla"}</button>
            {!readOnly && (
              <button onClick={handleSave} disabled={!form.name.trim()} style={{
                padding: "9px 20px", borderRadius: 8, border: "none",
                background: form.name.trim() ? "var(--navy)" : "var(--text-light)",
                color: "#fff", cursor: form.name.trim() ? "pointer" : "not-allowed",
                fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              }}>{isNew ? "✓ Crea cliente" : "💾 Salva"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── FORNITORI: vista lista + modal CRUD (v0.9.7) ──────────────────────────
// Stretto mirror di ClientsView per consistenza UX.
const SuppliersView = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const uid = state.currentUserId;
  const canManage = canManageSuppliers(uid);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showTrashed, setShowTrashed] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const suppliersAll = state.suppliers || [];
  const activeSuppliers = suppliersAll.filter(s => showTrashed ? !!s.deletedAt : !s.deletedAt);

  // Conteggio task attivi collegati per fornitore
  const taskCountBySupplier = useMemo(() => {
    const map = new Map();
    (state.tasks || []).forEach(t => {
      if (t.deletedAt || !t.supplierId) return;
      map.set(t.supplierId, (map.get(t.supplierId) || 0) + 1);
    });
    return map;
  }, [state.tasks]);

  const filtered = activeSuppliers.filter(s => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${s.name} ${s.contactPerson || ""} ${s.email || ""} ${s.phone || ""} ${s.services || ""} ${s.notes || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
      {/* Header */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700 }}>
            🤝 Fornitori
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
            {suppliersAll.filter(s => !s.deletedAt).length} fornitori attivi · {filtered.length} in elenco
          </div>
        </div>
        {canManage && !showTrashed && (
          <button onClick={() => setShowNew(true)} style={{
            background: "var(--navy)", color: "#fff", border: "none",
            padding: "10px 16px", borderRadius: 8, cursor: "pointer",
            fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6,
          }}>+ Nuovo fornitore</button>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, referente, servizi, note…"
          style={{
            flex: "1 1 240px", border: "1px solid var(--border)", borderRadius: 8,
            padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px",
            fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer",
          }}
        >
          <option value="all">Tutti i tipi</option>
          {Object.entries(SUPPLIER_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showTrashed} onChange={e => setShowTrashed(e.target.checked)} />
          Mostra rimossi
        </label>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{
          padding: "40px 20px", textAlign: "center", color: "var(--text-muted)",
          fontSize: 13, background: "#fff", borderRadius: 10, border: "1px dashed var(--border)",
        }}>
          {search || typeFilter !== "all"
            ? "Nessun fornitore corrisponde ai filtri."
            : showTrashed
              ? "Nessun fornitore rimosso."
              : 'Ancora nessun fornitore. Premi "Nuovo fornitore" per crearne uno.'}
        </div>
      ) : (
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {filtered.map(s => {
            const type = SUPPLIER_TYPES[s.type] || SUPPLIER_TYPES.other;
            const taskCount = taskCountBySupplier.get(s.id) || 0;
            return (
              <div
                key={s.id}
                onClick={() => dispatch({ type: "SET_SELECTED_SUPPLIER", payload: s })}
                style={{
                  background: "#fff", borderRadius: 10, padding: 14, cursor: "pointer",
                  border: "1px solid var(--border)", borderLeft: `3px solid ${type.color}`,
                  display: "flex", flexDirection: "column", gap: 8,
                  transition: "transform 0.15s, box-shadow 0.15s",
                  opacity: s.deletedAt ? 0.6 : 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", borderRadius: 999,
                    background: type.bg, color: type.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span>{type.icon}</span> {type.label}
                  </span>
                  {taskCount > 0 && (
                    <span style={{
                      background: "var(--surface2)", color: "var(--text-muted)",
                      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                    }} title={`${taskCount} task attivi collegati`}>📋 {taskCount}</span>
                  )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>
                  {s.name}
                </div>
                {s.contactPerson && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>👤 {s.contactPerson}</div>
                )}
                {(s.email || s.phone) && (
                  <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
                    {s.email && <span style={{ wordBreak: "break-all" }}>✉️ {s.email}</span>}
                    {s.phone && <span>☎️ {s.phone}</span>}
                  </div>
                )}
                {s.services && (
                  <div style={{
                    fontSize: 12, color: "var(--text)", marginTop: 4, lineHeight: 1.45,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    background: "var(--surface)", padding: "6px 8px", borderRadius: 6,
                  }}>{s.services}</div>
                )}
                {s.deletedAt && (
                  <div style={{ fontSize: 10, color: "var(--danger)", fontStyle: "italic" }}>
                    Rimosso il {formatDate(s.deletedAt)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modale "Nuovo fornitore" — locale alla vista */}
      {showNew && canManage && (
        <SupplierEditModal
          supplier={null}
          onClose={() => setShowNew(false)}
          dispatch={dispatch}
          canManage={canManage}
        />
      )}
    </div>
  );
};

// Modale creazione/modifica/lettura di un fornitore.
// Mirror di ClientEditModal.
const SupplierEditModal = ({ supplier, onClose, dispatch, canManage, taskCount = 0, onCreated }) => {
  const isNew = !supplier;
  const [form, setForm] = useState({
    name: supplier?.name || "",
    type: supplier?.type || "hotel",
    contactPerson: supplier?.contactPerson || "",
    email: supplier?.email || "",
    phone: supplier?.phone || "",
    address: supplier?.address || "",
    services: supplier?.services || "",
    notes: supplier?.notes || "",
  });

  const handleSave = () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      type: form.type,
      contactPerson: form.contactPerson.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      services: form.services.trim(),
      notes: form.notes.trim(),
    };
    if (isNew) {
      const newSupplier = { id: `sp-${Date.now()}`, ...payload };
      dispatch({ type: "ADD_SUPPLIER", payload: newSupplier });
      if (onCreated) onCreated(newSupplier);
    } else {
      dispatch({ type: "UPDATE_SUPPLIER", payload: { id: supplier.id, ...payload } });
    }
    onClose();
  };

  const handleDelete = () => {
    if (!supplier) return;
    const hint = taskCount > 0
      ? `\n\n${taskCount} task collegati continueranno a esistere senza riferimento fornitore.`
      : "";
    if (!window.confirm(`Rimuovere "${supplier.name}" dall'anagrafica fornitori?${hint}`)) return;
    dispatch({ type: "DELETE_SUPPLIER", payload: supplier.id });
    onClose();
  };

  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
    fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", outline: "none",
  };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 };
  const readOnly = !canManage || !!supplier?.deletedAt;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, padding: 16 }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 12, padding: 24, width: 580, maxWidth: "100%",
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="playfair" style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)" }}>
              {isNew ? "Nuovo fornitore" : supplier.name}
            </div>
            {!isNew && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {taskCount > 0 && <span>📋 {taskCount} task collegati</span>}
                <span>Creato il {formatDate(supplier.createdAt)}</span>
                {supplier.updatedAt && supplier.updatedAt !== supplier.createdAt && <span>Aggiornato il {formatDate(supplier.updatedAt)}</span>}
                {supplier.deletedAt && <span style={{ color: "var(--danger)" }}>· Rimosso</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Nome / Ragione sociale *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              disabled={readOnly}
              placeholder="Es. Autoservizi Meridionali NCC"
              style={inputStyle}
            />
          </div>

          <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Tipologia</label>
              <select
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                disabled={readOnly}
                style={{ ...inputStyle, cursor: readOnly ? "default" : "pointer" }}
              >
                {Object.entries(SUPPLIER_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Referente</label>
              <input
                value={form.contactPerson}
                onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))}
                disabled={readOnly}
                placeholder="Persona di contatto"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                disabled={readOnly}
                placeholder="fornitore@example.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                disabled={readOnly}
                placeholder="+39 02 1234567"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Indirizzo</label>
            <input
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              disabled={readOnly}
              placeholder="Via, città, paese"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Servizi offerti</label>
            <textarea
              value={form.services}
              onChange={e => setForm(p => ({ ...p, services: e.target.value }))}
              disabled={readOnly}
              rows={2}
              placeholder="Es. Hotel categoria 5*, transfer NCC, polizze annullamento…"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div>
            <label style={labelStyle}>Note operative</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              disabled={readOnly}
              rows={4}
              placeholder="Accordi commerciali, contatti operativi, scadenze contrattuali…"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 20, flexWrap: "wrap" }}>
          {!isNew && canManage && !supplier?.deletedAt && (
            <button onClick={handleDelete} style={{
              padding: "9px 16px", borderRadius: 8, border: "1px solid var(--danger)",
              background: "transparent", color: "var(--danger)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}>🗑 Rimuovi fornitore</button>
          )}
          <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
            <button onClick={onClose} style={{
              padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
              background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
            }}>{readOnly ? "Chiudi" : "Annulla"}</button>
            {!readOnly && (
              <button onClick={handleSave} disabled={!form.name.trim()} style={{
                padding: "9px 20px", borderRadius: 8, border: "none",
                background: form.name.trim() ? "var(--navy)" : "var(--text-light)",
                color: "#fff", cursor: form.name.trim() ? "pointer" : "not-allowed",
                fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              }}>{isNew ? "✓ Crea fornitore" : "💾 Salva"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CHAT: MOCK DATA ───────────────────────────────────────────────────────
// CURRENT_USER è dichiarato in cima al file (sezione MOCK DATA)

// Context per condividere tasks/dispatch e azioni globali con i sotto-componenti chat.
// `dispatch` serve al chip task-link nei messaggi per aprire il TaskSlideOver.
// `onCloseChat` permette al chip di chiudere il pannello chat dopo aver navigato.
const ChatContext = createContext({ tasks: [], dispatch: () => {}, onCloseChat: () => {}, currentUserId: null });

const initialConversations = [
  {
    id: "c1", type: "direct", participants: ["marco", "sofia"], name: null,
    pinned: true,
  },
  {
    id: "c2", type: "direct", participants: ["marco", "roberto"], name: null,
  },
  {
    id: "c3", type: "direct", participants: ["marco", "luca"], name: null,
  },
  {
    id: "c4", type: "group", participants: ["marco", "sofia", "luca", "roberto", "giulia"],
    name: "Team VoyageDesk", icon: "🌍",
  },
  {
    id: "c5", type: "group", participants: ["marco", "sofia", "roberto"],
    name: "Pratica Maldive - Rossi", icon: "🏝️",
  },
  {
    id: "c6", type: "group", participants: ["marco", "sofia", "luca"],
    name: "Marketing & Promo", icon: "📣",
  },
  {
    id: "c7", type: "direct", participants: ["marco", "giulia"], name: null,
  },
];

const t = (minAgo) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minAgo);
  return d.toISOString();
};

const initialMessages = {
  c1: [
    { id: "m1", sender: "sofia", type: "text", text: "Ciao Marco, ho contattato Four Seasons per i Rossi 🌊", time: t(180), readBy: ["marco", "sofia"] },
    { id: "m2", sender: "marco", type: "text", text: "Perfetto! Hanno confermato i bungalow?", time: t(175), readBy: ["marco", "sofia"], replyTo: "m1" },
    { id: "m3", sender: "sofia", type: "text", text: "Sì, 2 overwater bungalow disponibili dal 15 al 22. Aspetto conferma sul prezzo finale.", time: t(170), readBy: ["marco", "sofia"], reactions: { "👍": ["marco"] } },
    { id: "m4", sender: "sofia", type: "voice", duration: 28, time: t(120), readBy: ["marco", "sofia"], waveform: [0.3, 0.5, 0.7, 0.4, 0.8, 0.6, 0.5, 0.9, 0.7, 0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.6, 0.4, 0.5, 0.8, 0.6, 0.4, 0.7, 0.5, 0.3, 0.6, 0.8, 0.5, 0.4, 0.6, 0.7] },
    { id: "m5", sender: "marco", type: "text", text: "Ok ricevuto, ascolto subito", time: t(115), readBy: ["marco", "sofia"] },
    { id: "m6", sender: "sofia", type: "file", fileName: "Preventivo_Maldive_Rossi.pdf", fileSize: "342 KB", fileType: "pdf", time: t(45), readBy: ["marco", "sofia"], reactions: { "🔥": ["marco"], "✅": ["marco"] } },
    { id: "m7", sender: "sofia", type: "text", text: "Ti ho mandato il preventivo aggiornato 📎", time: t(44), readBy: ["marco", "sofia"] },
    { id: "m8", sender: "marco", type: "text", text: "Grande, lo guardo nel pomeriggio 👍", time: t(30), readBy: ["marco", "sofia"] },
    { id: "m9", sender: "sofia", type: "text", text: "Una cosa, il cliente chiede transfer privato in idrovolante - lo includiamo?", time: t(5), readBy: ["sofia"] },
  ],
  c2: [
    { id: "m1", sender: "roberto", type: "text", text: "Marco, ho emesso la polizza Allianz per la famiglia Rossi", time: t(360), readBy: ["marco", "roberto"] },
    { id: "m2", sender: "marco", type: "text", text: "Perfetto Roberto, importo finale?", time: t(355), readBy: ["marco", "roberto"] },
    { id: "m3", sender: "roberto", type: "text", text: "€342 totali per 4 persone, annullamento + medica", time: t(350), readBy: ["marco", "roberto"] },
    { id: "m4", sender: "roberto", type: "file", fileName: "Polizza_Rossi_Allianz.pdf", fileSize: "186 KB", fileType: "pdf", time: t(348), readBy: ["marco", "roberto"] },
    { id: "m5", sender: "marco", type: "text", text: "Ricevuto, archiviato nel CRM ✓", time: t(60), readBy: ["marco", "roberto"] },
  ],
  c3: [
    { id: "m1", sender: "luca", type: "text", text: "Ciao! Newsletter giugno al 60%, ti mando bozza?", time: t(240), readBy: ["marco", "luca"] },
    { id: "m2", sender: "marco", type: "text", text: "Sì certo, mandala", time: t(235), readBy: ["marco", "luca"] },
    { id: "m3", sender: "luca", type: "voice", duration: 42, time: t(200), readBy: ["marco", "luca"], waveform: [0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.9, 0.6, 0.4, 0.5, 0.8, 0.7, 0.3, 0.6, 0.9, 0.5, 0.4, 0.7, 0.6, 0.8, 0.5, 0.3, 0.6, 0.4, 0.7, 0.5, 0.8, 0.6, 0.4, 0.3] },
    { id: "m4", sender: "marco", type: "text", text: "Buona idea per la sezione Grecia 🇬🇷", time: t(190), readBy: ["marco", "luca"] },
  ],
  c4: [
    { id: "m1", sender: "marco", type: "text", text: "Buongiorno team! Ricordo la riunione operativa di venerdì alle 10 ☕", time: t(480), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m2", sender: "sofia", type: "text", text: "Confermo presenza", time: t(475), readBy: ["marco", "sofia", "luca", "roberto"], reactions: { "👍": ["marco", "luca"] } },
    { id: "m3", sender: "luca", type: "text", text: "Ci sarò ✋", time: t(470), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m4", sender: "roberto", type: "text", text: "Presente. Porto il report Q1 stampato", time: t(465), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m5", sender: "giulia", type: "text", text: "Io arrivo alle 10:15, ho transfer Bianchi alle 9", time: t(450), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m6", sender: "marco", type: "text", text: "Nessun problema Giulia, ti aggiorniamo dopo", time: t(440), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m7", sender: "sofia", type: "file", fileName: "Agenda_Riunione_Venerdi.docx", fileSize: "24 KB", fileType: "doc", time: t(120), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m8", sender: "sofia", type: "text", text: "Ecco l'agenda della riunione, date un'occhiata 📋", time: t(119), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m9", sender: "luca", type: "text", text: "Aggiungo un punto sul nuovo template newsletter?", time: t(20), readBy: ["marco", "luca"] },
  ],
  c5: [
    { id: "m1", sender: "sofia", type: "text", text: "Aggiornamento Pratica Rossi: voli confermati, hotel in conferma", time: t(360), readBy: ["marco", "sofia", "roberto"] },
    { id: "m2", sender: "roberto", type: "text", text: "Polizza emessa oggi ✓", time: t(300), readBy: ["marco", "sofia", "roberto"], reactions: { "🎉": ["sofia", "marco"] } },
    { id: "m3", sender: "marco", type: "text", text: "Ottimo lavoro squadra, cliente molto contento al telefono ieri", time: t(280), readBy: ["marco", "sofia", "roberto"], reactions: { "❤️": ["sofia"], "🙌": ["roberto"] } },
    { id: "m4", sender: "sofia", type: "voice", duration: 15, time: t(180), readBy: ["marco", "sofia", "roberto"], waveform: [0.5, 0.7, 0.9, 0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.6, 0.8, 0.5, 0.4, 0.7, 0.6] },
    { id: "m5", sender: "roberto", type: "text", text: "Acconto del 30% richiesto via mail", time: t(10), readBy: ["marco", "roberto"] },
  ],
  c6: [
    { id: "m1", sender: "luca", type: "text", text: "Ho qualche idea per la campagna autunno 2025 🍁", time: t(720), readBy: ["marco", "sofia", "luca"] },
    { id: "m2", sender: "sofia", type: "text", text: "Sparami!", time: t(715), readBy: ["marco", "sofia", "luca"] },
    { id: "m3", sender: "luca", type: "text", text: "Pensavo: Foliage Canada, Halloween NYC, Dolomiti d'oro. Cosa ne dite?", time: t(710), readBy: ["marco", "sofia", "luca"], reactions: { "🔥": ["sofia"], "💡": ["marco"] } },
    { id: "m4", sender: "marco", type: "text", text: "Mi piacciono tutte e tre. Iniziamo con Foliage che è il più richiesto", time: t(700), readBy: ["marco", "sofia", "luca"] },
  ],
  c7: [
    { id: "m1", sender: "giulia", type: "text", text: "Marco, transfer Bianchi confermato per martedì 6:45", time: t(60), readBy: ["marco", "giulia"] },
    { id: "m2", sender: "marco", type: "text", text: "Grazie Giulia. NCC stesso autista?", time: t(55), readBy: ["marco", "giulia"] },
    { id: "m3", sender: "giulia", type: "text", text: "Sì, Antonio. Sa già del volo ANA", time: t(50), readBy: ["marco", "giulia"] },
  ],
};

// ─── CHAT: UTILS ───────────────────────────────────────────────────────────
const formatChatTime = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "Adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
};

const formatMsgTime = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

const formatDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const getConversationName = (conv) => {
  if (conv.name) return conv.name;
  const other = conv.participants.find(p => p !== CURRENT_USER);
  return getMember(other)?.name || "Sconosciuto";
};

const getLastMessage = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr[arr.length - 1];
};

const getUnreadCount = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr.filter(m => m.sender !== CURRENT_USER && !m.readBy?.includes(CURRENT_USER)).length;
};

// ─── CHAT: REACTIONS POPOVER ───────────────────────────────────────────────
const EMOJI_REACTIONS = ["👍", "❤️", "😂", "🔥", "✅", "🎉", "💡", "🙌"];

const ReactionPicker = ({ onPick, onClose }) => (
  <div onClick={e => e.stopPropagation()} style={{
    position: "absolute", bottom: "calc(100% + 4px)", left: 0,
    background: "#fff", borderRadius: 20, padding: "6px 8px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
    display: "flex", gap: 2, zIndex: 100,
  }}>
    {EMOJI_REACTIONS.map(e => (
      <button key={e} onClick={() => { onPick(e); onClose(); }} style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 18, padding: 4, borderRadius: 6, transition: "background 0.15s",
      }}
        onMouseEnter={ev => ev.currentTarget.style.background = "var(--surface2)"}
        onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}
      >{e}</button>
    ))}
  </div>
);

// ─── CHAT: VOICE PLAYER ────────────────────────────────────────────────────
const VoicePlayer = ({ duration, waveform, isMine }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { setPlaying(false); return 0; }
        return p + (100 / (duration * 10));
      });
    }, 100);
    return () => clearInterval(interval);
  }, [playing, duration]);

  const color = isMine ? "rgba(255,255,255,0.9)" : "var(--navy)";
  const dimColor = isMine ? "rgba(255,255,255,0.35)" : "var(--text-light)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
      <button onClick={() => setPlaying(!playing)} style={{
        width: 32, height: 32, borderRadius: "50%",
        background: isMine ? "rgba(255,255,255,0.2)" : "var(--gold)",
        border: "none", cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        color: isMine ? "#fff" : "var(--navy)", fontSize: 12,
        flexShrink: 0,
      }}>{playing ? "⏸" : "▶"}</button>

      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, height: 28 }}>
        {waveform.map((h, i) => {
          const barProgress = (i / waveform.length) * 100;
          const filled = barProgress <= progress;
          return (
            <div key={i} style={{
              flex: 1, height: `${h * 100}%`, minHeight: 3,
              background: filled ? color : dimColor,
              borderRadius: 1, transition: "background 0.1s",
            }} />
          );
        })}
      </div>

      <span style={{ fontSize: 11, color: isMine ? "rgba(255,255,255,0.8)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums", minWidth: 32 }}>
        {formatDuration(Math.floor((100 - progress) / 100 * duration))}
      </span>
    </div>
  );
};

// ─── CHAT: MESSAGE ─────────────────────────────────────────────────────────
// Chip cliccabile renderizzato sotto il contenuto di un messaggio testuale con `taskRef`.
// Click → apre il TaskSlideOver e chiude il pannello chat (così lo slide-over non è coperto).
// Se il task non esiste più (cestinato/purgato), il chip diventa disabilitato.
const TaskLinkChip = ({ taskRef, isMine }) => {
  const { tasks, dispatch, onCloseChat } = useContext(ChatContext);
  const task = tasks.find(t => t.id === taskRef.id);
  const available = !!task && !task.deletedAt && canViewTask(task, CURRENT_USER);

  const handleClick = () => {
    if (!available) return;
    dispatch({ type: "SET_SELECTED_TASK", payload: task });
    if (onCloseChat) onCloseChat();
  };

  return (
    <button
      onClick={handleClick}
      disabled={!available}
      title={available ? "Apri task" : "Task non disponibile"}
      style={{
        marginTop: 8, display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", borderRadius: 10,
        background: isMine ? "rgba(255,255,255,0.12)" : "var(--surface2)",
        border: `1px solid ${isMine ? "rgba(255,255,255,0.18)" : "var(--border)"}`,
        cursor: available ? "pointer" : "not-allowed",
        opacity: available ? 1 : 0.55,
        color: isMine ? "#fff" : "var(--text)",
        fontFamily: "inherit", textAlign: "left", width: "100%", boxSizing: "border-box",
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>🔗</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {taskRef.title}
        </span>
        {(taskRef.dueDate || !available) && (
          <span style={{ display: "block", fontSize: 10.5, opacity: 0.75, marginTop: 1 }}>
            {!available ? "Task non disponibile" : `📅 ${formatDate(taskRef.dueDate)}`}
          </span>
        )}
      </span>
      {available && <span style={{ fontSize: 12, opacity: 0.85, flexShrink: 0 }}>→</span>}
    </button>
  );
};

const ChatMessage = ({ msg, prevMsg, conv, allMessages, onReact, onReply, onContextMenu }) => {
  const [showReactions, setShowReactions] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isMine = msg.sender === CURRENT_USER;
  const sender = getMember(msg.sender);
  const showAvatar = !prevMsg || prevMsg.sender !== msg.sender;
  const showName = conv.type === "group" && !isMine && showAvatar;

  const replyMsg = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;
  const replyAuthor = replyMsg ? getMember(replyMsg.sender) : null;

  // Read indicator
  const otherParticipants = conv.participants.filter(p => p !== CURRENT_USER);
  const readByAll = isMine && otherParticipants.every(p => msg.readBy?.includes(p));
  const readBySome = isMine && otherParticipants.some(p => msg.readBy?.includes(p));

  const fileIcons = { pdf: "📄", doc: "📝", img: "🖼️", xls: "📊", default: "📎" };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowReactions(false); }}
      style={{
        display: "flex", flexDirection: isMine ? "row-reverse" : "row",
        gap: 8, marginTop: showAvatar ? 12 : 2, alignItems: "flex-end",
        position: "relative",
      }}>
      {/* Avatar */}
      <div style={{ width: 28, flexShrink: 0 }}>
        {!isMine && showAvatar && <Avatar memberId={msg.sender} size={28} />}
      </div>

      {/* Message bubble */}
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", position: "relative" }}>
        {showName && (
          <div style={{ fontSize: 11, fontWeight: 600, color: sender?.color, marginBottom: 3, marginLeft: 12 }}>
            {sender?.name}
          </div>
        )}

        <div style={{
          background: isMine ? "var(--navy)" : "#fff",
          color: isMine ? "#fff" : "var(--text)",
          padding: msg.type === "voice" ? "8px 12px" : "8px 12px",
          borderRadius: 14,
          borderTopRightRadius: isMine && showAvatar ? 4 : 14,
          borderTopLeftRadius: !isMine && showAvatar ? 4 : 14,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          border: isMine ? "none" : "1px solid var(--border)",
          position: "relative",
        }}>
          {/* Reply preview */}
          {replyMsg && (
            <div style={{
              borderLeft: `3px solid ${isMine ? "var(--gold)" : replyAuthor?.color || "var(--navy)"}`,
              padding: "4px 8px", marginBottom: 6, borderRadius: 4,
              background: isMine ? "rgba(255,255,255,0.1)" : "var(--surface2)",
              fontSize: 11,
            }}>
              <div style={{ fontWeight: 600, color: isMine ? "var(--gold)" : replyAuthor?.color }}>
                {replyAuthor?.name}
              </div>
              <div style={{ opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                {replyMsg.type === "voice" ? "🎙️ Vocale" : replyMsg.type === "file" ? `📎 ${replyMsg.fileName}` : replyMsg.text}
              </div>
            </div>
          )}

          {/* Content */}
          {msg.type === "text" && msg.text && (
            <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>{msg.text}</div>
          )}

          {/* Task link chip (v0.9.3) — apre TaskSlideOver */}
          {msg.taskRef && <TaskLinkChip taskRef={msg.taskRef} isMine={isMine} />}

          {msg.type === "voice" && (
            <VoicePlayer duration={msg.duration} waveform={msg.waveform} isMine={isMine} />
          )}

          {msg.type === "file" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 4px",
              minWidth: 220, cursor: "pointer",
            }}>
              <div style={{
                width: 40, height: 40, background: isMine ? "rgba(255,255,255,0.15)" : "var(--surface2)",
                borderRadius: 8, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 20, flexShrink: 0,
              }}>{fileIcons[msg.fileType] || fileIcons.default}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.fileName}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{msg.fileSize}</div>
              </div>
              <div style={{ fontSize: 16, opacity: 0.7 }}>⬇</div>
            </div>
          )}

          {/* Timestamp + read indicator inside bubble */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end",
            marginTop: 3, fontSize: 10, opacity: 0.7,
          }}>
            <span>{formatMsgTime(msg.time)}</span>
            {isMine && (
              <span style={{ fontSize: 12, lineHeight: 1, color: readByAll ? "var(--gold-light)" : "currentColor" }}>
                {readByAll ? "✓✓" : readBySome ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{
            display: "flex", gap: 3, marginTop: 4,
            marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0,
          }}>
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <div key={emoji} style={{
                background: "#fff", border: "1px solid var(--border)",
                borderRadius: 99, padding: "2px 7px", fontSize: 11,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <span style={{ fontSize: 13 }}>{emoji}</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{users.length}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons (hover) */}
        {hovered && (
          <div style={{
            position: "absolute", top: -8, [isMine ? "left" : "right"]: -8,
            display: "flex", gap: 2, background: "#fff",
            border: "1px solid var(--border)", borderRadius: 99,
            padding: "3px 6px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}>
            <button onClick={() => setShowReactions(s => !s)} style={iconBtn}>😊</button>
            <button onClick={() => onReply(msg)} style={iconBtn}>↩</button>
          </div>
        )}

        {showReactions && (
          <ReactionPicker
            onPick={(e) => onReact(msg.id, e)}
            onClose={() => setShowReactions(false)}
          />
        )}
      </div>
    </div>
  );
};

const iconBtn = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 13, padding: "2px 4px", borderRadius: 4,
};

// ─── CHAT: VOICE RECORDER ──────────────────────────────────────────────────
const VoiceRecorder = ({ onSend, onCancel }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: "var(--surface)", borderRadius: 24, border: "1px solid var(--border)",
      flex: 1,
    }}>
      <div className="record-pulse" style={{
        width: 10, height: 10, borderRadius: "50%", background: "var(--danger)",
        flexShrink: 0,
      }} />
      <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center", height: 20 }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            flex: 1, background: "var(--navy)",
            height: `${30 + Math.random() * 70}%`, minHeight: 3,
            borderRadius: 1,
            animation: `wave 0.${4 + (i % 5)}s ease infinite`,
            animationDelay: `${i * 0.05}s`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
        {formatDuration(seconds)}
      </span>
      <button onClick={onCancel} style={{
        background: "var(--surface2)", border: "none", borderRadius: "50%",
        width: 30, height: 30, cursor: "pointer", fontSize: 14,
      }}>✕</button>
      <button onClick={() => onSend(seconds)} style={{
        background: "var(--gold)", color: "var(--navy)", border: "none",
        borderRadius: "50%", width: 30, height: 30, cursor: "pointer",
        fontSize: 14, fontWeight: 700,
      }}>↑</button>
    </div>
  );
};

// ─── CHAT: CONVERSATION VIEW ───────────────────────────────────────────────
const ConversationView = ({ conv, messages, setMessages, onBack, initialAttachedTask, onAttachedTaskConsumed }) => {
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showAttach, setShowAttach] = useState(false);
  const [typing, setTyping] = useState(false);
  // v0.9.3: task agganciata (dall'intent "contatta agente" o futuro picker).
  // Se presente, viene scritta come `taskRef` nel prossimo messaggio testuale.
  const [attachedTask, setAttachedTask] = useState(null);
  const scrollRef = useRef(null);

  // Se l'intent porta un task, mostralo come preview agganciata sopra l'input.
  useEffect(() => {
    if (initialAttachedTask) {
      setAttachedTask(initialAttachedTask);
      if (onAttachedTaskConsumed) onAttachedTaskConsumed();
    }
  }, [initialAttachedTask]);

  const msgs = messages[conv.id] || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  // Mark as read on open
  useEffect(() => {
    setMessages(prev => ({
      ...prev,
      [conv.id]: (prev[conv.id] || []).map(m => {
        if (m.sender !== CURRENT_USER && !m.readBy?.includes(CURRENT_USER)) {
          return { ...m, readBy: [...(m.readBy || []), CURRENT_USER] };
        }
        return m;
      })
    }));
  }, [conv.id]);

  // Simulate someone typing
  useEffect(() => {
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.sender === CURRENT_USER) {
      const timer = setTimeout(() => setTyping(true), 800);
      const stop = setTimeout(() => setTyping(false), 3500);
      return () => { clearTimeout(timer); clearTimeout(stop); };
    }
  }, [msgs.length]);

  const sendText = () => {
    const trimmed = input.trim();
    // Permetti l'invio di un messaggio "solo task" se c'è un task agganciato.
    if (!trimmed && !attachedTask) return;
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "text",
      text: trimmed, time: new Date().toISOString(),
      readBy: [CURRENT_USER],
      replyTo: replyingTo?.id,
      taskRef: attachedTask
        ? { id: attachedTask.id, title: attachedTask.title, dueDate: attachedTask.dueDate || null }
        : undefined,
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    setInput("");
    setReplyingTo(null);
    setAttachedTask(null);
  };

  const sendVoice = (duration) => {
    const waveform = Array.from({ length: 30 }, () => 0.3 + Math.random() * 0.6);
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "voice",
      duration, waveform, time: new Date().toISOString(),
      readBy: [CURRENT_USER],
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    setRecording(false);
  };

  const sendFile = (kind) => {
    const samples = {
      pdf: { fileName: "Documento.pdf", fileSize: "245 KB", fileType: "pdf" },
      img: { fileName: "Foto_destinazione.jpg", fileSize: "1.2 MB", fileType: "img" },
      doc: { fileName: "Itinerario.docx", fileSize: "67 KB", fileType: "doc" },
    };
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "file",
      ...samples[kind], time: new Date().toISOString(),
      readBy: [CURRENT_USER],
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    setShowAttach(false);
  };

  const handleReact = (msgId, emoji) => {
    setMessages(prev => ({
      ...prev,
      [conv.id]: prev[conv.id].map(m => {
        if (m.id !== msgId) return m;
        const reactions = { ...(m.reactions || {}) };
        const users = reactions[emoji] || [];
        if (users.includes(CURRENT_USER)) {
          reactions[emoji] = users.filter(u => u !== CURRENT_USER);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, CURRENT_USER];
        }
        return { ...m, reactions };
      })
    }));
  };

  const otherTypingMember = conv.participants.find(p => p !== CURRENT_USER);
  const otherMember = conv.type === "direct" ? getMember(otherTypingMember) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface2)" }}>
      {/* Header */}
      <div style={{
        background: "var(--navy)", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, flexShrink: 0,
        borderBottom: "1px solid rgba(212,168,67,0.2)",
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
        }}>←</button>

        {conv.type === "direct" ? (
          <Avatar memberId={otherTypingMember} size={36} />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>{conv.icon || "👥"}</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {getConversationName(conv)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
            {typing ? (
              <span style={{ color: "var(--gold-light)" }}>
                {conv.type === "group" ? `${getMember(otherTypingMember)?.name.split(" ")[0]} sta scrivendo` : "sta scrivendo"}
                <span style={{ animation: "typing 1s infinite", animationDelay: "0s", display: "inline-block" }}>.</span>
                <span style={{ animation: "typing 1s infinite", animationDelay: "0.2s", display: "inline-block" }}>.</span>
                <span style={{ animation: "typing 1s infinite", animationDelay: "0.4s", display: "inline-block" }}>.</span>
              </span>
            ) : conv.type === "direct" ? (
              <>● Online</>
            ) : (
              `${conv.participants.length} membri`
            )}
          </div>
        </div>

        <button style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 12,
        }}>⋮</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        background: "var(--surface2)",
      }}>
        {msgs.map((m, i) => (
          <ChatMessage
            key={m.id}
            msg={m}
            prevMsg={msgs[i - 1]}
            conv={conv}
            allMessages={msgs}
            onReact={handleReact}
            onReply={setReplyingTo}
          />
        ))}
        {typing && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
            <Avatar memberId={otherTypingMember} size={28} />
            <div style={{
              background: "#fff", border: "1px solid var(--border)",
              borderRadius: 14, borderTopLeftRadius: 4, padding: "8px 12px",
              display: "flex", gap: 3, alignItems: "center",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.2s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
      </div>

      {/* Reply preview */}
      {replyingTo && (
        <div style={{
          padding: "8px 14px", background: "#fff", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 3, alignSelf: "stretch", background: "var(--gold)", borderRadius: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gold-dark)" }}>
              Rispondi a {getMember(replyingTo.sender)?.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {replyingTo.type === "voice" ? "🎙️ Vocale" : replyingTo.type === "file" ? `📎 ${replyingTo.fileName}` : replyingTo.text}
            </div>
          </div>
          <button onClick={() => setReplyingTo(null)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 16, color: "var(--text-muted)",
          }}>✕</button>
        </div>
      )}

      {/* Attached task preview (v0.9.3) */}
      {attachedTask && (
        <div style={{
          padding: "8px 14px", background: "var(--surface)", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 3, alignSelf: "stretch", background: "var(--navy)", borderRadius: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)" }}>
              🔗 Task agganciato
            </div>
            <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {attachedTask.title}
              {attachedTask.dueDate && <span style={{ color: "var(--text-muted)" }}> · 📅 {formatDate(attachedTask.dueDate)}</span>}
            </div>
          </div>
          <button onClick={() => setAttachedTask(null)} title="Rimuovi task agganciato" style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 16, color: "var(--text-muted)",
          }}>✕</button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 12px", background: "#fff", borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        position: "relative",
      }}>
        {recording ? (
          <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
        ) : (
          <>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowAttach(s => !s)} style={{
                background: "var(--surface2)", border: "none", borderRadius: "50%",
                width: 36, height: 36, cursor: "pointer", fontSize: 18, flexShrink: 0,
              }}>📎</button>
              {showAttach && (
                <div className="slide-up" style={{
                  position: "absolute", bottom: "calc(100% + 8px)", left: 0,
                  background: "#fff", borderRadius: 12, padding: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: 4, minWidth: 160, zIndex: 100,
                }}>
                  {[
                    { kind: "pdf", icon: "📄", label: "Documento PDF" },
                    { kind: "img", icon: "🖼️", label: "Immagine" },
                    { kind: "doc", icon: "📝", label: "Word/Excel" },
                  ].map(opt => (
                    <button key={opt.kind} onClick={() => sendFile(opt.kind)} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", border: "none", background: "transparent",
                      borderRadius: 8, cursor: "pointer", fontSize: 13, textAlign: "left",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ fontSize: 18 }}>{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
              placeholder="Scrivi un messaggio..."
              style={{
                flex: 1, border: "1px solid var(--border)", borderRadius: 22,
                padding: "10px 16px", fontSize: 13.5, fontFamily: "inherit",
                outline: "none", background: "var(--surface)",
              }}
            />

            {(input.trim() || attachedTask) ? (
              <button onClick={sendText} style={{
                background: "var(--navy)", color: "#fff", border: "none",
                borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
                fontSize: 14, fontWeight: 700, flexShrink: 0,
              }}>↑</button>
            ) : (
              <button onClick={() => setRecording(true)} style={{
                background: "var(--gold)", color: "var(--navy)", border: "none",
                borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
                fontSize: 16, flexShrink: 0,
              }}>🎙️</button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── CHAT: LIST OF CONVERSATIONS ───────────────────────────────────────────
const ConversationList = ({ conversations, messages, onSelect, onNew }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const sorted = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const lastA = getLastMessage(messages, a.id);
    const lastB = getLastMessage(messages, b.id);
    if (!lastA) return 1;
    if (!lastB) return -1;
    return new Date(lastB.time) - new Date(lastA.time);
  });

  const filtered = sorted.filter(c => {
    if (filter === "direct" && c.type !== "direct") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (filter === "unread" && getUnreadCount(messages, c.id) === 0) return false;
    if (search && !getConversationName(c).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalUnread = conversations.reduce((acc, c) => acc + getUnreadCount(messages, c.id), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }}>🔍</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca conversazione..."
            style={{
              width: "100%", border: "1px solid var(--border)", borderRadius: 8,
              padding: "8px 12px 8px 34px", fontSize: 13, fontFamily: "inherit",
              outline: "none", background: "var(--surface)",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {[
            { id: "all", label: "Tutti" },
            { id: "unread", label: `Non letti${totalUnread ? ` (${totalUnread})` : ""}` },
            { id: "direct", label: "Diretti" },
            { id: "group", label: "Gruppi" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600,
              border: "1px solid var(--border)", borderRadius: 99,
              background: filter === f.id ? "var(--navy)" : "transparent",
              color: filter === f.id ? "#fff" : "var(--text-muted)",
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map(c => {
          const last = getLastMessage(messages, c.id);
          const unread = getUnreadCount(messages, c.id);
          const lastSender = last ? getMember(last.sender) : null;
          const otherUser = c.type === "direct" ? c.participants.find(p => p !== CURRENT_USER) : null;

          return (
            <div key={c.id} onClick={() => onSelect(c)} style={{
              padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
              borderBottom: "1px solid var(--border)", cursor: "pointer",
              transition: "background 0.15s",
              background: unread > 0 ? "rgba(212,168,67,0.05)" : "transparent",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background = unread > 0 ? "rgba(212,168,67,0.05)" : "transparent"}
            >
              {c.type === "direct" ? (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar memberId={otherUser} size={42} />
                  <div style={{
                    position: "absolute", bottom: 0, right: 0, width: 11, height: 11,
                    borderRadius: "50%", background: "var(--success)", border: "2px solid #fff",
                  }} />
                </div>
              ) : (
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", background: "var(--gold)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, flexShrink: 0,
                }}>{c.icon || "👥"}</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
                    {c.pinned && <span style={{ fontSize: 10, color: "var(--gold)" }}>📌</span>}
                    <span style={{ fontSize: 13.5, fontWeight: unread > 0 ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {getConversationName(c)}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                    {last && formatChatTime(last.time)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <div style={{
                    fontSize: 12, color: unread > 0 ? "var(--text)" : "var(--text-muted)",
                    fontWeight: unread > 0 ? 500 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0,
                  }}>
                    {last ? (
                      <>
                        {last.sender === CURRENT_USER && <span style={{ color: "var(--text-muted)" }}>Tu: </span>}
                        {c.type === "group" && last.sender !== CURRENT_USER && (
                          <span style={{ color: lastSender?.color, fontWeight: 600 }}>
                            {lastSender?.name.split(" ")[0]}:{" "}
                          </span>
                        )}
                        {last.type === "voice" ? "🎙️ Messaggio vocale" :
                          last.type === "file" ? `📎 ${last.fileName}` :
                            last.text}
                      </>
                    ) : "Nessun messaggio"}
                  </div>
                  {unread > 0 && (
                    <div style={{
                      background: "var(--gold)", color: "var(--navy)", fontSize: 10, fontWeight: 700,
                      borderRadius: 99, padding: "1px 6px", minWidth: 18, textAlign: "center", flexShrink: 0,
                    }}>{unread}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13 }}>Nessuna conversazione trovata</div>
          </div>
        )}
      </div>

      <button onClick={onNew} style={{
        margin: 14, padding: "10px", background: "var(--navy)", color: "#fff",
        border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>✏️ Nuova chat</button>
    </div>
  );
};

// ─── CHAT: NEW CONVERSATION ────────────────────────────────────────────────
const NewConversationView = ({ onCreate, onCancel, existing }) => {
  const [mode, setMode] = useState("select"); // select | group
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");

  const available = TEAM.filter(m => m.id !== CURRENT_USER);

  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const createDirect = (memberId) => {
    const found = existing.find(c => c.type === "direct" && c.participants.includes(memberId));
    if (found) { onCreate(found); return; }
    const newConv = {
      id: "c" + Date.now(), type: "direct",
      participants: [CURRENT_USER, memberId], name: null,
    };
    onCreate(newConv, true);
  };

  const createGroup = () => {
    if (!groupName.trim() || selected.length < 2) return;
    const newConv = {
      id: "c" + Date.now(), type: "group",
      participants: [CURRENT_USER, ...selected],
      name: groupName.trim(), icon: "👥",
    };
    onCreate(newConv, true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        background: "var(--navy)", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
        }}>←</button>
        <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>
          {mode === "select" ? "Nuova conversazione" : "Nuovo gruppo"}
        </div>
      </div>

      {mode === "select" && (
        <>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <button onClick={() => setMode("group")} style={{
              width: "100%", padding: "10px 14px", background: "var(--surface2)",
              border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer",
              fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>👥</span> Crea nuovo gruppo
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
              MEMBRI DEL TEAM
            </div>
            {available.map(m => (
              <div key={m.id} onClick={() => createDirect(m.id)} style={{
                padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                cursor: "pointer", transition: "background 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Avatar memberId={m.id} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "group" && (
        <>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nome del gruppo..."
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
              SELEZIONA MEMBRI ({selected.length} selezionati)
            </div>
            {available.map(m => {
              const isSel = selected.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggle(m.id)} style={{
                  padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                  cursor: "pointer", background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
                  transition: "background 0.15s",
                }}>
                  <Avatar memberId={m.id} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${isSel ? "var(--gold)" : "var(--border)"}`,
                    background: isSel ? "var(--gold)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, color: "var(--navy)", fontWeight: 700,
                  }}>{isSel && "✓"}</div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <button onClick={() => setMode("select")} style={{
              flex: 1, padding: "10px", background: "transparent", border: "1px solid var(--border)",
              borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
            }}>Indietro</button>
            <button onClick={createGroup} disabled={!groupName.trim() || selected.length < 2} style={{
              flex: 2, padding: "10px", background: "var(--navy)", color: "#fff",
              border: "none", borderRadius: 8,
              cursor: (!groupName.trim() || selected.length < 2) ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              opacity: (!groupName.trim() || selected.length < 2) ? 0.5 : 1,
            }}>Crea gruppo</button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── CHAT: MAIN PANEL ──────────────────────────────────────────────────────
const ChatPanel = ({ open, onClose, conversations, setConversations, messages, setMessages, intent, tasks, currentUserId, dispatch }) => {
  const { isMobile } = useViewport();
  const [activeConv, setActiveConv] = useState(null);
  const [newMode, setNewMode] = useState(false);
  // v0.9.3: invece di sputare testo nell'input, passiamo l'oggetto task così
  // ConversationView mostra un chip "task agganciata" e attacca taskRef al messaggio.
  const [prefillTask, setPrefillTask] = useState(null);

  // Gestione intent: apertura chat verso utente specifico con link a task
  useEffect(() => {
    if (!open || !intent || !intent.toUser) return;
    const me = currentUserId || CURRENT_USER;
    // Cerca conversazione diretta esistente
    let direct = conversations.find(c =>
      c.type === "direct" &&
      c.participants.includes(me) &&
      c.participants.includes(intent.toUser)
    );
    if (!direct) {
      direct = {
        id: "c" + Date.now(),
        type: "direct",
        participants: [me, intent.toUser],
        name: null,
      };
      setConversations(prev => [direct, ...prev]);
    }
    setActiveConv(direct);
    setNewMode(false);
    // Aggancia il task: la ConversationView mostra la preview e lo attacca al
    // prossimo messaggio inviato come `taskRef`.
    if (intent.taskLink) {
      const t = (tasks || []).find(x => x.id === intent.taskLink);
      if (t) setPrefillTask({ id: t.id, title: t.title, dueDate: t.dueDate });
    }
  }, [open, intent, currentUserId]);

  if (!open) return null;

  const handleCreate = (conv, addNew = false) => {
    if (addNew) setConversations(c => [conv, ...c]);
    setActiveConv(conv);
    setNewMode(false);
  };

  return (
    <ChatContext.Provider value={{
      tasks: tasks || [],
      currentUserId: currentUserId || CURRENT_USER,
      dispatch: dispatch || (() => {}),
      onCloseChat: onClose,
    }}>
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,32,68,0.3)", zIndex: 700,
      }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 420, height: "100vh",
        background: "#fff", zIndex: 800, boxShadow: "-20px 0 60px rgba(0,0,0,0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, borderBottom: "1px solid rgba(212,168,67,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, background: "var(--gold)", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>💬</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                Messaggi
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>
                CHAT INTERNA TEAM
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
            width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {newMode ? (
            <NewConversationView
              onCreate={handleCreate}
              onCancel={() => setNewMode(false)}
              existing={conversations}
            />
          ) : activeConv ? (
            <ConversationView
              conv={activeConv}
              messages={messages}
              setMessages={setMessages}
              onBack={() => { setActiveConv(null); setPrefillTask(null); }}
              initialAttachedTask={prefillTask}
              onAttachedTaskConsumed={() => setPrefillTask(null)}
            />
          ) : (
            <ConversationList
              conversations={conversations}
              messages={messages}
              onSelect={setActiveConv}
              onNew={() => setNewMode(true)}
            />
          )}
        </div>
      </div>
    </>
    </ChatContext.Provider>
  );
};

// ─── FLOATING ACTION BUTTON ────────────────────────────────────────────────
const FAB = ({ onClick }) => {
  const { isDesktop } = useViewport();
  return (
  <button onClick={onClick} style={{
    position: "fixed", bottom: isDesktop ? 28 : 80, right: isDesktop ? 28 : 16, width: 52, height: 52,
    borderRadius: "50%", background: "var(--gold)", border: "none",
    boxShadow: "0 8px 24px rgba(212,168,67,0.5)", cursor: "pointer",
    fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--navy)", fontWeight: 700, zIndex: 400,
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
  }}
    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(212,168,67,0.6)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(212,168,67,0.5)"; }}
  >+</button>
  );
};

// ─── TRASH (CESTINO) ───────────────────────────────────────────────────────
const Trash = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [restoring, setRestoring] = useState(null); // task being restored/edited
  const trashed = getTrashedTasks(state.tasks)
    .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

  const handleRestore = (task) => {
    setRestoring({ ...task });
  };

  const handleConfirmRestore = () => {
    if (!restoring) return;
    const { deletedAt, ...updates } = restoring;
    dispatch({ type: "UPDATE_TASK", payload: updates });
    dispatch({ type: "RESTORE_TASK", payload: restoring.id });
    setRestoring(null);
  };

  const handlePurge = (task) => {
    if (window.confirm(`Eliminare definitivamente "${task.title}"?\n\nQuesta azione è irreversibile.`)) {
      dispatch({ type: "PURGE_TASK", payload: task.id });
    }
  };

  const handleEmpty = () => {
    if (trashed.length === 0) return;
    if (window.confirm(`Svuotare il cestino?\n\n${trashed.length} task verranno eliminati definitivamente. Azione irreversibile.`)) {
      dispatch({ type: "EMPTY_TRASH" });
    }
  };

  const updateField = (field, value) => setRestoring(prev => ({ ...prev, [field]: value }));

  return (
    <div className="vd-pad" style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="playfair" style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>
            🗑️ Cestino
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {trashed.length === 0
              ? "Nessun task nel cestino"
              : `${trashed.length} task ${trashed.length === 1 ? "eliminato" : "eliminati"}. Ripristinali o rimuovili definitivamente.`
            }
          </div>
        </div>
        {trashed.length > 0 && (
          <button onClick={handleEmpty} style={{
            background: "var(--danger)", color: "#fff", border: "none",
            padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13,
            fontWeight: 600, fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(220,38,38,0.25)",
          }}>🔥 Svuota cestino</button>
        )}
      </div>

      {/* Empty state */}
      {trashed.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 12, padding: "60px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🗑️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
            Cestino vuoto
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            I task eliminati appariranno qui. Potrai ripristinarli o rimuoverli definitivamente.
          </div>
        </div>
      ) : (
        /* Trash table */
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>TASK</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>CATEGORIA</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>CLIENTE</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>ASSEGNATI</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>ELIMINATO</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {trashed.map(task => (
                <tr key={task.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "var(--navy)", marginBottom: 2 }}>{task.title}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)" }}>
                      <PriorityBadge priority={task.priority} />
                      <span>• {STATUS_LABELS[task.status]}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <CategoryChip category={task.category} />
                  </td>
                  <td style={{ padding: "12px 8px", color: "var(--text)" }}>
                    {task.client || <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {task.assignees?.length
                        ? task.assignees.map(id => <Avatar key={id} memberId={id} size={22} />)
                        : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
                      }
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                    {formatDate(task.deletedAt)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => handleRestore(task)} title="Ripristina con modifica" style={{
                        background: "var(--navy)", color: "#fff", border: "none",
                        padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        fontWeight: 600, fontFamily: "inherit",
                      }}>↻ Ripristina</button>
                      <button onClick={() => handlePurge(task)} title="Elimina definitivamente" style={{
                        background: "#fff", color: "var(--danger)", border: "1px solid var(--danger)",
                        padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        fontWeight: 600, fontFamily: "inherit",
                      }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── MODALE RIPRISTINO CON MODIFICA ─── */}
      {restoring && (
        <>
          <div onClick={() => setRestoring(null)} style={{
            position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 1000,
          }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "#fff", borderRadius: 16, zIndex: 1001,
            width: isMobile ? "calc(100vw - 32px)" : 520, maxWidth: "100%",
            maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Modal header */}
            <div style={{
              background: "var(--navy)", padding: "18px 22px",
              borderRadius: "16px 16px 0 0",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ color: "#fff" }}>
                <div className="playfair" style={{ fontSize: 18, fontWeight: 700 }}>↻ Ripristina task</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Modifica i campi se necessario, poi conferma</div>
              </div>
              <button onClick={() => setRestoring(null)} style={{
                background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
                width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
              }}>✕</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Titolo */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>TITOLO</label>
                <input
                  value={restoring.title}
                  onChange={e => updateField("title", e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
                    outline: "none",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>

              {/* Categoria + Priorità */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>CATEGORIA</label>
                  <select
                    value={restoring.category}
                    onChange={e => updateField("category", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>PRIORITÀ</label>
                  <select
                    value={restoring.priority}
                    onChange={e => updateField("priority", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(PRIORITIES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stato + Scadenza */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>STATO</label>
                  <select
                    value={restoring.status}
                    onChange={e => updateField("status", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>SCADENZA</label>
                  <input
                    type="datetime-local"
                    value={restoring.dueDate ? restoring.dueDate.slice(0, 16) : ""}
                    onChange={e => updateField("dueDate", e.target.value ? new Date(e.target.value).toISOString() : null)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>

              {/* Cliente */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>CLIENTE</label>
                <input
                  value={restoring.client || ""}
                  onChange={e => updateField("client", e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
                    outline: "none",
                  }}
                  placeholder="Nome cliente"
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>

              {/* Assegnatari */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>ASSEGNATARI</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {getAssignableTeam().map(m => {
                    const sel = restoring.assignees?.includes(m.id);
                    return (
                      <button key={m.id}
                        onClick={() => {
                          const curr = restoring.assignees || [];
                          updateField("assignees", sel ? curr.filter(x => x !== m.id) : [...curr, m.id]);
                        }}
                        style={{
                          padding: "6px 12px", borderRadius: 99,
                          border: sel ? "2px solid var(--navy)" : "1px solid var(--border)",
                          background: sel ? "var(--navy)" : "#fff",
                          color: sel ? "#fff" : "var(--text)",
                          fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 5,
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: 99,
                          background: sel ? "rgba(255,255,255,0.2)" : m.color, color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700,
                        }}>{m.avatar}</span>
                        {m.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Descrizione */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>DESCRIZIONE</label>
                <textarea
                  value={restoring.description || ""}
                  onChange={e => updateField("description", e.target.value)}
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                    resize: "vertical", outline: "none",
                  }}
                  placeholder="Descrizione task..."
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{
              padding: "14px 22px 18px", borderTop: "1px solid var(--border)",
              display: "flex", justifyContent: "flex-end", gap: 10,
            }}>
              <button onClick={() => setRestoring(null)} style={{
                background: "#fff", color: "var(--text)", border: "1px solid var(--border)",
                padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                fontWeight: 600, fontFamily: "inherit",
              }}>Annulla</button>
              <button
                onClick={handleConfirmRestore}
                disabled={!restoring.title?.trim()}
                style={{
                  background: restoring.title?.trim() ? "var(--navy)" : "var(--surface3)",
                  color: restoring.title?.trim() ? "#fff" : "var(--text-muted)",
                  border: "none",
                  padding: "10px 20px", borderRadius: 8, cursor: restoring.title?.trim() ? "pointer" : "not-allowed",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  boxShadow: restoring.title?.trim() ? "0 4px 14px rgba(15,32,68,0.3)" : "none",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >↻ Conferma ripristino</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── ADMIN VIEW ────────────────────────────────────────────────────────────
const AdminView = ({ state, dispatch }) => {
  const [tab, setTab] = useState("team");

  const tabs = [
    { id: "team", icon: "👥", label: "Team" },
    { id: "io", icon: "📤", label: "Import / Export" },
    { id: "stats", icon: "📊", label: "Sistema" },
    { id: "cats", icon: "🏷️", label: "Categorie" },
    { id: "log", icon: "📋", label: "Log attività" },
  ];

  return (
    <div className="vd-pad" style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="playfair" style={{ fontSize: 28, color: "var(--navy)", margin: 0, fontWeight: 700 }}>
          ⚙️ Amministrazione
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>
          Gestione team, categorie, import/export, statistiche e log attività
        </p>
      </div>

      {/* Tab nav */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: "1px solid var(--border)",
        overflowX: "auto", whiteSpace: "nowrap",
      }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px", background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
                color: active ? "var(--navy)" : "var(--text-muted)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit", marginBottom: -1, flexShrink: 0,
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="fade-in" key={tab}>
        {tab === "team" && <AdminTeamTab state={state} dispatch={dispatch} />}
        {tab === "io" && <AdminIOTab state={state} dispatch={dispatch} />}
        {tab === "stats" && <AdminStatsTab state={state} />}
        {tab === "cats" && <AdminCategoriesTab state={state} dispatch={dispatch} />}
        {tab === "log" && <AdminLogTab state={state} dispatch={dispatch} />}
      </div>
    </div>
  );
};

// ─── ADMIN TAB: TEAM ───────────────────────────────────────────────────────
const AdminTeamTab = ({ state, dispatch }) => {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const pending = state.team.filter(m => m.pending);
  const active = state.team.filter(m => !m.pending && m.active);
  const disabled = state.team.filter(m => !m.pending && !m.active);

  const taskCount = (id) => state.tasks.filter(t => !t.deletedAt && (t.assignees || []).includes(id)).length;

  const startEdit = (m) => { setEditingId(m.id); setDraft({ ...m }); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };
  const saveEdit = () => {
    if (!draft.name?.trim()) return;
    dispatch({ type: "UPDATE_TEAM_MEMBER", payload: draft });
    cancelEdit();
  };

  const card = (m, opts = {}) => {
    const isEditing = editingId === m.id;
    const count = taskCount(m.id);
    return (
      <div key={m.id} style={{
        background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
        padding: 16, display: "flex", alignItems: "center", gap: 14,
        opacity: opts.dim ? 0.65 : 1,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: m.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0,
        }}>{m.avatar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px", gap: 8 }}>
              <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}
                placeholder="Nome" style={fieldStyle} />
              <input value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})}
                placeholder="Ruolo" style={fieldStyle} />
              <input type="number" min="1" max="50" value={draft.capacity}
                onChange={e => setDraft({...draft, capacity: parseInt(e.target.value) || 1})}
                placeholder="Cap" style={fieldStyle} />
              <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                style={{ ...fieldStyle, padding: 2, height: 32 }} />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {m.role} • Capacità {m.capacity} task • {count} task assegnati
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isEditing ? (
            <>
              <button onClick={saveEdit} style={btnPrimary}>💾 Salva</button>
              <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
            </>
          ) : (
            <>
              {opts.canApprove && (
                <button onClick={() => dispatch({ type: "APPROVE_TEAM_MEMBER", payload: m.id })} style={btnGold}>
                  ✓ Approva
                </button>
              )}
              {!m.pending && (
                <>
                  <button onClick={() => startEdit(m)} style={btnGhost} title="Modifica">✏️</button>
                  <button onClick={() => dispatch({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: m.id })}
                    style={m.active ? btnWarning : btnPrimary} title={m.active ? "Disattiva" : "Riattiva"}>
                    {m.active ? "⏸️ Disattiva" : "▶️ Riattiva"}
                  </button>
                </>
              )}
              <button onClick={() => {
                if (count > 0) {
                  alert(`Impossibile rimuovere: l'agente ha ${count} task assegnati. Riassegnali prima di procedere.`);
                  return;
                }
                if (window.confirm(`Rimuovere definitivamente "${m.name}"?`)) {
                  dispatch({ type: "REMOVE_TEAM_MEMBER", payload: m.id });
                }
              }} style={btnDanger} title="Rimuovi">🗑️</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header con pulsante aggiungi */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>✅ <b>{active.length}</b> attivi</span>
          {pending.length > 0 && <span>⏳ <b style={{ color: "var(--gold-dark)" }}>{pending.length}</b> in attesa</span>}
          {disabled.length > 0 && <span>⏸️ <b>{disabled.length}</b> disabilitati</span>}
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi agente</button>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏳ Iscrizioni in attesa di approvazione</div>
          <div style={{ display: "grid", gap: 10 }}>
            {pending.map(m => card(m, { canApprove: true, dim: true }))}
          </div>
        </div>
      )}

      {/* Attivi */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionH}>✅ Agenti attivi</div>
        <div style={{ display: "grid", gap: 10 }}>
          {active.map(m => card(m))}
        </div>
      </div>

      {/* Disabilitati */}
      {disabled.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏸️ Agenti disabilitati</div>
          <div style={{ display: "grid", gap: 10 }}>
            {disabled.map(m => card(m, { dim: true }))}
          </div>
        </div>
      )}

      {showAdd && <AddTeamMemberModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingIds={state.team.map(m => m.id)} />}
    </div>
  );
};

const AddTeamMemberModal = ({ onClose, dispatch, existingIds }) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Junior Agent");
  const [capacity, setCapacity] = useState(8);
  const [color, setColor] = useState("#3B82F6");
  const [pending, setPending] = useState(true);

  const submit = () => {
    if (!name.trim()) return;
    const parts = name.trim().split(/\s+/);
    const avatar = ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
    let id = parts[0].toLowerCase().replace(/[^a-z]/g, "");
    let suffix = 0;
    while (existingIds.includes(suffix ? `${id}${suffix}` : id)) suffix++;
    if (suffix) id = `${id}${suffix}`;
    dispatch({
      type: "ADD_TEAM_MEMBER",
      payload: { id, name: name.trim(), role, avatar, color, capacity, active: !pending, pending }
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>Aggiungi nuovo agente</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Nome completo *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Anna Bianchi" style={fieldStyle} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Ruolo</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={fieldStyle}>
              <option>Manager</option>
              <option>Senior Agent</option>
              <option>Junior Agent</option>
              <option>Driver</option>
              <option>Admin</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Capacità task</label>
              <input type="number" min="1" max="50" value={capacity}
                onChange={e => setCapacity(parseInt(e.target.value) || 8)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{...fieldStyle, height: 38, padding: 2}} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", marginTop: 4 }}>
            <input type="checkbox" checked={pending} onChange={e => setPending(e.target.checked)} />
            Crea come "in attesa di approvazione" (simula iscrizione)
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost}>Annulla</button>
          <button onClick={submit} style={btnPrimary}>Crea agente</button>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: IMPORT / EXPORT ────────────────────────────────────────────
const AdminIOTab = ({ state, dispatch }) => {
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const fileInputRef = useRef(null);

  const tasksToExport = () => includeTrashed ? state.tasks : state.tasks.filter(t => !t.deletedAt);

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const exportCSV = () => {
    const headers = ["ID","Titolo","Categoria","Priorità","Status","Cliente","Scadenza","Ore","Assegnati","Descrizione","Cestinato"];
    const rows = tasksToExport().map(t => [
      t.id, t.title, t.category, t.priority, t.status, t.client || "",
      t.dueDate ? t.dueDate.slice(0,10) : "",
      t.estimatedHours || 0,
      (t.assignees || []).join("|"),
      (t.description || "").replace(/\n/g, " "),
      t.deletedAt ? "Sì" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `voyagedesk-task-${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportExcel = () => {
    const data = tasksToExport().map(t => ({
      ID: t.id, Titolo: t.title, Categoria: t.category, Priorità: t.priority,
      Status: t.status, Cliente: t.client || "",
      Scadenza: t.dueDate ? t.dueDate.slice(0,10) : "",
      Ore: t.estimatedHours || 0,
      Assegnati: (t.assignees || []).map(a => getMember(a)?.name || a).join(", "),
      Descrizione: t.description || "",
      Cestinato: t.deletedAt ? "Sì" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Task");
    XLSX.writeFile(wb, `voyagedesk-task-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportBackup = () => {
    const backup = {
      version: "0.9.7", // bump: aggiunto `suppliers` (v0.9.7)
      exportedAt: new Date().toISOString(),
      agencyName: state.agencyName,
      tasks: state.tasks,
      team: state.team,
      categories: state.categories,
      notices: state.notices,
      clients: state.clients,
      suppliers: state.suppliers,
    };
    downloadFile(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `voyagedesk-backup-${new Date().toISOString().slice(0,10)}.json`
    );
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("ATTENZIONE: il ripristino sovrascrive tutti i dati correnti (task, team, categorie). Continuare?")) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.tasks || !Array.isArray(data.tasks)) throw new Error("File backup non valido");
        dispatch({ type: "RESTORE_BACKUP", payload: data });
      } catch (err) {
        alert("Errore nel ripristino: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const total = tasksToExport().length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Export task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📤 Esporta task</h3>
        <p style={cardP}>Scarica i task in formato CSV o Excel per archiviazione, analisi esterna o backup parziale.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          Includi task nel cestino
        </label>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          📦 <b>{total}</b> task pronti per l'export
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportCSV} style={btnPrimary}>📄 Scarica CSV</button>
          <button onClick={exportExcel} style={btnPrimary}>📊 Scarica Excel</button>
        </div>
      </div>

      {/* Import task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📥 Importa task</h3>
        <p style={cardP}>Usa il <b>Bulk Task Creator</b> (FAB navy 📑 in basso a destra) → tab <b>Importa</b> per caricare CSV/Excel con mapping automatico.</p>
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
          💡 Colonne supportate: <code>Titolo, Categoria, Priorità, Cliente, Scadenza, Assegnato, Ore, Descrizione</code><br/>
          Il sistema normalizza automaticamente nomi categoria/priorità in italiano e ID agenti.
        </div>
      </div>

      {/* Backup completo */}
      <div style={cardStyle}>
        <h3 style={cardH}>💾 Backup &amp; Restore completo</h3>
        <p style={cardP}>Esporta o ripristina <b>tutto lo stato dell'applicazione</b> (task, team, categorie, impostazioni) come file JSON.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportBackup} style={btnPrimary}>⬇️ Esporta backup JSON</button>
          <button onClick={() => fileInputRef.current?.click()} style={btnWarning}>⬆️ Ripristina da backup</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={importBackup} style={{ display: "none" }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 10 }}>
          ⚠️ Il ripristino sovrascrive completamente i dati correnti. Esporta prima un backup di sicurezza.
        </div>
      </div>

      {/* Reset dati persistiti */}
      <div style={cardStyle}>
        <h3 style={cardH}>🧹 Reset dati locali (localStorage)</h3>
        <p style={cardP}>
          Cancella i dati salvati nel browser e ricarica la pagina con i <b>dati demo iniziali</b>.
          Utile per ripartire da zero o sbloccare uno stato corrotto.
        </p>
        <button
          onClick={() => {
            if (!window.confirm("Cancellare tutti i dati locali e ricaricare con i dati demo? L'azione non è reversibile.")) return;
            clearPersistedAll();
            window.location.reload();
          }}
          style={btnDanger}
        >🧨 Cancella dati locali e ricarica</button>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
          Esporta prima un backup JSON se vuoi conservare lo stato corrente.
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: SISTEMA / STATS ────────────────────────────────────────────
const AdminStatsTab = ({ state }) => {
  const active = state.tasks.filter(t => !t.deletedAt);
  const trashed = state.tasks.filter(t => t.deletedAt);
  const overdue = active.filter(t => isOverdue(t));
  const done = active.filter(t => t.status === "done");
  const completionRate = active.length ? Math.round((done.length / active.length) * 100) : 0;

  const byStatus = STATUSES.map(s => ({
    s, label: STATUS_LABELS[s], color: STATUS_COLORS[s],
    count: active.filter(t => t.status === s).length,
  }));

  const byCategory = Object.entries(state.categories).map(([k, c]) => ({
    k, label: c.label, color: c.color, icon: c.icon,
    count: active.filter(t => t.category === k).length,
  })).sort((a,b) => b.count - a.count);

  const byMember = state.team.filter(m => !m.pending).map(m => {
    const count = active.filter(t => (t.assignees || []).includes(m.id) && t.status !== "done").length;
    return { m, count, pct: m.capacity ? Math.min(100, Math.round((count / m.capacity) * 100)) : 0 };
  });

  const kpiCard = (label, value, sub, color) => (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || "var(--navy)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* KPI */}
      <div className="vd-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {kpiCard("Task attivi", active.length, `${trashed.length} nel cestino`)}
        {kpiCard("Completati", done.length, `${completionRate}% completion`, "var(--success)")}
        {kpiCard("Scaduti", overdue.length, "task non chiusi oltre data", "var(--danger)")}
        {kpiCard("Agenti", state.team.filter(m => m.active && !m.pending).length, `${state.team.filter(m => m.pending).length} in attesa`)}
      </div>

      {/* Distribuzione per status */}
      <div style={cardStyle}>
        <h3 style={cardH}>📊 Distribuzione per status</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {byStatus.map(s => {
            const pct = active.length ? (s.count / active.length) * 100 : 0;
            return (
              <div key={s.s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 140, fontSize: 13, color: "var(--text)" }}>{s.label}</div>
                <div style={{ flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: s.color, transition: "width 0.3s" }} />
                </div>
                <div style={{ width: 60, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Carico team */}
      <div style={cardStyle}>
        <h3 style={cardH}>👥 Carico di lavoro per agente</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {byMember.map(({ m, count, pct }) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: m.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>{m.avatar}</div>
              <div style={{ width: 160, fontSize: 13 }}>{m.name}</div>
              <div style={{ flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: pct > 90 ? "var(--danger)" : pct > 70 ? "var(--warning)" : "var(--success)",
                  transition: "width 0.3s",
                }} />
              </div>
              <div style={{ width: 100, textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>
                {count}/{m.capacity} • <b style={{ color: "var(--text)" }}>{pct}%</b>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categorie */}
      <div style={cardStyle}>
        <h3 style={cardH}>🏷️ Distribuzione per categoria</h3>
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {byCategory.map(c => (
            <div key={c.k} style={{
              padding: 12, background: "var(--surface2)", borderRadius: 8,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#fff",
              }}>{c.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.count} task</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: CATEGORIE ──────────────────────────────────────────────────
const AdminCategoriesTab = ({ state, dispatch }) => {
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const usageCount = (key) => state.tasks.filter(t => !t.deletedAt && t.category === key).length;

  const startEdit = (key, c) => { setEditingKey(key); setDraft({ key, ...c }); };
  const cancelEdit = () => { setEditingKey(null); setDraft(null); };
  const saveEdit = () => {
    if (!draft.label?.trim()) return;
    dispatch({ type: "UPDATE_CATEGORY", payload: draft });
    cancelEdit();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          🏷️ <b>{Object.keys(state.categories).length}</b> categorie definite
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi categoria</button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(state.categories).map(([key, c]) => {
          const isEditing = editingKey === key;
          const count = usageCount(key);
          return (
            <div key={key} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
              padding: 14, display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 8, fontSize: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.bg, color: c.color, flexShrink: 0,
              }}>{isEditing ? draft.icon : c.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 90px", gap: 8 }}>
                    <input value={draft.label} onChange={e => setDraft({...draft, label: e.target.value})}
                      placeholder="Etichetta" style={fieldStyle} />
                    <input value={draft.icon} onChange={e => setDraft({...draft, icon: e.target.value})}
                      placeholder="Icona" style={fieldStyle} maxLength={2} />
                    <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore primario" />
                    <input type="color" value={draft.bg} onChange={e => setDraft({...draft, bg: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore sfondo" />
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      Chiave: <code>{key}</code> • {count} task usano questa categoria
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {isEditing ? (
                  <>
                    <button onClick={saveEdit} style={btnPrimary}>💾 Salva</button>
                    <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(key, c)} style={btnGhost}>✏️ Modifica</button>
                    <button onClick={() => {
                      if (count > 0) {
                        alert(`Impossibile rimuovere: ${count} task usano questa categoria.`);
                        return;
                      }
                      if (window.confirm(`Rimuovere categoria "${c.label}"?`)) {
                        dispatch({ type: "REMOVE_CATEGORY", payload: key });
                      }
                    }} style={btnDanger}>🗑️</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && <AddCategoryModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingKeys={Object.keys(state.categories)} />}
    </div>
  );
};

const AddCategoryModal = ({ onClose, dispatch, existingKeys }) => {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState("#3B82F6");
  const [bg, setBg] = useState("#EFF6FF");

  const submit = () => {
    if (!label.trim()) return;
    let key = label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
    if (!key) key = "custom";
    let suffix = 0;
    while (existingKeys.includes(suffix ? `${key}${suffix}` : key)) suffix++;
    if (suffix) key = `${key}${suffix}`;
    dispatch({ type: "ADD_CATEGORY", payload: { key, label: label.trim(), icon, color, bg } });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>Aggiungi nuova categoria</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Nome *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Es. Trasferimenti" style={fieldStyle} autoFocus />
          </div>
          <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Icona (emoji)</label>
              <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} style={{ ...fieldStyle, textAlign: "center", fontSize: 18 }} />
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} />
            </div>
            <div>
              <label style={labelStyle}>Sfondo</label>
              <input type="color" value={bg} onChange={e => setBg(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} />
            </div>
          </div>
          {/* Preview */}
          <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Anteprima</div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 999, background: bg, color: color,
              fontSize: 12, fontWeight: 600,
            }}>
              <span>{icon}</span> {label || "Nome categoria"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost}>Annulla</button>
          <button onClick={submit} style={btnPrimary}>Crea categoria</button>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: LOG ATTIVITÀ ───────────────────────────────────────────────
const AdminLogTab = ({ state, dispatch }) => {
  const [filter, setFilter] = useState("all");

  const groups = {
    all: () => state.activityLog,
    task: () => state.activityLog.filter(l => ["ADD_TASK","ADD_TASKS_BULK","UPDATE_TASK","MOVE_TASK","ADD_COMMENT"].includes(l.type)),
    trash: () => state.activityLog.filter(l => ["DELETE_TASK","RESTORE_TASK","PURGE_TASK","EMPTY_TRASH"].includes(l.type)),
    admin: () => state.activityLog.filter(l => l.type.includes("TEAM_MEMBER") || l.type.includes("CATEGORY") || l.type === "RESTORE_BACKUP"),
  };
  const list = groups[filter]();

  const iconFor = (type) => {
    if (type.includes("DELETE") || type.includes("PURGE") || type.includes("EMPTY")) return "🗑️";
    if (type.includes("RESTORE")) return "↻";
    if (type.includes("ADD_TASK")) return "➕";
    if (type.includes("UPDATE_TASK")) return "✏️";
    if (type === "MOVE_TASK") return "🔄";
    if (type === "ADD_COMMENT") return "💬";
    if (type.includes("TEAM")) return "👤";
    if (type.includes("CATEGORY")) return "🏷️";
    if (type.includes("BACKUP")) return "💾";
    return "•";
  };

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "ora";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "all", label: "Tutte" },
            { id: "task", label: "Task" },
            { id: "trash", label: "Cestino" },
            { id: "admin", label: "Admin" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--border)", cursor: "pointer",
              background: filter === f.id ? "var(--navy)" : "#fff",
              color: filter === f.id ? "#fff" : "var(--text)",
              fontFamily: "inherit",
            }}>{f.label}</button>
          ))}
        </div>
        {state.activityLog.length > 0 && (
          <button onClick={() => {
            if (window.confirm("Svuotare il log attività? Non è reversibile.")) {
              dispatch({ type: "CLEAR_ACTIVITY_LOG" });
            }
          }} style={btnDanger}>🔥 Svuota log</button>
        )}
      </div>

      <div style={cardStyle}>
        {list.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14 }}>Nessuna attività registrata{filter !== "all" ? " in questo filtro" : " ancora"}</div>
            <div style={{ fontSize: 11, marginTop: 6 }}>Le azioni effettuate appariranno qui (ultime 100)</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {list.map(l => (
              <div key={l.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 4px", borderBottom: "1px solid var(--surface2)",
              }}>
                <div style={{ fontSize: 16, width: 24, textAlign: "center" }}>{iconFor(l.type)}</div>
                <div style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{l.text}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatRel(l.time)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── ADMIN: STILI CONDIVISI ────────────────────────────────────────────────
const sectionH = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 };
const cardStyle = { background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 18 };
const cardH = { margin: 0, marginBottom: 6, fontSize: 15, fontWeight: 700, color: "var(--navy)" };
const cardP = { fontSize: 13, color: "var(--text-muted)", marginTop: 0, marginBottom: 14 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 };
const fieldStyle = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "var(--text)" };
const btnPrimary = { padding: "8px 14px", borderRadius: 6, border: "1px solid var(--navy)", background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnGold = { padding: "8px 14px", borderRadius: 6, border: "1px solid var(--gold)", background: "var(--gold)", color: "var(--navy)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnGhost = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "#fff", color: "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const btnDanger = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--danger)", background: "#fff", color: "var(--danger)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnWarning = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--warning)", background: "#fff", color: "var(--warning)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const modalOverlay = { position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 16 };
const modalCard = { background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" };

// ─── PERSISTENZA (localStorage) ────────────────────────────────────────────
// v0.9.1 — l'app gira fuori da claude.ai artifacts: si salva su localStorage.
// Versioning: bumpare PERSIST_VERSION se cambia la shape dello state persistito.
const PERSIST_VERSION = 1;
const PERSIST_KEY_STATE = "voyagedesk:state:v1";
const PERSIST_KEY_CHAT = "voyagedesk:chat:v1";
// Campi UI volatili: non finiscono in localStorage, tornano ai default al refresh.
const PERSIST_OMIT = ["toast", "lastAction", "selectedTask", "selectedClient", "selectedSupplier", "showNotif", "searchQuery", "filters"];

const _hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

const loadPersistedState = (fallback) => {
  if (!_hasStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY_STATE);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== PERSIST_VERSION || !parsed.state) return fallback;
    const merged = { ...fallback, ...parsed.state };
    // Riallinea i `let` mutabili usati dagli helper (TEAM/CATEGORIES/CURRENT_USER)
    if (Array.isArray(merged.team)) _syncTeam(merged.team);
    if (merged.categories && typeof merged.categories === "object") _syncCategories(merged.categories);
    if (typeof merged.currentUserId === "string" && getMember(merged.currentUserId)) {
      _syncCurrentUser(merged.currentUserId);
    } else {
      merged.currentUserId = fallback.currentUserId;
      _syncCurrentUser(fallback.currentUserId);
    }
    // Reset campi volatili
    for (const k of PERSIST_OMIT) merged[k] = fallback[k];
    return merged;
  } catch (e) {
    console.warn("[VoyageDesk] hydrate state failed:", e);
    return fallback;
  }
};

const savePersistedState = (state) => {
  if (!_hasStorage()) return null;
  try {
    const toPersist = {};
    for (const k of Object.keys(state)) {
      if (!PERSIST_OMIT.includes(k)) toPersist[k] = state[k];
    }
    window.localStorage.setItem(
      PERSIST_KEY_STATE,
      JSON.stringify({ version: PERSIST_VERSION, savedAt: new Date().toISOString(), state: toPersist })
    );
    return null;
  } catch (e) {
    console.warn("[VoyageDesk] persist state failed:", e);
    return e;
  }
};

const loadPersistedChat = (fallbackConv, fallbackMsg) => {
  const fallback = { conversations: fallbackConv, messages: fallbackMsg };
  if (!_hasStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY_CHAT);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== PERSIST_VERSION) return fallback;
    return {
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : fallbackConv,
      messages: parsed.messages && typeof parsed.messages === "object" ? parsed.messages : fallbackMsg,
    };
  } catch (e) {
    console.warn("[VoyageDesk] hydrate chat failed:", e);
    return fallback;
  }
};

const savePersistedChat = (conversations, messages) => {
  if (!_hasStorage()) return null;
  try {
    window.localStorage.setItem(
      PERSIST_KEY_CHAT,
      JSON.stringify({ version: PERSIST_VERSION, conversations, messages })
    );
    return null;
  } catch (e) {
    console.warn("[VoyageDesk] persist chat failed:", e);
    return e;
  }
};

const clearPersistedAll = () => {
  if (!_hasStorage()) return;
  try {
    window.localStorage.removeItem(PERSIST_KEY_STATE);
    window.localStorage.removeItem(PERSIST_KEY_CHAT);
  } catch (e) {
    console.warn("[VoyageDesk] clear persist failed:", e);
  }
};

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function VoyageDesk() {
  return (
    <ViewportProvider>
      <VoyageDeskInner />
    </ViewportProvider>
  );
}

function VoyageDeskInner() {
  const { isDesktop } = useViewport();
  const [state, dispatch] = useReducer(reducer, initialState, loadPersistedState);
  const [showFABModal, setShowFABModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null); // { toUser, taskLink } per aprire chat preconfezionata
  const [showBulkModal, setShowBulkModal] = useState(false);
  // Hydrate chat una volta sola (lazy init): evita race fra i due useState.
  const _hydratedChat = useRef(null);
  if (_hydratedChat.current === null) {
    _hydratedChat.current = loadPersistedChat(initialConversations, initialMessages);
  }
  const [conversations, setConversations] = useState(_hydratedChat.current.conversations);
  const [messages, setMessages] = useState(_hydratedChat.current.messages);

  // Persistenza state app: debounce 300ms per evitare write su ogni keystroke.
  useEffect(() => {
    const id = setTimeout(() => savePersistedState(state), 300);
    return () => clearTimeout(id);
  }, [state]);

  // Persistenza chat (conversazioni + messaggi)
  useEffect(() => {
    const id = setTimeout(() => savePersistedChat(conversations, messages), 300);
    return () => clearTimeout(id);
  }, [conversations, messages]);

  // Conta non letti totali per badge topbar (dallo stato vivo della chat)
  const unreadChat = conversations.reduce(
    (acc, c) => acc + getUnreadCount(messages, c.id),
    0
  );

  // Apre la chat verso un utente specifico, opzionalmente con link a task
  const openChatTo = (intent) => {
    if (intent && intent.toUser) {
      setChatIntent(intent);
    }
    setShowChat(true);
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector("input[placeholder*='Cerca']")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Quando l'utente cambia, se la view corrente non è permessa il reducer la riporta a dashboard.
  // Inoltre chiudo eventuali pannelli aperti.
  useEffect(() => {
    setShowChat(false);
    setShowBulkModal(false);
    setShowFABModal(false);
  }, [state.currentUserId]);

  const renderView = () => {
    switch (state.activeView) {
      case "dashboard": return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
      case "calendar": return <CalendarPlanner state={state} dispatch={dispatch} />;
      case "clients": return <ClientsView state={state} dispatch={dispatch} />;
      case "suppliers": return <SuppliersView state={state} dispatch={dispatch} />;
      case "team": return <Team state={state} dispatch={dispatch} />;
      case "trash": return <Trash state={state} dispatch={dispatch} />;
      case "admin": return <AdminView state={state} dispatch={dispatch} />;
      default: return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
    }
  };

  return (
    <>
      <FontLoader />
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--surface)", fontFamily: "'DM Sans', sans-serif" }}>
        <Topbar state={state} dispatch={dispatch} onOpenChat={() => { setChatIntent(null); setShowChat(true); }} unreadChat={unreadChat} />
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar state={state} dispatch={dispatch} />
          <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {renderView()}
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav state={state} dispatch={dispatch} />

        {/* Slide-over */}
        {state.selectedTask && <TaskSlideOver task={state.selectedTask} dispatch={dispatch} clients={state.clients} suppliers={state.suppliers} />}

        {/* Modale scheda cliente — disponibile da qualunque vista (TaskSlideOver, Clienti) */}
        {state.selectedClient && (
          <ClientEditModal
            client={state.selectedClient}
            onClose={() => dispatch({ type: "SET_SELECTED_CLIENT", payload: null })}
            dispatch={dispatch}
            canManage={canManageClients(state.currentUserId)}
            taskCount={(state.tasks || []).filter(t => !t.deletedAt && resolveLegacyClientId(t) === state.selectedClient.id).length}
          />
        )}

        {/* Modale scheda fornitore — analoga alla cliente (v0.9.7) */}
        {state.selectedSupplier && (
          <SupplierEditModal
            supplier={state.selectedSupplier}
            onClose={() => dispatch({ type: "SET_SELECTED_SUPPLIER", payload: null })}
            dispatch={dispatch}
            canManage={canManageSuppliers(state.currentUserId)}
            taskCount={(state.tasks || []).filter(t => !t.deletedAt && t.supplierId === state.selectedSupplier.id).length}
          />
        )}

        {/* Chat Panel */}
        <ChatPanel
          open={showChat}
          onClose={() => { setShowChat(false); setChatIntent(null); }}
          conversations={conversations}
          setConversations={setConversations}
          messages={messages}
          setMessages={setMessages}
          intent={chatIntent}
          tasks={state.tasks}
          currentUserId={state.currentUserId}
          dispatch={dispatch}
        />

        {/* FAB principale (singolo task) + FAB secondario (bulk) */}
        {state.activeView !== "trash" && state.activeView !== "admin" && (
          <>
            <button
              onClick={() => setShowBulkModal(true)}
              title="Crea più task / Import / Template"
              style={{
                position: "fixed", bottom: isDesktop ? 32 : 84, right: isDesktop ? 92 : 76, width: 44, height: 44,
                borderRadius: "50%", background: "var(--navy)", border: "none",
                boxShadow: "0 6px 20px rgba(15,32,68,0.35)", cursor: "pointer",
                fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", zIndex: 400,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >📑</button>
            <FAB onClick={() => setShowFABModal(true)} />
          </>
        )}
        {showFABModal && (
          <QuickAddTask
            onAdd={t => dispatch({ type: "ADD_TASK", payload: t })}
            onClose={() => setShowFABModal(false)}
            clients={state.clients}
            suppliers={state.suppliers}
            dispatch={dispatch}
          />
        )}

        {/* Bulk Task Creator */}
        {showBulkModal && (
          <BulkTaskCreator
            existingTasks={getActiveTasks(state.tasks)}
            onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
            onClose={() => setShowBulkModal(false)}
          />
        )}

        {/* Toast */}
        <Toast toast={state.toast} dispatch={dispatch} />
      </div>
    </>
  );
}
