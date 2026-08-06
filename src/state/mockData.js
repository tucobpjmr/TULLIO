// src/state/mockData.js
// Dati iniziali per la modalità offline/demo (nessun utente loggato o DB assente).
// Questi record NON vengono mai scritti su Supabase: sono solo il fallback locale.

// ─── TEAM MOCK ───────────────────────────────────────────────────────────────
export const INITIAL_TEAM = [
  { id: "marco",   name: "Marco Ferretti",   role: "Manager",      avatar: "MF", color: "#0F2044", capacity: 12, active: true,  pending: false },
  { id: "sofia",   name: "Sofia Conti",      role: "Senior Agent", avatar: "SC", color: "#2D7A4F", capacity: 10, active: true,  pending: false },
  { id: "luca",    name: "Luca Moretti",     role: "Junior Agent", avatar: "LM", color: "#C8832A", capacity:  8, active: true,  pending: false },
  { id: "giulia",  name: "Giulia Ricci",     role: "Driver",       avatar: "GR", color: "#7B4F9E", capacity:  6, active: true,  pending: false },
  { id: "roberto", name: "Roberto Esposito", role: "Admin",        avatar: "RE", color: "#C0392B", capacity:  9, active: true,  pending: false },
  { id: "elena",   name: "Elena Marini",     role: "Junior Agent", avatar: "EM", color: "#0EA5E9", capacity:  8, active: false, pending: true  },
  { id: "matteo",  name: "Matteo De Luca",   role: "Senior Agent", avatar: "MD", color: "#DB2777", capacity: 10, active: false, pending: true  },
];

// ─── CATEGORIE MOCK ───────────────────────────────────────────────────────────
export const INITIAL_CATEGORIES = {
  booking:     { label: "Booking",               icon: "✈️",  color: "#3B82F6", bg: "#EFF6FF" },
  itinerary:   { label: "Preventivo",            icon: "📝",  color: "#F97316", bg: "#FFF7ED" },
  visa:        { label: "Visa & Doc.",           icon: "🛂",  color: "#EF4444", bg: "#FEF2F2" },
  client:      { label: "Scadenza OPT",          icon: "⏳",  color: "#06B6D4", bg: "#ECFEFF" },
  payment:     { label: "Pagamenti & Fornitori", icon: "💰",  color: "#F59E0B", bg: "#FFFBEB" },
  marketing:   { label: "Marketing",             icon: "📣",  color: "#EC4899", bg: "#FDF2F8" },
  admin:       { label: "Check-in",              icon: "✅",  color: "#6B7280", bg: "#F9FAFB" },
  appointment: { label: "Appuntamento",          icon: "📅",  color: "#6366F1", bg: "#EEF2FF" },
  transfer:    { label: "Transfer",              icon: "🚐",  color: "#7B4F9E", bg: "#F3F0F9" },
};

// ─── TASK MOCK ────────────────────────────────────────────────────────────────
// d() genera date relative a "adesso" al momento del caricamento del modulo.
const _now = new Date();
const d = (daysOffset, h = 10, m = 0) => {
  const dt = new Date(_now);
  dt.setDate(dt.getDate() + daysOffset);
  dt.setHours(h, m, 0, 0);
  return dt.toISOString();
};

