// ST-13 · La parte pura della verifica delle convenzioni.
//
// PERCHÉ QUESTI TEST ESISTONO, e quali sono quelli che contano. Uno script che
// confronta un documento con una misura ha un modo di fallire peggiore di
// quello ovvio: non trovare il pattern nel documento e passare lo stesso. Da
// quel momento la CI è verde perché non sta controllando niente, ed è
// esattamente la forma del problema che questo script esiste per chiudere. I
// test sui casi "pattern assente" sono quindi i più importanti del file.
import { describe, it, expect } from 'vitest';
import {
  LetturaFallita, leggiCallSiteSalvataggio, leggiConteggioMultiComp, leggiStatoAudit,
  leggiStatoIndex, leggiStiliInline, montaggiLazySenzaRete, usiSalvataggio, confronta,
  azioniRegistry, formSenzaAttesaEsito, ricercheSenzaIndice, iterazioniQuadratiche,
  formeDuplicate, formeGiaInComune,
} from '../../scripts/verifica-convenzioni/convenzioni.js';

describe('leggiConteggioMultiComp', () => {
  it('legge casi e file dalla frase di CLAUDE.md', () => {
    const testo = '…`react/no-multi-comp` è un **warning**, con 20 casi aperti in 13 file (Sidebar…';
    expect(leggiConteggioMultiComp(testo)).toEqual({ casi: 20, file: 13 });
  });

  it('SOLLEVA se la frase non c\'è più, invece di passare a vuoto', () => {
    expect(() => leggiConteggioMultiComp('un documento riscritto senza quel numero'))
      .toThrow(LetturaFallita);
  });
});

describe('leggiStiliInline', () => {
  it('legge il numero dalla frase di CLAUDE.md', () => {
    const testo = '…1.153 occorrenze sollevate, restano **334 style inline dinamici**, ognuno…';
    expect(leggiStiliInline(testo)).toBe(334);
  });

  it('SOLLEVA se la frase non c\'è più, invece di passare a vuoto', () => {
    expect(() => leggiStiliInline('gli stili inline sono ormai pochi'))
      .toThrow(LetturaFallita);
  });
});

describe('leggiStatoAudit', () => {
  const tabella = [
    '| # | Priorità | Area |',
    '| — | **CRITICI** | — |',
    '| ST-1 | ~~Alta~~ ✔ **risolto** | Render |',
    '| ST-2 | ~~Alta~~ ✔ **risolto** (parte 1 di 2) | Architettura |',
    '| ST-3 | Media | Scalabilità |',
  ].join('\n');

  it('conta i rilievi e quelli chiusi dalla tabella delle priorità', () => {
    expect(leggiStatoAudit(tabella, 'ST')).toEqual({ totale: 3, chiusi: 2 });
  });

  it('ignora le righe che non sono rilievi (l\'intestazione, la riga CRITICI)', () => {
    expect(leggiStatoAudit(tabella, 'ST').totale).toBe(3);
  });

  it('non confonde i prefissi di due audit diversi', () => {
    const misto = tabella + '\n| P2-1 | ~~Alta~~ ✔ **risolto** | Bundle |';
    expect(leggiStatoAudit(misto, 'ST').totale).toBe(3);
    expect(leggiStatoAudit(misto, 'P2')).toEqual({ totale: 1, chiusi: 1 });
  });

  it('conta più prefissi insieme, come nell\'audit con C/A/M/B', () => {
    const misto = [
      '| **C-1** ✔ | letture non paginate | `lib/api.js` | Critica |',
      '| **A-1** ✔ | workflow rosso | `scripts/` | Alta |',
      '| **M-1** ⚙ | stili inline | trasversale | Media |',
    ].join('\n');
    expect(leggiStatoAudit(misto, ['C', 'A', 'M', 'B'])).toEqual({ totale: 3, chiusi: 2 });
  });

  it('conta per identificativo: lo stesso rilievo in due tabelle è UNO', () => {
    // AUDIT_STRUTTURA nomina i suoi rilievi due volte — nella tabella delle
    // priorità e in quella delle correzioni. Contando le righe, quindici
    // rilievi diventavano ventinove.
    const due = [
      '| ST-1 | ~~Alta~~ ✔ **risolto** | Render | … |',
      '| ST-2 | Media | Architettura | … |',
      '| **ST-1** | come è stato corretto |',
      '| **ST-2** | come è stato corretto |',
    ].join('\n');
    expect(leggiStatoAudit(due, 'ST')).toEqual({ totale: 2, chiusi: 1 });
  });

  it('SOLLEVA se il documento non ha una tabella dei rilievi', () => {
    expect(() => leggiStatoAudit('# Un audit senza tabella', 'ST')).toThrow(LetturaFallita);
  });
});

