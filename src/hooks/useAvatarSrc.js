// Risolve il valore di users.photo_url in qualcosa che <img src> possa usare.
//
// Sta in hooks/ e non in components/ui/ perché chiama il data layer (B-4
// dell'analisi del 14 novembre): ui/ è trasversale e senza rete, e una regola
// di eslint.config.js (VIETATO_DATA_LAYER_IN_UI) lo tiene così.
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
//
// Un punto unico per tre consumatori: <Avatar>, <AvatarImg> (UserSwitcher) e
// l'anteprima di ProfileEditor, che può essere un data URI appena ritagliato.
// Senza, il passaggio a bucket privato avrebbe sistemato le foto in un punto e
// rotte negli altri due.
import { useEffect, useState } from "react";
import { Users as UsersAPI } from "../lib/api.js";

const usaDirettamente = (v) => typeof v === "string" && (v.startsWith("data:") || v.startsWith("http"));

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
