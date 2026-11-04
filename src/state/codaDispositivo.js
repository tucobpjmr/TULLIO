// src/state/codaDispositivo.js
// La coda offline di QUESTO dispositivo, raggiungibile anche fuori da React.
//
// `hooks/useCodaScritture.js` la apre per accodare e rigiocare; al logout
// (M-4 dell'audit del 4 novembre) serve anche a chi non è un componente —
// `auth/AuthContext.jsx`, che la svuota, e il guscio, che chiede conferma se
// ci sono modifiche non ancora consegnate. Un modulo a parte perché
// `useCodaScritture` si porta dietro il registry di persistenza (e con lui il
// data layer), che chi esce non deve scaricare per contare tre voci.
import { creaDeposito } from "../lib/depositoIdb.js";
import { creaCodaScritture } from "./codaScritture.js";

export const STORE_CODA = "coda_scritture";

export const apriCodaDispositivo = () => creaCodaScritture(creaDeposito({ store: STORE_CODA }));

/** Quante scritture di `uid` aspettano ancora la rete su questo dispositivo. */
export async function scrittureInAttesa(uid) {
  if (!uid) return 0;
  try {
    return await apriCodaDispositivo().conta(uid);
  } catch {
    return 0;
  }
}

/** Toglie dalla coda le scritture di `uid`. Non solleva. */
export async function svuotaScrittureDi(uid) {
  if (!uid) return;
  try {
    await apriCodaDispositivo().rimuoviPerUtente(uid);
  } catch { /* best effort: le voci scadono comunque dopo sette giorni */ }
}