describe('leggiStatoIndex', () => {
  const riga = '| [`AUDIT_X.md`](AUDIT_X.md) | perimetro | ST-14 — gli altri sono chiusi. ⟦stato: 14/15 chiusi⟧ |';

  it('legge il marcatore machine-readable sulla riga del documento', () => {
    expect(leggiStatoIndex(riga, 'AUDIT_X.md')).toEqual({ chiusi: 14, totale: 15 });
  });

  it('SOLLEVA se il marcatore manca del tutto', () => {
    expect(() => leggiStatoIndex('| [`AUDIT_X.md`](AUDIT_X.md) | perimetro | prosa |', 'AUDIT_X.md'))
      .toThrow(LetturaFallita);
  });

  it('SOLLEVA se il marcatore c\'è ma non è nella forma attesa', () => {
    expect(() => leggiStatoIndex('| AUDIT_X.md | ⟦stato: quasi tutti chiusi⟧ |', 'AUDIT_X.md'))
      .toThrow(LetturaFallita);
  });

  it('non prende il marcatore della riga di un ALTRO audit', () => {
    const due = [
      '| [`AUDIT_A.md`](AUDIT_A.md) | … | ⟦stato: 3/3 chiusi⟧ |',
      '| [`AUDIT_B.md`](AUDIT_B.md) | … | ⟦stato: 1/9 chiusi⟧ |',
    ].join('\n');
    expect(leggiStatoIndex(due, 'AUDIT_B.md')).toEqual({ chiusi: 1, totale: 9 });
  });
});

describe('confronta', () => {
  it('non riporta nulla quando dichiarato e misurato coincidono', () => {
    expect(confronta([{ nome: 'x', dove: 'd', dichiarato: 3, misurato: 3, rimedio: 'r' }])).toEqual([]);
  });

  it('lo scarto dice ENTRAMBI i numeri e cosa fare', () => {
    // Il messaggio è il prodotto di questo script: chi lo legge deve poter
    // decidere se ha sbagliato il documento o il codice, senza aprirli.
    const [msg] = confronta([{
      nome: 'no-multi-comp (file)', dove: 'docs/CLAUDE.md',
      dichiarato: 10, misurato: 13, rimedio: 'Aggiorna la frase.',
    }]);
    expect(msg).toContain('dice 10');
    expect(msg).toContain('misurato 13');
    expect(msg).toContain('Aggiorna la frase.');
  });
});

describe('montaggiLazySenzaRete', () => {
  const IMPORT_LAZY = 'import { useState, lazy } from "react";';

  it('segnala il file che monta un lazy senza nominare alcuna rete di sicurezza', () => {
    const sorgenti = [
      { path: 'src/components/shell/Topbar.jsx', testo: `${IMPORT_LAZY}\n<Suspense fallback={<LazyFallback />}>` },
    ];
    expect(montaggiLazySenzaRete(sorgenti)).toEqual(['src/components/shell/Topbar.jsx']);
  });

  it('accetta il file che monta con LazyPanel', () => {
    const sorgenti = [
      { path: 'src/components/shell/Topbar.jsx', testo: `${IMPORT_LAZY}\n<LazyPanel resetKey="notifiche">` },
    ];
    expect(montaggiLazySenzaRete(sorgenti)).toEqual([]);
  });

  it('accetta anche i due boundary usati direttamente (la vista, gli overlay)', () => {
    const conVista = { path: 'a.jsx', testo: `${IMPORT_LAZY}\n<ViewErrorBoundary viewKey={v}>` };
    const conOverlay = { path: 'b.jsx', testo: `${IMPORT_LAZY}\n<OverlayErrorBoundary resetKey="x">` };
    expect(montaggiLazySenzaRete([conVista, conOverlay])).toEqual([]);
  });

  it('ignora i file che NOMINANO lazy in un commento senza importarlo', () => {
    // Il primo giro di questo controllo segnalava ui/LazyFallback.jsx, che
    // dice «mentre un chunk lazy (AdminView, …) viene scaricato» ed è il file
    // del fallback: non monta niente. È la ragione per cui il segnale è
    // l'import e non la chiamata.
    const sorgenti = [
      { path: 'src/components/ui/LazyFallback.jsx', testo: '// spinner per un chunk lazy (AdminView) in arrivo\nexport const LazyFallback = () => null;' },
      { path: 'src/components/shell/Topbar.jsx', testo: `${IMPORT_LAZY}\n<LazyPanel />` },
    ];
    expect(montaggiLazySenzaRete(sorgenti)).toEqual([]);
  });

  it('SOLLEVA se nessun file importa lazy, invece di passare a vuoto', () => {
    // Il modo peggiore di fallire: verde perché non ha controllato niente.
    expect(() => montaggiLazySenzaRete([{ path: 'a.js', testo: 'export const x = 1;' }]))
      .toThrow(LetturaFallita);
  });
});

