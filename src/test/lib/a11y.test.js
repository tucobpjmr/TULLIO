// A-2 dell'audit UX/errori del 1 settembre: `attivaConTastiera` è l'unica
// fonte della semantica "Invio/Spazio attivano un role=button" — usata in
// decine di file. Se questi test passano, ogni chiamante ha lo stesso
// comportamento per costruzione.
import { describe, it, expect, vi } from "vitest";
import { attivaConTastiera, cellaAzionabile } from "../../lib/a11y.js";

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

// A-2 dell'audit del 2 settembre: `jsx-a11y/no-static-element-interactions`
// non guarda `<tr>`/`<td>` (ruolo ARIA implicito), quindi quattro gesti —
// fra cui modificare un movimento del registro contabile — restavano
// irraggiungibili da tastiera col lint verde. `cellaAzionabile` tiene il
// ruolo implicito e aggiunge solo la tastiera.
describe("cellaAzionabile", () => {
  it("espone tabIndex, aria-label e onClick", () => {
    const onAziona = vi.fn();
    const props = cellaAzionabile(onAziona, "Modifica descrizione");
    expect(props.tabIndex).toBe(0);
    expect(props["aria-label"]).toBe("Modifica descrizione");
    expect(props.onClick).toBe(onAziona);
  });

  it("onKeyDown attiva su Invio/Spazio come attivaConTastiera", () => {
    const onAziona = vi.fn();
    const props = cellaAzionabile(onAziona, "Apri riga");
    const bersaglio = {};
    props.onKeyDown(evento({ target: bersaglio, currentTarget: bersaglio }));
    expect(onAziona).toHaveBeenCalledTimes(1);
  });

  it("non si attiva una seconda volta se l'evento nasce su un bottone annidato", () => {
    // Es. "Riapri"/"Cestina" dentro la riga: il loro click nativo arriva già
    // a onClick, e il keydown che li ha generati non deve far scattare
    // ANCHE l'azione della riga.
    const onAziona = vi.fn();
    const props = cellaAzionabile(onAziona, "Apri riga");
    props.onKeyDown(evento({ target: { tag: "bottone" }, currentTarget: { tag: "riga" } }));
    expect(onAziona).not.toHaveBeenCalled();
  });
});
