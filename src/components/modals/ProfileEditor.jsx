// ─── PROFILE EDITOR ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useReducer, useRef } from "react";
import { useViewport } from "../Viewport.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import { Users as UsersAPI } from "../../lib/api.js";
import { PasswordField } from "../ui/PasswordField.jsx";
import { useAvatarSrc } from "../ui/Avatar.jsx";
import { validaCampi, emailValida, obbligatorio, primoCampoInvalido } from "../../lib/validators.js";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { Modal } from "../ui/Modal.jsx";
import { roleLabel } from "../../lib/taskConstants.js";

import { ESITO_PRONTO, profileUiIniziale, profileUiReducer } from "./profileEditorReducer.js";
import { CropModal, dataUrlToBlob } from "./CropModal.jsx";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF125Danger, boxF13Bold, boxF13Bold2, boxF13Bold3, boxF13Bold3InVolo, boxF14Muted, boxW100H100, boxW52H52,
  colCenterGap12, colGap10Mt10, colGap10Mt102, colGap18, mt2, row, rowCenterBetween,
  rowCenterGap14, rowCenterGap8, rowCenterGap82, rowCenterGap8Neutral, rowCenterMiddle, rowCenterMiddle2, rowGap10,
  txtF11Mt2, txtF11Muted2, txtF12Muted, txtF13Text, txtF18Bold,
} from "./profileEditorStyles.js";
import { useDispatch } from "../../state/DispatchContext.jsx";

// Criticità #10 — il nome è obbligatorio e l'email, se compilata, dev'essere
// valida. Prima il primo usciva in silenzio (`if (!name.trim()) return;`) e la
// seconda finiva in un toast in un angolo, mentre il campo sbagliato restava
// indistinguibile da quelli giusti.
const REGOLE = {
  name: obbligatorio("Il nome visualizzato non può essere vuoto."),
  email: emailValida(),
};
const ORDINE = ["name", "email"];

