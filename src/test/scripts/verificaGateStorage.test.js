// La FORMA del gate «utente attivo» su storage.objects.
//
// Il controllo esiste perché per tre settimane il commento di
// `20260827075128` e il suo SQL hanno detto due cose opposte: il primo
// dichiarava una lista di INCLUSIONI («un bucket nuovo nasce sotto il gate»),
// il secondo era rimasto una lista di ESCLUSIONI (un bucket nuovo nasce
// scoperto). Nessuno misurava la forma, quindi la divergenza è sopravvissuta
// fino a quando aggiungere un bucket non ha costretto a nominarlo.
//
// Questi casi fissano le due cose che il controllo deve distinguere, e che
// sono l'unica ragione per cui non è un semplice `grep bucket_id`:
//   • il test NEGATO («tutti tranne questi») è il difetto;
//   • il test AFFERMATIVO («questi sono esenti») è la forma legittima con cui
//     un domani si esenterà un bucket, e deve continuare a passare.
import { describe, it, expect } from "vitest";
import { corpoPolicy, gateStorageSenzaElenco } from "../../../scripts/verifica-convenzioni/storage.js";

const conCorpo = (corpo) => `create policy "storage_active_only" on storage.objects
  as restrictive for all to authenticated
  ${corpo};`;

describe("corpoPolicy", () => {
  it("estrae il corpo della policy fino al punto e virgola", () => {
    const sql = `-- preambolo\n${conCorpo("using (true)")}\n\nselect 1;`;
    expect(corpoPolicy(sql)).toContain("using (true)");
    expect(corpoPolicy(sql)).not.toContain("select 1");
  });

  // Il preambolo di una migrazione CITA il difetto per spiegarlo: citarlo non
  // è commetterlo, e senza questo il controllo fallirebbe proprio sulla
  // migrazione che lo corregge.
  it("ignora la forma sbagliata quando compare dentro un commento", async () => {
    const sql = `-- era: bucket_id not in ('task-files') or is_active_user()\n`
      + conCorpo("using ((select private.is_active_user()))");
    expect(corpoPolicy(sql)).not.toMatch(/not\s+in/i);
  });

  it("tiene l'ULTIMA definizione quando il file ne contiene più d'una", () => {
    const sql = `${conCorpo("using (false)")}\n${conCorpo("using (true)")}`;
    expect(corpoPolicy(sql)).toContain("using (true)");
    expect(corpoPolicy(sql)).not.toContain("using (false)");
  });

  it("restituisce null per un file che non definisce la policy", () => {
    expect(corpoPolicy("create table foo (id int);")).toBeNull();
  });
});

describe("gateStorageSenzaElenco — sulle migrazioni vere del repo", () => {
  // Il caso che conta: lo stato di OGGI deve essere pulito. Se qualcuno
  // reintroduce un elenco di esclusioni in una migrazione futura, questo
  // fallisce — ed è l'unico punto del progetto che se ne accorgerebbe.
  it("la definizione vigente non è un elenco di bucket esclusi", async () => {
    const { file, negazioni } = await gateStorageSenzaElenco();
    expect(file).toBeTruthy();
    expect(negazioni).toEqual([]);
  });

  // La definizione vigente è quella con la versione più alta: le migrazioni
  // precedenti contengono di proposito la forma vecchia, e riscriverle
  // sarebbe riscrivere il passato (docs/MIGRAZIONI_SUPABASE.md).
  it("legge l'ultima migrazione che la definisce, non la prima", async () => {
    const { file } = await gateStorageSenzaElenco();
    expect(file).toBe("20260916150000_storage_active_only_inclusione_vera.sql");
  });
});
