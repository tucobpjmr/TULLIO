// ─── MOCK PRATICHE DI VIAGGIO (v1.0) ────────────────────────────────────
export const PRATICA_STATI = {
  bozza:       { label: "Bozza",       color: "#6B7280", bg: "#F3F4F6", icon: "📝" },
  confermata:  { label: "Confermata",  color: "#3B82F6", bg: "#EFF6FF", icon: "✅" },
  in_corso:    { label: "In Corso",    color: "#10B981", bg: "#ECFDF5", icon: "✈️" },
  completata:  { label: "Completata",  color: "#2D7A4F", bg: "#D1FAE5", icon: "🏁" },
  annullata:   { label: "Annullata",   color: "#C0392B", bg: "#FEE2E2", icon: "❌" },
};

// Sequenza stati (per timeline)
export const STATI_SEQUENCE = ["bozza", "confermata", "in_corso", "completata"];

const now = new Date();
const d = (daysOffset, h = 10) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + daysOffset);
  dt.setHours(h, 0, 0, 0);
  return dt.toISOString();
};

// Numerazione progressiva: PR-ANNO-SEQ
export const formatNumeroPratica = (anno, seq) =>
  `PR-${anno}-${String(seq).padStart(3, "0")}`;

export const INITIAL_PRATICHE = [
  {
    id: "pr1",
    numero: "PR-2026-001",
    titolo: "Viaggio Maldive — Famiglia Rossi",
    clientId: "cl1",
    stato: "confermata",
    destinazione: "Maldive, Four Seasons Kuda Huraa",
    dataPartenza: d(15),
    dataRitorno: d(25),
    adulti: 4,
    bambini: 0,
    budget: 12400,
    note: "Suite overwater confermata. Voli business class Emirates. Polizza Allianz emessa.",
    taskIds: ["t1", "t3", "t5", "t19", "t21"],
    supplierIds: ["s1", "s2", "s4"],
    createdAt: d(-90),
    createdBy: "marco",
    deletedAt: null,
  },
  {
    id: "pr2",
    numero: "PR-2026-002",
    titolo: "Luna di miele Giappone — Coppia Bianchi",
    clientId: "cl2",
    stato: "confermata",
    destinazione: "Giappone (Tokyo · Kyoto · Osaka)",
    dataPartenza: d(20),
    dataRitorno: d(34),
    adulti: 2,
    bambini: 0,
    budget: 8500,
    note: "Itinerario 14 giorni. Ryokan Kyoto prenotato. Visto non necessario. Transfer NCC.",
    taskIds: ["t2", "t6", "t9", "t14", "t17"],
    supplierIds: ["s3", "s6"],
    createdAt: d(-60),
    createdBy: "sofia",
    deletedAt: null,
  },
  {
    id: "pr3",
    numero: "PR-2026-003",
    titolo: "Incentive Travel — Azienda TechCorp",
    clientId: "cl3",
    stato: "bozza",
    destinazione: "Da definire (Dubrovnik / Marrakech / Lisbona)",
    dataPartenza: d(60),
    dataRitorno: d(63),
    adulti: 50,
    bambini: 0,
    budget: 85000,
    note: "Budget approvato. Attesa conferma destinazione. Proposta inviata al cliente.",
    taskIds: ["t4", "t11", "t13", "t15", "t20"],
    supplierIds: [],
    createdAt: d(-30),
    createdBy: "marco",
    deletedAt: null,
  },
  {
    id: "pr4",
    numero: "PR-2026-004",
    titolo: "Viaggio scolastico Atene — Liceo Manzoni",
    clientId: "cl5",
    stato: "confermata",
    destinazione: "Atene, Grecia",
    dataPartenza: d(45),
    dataRitorno: d(50),
    adulti: 3,
    bambini: 30,
    budget: 18000,
    note: "30 studenti + 3 accompagnatori. Hotel Plaka (Aegean Hotels). Rooming list da inviare.",
    taskIds: ["t24"],
    supplierIds: ["s5"],
    createdAt: d(-20),
    createdBy: "roberto",
    deletedAt: null,
  },
];