describe('usiSalvataggio / leggiCallSiteSalvataggio', () => {
  const IMPORTA = 'import { useSalvataggio } from "../../hooks/useSalvataggio.js";';

  it('elenca i file che importano l\'hook, non quelli che lo nominano', () => {
    const sorgenti = [
      { path: 'src/components/modals/QuickAddTask.jsx', testo: `${IMPORTA}\nconst { salva } = useSalvataggio(f);` },
      // Il file dell'hook stesso, e un commento che ne parla: nessuno dei due
      // è un call site.
      { path: 'src/hooks/useSalvataggio.js', testo: 'export function useSalvataggio() {}' },
      { path: 'src/components/liste/AddMovBox.jsx', testo: '// da convertire a useSalvataggio\nexport const AddMovBox = () => null;' },
    ];
    expect(usiSalvataggio(sorgenti)).toEqual(['src/components/modals/QuickAddTask.jsx']);
  });

  it('SOLLEVA se nessun file lo importa: l\'hook è sparito o la forma è cambiata', () => {
    expect(() => usiSalvataggio([{ path: 'a.jsx', testo: 'export const A = () => null;' }]))
      .toThrow(LetturaFallita);
  });

  it('legge il numero dichiarato in CLAUDE.md e solleva se la frase non c\'è', () => {
    expect(leggiCallSiteSalvataggio('… **3 call site usano `useSalvataggio`**: il numero …')).toBe(3);
    expect(() => leggiCallSiteSalvataggio('nessuna frase del genere')).toThrow(LetturaFallita);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
//  I CONTROLLI CHE NEGANO
//  (suggerimento strategico n. 3 dell'audit performance/UX del 19 agosto)
// ═══════════════════════════════════════════════════════════════════════════
//
// I casi che contano qui sono DUE per predicato, e vanno letti in coppia:
// quello che segnala il difetto (senza, il controllo non intercetta niente) e
// quello che accetta la forma corretta (senza, il controllo è un allarme che
// suona sempre e che qualcuno spegnerà). Più il caso «presupposto assente»,
// che è la regola non negoziabile di questo file.

describe('azioniRegistry', () => {
  const REGISTRY = `
export const PERSISTENCE = {
  ADD_TASK: {
    persist: (s, a) => TasksAPI.create(a.payload),
  },
  UPDATE_NOTICE: {
    guard: () => true,
  },
};`;

  it('legge i tipi dal sorgente invece di elencarli a mano', () => {
    expect(azioniRegistry(REGISTRY)).toEqual(['ADD_TASK', 'UPDATE_NOTICE']);
  });

  it('SOLLEVA su un registry vuoto, invece di far passare tutto a vuoto', () => {
    // Con zero azioni il predicato di `formSenzaAttesaEsito` non corrisponde a
    // niente, quindi ogni form risulterebbe a posto.
    expect(() => azioniRegistry('export const PERSISTENCE = {};')).toThrow(LetturaFallita);
  });
});

describe('formSenzaAttesaEsito', () => {
  const AZIONI = ['ADD_CATEGORY', 'UPDATE_TEAM_MEMBER', 'DELETE_CLIENT'];
  const importaValida = 'import { obbligatorio, validaCampi } from "../../lib/validators.js";';

  it('segnala il form che scrive e chiude senza attendere', () => {
    const sorgenti = [{
      path: 'src/components/modals/AddCategoryModal.jsx',
      testo: `${importaValida}
        const submit = () => {
          const trovati = validaCampi({ label }, REGOLE);
          dispatch({ type: "ADD_CATEGORY", payload: { label } });
          onClose();
        };`,
    }];
    expect(formSenzaAttesaEsito(sorgenti, AZIONI))
      .toEqual(['src/components/modals/AddCategoryModal.jsx']);
  });

  it('accetta il form che passa da useSalvataggio', () => {
    const sorgenti = [{
      path: 'src/components/modals/AddCategoryModal.jsx',
      testo: `${importaValida}
        import { useSalvataggio } from "../../hooks/useSalvataggio.js";
        const { salva } = useSalvataggio((p) => dispatch({ type: "ADD_CATEGORY", payload: p }));`,
    }];
    expect(formSenzaAttesaEsito(sorgenti, AZIONI)).toEqual([]);
  });

  it('accetta anche chi attende a mano, come ProfileEditor faceva prima dell\'hook', () => {
    const sorgenti = [{
      path: 'src/components/modals/ProfileEditor.jsx',
      testo: `${importaValida}
        const salva = async () => {
          const res = await dispatch({ type: "UPDATE_TEAM_MEMBER", payload: draft });
          if (res?.error) return;
          onClose();
        };`,
    }];
    expect(formSenzaAttesaEsito(sorgenti, AZIONI)).toEqual([]);
  });

  it('NON segnala una scrittura senza form: non c\'è niente di digitato da perdere', () => {
    // È il caso che separa i sei call site del rilievo dai molti che vanno
    // bene: una DELETE dietro una conferma, con rollback e toast, è il pattern
    // giusto. Il predicato è «valida E scrive», non «scrive».
    const sorgenti = [
      // Un form a posto perché il presupposto del controllo regga (senza
      // nessun file che validi, la funzione SOLLEVA — vedi l'ultimo caso).
      { path: 'src/components/ok.jsx', testo: `${importaValida}\nuseSalvataggio(() => {});` },
      {
        path: 'src/components/clients/ClientiView.jsx',
        testo: `const handleDelete = (c) => {
          dispatch({ type: "DELETE_CLIENT", payload: c.id });
          chiudiOverlay();
        };`,
      },
    ];
    expect(formSenzaAttesaEsito(sorgenti, AZIONI)).toEqual([]);
  });

  it('SOLLEVA se nessun file valida, invece di passare a vuoto', () => {
    expect(() => formSenzaAttesaEsito([{ path: 'a.js', testo: 'niente' }], AZIONI))
      .toThrow(LetturaFallita);
  });
});

describe('ricercheSenzaIndice', () => {
  const conIndice = {
    path: 'src/components/clients/ClientiView.jsx',
    testo: `const indice = useMemo(() => clients.map(c => ({ c, idx: indicizza(c.name) })), [clients]);
      const filtrati = useMemo(() => indice.filter(r => matchIndice(termini, r.idx)), [indice, search]);`,
  };

  it('segnala il filtro che normalizza dentro un useMemo sulla query', () => {
    const sorgenti = [conIndice, {
      path: 'src/components/search/AdvancedSearchPanel.jsx',
      testo: `const results = useMemo(() => {
          return tasks.filter(t => matchTermini(termini, t.title, t.client));
        }, [tasks, keyword]);`,
    }];
    expect(ricercheSenzaIndice(sorgenti))
      .toEqual(['src/components/search/AdvancedSearchPanel.jsx']);
  });

  it('accetta `matchTermini` FUORI da un useMemo: lì è legittima', () => {
    // `filtraListe` in liste/listeOrdinamento.js è una funzione pura esportata
    // per i test, non un memo che riparte a ogni battuta. Il difetto non è la
    // funzione, è chiamarla in un ciclo che riparte a ogni carattere.
    const sorgenti = [conIndice, {
      path: 'src/components/liste/listeOrdinamento.js',
      testo: `export function filtraListe(liste, search) {
          const termini = terminiRicerca(search);
          return liste.filter((l) => matchTermini(termini, l.titolo));
        }`,
    }];
    expect(ricercheSenzaIndice(sorgenti)).toEqual([]);
  });

  it('SOLLEVA se nessuno usa l\'indice: «zero senza indice» sarebbe «zero ricerche»', () => {
    expect(() => ricercheSenzaIndice([{ path: 'a.js', testo: 'matchTermini(x)' }]))
      .toThrow(LetturaFallita);
  });
});

describe('iterazioniQuadratiche', () => {
  it('segnala l\'indexOf dentro la callback di una map', () => {
    const sorgenti = [{
      path: 'src/components/chat/ConversationView.jsx',
      testo: `return visible.map((m) => {
          const i = msgs.indexOf(m);
          return <ChatMessage msg={m} prevMsg={msgs[i - 1]} />;
        });`,
    }];
    expect(iterazioniQuadratiche(sorgenti))
      .toEqual(['src/components/chat/ConversationView.jsx']);
  });

  it('accetta la forma corretta: l\'indice arriva dalla callback', () => {
    const sorgenti = [{
      path: 'src/components/chat/ConversationView.jsx',
      testo: `const conPrecedente = useMemo(
          () => msgs.map((m, i) => ({ m, prev: msgs[i - 1] })), [msgs]);`,
    }];
    expect(iterazioniQuadratiche(sorgenti)).toEqual([]);
  });

  it('non segnala un `.map()` che non cerca niente', () => {
    const sorgenti = [{
      path: 'src/components/x.jsx',
      testo: 'const nomi = team.map(m => m.name.toUpperCase());',
    }];
    expect(iterazioniQuadratiche(sorgenti)).toEqual([]);
  });
});

describe('formeDuplicate', () => {
  // Il valore arriva già normalizzato da chi estrae (proprietà ordinate,
  // spazi e virgolette uniformati): queste funzioni confrontano, non
  // interpretano. È la ragione per cui stanno nella parte pura.
  const forma = (path, nome, valore) => ({ path, nome, valore });

  it('segnala una forma definita in tre file diversi', () => {
    const costanti = [
      forma('src/a.jsx', 'rowCenterGap6', "{ display: 'flex', gap: 6 }"),
      forma('src/b.jsx', 'chipRow', "{ display: 'flex', gap: 6 }"),
      forma('src/c/stili.js', 'filaChip', "{ display: 'flex', gap: 6 }"),
    ];
    const scoperte = formeDuplicate(costanti);
    expect(scoperte).toHaveLength(1);
    // Il messaggio deve dire DOVE: chi legge la CI non ha il repo davanti.
    expect(scoperte[0]).toContain('src/a.jsx');
    expect(scoperte[0]).toContain('src/c/stili.js');
  });

  it('tace sotto soglia: due file non sono ancora un duplicato da promuovere', () => {
    // La soglia è quella che common.js dichiara di se stesso. Segnalare a due
    // renderebbe il controllo rumoroso proprio dove la duplicazione è ancora
    // la scelta giusta.
    expect(formeDuplicate([
      forma('src/a.jsx', 'x', "{ gap: 8 }"),
      forma('src/b.jsx', 'y', "{ gap: 8 }"),
    ])).toEqual([]);
  });

  it('conta i FILE e non le occorrenze: due copie nello stesso file non bastano', () => {
    expect(formeDuplicate([
      forma('src/a.jsx', 'x', "{ gap: 8 }"),
      forma('src/a.jsx', 'y', "{ gap: 8 }"),
      forma('src/b.jsx', 'z', "{ gap: 8 }"),
    ])).toEqual([]);
  });

  it('SOLLEVA se non ha trovato nessuna costante', () => {
    // Il caso che conta: un\'estrazione rotta produrrebbe zero costanti, e
    // zero costanti danno zero duplicati — cioè un controllo verde che non
    // sta controllando niente.
    expect(() => formeDuplicate([])).toThrow(LetturaFallita);
  });
});

describe('formeGiaInComune', () => {
  const comuni = [{ nome: 'rowCenterGap8', valore: "{ display: 'flex', gap: 8 }" }];

  it('segnala chi riscrive una forma già promossa', () => {
    const scoperte = formeGiaInComune(
      [{ path: 'src/x/stili.js', nome: 'rowCenterGap8', valore: "{ display: 'flex', gap: 8 }" }],
      comuni,
    );
    expect(scoperte).toHaveLength(1);
    expect(scoperte[0]).toContain('stiliComuni.rowCenterGap8');
  });

  it('non guarda il nome ma il valore', () => {
    // Stesso nome e valore diverso è legittimo (i file importano il namespace,
    // quindi non c\'è ombreggiamento): è il caso di 122 costanti dell\'app.
    expect(formeGiaInComune(
      [{ path: 'src/x.jsx', nome: 'rowCenterGap8', valore: "{ display: 'flex', gap: 8, marginTop: 4 }" }],
      comuni,
    )).toEqual([]);
  });

  it('SOLLEVA se common.js non ha prodotto niente', () => {
    expect(() => formeGiaInComune([{ path: 'src/x.jsx', nome: 'a', valore: '{}' }], []))
      .toThrow(LetturaFallita);
  });
});
