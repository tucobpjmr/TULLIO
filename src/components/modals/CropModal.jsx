// ─── CROP AVATAR ─────────────────────────────────────────────────────────────
// Estratto da ProfileEditor.jsx: era il secondo componente del file, e da solo
// valeva 150 righe di logica canvas che con il form del profilo non ha niente a
// che vedere. Qui dentro resta anche `dataUrlToBlob`, che è l'inverso esatto di
// ciò che questo componente produce (toDataURL JPEG) e fuori da qui non ha senso.
import { useState, useRef } from "react";
import { Z } from "../../styles/tokens.js";

// Converte un data-URL (prodotto dal crop canvas) in Blob per l'upload sul
// bucket 'avatars'. Il crop emette sempre JPEG (toDataURL("image/jpeg")).
export const dataUrlToBlob = (dataUrl) => {
  const [head, b64] = String(dataUrl).split(",");
  const mime = head.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

// ─── CROP MODAL ───────────────────────────────────────────────────────────────
const PREVIEW = 280;
const OUTPUT = 256;

export const CropModal = ({ src, onConfirm, onCancel }) => {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  const baseScale = Math.max(PREVIEW / imgSize.w, PREVIEW / imgSize.h);
  const totalScale = baseScale * zoom;

  const clamp = (raw, ts) => {
    const maxX = Math.max(0, (imgSize.w * ts - PREVIEW) / 2);
    const maxY = Math.max(0, (imgSize.h * ts - PREVIEW) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, raw.x)), y: Math.max(-maxY, Math.min(maxY, raw.y)) };
  };

  const handleLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const startDrag = (mx, my) => { drag.current = { mx, my, ox: offset.x, oy: offset.y }; };
  const moveDrag = (mx, my) => {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + mx - drag.current.mx, y: drag.current.oy + my - drag.current.my }, totalScale));
  };
  const endDrag = () => { drag.current = null; };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    canvas.width = OUTPUT; canvas.height = OUTPUT;
    const srcX = imgSize.w / 2 - (PREVIEW / 2 + offset.x) / totalScale;
    const srcY = imgSize.h / 2 - (PREVIEW / 2 + offset.y) / totalScale;
    const srcW = PREVIEW / totalScale;
    const srcH = PREVIEW / totalScale;
    ctx.clearRect(0, 0, OUTPUT, OUTPUT);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT, OUTPUT);
    onConfirm(canvas.toDataURL("image/jpeg", 0.92));
  };

  const imgL = PREVIEW / 2 + offset.x - (imgSize.w * totalScale) / 2;
  const imgT = PREVIEW / 2 + offset.y - (imgSize.h * totalScale) / 2;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: Z.modalFullBackdrop }} />
      {/* Centratura con inset:0 + margin:auto invece di translate(-50%,-50%):
          un transform != none renderebbe questa card containing block per i
          discendenti position:fixed, che si posizionerebbero rispetto alla card
          invece che allo schermo (vedi ui/ModalPortal.jsx per il meccanismo e
          i casi in cui si è manifestato). Qui oggi non ci sono fixed annidati,
          ma il crop è la card in cui è più probabile che ne arrivino. */}
      <div style={{
        position: "fixed", inset: 0, margin: "auto", height: "fit-content",
        background: "var(--card)", borderRadius: 16, zIndex: Z.modalFull,
        padding: "22px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        width: 330, maxWidth: "calc(100vw - 32px)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", alignSelf: "flex-start" }}>Ritaglia foto</div>

        {/* Circular crop preview */}
        <div
          onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onMouseMove={e => moveDrag(e.clientX, e.clientY)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={e => { const t = e.touches[0]; startDrag(t.clientX, t.clientY); }}
          onTouchMove={e => { const t = e.touches[0]; moveDrag(t.clientX, t.clientY); }}
          onTouchEnd={endDrag}
          style={{
            width: PREVIEW, height: PREVIEW, borderRadius: "50%", overflow: "hidden",
            position: "relative", cursor: "grab", userSelect: "none",
            border: "3px solid var(--gold)", boxShadow: "0 0 0 5px rgba(212,168,67,0.18)",
            flexShrink: 0,
          }}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={handleLoad}
            draggable={false}
            style={{
              position: "absolute",
              width: imgSize.w * totalScale,
              height: imgSize.h * totalScale,
              left: imgL, top: imgT,
              pointerEvents: "none", userSelect: "none",
            }}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>
            <span>ZOOM</span><span>{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range" min={100} max={300} value={Math.round(zoom * 100)}
            onChange={e => {
              const z = parseInt(e.target.value) / 100;
              const ts = baseScale * z;
              setZoom(z);
              setOffset(prev => clamp(prev, ts));
            }}
            style={{ width: "100%", cursor: "pointer", accentColor: "var(--gold)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
            <span>1×</span><span>3×</span>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Trascina per centrare • usa lo slider per zoomare</div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button onClick={onCancel} style={{
            flex: 1, background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)",
            padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}>Annulla</button>
          <button onClick={handleConfirm} style={{
            flex: 1, background: "var(--navy)", color: "#fff", border: "none",
            padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
          }}>✓ Conferma</button>
        </div>
      </div>
    </>
  );
};
