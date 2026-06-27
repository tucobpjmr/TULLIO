// ─── PROFILE EDITOR ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef } from "react";
import { useViewport } from "../Viewport.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { Users as UsersAPI } from "../../lib/api.js";
import { PasswordField } from "../ui/PasswordField.jsx";

const AVATAR_EMOJIS = ["😊", "😎", "🧑‍💼", "👩‍💻", "🧑‍✈️", "👨‍🔧", "🦸", "🌟", "🎯", "🚀", "✈️", "🏝️"];
const AVATAR_COLORS = ["#0F2044", "#2D7A4F", "#C8832A", "#7B4F9E", "#C0392B", "#0EA5E9", "#DB2777", "#059669", "#6366F1", "#EA580C", "#0891B2", "#4F46E5"];

export const ProfileEditor = ({ member, dispatch, onClose }) => {
  const { isMobile } = useViewport();
  const { session, updatePassword, deleteAccount } = useAuth();
  const [name, setName] = useState(member.name || "");
  const [avatar, setAvatar] = useState(member.avatar || "");
  const [color, setColor] = useState(member.color || "#0F2044");
  const [email, setEmail] = useState(member.email || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [photoUrl, setPhotoUrl] = useState(member.photoUrl || "");
  const [avatarMode, setAvatarMode] = useState(member.photoUrl ? "photo" : "emoji"); // "emoji" | "photo"
  const fileRef = useRef(null);
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

  const handleSave = async () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      avatar: avatarMode === "photo" ? (name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()) : avatar,
      color,
      email: email.trim(),
      phone: phone.trim(),
      photoUrl: avatarMode === "photo" ? photoUrl : null,
    };
    // Aggiornamento ottimistico in memoria (immediato per l'UI).
    dispatch({ type: "UPDATE_OWN_PROFILE", payload });
    // Persistenza su Supabase (solo con sessione attiva):
    //  - name/avatar/color/photo_url su public.users (caveat #25: prima erano
    //    solo in-memory). Il trigger anti-escalation lascia passare questi
    //    campi (blocca solo role/active/pending/capacity).
    //  - email/phone su public.user_contacts (Step S): non sono più colonne di
    //    public.users → vanno via Users.updateContact.
    if (session) {
      const { error: profileErr } = await UsersAPI.updateProfile(member.id, {
        name: payload.name,
        avatar: payload.avatar,
        color: payload.color,
        photo_url: payload.photoUrl,
      });
      if (profileErr) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Profilo non salvato: ${profileErr.message}` } });
      }
      const { error } = await UsersAPI.updateContact(member.id, {
        email: payload.email || null,
        phone: payload.phone || null,
      });
      if (error) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Contatti non salvati: ${error.message}` } });
      }
    }
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
        background: "var(--card)", borderRadius: 16, zIndex: 1001,
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
                      background: avatar === e ? "var(--gold)" + "20" : "var(--card)",
                      cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{e}</button>
                  ))}
                  {/* Initials option */}
                  <button onClick={() => setAvatar(initials)} style={{
                    width: 38, height: 38, borderRadius: 8,
                    border: !AVATAR_EMOJIS.includes(avatar) ? "2px solid var(--gold)" : "1px solid var(--border)",
                    background: !AVATAR_EMOJIS.includes(avatar) ? color : "var(--card)",
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
