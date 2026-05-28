import { useState, useEffect } from "react";

// ─── STORAGE ABSTRACTION ─────────────────────────────────────────────────────
// Swap this implementation for Firebase later without touching the rest of the app

const Storage = {
  async getConfig() {
    try {
      const r = await window.storage.get("cube:config");
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  },
  async setConfig(config) {
    try { await window.storage.set("cube:config", JSON.stringify(config)); }
    catch {}
  },
  async getCards() {
    try {
      const r = await window.storage.get("cube:cards");
      return r ? JSON.parse(r.value) : [];
    } catch { return []; }
  },
  async setCards(cards) {
    try { await window.storage.set("cube:cards", JSON.stringify(cards)); }
    catch {}
  },
  async getTagDB() {
    try {
      const r = await window.storage.get("cube:tagdb");
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  },
  async setTagDB(tagDB) {
    try { await window.storage.set("cube:tagdb", JSON.stringify(tagDB)); }
    catch {}
  },
};



const NAV_ITEMS = ["Home", "Guilds", "Cards"];
const CUBE_SIZES = [360, 480, 540, 720];
const COLORLESS_MIN  = { 360: 10, 480: 20, 540: 20, 720: 40 };
const COLORLESS_BASE = { 360: 30, 480: 40, 540: 40, 720: 60 };
const COLORLESS_MAX  = { 360: 50, 480: 60, 540: 60, 720: 80 };
const MAIN_ARCH_PER_GUILD = { 360: 2, 480: 2, 540: 3, 720: 4 };
const TRIBAL_PER_COLOR    = { 360: 1, 480: 1, 540: 2, 720: 2 };
const REMOVAL_RATIO = { W: 2/12, U: 2/12, B: 2/12, R: 2/12, G: 2/12 };
const DRAW_RATIO    = { W: 2/12, U: 2/12, B: 2/12, R: 2/12, G: 2/12 };

const GUILDS_LIST = [
  { name: "Azorius",  colors: "WU" },
  { name: "Dimir",    colors: "UB" },
  { name: "Rakdos",   colors: "BR" },
  { name: "Gruul",    colors: "RG" },
  { name: "Selesnya", colors: "GW" },
  { name: "Orzhov",   colors: "WB" },
  { name: "Izzet",    colors: "UR" },
  { name: "Golgari",  colors: "BG" },
  { name: "Boros",    colors: "RW" },
  { name: "Simic",    colors: "GU" },
];

const COLORS_LIST = [
  { key: "W", label: "White" },
  { key: "U", label: "Blue"  },
  { key: "B", label: "Black" },
  { key: "R", label: "Red"   },
  { key: "G", label: "Green" },
];

function getColorlessOptions(size) {
  const min = COLORLESS_MIN[size];
  const max = COLORLESS_MAX[size];
  const opts = [0];
  for (let i = min; i <= max; i += 20) opts.push(i);
  return opts;
}

function computeDistribution(size, colorless) {
  const dualLands      = Math.round(size / 120) * 10;
  const landsPerGuild  = dualLands / 10;
  const baseBicolor    = Math.round(size / 6);
  const extraBicolor   = colorless === 0 ? COLORLESS_MIN[size] : 0;
  const bicolorTotal   = baseBicolor + extraBicolor;
  const bicolorPerGuild = bicolorTotal / 10;
  const monoTotal      = size - colorless - dualLands - bicolorTotal;
  const monoPerColor   = monoTotal / 5;
  return { dualLands, landsPerGuild, bicolorTotal, bicolorPerGuild, monoTotal, monoPerColor, extraBicolor };
}

function computeAdvice(monoPerColor) {
  const perGuild = monoPerColor / 4;
  const removal  = Math.max(1, Math.round(perGuild * REMOVAL_RATIO.W));
  const draw     = Math.max(1, Math.round(perGuild * DRAW_RATIO.W));
  return { perGuild, removal, draw };
}

function createDB(name, size, colorless) {
  return { name, size, colorless, ...computeDistribution(size, colorless), updatedAt: new Date().toISOString() };
}

const MANA_STYLE = {
  W: { bg: "#f9f6e8", ring: "#c8b882", fg: "#7a6535" },
  U: { bg: "#1a6eb5", ring: "#0a4f8a", fg: "#d4eaf9" },
  B: { bg: "#1a1a1a", ring: "#555",    fg: "#cccccc" },
  R: { bg: "#d4202a", ring: "#8c1018", fg: "#ffd4a0" },
  G: { bg: "#00733e", ring: "#004d2a", fg: "#c0f0d0" },
};

function ManaIcon({ c, size = 22 }) {
  const { bg, ring, fg } = MANA_STYLE[c] || MANA_STYLE.W;
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ marginRight: 3, verticalAlign: "middle", flexShrink: 0 }}>
      <circle cx={r} cy={r} r={r - 1} fill={bg} stroke={ring} strokeWidth="1.5" />
      <text x={r} y={r + 4} textAnchor="middle" fontSize={size * 0.5}
        fontWeight="bold" fill={fg} fontFamily="'Courier New', monospace">{c}</text>
    </svg>
  );
}

