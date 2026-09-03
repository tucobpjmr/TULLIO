import { useRef, useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import { useSalvataggioLista } from "../useSalvataggioLista.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowStartGap8 = { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginTop: 2, cursor: "pointer" };
const mt3 = { marginTop: 3, cursor: "pointer" };
const txtF12LvMuted = { fontSize: 12, color: "var(--lv-muted)", marginTop: 6 };

// ─── Modifica dati lista (titolo +, volendo, nome cliente) ─────────────────
// Il titolo appartiene alla lista; il nome cliente NO: è la riga
// dell'anagrafica condivisa (`clients`), la stessa che usano le altre liste
// dello stesso intestatario, la scheda cliente e i task che lo citano.
// `modifica_lista` con p_client_name valorizzato fa una UPDATE su `clients`.
//
// Per questo il campo nasce in sola lettura e serve una spunta esplicita per
// sbloccarlo: chi voleva correggere il titolo di una lista non deve poter
// rinominare per sbaglio un cliente di tutta l'agenzia. A spunta spenta il
// nome non viene nemmeno inviato (clientName: null → la RPC lo lascia com'è).
export function EditListaModal({ lista, onSave, onClose }) {
  const nomeOriginale = lista.clients?.name || "";
  const [name, setName] = useState(nomeOriginale);
  const [titolo, setTitolo] = useState(lista.titolo || "");
  const [rinomina, setRinomina] = useState(false);
  const [errore, setErrore] = useState(null);
  const rifNome = useRef(null);

  const { salva, inVolo } = useSalvataggioLista(onSave.run);

  const submit = () => {
    // B-3 · Il messaggio va DOVE è successo. Era `onSave.onError(...)`, cioè un
    // toast in un angolo dello schermo mentre il campo vuoto restava identico a
    // quelli giusti — e per chi usa uno screen reader nessun legame fra il
    // messaggio e l'input. Il campo qui è uno solo, quindi non serve
    // `primoCampoInvalido`: il focus ha una sola destinazione possibile.
    //
    // Il `disabled` del campo NON è quello respinto dalla regola: non è un
    // comando spento perché il form è incompleto, è un campo in sola lettura
    // finché non lo si sblocca di proposito — rinominare il titolare cambia
    // l'anagrafica condivisa di tutta l'agenzia, ed è il senso della spunta.
    if (rinomina && !name.trim()) {
      setErrore("Il nome del titolare è obbligatorio: togli la spunta per lasciarlo com'è.");
      rifNome.current?.focus();
      return;
    }
    setErrore(null);
    salva({
      id: lista.id,
      titolo: titolo.trim() || null,
      clientName: rinomina ? name.trim() : null,
    });
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Modifica dati lista</h2>
      <div className="row lv-field">
        <label htmlFor="el-title">Titolo della lista (facoltativo)</label>
        <input id="el-title" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Buono viaggio 2026" />
      </div>
      <div className="row lv-field">
        <label htmlFor="el-client">Nome del titolare (anagrafica condivisa)</label>
        <input
          id="el-client"
          ref={rifNome}
          value={name}
          disabled={!rinomina}
          onChange={(e) => { setName(e.target.value); setErrore(null); }}
          placeholder="Es. ROSSI MARIO"
          style={rinomina ? undefined : { opacity: 0.6 }}
          {...ariaCampo("el-client-err", errore)}
        />
        <FieldError id="el-client-err">{errore}</FieldError>
      </div>
      <label style={rowStartGap8} htmlFor="el-rinomina">
        <input
          id="el-rinomina"
          type="checkbox"
          checked={rinomina}
          onChange={(e) => {
            setRinomina(e.target.checked);
            setErrore(null);
            if (!e.target.checked) setName(nomeOriginale);
          }}
          style={mt3}
        />
        <span>Rinomina il titolare in anagrafica</span>
      </label>
      <p style={txtF12LvMuted}>
        {rinomina
          ? "Il nome è quello dell'anagrafica: cambiarlo cambia l'intestazione di tutte le liste di questo cliente, della sua scheda e dei riepiloghi generati da qui in avanti."
          : "Per correggere solo questa lista basta il titolo: il nome del titolare resta com'è. I cointestatari (se presenti) si aggiungono e rimuovono dal dettaglio della lista, non da qui."}
      </p>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={inVolo} onClick={submit}>
          {inVolo ? "Salvo…" : "Salva modifiche"}
        </button>
      </div>
    </LvOverlay>
  );
}
