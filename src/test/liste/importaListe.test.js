// src/test/importaListe.test.js
// Test del convertitore delle liste viaggio storiche
// (scripts/importa-liste/): è lo strumento con cui ~600 documenti Word/Writer
// entrano nel modulo Liste. Un errore di parsing qui diventa un saldo cliente
// sbagliato in produzione, quindi i casi coperti sono quelli che cambiano il
// segno o l'importo di un movimento, non la formattazione.
import { describe, it, expect } from 'vitest';
import {
  analizzaLista,
  costruisciBackup,
  clienteDaNomeFile,
  chiaveCliente,
  estraiData,
  estraiImporto,
  estraiMetodo,
  aNumero,
  uuidv5,
  contaSimboliValuta,
} from '../../../scripts/importa-liste/parser.js';
import { estraiTesto } from '../../../scripts/importa-liste/estrattore.js';

describe('estraiData', () => {
  it('legge le date italiane con anno a due o quattro cifre', () => {
    expect(estraiData('18/10/24 TIZIO').iso).toBe('2024-10-18');
    expect(estraiData('22/10/2024 CAIO').iso).toBe('2024-10-22');
    expect(estraiData('2.4.2026 SEMPRONIO').iso).toBe('2026-04-02');
    expect(estraiData('02-04-26 X').iso).toBe('2026-04-02');
  });

  it('restituisce il resto della riga senza la data', () => {
    expect(estraiData('18/10/24 CARRIERO MICHELE').resto).toBe('CARRIERO MICHELE');
  });

  it('rifiuta date impossibili e righe che non iniziano con una data', () => {
    expect(estraiData('31/02/2026 X')).toBeNull();
    expect(estraiData('45/13/2026 X')).toBeNull();
    expect(estraiData('SALDO 100,00')).toBeNull();
  });
});

describe('aNumero', () => {
  it('interpreta il punto come separatore di migliaia solo su gruppi di tre cifre', () => {
    expect(aNumero('1.250,00')).toBe(1250);
    expect(aNumero('1.250')).toBe(1250);
    expect(aNumero('200,00')).toBe(200);
    expect(aNumero('1.25')).toBe(1.25);
    expect(aNumero('500')).toBe(500);
  });
});

describe('estraiImporto', () => {
  it('legge l\'importo dopo il simbolo di valuta', () => {
    expect(estraiImporto('CARRIERO MICHELE € 200,00').valore).toBe(200);
  });

  it('legge l\'importo prima del simbolo di valuta', () => {
    expect(estraiImporto('CARRIERO MICHELE 200,00 €').valore).toBe(200);
  });

  it('riconosce il segno meno sia prima sia dopo il simbolo', () => {
    expect(estraiImporto('PRENOTAZIONE - € 400,00').valore).toBe(-400);
    expect(estraiImporto('PRENOTAZIONE € -400,00').valore).toBe(-400);
  });

  it('accetta EURO/EUR come simbolo', () => {
    expect(estraiImporto('ACCONTO EURO 150,00').valore).toBe(150);
    expect(estraiImporto('ACCONTO 150,00 EUR').valore).toBe(150);
  });

  it('senza simbolo accetta solo un importo con i centesimi a fine riga, e lo segnala', () => {
    const r = estraiImporto('MARIO ROSSI 200,00');
    expect(r.valore).toBe(200);
    expect(r.conSimbolo).toBe(false);
    expect(estraiImporto('VOLO PER 2 PERSONE')).toBeNull();
  });

  it('toglie l\'importo dal testo, lasciando la descrizione', () => {
    expect(estraiImporto('CARRIERO MICHELE € 200,00 POS').testoRipulito).toBe('CARRIERO MICHELE POS');
  });
});

describe('contaSimboliValuta', () => {
  it('conta EURO/EUR come €', () => {
    expect(contaSimboliValuta('ACCONTO EURO 100,00')).toBe(1);
    expect(contaSimboliValuta('A € 100,00 B EUR 50,00')).toBe(2);
    expect(contaSimboliValuta('MARIO ROSSI 200,00')).toBe(0);
  });
});

