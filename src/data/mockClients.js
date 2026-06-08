// ─── MOCK CLIENTS (Anagrafica Clienti v1.0) ───────────────────────────────
const now = new Date();
const d = (daysOffset) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + daysOffset);
  return dt.toISOString();
};

export const INITIAL_CLIENTS = [
  {
    id: "cl1",
    name: "Famiglia Rossi",
    type: "individual",
    email: "rossi.famiglia@email.com",
    phone: "+39 347 123 4567",
    address: "Via Montenapoleone 5, Milano",
    notes: "Cliente VIP. Viaggi luxury, preferisce suite overwater e business class. Budget elevato, disponibile a pacchetti personalizzati.",
    tags: ["VIP", "Luxury", "Maldive"],
    createdAt: d(-120),
    deletedAt: null,
  },
  {
    id: "cl2",
    name: "Coppia Bianchi",
    type: "individual",
    email: "bianchi.coppia@gmail.com",
    phone: "+39 339 876 5432",
    address: "Via Torino 22, Roma",
    notes: "Luna di miele Giappone. Interessati a esperienze culturali autentiche: ryokan, cerimonie del tè, templi all'alba.",
    tags: ["Honeymoon", "Giappone", "Cultural"],
    createdAt: d(-60),
    deletedAt: null,
  },
  {
    id: "cl3",
    name: "Azienda TechCorp",
    type: "corporate",
    email: "hr@techcorp.it",
    phone: "+39 02 9876 5432",
    address: "Via della Posta 8, Milano",
    notes: "Viaggi incentive aziendali. Budget approvato 85.000€. Gruppo 50 persone. Referente: Dott. Ferri (HR Director).",
    tags: ["Corporate", "Incentive", "Gruppo"],
    createdAt: d(-90),
    deletedAt: null,
  },
  {
    id: "cl4",
    name: "Famiglia Marchetti",
    type: "individual",
    email: "marchetti@libero.it",
    phone: "+39 380 444 5555",
    address: "Corso Garibaldi 12, Torino",
    notes: "Richiesta crociera Caraibi 7 notti per 4 persone, partenza Miami. Contattare entro 48h dalla ricezione richiesta.",
    tags: ["Caraibi", "Famiglia", "Crociera"],
    createdAt: d(-5),
    deletedAt: null,
  },
  {
    id: "cl5",
    name: "Liceo Manzoni",
    type: "corporate",
    email: "didattica@liceomanzoni.edu.it",
    phone: "+39 02 1234 5678",
    address: "Via Manzoni 1, Milano",
    notes: "Viaggio scolastico Atene. 30 studenti + 3 accompagnatori. Tariffe convenzionate concordate. Budget vincolato.",
    tags: ["Scolastico", "Gruppo", "Atene"],
    createdAt: d(-30),
    deletedAt: null,
  },
  {
    id: "cl6",
    name: "Sposi Conte",
    type: "individual",
    email: "conte.sposi@gmail.com",
    phone: "+39 328 765 4321",
    address: "Via Nazionale 88, Napoli",
    notes: "Viaggio nozze Vietnam 14 giorni. Interesse per esperienze locali autentiche: mercati, cucina, Delta del Mekong.",
    tags: ["Honeymoon", "Vietnam", "Luxury"],
    createdAt: d(-10),
    deletedAt: null,
  },
];
