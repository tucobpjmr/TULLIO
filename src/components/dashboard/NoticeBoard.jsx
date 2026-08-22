// ─── NOTICE BOARD ────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useMemo } from "react";
import { useViewport } from "../Viewport.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { canEditNotice } from "../../lib/permissions.js";
import { NoticeEditorModal } from "../modals/NoticeEditorModal.jsx";
import { MentionText } from "../ui/MentionText.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { Z } from "../../styles/tokens.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { dataBreve } from "../../lib/dates.js";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF11Bold, boxF16R4, gridGap16, marginLeft2, padding2, rowAbsoluteGap2, rowCenterBetween,
  rowCenterGap5, rowCenterGap6, rowCenterGap62, rowCenterMiddle, rowGap4Mt8, txtAbsoluteF18,
  txtBold, txtF10Bold, txtF13TxtCenter, txtF17Bold, txtFlex1F13,
} from "./noticeBoardStyles.js";

// v2.8: emoji disponibili per le reazioni rapide sui post-it.
// Tenuto basso (6) per non rompere il layout del post-it. Stesso shape della chat.
const NOTICE_REACTION_EMOJI = ["👍", "❤️", "🎉", "👀", "🔥", "✅"];

// `loading` (criticità #6): la bacheca è il canale con cui l'agenzia comunica
// "leggi questo prima di lavorare". Dire "Nessun avviso in bacheca" prima di
// aver caricato gli avvisi invita a saltare esattamente ciò che non si è
// ancora visto.
export const NoticeBoard = ({ notices, dispatch, loading = false }) => {
  const conferma = useConfirm();
  const { team, getMember, currentUserId } = useAppData();
  const [editing, setEditing] = useState(null); // null | { id?, text, color }
  const [creating, setCreating] = useState(false);
  // v2.8: filtro per tag (Set di tag attivi; vuoto = mostra tutto).
  // Modalità OR: un post-it visibile se ha almeno un tag tra quelli attivi.
  const [activeTags, setActiveTags] = useState(new Set());
  // v2.8: id del post-it con picker reazioni aperto (null = nessuno).
  const [reactingId, setReactingId] = useState(null);
  const { isMobile } = useViewport();

  // Tutti i tag in uso (dedup), ordinati per frequenza decrescente.
  // Dipende solo dal corpus: si ricostruisce quando arrivano avvisi nuovi,
  // non quando si apre l'editor o si tocca un filtro.
  const allTags = useMemo(() => {
    const count = new Map();
    for (const n of notices) {
      for (const t of (n.tags || [])) count.set(t, (count.get(t) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [notices]);

  const toggleTag = (t) => {
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  // Filtro + ordinamento (pinned in alto, poi per data).
  // activeTags è un Set ricreato a ogni toggle, quindi funziona come dipendenza.
  const sorted = useMemo(() => [...notices]
    .filter(n => activeTags.size === 0 || (n.tags || []).some(t => activeTags.has(t)))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    }), [notices, activeTags]);

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "ora";
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} g fa`;
    return dataBreve(iso);
  };

  return (
    <div style={{
      background: "linear-gradient(180deg, #faf5e6 0%, #f5efd9 100%)",
      backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 23px, rgba(139,90,43,0.04) 23px, rgba(139,90,43,0.04) 24px), repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(139,90,43,0.03) 23px, rgba(139,90,43,0.03) 24px)",
      backgroundColor: "#faf5e6",
      border: "1px solid #d4c08a",
      borderRadius: 12, padding: isMobile ? "14px 12px 16px" : "18px 22px 22px",
      boxShadow: "inset 0 2px 6px rgba(139,90,43,0.1), 0 2px 10px rgba(0,0,0,0.05)",
      minWidth: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={rowCenterBetween}>
        <div style={stiliComuni.rowCenterGap10}>
          <div style={rowCenterMiddle}>📌</div>
          <div>
            <div className="playfair" style={txtF17Bold}>
              Bacheca avvisi
            </div>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={rowCenterGap5}
        >
          + Nuovo avviso
        </button>
      </div>

      {/* Filtro tag (v2.8): visibile solo se ci sono tag in uso */}
      {allTags.length > 0 && (
        <div style={rowCenterGap6}>
          <span style={txtF10Bold}>
            Tag:
          </span>
          {allTags.map(t => {
            const on = activeTags.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                style={{
                  border: `1px solid ${on ? "var(--navy)" : "rgba(139,90,43,0.3)"}`,
                  background: on ? "var(--navy)" : "rgba(255,255,255,0.5)",
                  color: on ? "#fff" : "#5d4920",
                  padding: "3px 10px", borderRadius: 999,
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  cursor: "pointer", transition: "background 0.15s, color 0.15s",
                }}
              >#{t}</button>
            );
          })}
          {activeTags.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveTags(new Set())}
              style={boxF11Bold}
            >azzera</button>
          )}
        </div>
      )}

      {/* Board */}
      {loading && notices.length === 0 ? (
        <div style={padding2}>
          <SkeletonCards count={3} minWidth={240} compact label="Caricamento della bacheca" />
        </div>
      ) : sorted.length === 0 ? (
        <div style={txtF13TxtCenter}>
          ✨ Nessun avviso in bacheca. Clicca "+ Nuovo avviso" per pubblicarne uno.
        </div>
      ) : (
        <div style={gridGap16}>
          {sorted.map((n) => {
            const author = getMember(n.author);
            // A-1 dell'audit del 14 agosto: la RLS nega update/delete/pin a
            // chi non è l'autore né un manager/admin (canEditNotice rispecchia
            // esattamente quella policy). Prima i tre pulsanti comparivano su
            // OGNI avviso: chi non era autore vedeva il reducer applicare
            // l'azione in ottimistico, poi la scrittura fallire lato server —
            // due toast contraddittori sullo stesso gesto. Nascondere il
            // pulsante non sostituisce guard/rollback (è una scelta di
            // layout, non un controllo), ma senza di esso l'utente prova
            // un'azione che il database rifiuterà sempre.
            const modificabile = canEditNotice(team, n, currentUserId);
            const rotation = ((n.id.charCodeAt(n.id.length - 1) % 5) - 2) * 0.7; // -1.4 a +1.4 deg
            return (
              <div
                key={n.id}
                style={{
                  background: n.color,
                  padding: "14px 14px 12px",
                  borderRadius: 4,
                  position: "relative",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                  transform: `rotate(${rotation}deg)`,
                  transition: "transform 0.2s, box-shadow 0.2s",
                  minHeight: 130,
                  display: "flex", flexDirection: "column",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "rotate(0deg) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.15), 0 2px 5px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                  e.currentTarget.style.boxShadow = "0 3px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)";
                }}
              >
                {/* Pin in alto */}
                {n.pinned && (
                  <div style={txtAbsoluteF18}>📌</div>
                )}

                {/* Toolbar actions. La reazione resta a chiunque (v2.8: è
                    puramente locale, nessuna RPC — TOGGLE_NOTICE_REACTION è
                    in NON_PERSISTITE_OGGI di persistenceGuards.test.js);
                    pin/modifica/elimina solo a chi la RLS lo concederebbe. */}
                <div style={rowAbsoluteGap2}>
                  <button
                    onClick={() => setReactingId(reactingId === n.id ? null : n.id)}
                    title="Reagisci"
                    style={noticeBtnStyle}
                  >😀</button>
                  {modificabile && (
                    <>
                      <button
                        onClick={() => dispatch({ type: "TOGGLE_PIN_NOTICE", payload: n.id })}
                        title={n.pinned ? "Rimuovi pin" : "Fissa in alto"}
                        style={noticeBtnStyle}
                      >{n.pinned ? "📍" : "📌"}</button>
                      <button
                        onClick={() => setEditing({ id: n.id, text: n.text, color: n.color, pinned: n.pinned, tags: n.tags })}
                        title="Modifica"
                        style={noticeBtnStyle}
                      >✏️</button>
                      <button
                        onClick={async () => {
                          if (await conferma({ title: "Eliminare questo avviso?", cta: "Elimina", danger: true })) {
                            dispatch({ type: "DELETE_NOTICE", payload: n.id });
                          }
                        }}
                        title="Elimina"
                        style={noticeBtnStyle}
                      >✕</button>
                    </>
                  )}
                </div>

                {/* Picker reazioni (v2.8): si apre cliccando 😀 */}
                {reactingId === n.id && (
                  <div
                    style={{
                      position: "absolute", top: 32, right: 6,
                      display: "flex", gap: 2,
                      background: "rgba(255,255,255,0.95)",
                      border: "1px solid rgba(139,90,43,0.3)",
                      borderRadius: 999, padding: "3px 6px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                      zIndex: Z.stickyNote,
                    }}
                  >
                    {NOTICE_REACTION_EMOJI.map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          dispatch({ type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: n.id, emoji: em } });
                          setReactingId(null);
                        }}
                        style={boxF16R4}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(15,32,68,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                      >{em}</button>
                    ))}
                  </div>
                )}

                {/* Testo avviso (con @menzioni evidenziate) */}
                <div style={txtFlex1F13}>
                  <MentionText text={n.text} />
                </div>

                {/* Chip riassuntive reazioni (v2.8): click toggla la mia reazione */}
                {n.reactions && Object.keys(n.reactions).length > 0 && (
                  <div style={rowGap4Mt8}>
                    {Object.entries(n.reactions).map(([em, users]) => {
                      if (!Array.isArray(users) || users.length === 0) return null;
                      const mine = users.includes(currentUserId);
                      return (
                        <button
                          key={em}
                          type="button"
                          onClick={() => dispatch({ type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: n.id, emoji: em } })}
                          title={users.map(u => getMember(u)?.name || u).join(", ")}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            background: mine ? "rgba(15,32,68,0.85)" : "rgba(255,255,255,0.6)",
                            color: mine ? "#fff" : "#3d2f10",
                            border: `1px solid ${mine ? "var(--navy)" : "rgba(139,90,43,0.3)"}`,
                            padding: "1px 7px", borderRadius: 999,
                            fontSize: 11, fontWeight: 600,
                            cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4,
                          }}
                        >
                          <span>{em}</span>
                          <span>{users.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Tag chips (v2.8) */}
                {Array.isArray(n.tags) && n.tags.length > 0 && (
                  <div style={rowGap4Mt8}>
                    {n.tags.map(t => (
                      <span
                        key={t}
                        onClick={(e) => { e.stopPropagation(); toggleTag(t); }}
                        style={{
                          fontSize: 10, fontWeight: 600,
                          color: activeTags.has(t) ? "#fff" : "#5d4920",
                          background: activeTags.has(t) ? "rgba(15,32,68,0.85)" : "rgba(255,255,255,0.55)",
                          padding: "1px 7px", borderRadius: 999, cursor: "pointer",
                          border: "1px solid rgba(139,90,43,0.25)",
                        }}
                        title={`Filtra per #${t}`}
                      >#{t}</span>
                    ))}
                  </div>
                )}

                {/* Footer: autore + data */}
                <div style={rowCenterGap62}>
                  {author && (
                    <>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", background: author.color,
                        color: "#fff", fontSize: 8, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{author.avatar}</div>
                      <span style={txtBold}>{author.name.split(" ")[0]}</span>
                    </>
                  )}
                  <span style={marginLeft2}>{formatRel(n.updatedAt || n.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <NoticeEditorModal
          notice={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          // A-4 · Ritorna la promise del dispatch e NON chiude: chi chiude è la
          // modale, che è anche l'unica a sapere se ha ancora dati da
          // proteggere (`useSalvataggio` in NoticeEditorModal). Prima qui si
          // dispatchava senza `await` e si chiudeva nello stesso turno, quindi
          // su un rifiuto della RLS l'avviso digitato se ne andava con la
          // modale — stesso difetto di `ClientiView.handleSave` prima di M-1.
          //
          // `crypto.randomUUID()` e non `"n" + Date.now()`: la entry del
          // registry normalizza comunque gli id non-UUID (`persistence.js`),
          // ma generarlo già nella forma giusta toglie di mezzo la domanda —
          // come fa `ClientiView` per i clienti.
          onSave={(data) => (editing
            ? dispatch({ type: "UPDATE_NOTICE", payload: { id: editing.id, ...data } })
            : dispatch({
              type: "ADD_NOTICE",
              payload: {
                id: crypto.randomUUID(),
                ...data,
                author: currentUserId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }))}
        />
      )}
    </div>
  );
};

const noticeBtnStyle = {
  background: "rgba(255,255,255,0.6)", border: "none", borderRadius: 4,
  width: 22, height: 22, cursor: "pointer", fontSize: 11,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, lineHeight: 1,
};
