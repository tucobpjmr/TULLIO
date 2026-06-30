import { describe, it, expect } from "vitest";
import { scopeConversationsForUser } from "../lib/chatUtils.js";

const ME = "me-uuid";
const NAT = "nat-uuid";
const GHOST = "ghost-uuid"; // non presente nel team
const team = new Set([ME, NAT, "other-uuid"]);

const convs = [
  { id: "a", type: "direct", participants: [ME, NAT] },        // mia diretta valida
  { id: "b", type: "direct", participants: ["x-uuid", NAT] },  // chat altrui (leak admin)
  { id: "c", type: "direct", participants: [ME, GHOST] },      // diretta orfana → Sconosciuto
  { id: "d", type: "group", participants: [ME, NAT, GHOST] },  // gruppo: ghost tollerato
  { id: "e", type: "group", participants: ["x-uuid", NAT] },   // gruppo altrui
];

describe("scopeConversationsForUser", () => {
  it("tiene solo le conversazioni di cui l'utente è partecipante", () => {
    const out = scopeConversationsForUser(convs, ME, team).map(c => c.id);
    expect(out).not.toContain("b"); // chat altrui non mia
    expect(out).not.toContain("e");
    expect(out).toContain("a");
    expect(out).toContain("d");
  });

  it("scarta le dirette con interlocutore non valido (orfane → Sconosciuto)", () => {
    const out = scopeConversationsForUser(convs, ME, team).map(c => c.id);
    expect(out).not.toContain("c");
  });

  it("tollera membri sconosciuti nei gruppi (non sono dirette)", () => {
    const out = scopeConversationsForUser(convs, ME, team).map(c => c.id);
    expect(out).toContain("d");
  });

  it("non filtra le dirette finché il team non è caricato (teamIds vuoto)", () => {
    const out = scopeConversationsForUser(convs, ME, new Set()).map(c => c.id);
    // 'c' (diretta con ghost) NON viene scartata: senza team non sappiamo
    // distinguere un membro valido da uno orfano.
    expect(out).toEqual(["a", "c", "d"]);
  });

  it("accetta teamIds come array oltre che come Set", () => {
    const out = scopeConversationsForUser(convs, ME, [ME, NAT]).map(c => c.id);
    expect(out).toContain("a");
    expect(out).not.toContain("c");
  });

  it("è difensivo su input non validi", () => {
    expect(scopeConversationsForUser(null, ME, team)).toEqual([]);
    expect(scopeConversationsForUser([{ id: "z", type: "direct" }], ME, team)).toEqual([]);
  });
});
