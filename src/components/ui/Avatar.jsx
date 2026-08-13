// ─── AVATAR ────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2e).
import { useEffect, useState } from "react";
import { useAppData } from "../../state/AppDataContext.jsx";
import { Users as UsersAPI } from "../../lib/api.js";

// Risolve il valore di users.photo_url in qualcosa che <img src> possa usare.
//
// Dalla migrazione 20260806180000 il bucket avatars è privato (S-10): un
// avatar caricato da lì è salvato come PATH e va convertito in signed URL, che
// è un'operazione asincrona. I due formati storici — data URI base64 e public
// URL http — restano invece utilizzabili così come sono, e getAvatarUrl li
// ritorna invariati senza toccare la rete.
//
// Perché lo stato parte dal valore sincrono quando è già utilizzabile: se
// partisse sempre da null, ogni avatar già valido (cioè tutti quelli
// attualmente in produzione) lampeggerebbe sulle iniziali per un frame a ogni
// montaggio, in decine di punti per schermata.
const usaDirettamente = (v) => typeof v === "string" && (v.startsWith("data:") || v.startsWith("http"));

// Esportato perché lo stesso valore è renderizzato anche fuori da <Avatar>:
// ProfileEditor (anteprima della foto in modifica, che può essere un data URI
// appena ritagliato) e UserSwitcher, che hanno uno stile proprio e non possono
// semplicemente montare <Avatar>. Senza un punto unico, il passaggio a bucket
// privato avrebbe sistemato le foto in un punto e rotte negli altri due.
export const useAvatarSrc = (photo) => {
  const [src, setSrc] = useState(() => (usaDirettamente(photo) ? photo : null));

  useEffect(() => {
    if (!photo) { setSrc(null); return; }
    if (usaDirettamente(photo)) { setSrc(photo); return; }
    // `annullato` evita di scrivere lo stato dopo che il componente è stato
    // smontato o che photoUrl è cambiato di nuovo mentre la richiesta era in
    // volo (l'ultima risposta arrivata non è per forza l'ultima richiesta
    // fatta).
    let annullato = false;
    UsersAPI.getAvatarUrl(photo).then(({ url }) => {
      if (!annullato) setSrc(url);
    }).catch(() => { if (!annullato) setSrc(null); });
    return () => { annullato = true; };
  }, [photo]);

  return src;
};

export const Avatar = ({ memberId, size = 28 }) => {
  const { getMember } = useAppData();
  const m = getMember(memberId);
  const src = useAvatarSrc(m?.photoUrl ?? null);

  if (!m) return null;
  if (src) {
    return (
      <img src={src} alt={m.name} title={m.name} style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", flexShrink: 0, border: "2px solid white",
      }} />
    );
  }
  // Nessuna foto, oppure signed URL non ancora pronta/fallita: le iniziali
  // sono un ripiego completo, non un segnaposto di caricamento.
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: m.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 600, color: "#fff",
      flexShrink: 0, border: "2px solid white",
    }} title={m.name}>{m.avatar}</div>
  );
};
