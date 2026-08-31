// ─── TOAST ─────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2e). Split in ToastStack/ToastItem per
// supportare più toast in coda (contratto: state.toasts, array) e per dare
// agli screen reader un annuncio affidabile di ciascun messaggio.
import { useViewport } from "./Viewport.jsx";
import { Z } from "../../styles/tokens.js";
import { ToastItem } from "./ToastItem.jsx";
import { MAX_A_SCHERMO } from "../../state/toastQueue.js";

// Costante di modulo (mai un oggetto letterale fatto di soli valori costanti
// nel JSX — docs/CLAUDE.md).
const rigaContatore = {
  color: "#fff", background: "var(--navy-light)", borderRadius: 6,
  padding: "4px 12px", fontSize: 12, fontWeight: 600, pointerEvents: "none",
};

// La live region deve esistere PRIMA del contenuto da annunciare: se il nodo
// con aria-live compare insieme al primo toast, gli screen reader non fanno
// in tempo a registrarlo e il primo annuncio va perso. Per questo ToastStack
// è sempre montato — anche con `toasts` vuoto — e non ritorna mai null: il
// contenitore c'è già, cambia solo cosa contiene.
export const ToastStack = ({ toasts = [] }) => {
  const { isDesktop } = useViewport();
  // Il tetto visivo vive QUI, dove si conosce lo spazio disponibile — la coda
  // (state/toastQueue.js) tiene tutti gli errori non letti, questo componente
  // ne disegna al massimo MAX_A_SCHERMO. Gli ultimi arrivati stanno in cima
  // alla pila (column-reverse), quindi tenere la CODA dell'array significa
  // tenere i più nuovi (A-2).
  const visibili = toasts.slice(-MAX_A_SCHERMO);
  const nascosti = toasts.length - visibili.length;
  return (
    <div
      // `polite` sul CONTENITORE: la distinzione fra ciò che interrompe e ciò
      // che aspetta è già sui figli (role="alert" per gli errori, role="status"
      // per il resto) e un `assertive` qui la annulla verso l'alto,
      // promuovendo anche «Task aggiornato!» a interruzione (B-1).
      aria-live="polite"
      aria-atomic="false"
      style={{
        // Mobile: sopra la bottom-nav + home indicator iPhone (--safe-bottom).
        position: "fixed", bottom: isDesktop ? 24 : "calc(80px + var(--safe-bottom))",
        left: "50%", transform: "translateX(-50%)",
        zIndex: Z.toast,
        display: "flex", flexDirection: "column-reverse", gap: 10,
        alignItems: "center",
        // L'area vuota sopra/sotto i toast non deve rubare i click al resto
        // della pagina: solo i singoli ToastItem li riabilitano.
        pointerEvents: "none",
      }}
    >
      {/* Un errore non letto che non entra a schermo deve almeno CONTARSI:
          sparire in silenzio è la cosa che A-2 esiste per togliere. */}
      {nascosti > 0 && (
        <div role="status" style={rigaContatore}>
          +{nascosti} {nascosti === 1 ? "altro messaggio" : "altri messaggi"} in coda
        </div>
      )}
      {visibili.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
};
