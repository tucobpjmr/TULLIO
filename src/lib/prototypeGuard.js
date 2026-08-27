// src/lib/prototypeGuard.js
// Sorveglianza dei prototipi intrinseci attorno a un blocco di codice.
//
// PERCHÉ È UN FILE A SÉ (A-1 dell'audit sicurezza del 26 agosto). Viveva in
// `lib/xlsx.js` come mitigazione della Prototype Pollution di SheetJS
// (GHSA-4r6h-8v6p-xvw6), avvolta attorno al parse. Da questo commit il parse
// non avviene più in questo realm — gira in `xlsxWorker.js`, che viene
// terminato subito dopo — e la funzione ha cambiato lavoro: sorveglia il
// PASSAGGIO DI CONFINE, cioè il codice del thread principale che itera nomi di
// chiave provenienti da un file altrui (vedi `righeSicure` in `lib/xlsx.js`).
//
// È il motivo per cui non è stata cancellata insieme al vecchio percorso: la
// domanda che risponde — «questo blocco ha toccato Object/Array/Function
// .prototype?» — non era specifica di SheetJS, e il punto in cui serve si è
// spostato invece di sparire.
//
// COSA NON FA. Non impedisce la pollution: la RILEVA subito dopo. Su un parse
// era una distinzione che pesava (un gadget si innesca durante, non dopo); sul
// blocco che sorveglia adesso — poche righe di codice nostro, sincrone e senza
// callback esterne — non c'è un "durante" in cui qualcosa possa agire.

/** @type {Array<[string, object]>} */
const PROTOTIPI_SORVEGLIATI = [
  ["Object", Object.prototype],
  ["Array", Array.prototype],
  ["Function", Function.prototype],
];

// Identità del DESCRITTORE, non solo presenza del nome: `toString` che passa
// da una funzione a un'altra è pollution quanto `__proto__` aggiunto — CWE-1321
// copre entrambi i casi, quindi la sorveglianza deve farlo anche lei. Si
// confronta `value` per riferimento (è ciò che cambia in una sovrascrittura)
// insieme a get/set, che sono l'altra forma con cui si inietta un accessor.
/**
 * @param {object} proto
 * @returns {Map<string, [unknown, unknown, unknown]>}
 */
const impronta = (proto) => {
  const m = new Map();
  for (const k of Object.getOwnPropertyNames(proto)) {
    const d = Object.getOwnPropertyDescriptor(proto, k);
    m.set(k, [d?.value, d?.get, d?.set]);
  }
  return m;
};

export const withPrototypePollutionGuard = (fn) => {
  const prima = PROTOTIPI_SORVEGLIATI.map(([nome, proto]) => [nome, proto, impronta(proto)]);
  const result = fn();
  const alterate = [];
  for (const [nome, proto, snap] of prima) {
    const dopo = impronta(proto);
    for (const [k, v] of dopo) {
      const p = snap.get(k);
      const uguale = p && p[0] === v[0] && p[1] === v[1] && p[2] === v[2];
      if (uguale) continue;
      alterate.push({ nome, chiave: k, nuova: !snap.has(k), proto });
    }
  }
  if (alterate.length) {
    // Si ripulisce SOLO ciò che è stato aggiunto: ripristinare un descrittore
    // sovrascritto lascerebbe credere che l'ambiente sia tornato sano, e non
    // lo è — l'unica risposta onesta è rifiutare il file e dire di ricaricare.
    for (const a of alterate) {
      if (a.nuova) { try { delete a.proto[a.chiave]; } catch { /* prototype congelato: già inerte */ } }
    }
    const sovrascritte = alterate.some((a) => !a.nuova);
    throw new Error(
      "File rifiutato: rilevato tentativo di prototype pollution ("
      + alterate.map((a) => `${a.nome}.prototype.${a.chiave}`).join(", ") + ")."
      + (sovrascritte ? " Ricarica la pagina prima di continuare." : "")
    );
  }
  return result;
};