describe('estraiMetodo', () => {
  it('mappa le diciture sui valori ammessi dalla colonna metodo', () => {
    expect(estraiMetodo('CARRIERO MICHELE POS').metodo).toBe('pos');
    expect(estraiMetodo('PAGATO IN CONTANTI').metodo).toBe('contanti');
    expect(estraiMetodo('ASSEGNO N. 12').metodo).toBe('assegno');
    expect(estraiMetodo('BONIFICO IN BNL').metodo).toBe('bonifico');
    expect(estraiMetodo('ACCONTO VIAGGIO').metodo).toBeNull();
  });

  it('toglie il metodo dalla descrizione solo se è l\'ultima parola', () => {
    expect(estraiMetodo('CARRIERO MICHELE POS').descrizione).toBe('CARRIERO MICHELE');
    // Qui "BONIFICO" è parte della frase: toglierlo lascerebbe una
    // descrizione monca ("IN BNL DA CARRIERO MARIA GRAZIA").
    expect(estraiMetodo('BONIFICO IN BNL DA CARRIERO MARIA GRAZIA').descrizione)
      .toBe('BONIFICO IN BNL DA CARRIERO MARIA GRAZIA');
  });
});

describe('clienteDaNomeFile', () => {
  it('toglie i prefissi di servizio dal nome del file', () => {
    expect(clienteDaNomeFile('LISTA_ANGELO_BELMONTE.odt')).toBe('ANGELO BELMONTE');
    expect(clienteDaNomeFile('BUONO_CASTELLANO_MARIA.docx')).toBe('CASTELLANO MARIA');
    expect(clienteDaNomeFile('lista viaggio di Rossi Mario.doc')).toBe('ROSSI MARIO');
    expect(clienteDaNomeFile('BUONI_VERDI_ANNA_copia.odt')).toBe('VERDI ANNA');
  });

  it('non svuota mai il nome, anche su file chiamati solo "lista"', () => {
    expect(clienteDaNomeFile('LISTA.odt')).toBe('LISTA');
  });
});

describe('chiaveCliente', () => {
  it('fonde le varianti di punteggiatura, spazi e accenti', () => {
    expect(chiaveCliente('Rossi, Mario')).toBe(chiaveCliente('ROSSI  MARIO'));
    expect(chiaveCliente('Nicolò Bruno')).toBe('NICOLO BRUNO');
  });

  it('non riordina le parole: due omonimi invertiti restano clienti distinti', () => {
    expect(chiaveCliente('ROSSI MARIO')).not.toBe(chiaveCliente('MARIO ROSSI'));
  });
});

