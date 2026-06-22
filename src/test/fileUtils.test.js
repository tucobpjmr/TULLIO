import { describe, it, expect } from "vitest";
import {
  MAX_TASK_FILE_SIZE,
  formatFileSize, fileIcon, isWithinSizeLimit, sourceBadge,
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
