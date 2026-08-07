import { describe, it, expect, vi } from "vitest";

// CalendarPlanner importa (transitivamente) Avatar, che da S-10 risolve le
// signed URL degli avatar via lib/api.js → client Supabase condiviso, non
// costruibile senza VITE_SUPABASE_URL. Mockato e mai usato: qui servono
// solo gli helper puri.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
import { foldIcsLine, buildIcs, icsEscape } from "../components/calendar/calendarIcs.js";

const enc = new TextEncoder();
const byteLen = (s) => enc.encode(s).length;

// Ricompone le continuazioni di una riga foldata rimuovendo il "CRLF + spazio"
// di continuazione, per riottenere la riga di contenuto originale.
function unfold(folded) {
  return folded
    .split("\r\n")
    .map((part, i) => (i === 0 ? part : part.slice(1))) // rimuove lo spazio di continuazione
    .join("");
}

describe("foldIcsLine", () => {
  it("non modifica una riga corta (<= 75 ottetti)", () => {
    const line = "SUMMARY:Riunione";
    expect(foldIcsLine(line)).toBe(line);
    expect(foldIcsLine(line)).not.toContain("\r\n");
  });

  it("non modifica una riga esattamente di 75 ottetti", () => {
    const prefix = "SUMMARY:";
    const line = prefix + "a".repeat(75 - byteLen(prefix));
    expect(byteLen(line)).toBe(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it("spezza con CRLF + spazio una riga ASCII che supera 75 ottetti", () => {
    const line = "DESCRIPTION:" + "x".repeat(100);
    expect(byteLen(line)).toBeGreaterThan(75);
    const folded = foldIcsLine(line);
    expect(folded).toContain("\r\n ");

    const segments = folded.split("\r\n");
    expect(segments.length).toBeGreaterThan(1);
    // Prima porzione: al massimo 75 ottetti
    expect(byteLen(segments[0])).toBeLessThanOrEqual(75);
    // Continuazioni: iniziano con uno spazio e non superano i 75 ottetti totali
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].startsWith(" ")).toBe(true);
      expect(byteLen(segments[i])).toBeLessThanOrEqual(75);
    }
    // Ricomponendo si riottiene la riga originale
    expect(unfold(folded)).toBe(line);
  });

  it("non spezza a metà di un carattere multi-byte UTF-8 (accenti italiani)", () => {
    // "è" occupa 2 ottetti in UTF-8: costruiamo una riga che porti il limite
    // di 75 ottetti proprio a cavallo di una "è", in diverse posizioni.
    for (let offset = 0; offset < 6; offset++) {
      const filler = "a".repeat(70 + offset);
      const line = "DESCRIPTION:" + filler + "è".repeat(10) + "fine";
      expect(byteLen(line)).toBeGreaterThan(75);

      const folded = foldIcsLine(line);
      // Ricostruzione byte-per-byte esatta della stringa originale
      expect(unfold(folded)).toBe(line);

      // Nessun segmento deve contenere un carattere di sostituzione o byte
      // corrotti: verifichiamo che ogni continuazione, se decodificata dai
      // suoi ottetti, riproduca esattamente i caratteri attesi (nessun �
      // introdotto da uno split a metà sequenza).
      expect(folded).not.toContain("�");

      // Ogni riga fisica (porzione tra i CRLF) rispetta il limite di 75 ottetti
      for (const seg of folded.split("\r\n")) {
        expect(byteLen(seg)).toBeLessThanOrEqual(75);
      }
    }
  });

  it("gestisce testo con caratteri multi-byte vicino al limite senza spezzare in due la stessa lettera accentata", () => {
    const line = "DESCRIPTION:" + "à".repeat(50) + " Priorità: alta è importante è urgente è critica";
    const folded = foldIcsLine(line);
    expect(unfold(folded)).toBe(line);
    for (const seg of folded.split("\r\n")) {
      expect(byteLen(seg)).toBeLessThanOrEqual(75);
    }
  });
});

describe("buildIcs", () => {
  it("produce righe DESCRIPTION foldate quando descrizione + priorità superano 75 ottetti", () => {
    const tasks = [{
      id: "task-1",
      dueDate: "2026-07-10T10:00:00.000Z",
      estimatedHours: 2,
      title: "Preparativi per il viaggio di nozze a Positano",
      description: "Contattare l'hotel per confermare la camera con vista sul mare e organizzare il transfer privato dall'aeroporto",
      priority: "alta",
      category: "transfer",
    }];
    const ics = buildIcs(tasks);

    // Nessuna riga (separata da CRLF) supera i 75 ottetti
    const rawLines = ics.split("\r\n");
    for (const line of rawLines) {
      expect(byteLen(line)).toBeLessThanOrEqual(75);
    }

    // La riga DESCRIPTION è stata effettivamente foldata (più righe fisiche)
    const descStart = rawLines.findIndex(l => l.startsWith("DESCRIPTION:"));
    expect(descStart).toBeGreaterThanOrEqual(0);
    expect(rawLines[descStart + 1]?.startsWith(" ")).toBe(true);

    // Ricomponendo le porzioni foldate si riottiene il contenuto atteso
    let full = rawLines[descStart];
    let i = descStart + 1;
    while (i < rawLines.length && rawLines[i].startsWith(" ")) {
      full += rawLines[i].slice(1);
      i++;
    }
    expect(full).toBe(`DESCRIPTION:${icsEscape("Contattare l'hotel per confermare la camera con vista sul mare e organizzare il transfer privato dall'aeroporto\nPriorità: alta")}`);
  });

  it("non altera righe corte come UID o BEGIN/END", () => {
    const tasks = [{
      id: "t1",
      dueDate: "2026-07-10T10:00:00.000Z",
      title: "Task breve",
    }];
    const ics = buildIcs(tasks);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:t1@voyagedesk");
    expect(ics).toContain("END:VEVENT");
  });
});
