// src/components/shell/AccountSicurezza.jsx
// La zona "sicurezza dell'account" del profilo personale: cambio password,
// uscita da tutti i dispositivi, eliminazione dell'account.
//
// PERCHÉ È USCITA DA ProfileEditor.jsx (M-5, audit del 25 agosto). La modale
// faceva due lavori diversi che condividevano solo la cornice. Uno è il
// PROFILO — nome, foto, email, telefono: campi di dominio, che si salvano
// insieme con un dispatch solo e passano dal registry di persistenza. L'altro è
// l'ACCOUNT: tre operazioni di autenticazione, ciascuna con la propria
// fisarmonica, la propria conferma e il proprio esito, che non passano dal
// reducer dell'app affatto (vanno a `useAuth`, cioè a Supabase Auth) e che non
// hanno un "salva" comune — si eseguono una per volta e nessuna delle tre
// tocca `draft`.
//
// La prova che erano due cose: il reducer locale del file aveva quattro fette e
// tre erano di questa sezione. Ora sono qui, e `salvaInVolo` — la quarta, che è
// il freno al doppio invio del salvataggio del PROFILO — è tornata a essere un
// `useState` accanto a ciò che protegge.
//
// ⚠️ `useIsMounted()` non è una precauzione decorativa. `deleteAccount()` in
// caso di successo chiama già `signOut()`, quindi l'app smonta questa modale da
// sola: lì lo smontaggio è l'esito NORMALE. Per `signOutOvunque()` invece il
// guard serve davvero su QUESTA scheda, perché la modale non sparisce finché
// `onAuthStateChange` non aggiorna `session`.
import { useId, useReducer } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import { PasswordField } from "../ui/PasswordField.jsx";
import { PASSWORD_MIN, passwordValida } from "../../lib/validators.js";
import * as stiliComuni from "../../styles/common.js";
import { ESITO_PRONTO, accountIniziale, accountReducer } from "./accountSicurezzaReducer.js";
import {
  boxF125Danger, colGap10Mt10, colGap10Mt102, inputWFull, mt2, row, rowCenterGap8,
  rowCenterGap82, rowCenterGap8Neutral, txtF11Muted2, txtF12Muted, txtF13Text,
} from "./profileEditorStyles.js";

