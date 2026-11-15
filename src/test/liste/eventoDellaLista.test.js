// A-3 del 15 novembre · Quali eventi realtime ricaricano il dettaglio aperto.
import { describe, it, expect } from "vitest";
import { eventoDellaLista } from "../../components/liste/eventoDellaLista.js";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";

describe("eventoDellaLista", () => {
  it("senza una lista aperta non ricarica niente", () => {
    expect(eventoDellaLista({ table: "movimenti_lista", eventType: "INSERT", new: { lista_id: A } }, null)).toBe(false);
  });

  it("un movimento della lista aperta sì, di un'altra no", () => {
    expect(eventoDellaLista({ table: "movimenti_lista", eventType: "INSERT", new: { id: B, lista_id: A } }, A)).toBe(true);
    expect(eventoDellaLista({ table: "movimenti_lista", eventType: "UPDATE", new: { id: A, lista_id: B } }, A)).toBe(false);
  });

  it("la riga della lista si riconosce dall'id", () => {
    expect(eventoDellaLista({ table: "liste_viaggio", eventType: "UPDATE", new: { id: A } }, A)).toBe(true);
    expect(eventoDellaLista({ table: "liste_viaggio", eventType: "UPDATE", new: { id: B } }, A)).toBe(false);
  });

  it("un cointestatario cancellato porta lista_id nella PK", () => {
    expect(eventoDellaLista({ table: "lista_beneficiari", eventType: "DELETE", old: { lista_id: A, client_id: B } }, A)).toBe(true);
    expect(eventoDellaLista({ table: "lista_beneficiari", eventType: "DELETE", old: { lista_id: B, client_id: A } }, A)).toBe(false);
  });

  it("un DELETE senza lista_id si accetta: meglio un reload in più", () => {
    expect(eventoDellaLista({ table: "movimenti_lista", eventType: "DELETE", old: { id: B } }, A)).toBe(true);
  });
});
