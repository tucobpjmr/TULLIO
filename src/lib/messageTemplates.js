// src/lib/messageTemplates.js
// Template messaggi chat — persistiti in localStorage (artifact-friendly).
// Sessione 24. Esporta load/save/use hook + i template di default.

import { useState, useEffect, useCallback } from "react";

export const TEMPLATES_KEY = "voyagedesk:msgTemplates:v1";

export const DEFAULT_TEMPLATES = [
  { id: "tpl-welcome", name: "Saluto cliente", text: "Buongiorno! Sono [tuo nome] di VoyageDesk, come posso aiutarla?" },
  { id: "tpl-quote", name: "Preventivo inviato", text: "Le ho appena inviato via email il preventivo dettagliato. Resto in attesa di un suo riscontro." },
  { id: "tpl-confirm", name: "Conferma prenotazione", text: "Confermo che la prenotazione è stata effettuata correttamente. A breve riceverà i voucher via email." },
  { id: "tpl-followup", name: "Follow-up", text: "Volevo solo verificare se è tutto chiaro o se avesse bisogno di ulteriori informazioni." },
  { id: "tpl-thanks", name: "Ringraziamento", text: "Grazie mille per aver scelto VoyageDesk! Buon viaggio." },
];

export const loadTemplates = () => {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [...DEFAULT_TEMPLATES];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...DEFAULT_TEMPLATES];
  } catch {
    return [...DEFAULT_TEMPLATES];
  }
};

export const saveTemplates = (list) => {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};

// Custom event per sincronizzare modifiche tra finestra Admin e ChatPanel
// nella stessa tab (storage event copre solo le altre tab).
export const TEMPLATES_EVENT = "voyagedesk:msgTemplates:changed";

export const useMessageTemplates = () => {
  const [templates, setTemplatesState] = useState(() => loadTemplates());

  useEffect(() => {
    const sync = () => setTemplatesState(loadTemplates());
    window.addEventListener("storage", sync);
    window.addEventListener(TEMPLATES_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(TEMPLATES_EVENT, sync);
    };
  }, []);

  const setTemplates = useCallback((next) => {
    setTemplatesState(prev => {
      const list = typeof next === "function" ? next(prev) : next;
      saveTemplates(list);
      window.dispatchEvent(new CustomEvent(TEMPLATES_EVENT));
      return list;
    });
  }, []);

  return [templates, setTemplates];
};
