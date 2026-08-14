import { describe, it, expect } from "vitest";
import { fileKindFromName, MAX_FILE_SIZE, formatFileSize } from "../components/chat/chatFiles.js";

describe("fileKindFromName", () => {
  it("classifies known extensions", () => {
    expect(fileKindFromName("report.pdf")).toBe("pdf");
    expect(fileKindFromName("foto.JPG")).toBe("img");
    expect(fileKindFromName("listino.xlsx")).toBe("xls");
    expect(fileKindFromName("contratto.docx")).toBe("doc");
  });

  it("falls back to default for unknown extensions", () => {
    expect(fileKindFromName("qualcosa.xyz")).toBe("default");
  });

  it("non classifica .svg come immagine (B-4: nessun bucket lo accetta)", () => {
    expect(fileKindFromName("logo.svg")).toBe("default");
  });
});

describe("MAX_FILE_SIZE", () => {
  it("is 25 MB (coerente col bucket chat-files)", () => {
    expect(MAX_FILE_SIZE).toBe(25 * 1024 * 1024);
  });
});

describe("formatFileSize", () => {
  it("formats numbers via fileUtils", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("passes through already-formatted strings", () => {
    expect(formatFileSize("245 KB")).toBe("245 KB");
    expect(formatFileSize(undefined)).toBe("");
  });
});
