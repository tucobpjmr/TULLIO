import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MAX_TASK_FILE_SIZE,
  formatFileSize, fileIcon, isWithinSizeLimit, sourceBadge, mediaKind,
  scaricaBlob,
} from "../lib/fileUtils.js";

describe("formatFileSize", () => {
  it("returns empty string for invalid input", () => {
    expect(formatFileSize(null)).toBe("");
    expect(formatFileSize(undefined)).toBe("");
    expect(formatFileSize(NaN)).toBe("");
    expect(formatFileSize(-5)).toBe("");
  });

  it("formats bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats KB", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(50 * 1024)).toBe("50 KB");
  });

  it("formats MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(25 * 1024 * 1024)).toBe("25 MB");
  });
});

describe("MAX_TASK_FILE_SIZE", () => {
  it("is 50 MB (coerente col bucket task-files)", () => {
    expect(MAX_TASK_FILE_SIZE).toBe(50 * 1024 * 1024);
  });
});

describe("mediaKind", () => {
  it("classifies by mime-type", () => {
    expect(mediaKind("image/png")).toBe("image");
    expect(mediaKind("video/mp4")).toBe("video");
    expect(mediaKind("audio/mpeg")).toBe("audio");
  });

  it("classifies by extension", () => {
    expect(mediaKind("foto.JPG")).toBe("image");
    expect(mediaKind("clip.MP4")).toBe("video");
    expect(mediaKind("nota.m4a")).toBe("audio");
  });

  it("returns null for non-previewable types", () => {
    expect(mediaKind("application/pdf")).toBe(null);
    expect(mediaKind("contratto.docx")).toBe(null);
    expect(mediaKind("")).toBe(null);
  });

  it("non classifica .svg come immagine per estensione (B-4: nessun bucket lo accetta)", () => {
    expect(mediaKind("logo.svg")).toBe(null);
  });
});

describe("fileIcon", () => {
  it("maps by mime-type", () => {
    expect(fileIcon("image/png")).toBe("🖼️");
    expect(fileIcon("video/mp4")).toBe("🎬");
    expect(fileIcon("audio/mpeg")).toBe("🎵");
    expect(fileIcon("application/pdf")).toBe("📕");
  });

  it("maps by extension", () => {
    expect(fileIcon("foto.JPG")).toBe("🖼️");
    expect(fileIcon("contratto.docx")).toBe("📘");
    expect(fileIcon("listino.xlsx")).toBe("📗");
    expect(fileIcon("export.csv")).toBe("📗");
    expect(fileIcon("backup.zip")).toBe("🗜️");
  });

  it("falls back to paperclip", () => {
    expect(fileIcon("")).toBe("📎");
    expect(fileIcon("qualcosa.xyz")).toBe("📎");
  });

  it("non promette un'anteprima per .svg per estensione (B-4: nessun bucket lo accetta)", () => {
    expect(fileIcon("logo.svg")).toBe("📎");
  });
});

describe("isWithinSizeLimit", () => {
  it("accepts sizes at or below the limit", () => {
    expect(isWithinSizeLimit(0)).toBe(true);
    expect(isWithinSizeLimit(MAX_TASK_FILE_SIZE)).toBe(true);
    expect(isWithinSizeLimit(1024)).toBe(true);
  });

  it("rejects oversize or invalid", () => {
    expect(isWithinSizeLimit(MAX_TASK_FILE_SIZE + 1)).toBe(false);
    expect(isWithinSizeLimit(-1)).toBe(false);
    expect(isWithinSizeLimit("100")).toBe(false);
  });

  it("respects a custom max", () => {
    expect(isWithinSizeLimit(2000, 1000)).toBe(false);
    expect(isWithinSizeLimit(500, 1000)).toBe(true);
  });
});

describe("sourceBadge", () => {
  it("returns label only for external sources", () => {
    expect(sourceBadge("upload")).toBe("");
    expect(sourceBadge(undefined)).toBe("");
    expect(sourceBadge("onedrive")).toBe("☁️ OneDrive");
    expect(sourceBadge("whatsapp")).toBe("🟢 WhatsApp");
  });
});

// M-3 dell'audit del 14 agosto (secondo passaggio): erano tre copie dello
// stesso corpo, e avevano già smesso di coincidere — questo file blinda
// l'unica implementazione rimasta, in particolare il margine prima della
// revoca (il dettaglio su cui la terza copia divergeva).
describe("scaricaBlob", () => {
  let createSpy, revokeSpy, clickSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("crea l'anchor con l'URL e il filename giusti, e clicca", () => {
    const blob = new Blob(["ciao"], { type: "text/plain" });
    scaricaBlob(blob, "report.txt");

    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("NON revoca l'object URL nello stesso tick (la revoca immediata rompe il download su Safari/iOS)", () => {
    scaricaBlob(new Blob(["x"]), "f.txt");
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  it("revoca l'object URL dopo 500ms", () => {
    scaricaBlob(new Blob(["x"]), "f.txt");
    vi.advanceTimersByTime(499);
    expect(revokeSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
  });
});