describe('analizzaLista', () => {
  it('legge una lista completa: entrate, uscita e marcatore di chiusura', () => {
    const testo = [
      '18/10/24 CARRIERO MICHELE € 200,00 POS',
      '22/10/2024 BONIFICO IN BNL DA CARRIERO MARIA GRAZIA € 200,00',
      '26/05/26 PRENOTAZIONI EXPEDIA VARSAVIA E CRACOVIA - € 400,00',
      'LISTA ESAURITA',
    ].join('\n');
    const r = analizzaLista('LISTA_ANGELO_BELMONTE.odt', testo);

    expect(r.cliente).toBe('ANGELO BELMONTE');
    expect(r.esaurita).toBe(true);
    expect(r.saldo).toBe(0);
    expect(r.movimenti).toHaveLength(3);
    expect(r.movimenti[2]).toMatchObject({
      data: '2026-05-26',
      descrizione: 'PRENOTAZIONI EXPEDIA VARSAVIA E CRACOVIA',
      importo: -400,
    });
    expect(r.avvisi).toEqual([]);
  });

  it('ignora i totali scritti a mano invece di sommarli due volte', () => {
    const r = analizzaLista('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 300,00\nTOTALE € 300,00');
    expect(r.movimenti).toHaveLength(1);
    expect(r.saldo).toBe(300);
    expect(r.avvisi.join(' ')).toMatch(/ignorata come totale/);
  });

  it('non scambia per marcatore una riga datata che comincia con la stessa parola', () => {
    const r = analizzaLista('LISTA_ROSSI.odt', '01/02/2026 CHIUSA PRATICA AGENZIA € 50,00');
    expect(r.esaurita).toBe(false);
    expect(r.movimenti).toHaveLength(1);
  });

  it('eredita la data dalla riga precedente e lo segnala', () => {
    const r = analizzaLista('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 100,00\nSALDO VIAGGIO PARIGI € 200,00');
    expect(r.movimenti).toHaveLength(1); // la seconda riga comincia con SALDO → totale
    const r2 = analizzaLista('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 100,00\nVERSAMENTO ZIA € 50,00');
    expect(r2.movimenti).toHaveLength(2);
    expect(r2.movimenti[1].data).toBe('2026-02-01');
    expect(r2.avvisi.join(' ')).toMatch(/data assente/);
  });

  it('non perde le righe illeggibili: le raccoglie per il report e le note', () => {
    const r = analizzaLista('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 100,00\nvedi foglio allegato del ragioniere');
    expect(r.movimenti).toHaveLength(1);
    expect(r.righeNonRiconosciute).toHaveLength(1);
    expect(r.righeNonRiconosciute[0].riga).toContain('foglio allegato');
  });

  it('segnala una lista esaurita che non torna a zero', () => {
    const r = analizzaLista('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 100,00\nLISTA ESAURITA');
    expect(r.avvisi.join(' ')).toMatch(/ESAURITA ma il saldo calcolato/);
  });

  it('segnala il saldo negativo', () => {
    const r = analizzaLista('LISTA_ROSSI.odt', '01/02/2026 VOLO - € 100,00');
    expect(r.avvisi.join(' ')).toMatch(/saldo negativo/);
  });

  // estraiImporto prende solo l'ULTIMO simbolo € sulla riga: senza questo
  // controllo, una riga con due movimenti scritti di fila perderebbe il
  // primo importo in silenzio (resterebbe incollato, testo e cifre, dentro
  // la descrizione del secondo). Va sempre segnalata, mai indovinata.
  it('non fonde due movimenti scritti sulla stessa riga: li segnala invece di indovinare', () => {
    const r = analizzaLista(
      'LISTA_ROSSI.odt',
      '18/10/24 CARRIERO MICHELE € 200,00 POS ROSSI ANNA € 150,00 CONTANTI',
    );
    expect(r.movimenti).toHaveLength(0);
    expect(r.righeNonRiconosciute).toHaveLength(1);
    expect(r.righeNonRiconosciute[0].motivo).toMatch(/più movimenti/);
    expect(r.avvisi.join(' ')).toMatch(/1 riga\/e non riconosciuta/);
  });

  it('non fonde un doppio totale sulla stessa riga: lo segnala comunque, non tenta di sommarlo', () => {
    const r = analizzaLista('LISTA_ROSSI.odt', 'PARZIALE € 50,00 TOTALE € 100,00');
    expect(r.movimenti).toHaveLength(0);
    expect(r.righeIgnorate.some((x) => x.motivo === 'totale/saldo riepilogativo')).toBe(true);
  });

  it('una riga con un solo simbolo € resta un movimento normale (nessun falso positivo)', () => {
    const r = analizzaLista('LISTA_ROSSI.odt', '01/02/2026 ACCONTO VIAGGIO EGITTO € 300,00 BONIFICO');
    expect(r.movimenti).toHaveLength(1);
    expect(r.movimenti[0].importo).toBe(300);
  });
});

