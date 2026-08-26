// L'embed del titolare nelle query su `liste_viaggio` deve restare
// disambiguato.
//
// Contesto del bug che questi test bloccano: `lista_beneficiari` (introdotta
// con la cointestazione) ha la chiave primaria (lista_id, client_id) — due
// colonne, entrambe foreign key verso due tabelle diverse. È la forma in cui
// PostgREST riconosce una tabella-ponte e deduce da sé una relazione
// molti-a-molti liste_viaggio ↔ clients. Con la foreign key diretta
// liste_viaggio.client_id → clients.id le relazioni diventano due, e un
// `clients(name)` senza indicazioni non dice quale: PostgREST rifiuta TUTTA la
// query con PGRST201 ("Could not embed because more than one relationship was
// found for 'liste_viaggio' and 'clients'"). In produzione l'effetto è stato
// la pagina "Liste viaggio" bloccata su "Non riesco a caricare le liste" —
// elenco, cestino, dettaglio e tab dentro la scheda cliente insieme, perché
// tutte e quattro passano dallo stesso LISTA_SELECT.
//
// Il test guarda la stringa select davvero spedita al server, non la costante:
// il punto è che a `liste_viaggio` non arrivi mai un embed `clients` nudo, da
// qualunque metodo parta.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Select ricevute, come [tabella, stringa select].
const selects = [];

// Builder PostgREST minimale: incatenabile e thenable, così regge sia le
// query che finiscono in `.single()` sia quelle che il chiamante attende
// direttamente.
//
// `lista_partecipanti` deve restituire almeno una riga: `listByClient` la
// interroga per prima e, se il cliente non risulta collegato a nessuna lista,
// esce subito con [] senza mai toccare liste_viaggio — e il test non avrebbe
// alcuna select da controllare.
const righeDi = (table) => (table === "lista_partecipanti" ? [{ lista_id: "l1" }] : []);

const fakeFrom = (table) => {
  const q = {
    select: (cols) => { selects.push([table, cols]); return q; },
    is: () => q,
    not: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    range: () => Promise.resolve({ data: righeDi(table), count: righeDi(table).length, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve) => resolve({ data: righeDi(table), error: null }),
  };
  return q;
};

vi.mock("../../lib/supabase", () => ({ supabase: { from: fakeFrom }, default: {} }));

const { ListeAPI } = await import("../../components/liste/listeApi.js");

// Le parti di primo livello di una select PostgREST: si divide sulle virgole
// fuori da ogni parentesi, altrimenti `lista_beneficiari(client_id,
// clients(name))` verrebbe spezzata a metà e il `clients(name)` annidato —
// che è legittimo, parte dal ponte dove la relazione è una sola — finirebbe
// per sembrare un embed di primo livello.
const partiDiPrimoLivello = (select) => {
  const parti = [];
  let profondita = 0;
  let corrente = "";
  for (const ch of select) {
    if (ch === "(") profondita++;
    if (ch === ")") profondita--;
    if (ch === "," && profondita === 0) { parti.push(corrente.trim()); corrente = ""; continue; }
    corrente += ch;
  }
  parti.push(corrente.trim());
  return parti.filter(Boolean);
};

const embedClientsDiPrimoLivello = (select) =>
  partiDiPrimoLivello(select).filter((p) => /^clients\b/.test(p));

beforeEach(() => { selects.length = 0; });

describe("embed del titolare su liste_viaggio", () => {
  // Ogni metodo che legge le liste con il nome del titolare. `listByClient`
  // passa prima da lista_partecipanti: la select su liste_viaggio arriva
  // comunque, ed è quella che il test isola.
  const metodi = {
    "list (elenco)": () => ListeAPI.list(),
    "listTrash (cestino)": () => ListeAPI.listTrash(),
    "get (dettaglio)": () => ListeAPI.get("l1"),
    "listByClient (tab scheda cliente)": () => ListeAPI.listByClient("cl-1"),
  };

  for (const [nome, chiama] of Object.entries(metodi)) {
    it(`${nome}: l'embed clients nomina il vincolo del titolare`, async () => {
      await chiama();

      const suListe = selects.filter(([t]) => t === "liste_viaggio").map(([, cols]) => cols);
      expect(suListe.length).toBeGreaterThan(0);

      for (const select of suListe) {
        const embed = embedClientsDiPrimoLivello(select);
        // Un embed `clients` c'è, ed è uno solo.
        expect(embed).toHaveLength(1);
        // ...e dichiara da quale relazione passare. Senza questo PostgREST
        // risponde PGRST201 e la pagina resta vuota.
        expect(embed[0]).toMatch(/^clients!liste_viaggio_client_id_fkey\(/);
      }
    });
  }

  it("l'embed annidato dei cointestatari resta senza hint (dal ponte la strada è una sola)", async () => {
    await ListeAPI.list();

    const select = selects.find(([t]) => t === "liste_viaggio")[1];
    const benef = partiDiPrimoLivello(select).find((p) => /^lista_beneficiari\b/.test(p));
    expect(benef).toBeDefined();
    expect(benef).toContain("clients(name)");
  });
});
