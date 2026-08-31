// src/components/liste/regoleMovimento.js
// M-1 dell'audit UX/errori del 31 agosto.
//
// Le regole di un movimento sono le STESSE che lo si stia registrando
// (AddMovBox) o correggendo (EditMovimentoModal): due copie sarebbero due
// varianti fra sei mesi — la stessa ragione per cui creaErrorBoundary.jsx
// esiste. `imp` si interpreta col SEGNO scelto nel form, ed è il motivo per
// cui il validatore riceve anche gli altri valori: "1.000,00" è valido o no a
// seconda del segno solo per il parser.
import { obbligatorio, interpretabile } from "../../lib/validators.js";
import { parseImporto } from "./listeFormato.js";

export const REGOLE_MOVIMENTO = {
  data: obbligatorio("Indica la data del movimento."),
  desc: obbligatorio("La descrizione non può essere vuota."),
  imp: interpretabile((v, f) => parseImporto(v, f.segno), "Importo non valido: usa una cifra come 1.250,00."),
};

// Ordine VISIVO dei campi: è quello che decide dove va il focus (vedi
// primoCampoInvalido), e nel form il tipo sta fra descrizione e importo.
export const ORDINE_MOVIMENTO = ["data", "desc", "imp"];
