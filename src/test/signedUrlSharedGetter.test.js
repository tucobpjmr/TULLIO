// M-3 dell'audit del 14 agosto — Users.getAvatarUrl, Messages.getFileUrl e
// TaskFiles.getFileUrl condividevano lo stesso corpo (leggi la cache, chiama
// createSignedUrl, scrivi in cache con un margine di 5 minuti sul TTL di 1h),
// scritto tre volte con lo stesso bucket cambiato a mano ogni volta. Ora le
// tre passano dalla stessa fabbrica (creaSignedUrlGetter, lib/api.js). Questo
// file verifica che il comportamento osservabile sia rimasto lo stesso per
// tutte e tre — bucket giusto, cache che funziona, margine di scadenza — e
// non solo che il codice sia più corto.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createSignedUrlMock = vi.fn();

vi.mock("../lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn((bucket) => ({
        createSignedUrl: (path, ttl) => createSignedUrlMock(bucket, path, ttl),
      })),
    },
  },
}));

const { Users, Messages, TaskFiles } = await import("../lib/api.js");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-14T12:00:00Z"));
  createSignedUrlMock.mockResolvedValue({ data: { signedUrl: "https://firmata.example/x" }, error: null });
});

afterEach(() => { vi.useRealTimers(); });

describe("i tre getter firmano dal bucket giusto", () => {
  it("Users.getAvatarUrl chiama il bucket 'avatars'", async () => {
    await Users.getAvatarUrl("u1/avatar.jpg");
    expect(createSignedUrlMock).toHaveBeenCalledWith("avatars", "u1/avatar.jpg", 60 * 60);
  });

  it("Messages.getFileUrl chiama il bucket 'chat-files'", async () => {
    await Messages.getFileUrl("conv1/file.pdf");
    expect(createSignedUrlMock).toHaveBeenCalledWith("chat-files", "conv1/file.pdf", 60 * 60);
  });

  it("TaskFiles.getFileUrl chiama il bucket 'task-files'", async () => {
    await TaskFiles.getFileUrl("task1/file.pdf");
    expect(createSignedUrlMock).toHaveBeenCalledWith("task-files", "task1/file.pdf", 60 * 60);
  });
});

describe("Users.getAvatarUrl — i due formati storici non generalizzano nella fabbrica", () => {
  it("un data URI passa invariato, senza chiamare lo storage", async () => {
    const dataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const { url, error } = await Users.getAvatarUrl(dataUri);
    expect(url).toBe(dataUri);
    expect(error).toBeNull();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("una public URL http passa invariata, senza chiamare lo storage", async () => {
    const httpUrl = "https://vmxvnxsqfisucugcpqlc.supabase.co/storage/v1/object/public/avatars/x/avatar.jpg";
    const { url } = await Users.getAvatarUrl(httpUrl);
    expect(url).toBe(httpUrl);
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("un valore assente non chiama lo storage", async () => {
    const { url, error } = await Users.getAvatarUrl(null);
    expect(url).toBeNull();
    expect(error).toBeNull();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });
});

describe("cache in memoria — un secondo click sullo stesso path non rifirma", () => {
  it("Messages.getFileUrl non richiama lo storage entro la finestra di cache", async () => {
    const prima = await Messages.getFileUrl("conv1/a.pdf");
    const dopo = await Messages.getFileUrl("conv1/a.pdf");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(dopo.url).toBe(prima.url);
  });

  it("TaskFiles.getFileUrl e Messages.getFileUrl con path uguale sono cache indipendenti solo se i bucket lo sono: qui condividono la Map di proposito", async () => {
    // La cache è condivisa fra chat e task (stessa Map, per scelta — vedi il
    // commento su signedUrlCache in lib/api.js): un path che per coincidenza
    // fosse identico su entrambi i bucket riuserebbe la voce già in cache
    // SENZA richiamare lo storage per il secondo. Non è una svista di questo
    // refactor: la condivisione esisteva già prima, qui si verifica solo che
    // sia sopravvissuta intatta al passaggio alla fabbrica comune.
    await TaskFiles.getFileUrl("stesso/path.pdf");
    await Messages.getFileUrl("stesso/path.pdf");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it("un path vuoto non chiama lo storage per nessuno dei tre", async () => {
    await Messages.getFileUrl(null);
    await TaskFiles.getFileUrl(undefined);
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });
});

describe("il margine di scadenza — la cache scade 5 minuti PRIMA del TTL reale", () => {
  it("un secondo giro appena sotto il margine è ancora un hit di cache", async () => {
    await TaskFiles.getFileUrl("task9/doc.pdf");
    // TTL 60min, margine 5min → la cache dichiara scaduto a 55min. Un minuto
    // prima (54min59s) deve essere ancora un hit.
    vi.advanceTimersByTime(54 * 60 * 1000 + 59 * 1000);
    await TaskFiles.getFileUrl("task9/doc.pdf");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it("un secondo giro appena sopra il margine richiama lo storage — non aspetta il TTL reale", async () => {
    await TaskFiles.getFileUrl("task9/doc2.pdf");
    // Un secondo oltre i 55min dichiarati: qui il difetto che il margine
    // previene si manifesterebbe come un 400 dal bucket se si fidasse invece
    // del TTL pieno di 60min.
    vi.advanceTimersByTime(55 * 60 * 1000 + 1000);
    await TaskFiles.getFileUrl("task9/doc2.pdf");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(2);
  });
});

describe("un fallimento della signed URL non va in cache", () => {
  it("un errore non viene memorizzato: il tentativo successivo richiama lo storage", async () => {
    createSignedUrlMock.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    const primo = await Messages.getFileUrl("conv2/x.pdf");
    expect(primo.url).toBeNull();
    expect(primo.error).toMatchObject({ message: "denied" });

    createSignedUrlMock.mockResolvedValueOnce({ data: { signedUrl: "https://firmata.example/y" }, error: null });
    const secondo = await Messages.getFileUrl("conv2/x.pdf");
    expect(secondo.url).toBe("https://firmata.example/y");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(2);
  });
});
