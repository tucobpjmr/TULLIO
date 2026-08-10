// ─── PROFILE EDITOR ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef } from "react";
import { useViewport } from "../Viewport.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { Users as UsersAPI } from "../../lib/api.js";
import { PasswordField } from "../ui/PasswordField.jsx";
import { useAvatarSrc } from "../ui/Avatar.jsx";
import { validaCampi, emailValida, obbligatorio, primoCampoInvalido } from "../../lib/validators.js";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { Z } from "../../styles/tokens.js";
import { roleLabel } from "../../lib/taskConstants.js";

import { CropModal, dataUrlToBlob } from "./CropModal.jsx";

// Criticità #10 — il nome è obbligatorio e l'email, se compilata, dev'essere
// valida. Prima il primo usciva in silenzio (`if (!name.trim()) return;`) e la
// seconda finiva in un toast in un angolo, mentre il campo sbagliato restava
// indistinguibile da quelli giusti.
const REGOLE = {
  name: obbligatorio("Il nome visualizzato non può essere vuoto."),
  email: emailValida(),
};
const ORDINE = ["name", "email"];


export const ProfileEditor = ({ member, dispatch, onClose }) => {
  const { isMobile } = useViewport();
  const { session, updatePassword, deleteAccount } = useAuth();
  const [name, setName] = useState(member.name || "");
  const [color] = useState(member.color || "#0F2044");
  const [email, setEmail] = useState(member.email || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [photoUrl, setPhotoUrl] = useState(member.photoUrl || "");
  // photoUrl può essere un path del bucket privato (S-10), un data URI appena
  // ritagliato o una vecchia public URL: l'anteprima passa sempre da qui.
  const photoPreview = useAvatarSrc(photoUrl || null);
  const [cropSrc, setCropSrc] = useState(null);
  const fileRef = useRef(null);
  const [errori, setErrori] = useState({});
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const rifCampo = { name: nameRef, email: emailRef };
  // L'errore di un campo si spegne appena lo si tocca (vedi AddMovBox).
  const scrivi = (campo, set) => (valore) => {
    set(valore);
    setErrori(prec => (prec[campo] ? { ...prec, [campo]: undefined } : prec));
  };
  const [showPwd, setShowPwd] = useState(false);
  const [revealPwd, setRevealPwd] = useState(false); // visibilità testo password (icona occhio)
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null); // { type: 'ok'|'err', text }
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState(null);

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "ELIMINA") return;
    setDeletingAccount(true);
    setDeleteMsg(null);
    const { error } = await deleteAccount();
    setDeletingAccount(false);
    if (error) {
      setDeleteMsg(error.message || "Eliminazione non riuscita.");
    }
    // On success, deleteAccount() already called signOut() → app unmounts this modal automatically.
  };

  const handleChangePwd = async () => {
    setPwdMsg(null);
    if (newPwd.length < 8) { setPwdMsg({ type: "err", text: "La password deve avere almeno 8 caratteri." }); return; }
    if (newPwd !== confirmPwd) { setPwdMsg({ type: "err", text: "Le due password non coincidono." }); return; }
    setSavingPwd(true);
    const { error } = await updatePassword(newPwd);
    setSavingPwd(false);
    if (error) {
      setPwdMsg({ type: "err", text: error.message || "Cambio password non riuscito." });
    } else {
      setPwdMsg({ type: "ok", text: "Password aggiornata." });
      setNewPwd(""); setConfirmPwd("");
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

  const handleSave = async () => {
    const trovati = validaCampi({ name, email }, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      rifCampo[primo]?.current?.focus();
      return;
    }
    setErrori({});
    const trimmedEmail = email.trim();
    // Foto: se è una nuova immagine (data-URL dal crop, o una vecchia base64
    // ancora in photo_url), caricala sul bucket 'avatars' e sostituiscila con
    // la public URL. Così users.photo_url non contiene più il base64 (riga
    // enorme riscaricata per tutto il team ad ogni evento realtime), ma una
    // URL leggera. Le URL http già presenti (foto invariata) non si ricaricano.
    let finalPhotoUrl = photoUrl || null;
    if (session && typeof photoUrl === "string" && photoUrl.startsWith("data:")) {
      const { url, error: upErr } = await UsersAPI.uploadAvatar(member.id, dataUrlToBlob(photoUrl));
      if (upErr || !url) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Foto non caricata: ${upErr?.message || "errore sconosciuto"}` } });
        return; // non salvo: l'utente può ritentare senza perdere la foto scelta
      }
      finalPhotoUrl = url;
    }
    const payload = {
      name: name.trim(),
      avatar: name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      color,
      email: trimmedEmail,
      phone: phone.trim(),
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
    // In errore la modale resta APERTA: chiuderla butterebbe via quanto è stato
    // digitato e, subito dopo un rollback che ha appena rimesso i valori
    // precedenti, lascerebbe l'utente davanti al profilo di prima senza un modo
    // ovvio di riprovare.
    if (res?.error) return;
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
      {cropSrc && (
        <CropModal
          src={cropSrc}
          onConfirm={(dataUrl) => { setPhotoUrl(dataUrl); setCropSrc(null); }}
          onCancel={() => setCropSrc(null)}
        />
      )}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: Z.modalBackdrop }} />
      {/* Stessa centratura senza transform della CropModal qui sopra. */}
      <div className="vd-modal-mh" style={{
        position: "fixed", inset: 0, margin: "auto", height: "fit-content",
        background: "var(--card)", borderRadius: 16, zIndex: Z.modal,
        width: isMobile ? "calc(100vw - 32px)" : 480, maxWidth: "100%",
        overflowY: "auto",
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
            {photoPreview ? (
              <img src={photoPreview} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,0.3)" }} />
            ) : (
              <div style={{
                width: 52, height: 52, borderRadius: "50%", background: color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: "#fff",
                border: "3px solid rgba(255,255,255,0.3)",
              }}>{initials}</div>
            )}
            <div>
              <div className="playfair" style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Modifica profilo</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{roleLabel(member)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
            width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* ── Foto profilo ── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {photoPreview ? (
              <div style={{ position: "relative" }}>
                <img src={photoPreview} alt="" style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--border)" }} />
                <button onClick={() => setPhotoUrl("")} style={{
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
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>JPG, PNG — max 5 MB • potrai ritagliare dopo il caricamento</div>
          </div>

          {/* ── Nome ── */}
          <div>
            {fieldLabel("NOME VISUALIZZATO")}
            <input
              ref={nameRef}
              value={name} onChange={e => scrivi("name", setName)(e.target.value)}
              style={inputStyle} placeholder="Il tuo nome"
              onFocus={e => e.target.style.borderColor = "var(--gold)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
              {...ariaCampo("prof-name-err", errori.name)}
            />
            <FieldError id="prof-name-err">{errori.name}</FieldError>
          </div>

          {/* ── Email + Telefono ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              {fieldLabel("EMAIL")}
              <input
                ref={emailRef}
                value={email} onChange={e => scrivi("email", setEmail)(e.target.value)}
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
            }}>{roleLabel(member)}</div>
          </div>

          {/* ── Cambia password (solo con sessione reale) ── */}
          {session && (
            <div>
              <button
                onClick={() => { setShowPwd(v => !v); setPwdMsg(null); setNewPwd(""); setConfirmPwd(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--navy)", fontSize: 13, fontWeight: 600,
                  padding: "6px 0", fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 15 }}>🔑</span>
                Cambia password
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>{showPwd ? "▲" : "▼"}</span>
              </button>
              {showPwd && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    {fieldLabel("NUOVA PASSWORD")}
                    <PasswordField
                      inputStyle={inputStyle} autoComplete="new-password"
                      value={newPwd} onChange={e => setNewPwd(e.target.value)}
                      placeholder="Minimo 8 caratteri"
                      show={revealPwd} onToggle={() => setRevealPwd(s => !s)}
                      onFocus={e => e.target.style.borderColor = "var(--gold)"}
                      onBlur={e => e.target.style.borderColor = "var(--border)"}
                    />
                  </div>
                  <div>
                    {fieldLabel("CONFERMA PASSWORD")}
                    <PasswordField
                      inputStyle={inputStyle} autoComplete="new-password"
                      value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                      placeholder="Ripeti la password"
                      show={revealPwd} onToggle={() => setRevealPwd(s => !s)}
                      onFocus={e => e.target.style.borderColor = "var(--gold)"}
                      onBlur={e => e.target.style.borderColor = "var(--border)"}
                      onKeyDown={e => { if (e.key === "Enter") handleChangePwd(); }}
                    />
                  </div>
                  {pwdMsg && (
                    <div style={{
                      fontSize: 12.5, borderRadius: 8, padding: "8px 10px",
                      background: pwdMsg.type === "ok" ? "rgba(45,122,79,0.1)" : "rgba(192,57,43,0.08)",
                      border: `1px solid ${pwdMsg.type === "ok" ? "var(--success)" : "var(--danger)"}`,
                      color: pwdMsg.type === "ok" ? "var(--success)" : "var(--danger)",
                    }}>{pwdMsg.text}</div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={handleChangePwd}
                      disabled={savingPwd || !newPwd}
                      style={{
                        background: savingPwd || !newPwd ? "var(--surface3)" : "var(--navy)",
                        color: savingPwd || !newPwd ? "var(--text-muted)" : "#fff",
                        border: "none", padding: "9px 18px", borderRadius: 8,
                        cursor: savingPwd || !newPwd ? "not-allowed" : "pointer",
                        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                      }}
                    >{savingPwd ? "Salvataggio…" : "Aggiorna password"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Elimina account (zona pericolosa, solo con sessione reale) ── */}
          {session && (
            <div style={{
              borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 2,
            }}>
              <button
                onClick={() => { setShowDeleteZone(v => !v); setDeleteConfirm(""); setDeleteMsg(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--danger)", fontSize: 13, fontWeight: 600,
                  padding: "6px 0", fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 15 }}>🗑️</span>
                Elimina account
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>{showDeleteZone ? "▲" : "▼"}</span>
              </button>
              {showDeleteZone && (
                <div style={{
                  marginTop: 10, padding: "14px 16px", borderRadius: 10,
                  background: "rgba(192,57,43,0.05)", border: "1px solid rgba(192,57,43,0.25)",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <p style={{ fontSize: 13, color: "var(--text)", margin: 0, lineHeight: 1.5 }}>
                    Questa azione <strong>disabilita permanentemente</strong> il tuo account e impedisce futuri accessi.
                    I tuoi messaggi e commenti vengono conservati. L'operazione è irreversibile.
                  </p>
                  <div>
                    {fieldLabel('DIGITA "ELIMINA" PER CONFERMARE')}
                    <input
                      value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                      placeholder="ELIMINA" style={{ ...inputStyle, borderColor: "rgba(192,57,43,0.4)" }}
                      onFocus={e => e.target.style.borderColor = "var(--danger)"}
                      onBlur={e => e.target.style.borderColor = "rgba(192,57,43,0.4)"}
                    />
                  </div>
                  {deleteMsg && (
                    <div style={{
                      fontSize: 12.5, borderRadius: 8, padding: "8px 10px",
                      background: "rgba(192,57,43,0.08)", border: "1px solid var(--danger)",
                      color: "var(--danger)",
                    }}>{deleteMsg}</div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deletingAccount || deleteConfirm !== "ELIMINA"}
                      style={{
                        background: deletingAccount || deleteConfirm !== "ELIMINA" ? "var(--surface3)" : "var(--danger)",
                        color: deletingAccount || deleteConfirm !== "ELIMINA" ? "var(--text-muted)" : "#fff",
                        border: "none", padding: "9px 18px", borderRadius: 8,
                        cursor: deletingAccount || deleteConfirm !== "ELIMINA" ? "not-allowed" : "pointer",
                        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                      }}
                    >{deletingAccount ? "Eliminazione…" : "Elimina account definitivamente"}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 22px 18px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 10,
        }}>
          <button onClick={onClose} style={{
            background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)",
            padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
            fontWeight: 600, fontFamily: "inherit",
          }}>Annulla</button>
          {/* Criticità #10: il bottone resta attivo anche a nome vuoto.
              Disabilitarlo nascondeva il problema invece di dirlo — premuto,
              ora il form indica il campo e ci porta il focus. */}
          <button
            onClick={handleSave}
            style={{
              background: "var(--navy)", color: "#fff", border: "none",
              padding: "10px 20px", borderRadius: 8, cursor: "pointer",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              boxShadow: "0 4px 14px rgba(15,32,68,0.3)",
            }}
          >✓ Salva profilo</button>
        </div>
      </div>
    </>
  );
};
