// src/components/liste/listeModuleApi.js
// La superficie PUBBLICA del modulo Liste viaggio verso il resto dell'app.
//
// PERCHÉ ESISTE. `listeApi.js` (allora in `src/lib/`) era importato da sette
// file, di cui tre
// appartengono al core e non hanno niente a che fare con le liste: la ricerca
// globale della Topbar, l'anagrafica clienti e la vista Archivio. Ognuno
// assemblava le proprie query — quali chiamare, come combinarle, come contare —
// e conosceva quindi la forma delle tabelle di un modulo altrui. Una modifica
// allo schema delle liste si propagava a viste che non avrebbero dovuto sapere
// che le liste esistono come tabelle.
//
// Qui il modulo espone due funzioni che rispondono a DOMANDE, non a query:
// "quali liste corrispondono a una ricerca" e "quante liste ha ogni cliente".
// Il core chiede quello; il come resta dentro il modulo.
//
// Nota: questa è la superficie di SOLA LETTURA usata da fuori. Le scritture
// restano interne al modulo (ListeAPI + le RPC transazionali), perché nessuna
// vista del core ne ha bisogno.
//
// Dal 10 agosto (ST-6) il confine non è più solo questa facciata: `listeApi.js`
// è stato spostato QUI ACCANTO, da `src/lib/` — la cartella dei moduli
// condivisi, cioè il posto da cui quelle tre viste l'avevano raggiunto — e una
// regola `no-restricted-imports` (VIETATO_LISTEAPI_DA_FUORI in
// eslint.config.js) fa fallire il lint su chiunque lo importi da fuori
// `src/components/liste/**`. Prima il confine era una convenzione che reggeva
// finché qualcuno la ricordava in review; ora è struttura, e la violazione —
// che si è presentata solo per distrazione, copiando l'import dal vicino — si
// ferma prima del commit.

import { ListeAPI } from "./listeApi.js";
import { beneficiariNomi, intestazioneLista } from "./listeFormato.js";

// Formattazione dei nomi di una lista (intestatario e beneficiari): pure, ma
// ri-esportate da qui perché il core abbia UNA sola porta d'ingresso al modulo
// invece di due import da livelli diversi.
export { beneficiariNomi, intestazioneLista };

/**
 * Tutte le liste indicizzabili dalla ricerca globale: attive e cestinate.
 * Le cestinate servono perché il filtro "Includi… nel cestino" del pannello di
 * ricerca vale per le liste con la stessa semantica che ha per i task.
 *
 * @returns {Promise<{ data: object[], error: Error|null }>}
 */
export async function listeRicercabili() {
  const [rListe, rCestino] = await Promise.all([ListeAPI.list(), ListeAPI.listTrash()]);
  const errore = rListe.error || rCestino.error;
  if (errore) return { data: [], error: errore };
  return { data: [...(rListe.data || []), ...(rCestino.data || [])], error: null };
}

/**
 * Conteggio liste per cliente, già aggregato: { [clientId]: { attive, totali } }.
 *
 * Serve all'anagrafica PRIMA di modificare o eliminare un cliente, non dopo: è
 * la differenza fra sapere che cosa si sta toccando e scoprirlo da un errore di
 * foreign key.
 *
 * @returns {Promise<{ data: Record<string, {attive:number, totali:number}>, error: Error|null }>}
 */
export async function conteggioListePerCliente() {
  const { data, error } = await ListeAPI.clientiConListe();
  if (error) return { data: {}, error };
  const mappa = {};
  for (const r of data || []) {
    const voce = mappa[r.client_id] || (mappa[r.client_id] = { attive: 0, totali: 0 });
    voce.totali += 1;
    if (!r.deleted_at) voce.attive += 1;
  }
  return { data: mappa, error: null };
}
