// src/components/liste/regoleCliente.js
// M-1 dell'audit UX/errori del 31 agosto.
//
// Le regole del picker "cliente esistente o nuovo" sono le stesse in
// `NuovaListaModal` (titolare) e `AggiungiBeneficiarioModal` (cointestatario):
// stesso `<select>` con l'opzione "+ Nuovo cliente…", stesso campo nome che
// diventa obbligatorio solo quando quell'opzione è scelta. Due copie
// sarebbero due varianti fra sei mesi, la stessa ragione di
// regoleMovimento.js.
import { obbligatorio } from "../../lib/validators.js";

export const REGOLE_CLIENTE = {
  clientId: obbligatorio("Scegli un cliente."),
  // `newName` dipende dal valore di `clientId`: non è obbligatorio quando si
  // sceglie un cliente esistente dall'anagrafica.
  newName: (v, valori) => (
    valori.clientId === "__new__" && (!v || !v.trim())
      ? "Inserisci il nome del nuovo cliente."
      : null
  ),
};

export const ORDINE_CLIENTE = ["clientId", "newName"];