describe('costruisciBackup', () => {
  const analisi = (nomeFile, testo) => ({
    percorso: nomeFile,
    nomeFile,
    ...analizzaLista(nomeFile, testo),
  });

  it('produce il payload che la UI accetta da "Carica backup"', () => {
    const b = costruisciBackup([analisi('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 100,00')]);
    expect(b.app).toBe('liste-viaggio');
    expect(Array.isArray(b.liste)).toBe(true);
    expect(b.clients).toHaveLength(1);
    expect(b.movimenti[0].lista_id).toBe(b.liste[0].id);
    expect(b.liste[0].client_id).toBe(b.clients[0].id);
  });

  it('riusa il cliente già in anagrafica invece di crearne un doppione', () => {
    const esistenti = new Map([[chiaveCliente('ROSSI MARIO'), 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee']]);
    const b = costruisciBackup([analisi('LISTA_ROSSI_MARIO.odt', '01/02/2026 ACCONTO € 100,00')], esistenti);
    expect(b.clients).toHaveLength(0);
    expect(b.liste[0].client_id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(b._riepilogo.clienti_riusati).toBe(1);
  });

  it('accorpa sotto un solo cliente più file dello stesso intestatario, distinguendo le liste per titolo', () => {
    const b = costruisciBackup([
      analisi('LISTA_ROSSI_MARIO.odt', '01/02/2026 ACCONTO € 100,00'),
      analisi('LISTA_ROSSI_MARIO_2025.odt', '01/03/2026 ACCONTO € 50,00'),
    ]);
    expect(b.clients).toHaveLength(1);
    expect(b.liste[0].client_id).toBe(b.liste[1].client_id);
    expect(b.liste.map((l) => l.titolo)).toEqual(['LISTA_ROSSI_MARIO', 'LISTA_ROSSI_MARIO_2025']);
  });

  it('genera id stabili: rigenerare e ricaricare non duplica nulla', () => {
    const fatti = () => costruisciBackup([analisi('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 100,00')]);
    const a = fatti();
    const b = fatti();
    expect(a.liste[0].id).toBe(b.liste[0].id);
    expect(a.movimenti[0].id).toBe(b.movimenti[0].id);
    expect(a.clients[0].id).toBe(b.clients[0].id);
  });

  it('riporta nelle note interne le righe non importate', () => {
    const b = costruisciBackup([analisi('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 100,00\nvedi foglio allegato')]);
    expect(b.liste[0].note).toContain('Importato da: LISTA_ROSSI.odt');
    expect(b.liste[0].note).toContain('vedi foglio allegato');
  });

  it('marca esaurita la lista chiusa e ne valorizza closed_at', () => {
    const b = costruisciBackup([analisi('LISTA_ROSSI.odt', '01/02/2026 ACCONTO € 100,00\n01/03/2026 VOLO - € 100,00\nLISTA ESAURITA')]);
    expect(b.liste[0].stato).toBe('esaurita');
    expect(b.liste[0].closed_at).toBe('2026-03-01T09:00:00.000Z');
  });
});

describe('uuidv5', () => {
  it('rispetta il vettore di prova RFC 4122 (namespace DNS, "www.example.com")', () => {
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'))
      .toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });
});

describe('estraiTesto', () => {
  it('segnala i .doc legacy invece di saltarli in silenzio', () => {
    const ole = Buffer.alloc(16);
    ole.writeUInt32BE(0xd0cf11e0, 0);
    const r = estraiTesto('LISTA_ROSSI.doc', ole);
    expect(r.testo).toBeNull();
    expect(r.errore).toMatch(/legacy/);
  });

  it('segnala le estensioni non gestite', () => {
    expect(estraiTesto('LISTA_ROSSI.pages', Buffer.from('x')).errore).toMatch(/non gestita/);
  });

  it('legge un .txt in ANSI senza storpiare gli accenti', () => {
    const ansi = Buffer.from('01/02/2026 CAFF\xC8 \x80 10,00', 'latin1');
    const { testo } = estraiTesto('LISTA_ROSSI.txt', ansi);
    expect(testo).toContain('CAFFÈ');
  });
});
