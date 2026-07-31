// Web Push — stato reale della sottoscrizione e riparazione automatica.
// Il bug che questi test presidiano: su iPhone la sottoscrizione muore da sola
// (aggiornamento della PWA, app scaricata da iOS) o la Edge Function cancella
// la riga dopo un 410. Il browser continua però a esporre una subscription,
// quindi senza il controllo sul DB il toggle resta verde mentre nessun push
// viene più recapitato.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const Push = {
  getVapidPublicKey: vi.fn(async () => ({ data: "QUJD", error: null })),
  save: vi.fn(async () => ({ error: null })),
  findByEndpoint: vi.fn(async () => ({ data: { id: "r1" }, error: null })),
  removeByEndpoint: vi.fn(async () => ({ error: null })),
  sendTest: vi.fn(async () => ({ error: null })),
};
vi.mock("../lib/api.js", () => ({ Push }));

const ENDPOINT = "https://web.push.apple.com/abc";

const makeSub = (endpoint = ENDPOINT) => ({
  endpoint,
  toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn(async () => true),
});

// Finto ambiente browser con service worker + PushManager.
function setupBrowser({ permission = "granted", subscription = makeSub() } = {}) {
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async () => makeSub("https://web.push.apple.com/nuovo")),
  };
  const registration = { pushManager };
  globalThis.navigator.serviceWorker = {
    ready: Promise.resolve(registration),
    getRegistration: vi.fn(async () => registration),
  };
  globalThis.Notification = { permission, requestPermission: vi.fn(async () => permission) };
  globalThis.PushManager = function () {};
  return { pushManager };
}

let push;
beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.resetModules();
  push = await import("../lib/push.js");
});
afterEach(() => {
  delete globalThis.navigator.serviceWorker;
  delete globalThis.Notification;
  delete globalThis.PushManager;
});

describe("getPushState", () => {
  it("segnala synced quando la riga esiste anche sul DB", async () => {
    setupBrowser();
    const s = await push.getPushState("u1");
    expect(s).toMatchObject({ supported: true, enabled: true, synced: true });
    expect(Push.findByEndpoint).toHaveBeenCalledWith("u1", ENDPOINT);
  });

  it("enabled ma NON synced quando il server non ha più la sottoscrizione", async () => {
    setupBrowser();
    Push.findByEndpoint.mockResolvedValueOnce({ data: null, error: null });
    const s = await push.getPushState("u1");
    expect(s.enabled).toBe(true);
    expect(s.synced).toBe(false);
  });

  it("un errore di rete non declassa lo stato a non sincronizzato", async () => {
    setupBrowser();
    Push.findByEndpoint.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    const s = await push.getPushState("u1");
    expect(s.synced).toBe(true);
  });
});

describe("syncPushSubscription", () => {
  it("non fa nulla se l'utente non ha mai attivato le push su questo dispositivo", async () => {
    setupBrowser();
    const r = await push.syncPushSubscription("u1");
    expect(r).toMatchObject({ error: "opt-out", repaired: false });
    expect(Push.save).not.toHaveBeenCalled();
  });

  it("non fa nulla senza permesso concesso (niente prompt fuori da un gesto utente)", async () => {
    setupBrowser({ permission: "default" });
    localStorage.setItem("vd:push-intent", "on");
    const r = await push.syncPushSubscription("u1");
    expect(r.error).toBe("permission");
    expect(Push.save).not.toHaveBeenCalled();
  });

  it("riscrive la riga quando la sottoscrizione locale è ancora valida", async () => {
    setupBrowser();
    localStorage.setItem("vd:push-intent", "on");
    const r = await push.syncPushSubscription("u1");
    expect(r).toMatchObject({ error: null, repaired: true });
    expect(Push.save).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "u1", endpoint: ENDPOINT, p256dh: "p", auth: "a",
    }));
  });

  it("ri-sottoscrive quando iOS ha buttato via la sottoscrizione", async () => {
    const { pushManager } = setupBrowser({ subscription: null });
    localStorage.setItem("vd:push-intent", "on");
    const r = await push.syncPushSubscription("u1");
    expect(pushManager.subscribe).toHaveBeenCalled();
    expect(r.repaired).toBe(true);
    expect(Push.save).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "https://web.push.apple.com/nuovo",
    }));
  });
});

describe("intenzione dell'utente", () => {
  it("enablePush la memorizza, disablePush la cancella", async () => {
    setupBrowser({ subscription: null });
    await push.enablePush("u1");
    expect(localStorage.getItem("vd:push-intent")).toBe("on");

    setupBrowser();
    await push.disablePush();
    expect(localStorage.getItem("vd:push-intent")).toBe(null);
    expect(Push.removeByEndpoint).toHaveBeenCalledWith(ENDPOINT);
  });

  it("dopo un disablePush la sincronizzazione resta un no-op", async () => {
    setupBrowser();
    await push.disablePush();
    const r = await push.syncPushSubscription("u1");
    expect(r.error).toBe("opt-out");
    expect(Push.save).not.toHaveBeenCalled();
  });
});
