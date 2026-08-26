import "@testing-library/jest-dom";

// A-1 dell'audit sicurezza del 26 agosto · `Worker` nell'ambiente di test.
//
// Da quel rilievo SheetJS gira solo dentro `src/lib/xlsxWorker.js`, un Web
// Worker creato e terminato per ogni file (il perché sta in testa a quel
// modulo). jsdom non implementa `Worker`, quindi senza questo import ogni
// test che tocchi anche solo indirettamente un import di file — montare
// `ClientImportModal`, `ImportTab`, il pannello Admin — fallirebbe con un
// timeout di `waitFor`, cioè con il sintomo più lontano possibile dalla causa.
//
// Sta QUI e non nei singoli file di test di proposito. Metterlo caso per caso
// significherebbe che il prossimo test a montare uno di quei componenti
// sbatte contro lo stesso muro e deve indovinare da solo la riga da
// aggiungere; e soprattutto la via d'uscita più ovvia per chi non la trova
// sarebbe dare a `lib/xlsx.js` un ripiego in-process «solo per i test» — cioè
// rimettere la libreria vulnerabile nel realm che tiene la sessione, che è
// esattamente la proprietà che il worker esiste per garantire. L'ambiente di
// test si allinea al browser; non è il codice a scendere al livello di jsdom.
import "@vitest/web-worker";