export function AccountSicurezza() {
  const { session, updatePassword, deleteAccount, signOutOvunque } = useAuth();
  const montato = useIsMounted();
  const [stato, accountDispatch] = useReducer(accountReducer, accountIniziale);
  const nuovaPwdId = useId();
  const confermaPwdId = useId();
  const confermaElimId = useId();

  const pwdInVolo = stato.pwd.esito.fase === "invio";
  const elimInVolo = stato.elim.esito.fase === "invio";

  const cambiaPassword = async () => {
    const errPassword = passwordValida()(stato.pwd.bozza.nuova);
    if (errPassword) {
      accountDispatch({ type: "PWD_ESITO", esito: { fase: "errore", testo: errPassword } });
      return;
    }
    if (stato.pwd.bozza.nuova !== stato.pwd.bozza.conferma) {
      accountDispatch({ type: "PWD_ESITO", esito: { fase: "errore", testo: "Le due password non coincidono." } });
      return;
    }
    accountDispatch({ type: "PWD_ESITO", esito: { fase: "invio", testo: null } });
    const { error } = await updatePassword(stato.pwd.bozza.nuova);
    if (!montato()) return;
    if (error) {
      accountDispatch({ type: "PWD_ESITO", esito: { fase: "errore", testo: error.message || "Cambio password non riuscito." } });
    } else {
      accountDispatch({ type: "PWD_SUCCESSO" });
    }
  };

  const escoOvunque = async () => {
    accountDispatch({ type: "SIGNOUT_ESITO", esito: { fase: "invio", testo: null } });
    const { error } = await signOutOvunque();
    if (!montato()) return;
    accountDispatch({ type: "SIGNOUT_ESITO", esito: error
      ? { fase: "errore", testo: error.message || "Non è stato possibile disconnettere gli altri dispositivi." }
      : ESITO_PRONTO });
  };

  const eliminaAccount = async () => {
    if (stato.elim.conferma !== "ELIMINA") return;
    accountDispatch({ type: "ELIM_ESITO", esito: { fase: "invio", testo: null } });
    const { error } = await deleteAccount();
    if (!montato()) return;
    accountDispatch({ type: "ELIM_ESITO", esito: error
      ? { fase: "errore", testo: error.message || "Eliminazione non riuscita." }
      : ESITO_PRONTO });
  };

  // Le tre operazioni esistono solo con una sessione vera: in modalità demo
  // non c'è un account da proteggere.
  if (!session) return null;

  return (
    <>
        {/* ── Cambia password (solo con sessione reale) ── */}
        <div>
          <button
            onClick={() => accountDispatch({ type: "TOGGLE_PWD" })}
            style={rowCenterGap8}
          >
            <span style={stiliComuni.txtF15}>🔑</span>
            Cambia password
            <span style={txtF11Muted2}>{stato.pwd.aperta ? "▲" : "▼"}</span>
          </button>
          {stato.pwd.aperta && (
            <div style={colGap10Mt10}>
              <div>
                <label className="vd-field-label" htmlFor={nuovaPwdId}>NUOVA PASSWORD</label>
                <PasswordField
                  id={nuovaPwdId}
                  inputWFull={inputWFull} autoComplete="new-password"
                  value={stato.pwd.bozza.nuova} onChange={e => accountDispatch({ type: "SET_PWD_CAMPO", campo: "nuova", valore: e.target.value })}
                  placeholder={`Minimo ${PASSWORD_MIN} caratteri`}
                  show={stato.pwd.rivela} onToggle={() => accountDispatch({ type: "TOGGLE_RIVELA_PWD" })}
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>
              <div>
                <label className="vd-field-label" htmlFor={confermaPwdId}>CONFERMA PASSWORD</label>
                <PasswordField
                  id={confermaPwdId}
                  inputWFull={inputWFull} autoComplete="new-password"
                  value={stato.pwd.bozza.conferma} onChange={e => accountDispatch({ type: "SET_PWD_CAMPO", campo: "conferma", valore: e.target.value })}
                  placeholder="Ripeti la password"
                  show={stato.pwd.rivela} onToggle={() => accountDispatch({ type: "TOGGLE_RIVELA_PWD" })}
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                  onKeyDown={e => { if (e.key === "Enter") cambiaPassword(); }}
                />
              </div>
              {/* Un messaggio da mostrare c'è solo nelle fasi terminali: la
                  fase "invio" azzera `testo`, quindi l'esito di prima non
                  può più convivere con un salvataggio in corso. */}
              {stato.pwd.esito.testo && (
                <div role="status" style={{
                  fontSize: 12.5, borderRadius: 8, padding: "8px 10px",
                  background: stato.pwd.esito.fase === "ok" ? "rgba(45,122,79,0.1)" : "rgba(192,57,43,0.08)",
                  border: `1px solid ${stato.pwd.esito.fase === "ok" ? "var(--success)" : "var(--danger)"}`,
                  color: stato.pwd.esito.fase === "ok" ? "var(--success)" : "var(--danger)",
                }}>{stato.pwd.esito.testo}</div>
              )}
              <div style={row}>
                <button
                  onClick={cambiaPassword}
                  disabled={pwdInVolo || !stato.pwd.bozza.nuova}
                  style={{
                    background: pwdInVolo || !stato.pwd.bozza.nuova ? "var(--surface3)" : "var(--navy)",
                    color: pwdInVolo || !stato.pwd.bozza.nuova ? "var(--text-muted)" : "#fff",
                    border: "none", padding: "9px 18px", borderRadius: 8,
                    cursor: pwdInVolo || !stato.pwd.bozza.nuova ? "not-allowed" : "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  }}
                >{pwdInVolo ? "Salvataggio…" : "Aggiorna password"}</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Esci da tutti i dispositivi (dispositivo perso, sessione reale) ── */}
        <div style={mt2}>
          <p style={txtF12Muted}>
            Disconnette ogni telefono, tablet e computer collegato a questo
            account, incluso questo. Usalo se hai perso un dispositivo.
          </p>
          {stato.signOut.esito.testo && (
            <div role="status" style={boxF125Danger}>{stato.signOut.esito.testo}</div>
          )}
          <div style={row}>
            <button
              onClick={escoOvunque}
              disabled={stato.signOut.esito.fase === "invio"}
              style={rowCenterGap8Neutral}
            >
              <span style={stiliComuni.txtF15}>🔒</span>
              {stato.signOut.esito.fase === "invio" ? "Disconnessione…" : "Esci da tutti i dispositivi"}
            </button>
          </div>
        </div>

        {/* ── Elimina account (zona pericolosa, solo con sessione reale) ── */}
        <div style={mt2}>
          <button
            onClick={() => accountDispatch({ type: "TOGGLE_ELIM" })}
            style={rowCenterGap82}
          >
            <span style={stiliComuni.txtF15}>🗑️</span>
            Elimina account
            <span style={txtF11Muted2}>{stato.elim.aperta ? "▲" : "▼"}</span>
          </button>
          {stato.elim.aperta && (
            <div style={colGap10Mt102}>
              <p style={txtF13Text}>
                Questa azione <strong>disabilita permanentemente</strong> il tuo account e impedisce futuri accessi.
                I tuoi messaggi e commenti vengono conservati. L'operazione è irreversibile.
              </p>
              <div>
                <label className="vd-field-label" htmlFor={confermaElimId}>DIGITA &quot;ELIMINA&quot; PER CONFERMARE</label>
                <input
                  id={confermaElimId}
                  value={stato.elim.conferma} onChange={e => accountDispatch({ type: "SET_CONFERMA_ELIM", valore: e.target.value })}
                  placeholder="ELIMINA" style={{ ...inputWFull, borderColor: "rgba(192,57,43,0.4)" }}
                  onFocus={e => e.target.style.borderColor = "var(--danger)"}
                  onBlur={e => e.target.style.borderColor = "rgba(192,57,43,0.4)"}
                />
              </div>
              {stato.elim.esito.testo && (
                <div role="status" style={boxF125Danger}>{stato.elim.esito.testo}</div>
              )}
              <div style={row}>
                <button
                  onClick={eliminaAccount}
                  disabled={elimInVolo || stato.elim.conferma !== "ELIMINA"}
                  style={{
                    background: elimInVolo || stato.elim.conferma !== "ELIMINA" ? "var(--surface3)" : "var(--danger)",
                    color: elimInVolo || stato.elim.conferma !== "ELIMINA" ? "var(--text-muted)" : "#fff",
                    border: "none", padding: "9px 18px", borderRadius: 8,
                    cursor: elimInVolo || stato.elim.conferma !== "ELIMINA" ? "not-allowed" : "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  }}
                >{elimInVolo ? "Eliminazione…" : "Elimina account definitivamente"}</button>
              </div>
            </div>
          )}
        </div>
    </>
  );
}