export const INITIAL_TASKS = [
  { id: "t1",  title: "Confermare voli Maldive - Famiglia Rossi",              category: "booking",   priority: "critical", status: "inprogress",      assignees: ["sofia"],            client: "Famiglia Rossi",   dueDate: d( 1,17, 0), estimatedHours: 2,   description: "Verificare disponibilità posti business class e confermare prenotazione. Contattare Emirates per upgrade disponibili.", comments: [{ user: "Marco Ferretti", text: "Priorità massima, cliente VIP", time: d(-1) }] },
  { id: "t2",  title: "Visto Giappone - Coppia Bianchi",                       category: "visa",      priority: "critical", status: "todo",            assignees: ["roberto"],          client: "Coppia Bianchi",   dueDate: d( 2, 9, 0), estimatedHours: 3,   description: "Raccogliere documentazione per visto turistico Giappone. Luna di miele prevista per il mese prossimo.", comments: [] },
  { id: "t3",  title: "Hotel Overwater Bungalow - Maldive",                    category: "itinerary",     priority: "high",     status: "inprogress",      assignees: ["sofia", "luca"],    client: "Famiglia Rossi",   dueDate: d( 3,12, 0), estimatedHours: 1.5, description: "Contattare Four Seasons Kuda Huraa per disponibilità bungalow sull'acqua. Budget: 1500€/notte.", comments: [{ user: "Sofia Conti", text: "Four Seasons ha confermato 2 bungalow disponibili", time: d(-2) }] },
  { id: "t4",  title: "Proposta incentive travel TechCorp",                    category: "itinerary", priority: "high",     status: "awaiting_client", assignees: ["marco"],            client: "Azienda TechCorp", dueDate: d( 4,14, 0), estimatedHours: 5,   description: "Preparare proposta dettagliata per viaggio incentive 50 persone. Destinazioni candidate: Dubrovnik, Marrakech, Lisbona.", comments: [{ user: "Marco Ferretti", text: "Proposta inviata, attesa risposta", time: d(-1) }] },
  { id: "t5",  title: "Pagamento acconto Famiglia Rossi",                      category: "payment",   priority: "high",     status: "todo",            assignees: ["roberto"],          client: "Famiglia Rossi",   dueDate: d( 0,16, 0), estimatedHours: 0.5, description: "Richiedere acconto del 30% per prenotazione Maldive. Totale viaggio: 12.400€.", comments: [] },
  { id: "t6",  title: "Transfer aeroporto - Coppia Bianchi",                   category: "payment",  priority: "medium",   status: "todo",            assignees: ["giulia"],           client: "Coppia Bianchi",   dueDate: d( 5, 8, 0), estimatedHours: 1,   description: "Organizzare transfer NCC per partenza verso MXP. Volo KL 1656 ore 11:30.", comments: [] },
  { id: "t7",  title: "Newsletter Giugno - Offerte Estate",                    category: "marketing", priority: "medium",   status: "inprogress",      assignees: ["luca"],             client: null,               dueDate: d( 6,18, 0), estimatedHours: 4,   description: "Creare newsletter mensile con offerte last minute estate 2025. Target: 2.400 contatti.", comments: [{ user: "Luca Moretti", text: "Bozza al 60%, aggiungo le foto Grecia", time: d(0) }] },
  { id: "t8",  title: "Contratto con nuovo fornitore bus",                     category: "payment",  priority: "medium",   status: "awaiting_supplier",assignees: ["marco","roberto"],  client: null,               dueDate: d( 7,10, 0), estimatedHours: 2,   description: "Finalizzare accordo quadro con Autoservizi Meridionali per trasporti gruppi 2025/2026.", comments: [] },
  { id: "t9",  title: "Itinerario dettagliato Giappone 14 giorni",             category: "itinerary", priority: "high",     status: "inprogress",      assignees: ["sofia"],            client: "Coppia Bianchi",   dueDate: d( 3,11, 0), estimatedHours: 6,   description: "Strutturare itinerario Tokyo-Kyoto-Osaka-Hiroshima. Inserire esperienze di nicchia: cerimonia del tè, tempio Fushimi Inari alba.", comments: [{ user: "Sofia Conti", text: "Aggiunto ryokan a Kyoto su richiesta della coppia", time: d(-1) }] },
  { id: "t10", title: "Aggiornare sito web pacchetti autunno",                 category: "marketing", priority: "low",      status: "todo",            assignees: ["luca"],             client: null,               dueDate: d(10,17, 0), estimatedHours: 3,   description: "Pubblicare nuovi pacchetti autunno: Foliage Canada, Halloween New York, Dolomiti.", comments: [] },
  { id: "t11", title: "Check-in online TechCorp - voli Barcelona",             category: "booking",   priority: "high",     status: "done",            assignees: ["sofia"],            client: "Azienda TechCorp", dueDate: d(-1, 9, 0), estimatedHours: 1,   description: "Completare check-in online per 50 partecipanti. Assegnare posti preferenziali ai manager.", comments: [{ user: "Sofia Conti", text: "Check-in completato ✓ Tutti i posti assegnati", time: d(-1) }] },
  { id: "t12", title: "Richiesta polizza assicurativa viaggio",                category: "admin",     priority: "medium",   status: "done",            assignees: ["roberto"],          client: "Famiglia Rossi",   dueDate: d(-2,15, 0), estimatedHours: 0.5, description: "Polizza annullamento + medica per 4 persone. Confrontare Allianz, Generali, AXA.", comments: [{ user: "Roberto Esposito", text: "Polizza Allianz emessa, €342 totale", time: d(-2) }] },
  { id: "t13", title: "Followup chiamata TechCorp - decisione destinazione",   category: "client",    priority: "critical", status: "awaiting_client", assignees: ["marco"],            client: "Azienda TechCorp", dueDate: d( 1,10,30), estimatedHours: 1,   description: "Chiamata con HR Director TechCorp per confermare destinazione incentive. Budget approvato 85.000€.", comments: [] },
  { id: "t14", title: "Prenotare ryokan Kyoto - Bianchi",                      category: "itinerary",     priority: "high",     status: "inprogress",      assignees: ["sofia"],            client: "Coppia Bianchi",   dueDate: d( 2,16, 0), estimatedHours: 2,   description: "Prenotare Tawaraya Ryokan o Hiiragiya per 2 notti. Suite tradizionale con vista giardino zen.", comments: [] },
  { id: "t15", title: "Fattura acconto TechCorp",                              category: "payment",   priority: "medium",   status: "todo",            assignees: ["roberto"],          client: "Azienda TechCorp", dueDate: d( 4,11, 0), estimatedHours: 0.5, description: "Emettere fattura acconto 50% per evento incentive. Importo: 42.500€ + IVA.", comments: [] },
  { id: "t16", title: "Aggiornamento CRM clienti Q2",                          category: "admin",     priority: "low",      status: "todo",            assignees: ["roberto","luca"],   client: null,               dueDate: d(14,17, 0), estimatedHours: 4,   description: "Aggiornare schede clienti con dati viaggi 2025. Aggiungere preferenze e note speciali.", comments: [] },
  { id: "t17", title: "Transfer hotel-aeroporto Bianchi Malpensa",             category: "payment",  priority: "medium",   status: "todo",            assignees: ["giulia"],           client: "Coppia Bianchi",   dueDate: d( 8, 6, 0), estimatedHours: 0.5, description: "NCC privato per 2 persone + bagagli. Partenza alle 06:45, volo ANA 785.", comments: [] },
  { id: "t18", title: "Social media post - Maldive promo",                     category: "marketing", priority: "low",      status: "done",            assignees: ["luca"],             client: null,               dueDate: d(-3,17, 0), estimatedHours: 1.5, description: "Post Instagram + Facebook con foto Maldive stagione monsoni. CTA: richiedi preventivo.", comments: [{ user: "Luca Moretti", text: "Post pubblicato, +156 interazioni in 24h", time: d(-3) }] },
  { id: "t19", title: "Documenti sanitari Maldive - Rossi",                    category: "visa",      priority: "high",     status: "done",            assignees: ["roberto"],          client: "Famiglia Rossi",   dueDate: d(-1,12, 0), estimatedHours: 1,   description: "Verificare requisiti sanitari entrata Maldive. Raccogliere certificati vaccinazione richiesti.", comments: [{ user: "Roberto Esposito", text: "Non richieste vaccinazioni specifiche, documentazione OK", time: d(-1) }] },
  { id: "t20", title: "Presentazione corporate travel policy TechCorp",        category: "client",    priority: "medium",   status: "awaiting_client", assignees: ["marco","sofia"],     client: "Azienda TechCorp", dueDate: d( 5,15, 0), estimatedHours: 3,   description: "Preparare slide con policy viaggi corporate, livelli classe, hotel preferred, tool di prenotazione.", comments: [] },
  { id: "t21", title: "Escursioni snorkeling Maldive",                         category: "booking",   priority: "medium",   status: "inprogress",      assignees: ["luca"],             client: "Famiglia Rossi",   dueDate: d( 6,10, 0), estimatedHours: 1.5, description: "Prenotare 3 escursioni snorkeling e 1 sessione di immersione guidata con istruttore certificato.", comments: [] },
  { id: "t22", title: "Revisione contratti stagione invernale",                category: "admin",     priority: "low",      status: "todo",            assignees: ["marco"],            client: null,               dueDate: d(20,10, 0), estimatedHours: 5,   description: "Revisione annuale contratti fornitori: tour operator, hotel chains, compagnie aeree.", comments: [] },
  // ─── Coda globale ───
  { id: "t23", title: "Nuova richiesta crociera Caraibi - Famiglia Marchetti", category: "client",    priority: "high",     status: "todo",            assignees: [],                   client: "Famiglia Marchetti",dueDate: d( 2,11, 0), estimatedHours: 1,   description: "Richiesta arrivata via form sito: crociera 7 notti per 4 persone, partenza Miami. Da contattare entro 48h.", comments: [] },
  { id: "t24", title: "Blocco urgente Hotel Atene per gruppo studenti",        category: "itinerary",     priority: "critical", status: "todo",            assignees: [],                   client: "Liceo Manzoni",    dueDate: d( 1,12, 0), estimatedHours: 2,   description: "30 camere a Plaka per fine Maggio. Tariffa già negoziata, serve solo conferma e invio rooming list.", comments: [] },
  { id: "t25", title: "Preventivo viaggio nozze Vietnam - Sposi Conte",        category: "itinerary", priority: "medium",   status: "todo",            assignees: [],                   client: "Sposi Conte",      dueDate: d( 5,17, 0), estimatedHours: 3,   description: "14 giorni Vietnam classico: Hanoi - Halong - Hoi An - Saigon. Budget medio-alto, esperienze locali.", comments: [] },
  // ─── Transfer Giulia ───
  { id: "t26", title: "Transfer Linate → Hotel Principe - Famiglia Rossi",    category: "transfer",  priority: "high",     status: "todo",            assignees: ["giulia"],           client: "Famiglia Rossi",   dueDate: d( 1,14,30), estimatedHours: 1,   description: "Pickup arrivo volo AZ1234 ore 14:00, 4 pax + 6 bagagli. Van 8 posti.", comments: [] },
  { id: "t27", title: "Transfer Hotel → Stazione Centrale - Coppia Bianchi",  category: "transfer",  priority: "medium",   status: "inprogress",      assignees: ["giulia"],           client: "Coppia Bianchi",   dueDate: d( 3, 9, 0), estimatedHours: 0.5, description: "Pickup hotel ore 09:00, treno Frecciarossa 9:55 per Roma. 2 pax + 3 bagagli.", comments: [] },
];

