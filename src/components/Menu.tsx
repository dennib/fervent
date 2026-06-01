import React, { useState } from "react";
import type { MenuMode } from "../types";

const ICON_ST = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const MENU_ITEMS = [
  { key: "dash",     label: "Pannello",      svg: <svg width="17" height="17" viewBox="0 0 17 17" {...ICON_ST}><rect x="2" y="2" width="5.5" height="5.5" rx="1.4" /><rect x="9.5" y="2" width="5.5" height="5.5" rx="1.4" /><rect x="2" y="9.5" width="5.5" height="5.5" rx="1.4" /><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.4" /></svg> },
  { key: "trend",    label: "Storico",       svg: <svg width="17" height="17" viewBox="0 0 17 17" {...ICON_ST}><path d="M1.5 9.5h3l2-5 3 8 2-5h4" /></svg> },
  { key: "alert",    label: "Avvisi",        svg: <svg width="17" height="17" viewBox="0 0 17 17" {...ICON_ST}><path d="M8.5 2.5L15 14H2z" /><path d="M8.5 7v3" /><circle cx="8.5" cy="11.6" r="0.2" /></svg> },
  { key: "fans",     label: "Ventole",       svg: <svg width="17" height="17" viewBox="0 0 17 17" {...ICON_ST}><path d="M2.5 5h9M13 5h2M2 12h2M6 12h9" /><circle cx="12" cy="5" r="1.6" /><circle cx="4.5" cy="12" r="1.6" /></svg> },
  { key: "settings", label: "Impostazioni",  sep: true, svg: <svg width="17" height="17" viewBox="0 0 17 17" {...ICON_ST}><circle cx="8.5" cy="8.5" r="2.4" /><path d="M8.5 1.5v2M8.5 13.5v2M1.5 8.5h2M13.5 8.5h2M3.5 3.5l1.4 1.4M12.1 12.1l1.4 1.4M13.5 3.5l-1.4 1.4M4.9 12.1l-1.4 1.4" /></svg> },
];

const GLASS: React.CSSProperties = {
  background: "rgba(8,12,20,0.66)",
  backdropFilter: "blur(26px) saturate(160%)",
  WebkitBackdropFilter: "blur(26px) saturate(160%)",
  border: "0.5px solid rgba(255,255,255,0.16)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 12px 36px rgba(0,0,0,0.3)",
};

function IconBtn({ item, active }: { item: typeof MENU_ITEMS[0]; active: boolean }) {
  return (
    <div title={item.label} style={{
      width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
      color: active ? "#fff" : "rgba(255,255,255,0.72)",
      background: active ? "rgba(255,255,255,0.16)" : "transparent",
      boxShadow: active ? "inset 0 0 0 0.5px rgba(255,255,255,0.25)" : "none",
      transition: "background .15s, color .15s", cursor: "pointer",
    }}>{item.svg}</div>
  );
}

export function Menu({ mode }: { mode: MenuMode }) {
  const [open, setOpen] = useState(false);

  if (mode === "alto") {
    return (
      <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 5, display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 24, ...GLASS }}>
        {MENU_ITEMS.map((it, i) => (
          <React.Fragment key={it.key}>
            {it.sep && <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.14)", margin: "0 3px" }} />}
            <IconBtn item={it} active={i === 0} />
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (mode === "scomparsa") {
    return (
      <div style={{ position: "absolute", top: 22, right: 88, zIndex: 6 }}>
        <button onClick={() => setOpen((o) => !o)} aria-label="Menu" style={{
          width: 36, height: 24, padding: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
          borderRadius: 9, cursor: "pointer", color: "rgba(255,255,255,0.85)", ...GLASS,
        }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 15, height: 1.6, borderRadius: 2, background: "currentColor" }} />)}
        </button>
        {open && (
          <div style={{
            position: "absolute", top: 32, right: 0, zIndex: 7, minWidth: 178, padding: 6, borderRadius: 14,
            background: "rgba(8,12,20,0.84)", backdropFilter: "blur(28px) saturate(160%)",
            WebkitBackdropFilter: "blur(28px) saturate(160%)",
            border: "0.5px solid rgba(255,255,255,0.16)", boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            {MENU_ITEMS.map((it, i) => (
              <React.Fragment key={it.key}>
                {it.sep && <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 8px" }} />}
                <div style={{
                  display: "flex", alignItems: "center", gap: 11, padding: "8px 10px", borderRadius: 9,
                  background: i === 0 ? "rgba(255,255,255,0.12)" : "transparent",
                  color: i === 0 ? "#fff" : "rgba(255,255,255,0.82)",
                  fontFamily: '-apple-system, "Helvetica Neue", sans-serif', fontSize: 13, cursor: "pointer",
                }}>
                  <span style={{ display: "flex" }}>{it.svg}</span>{it.label}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    );
  }

  // default: vertical left rail
  return (
    <div style={{
      position: "absolute", left: 18, top: 86, width: 52, zIndex: 4,
      borderRadius: 26, padding: "12px 8px", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 10, ...GLASS,
    }}>
      {MENU_ITEMS.map((it, i) => (
        <React.Fragment key={it.key}>
          {it.sep && <div style={{ width: 18, height: 1, background: "rgba(255,255,255,0.12)", margin: "2px 0" }} />}
          <IconBtn item={it} active={i === 0} />
        </React.Fragment>
      ))}
    </div>
  );
}
