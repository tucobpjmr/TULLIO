// ─── CROP AVATAR ─────────────────────────────────────────────────────────────
// Estratto da ProfileEditor.jsx: era il secondo componente del file, e da solo
// valeva 150 righe di logica canvas che con il form del profilo non ha niente a
// che vedere. Qui dentro resta anche `dataUrlToBlob`, che è l'inverso esatto di
// ciò che questo componente produce (toDataURL JPEG) e fuori da qui non ha senso.
import { useState, useRef } from "react";
import { Modal } from "../ui/Modal.jsx";
import { hidden, txtF11Muted } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF15Bold = { fontSize: 15, fontWeight: 700, color: "var(--text)", alignSelf: "flex-start" };
const colGap5WFull = { width: "100%", display: "flex", flexDirection: "column", gap: 5 };
const rowBetweenF10 = { display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 };
const wFull = { width: "100%", cursor: "pointer", accentColor: "var(--gold)" };
const rowBetweenF102 = { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" };
const rowGap10WFull = { display: "flex", gap: 10, width: "100%" };
const boxFlex1F13 = {
  flex: 1, background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)",
  padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
};
const boxFlex1F132 = {
  flex: 1, background: "var(--navy)", color: "#fff", border: "none",
  padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
};

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

  // `layer="modalFull"`: il ritaglio si apre DA ProfileEditor (layer `modal`) e
  // deve scavalcarlo, non finirci sotto. `closeOnOverlay={false}`: qui si
  // trascina l'immagine per centrarla e il gesto finisce spesso col rilascio
  // fuori dalla card — chiudere lì butterebbe via il ritaglio in corso.
  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="vd-crop-title"
      layer="modalFull"
      width={330}
      closeOnOverlay={false}
      cardStyle={{
        borderRadius: 16, padding: "22px 20px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      }}
    >
      <div id="vd-crop-title" style={txtF15Bold}>Ritaglia foto</div>

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
      <div style={colGap5WFull}>
        <div style={rowBetweenF10}>
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
          style={wFull}
        />
        <div style={rowBetweenF102}>
          <span>1×</span><span>3×</span>
        </div>
      </div>

      <div style={txtF11Muted}>Trascina per centrare • usa lo slider per zoomare</div>

      <canvas ref={canvasRef} style={hidden} />

      <div style={rowGap10WFull}>
        <button onClick={onCancel} style={boxFlex1F13}>Annulla</button>
        <button onClick={handleConfirm} style={boxFlex1F132}>✓ Conferma</button>
      </div>
    </Modal>
  );
};
