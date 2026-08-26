// Regressione: il calendario del DateTimePicker sforava il margine destro del
// modale "Nuovo Task" e faceva comparire lo scroll orizzontale.
//
// Il campo SCADENZA sta nella colonna destra di una griglia 1fr/1fr dentro un
// modale largo 500px con overflowY:auto. Il pannello (260px) ancorato a
// sinistra del campo finiva oltre il bordo destro del modale: restava dentro
// la finestra — quindi il vecchio ribaltamento, che confrontava solo con
// window.innerWidth, non scattava — ma usciva dal contenitore, e con un asse
// di overflow in `auto` anche l'altro diventa `auto` → barra orizzontale.
//
// computePanelOffset ora riporta il pannello dentro i bordi del contenitore.
// Le misure qui sotto sono quelle reali del caso: viewport 1063px, modale
// 500px centrato con 28px di padding e 1px di bordo.
import { describe, it, expect } from "vitest";
import { computePanelOffset } from "../../components/ui/DateTimePicker.jsx";

const PANEL_W = 260;
// Modale: left 281 → right 781, bordo 1px + padding 28px per lato.
const MODAL = { boundsLeft: 281 + 29, boundsRight: 781 - 29 }; // 310 → 752
// Campo SCADENZA (colonna destra della griglia), a filo del contenuto.
const DUE_FIELD = { fieldLeft: 537, fieldRight: 752 };
// Campo ASSEGNA A (colonna sinistra), che invece ci stava già.
const ASSIGNEE_FIELD = { fieldLeft: 310, fieldRight: 525 };

const rightEdge = (field, offset) => field.fieldLeft + offset + PANEL_W;

describe("computePanelOffset — il pannello resta dentro il contenitore", () => {
  it("rientra il pannello che sforerebbe il bordo destro del modale", () => {
    const offset = computePanelOffset({ ...DUE_FIELD, ...MODAL, align: "left" });
    // Senza il fix l'offset sarebbe 0 e il bordo destro finirebbe a 797,
    // cioè 45px oltre il contenuto del modale (752).
    expect(offset).toBeLessThan(0);
    expect(rightEdge(DUE_FIELD, offset)).toBeLessThanOrEqual(MODAL.boundsRight);
    expect(DUE_FIELD.fieldLeft + offset).toBeGreaterThanOrEqual(MODAL.boundsLeft);
  });

  it("non sposta il pannello quando il lato preferito ci sta già", () => {
    const offset = computePanelOffset({ ...ASSIGNEE_FIELD, ...MODAL, align: "left" });
    expect(offset).toBe(0);
  });

  it("rispetta align='right' quando il pannello ci sta", () => {
    const offset = computePanelOffset({ ...DUE_FIELD, ...MODAL, align: "right" });
    // Allineato al bordo destro del campo: 752 - 260 = 492 → offset -45.
    expect(rightEdge(DUE_FIELD, offset)).toBe(DUE_FIELD.fieldRight);
    expect(DUE_FIELD.fieldLeft + offset).toBeGreaterThanOrEqual(MODAL.boundsLeft);
  });

  it("rientra anche dal bordo sinistro con align='right' su un campo stretto", () => {
    // Riga di BulkTaskCreator: campo stretto vicino al bordo sinistro, dove
    // ancorare a destra spingerebbe il pannello fuori dal contenitore.
    const narrow = { fieldLeft: 320, fieldRight: 430 };
    const offset = computePanelOffset({ ...narrow, ...MODAL, align: "right" });
    expect(narrow.fieldLeft + offset).toBe(MODAL.boundsLeft);
    expect(rightEdge(narrow, offset)).toBeLessThanOrEqual(MODAL.boundsRight);
  });

  it("con un contenitore più stretto del pannello ancora a sinistra", () => {
    // Caso degenere: si preferisce perdere il lato destro del calendario
    // piuttosto che i controlli di navigazione del mese a sinistra.
    const tight = { boundsLeft: 100, boundsRight: 300 };
    const offset = computePanelOffset({ fieldLeft: 150, fieldRight: 280, ...tight, align: "left" });
    expect(150 + offset).toBe(tight.boundsLeft);
  });
});