// ─── ST-7 · CLASSIFICAZIONE DEGLI STATI ──────────────────────────────────────
// Prima questo componente coordinava 17 `useState` indipendenti (18 nel conteggio
// dell'audit, che includeva la riga di import). Il numero non era il problema:
// lo era il fatto che nulla nel codice dicesse QUALI di quei valori sono la
// stessa cosa. Classificati una volta per tutte:
//
//   • CAMPI DEL PROFILO (name, color, email, phone, photoUrl) → un solo oggetto
//     `draft` con un setter per campo, esattamente come `TaskSlideOver`. Sono i
//     cinque valori che compongono il payload di UPDATE_OWN_PROFILE: nascono
//     insieme da `member`, si leggono insieme al salvataggio e si buttano via
//     insieme quando si preme Annulla.
//   • LE DUE SEZIONI A FISARMONICA (password, elimina account), L'ESITO DELLE
//     TRE OPERAZIONI ASINCRONE e IL FRENO AL DOPPIO INVIO del salvataggio →
//     un solo `useReducer`, `profileUiReducer` (`./profileEditorReducer.js`,
//     B-3 residuo dell'audit del 15 agosto, chiuso il 23). Erano 9 `useState`
//     indipendenti che cambiavano sempre in GRUPPO: aprire "Cambia password"
//     azzera insieme esito e bozza, un cambio riuscito azzera la bozza ma non
//     l'esito. Restano campi DISTINTI e annidati per sezione (`ui.pwd`,
//     `ui.elim`, `ui.signOut`) — non fusi in un valore solo — per le stesse
//     ragioni per cui restano separati qui sotto: un reducer raggruppa i
//     PUNTI DI SCRITTURA, non il significato dei campi.
//
// Restano DELIBERATAMENTE separati, perché sono valori indipendenti e accorparli
// è la parte del rilievo che non va fatta:
//   • `errori` — non è un valore del form ma il verdetto sull'ultimo tentativo di
//     salvataggio, con un ciclo di vita opposto a quello di `draft` (si spegne
//     quando il campo cambia, si riaccende al submit). Dentro `draft` un
//     `setDraft` di routine finirebbe per riscriverlo o azzerarlo.
//   • `cropSrc` — è l'immagine SORGENTE del ritaglio, non la foto del profilo:
//     esiste solo mentre la CropModal è aperta e annullarla non deve toccare
//     `draft.photoUrl`.
//   • `ui.pwd.aperta` / `ui.elim.aperta` — due sezioni a fisarmonica
//     INDIPENDENTI: oggi possono essere aperte entrambe insieme, e fonderle in
//     un'unica "sezione attiva" (come si è fatto per gli overlay di
//     ListeViaggio, che invece sono mutuamente esclusivi) sarebbe un cambiamento
//     di comportamento visibile — restano due chiavi separate dentro il
//     reducer, non un'unica "sezione aperta".
//   • `ui.pwd.rivela` — preferenza di visualizzazione (icona occhio) condivisa
//     dai due campi password: deve sopravvivere allo svuotamento della bozza,
//     che dopo un cambio riuscito azzera i campi ma non deve richiudere l'occhio
//     (l'azione `PWD_SUCCESSO` infatti non la tocca).
//   • `ui.elim.conferma` — la parola digitata nella zona pericolosa È un campo,
//     ma uno solo: un oggetto bozza di una chiave non aggiungerebbe nulla, e non
//     può stare in `draft` perché non si salva, si confronta con "ELIMINA".
export const ProfileEditor = ({ member, onClose }) => {
  const dispatch = useDispatch();
  const { isMobile } = useViewport();
  const { session, updatePassword, deleteAccount, signOutOvunque } = useAuth();
  const montato = useIsMounted();
  const [draft, setDraft] = useState({
    name: member.name || "",
    // Il colore non è modificabile da questa modale, ma è un campo del profilo:
    // viaggia nel payload e va letto da lì, non ricalcolato al salvataggio.
    color: member.color || "#0F2044",
    email: member.email || "",
    phone: member.phone || "",
    photoUrl: member.photoUrl || "",
  });
  // draft.photoUrl può essere un path del bucket privato (S-10), un data URI
  // appena ritagliato o una vecchia public URL: l'anteprima passa sempre da qui.
  const photoPreview = useAvatarSrc(draft.photoUrl || null);
  const [cropSrc, setCropSrc] = useState(null);
  const fileRef = useRef(null);
  const [errori, setErrori] = useState({});
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const rifCampo = { name: nameRef, email: emailRef };
  // Il riduttore di campo della bozza: un solo punto di scrittura per tutti i
  // campi del profilo. L'errore di un campo si spegne appena lo si tocca
  // (vedi AddMovBox).
  const scrivi = (campo, valore) => {
    setDraft(prec => ({ ...prec, [campo]: valore }));
    setErrori(prec => (prec[campo] ? { ...prec, [campo]: undefined } : prec));
  };
  const [ui, uiDispatch] = useReducer(profileUiReducer, profileUiIniziale);

  // Uscita da ogni dispositivo: revoca lato server tutti i refresh
  // token. A differenza di deleteAccount() non smonta questa modale da sola
  // in caso di successo su QUESTA scheda (onAuthStateChange la farà comunque
  // sparire non appena il provider aggiorna `session`), quindi il guard
  // useIsMounted() qui serve davvero, non solo a scopo descrittivo.
  const handleSignOutOvunque = async () => {
    uiDispatch({ type: "SIGNOUT_ESITO", esito: { fase: "invio", testo: null } });
    const { error } = await signOutOvunque();
    if (!montato()) return;
    uiDispatch({ type: "SIGNOUT_ESITO", esito: error
      ? { fase: "errore", testo: error.message || "Non è stato possibile disconnettere gli altri dispositivi." }
      : ESITO_PRONTO });
  };

  const handleDeleteAccount = async () => {
    if (ui.elim.conferma !== "ELIMINA") return;
    uiDispatch({ type: "ELIM_ESITO", esito: { fase: "invio", testo: null } });
    const { error } = await deleteAccount();
    // On success, deleteAccount() already called signOut() → app unmounts this
    // modal automatically: qui lo smontaggio è l'esito NORMALE, quindi il guard
    // di useIsMounted() non è una precauzione ma la descrizione del caso.
    if (!montato()) return;
    uiDispatch({ type: "ELIM_ESITO", esito: error
      ? { fase: "errore", testo: error.message || "Eliminazione non riuscita." }
      : ESITO_PRONTO });
  };

  const handleChangePwd = async () => {
    if (ui.pwd.bozza.nuova.length < 8) { uiDispatch({ type: "PWD_ESITO", esito: { fase: "errore", testo: "La password deve avere almeno 8 caratteri." } }); return; }
    if (ui.pwd.bozza.nuova !== ui.pwd.bozza.conferma) { uiDispatch({ type: "PWD_ESITO", esito: { fase: "errore", testo: "Le due password non coincidono." } }); return; }
    uiDispatch({ type: "PWD_ESITO", esito: { fase: "invio", testo: null } });
    const { error } = await updatePassword(ui.pwd.bozza.nuova);
    if (!montato()) return;
    if (error) {
      uiDispatch({ type: "PWD_ESITO", esito: { fase: "errore", testo: error.message || "Cambio password non riuscito." } });
    } else {
      uiDispatch({ type: "PWD_SUCCESSO" });
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so the same file can be re-selected
    if (file.size > 5 * 1024 * 1024) {
      // Criticità #8: era un `alert()` — modale bloccante del browser, fuori
      // dal tema dell'app e impossibile da leggere per chi sta guardando
      // altrove. È un errore vero, quindi va nel canale degli errori veri.
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Immagine troppo grande: il limite è 5 MB." } });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result);
    reader.readAsDataURL(file);
  };

  // M-2 dell'audit del 16 agosto. Il salvataggio del profilo è l'operazione
  // più LENTA di questa modale — se la foto è nuova carica un blob sul bucket
  // `avatars` PRIMA di scrivere il profilo — ed era l'unica delle tre senza
  // alcuno stato in volo: nessun feedback per l'intera durata dell'upload
  // (schermo immobile, come se il click non fosse arrivato) e nessun freno al
  // secondo click, che ricaricava l'avatar da capo e dispatchava una seconda
  // UPDATE_OWN_PROFILE. Le altre due operazioni del file — cambio password ed
  // eliminazione account — avevano già `ui.pwd.esito.fase === "invio"` /
  // `ui.elim.esito.fase === "invio"`: qui manca solo la terza.
  //
  // ⚠️ Non è il bottone disabilitato che la validazione vieta (criticità #10):
  // quello nasconde un campo mancante invece di dirlo, e resta attivo. Questo
  // si spegne SOLO per la durata di una scrittura già partita.
  const handleSave = async () => {
    if (ui.salvaInVolo) return;
    const trovati = validaCampi(draft, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      rifCampo[primo]?.current?.focus();
      return;
    }
    setErrori({});
    uiDispatch({ type: "SALVA_IN_VOLO", valore: true });
    const trimmedEmail = draft.email.trim();
    // Foto: se è una nuova immagine (data-URL dal crop, o una vecchia base64
    // ancora in photo_url), caricala sul bucket 'avatars' e sostituiscila con
    // la public URL. Così users.photo_url non contiene più il base64 (riga
    // enorme riscaricata per tutto il team ad ogni evento realtime), ma una
    // URL leggera. Le URL http già presenti (foto invariata) non si ricaricano.
    let finalPhotoUrl = draft.photoUrl || null;
    if (session && typeof draft.photoUrl === "string" && draft.photoUrl.startsWith("data:")) {
      const { url, error: upErr } = await UsersAPI.uploadAvatar(member.id, dataUrlToBlob(draft.photoUrl));
      if (!montato()) return;
      if (upErr || !url) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Foto non caricata: ${upErr?.message || "errore sconosciuto"}` } });
        uiDispatch({ type: "SALVA_IN_VOLO", valore: false });
        return; // non salvo: l'utente può ritentare senza perdere la foto scelta
      }
      finalPhotoUrl = url;
    }
    const nome = draft.name.trim();
    const payload = {
      name: nome,
      avatar: nome.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      color: draft.color,
      email: trimmedEmail,
      phone: draft.phone.trim(),
      photoUrl: finalPhotoUrl,
    };
    // Aggiornamento ottimistico e persistenza sono UNA sola operazione,
    // dichiarata in state/persistence.js (entry UPDATE_OWN_PROFILE): il registry
    // scrive public.users (nome/iniziali/colore/foto, il trigger
    // anti-escalation lascia passare questi campi) e public.user_contacts
    // (email/telefono, che dallo Step S non sono più colonne di public.users), e
    // se una delle due fallisce riporta indietro lo state e mostra il toast.
    //
    // Qui resta solo la decisione che spetta alla modale: se chiudersi. Prima
    // le due scritture stavano in questo corpo, senza rollback e con onClose()
    // incondizionato — l'utente vedeva il profilo aggiornato e la modale
    // chiusa anche quando sul database non era arrivato nulla.
    //
    // Il dispatch sincronizzato ritorna { error }; in modalità mock e nei test
    // può essere una spia che ritorna undefined, da cui l'accesso opzionale.
    const res = await dispatch({ type: "UPDATE_OWN_PROFILE", payload });
    // La modale può essere già smontata: il salvataggio riuscito la chiude, e
    // `dispatch` è awaitato — è lo stesso contratto di useIsMounted() usato
    // sopra per l'upload.
    if (!montato()) return;
    uiDispatch({ type: "SALVA_IN_VOLO", valore: false });
    // In errore la modale resta APERTA: chiuderla butterebbe via quanto è stato
    // digitato e, subito dopo un rollback che ha appena rimesso i valori
    // precedenti, lascerebbe l'utente davanti al profilo di prima senza un modo
    // ovvio di riprovare.
    if (res?.error) return;
    onClose();
  };

  const initials = draft.name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
  // Le TRE operazioni asincrone leggono la propria fase in un punto solo: il
  // resto del render chiede "sta partendo?" e non incrocia due booleani.
  const pwdInVolo = ui.pwd.esito.fase === "invio";
  const elimInVolo = ui.elim.esito.fase === "invio";

  const fieldLabel = (text) => (
    <label className="vd-field-label">{text}</label>
  );

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", outline: "none",
  };

  return (
    <>
      {cropSrc && (
        <CropModal
          src={cropSrc}
          onConfirm={(dataUrl) => { scrivi("photoUrl", dataUrl); setCropSrc(null); }}
          onCancel={() => setCropSrc(null)}
        />
      )}
      {/* `closeOnOverlay={false}`: questo form ha sei campi, due sotto-form e
          nessun salvataggio automatico — un click di troppo sul velo buttava via
          tutto senza chiedere. Si chiude da ✕, da Annulla o con Esc, che la pila
          di ui/Modal.jsx consegna al modale in cima (la CropModal, quando è
          aperta). */}
      <Modal
        open
        onClose={onClose}
        labelledBy="vd-profile-title"
        width={isMobile ? "calc(100vw - 32px)" : 480}
        closeOnOverlay={false}
        cardStyle={{ borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      >
        {/* Header */}
        <div style={rowCenterBetween}>
          <div style={rowCenterGap14}>
            {/* Preview avatar */}
            {photoPreview ? (
              <img src={photoPreview} alt="" style={boxW52H52} />
            ) : (
              <div style={{
                width: 52, height: 52, borderRadius: "50%", background: draft.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: "#fff",
                border: "3px solid rgba(255,255,255,0.3)",
              }}>{initials}</div>
            )}
            <div>
              <div id="vd-profile-title" className="playfair" style={txtF18Bold}>Modifica profilo</div>
              <div style={txtF11Mt2}>{roleLabel(member)}</div>
            </div>
          </div>
          <button onClick={onClose} style={stiliComuni.btnChiudiSuScuro}>✕</button>
        </div>

        {/* Body */}
        <div style={colGap18}>

          {/* ── Foto profilo ── */}
          <div style={colCenterGap12}>
            {photoPreview ? (
              <div style={stiliComuni.relative}>
                <img src={photoPreview} alt="" style={boxW100H100} />
                <button onClick={() => scrivi("photoUrl", "")} style={rowCenterMiddle}>✕</button>
              </div>
            ) : (
              <div style={rowCenterMiddle2}>Nessuna foto</div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={stiliComuni.hidden} />
            <button onClick={() => fileRef.current?.click()} style={boxF13Bold}>📷 {draft.photoUrl ? "Cambia foto" : "Carica foto"}</button>
            <div style={stiliComuni.txtF11Muted}>JPG, PNG — max 5 MB • potrai ritagliare dopo il caricamento</div>
          </div>

          {/* ── Nome ── */}
          <div>
            {fieldLabel("NOME VISUALIZZATO")}
            <input
              ref={nameRef}
              value={draft.name} onChange={e => scrivi("name", e.target.value)}
              style={inputStyle} placeholder="Il tuo nome"
              onFocus={e => e.target.style.borderColor = "var(--gold)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
              {...ariaCampo("prof-name-err", errori.name)}
            />
            <FieldError id="prof-name-err">{errori.name}</FieldError>
          </div>

          {/* ── Email + Telefono ── */}
          <div style={stiliComuni.grid2ColGap12}>
            <div>
              {fieldLabel("EMAIL")}
              <input
                ref={emailRef}
                value={draft.email} onChange={e => scrivi("email", e.target.value)}
                type="email" style={inputStyle} placeholder="nome@agenzia.it"
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
                {...ariaCampo("prof-email-err", errori.email)}
              />
              <FieldError id="prof-email-err">{errori.email}</FieldError>
            </div>
            <div>
              {fieldLabel("TELEFONO")}
              <input
                value={draft.phone} onChange={e => scrivi("phone", e.target.value)}
                type="tel" style={inputStyle} placeholder="+39 333 123 4567"
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>
          </div>

          {/* ── Ruolo (read-only) ── */}
          <div>
            {fieldLabel("RUOLO (non modificabile)")}
            <div style={boxF14Muted}>{roleLabel(member)}</div>
          </div>

          {/* ── Cambia password (solo con sessione reale) ── */}
          {session && (
            <div>
              <button
                onClick={() => uiDispatch({ type: "TOGGLE_PWD" })}
                style={rowCenterGap8}
              >
                <span style={stiliComuni.txtF15}>🔑</span>
                Cambia password
                <span style={txtF11Muted2}>{ui.pwd.aperta ? "▲" : "▼"}</span>
              </button>
              {ui.pwd.aperta && (
                <div style={colGap10Mt10}>
                  <div>
                    {fieldLabel("NUOVA PASSWORD")}
                    <PasswordField
                      inputStyle={inputStyle} autoComplete="new-password"
                      value={ui.pwd.bozza.nuova} onChange={e => uiDispatch({ type: "SET_PWD_CAMPO", campo: "nuova", valore: e.target.value })}
                      placeholder="Minimo 8 caratteri"
                      show={ui.pwd.rivela} onToggle={() => uiDispatch({ type: "TOGGLE_RIVELA_PWD" })}
                      onFocus={e => e.target.style.borderColor = "var(--gold)"}
                      onBlur={e => e.target.style.borderColor = "var(--border)"}
                    />
                  </div>
                  <div>
                    {fieldLabel("CONFERMA PASSWORD")}
                    <PasswordField
                      inputStyle={inputStyle} autoComplete="new-password"
                      value={ui.pwd.bozza.conferma} onChange={e => uiDispatch({ type: "SET_PWD_CAMPO", campo: "conferma", valore: e.target.value })}
                      placeholder="Ripeti la password"
                      show={ui.pwd.rivela} onToggle={() => uiDispatch({ type: "TOGGLE_RIVELA_PWD" })}
                      onFocus={e => e.target.style.borderColor = "var(--gold)"}
                      onBlur={e => e.target.style.borderColor = "var(--border)"}
                      onKeyDown={e => { if (e.key === "Enter") handleChangePwd(); }}
                    />
                  </div>
                  {/* Un messaggio da mostrare c'è solo nelle fasi terminali: la
                      fase "invio" azzera `testo`, quindi l'esito di prima non
                      può più convivere con un salvataggio in corso. */}
                  {ui.pwd.esito.testo && (
                    <div role="status" style={{
                      fontSize: 12.5, borderRadius: 8, padding: "8px 10px",
                      background: ui.pwd.esito.fase === "ok" ? "rgba(45,122,79,0.1)" : "rgba(192,57,43,0.08)",
                      border: `1px solid ${ui.pwd.esito.fase === "ok" ? "var(--success)" : "var(--danger)"}`,
                      color: ui.pwd.esito.fase === "ok" ? "var(--success)" : "var(--danger)",
                    }}>{ui.pwd.esito.testo}</div>
                  )}
                  <div style={row}>
                    <button
                      onClick={handleChangePwd}
                      disabled={pwdInVolo || !ui.pwd.bozza.nuova}
                      style={{
                        background: pwdInVolo || !ui.pwd.bozza.nuova ? "var(--surface3)" : "var(--navy)",
                        color: pwdInVolo || !ui.pwd.bozza.nuova ? "var(--text-muted)" : "#fff",
                        border: "none", padding: "9px 18px", borderRadius: 8,
                        cursor: pwdInVolo || !ui.pwd.bozza.nuova ? "not-allowed" : "pointer",
                        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                      }}
                    >{pwdInVolo ? "Salvataggio…" : "Aggiorna password"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Esci da tutti i dispositivi (dispositivo perso, sessione reale) ── */}
          {session && (
            <div style={mt2}>
              <p style={txtF12Muted}>
                Disconnette ogni telefono, tablet e computer collegato a questo
                account, incluso questo. Usalo se hai perso un dispositivo.
              </p>
              {ui.signOut.esito.testo && (
                <div role="status" style={boxF125Danger}>{ui.signOut.esito.testo}</div>
              )}
              <div style={row}>
                <button
                  onClick={handleSignOutOvunque}
                  disabled={ui.signOut.esito.fase === "invio"}
                  style={rowCenterGap8Neutral}
                >
                  <span style={stiliComuni.txtF15}>🔒</span>
                  {ui.signOut.esito.fase === "invio" ? "Disconnessione…" : "Esci da tutti i dispositivi"}
                </button>
              </div>
            </div>
          )}

          {/* ── Elimina account (zona pericolosa, solo con sessione reale) ── */}
          {session && (
            <div style={mt2}>
              <button
                onClick={() => uiDispatch({ type: "TOGGLE_ELIM" })}
                style={rowCenterGap82}
              >
                <span style={stiliComuni.txtF15}>🗑️</span>
                Elimina account
                <span style={txtF11Muted2}>{ui.elim.aperta ? "▲" : "▼"}</span>
              </button>
              {ui.elim.aperta && (
                <div style={colGap10Mt102}>
                  <p style={txtF13Text}>
                    Questa azione <strong>disabilita permanentemente</strong> il tuo account e impedisce futuri accessi.
                    I tuoi messaggi e commenti vengono conservati. L'operazione è irreversibile.
                  </p>
                  <div>
                    {fieldLabel('DIGITA "ELIMINA" PER CONFERMARE')}
                    <input
                      value={ui.elim.conferma} onChange={e => uiDispatch({ type: "SET_CONFERMA_ELIM", valore: e.target.value })}
                      placeholder="ELIMINA" style={{ ...inputStyle, borderColor: "rgba(192,57,43,0.4)" }}
                      onFocus={e => e.target.style.borderColor = "var(--danger)"}
                      onBlur={e => e.target.style.borderColor = "rgba(192,57,43,0.4)"}
                    />
                  </div>
                  {ui.elim.esito.testo && (
                    <div role="status" style={boxF125Danger}>{ui.elim.esito.testo}</div>
                  )}
                  <div style={row}>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={elimInVolo || ui.elim.conferma !== "ELIMINA"}
                      style={{
                        background: elimInVolo || ui.elim.conferma !== "ELIMINA" ? "var(--surface3)" : "var(--danger)",
                        color: elimInVolo || ui.elim.conferma !== "ELIMINA" ? "var(--text-muted)" : "#fff",
                        border: "none", padding: "9px 18px", borderRadius: 8,
                        cursor: elimInVolo || ui.elim.conferma !== "ELIMINA" ? "not-allowed" : "pointer",
                        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                      }}
                    >{elimInVolo ? "Eliminazione…" : "Elimina account definitivamente"}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={rowGap10}>
          <button onClick={onClose} style={boxF13Bold2}>Annulla</button>
          {/* Criticità #10: il bottone resta attivo anche a nome vuoto.
              Disabilitarlo nascondeva il problema invece di dirlo — premuto,
              ora il form indica il campo e ci porta il focus. */}
          <button
            onClick={handleSave}
            disabled={ui.salvaInVolo}
            aria-busy={ui.salvaInVolo}
            style={ui.salvaInVolo ? boxF13Bold3InVolo : boxF13Bold3}
          >{ui.salvaInVolo ? "Salvataggio…" : "✓ Salva profilo"}</button>
        </div>
      </Modal>
    </>
  );
};
