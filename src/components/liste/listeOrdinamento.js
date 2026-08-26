// src/components/liste/listeOrdinamento.js
// Filtro testuale, insiemi ed ordinamento della home del modulo Liste
// viaggio: funzioni pure, senza JSX né hook, estratte da ListeViaggio.jsx
// (A-4, audit del 12 agosto) perché il file aveva raggiunto 495/500 righe —
// cinque di margine dal lint — e questa era la parte separabile senza
// discussione: nessun consumatore oltre a ListeViaggio.jsx e ai test che le
// esercitano direttamente.
import { beneficiariNomi } from "./listeFormato.js";
import { indicizza, matchIndice, matchTermini, terminiRicerca } from "../../lib/searchUtils.js";

// Etichette dei quattro insiemi dell'elenco. Servono anche fuori dal menu a
// tendina: quando la ricerca trova risultati in un insieme che il filtro
// corrente esclude, il nome dell'insieme va detto all'utente.
export const FILTRI = {
  attive: "Attive",
  esaurite: "Esaurite",
  tutte: "Tutte",
  cestino: "Cestino",
};

// Insiemi che il filtro attivo NON copre. Cercando fra le "Attive" una lista
// esaurita, l'elenco resta vuoto pur esistendo la lista: senza questa mappa
// non c'è modo di dirlo, e l'utente conclude che la lista sia sparita (o che
// la ricerca sia rotta). "Tutte" contiene attive ed esaurite ma non il
// cestino, che è archiviato a parte.
export const FILTRI_ALTROVE = {
  attive: ["esaurite", "cestino"],
  esaurite: ["attive", "cestino"],
  tutte: ["cestino"],
  cestino: ["tutte"],
};

// I campi su cui si cerca una lista: titolare, titolo e cointestatari, con la
// normalizzazione condivisa con l'anagrafica (vedi lib/searchUtils.js — la
// ricerca ignora accenti, apostrofi e ordine delle parole).
//
// M-3 (audit performance/UX del 16 agosto, secondo passaggio): l'indice si
// costruisce dalla LISTA e non dalla query, quindi una volta per elenco e non
// una volta per battuta. Qui pesava il doppio che altrove — `filtraListe`
// gira su QUATTRO insiemi (attive, esaurite, tutte, cestino) a ogni carattere
// digitato, e `beneficiariNomi` scorre i cointestatari di ogni riga.
export const indicizzaLista = (l) =>
  indicizza(l.clients?.name, l.titolo, beneficiariNomi(l));

// Filtro testuale dell'elenco. Esportata per i test: è la funzione che decide
// se una lista si trova o no. La home passa invece dall'indice precalcolato
// (`indicizzaLista` + `matchIndice`), che è la stessa semantica senza il
// lavoro ripetuto — `matchTermini` e `matchIndice` sono definite una sopra
// l'altra proprio perché non possano divergere.
export function filtraListe(liste, search) {
  const termini = terminiRicerca(search);
  if (!termini.length) return liste;
  return liste.filter((l) => matchTermini(termini, l.clients?.name, l.titolo, beneficiariNomi(l)));
}

// Le liste che corrispondono, a partire dall'indice invece che dalle righe.
export const filtraIndicizzate = (indice, termini) =>
  (termini.length ? indice.filter((r) => matchIndice(termini, r.idx)) : indice).map((r) => r.l);

// Criteri di ordinamento della home. 'recenti' è l'ordine in cui il database
// restituisce le liste (updated_at DESC): ordinare qui, sul client, evita di
// rifare la query a ogni cambio di criterio.
export const ORDINAMENTI = {
  recenti: "Ultima modifica",
  mov_recente: "Movimento più recente",
  mov_vecchio: "Movimento più vecchio",
  nome: "Cliente A–Z",
  saldo: "Saldo più alto",
};

// Le liste senza movimenti non hanno una data: vanno in fondo in entrambi i
// versi, altrimenti ordinando dal più vecchio occuperebbero le prime righe.
const cmpData = (a, b, verso) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a === b ? 0 : (a < b ? -verso : verso);
};

export function ordinaListe(liste, saldi, sort) {
  const nome = (l) => l.clients?.name || "";
  const mov = (l) => saldi[l.id]?.ultimo_movimento || "";
  const saldo = (l) => Number(saldi[l.id]?.saldo || 0);
  const perNome = (a, b) => nome(a).localeCompare(nome(b), "it");
  const arr = liste.slice(); // mai riordinare l'array in state
  switch (sort) {
    case "mov_recente": return arr.sort((a, b) => cmpData(mov(a), mov(b), -1) || perNome(a, b));
    case "mov_vecchio": return arr.sort((a, b) => cmpData(mov(a), mov(b), 1) || perNome(a, b));
    case "nome": return arr.sort(perNome);
    case "saldo": return arr.sort((a, b) => saldo(b) - saldo(a) || perNome(a, b));
    default: return arr; // 'recenti': ordine del database
  }
}