const S = {
  app:     { fontFamily: "'Courier New', monospace", backgroundColor: "#000", minHeight: "100vh", color: "#fff" },
  nav:     { backgroundColor: "#333", display: "flex", alignItems: "flex-end", padding: "0 24px", gap: "4px" },
  navItem: (a) => ({
    padding: "10px 24px", cursor: "pointer", color: a ? "#fff" : "#aaa",
    backgroundColor: a ? "#000" : "transparent", borderRadius: "4px 4px 0 0",
    fontSize: "14px", letterSpacing: "0.08em", textTransform: "uppercase", userSelect: "none",
  }),
  page:     { padding: "40px 32px", maxWidth: "900px" },
  heading:  { fontSize: "22px", fontWeight: "700", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "24px" },
  divider:  { borderColor: "#222", margin: "0 0 32px 0" },
  box:      { backgroundColor: "#111", border: "1px solid #222", borderRadius: "4px", padding: "24px", marginBottom: "24px" },
  boxTitle: { fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "20px" },
  row:      { display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", flexWrap: "wrap" },
  label:    { fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: "100px" },
  input:    { backgroundColor: "#000", border: "1px solid #333", borderRadius: "4px", color: "#fff", fontSize: "13px", padding: "7px 12px", outline: "none", fontFamily: "'Courier New', monospace", minWidth: "200px" },
  select:   { backgroundColor: "#000", border: "1px solid #333", borderRadius: "4px", color: "#fff", fontSize: "13px", padding: "7px 12px", outline: "none", fontFamily: "'Courier New', monospace", cursor: "pointer" },
  table:    { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th:       { textAlign: "left", padding: "8px 12px", fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid #222" },
  td:       (bold) => ({ padding: "8px 12px", borderBottom: "1px solid #1a1a1a", color: bold ? "#fff" : "#aaa", fontWeight: bold ? "700" : "400" }),
  sectionRow: { padding: "6px 12px", fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", backgroundColor: "#0a0a0a" },
  totalRow:   { padding: "10px 12px", color: "#fff", fontWeight: "700", borderTop: "1px solid #333" },
  btn:      { backgroundColor: "transparent", color: "#fff", border: "1px solid #333", borderRadius: "4px", padding: "8px 20px", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" },
};

function HomePage({ db, setDB }) {
  const { name, size, colorless } = db;
  const dist = computeDistribution(size, colorless);
  const opts = getColorlessOptions(size);
  const { removal, draw } = computeAdvice(dist.monoPerColor);
  const mainArch = MAIN_ARCH_PER_GUILD[size];
  const tribal   = TRIBAL_PER_COLOR[size];

  const handleSizeChange = (v) => setDB(createDB(name, parseInt(v), COLORLESS_BASE[parseInt(v)]));
  const handleColorlessChange = (v) => setDB(createDB(name, size, parseInt(v)));
  const handleNameChange = (v) => setDB(createDB(v, size, colorless));

  return (
    <div style={S.page}>
      <div style={S.heading}>Cube Configuration</div>
      <hr style={S.divider} />

      <div style={S.box}>
        <div style={S.boxTitle}>Settings</div>
        <div style={S.row}>
          <span style={S.label}>Cube Name</span>
          <input style={S.input} value={name} placeholder="My Cube" onChange={e => handleNameChange(e.target.value)} />
        </div>
        <div style={S.row}>
          <span style={S.label}>Cube Size</span>
          <select style={S.select} value={size} onChange={e => handleSizeChange(e.target.value)}>
            {CUBE_SIZES.map(s => <option key={s} value={s}>{s} cards</option>)}
          </select>
          <span style={{ ...S.label, marginLeft: "16px" }}>Colorless</span>
          <select style={S.select} value={colorless} onChange={e => handleColorlessChange(e.target.value)}>
            {opts.map(v => (
              <option key={v} value={v}>
                {v === 0 ? "0 (→ bicolor +1/guild)" : v === COLORLESS_BASE[size] ? `${v} (default)` : v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={S.box}>
        <div style={S.boxTitle}>Distribution Summary</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Category</th>
              <th style={S.th}>Detail</th>
              <th style={{ ...S.th, textAlign: "right" }}>Cards</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={3} style={S.sectionRow}>
              Multicolor — {dist.bicolorPerGuild} per guild
              {dist.extraBicolor > 0 && " (+1 from colorless redistribution)"}
            </td></tr>
            {GUILDS_LIST.map(g => (
              <tr key={g.name}>
                <td style={S.td()}>{g.name}</td>
                <td style={S.td()}>
                  <span style={{ display: "inline-flex", gap: "3px", alignItems: "center" }}>
                    {g.colors.split("").map(c => <ManaIcon key={c} c={c} />)}
                  </span>
                </td>
                <td style={{ ...S.td(), textAlign: "right" }}>{dist.bicolorPerGuild}</td>
              </tr>
            ))}

            <tr><td colSpan={3} style={S.sectionRow}>Mono — {dist.monoPerColor} per color</td></tr>
            {COLORS_LIST.map(c => (
              <tr key={c.key}>
                <td style={S.td()}>{c.label}</td>
                <td style={S.td()}><ManaIcon c={c.key} /></td>
                <td style={{ ...S.td(), textAlign: "right" }}>{dist.monoPerColor}</td>
              </tr>
            ))}

            <tr><td colSpan={3} style={S.sectionRow}>Other</td></tr>
            <tr>
              <td style={S.td()}>Colorless</td>
              <td style={S.td()}>Artifacts & utility</td>
              <td style={{ ...S.td(), textAlign: "right" }}>{colorless}</td>
            </tr>
            <tr>
              <td style={S.td()}>Dual Lands</td>
              <td style={S.td()}>{dist.landsPerGuild} types × 10 guilds</td>
              <td style={{ ...S.td(), textAlign: "right" }}>{dist.dualLands}</td>
            </tr>
            <tr>
              <td style={S.totalRow}>Total</td>
              <td style={S.totalRow}></td>
              <td style={{ ...S.totalRow, textAlign: "right" }}>{size}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={S.box}>
        <div style={S.boxTitle}>Recommended Removal, Draw & Archetypes</div>
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "20px", letterSpacing: "0.06em" }}>
          Included in mono count — not additional slots. Scales with cube size.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
          {[
            { label: "Removal per color per guild", value: removal, color: "#d94a4a" },
            { label: "Draw per color per guild",    value: draw,    color: "#4a90d9" },
            { label: "Main archetypes per guild",   value: mainArch, color: "#fff" },
            { label: "Tribal archetypes per color", value: tribal,  color: "#4a9d5a" },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between",
              borderBottom: i < arr.length - 1 ? "1px solid #1a1a1a" : "none",
              paddingBottom: i < arr.length - 1 ? "10px" : "4px",
            }}>
              <span style={{ color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "12px" }}>{label}</span>
              <span style={{ color, fontWeight: "700" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GuildsPage() {
  return (
    <div style={S.page}>
      <div style={S.heading}>Guilds</div>
      <hr style={S.divider} />
      <div style={{ color: "#888", fontSize: "13px" }}>Coming soon.</div>
    </div>
  );
}

// ─── MANA COST ────────────────────────────────────────────────────────────────

const DEFAULT_TAG_DB = {
  main_archetypes:   [],
  tribal_archetypes: [],
  utility:           ["Draw", "Removal"],
};

// ─── TAG BOX ──────────────────────────────────────────────────────────────────

function TagBox({ label, selected, pool, onAdd, onRemove, onCreateTag }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");

  const filtered = pool
    .filter(t => t.toLowerCase().includes(search.toLowerCase()) && !selected.includes(t))
    .slice(0, 6);

  const exactMatch = pool.some(t => t.toLowerCase() === search.toLowerCase());
  const canCreate  = search.trim() && !exactMatch;

  function handleAdd(tag) { onAdd(tag); setSearch(""); setOpen(false); }
  function handleCreate() {
    const tag = search.trim();
    onCreateTag(tag); onAdd(tag); setSearch(""); setOpen(false);
  }

  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
      <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px", minHeight: "20px" }}>
        {selected.length === 0
          ? <span style={{ fontSize: "12px", color: "#888" }}>none</span>
          : selected.map(t => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", color: "#aaa" }}>
                {t}
                <span onClick={() => onRemove(t)} style={{ cursor: "pointer", color: "#888", fontSize: "14px", lineHeight: 1 }}>×</span>
              </span>
            ))
        }
      </div>
      <div onClick={() => setOpen(o => !o)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        <span style={{ fontSize: "14px" }}>+</span> add
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", marginTop: "4px", overflow: "hidden" }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
            placeholder="Search..."
            style={{ ...S.input, width: "100%", borderRadius: 0, border: "none", borderBottom: "1px solid #333", boxSizing: "border-box", fontSize: "12px", padding: "8px 10px" }} />
          {filtered.length === 0 && !canCreate && (
            <div style={{ padding: "8px 10px", fontSize: "12px", color: "#888" }}>No tags found.</div>
          )}
          {filtered.map(t => (
            <div key={t} onClick={() => handleAdd(t)}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#222"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              style={{ padding: "8px 10px", fontSize: "12px", color: "#aaa", cursor: "pointer" }}>{t}</div>
          ))}
          {canCreate && (
            <div onClick={handleCreate}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#222"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              style={{ padding: "8px 10px", fontSize: "12px", color: "#4a90d9", cursor: "pointer", borderTop: filtered.length ? "1px solid #222" : "none" }}>
              + Create "{search.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CARD TAGGING ─────────────────────────────────────────────────────────────

function CardTagging({ cardTags, setCardTags, tagDB, setTagDB }) {
  const add    = (cat, tag) => setCardTags(p => ({ ...p, [cat]: [...(p[cat] || []), tag] }));
  const remove = (cat, tag) => setCardTags(p => ({ ...p, [cat]: p[cat].filter(t => t !== tag) }));
  const create = (type, tag) => setTagDB(p => ({ ...p, [type]: [...p[type], tag] }));

  const sectionTitle = { fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" };
  const section = { marginBottom: "20px" };

  return (
    <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #1a1a1a" }}>
      <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>Tags</div>

      <div style={section}>
        <div style={sectionTitle}>Main Archetype</div>
        <div style={{ display: "flex", gap: "12px" }}>
          <TagBox label="Active" selected={cardTags.main_archetype} pool={tagDB.main_archetypes}
            onAdd={t => add("main_archetype", t)} onRemove={t => remove("main_archetype", t)} onCreateTag={t => create("main_archetypes", t)} />
          <TagBox label="Support" selected={cardTags.main_archetype_support} pool={tagDB.main_archetypes}
            onAdd={t => add("main_archetype_support", t)} onRemove={t => remove("main_archetype_support", t)} onCreateTag={t => create("main_archetypes", t)} />
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Tribal Archetype</div>
        <div style={{ display: "flex", gap: "12px" }}>
          <TagBox label="Active" selected={cardTags.tribal_archetype} pool={tagDB.tribal_archetypes}
            onAdd={t => add("tribal_archetype", t)} onRemove={t => remove("tribal_archetype", t)} onCreateTag={t => create("tribal_archetypes", t)} />
          <TagBox label="Support" selected={cardTags.tribal_archetype_support} pool={tagDB.tribal_archetypes}
            onAdd={t => add("tribal_archetype_support", t)} onRemove={t => remove("tribal_archetype_support", t)} onCreateTag={t => create("tribal_archetypes", t)} />
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Utility</div>
        <div style={{ display: "flex" }}>
          <TagBox label="" selected={cardTags.utility} pool={tagDB.utility}
            onAdd={t => add("utility", t)} onRemove={t => remove("utility", t)} onCreateTag={t => create("utility", t)} />
          <div style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

function ManaCost({ cost }) {
  if (!cost) return null;
  const tokens = (cost.match(/\{[^}]+\}/g) || []).map(t => t.replace(/[{}]/g, ""));
  return (
    <span style={{ display: "inline-flex", gap: "3px", alignItems: "center", flexWrap: "wrap" }}>
      {tokens.map((token, i) => {
        if (MANA_STYLE[token]) return <ManaIcon key={i} c={token} size={20} />;
        return (
          <svg key={i} width={20} height={20} viewBox="0 0 20 20"
            style={{ verticalAlign: "middle", flexShrink: 0 }}>
            <circle cx={10} cy={10} r={9} fill="#ccc" stroke="#999" strokeWidth="1.5" />
            <text x={10} y={14} textAnchor="middle" fontSize={token.length > 1 ? 7 : 10}
              fontWeight="bold" fill="#333" fontFamily="'Courier New', monospace">{token}</text>
          </svg>
        );
      })}
    </span>
  );
}

function mapCard(parsed) {
  const tl = parsed.type_line || "";
  const id = parsed.scryfall_id || "";
  const imageNormal = id ? `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg` : "";
  return {
    id,
    name:             parsed.name || "",
    set:              parsed.set  || "",
    set_name:         parsed.set_name || "",
    cube_set_override: null,
    mana_cost:        parsed.mana_cost || "",
    colors:           parsed.colors || [],
    cmc:              parsed.cmc ?? 0,
    type_line:        tl,
    types:            tl.split(" — ")[0]?.trim().split(" ").filter(Boolean) || [],
    subtypes:         tl.split(" — ")[1]?.trim().split(" ").filter(Boolean) || [],
    oracle_text:      parsed.oracle_text || "",
    power:            parsed.power ?? null,
    toughness:        parsed.toughness ?? null,
    rarity:           parsed.rarity || "",
    image_uris:       { normal: imageNormal },
    tags:             [],
  };
}

// ─── CARD PREVIEW ─────────────────────────────────────────────────────────────

function CardPreview({ card }) {
  const rarityColor = { common: "#aaa", uncommon: "#8fb4d9", rare: "#d4af37", mythic: "#e07840" };
  return (
    <div style={{ display: "flex", gap: "20px", marginTop: "20px", flexWrap: "wrap" }}>
      {card.image_uris.normal
        ? <img src={card.image_uris.normal} alt={card.name}
            style={{ width: "160px", borderRadius: "8px", flexShrink: 0, alignSelf: "flex-start" }} />
        : <div style={{
            width: "115px", height: "160px", borderRadius: "8px", flexShrink: 0,
            background: card.colors.length
              ? `linear-gradient(135deg, ${card.colors.map(c => MANA_STYLE[c]?.bg || "#333").join(", ")})`
              : "#222",
            border: "1px solid #333", display: "flex", alignItems: "center",
            justifyContent: "center", flexDirection: "column", gap: "6px"
          }}>
            {card.colors.map(c => <ManaIcon key={c} c={c} size={28} />)}
          </div>
      }
      <div style={{ flex: 1, minWidth: "180px", fontSize: "13px", color: "#ccc", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>{card.name}</div>

        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
          <ManaCost cost={card.mana_cost} />
          <span style={{ color: "#888", fontSize: "12px" }}>· CMC {card.cmc}</span>
        </div>

        <div style={{ color: "#888" }}>{card.type_line}</div>

        {card.subtypes.length > 0 && (
          <div style={{ color: "#888", fontSize: "12px" }}>Subtypes: {card.subtypes.join(", ")}</div>
        )}

        <div style={{ color: "#999", lineHeight: "1.6", whiteSpace: "pre-wrap", fontSize: "12px" }}>
          {card.oracle_text}
        </div>

        {card.power !== null && (
          <div style={{ color: "#888", fontSize: "12px" }}>{card.power} / {card.toughness}</div>
        )}

        <div style={{ color: rarityColor[card.rarity] || "#aaa", textTransform: "capitalize", fontSize: "12px" }}>
          {card.rarity} · {card.set_name} ({card.set.toUpperCase()})
        </div>
      </div>
    </div>
  );
}

// ─── ADD CARD MODAL ───────────────────────────────────────────────────────────

function AddCardModal({ onClose, onAddCard, tagDB, setTagDB }) {
  const [tab,      setTab]      = useState("single");
  const [query,    setQuery]    = useState("");
  const [card,     setCard]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errMsg,   setErrMsg]   = useState("");
  const [cardTags, setCardTags] = useState({
    main_archetype: [], main_archetype_support: [],
    tribal_archetype: [], tribal_archetype_support: [],
    utility: [],
  });

  function extractJSON(text) {
    try { return JSON.parse(text.trim()); } catch {}
    const stripped = text.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
    try { return JSON.parse(stripped); } catch {}
    let pos = 0;
    while (pos < text.length) {
      const start = text.indexOf("{", pos);
      if (start === -1) break;
      const end = text.lastIndexOf("}");
      if (end <= start) break;
      try { return JSON.parse(text.slice(start, end + 1)); } catch {}
      pos = start + 1;
    }
    return null;
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setCard(null);
    setNotFound(false);
    setErrMsg("");

    try {
      let rawText, apiData;
      try {
        const cardName = query.trim();
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: "Using your Magic: The Gathering knowledge, return a JSON object for the card \"" + cardName + "\". Fields: name, set (lowercase code), set_name, mana_cost, colors (array), cmc (number), type_line, oracle_text, power (null if not creature), toughness (null if not creature), rarity, scryfall_id. If not found set name to \"not_found\"."
            }]
          })
        });
        rawText = await res.text();
        setErrMsg("HTTP " + res.status + " | Raw: " + (rawText.slice(0, 150) || "(empty)"));
        if (!rawText) throw new Error("Empty response body, HTTP " + res.status);
        try { apiData = JSON.parse(rawText); }
        catch(parseErr) { throw new Error("Parse failed. Raw: " + rawText.slice(0, 150)); }
      } catch(err) {
        setErrMsg("Fetch error: " + err.message);
        setNotFound(true);
        return;
      }

      const raw = (apiData.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const parsed = extractJSON(raw);

      if (!parsed || !parsed.name || parsed.name === "not_found") {
        setNotFound(true);
        return;
      }

      const id = (parsed.scryfall_id && parsed.scryfall_id !== "not_found") ? parsed.scryfall_id : "";
      const tl = parsed.type_line || "";
      const imageNormal = id ? `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg` : "";
      setCard({
        name:             parsed.name || "",
        set:              parsed.set  || "",
        set_name:         parsed.set_name || "",
        cube_set_override: null,
        mana_cost:        parsed.mana_cost || "",
        colors:           parsed.colors || [],
        cmc:              parsed.cmc ?? 0,
        type_line:        tl,
        types:            tl.split(" — ")[0]?.trim().split(" ").filter(Boolean) || [],
        subtypes:         tl.split(" — ")[1]?.trim().split(" ").filter(Boolean) || [],
        oracle_text:      parsed.oracle_text || "",
        power:            parsed.power ?? null,
        toughness:        parsed.toughness ?? null,
        rarity:           parsed.rarity || "",
        image_uris:       { normal: imageNormal },
        tags:             [],
      });

    } catch(e) {
      setErrMsg("Fetch error: " + e.message);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") onClose();
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0,
      backgroundColor: "rgba(0,0,0,0.8)",
      zIndex: 100,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "40px 16px 24px",
      overflowY: "auto",
    }}>
      {/* Modal box — stop propagation so clicking inside doesn't close */}
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: "#111",
        border: "1px solid #222",
        borderRadius: "4px",
        width: "100%",
        maxWidth: "600px",
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100vh - 64px)",
        overflowY: "auto",
      }}>

        {/* Sticky header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px",
          borderBottom: "1px solid #222",
          position: "sticky", top: 0,
          backgroundColor: "#111", zIndex: 1,
        }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {["single", "bulk"].map(t => (
              <div key={t} onClick={() => setTab(t)} style={{
                padding: "6px 14px", fontSize: "12px", textTransform: "uppercase",
                letterSpacing: "0.08em", cursor: "pointer", borderRadius: "4px",
                backgroundColor: tab === t ? "#000" : "transparent",
                color: tab === t ? "#fff" : "#555",
                border: tab === t ? "1px solid #333" : "1px solid transparent",
              }}>
                {t === "single" ? "Single Card" : "Bulk Import"}
              </div>
            ))}
          </div>
          <div onClick={onClose} style={{
            cursor: "pointer", color: "#888", fontSize: "20px",
            lineHeight: 1, padding: "4px 8px", minWidth: "44px",
            textAlign: "center", minHeight: "44px", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>✕</div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 16px" }}>
          {tab === "single" && (
            <>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  style={{ ...S.input, flex: 1, minWidth: 0 }}
                  placeholder="Card name..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  autoFocus
                />
                <button
                  onClick={handleSearch}
                  disabled={!query.trim() || loading}
                  style={{
                    ...S.btn,
                    backgroundColor: query.trim() && !loading ? "#222" : "transparent",
                    opacity: query.trim() && !loading ? 1 : 0.4,
                    cursor: query.trim() && !loading ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                  }}>
                  {loading ? "..." : "Search"}
                </button>
              </div>

              {notFound && !loading && (
                <div style={{ color: "#888", fontSize: "13px", marginTop: "20px" }}>No card found.</div>
              )}

              {card && !loading && <CardPreview card={card} />}
              {card && !loading && (
                <CardTagging cardTags={cardTags} setCardTags={setCardTags} tagDB={tagDB} setTagDB={setTagDB} />
              )}

              <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #1a1a1a" }}>
                <button
                  disabled={!card}
                  onClick={() => { if (card) { onAddCard({ ...card, tags: cardTags }); onClose(); } }}
                  style={{
                    ...S.btn,
                    opacity: card ? 1 : 0.3,
                    cursor: card ? "pointer" : "not-allowed",
                    backgroundColor: card ? "#222" : "transparent",
                    minHeight: "44px",
                  }}>
                  Add to Cube
                </button>
              </div>
            </>
          )}

          {tab === "bulk" && (
            <div style={{ color: "#888", fontSize: "13px" }}>Bulk import coming soon.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CARDS PAGE ───────────────────────────────────────────────────────────────

function CardsPage({ cards, onAddCard, tagDB, setTagDB }) {
  const [showModal, setShowModal] = useState(false);
  return (
    <div style={S.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", flexWrap: "wrap", gap: "12px" }}>
        <button style={{ ...S.btn, borderColor: "#444", minHeight: "44px" }} onClick={() => setShowModal(true)}>
          + Add Cards
        </button>
        <div style={{ border: "1px dashed #333", borderRadius: "4px", padding: "8px 20px", fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", minHeight: "44px", display: "flex", alignItems: "center" }}>
          Filters
        </div>
      </div>
      <hr style={S.divider} />
      {cards.length === 0
        ? <div style={{ color: "#888", fontSize: "13px" }}>No cards added yet.</div>
        : <div style={{ color: "#888", fontSize: "13px" }}>{cards.length} card{cards.length !== 1 ? "s" : ""} in cube.</div>
      }
      {showModal && <AddCardModal onClose={() => setShowModal(false)} onAddCard={onAddCard} tagDB={tagDB} setTagDB={setTagDB} />}
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("Home");
  const [db, setDB] = useState(() => createDB("", 360, 30));
  const [cards, setCards] = useState([]);
  const [tagDB, setTagDB] = useState(DEFAULT_TAG_DB);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    async function load() {
      const savedConfig = await Storage.getConfig();
      if (savedConfig) setDB(createDB(savedConfig.name, savedConfig.size, savedConfig.colorless));
      const savedCards = await Storage.getCards();
      if (savedCards?.length) setCards(savedCards);
      const savedTagDB = await Storage.getTagDB();
      if (savedTagDB) setTagDB(savedTagDB);
      setStorageReady(true);
    }
    load();
  }, []);

  // Save config to storage whenever it changes
  useEffect(() => {
    if (!storageReady) return;
    Storage.setConfig({ name: db.name, size: db.size, colorless: db.colorless });
  }, [db, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    Storage.setTagDB(tagDB);
  }, [tagDB, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    Storage.setCards(cards);
  }, [cards, storageReady]);

  function addCard(card) {
    setCards(prev => {
      if (prev.find(c => c.id === card.id)) return prev; // no duplicates
      return [...prev, card];
    });
  }

  return (
    <div style={S.app}>
      <nav style={S.nav}>
        {NAV_ITEMS.map(item => (
          <div key={item} style={S.navItem(active === item)} onClick={() => setActive(item)}>{item}</div>
        ))}
      </nav>
      {active === "Home"   && <HomePage db={db} setDB={setDB} />}
      {active === "Guilds" && <GuildsPage />}
      {active === "Cards"  && <CardsPage cards={cards} onAddCard={addCard} tagDB={tagDB} setTagDB={setTagDB} />}
    </div>
  );
}
