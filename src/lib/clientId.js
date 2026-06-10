// src/lib/clientId.js
// Step L: ogni tab ottiene un UUID stabile per la sessione, salvato in
// sessionStorage (sopravvive ai reload, scompare con la chiusura del tab).
// Le mutation lo allegano in payload.origin_client; i subscriber realtime
// scartano gli eventi che riconoscono come propri, eliminando il flash di
// re-render dopo l'update ottimistico (caveat #5).

const KEY = 'vd_client_id';

function makeUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4 (browser molto vecchi). In pratica mai usato.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached = null;

export function getClientId() {
  if (cached) return cached;
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = makeUuid();
      sessionStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    // sessionStorage disabilitato (es. iframe sandboxed). Genero in-memory.
    cached = makeUuid();
    return cached;
  }
}
