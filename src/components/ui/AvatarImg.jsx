// ─── AVATAR IMG ────────────────────────────────────────────────────────────
// Estratto da Avatar.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import { useAvatarSrc } from "./Avatar.jsx";

// Solo l'<img> risolta, con stile a carico del chiamante: serve dove la foto
// è renderizzata con una grafica propria e montare <Avatar> cambierebbe
// l'aspetto (UserSwitcher). Ritorna null finché la signed URL non è pronta —
// che per i data URI e le URL http è immediato (risolti in modo sincrono
// dall'inizializzatore di stato), quindi il vuoto transitorio riguarda solo
// gli avatar che vivono davvero nel bucket.
export const AvatarImg = ({ photo, style, alt = "" }) => {
  const src = useAvatarSrc(photo ?? null);
  return src ? <img src={src} alt={alt} style={style} /> : null;
};