// ─── AVVISI BACHECA MOCK ──────────────────────────────────────────────────────
export const INITIAL_NOTICES = [
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

// ─── NOTIFICHE MOCK ───────────────────────────────────────────────────────────
export const MOCK_NOTIFICATIONS = [
  { id: "n1", type: "overdue",  title: "Task scaduto: Visto Giappone - Coppia Bianchi",     time: "5 min fa",  read: false },
  { id: "n2", type: "assigned", title: "Nuovo task assegnato: Newsletter Giugno",            time: "1 ora fa",  read: false },
  { id: "n3", type: "comment",  title: "Sofia ha commentato su Hotel Overwater Bungalow",   time: "2 ore fa",  read: false },
  { id: "n4", type: "deadline", title: "Scadenza domani: Conferma voli Maldive",            time: "3 ore fa",  read: true  },
  { id: "n5", type: "comment",  title: "Luca ha aggiornato: Newsletter Giugno",             time: "4 ore fa",  read: true  },
  { id: "n6", type: "deadline", title: "Scadenza oggi: Pagamento acconto Famiglia Rossi",   time: "8 ore fa",  read: true  },
];

// ─── CHAT DEMO ───────────────────────────────────────────────────────────────
// Conversazioni e messaggi di esempio per la modalità senza login (smoke-test
// in dev/preview). In modalità Supabase non vengono mai letti: la chat parte
// da stato vuoto e si idrata dal DB.
//
// Stavano in VoyageDesk.jsx, cioè ~90 righe di dati demo dentro
// l'orchestratore, incluse nel bundle di produzione dove non servono mai.
export const INITIAL_CONVERSATIONS = [
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

export const INITIAL_MESSAGES = {
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
