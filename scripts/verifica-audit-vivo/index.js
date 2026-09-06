#!/usr/bin/env node
// scripts/verifica-audit-vivo/index.js
//
// M-2 dell'audit del 5 settembre. `audit_log` a zero righe è compatibile con
// «nessuno ha fatto niente di registrabile» e con «i trigger hanno smesso di
// scrivere», e nessun controllo esistente distingueva i due casi. Questa
// sonda scrive davvero — un cliente di prova, un UPDATE — attraverso la RPC
// public.sonda_audit_clients_update() (supabase/migrations/
// 20260905130000_audit_clients_update.sql), che verifica che
// trg_audit_clients_update abbia registrato la modifica e poi annulla tutto
// con un rollback interno: nessuna riga sopravvive alla chiamata.
//
//   npm run verifica:audit-vivo
//
// Legge RLS_TEST_URL / RLS_TEST_ANON_KEY e una delle coppie email/password
// già usate da src/test/integration/rls.test.js e da .github/workflows/
// rls.yml — va bene una qualunque: la RPC gira SECURITY DEFINER e il suo
// esito non dipende dal ruolo di chi la chiama, solo da un login valido.
//
// Uscita: 0 se il trigger ha scritto esattamente una riga, 1 se ha scritto
// un numero diverso da uno (silenzio o duplicazione), 2 per un errore di
// setup (credenziali mancanti, login fallito, RPC assente/rifiutata) — la
// stessa distinzione fra "scarto reale" e "verifica inconcludente" di
// scripts/verifica-rpc/sonda.js.

async function accedi(base, anonKey, email, password) {
  const r = await fetch(`${base.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    const motivo = corpo?.error_description || corpo?.msg || `HTTP ${r.status}`;
    throw new Error(`login fallito (${email}): ${motivo}`);
  }
  return corpo.access_token;
}

async function main() {
  const base = process.env.RLS_TEST_URL;
  const anonKey = process.env.RLS_TEST_ANON_KEY;
  const email = process.env.RLS_TEST_JUNIOR_EMAIL;
  const password = process.env.RLS_TEST_JUNIOR_PASSWORD;
  if (!base || !anonKey || !email || !password) {
    console.error(
      'Mancano RLS_TEST_URL / RLS_TEST_ANON_KEY / RLS_TEST_JUNIOR_EMAIL / ' +
      'RLS_TEST_JUNIOR_PASSWORD: stesse credenziali di .github/workflows/rls.yml.'
    );
    process.exit(2);
  }

  const token = await accedi(base, anonKey, email, password);

  const r = await fetch(`${base.replace(/\/$/, '')}/rest/v1/rpc/sonda_audit_clients_update`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const corpo = await r.json().catch(() => null);

  if (!r.ok) {
    console.error(`RPC sonda_audit_clients_update rifiutata (HTTP ${r.status}): ${JSON.stringify(corpo)}`);
    console.error('Verifica inconcludente: probabile migrazione 20260905130000 non applicata.');
    process.exit(2);
  }

  if (corpo === 1) {
    console.log('✓ audit_clients_update: il trigger ha registrato la modifica di prova (1 riga).');
    process.exit(0);
  }

  console.error(`✗ audit_clients_update: attese 1 riga in audit_log, trovate ${corpo}.`);
  console.error(
    corpo === 0
      ? '  Il trigger su clients (UPDATE) non ha scritto: audit_log a zero righe'
      : '  Più righe del previsto: la sonda ha trovato residui di un giro precedente'
  );
  console.error('  non significa più "nessuno ha modificato un cliente".');
  process.exit(1);
}

main().catch((e) => {
  console.error(`Errore imprevisto durante la verifica: ${e.stack || e.message}`);
  process.exit(2);
});
