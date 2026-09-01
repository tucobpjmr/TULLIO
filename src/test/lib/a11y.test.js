// A-2 dell'audit UX/errori del 1 settembre: `attivaConTastiera` è l'unica
// fonte della semantica "Invio/Spazio attivano un role=button" — usata in
// decine di file. Se questi test passano, ogni chiamante ha lo stesso
// comportamento per costruzione.
import { describe, it, expect, vi } from "vitest";
import { attivaConTastiera } from "../../lib/a11y.js";

const evento = (over = {}) => ({
  key: "Enter",
  target: {},
  currentTarget: {},
  preventDefault: vi.fn(),
  ...over,
});

describe("attivaConTastiera", () => {
  it("attiva su Invio", () => {
    const onActivate = vi.fn();
    const bersaglio = {};
    const e = evento({ target: bersaglio, currentTarget: bersaglio });
    attivaConTastiera(onActivate)(e);
    expect(onActivate).toHaveBeenCalledWith(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("attiva su Spazio, e previene lo scroll", () => {
    const onActivate = vi.fn();
    const bersaglio = {};
    const e = evento({ key: " ", target: bersaglio, currentTarget: bersaglio });
    attivaConTastiera(onActivate)(e);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("ignora gli altri tasti", () => {
    const onActivate = vi.fn();
    const bersaglio = {};
    attivaConTastiera(onActivate)(evento({ key: "Tab", target: bersaglio, currentTarget: bersaglio }));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("non attiva se l'evento nasce su un figlio (bottone/link annidato)", () => {
    // La riga stessa non deve "aprirsi" quando l'utente preme Invio su
    // un'azione rapida dentro la riga: è la ragione per cui l'helper esiste.
    const onActivate = vi.fn();
    const e = evento({ target: { tag: "figlio" }, currentTarget: { tag: "riga" } });
    attivaConTastiera(onActivate)(e);
    expect(onActivate).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
