// ─── PROFILE EDITOR ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import { Users as UsersAPI } from "../../lib/api.js";
import { useAvatarSrc } from "../ui/Avatar.jsx";
import { validaCampi, emailValida, obbligatorio, primoCampoInvalido } from "../../lib/validators.js";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { Modal } from "../ui/Modal.jsx";
import { roleLabel } from "../../lib/taskConstants.js";

import { AccountSicurezza } from "./AccountSicurezza.jsx";
import { CropModal, dataUrlToBlob } from "../ui/CropModal.jsx";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF13Bold, boxF13Bold2, boxF13Bold3, boxF13Bold3InVolo, boxF14Muted, boxW100H100,
  boxW52H52, colCenterGap12, colGap18, inputWFull, rowCenterBetween, rowCenterGap14,
  rowCenterMiddle, rowCenterMiddle2, rowGap10, txtF11Mt2, txtF18Bold,
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
//   • LE DUE SEZIONI A FISARMONICA (password, elimina account) e L'ESITO DELLE
//     TRE OPERAZIONI ASINCRONE → un solo `useReducer`, che da M-5 (audit del
//     25 agosto) vive con loro in `./AccountSicurezza.jsx` +
//     `./accountSicurezzaReducer.js`. Erano 9 `useState` indipendenti che
//     cambiavano sempre in GRUPPO (B-3 residuo dell'audit del 15 agosto,
//     chiuso il 23): aprire "Cambia password" azzera insieme esito e bozza, un
//     cambio riuscito azzera la bozza ma non l'esito. Restano campi DISTINTI e
//     annidati per sezione — non fusi in un valore solo — per le stesse
//     ragioni per cui restano separati qui sotto: un reducer raggruppa i
//     PUNTI DI SCRITTURA, non il significato dei campi.
//   • IL FRENO AL DOPPIO INVIO del salvataggio → `salvaInVolo`, un `useState`
//     qui. Era la quarta fetta di quel reducer, ed è l'unica delle quattro che
//     riguarda il PROFILO e non l'account: adesso si legge accanto a
//     `handleSave`, cioè accanto a ciò che protegge.
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
//
// Le distinzioni della sezione account — le due fisarmoniche indipendenti,
// l'occhio che sopravvive allo svuotamento della bozza, la parola "ELIMINA" che
// è un campo ma non si salva — sono documentate dove ora vivono, in
// `./AccountSicurezza.jsx` e nel suo reducer.
export const ProfileEditor = ({ member, onClose }) => {
  const dispatch = useDispatch();
  const { isMobile } = useViewport();
  const { session } = useAuth();
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
  // Il freno al doppio invio del SALVATAGGIO. Era la quarta fetta del reducer
  // locale, insieme a tre che appartenevano alla sezione account: da M-5
  // quelle stanno con lei, e questa torna accanto a ciò che protegge.
  const [salvaInVolo, setSalvaInVolo] = useState(false);

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
    if (salvaInVolo) return;
    const trovati = validaCampi(draft, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      rifCampo[primo]?.current?.focus();
      return;
    }
    setErrori({});
    setSalvaInVolo(true);
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
        setSalvaInVolo(false);
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
    setSalvaInVolo(false);
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
            <label className="vd-field-label">NOME VISUALIZZATO</label>
            <input
              ref={nameRef}
              value={draft.name} onChange={e => scrivi("name", e.target.value)}
              style={inputWFull} placeholder="Il tuo nome"
              onFocus={e => e.target.style.borderColor = "var(--gold)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
              {...ariaCampo("prof-name-err", errori.name)}
            />
            <FieldError id="prof-name-err">{errori.name}</FieldError>
          </div>

          {/* ── Email + Telefono ── */}
          <div style={stiliComuni.grid2ColGap12}>
            <div>
              <label className="vd-field-label">EMAIL</label>
              <input
                ref={emailRef}
                value={draft.email} onChange={e => scrivi("email", e.target.value)}
                type="email" style={inputWFull} placeholder="nome@agenzia.it"
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
                {...ariaCampo("prof-email-err", errori.email)}
              />
              <FieldError id="prof-email-err">{errori.email}</FieldError>
            </div>
            <div>
              <label className="vd-field-label">TELEFONO</label>
              <input
                value={draft.phone} onChange={e => scrivi("phone", e.target.value)}
                type="tel" style={inputWFull} placeholder="+39 333 123 4567"
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>
          </div>

          {/* ── Ruolo (read-only) ── */}
          <div>
            <label className="vd-field-label">RUOLO (non modificabile)</label>
            <div style={boxF14Muted}>{roleLabel(member)}</div>
          </div>

          {/* ── Sicurezza dell'account ──
              Cambio password, uscita da tutti i dispositivi, eliminazione:
              tre operazioni di autenticazione che non passano dal reducer
              dell'app e non hanno un "salva" comune con i campi qui sopra.
              Un file suo, con il proprio reducer (M-5, audit del 25 agosto);
              si nasconde da sé quando non c'è una sessione vera. */}
          <AccountSicurezza />
        </div>

        {/* Footer */}
        <div style={rowGap10}>
          <button onClick={onClose} style={boxF13Bold2}>Annulla</button>
          {/* Criticità #10: il bottone resta attivo anche a nome vuoto.
              Disabilitarlo nascondeva il problema invece di dirlo — premuto,
              ora il form indica il campo e ci porta il focus. */}
          <button
            onClick={handleSave}
            disabled={salvaInVolo}
            aria-busy={salvaInVolo}
            style={salvaInVolo ? boxF13Bold3InVolo : boxF13Bold3}
          >{salvaInVolo ? "Salvataggio…" : "✓ Salva profilo"}</button>
        </div>
      </Modal>
    </>
  );
};
