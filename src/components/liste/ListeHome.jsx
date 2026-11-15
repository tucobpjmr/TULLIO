// src/components/liste/ListeHome.jsx
// L'elenco delle liste: barra di ricerca, filtro, ordinamento, righe e azioni
// del cestino.
//
// M-3 dell'analisi del 14 novembre: era il ramo «home» di ListeViaggio. Lo
// stato (ricerca, filtro, ordinamento) arriva da useHomeListe, chiamato dal
// padre: vedi il perché in cima a quel file.
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { terminiRicerca } from "../../lib/searchUtils.js";
import { useListeWrite } from "./listePersistence.js";
import { FILTRI, ORDINAMENTI } from "./listeOrdinamento.js";
import { ListaRow } from "./ListaRow.jsx";
import * as stiliComuni from "../../styles/common.js";

const chipAltrove = { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 10 };
const piedeMostraAltri = { padding: "14px 16px", textAlign: "center" };

/**
 * @param {{
 *   home: ReturnType<typeof import("./useHomeListe.js").useHomeListe>,
 *   saldi: Record<string, any>,
 *   onApri: (id: string) => void,
 *   onNuova: () => void,
 *   onStrumenti: () => void,
 *   ricaricaHome: () => Promise<any>,
 * }} props
 */
export function ListeHome({ home, saldi, onApri, onNuova, onStrumenti, ricaricaHome }) {
  const {
    search, setSearch, filter, setFilter, sort, setSort, idOrdina,
    visibili, finestra, conteggi, altrove,
  } = home;
  const esegui = useListeWrite();
  const conferma = useConfirm();

  const ripristina = async (id) => {
    const { ok } = await esegui("ripristinaLista", id);
    if (ok) await ricaricaHome();
  };

  const eliminaDefinitiva = async (l) => {
    if (!(await conferma({
      title: "Eliminare definitivamente?",
      body: `"${l.clients?.name || "questa lista"}" e tutti i suoi movimenti e storico verranno eliminati. L'operazione NON è reversibile.`,
      cta: "Elimina definitivamente",
      danger: true,
    }))) return;
    const { ok } = await esegui("eliminaListaDefinitivamente", l.id);
    if (ok) await ricaricaHome();
  };

  // "Esaurite (1)" oppure "Esaurite (1) · Cestino (2)", come bottoni che
  // portano dove i risultati sono.
  const altroveChips = altrove.map(({ key, n }) => (
    <button key={key} type="button" className="lv-btn sm" onClick={() => setFilter(key)}>
      {FILTRI[key]} ({n})
    </button>
  ));

  return (
    <>
      <div className="lv-toolbar">
        <input
          type="search"
          placeholder="Cerca cliente, cointestatario o titolo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Cerca lista per cliente, cointestatario o titolo"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filtra le liste"
        >
          <option value="attive">Attive ({conteggi.attive})</option>
          <option value="esaurite">Esaurite ({conteggi.esaurite})</option>
          <option value="tutte">Tutte ({conteggi.tutte})</option>
          <option value="cestino">Cestino{conteggi.cestino ? ` (${conteggi.cestino})` : ""}</option>
        </select>
        <label className="lv-sel-lbl" htmlFor={idOrdina}>
          Ordina
          <select id={idOrdina} value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(ORDINAMENTI).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <button className="lv-btn" title="Strumenti dati (backup e reset)" onClick={onStrumenti}>
          Strumenti dati
        </button>
        <button className="lv-btn primary" onClick={onNuova}>+ Nuova lista</button>
      </div>

      {/* Risultati nascosti dal filtro: si dice sempre, anche quando
          l'elenco NON è vuoto — cercando "COLUCCI" fra le attive si
          vedono tre liste e non si sospetta la quarta, esaurita. */}
      {visibili.length > 0 && altrove.length > 0 && (
        <div className="lv-altrove">
          <span>Altri risultati per “{search.trim()}” fuori da “{FILTRI[filter]}”:</span>
          {altroveChips}
        </div>
      )}

      <div className="lv-card">
        {visibili.length === 0 ? (
          <div className="lv-empty">
            {terminiRicerca(search).length ? (
              <>
                Nessuna lista trovata per “{search.trim()}” in “{FILTRI[filter]}”.
                {altrove.length > 0 && (
                  <>
                    <br />
                    <span style={stiliComuni.txtF13}>Ma c’è altrove:</span>
                    <div style={chipAltrove}>
                      {altroveChips}
                    </div>
                  </>
                )}
              </>
            ) : filter === "cestino" ? (
              "Il cestino è vuoto."
            ) : (
              <>Nessuna lista qui.<br />Crea la prima con “+ Nuova lista”.</>
            )}
          </div>
        ) : filter === "cestino" ? (
          visibili.map((l) => (
            // @ts-expect-error key è gestita da React, non da ListaRow (M-4, assenza di @types/react)
            <ListaRow key={l.id} lista={l} saldo={saldi[l.id]} trashed>
              <button className="lv-btn sm" onClick={() => ripristina(l.id)}>Ripristina</button>
              <button className="lv-btn danger sm" onClick={() => eliminaDefinitiva(l)}>
                Elimina definitivamente
              </button>
            </ListaRow>
          ))
        ) : (
          <>
            {finestra.visibili.map((l) => (
              // @ts-expect-error key è gestita da React, non da ListaRow (M-4, assenza di @types/react)
              <ListaRow key={l.id} lista={l} saldo={saldi[l.id]} onOpen={() => onApri(l.id)} />
            ))}
            {finestra.restanti > 0 && (
              <div style={piedeMostraAltri}>
                {/* Il bottone resta quello del modulo (`lv-btn`): il
                    CSS di Liste è scopato sotto `.lv-root`, quindi il
                    piede condiviso del core (ui/MostraAltri.jsx) qui
                    arriverebbe senza i propri stili. La meccanica è la
                    stessa, l'aspetto è quello di casa. */}
                <button className="lv-btn" onClick={finestra.ancora}>
                  Mostra altre liste ({finestra.restanti} rimanenti)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
