// src/lib/taskConstants.js
// Costanti immutabili condivise tra componenti e reducer.

export const PRIORITIES = {
  critical: { label: "Critico", color: "#C0392B", bg: "#FEE2E2" },
  high:     { label: "Alto",    color: "#C8832A", bg: "#FEF3C7" },
  medium:   { label: "Medio",   color: "#D4A843", bg: "#FFFBEB" },
  low:      { label: "Basso",   color: "#2D7A4F", bg: "#D1FAE5" },
};

export const STATUSES = ["todo", "inprogress", "awaiting_client", "awaiting_supplier", "done"];

export const STATUS_LABELS = {
  todo:              "Da Fare",
  inprogress:        "In Corso",
  awaiting_client:   "Attesa Cliente",
  awaiting_supplier: "Attesa Fornitore",
  done:              "Completato",
};

export const STATUS_COLORS = {
  todo:              "#6B7280",
  inprogress:        "#3B82F6",
  awaiting_client:   "#F59E0B",
  awaiting_supplier: "#8B5CF6",
  done:              "#2D7A4F",
};

// Palette colori per gli avvisi della bacheca
export const NOTICE_COLORS = ["#FEF3C7", "#FCE7F3", "#D1FAE5", "#DBEAFE", "#E9D5FF"];

// Ricorrenza task — usata in QuickAddTask e CalendarPlanner
export const RECURRENCE_OPTIONS = {
  none:    { label: "Nessuna",      icon: "—" },
  daily:   { label: "Giornaliera",  icon: "↻" },
  weekly:  { label: "Settimanale",  icon: "↻" },
  monthly: { label: "Mensile",      icon: "↻" },
};

// Template predefiniti per la creazione in blocco di task
export const TASK_TEMPLATES = [
  {
    id: "event-corp",
    name: "Evento corporate / Incentive",
    icon: "🎯",
    description: "Set completo per organizzare un viaggio incentive aziendale",
    tasks: [
      { title: "Briefing iniziale con cliente",       category: "client",    priority: "high",     dayOffset: -45, estimatedHours: 2 },
      { title: "Proposta destinazioni e budget",       category: "itinerary", priority: "high",     dayOffset: -40, estimatedHours: 5 },
      { title: "Conferma destinazione cliente",        category: "client",    priority: "critical", dayOffset: -35, estimatedHours: 1 },
      { title: "Prenotazione voli gruppo",             category: "booking",   priority: "critical", dayOffset: -30, estimatedHours: 4 },
      { title: "Prenotazione hotel di gruppo",         category: "itinerary",     priority: "high",     dayOffset: -28, estimatedHours: 3 },
      { title: "Organizzazione transfer aeroportuali", category: "payment",  priority: "medium",   dayOffset: -14, estimatedHours: 2 },
      { title: "Polizza viaggio gruppo",               category: "admin",     priority: "medium",   dayOffset: -10, estimatedHours: 1 },
      { title: "Voucher e documenti ai partecipanti",  category: "admin",     priority: "high",     dayOffset:  -5, estimatedHours: 2 },
    ],
  },
  {
    id: "honeymoon",
    name: "Viaggio di nozze",
    icon: "💍",
    description: "Pacchetto completo per una luna di miele",
    tasks: [
      { title: "Consulenza preferenze coppia",          category: "client",    priority: "high",     dayOffset: -90, estimatedHours: 2 },
      { title: "Proposta itinerario personalizzato",    category: "itinerary", priority: "high",     dayOffset: -75, estimatedHours: 5 },
      { title: "Conferma destinazione e budget",        category: "client",    priority: "critical", dayOffset: -60, estimatedHours: 1 },
      { title: "Prenotazione voli",                     category: "booking",   priority: "critical", dayOffset: -55, estimatedHours: 2 },
      { title: "Prenotazione hotel/resort",             category: "itinerary",     priority: "critical", dayOffset: -50, estimatedHours: 3 },
      { title: "Esperienze speciali (cene, escursioni)",category: "booking",   priority: "high",     dayOffset: -30, estimatedHours: 3 },
      { title: "Documenti viaggio e visti",             category: "visa",      priority: "high",     dayOffset: -25, estimatedHours: 2 },
      { title: "Saldo finale e consegna voucher",       category: "payment",   priority: "high",     dayOffset: -10, estimatedHours: 1 },
    ],
  },
  {
    id: "family",
    name: "Viaggio famiglia",
    icon: "👨‍👩‍👧",
    description: "Pacchetto vacanza per nucleo familiare",
    tasks: [
      { title: "Briefing famiglia e preferenze",              category: "client",    priority: "medium", dayOffset: -45, estimatedHours: 1.5 },
      { title: "Proposta destinazioni family-friendly",       category: "itinerary", priority: "high",   dayOffset: -40, estimatedHours: 3   },
      { title: "Prenotazione voli famiglia",                  category: "booking",   priority: "high",   dayOffset: -30, estimatedHours: 2   },
      { title: "Prenotazione hotel con servizi bambini",      category: "itinerary",     priority: "high",   dayOffset: -28, estimatedHours: 2   },
      { title: "Assicurazione viaggio",                       category: "admin",     priority: "medium", dayOffset: -14, estimatedHours: 1   },
      { title: "Consegna documentazione completa",            category: "admin",     priority: "medium", dayOffset:  -5, estimatedHours: 1   },
    ],
  },
  {
    id: "incoming",
    name: "Visita incoming / Ospitalità",
    icon: "🛬",
    description: "Accoglienza di un cliente o gruppo in arrivo",
    tasks: [
      { title: "Conferma arrivo e voli",          category: "booking",   priority: "high",   dayOffset: -14, estimatedHours: 1   },
      { title: "Prenotazione transfer NCC",        category: "payment",  priority: "high",   dayOffset: -10, estimatedHours: 1   },
      { title: "Prenotazione hotel",               category: "itinerary",     priority: "high",   dayOffset: -10, estimatedHours: 1.5 },
      { title: "Programma esperienze/visite",      category: "itinerary", priority: "medium", dayOffset:  -7, estimatedHours: 3   },
      { title: "Prenotazione ristoranti",          category: "payment",  priority: "medium", dayOffset:  -5, estimatedHours: 1   },
      { title: "Welcome kit e brief operativo",    category: "admin",     priority: "medium", dayOffset:  -2, estimatedHours: 1   },
    ],
  },
];
