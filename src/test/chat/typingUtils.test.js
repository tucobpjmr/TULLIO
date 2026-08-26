import { describe, it, expect } from "vitest";
import {
  pruneTypingMap, applyTypingEvent, typingUserIds, buildTypingLabel,
  TYPING_TTL_MS,
} from "../../lib/typingUtils.js";

const ME = "me-uuid";
const MARIO = "mario-uuid";
const LUCA = "luca-uuid";
const GINA = "gina-uuid";

const names = {
  [MARIO]: "Mario Rossi",
  [LUCA]: "Luca Bianchi",
  [GINA]: "Gina Verdi",
};
const resolveName = (id) => names[id]?.split(" ")[0];

describe("pruneTypingMap", () => {
  it("tiene solo le voci non scadute", () => {
    const now = 1000;
    const map = { [MARIO]: 1500, [LUCA]: 900, [GINA]: 1000 };
    // 900 e 1000 sono <= now → scaduti; 1500 sopravvive
    expect(pruneTypingMap(map, now)).toEqual({ [MARIO]: 1500 });
  });

  it("è difensivo su input non validi", () => {
    expect(pruneTypingMap(null, 0)).toEqual({});
    expect(pruneTypingMap({ [MARIO]: "nan" }, 0)).toEqual({});
  });
});

describe("applyTypingEvent", () => {
  it("start fissa expiresAt = now + ttl", () => {
    const out = applyTypingEvent({}, { userId: MARIO, typing: true }, { selfId: ME, now: 1000 });
    expect(out[MARIO]).toBe(1000 + TYPING_TTL_MS);
  });

  it("stop rimuove l'utente", () => {
    const map = { [MARIO]: 9999, [LUCA]: 9999 };
    const out = applyTypingEvent(map, { userId: MARIO, typing: false }, { selfId: ME, now: 1000 });
    expect(out).toEqual({ [LUCA]: 9999 });
  });

  it("ignora eventi del proprio userId (self)", () => {
    const out = applyTypingEvent({}, { userId: ME, typing: true }, { selfId: ME, now: 1000 });
    expect(out).toEqual({});
  });

  it("pota le voci scadute mentre applica un nuovo evento", () => {
    const map = { [LUCA]: 500 }; // già scaduto rispetto a now=1000
    const out = applyTypingEvent(map, { userId: MARIO, typing: true }, { selfId: ME, now: 1000 });
    expect(out[LUCA]).toBeUndefined();
    expect(out[MARIO]).toBe(1000 + TYPING_TTL_MS);
  });

  it("gestisce più typer simultanei nel gruppo", () => {
    let map = {};
    map = applyTypingEvent(map, { userId: MARIO, typing: true }, { selfId: ME, now: 1000 });
    map = applyTypingEvent(map, { userId: LUCA, typing: true }, { selfId: ME, now: 1000 });
    expect(typingUserIds(map, { selfId: ME, now: 1001 }).sort()).toEqual([LUCA, MARIO].sort());
  });
});

describe("buildTypingLabel", () => {
  it("direct: sempre 'sta scrivendo'", () => {
    expect(buildTypingLabel([MARIO], { type: "direct", resolveName })).toBe("sta scrivendo");
  });

  it("group 1 typer: nome singolo", () => {
    expect(buildTypingLabel([MARIO], { type: "group", resolveName })).toBe("Mario sta scrivendo");
  });

  it("group 2 typer: due nomi", () => {
    expect(buildTypingLabel([MARIO, LUCA], { type: "group", resolveName }))
      .toBe("Mario e Luca stanno scrivendo");
  });

  it("group 3+ typer: conteggio", () => {
    expect(buildTypingLabel([MARIO, LUCA, GINA], { type: "group", resolveName }))
      .toBe("3 persone stanno scrivendo");
  });

  it("nessun typer → null", () => {
    expect(buildTypingLabel([], { type: "group", resolveName })).toBeNull();
    expect(buildTypingLabel(null, { type: "group", resolveName })).toBeNull();
  });

  it("nome non risolvibile → fallback 'Qualcuno'", () => {
    expect(buildTypingLabel(["ignoto"], { type: "group", resolveName }))
      .toBe("Qualcuno sta scrivendo");
  });
});
