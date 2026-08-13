// Risoluzione della sorgente di un avatar (S-10).
//
// Dalla migrazione 20260806180000 il bucket `avatars` è privato: un avatar
// caricato lì è salvato come PATH e va convertito in signed URL. I due formati
// storici — data URI base64 (le uniche foto realmente presenti quando la
// migrazione è stata fatta) e public URL http — devono continuare a
// funzionare senza toccare la rete, altrimenti il passaggio a bucket privato
// avrebbe richiesto una migrazione dei dati e avrebbe rotto le foto esistenti.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

const getAvatarUrl = vi.fn();
vi.mock("../lib/api.js", () => ({
  Users: { getAvatarUrl: (...a) => getAvatarUrl(...a) },
}));

const { AvatarImg } = await import("../components/ui/AvatarImg.jsx");

beforeEach(() => {
  getAvatarUrl.mockReset();
  getAvatarUrl.mockResolvedValue({ url: "https://firmata.example/avatar.jpg", error: null });
});

describe("AvatarImg — formati storici, nessuna richiesta di rete", () => {
  it("usa direttamente un data URI, senza chiedere una signed URL", () => {
    const dataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    render(<AvatarImg photo={dataUri} alt="foto" />);
    // Sincrono: nessun frame con l'immagine assente, che su decine di avatar
    // per schermata sarebbe un lampeggio visibile.
    expect(screen.getByAltText("foto")).toHaveAttribute("src", dataUri);
    expect(getAvatarUrl).not.toHaveBeenCalled();
  });

  it("usa direttamente una public URL http già salvata", () => {
    const url = "https://vmxvnxsqfisucugcpqlc.supabase.co/storage/v1/object/public/avatars/x/avatar.jpg";
    render(<AvatarImg photo={url} alt="foto" />);
    expect(screen.getByAltText("foto")).toHaveAttribute("src", url);
    expect(getAvatarUrl).not.toHaveBeenCalled();
  });
});

describe("AvatarImg — path del bucket privato", () => {
  it("risolve il path in una signed URL", async () => {
    render(<AvatarImg photo="abc-123/avatar.jpg" alt="foto" />);
    await waitFor(() => expect(screen.getByAltText("foto")).toBeInTheDocument());
    expect(screen.getByAltText("foto")).toHaveAttribute("src", "https://firmata.example/avatar.jpg");
    expect(getAvatarUrl).toHaveBeenCalledWith("abc-123/avatar.jpg");
  });

  it("non renderizza nulla se la signed URL non si ottiene", async () => {
    getAvatarUrl.mockResolvedValue({ url: null, error: { message: "denied" } });
    const { container } = render(<AvatarImg photo="abc-123/avatar.jpg" alt="foto" />);
    await waitFor(() => expect(getAvatarUrl).toHaveBeenCalled());
    expect(container.querySelector("img")).toBeNull();
  });

  it("non esplode se la promessa viene rifiutata", async () => {
    getAvatarUrl.mockRejectedValue(new Error("rete assente"));
    const { container } = render(<AvatarImg photo="abc-123/avatar.jpg" alt="foto" />);
    await waitFor(() => expect(getAvatarUrl).toHaveBeenCalled());
    expect(container.querySelector("img")).toBeNull();
  });

  it("senza foto non chiede nulla e non renderizza nulla", () => {
    const { container } = render(<AvatarImg photo={null} alt="foto" />);
    expect(container.querySelector("img")).toBeNull();
    expect(getAvatarUrl).not.toHaveBeenCalled();
  });
});
