const { useState, useEffect, useRef } = React;

// ─── STORAGE ABSTRACTION ─────────────────────────────────────────────────────
// Swap this implementation for Firebase later without touching the rest of the app

const Storage = {
  async getConfig() {
    try {
      const r = localStorage.getItem("cube:config");
      return r ? JSON.parse(r) : null;
    } catch { return null; }
  },
  async setConfig(config) {
    try { localStorage.setItem("cube:config", JSON.stringify(config)); }
    catch {}
  },
  async getCards() {
    try {
      const r = localStorage.getItem("cube:cards");
      return r ? JSON.parse(r) : [];
    } catch { return []; }
  },
  async setCards(cards) {
    try { localStorage.setItem("cube:cards", JSON.stringify(cards)); }
    catch {}
  },
  async getTagDB() {
    try {
      const r = localStorage.getItem("cube:tagdb");
      return r ? JSON.parse(r) : null;
    } catch { return null; }
  },
  async setTagDB(tagDB) {
    try { localStorage.setItem("cube:tagdb", JSON.stringify(tagDB)); }
    catch {}
  },
};



const NAV_ITEMS = ["Configure", "Build", "Analyze"];
const NAV_RIGHT = ["Reference"];
const CUBE_SIZES = [360, 480, 540, 720];
const COLORLESS_MIN  = { 360: 10, 480: 20, 540: 20, 720: 40 };
const COLORLESS_BASE  = { 360: 0, 480: 0, 540: 0, 720: 0 };
const COLORLESS_MAX   = { 360: 50, 480: 60, 540: 60, 720: 80 };
const GUILD_BASE = { 360: 90, 480: 100, 540: 110, 720: 140 };
const WILDCARDS_OPTIONS = [0, 20, 30, 40, 50, 60];
const WILDCARDS_BICOLOR_REDUCTION = { 0: 0, 20: 0, 30: 1, 40: 0, 50: 1, 60: 2 };
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

function getWildcardsOptions() { return WILDCARDS_OPTIONS; }


function computeDistribution(size, colorless, wildcards = 0, guildCards) {
  const dualLands            = Math.round(size / 120) * 10;
  const landsPerGuild        = dualLands / 10;
  const defaultGuild         = (GUILD_BASE[size] || 90);
  const base                 = guildCards !== undefined ? guildCards : defaultGuild;
  const colorlessGuildImpact = colorless > 0 ? COLORLESS_MIN[size] : 0;
  const wildcardsBiImpact    = (WILDCARDS_BICOLOR_REDUCTION[wildcards] ?? 0) * 10;
  const bicolorTotal         = base - colorlessGuildImpact - wildcardsBiImpact;
  const bicolorPerGuild      = bicolorTotal / 10;
  const monoTotal            = size - colorless - dualLands - bicolorTotal - wildcards;
  const monoPerColor         = monoTotal / 5;
  return { dualLands, landsPerGuild, bicolorTotal, bicolorPerGuild, monoTotal, monoPerColor, wildcards };
}

function computeAdvice(monoPerColor) {
  const perGuild = monoPerColor / 4;
  const removal  = Math.max(1, Math.round(perGuild * REMOVAL_RATIO.W));
  const draw     = Math.max(1, Math.round(perGuild * DRAW_RATIO.W));
  return { perGuild, removal, draw };
}

function draftProb(n, N, k = 45) {
  if (n <= 0 || N <= 0) return 0;
  let p0 = 1;
  for (let i = 0; i < k; i++) {
    const num = N - n - i;
    if (num <= 0) return 100;
    p0 *= num / (N - i);
  }
  return Math.round((1 - p0) * 100);
}

function createDB(name, size, colorless, wildcards = 0, guildCards) {
  return { name, size, colorless, wildcards, guildCards, ...computeDistribution(size, colorless, wildcards, guildCards), updatedAt: new Date().toISOString() };
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
  boxTitle: { fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "20px" },
  row:      { display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", flexWrap: "wrap" },
  label:    { fontSize: "12px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: "100px" },
  input:    { backgroundColor: "#000", border: "1px solid #333", borderRadius: "4px", color: "#fff", fontSize: "13px", padding: "7px 12px", outline: "none", fontFamily: "'Courier New', monospace", minWidth: "200px" },
  select:   { backgroundColor: "#000", border: "1px solid #333", borderRadius: "4px", color: "#fff", fontSize: "13px", padding: "7px 12px", outline: "none", fontFamily: "'Courier New', monospace", cursor: "pointer" },
  table:    { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th:       { textAlign: "left", padding: "8px 12px", fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid #222" },
  td:       (bold) => ({ padding: "8px 12px", borderBottom: "1px solid #1a1a1a", color: bold ? "#fff" : "#aaa", fontWeight: bold ? "700" : "400" }),
  sectionRow: { padding: "6px 12px", fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", backgroundColor: "#0a0a0a" },
  totalRow:   { padding: "10px 12px", color: "#fff", fontWeight: "700", borderTop: "1px solid #333" },
  btn:      { backgroundColor: "transparent", color: "#fff", border: "1px solid #333", borderRadius: "4px", padding: "8px 20px", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" },
};

function HomePage({ db, setDB, cards }) {
  const { name, size, colorless, wildcards = 0 } = db;
  const defaultGuild = (GUILD_BASE[size] || 90);
  const guildCards   = db.guildCards !== undefined ? db.guildCards : defaultGuild;
  const guildOpts    = [0, 1, 2, 3].map(i => defaultGuild + i * 20);
  const dist = computeDistribution(size, colorless, wildcards, guildCards);
  const opts = getColorlessOptions(size);
  const wildOpts = getWildcardsOptions();
  const { removal, draw } = computeAdvice(dist.monoPerColor);
  const mainArch = MAIN_ARCH_PER_GUILD[size];
  const tribal   = TRIBAL_PER_COLOR[size];

  const handleSizeChange = (v) => {
    const newSize = parseInt(v);
    // Preserve guild step index
    const curDefaultGuild = (GUILD_BASE[size] || 90);
    const guildStep = guildCards !== undefined
      ? Math.min(3, Math.max(0, Math.round((guildCards - curDefaultGuild) / 20)))
      : 0;
    const newDefaultGuild = Math.round(newSize / 6) + 20;
    const newGuildCards = newDefaultGuild + guildStep * 20;
    // Preserve colorless index
    const curOpts = getColorlessOptions(size);
    const colorlessIdx = Math.max(0, curOpts.indexOf(colorless));
    const newOpts = getColorlessOptions(newSize);
    const newColorless = newOpts[Math.min(colorlessIdx, newOpts.length - 1)];
    setDB(createDB(name, newSize, newColorless, wildcards, newGuildCards));
  };
  const handleColorlessChange = (v) => setDB(createDB(name, size, parseInt(v), wildcards, guildCards));
  const handleWildcardsChange = (v) => setDB(createDB(name, size, colorless, parseInt(v), guildCards));
  const handleNameChange      = (v) => setDB(createDB(v, size, colorless, wildcards, db.guildCards));
  const handleGuildCardsChange = (v) => setDB(createDB(name, size, colorless, wildcards, parseInt(v)));

  const all = cards || [];
  const countGuild     = (gColors) => all.filter(c => (c.colors||[]).length === 2 && gColors.split("").every(col => (c.colors||[]).includes(col))).length;
  const countMono      = (colorKey) => all.filter(c => (c.colors||[]).length === 1 && c.colors[0] === colorKey).length;
  const countColorless = ()         => all.filter(c => (c.colors||[]).length === 0 && !(c.type_line||"").toLowerCase().includes("land")).length;
  const countLands     = ()         => all.filter(c => (c.type_line||"").toLowerCase().includes("land")).length;
  const countWildcards = ()         => all.filter(c => (c.colors||[]).length >= 3).length;

  return (
    <div style={S.page}>

      <div style={S.box}>
        <div style={S.boxTitle}>Settings</div>
        <div style={S.row}>
          <span style={S.label}>Cube Name</span>
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <input style={S.input} value={name} placeholder="My Cube" onChange={e => handleNameChange(e.target.value)} />
            {name && <span onClick={() => handleNameChange("")}
              style={{ position: "absolute", right: "10px", cursor: "pointer", color: "#aaa", fontSize: "16px", lineHeight: 1 }}>×</span>}
          </div>
        </div>
        <div style={S.row}>
          <span style={S.label}>Cube Size</span>
          <select style={S.select} value={size} onChange={e => handleSizeChange(e.target.value)}>
            {CUBE_SIZES.map(s => <option key={s} value={s}>{s} cards</option>)}
          </select>
        </div>

        <hr style={{ ...S.divider, margin: "16px 0" }} />
        <div style={{ ...S.boxTitle, marginBottom: "12px" }}>Fine tune</div>

        <div style={{ display: "flex", gap: "32px" }}>
          {(() => {
            const baseG  = computeDistribution(size, colorless, wildcards, defaultGuild);
            const baseC  = computeDistribution(size, 0,         wildcards, guildCards);
            const baseW  = computeDistribution(size, colorless, 0,         guildCards);
            const gMono  = baseG.monoTotal    - dist.monoTotal;
            const cGuild = baseC.bicolorTotal - dist.bicolorTotal;
            const cMono  = baseC.monoTotal    - dist.monoTotal;
            const wGuild = baseW.bicolorTotal - dist.bicolorTotal;
            const wMono  = baseW.monoTotal    - dist.monoTotal;

            const impactStyle = { fontSize: "11px", color: "#aaa", marginTop: "6px", lineHeight: "1.7" };

            const Impact = ({ guild, mono }) => {
              if (guild === 0 && mono === 0) return null;
              return (
                <div style={impactStyle}>
                  <div style={{ color: "#aaa", textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.08em", marginBottom: "2px" }}>Removes:</div>
                  {guild > 0 && <div>{guild} guild card{guild !== 1 ? "s" : ""}</div>}
                  {mono  > 0 && <div>{mono} monocolored card{mono !== 1 ? "s" : ""}</div>}
                </div>
              );
            };

            return (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={S.label}>Guild</span>
                  <select style={S.select} value={guildCards} onChange={e => handleGuildCardsChange(e.target.value)}>
                    {guildOpts.map(v => <option key={v} value={v}>{v} cards</option>)}
                  </select>
                  <Impact guild={0} mono={gMono} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={S.label}>Colorless</span>
                  <select style={S.select} value={colorless} onChange={e => handleColorlessChange(e.target.value)}>
                    {opts.map(v => <option key={v} value={v}>{v} cards</option>)}
                  </select>
                  <Impact guild={cGuild} mono={cMono} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={S.label}>Wildcards</span>
                  <select style={S.select} value={wildcards} onChange={e => handleWildcardsChange(e.target.value)}>
                    {wildOpts.map(v => <option key={v} value={v}>{v} cards</option>)}
                  </select>
                  <Impact guild={wGuild} mono={wMono} />
                </div>
              </>
            );
          })()}
        </div>

        {/* Distribution summary strip */}
        {(() => {
          function packRange(n, N, k = 15) {
            if (n <= 0 || N <= 0) return "0";
            const mean = k * n / N;
            const std  = Math.sqrt(k * (n / N) * (1 - n / N) * (N - k) / (N - 1));
            const lo   = Math.max(0, Math.floor(mean - std));
            const hi   = Math.ceil(mean + std);
            return lo === hi ? `${lo}` : `${lo} – ${hi}`;
          }

          const categories = [
            { label: "Guild",       detail: `${dist.bicolorPerGuild}×10`, value: dist.bicolorTotal },
            { label: "Monocolored", detail: `${dist.monoPerColor}×5`,     value: dist.monoTotal    },
            { label: "Colorless",   detail: "",                            value: colorless         },
            { label: "Wildcards",   detail: "",                            value: wildcards         },
            { label: "Dual Lands",  detail: `${dist.landsPerGuild}×10`,   value: dist.dualLands    },
            { label: "Total",       detail: "",                            value: size, highlight: true },
          ];

          const cellBase = {
            flex: 1, backgroundColor: "#111", padding: "10px 8px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
          };

          return (
            <>
              <hr style={{ ...S.divider, margin: "16px 0" }} />
              <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Total cards</div>
              <div style={{ display: "flex", gap: "1px", backgroundColor: "#1a1a1a", borderRadius: "4px", overflow: "hidden", marginBottom: "16px" }}>
                {categories.map(({ label, detail, value, highlight }) => (
                  <div key={label} style={cellBase}>
                    <span style={{ fontSize: "9px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
                    <span style={{ fontSize: "9px", color: "#aaa", minHeight: "13px" }}>{detail}</span>
                    <span style={{ fontSize: highlight ? "20px" : "18px", fontWeight: "700", color: highlight ? "#d4af37" : "#ccc", lineHeight: 1.2 }}>{value}</span>
                    <span style={{ fontSize: "10px", color: "#aaa" }}>{value === 0 ? "0%" : (value / size * 100).toFixed(1) + "%"}</span>
                  </div>
                ))}
              </div>

              <hr style={{ ...S.divider, margin: "16px 0" }} />
              <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Expected cards per pack</div>
              <div style={{ display: "flex", gap: "1px", backgroundColor: "#1a1a1a", borderRadius: "4px", overflow: "hidden" }}>
                {categories.map(({ label, value, highlight }) => {
                  const avg   = value > 0 ? (value / size * 15).toFixed(1) : "0";
                  const range = packRange(value, size);
                  return (
                    <div key={label} style={cellBase}>
                      <span style={{ fontSize: "9px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
                      <span style={{ fontSize: "9px", color: "#aaa", minHeight: "13px" }}>avg {avg}</span>
                      <span style={{ fontSize: highlight ? "16px" : "15px", fontWeight: "700", color: highlight ? "#d4af37" : "#ccc", lineHeight: 1.3 }}>{range}</span>
                      <span style={{ fontSize: "10px", color: "#aaa" }}>{value === 0 ? "0%" : (value / size * 100).toFixed(1) + "%"}</span>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      <div style={S.box}>
        <div style={S.boxTitle}>Distribution Summary</div>
        <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "12px", fontStyle: "italic" }}>
          Draft %: percentage of cards of this type in the cube, equal to the expected proportion in any 45-card draft pool (3 packs × 15 cards per player).
        </div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Category</th>
              <th style={S.th}>Detail</th>
              <th style={{ ...S.th, textAlign: "right"  }}>Draft<br/>%</th>
              <th style={{ ...S.th, textAlign: "right"  }}>Max<br/>cards</th>
              <th style={{ ...S.th, textAlign: "center", padding: "0 6px", color: "#aaa" }}>/</th>
              <th style={{ ...S.th, textAlign: "left"   }}>Added<br/>cards</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={2} style={S.sectionRow}>Multicolor</td>
              <td style={{ ...S.sectionRow, textAlign: "right", color: "#c8a000" }}>{(dist.bicolorTotal / size * 100).toFixed(1) + "%"}</td>
              <td style={{ ...S.sectionRow, textAlign: "right" }}>{dist.bicolorTotal}</td>
              <td style={{ ...S.sectionRow, textAlign: "center", color: "#aaa" }}>/</td>
              <td style={{ ...S.sectionRow }}>{GUILDS_LIST.reduce((s,g) => s + countGuild(g.colors), 0)}</td>
            </tr>
            {GUILDS_LIST.map(g => (
              <tr key={g.name}>
                <td style={S.td()}>{g.name}</td>
                <td style={S.td()}>
                  <span style={{ display: "inline-flex", gap: "3px", alignItems: "center" }}>
                    {g.colors.split("").map(c => <ManaIcon key={c} c={c} />)}
                  </span>
                </td>
                                <td style={{ ...S.td(), textAlign: "right", color: "#c8a000"  }}>{(dist.bicolorPerGuild / size * 100).toFixed(1) + "%"}</td>
<td style={{ ...S.td(), textAlign: "right"  }}>{dist.bicolorPerGuild}</td>
                <td style={{ ...S.td(), textAlign: "center", color: "#aaa", padding: "0 6px" }}>/</td>
                <td style={{ ...S.td(), textAlign: "left"   }}>{countGuild(g.colors)}</td>
              </tr>
            ))}

            <tr>
              <td colSpan={2} style={S.sectionRow}>Mono</td>
              <td style={{ ...S.sectionRow, textAlign: "right", color: "#c8a000" }}>{(dist.monoTotal / size * 100).toFixed(1) + "%"}</td>
              <td style={{ ...S.sectionRow, textAlign: "right" }}>{dist.monoTotal}</td>
              <td style={{ ...S.sectionRow, textAlign: "center", color: "#aaa" }}>/</td>
              <td style={{ ...S.sectionRow }}>{COLORS_LIST.reduce((s,c) => s + countMono(c.key), 0)}</td>
            </tr>
            {COLORS_LIST.map(c => (
              <tr key={c.key}>
                <td style={S.td()}>{c.label}</td>
                <td style={S.td()}><ManaIcon c={c.key} /></td>
                                <td style={{ ...S.td(), textAlign: "right", color: "#c8a000"  }}>{(dist.monoPerColor / size * 100).toFixed(1) + "%"}</td>
<td style={{ ...S.td(), textAlign: "right"  }}>{dist.monoPerColor}</td>
                <td style={{ ...S.td(), textAlign: "center", color: "#aaa", padding: "0 6px" }}>/</td>
                <td style={{ ...S.td(), textAlign: "left"   }}>{countMono(c.key)}</td>
              </tr>
            ))}

            <tr>
              <td colSpan={2} style={S.sectionRow}>Other</td>
              <td style={{ ...S.sectionRow, textAlign: "right", color: "#c8a000" }}>{((colorless + dist.dualLands + wildcards) / size * 100).toFixed(1) + "%"}</td>
              <td style={{ ...S.sectionRow, textAlign: "right" }}>{colorless + dist.dualLands + wildcards}</td>
              <td style={{ ...S.sectionRow, textAlign: "center", color: "#aaa" }}>/</td>
              <td style={{ ...S.sectionRow }}>{countColorless() + countLands() + countWildcards()}</td>
            </tr>
            {colorless > 0 && (
              <tr>
                <td style={S.td()}>Colorless</td>
                <td style={S.td()}>Artifacts & utility</td>
                <td style={{ ...S.td(), textAlign: "right", color: "#c8a000" }}>{(colorless / size * 100).toFixed(1) + "%"}</td>
                <td style={{ ...S.td(), textAlign: "right" }}>{colorless}</td>
                <td style={{ ...S.td(), textAlign: "center", color: "#aaa", padding: "0 6px" }}>/</td>
                <td style={{ ...S.td(), textAlign: "left" }}>{countColorless()}</td>
              </tr>
            )}
            <tr>
              <td style={S.td()}>Dual Lands</td>
              <td style={S.td()}>{dist.landsPerGuild} per guild × 10</td>
                            <td style={{ ...S.td(), textAlign: "right", color: "#c8a000"  }}>{(dist.dualLands / size * 100).toFixed(1) + "%"}</td>
<td style={{ ...S.td(), textAlign: "right"  }}>{dist.dualLands}</td>
              <td style={{ ...S.td(), textAlign: "center", color: "#aaa", padding: "0 6px" }}>/</td>
              <td style={{ ...S.td(), textAlign: "left"   }}>{countLands()}</td>
            </tr>
            {wildcards > 0 && (
              <tr>
                <td style={S.td()}>Wildcards</td>
                <td style={S.td()}>3+ color &amp; special</td>
                                <td style={{ ...S.td(), textAlign: "right", color: "#c8a000"  }}>{(wildcards / size * 100).toFixed(1) + "%"}</td>
<td style={{ ...S.td(), textAlign: "right"  }}>{wildcards}</td>
                <td style={{ ...S.td(), textAlign: "center", color: "#aaa", padding: "0 6px" }}>/</td>
                <td style={{ ...S.td(), textAlign: "left"   }}>{countWildcards()}</td>
              </tr>
            )}
            <tr>
              <td style={S.totalRow}>Total</td>
              <td style={S.totalRow}></td>
              <td style={{ ...S.totalRow }}></td>
              <td style={{ ...S.totalRow, textAlign: "right"  }}>{size}</td>
              <td style={{ ...S.totalRow, textAlign: "center", color: "#aaa", padding: "0 6px" }}>/</td>
              <td style={{ ...S.totalRow, textAlign: "left"   }}>{all.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={S.box}>
        <div style={S.boxTitle}>Recommendations</div>
        <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "20px", letterSpacing: "0.06em" }}>
          Included in mono count — not additional slots. Scales with cube size.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
          {[
            { label: "Removal per color per guild", value: removal,  color: "#d94a4a" },
            { label: "Draw per color per guild",    value: draw,     color: "#4a90d9" },
            { label: "Main archetypes per guild",   value: mainArch, color: "#fff"    },
            { label: "Tribal archetypes per color", value: tribal,   color: "#4a9d5a" },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between",
              borderBottom: "1px solid #1a1a1a",
              paddingBottom: "10px",
            }}>
              <span style={{ color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "12px" }}>{label}</span>
              <span style={{ color, fontWeight: "700" }}>{value}</span>
            </div>
          ))}

          {/* Basic lands separator */}
          <div style={{ paddingTop: "6px", paddingBottom: "4px", borderBottom: "1px solid #333", marginBottom: "4px" }}>
            <span style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Basic land station — not drafted, provided separately
            </span>
          </div>
          {(() => {
            const maxPlayers = Math.floor(size / 45);
            const basicPerColor = Math.ceil(maxPlayers * 2.5 / 5) * 5;
            return (
              <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "4px" }}>
                <span style={{ color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "12px" }}>
                  Basic lands per color (for {maxPlayers} players)
                </span>
                <span style={{ color: "#c8a000", fontWeight: "700" }}>{basicPerColor}</span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── GUILDS PAGE COMPONENTS ──────────────────────────────────────────────────

function ArchetypeSection({ title, guildCards, pool, activeField, supportField, showN, alwaysFirst = [], noSupport = false }) {
  const [showAll, setShowAll] = useState(false);

  const tagData = pool.map(tag => ({
    tag,
    active:  guildCards.filter(c => c.tags?.[activeField]?.includes(tag)).length,
    support: noSupport ? 0 : guildCards.filter(c => c.tags?.[supportField]?.includes(tag)).length,
  }));

  const always  = alwaysFirst.map(t => tagData.find(d => d.tag === t)).filter(Boolean);
  const rest    = tagData.filter(d => !alwaysFirst.includes(d.tag))
                         .sort((a,b) => b.active !== a.active ? b.active - a.active : b.support - a.support);
  const ordered = [...always, ...rest.filter(d => !alwaysFirst.includes(d.tag))];
  const visible = showAll ? ordered : ordered.slice(0, showN);
  const hasMore = ordered.length > showN;

  const colHdr = { fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right", paddingBottom: "4px" };

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>{title}</div>
      {visible.length === 0
        ? <div style={{ fontSize: "12px", color: "#aaa" }}>—</div>
        : <>
            <div style={{ display: "flex", alignItems: "center", padding: "0 0 4px", borderBottom: "1px solid #222", marginBottom: "2px" }}>
              <span style={{ flex: 1 }}></span>
              <span style={{ ...colHdr, minWidth: "52px" }}>Active</span>
              {!noSupport && <span style={{ ...colHdr, minWidth: "52px", marginLeft: "8px" }}>Support</span>}
            </div>
            {visible.map(({ tag, active, support }) => (
              <div key={tag} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #1a1a1a" }}>
                <span style={{ flex: 1, fontSize: "12px", color: "#ccc" }}>{tag}</span>
                <span style={{ fontSize: "12px", color: active > 0 ? "#4a90d9" : "#555", minWidth: "52px", textAlign: "right" }}>{active}</span>
                {!noSupport && <span style={{ fontSize: "12px", color: support > 0 ? "#fff" : "#444", minWidth: "52px", textAlign: "right", marginLeft: "8px" }}>{support}</span>}
              </div>
            ))}
          </>
      }
      {hasMore && (
        <div onClick={() => setShowAll(s => !s)} style={{ fontSize: "11px", color: "#aaa", cursor: "pointer", marginTop: "6px", textDecoration: "underline", textUnderlineOffset: "2px" }}>
          {showAll ? "Hide" : `Show all (${ordered.length})`}
        </div>
      )}
    </div>
  );
}

function slotColor(added, max) {
  if (added > max) return "#d94a4a";
  if (added < max) return "#c8a000";
  return "#4a9d5a";
}

function GuildCard({ guildName, colors, guildCards, db, tagDB, onViewGuild }) {
  const size = db.size;
  const dist = computeDistribution(size, db.colorless, db.wildcards, db.guildCards);
  const mainN = MAIN_ARCH_PER_GUILD[size] || 2;
  const isLandFn = c => (c.type_line || "").toLowerCase().includes("land");
  const bicolor  = guildCards.filter(c => (c.colors||[]).length === 2).length;
  const monoC1   = guildCards.filter(c => (c.colors||[]).length === 1 && c.colors[0] === colors[0]).length;
  const monoC2   = guildCards.filter(c => (c.colors||[]).length === 1 && c.colors[0] === colors[1]).length;
  const lands    = guildCards.filter(isLandFn).length;
  const colorNames = { W:"White", U:"Blue", B:"Black", R:"Red", G:"Green" };

  const tdR = { ...S.td(), textAlign: "right" };
  const tdC = { ...S.td(), textAlign: "center", color: "#aaa", padding: "0 6px" };
  const tdL = { ...S.td(), textAlign: "left" };

  return (
    <div style={{ ...S.box, marginBottom: "16px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px" }}>
          <span style={{ display: "inline-flex", gap: "4px" }}>
            {colors.map(c => <ManaIcon key={c} c={c} size={22} />)}
          </span>
          <span style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>{guildName}</span>
        </div>
        {(() => {
          const sorted = tagDB.main_archetypes
            .map(tag => ({ tag, active: guildCards.filter(c => c.tags?.main_archetype?.includes(tag)).length }))
            .sort((a, b) => b.active - a.active);
          const slots = Array.from({ length: mainN }, (_, i) => sorted[i]?.active > 0 ? sorted[i].tag : null);
          return (
            <div style={{ fontSize: "14px", color: "#aaa" }}>
              {slots.map((s, i) => (
                <span key={i}>
                  {i > 0 && <span style={{ color: "#aaa" }}> / </span>}
                  {s ? s : <span style={{ color: "#d94a4a" }}>missing archetype</span>}
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Stats table */}
      <table style={{ ...S.table, marginBottom: "20px" }}>
        <thead>
          <tr>
            <th style={S.th} colSpan={2}>Slot</th>
            <th style={{ ...S.th, textAlign: "right" }}>Max</th>
            <th style={{ ...S.th, textAlign: "center", padding: "0 6px", color: "#aaa" }}>/</th>
            <th style={{ ...S.th, textAlign: "left" }}>Added</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={S.td()}>{guildName}</td>
            <td style={S.td()}><span style={{ display: "inline-flex", gap: "2px" }}>{colors.map(c => <ManaIcon key={c} c={c} size={14} />)}</span></td>
            <td style={tdR}>{dist.bicolorPerGuild}</td><td style={tdC}>/</td><td style={{ ...S.td(), textAlign: "left", color: slotColor(bicolor, dist.bicolorPerGuild) }}>{bicolor}</td>
          </tr>
          {colors.map((c, i) => (
            <tr key={c}>
              <td style={S.td()}>{colorNames[c]}</td>
              <td style={S.td()}><ManaIcon c={c} size={14} /></td>
              <td style={tdR}>{dist.monoPerColor / 4}</td><td style={tdC}>/</td>
              <td style={{ ...S.td(), textAlign: "left", color: slotColor(i === 0 ? monoC1 : monoC2, dist.monoPerColor / 4) }}>{i === 0 ? monoC1 : monoC2}</td>
            </tr>
          ))}
          <tr>
            <td style={S.td()}>Lands</td>
            <td style={S.td()}></td>
            <td style={tdR}>{dist.landsPerGuild}</td><td style={tdC}>/</td><td style={{ ...S.td(), textAlign: "left", color: slotColor(lands, dist.landsPerGuild) }}>{lands}</td>
          </tr>
          {(() => {
            const maxTotal   = dist.bicolorPerGuild + (dist.monoPerColor / 4) * 2 + dist.landsPerGuild;
            const addedTotal = guildCards.length;
            return (
              <tr>
                <td style={S.totalRow}>Total</td>
                <td style={S.totalRow}></td>
                <td style={{ ...S.totalRow, textAlign: "right" }}>{maxTotal}</td>
                <td style={{ ...S.totalRow, textAlign: "center", color: "#aaa", padding: "0 6px" }}>/</td>
                <td style={{ ...S.totalRow, textAlign: "left", color: slotColor(addedTotal, maxTotal) }}>{addedTotal}</td>
              </tr>
            );
          })()}
        </tbody>
      </table>

      {/* Archetypes */}
      <div>
        <ArchetypeSection title="Main Archetypes" guildCards={guildCards}
          pool={PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)} activeField="main_archetype" supportField="main_archetype_support"
          showN={mainN} />
        <ArchetypeSection title="Tribal Archetypes" guildCards={guildCards}
          pool={PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name)} activeField="tribal_archetype" supportField="tribal_archetype_support"
          showN={2} />
        <ArchetypeSection title="Utility" guildCards={guildCards}
          pool={[...new Set(UTILITY_DATA.map(d => d.sub))].sort()} activeField="utility" supportField="utility" noSupport
          showN={2} alwaysFirst={["draw","removal"].filter(t => tagDB.utility.includes(t))} />
      </div>

      {onViewGuild && (
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #1a1a1a", textAlign: "right" }}>
          <span onClick={() => onViewGuild(guildName)} style={{
            fontSize: "12px", color: "#4a90d9", cursor: "pointer",
            letterSpacing: "0.04em",
          }}>
            View in cards list →
          </span>
        </div>
      )}
    </div>
  );
}

function SpecialCard({ name, guildCards, db, tagDB, showN = 2, onViewGuild }) {
  const mainN = MAIN_ARCH_PER_GUILD[db.size] || 2;
  const total = guildCards.length;
  const slotMax = name === "Colorless" ? db.colorless : db.wildcards;

  return (
    <div style={{ ...S.box, marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
        <span style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>{name}</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "#aaa" }}>
          {total} / {slotMax} cards
        </span>
      </div>
      <div>
        <ArchetypeSection title="Main Archetypes" guildCards={guildCards}
          pool={PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)} activeField="main_archetype" supportField="main_archetype_support"
          showN={showN} />
        <ArchetypeSection title="Tribal Archetypes" guildCards={guildCards}
          pool={PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name)} activeField="tribal_archetype" supportField="tribal_archetype_support"
          showN={showN} />
        <ArchetypeSection title="Utility" guildCards={guildCards}
          pool={[...new Set(UTILITY_DATA.map(d => d.sub))].sort()} activeField="utility" supportField="utility" noSupport
          showN={showN} />
      </div>

      {onViewGuild && (
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #1a1a1a", textAlign: "right" }}>
          <span onClick={() => onViewGuild(name)} style={{
            fontSize: "12px", color: "#4a90d9", cursor: "pointer", letterSpacing: "0.04em",
          }}>
            View in cards list →
          </span>
        </div>
      )}
    </div>
  );
}

function GuildsPage({ cards, db, tagDB, onViewGuild }) {
  return (
    <div style={S.page}>
      {GUILDS_LIST.map(({ name, colors }) => {
        const guildCards = cards.filter(c => c.tags?.guild === name);
        return (
          <GuildCard key={name} guildName={name} colors={colors.split("")}
            guildCards={guildCards} db={db} tagDB={tagDB} onViewGuild={onViewGuild} />
        );
      })}
      {db.colorless > 0 && (
        <SpecialCard name="Colorless"
          guildCards={cards.filter(c => c.tags?.guild === "Colorless")}
          db={db} tagDB={tagDB} onViewGuild={onViewGuild} />
      )}
      {db.wildcards > 0 && (
        <SpecialCard name="Wildcards"
          guildCards={cards.filter(c => c.tags?.guild === "Wildcards")}
          db={db} tagDB={tagDB} onViewGuild={onViewGuild} />
      )}
    </div>
  );
}

// ─── MANA COST ────────────────────────────────────────────────────────────────

const DEFAULT_TAG_DB = {
  main_archetypes:   [],
  tribal_archetypes: [],
  utility:           ["draw", "removal"],
};

// ─── TAG BOX ──────────────────────────────────────────────────────────────────

function TagBox({ label, selected, pool, onAdd, onRemove, onCreateTag, poolMeta = {} }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const containerRef        = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const filtered = pool
    .filter(t => t.toLowerCase().includes(search.toLowerCase()) && !selected.includes(t));

  const exactMatch = pool.some(t => t.toLowerCase() === search.toLowerCase());
  const canCreate  = search.trim() && !exactMatch;

  function handleAdd(tag) { onAdd(tag.toLowerCase()); setSearch(""); setOpen(false); }
  function handleCreate() {
    const tag = search.trim().toLowerCase();
    onCreateTag(tag); onAdd(tag); setSearch(""); setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
      <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px", minHeight: "20px" }}>
        {selected.length === 0
          ? <span style={{ fontSize: "12px", color: "#aaa" }}>none</span>
          : selected.map(t => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", color: "#aaa" }}>
                {t}
                <span onClick={() => onRemove(t)} style={{ cursor: "pointer", color: "#aaa", fontSize: "14px", lineHeight: 1 }}>×</span>
              </span>
            ))
        }
      </div>
      <div onClick={() => setOpen(o => !o)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        <span style={{ fontSize: "14px" }}>+</span> add
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", marginTop: "4px", overflow: "hidden" }}>
          <div style={{ position: "relative" }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
              placeholder="Search..."
              style={{ ...S.input, width: "100%", borderRadius: 0, border: "none", borderBottom: "1px solid #333", boxSizing: "border-box", fontSize: "12px", padding: "8px 30px 8px 10px" }} />
            {search && (
              <span onClick={() => setSearch("")}
                style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#aaa", fontSize: "16px", lineHeight: 1 }}>×</span>
            )}
          </div>
          <div style={{ maxHeight: "160px", overflowY: "auto" }}>
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "8px 10px", fontSize: "12px", color: "#aaa" }}>No tags found.</div>
            )}
            {filtered.map(t => (
              <div key={t} onClick={() => handleAdd(t)}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#222"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                style={{ padding: "8px 10px", fontSize: "12px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span>{t}</span>
                {poolMeta[t] && <span style={{ fontSize: "10px", color: "#555", flexShrink: 0 }}>{poolMeta[t]}</span>}
              </div>
            ))}
          </div>
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

// ─── GUILD SELECT ─────────────────────────────────────────────────────────────

function GuildSelect({ value, guilds, onChange, wildcards = 0, placeholder = "none" }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const SPECIALS = [...(wildcards > 0 ? ["Wildcards"] : []), "Colorless"];
  const selected = guilds.find(g => g.name === value) || null;
  const selectedSpecial = SPECIALS.includes(value) ? value : null;

  function GuildRow({ g }) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <span style={{ display: "inline-flex", gap: "2px" }}>
          {g.colors.split("").map(c => <ManaIcon key={c} c={c} size={16} />)}
        </span>
        <span>{g.name}</span>
      </span>
    );
  }

  function renderValue() {
    if (value === "__unassign__") return <span style={{ color: "#aaa" }}>Unassign from current guild</span>;
    if (selected) return <GuildRow g={selected} />;
    if (selectedSpecial) return <span style={{ color: "#aaa" }}>{selectedSpecial}</span>;
    return <span style={{ color: "#aaa" }}>{placeholder}</span>;
  }

  function Item({ onClick, active, children }) {
    return (
      <div onClick={onClick}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#222"}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = active ? "#222" : "transparent"}
        style={{ padding: "8px 12px", fontSize: "13px", cursor: "pointer", color: active ? "#fff" : "#aaa", backgroundColor: active ? "#222" : "transparent" }}>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", minWidth: "180px" }}>
      <div onClick={() => setOpen(o => !o)} style={{
        ...S.select, display: "inline-flex", alignItems: "center",
        justifyContent: "space-between", gap: "8px", cursor: "pointer",
        userSelect: "none", minWidth: "180px",
      }}>
        {renderValue()}
        <span style={{ color: "#aaa", fontSize: "10px" }}>▾</span>
      </div>

      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", marginTop: "4px", minWidth: "180px", overflow: "hidden" }}>
          {guilds.length > 0 && (
            <>
              {guilds.map(g => (
                <Item key={g.name} onClick={() => { onChange(g.name); setOpen(false); }} active={value === g.name}>
                  <GuildRow g={g} />
                </Item>
              ))}
            </>
          )}

          <div style={{ borderTop: "1px solid #333", margin: "2px 0" }} />
          {SPECIALS.map(s => (
            <Item key={s} onClick={() => { onChange(s); setOpen(false); }} active={value === s}>
              {s}
            </Item>
          ))}
          <div style={{ borderTop: "1px solid #333", margin: "2px 0" }} />
          <Item onClick={() => { onChange("__unassign__"); setOpen(false); }} active={value === "__unassign__"}>
            Unassign from current guild
          </Item>
        </div>
      )}
    </div>
  );
}



function CardTagging({ cardTags, setCardTags, tagDB, setTagDB, cardColors, cardTypeLine, db }) {
  const wildcards = db?.wildcards || 0;
  const add    = (cat, tag) => setCardTags(p => ({ ...p, [cat]: [...(p[cat] || []), tag] }));
  const remove = (cat, tag) => setCardTags(p => ({ ...p, [cat]: p[cat].filter(t => t !== tag) }));
  const create = (type, tag) => setTagDB(p => ({ ...p, [type]: [...p[type], tag] }));

  const isLand = (cardTypeLine || "").toLowerCase().includes("land");

  const [showIgnoreConfirm, setShowIgnoreConfirm] = useState(false);

  function handleIgnoreToggle(checked) {
    if (checked) {
      const hasTags = [
        cardTags.main_archetype, cardTags.main_archetype_support,
        cardTags.tribal_archetype, cardTags.tribal_archetype_support,
        cardTags.utility,
      ].some(t => t && t.length > 0);
      if (hasTags) { setShowIgnoreConfirm(true); return; }
    }
    setCardTags(p => ({ ...p, ignore_tags: checked }));
  }

  function confirmIgnore() {
    setCardTags(p => ({
      ...p,
      main_archetype: [], main_archetype_support: [],
      tribal_archetype: [], tribal_archetype_support: [],
      utility: [], ignore_tags: true,
    }));
    setShowIgnoreConfirm(false);
  }

  // For lands: all guilds eligible, user picks manually
  // For others: filter by color match
  const eligibleGuilds = isLand
    ? GUILDS_LIST
    : cardColors.length <= 1
      ? GUILDS_LIST.filter(g => cardColors.some(c => g.colors.includes(c)))
      : GUILDS_LIST.filter(g => g.colors.split("").every(c => cardColors.includes(c)));

  useEffect(() => {
    if (cardTags.guild) return;
    if (isLand)                       return; // no auto-assign for lands
    if (cardColors.length === 0)      { setCardTags(p => ({ ...p, guild: "Colorless" })); return; }
    if (cardColors.length >= 3)       { setCardTags(p => ({ ...p, guild: wildcards > 0 ? "Wildcards" : "" })); return; }
    if (eligibleGuilds.length === 1)  { setCardTags(p => ({ ...p, guild: eligibleGuilds[0].name })); }
  }, [eligibleGuilds.length, cardColors.length, isLand]);

  const sectionTitle = { fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" };
  const section = { marginBottom: "20px" };

  return (
    <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #1a1a1a" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Tags</div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px", color: "#aaa" }}>
          <input
            type="checkbox"
            checked={!!cardTags.ignore_tags}
            onChange={e => handleIgnoreToggle(e.target.checked)}
            style={{ cursor: "pointer", accentColor: "#4a90d9" }}
          />
          Ignore tags
        </label>
      </div>

      {showIgnoreConfirm && (
        <div style={{
          backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px",
          padding: "16px", marginBottom: "16px",
        }}>
          <div style={{ fontSize: "13px", color: "#fff", marginBottom: "12px" }}>
            This action will remove all tags. Confirm?
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={confirmIgnore} style={{ ...S.btn, fontSize: "12px", padding: "6px 16px", backgroundColor: "#222", borderColor: "#444" }}>
              Continue
            </button>
            <button onClick={() => setShowIgnoreConfirm(false)} style={{ ...S.btn, fontSize: "12px", padding: "6px 16px" }}>
              Undo
            </button>
          </div>
        </div>
      )}

      {!cardTags.ignore_tags && (
        <>
          <div style={section}>
            <div style={sectionTitle}>Main Archetype</div>
            <div style={{ display: "flex", gap: "12px" }}>
              <TagBox label="Active" selected={cardTags.main_archetype} pool={PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)}
                onAdd={t => add("main_archetype", t)} onRemove={t => remove("main_archetype", t)} onCreateTag={t => {}} />
              <TagBox label="Support" selected={cardTags.main_archetype_support} pool={PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)}
                onAdd={t => add("main_archetype_support", t)} onRemove={t => remove("main_archetype_support", t)} onCreateTag={t => {}} />
            </div>
          </div>

          <div style={section}>
            <div style={sectionTitle}>Tribal Archetype</div>
            <div style={{ display: "flex", gap: "12px" }}>
              <TagBox label="Active" selected={cardTags.tribal_archetype} pool={PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name)}
                onAdd={t => add("tribal_archetype", t)} onRemove={t => remove("tribal_archetype", t)} onCreateTag={t => {}} />
              <TagBox label="Support" selected={cardTags.tribal_archetype_support} pool={PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name)}
                onAdd={t => add("tribal_archetype_support", t)} onRemove={t => remove("tribal_archetype_support", t)} onCreateTag={t => {}} />
            </div>
          </div>

          <div style={section}>
            <div style={sectionTitle}>Utility</div>
            <div style={{ display: "flex" }}>
              <TagBox label="" selected={cardTags.utility} pool={[...new Set(UTILITY_DATA.map(d => d.sub))].sort()} poolMeta={UTILITY_CAT_MAP}
                poolMeta={UTILITY_CAT_MAP}
                onAdd={t => add("utility", t)} onRemove={t => remove("utility", t)} onCreateTag={t => {}} />
              <div style={{ flex: 1 }} />
            </div>
          </div>
        </>
      )}

      <div style={{ ...section, marginBottom: 0 }}>
        <div style={sectionTitle}>Assign to Guild</div>
        {eligibleGuilds.length === 0 && (
          <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "8px" }}>No matching guilds for this card's colors.</div>
        )}
        <GuildSelect
          value={cardTags.guild || ""}
          guilds={eligibleGuilds}
          onChange={v => setCardTags(p => ({ ...p, guild: v }))}
          wildcards={wildcards}
        />
      </div>
    </div>
  );
}

function ManaCost({ cost, size = 20 }) {
  if (!cost) return null;
  const tokens = (cost.match(/\{[^}]+\}/g) || []).map(t => t.replace(/[{}]/g, ""));
  return (
    <span style={{ display: "inline-flex", gap: "3px", alignItems: "center", flexWrap: "wrap" }}>
      {tokens.map((token, i) => {
        if (MANA_STYLE[token]) return <ManaIcon key={i} c={token} size={size} />;
        return (
          <svg key={i} width={size} height={size} viewBox={`0 0 ${size} ${size}`}
            style={{ verticalAlign: "middle", flexShrink: 0 }}>
            <circle cx={size/2} cy={size/2} r={size/2 - 1} fill="#ccc" stroke="#999" strokeWidth="1.5" />
            <text x={size/2} y={size/2 + size*0.14} textAnchor="middle"
              fontSize={token.length > 1 ? size*0.35 : size*0.5}
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

// ─── RATING SYSTEM ────────────────────────────────────────────────────────────

function getRawScore(card) {
  const tags = card.tags || {};
  if (tags.ignore_tags) return 0;
  const base =
    ((tags.main_archetype          || []).length * 4  ) +
    ((tags.main_archetype_support  || []).length * 0.5) +
    ((tags.tribal_archetype        || []).length * 4  ) +
    ((tags.tribal_archetype_support|| []).length * 0.5) +
    ((tags.utility                 || []).length * 4  );
  if (base === 0) return 0;

  const colors = card.colors || [];
  const isLand = (card.type_line || "").toLowerCase().includes("land");
  // eligible guilds count
  let eligible;
  if (isLand || colors.length === 0) eligible = 0;       // colorless/land → ×2.0
  else if (colors.length === 1)      eligible = 4;       // mono → ×1.5
  else if (colors.length === 2)      eligible = 1;       // dual → ×1.0
  else                               eligible = -1;      // 3+ colors → ×1.0

  const mult = eligible === 0 ? 2.0 : eligible === 4 ? 1.5 : 1.0;
  return base * mult;
}

function getCardRating(card, allCards) {
  const tags = card.tags || {};
  const hasTag = [tags.main_archetype, tags.main_archetype_support, tags.tribal_archetype, tags.tribal_archetype_support, tags.utility].some(t => t?.length > 0);
  if (tags.ignore_tags) return { stars: 0, label: "N/A" };
  if (!hasTag)          return { stars: 0, label: "Unrated" };

  const raw = getRawScore(card);
  const ratedCards = allCards.filter(c => {
    const t = c.tags || {};
    return !t.ignore_tags && [t.main_archetype, t.main_archetype_support, t.tribal_archetype, t.tribal_archetype_support, t.utility].some(a => a?.length > 0);
  });

  const scores = ratedCards.map(getRawScore).sort((a, b) => a - b);
  if (scores.length === 0) return { stars: 1, label: "Filler", raw };

  const pct = scores.filter(s => s <= raw).length / scores.length;
  const stars = pct >= 0.90 ? 5 : pct >= 0.70 ? 4 : pct >= 0.40 ? 3 : pct >= 0.15 ? 2 : 1;
  const labels = { 5: "Staple", 4: "Key", 3: "Solid", 2: "Niche", 1: "Filler" };
  return { stars, label: labels[stars], raw: Math.round(raw * 10) / 10, pct: Math.round(pct * 100) };
}

function StarRating({ stars, label, size = 16, showLabel = false }) {
  if (!stars) return <span style={{ color: "#aaa", fontSize: "11px", fontStyle: "italic" }}>{label || "Unrated"}</span>;
  const bars   = stars * 2; // 1–5 stars → 2–10 bars
  const height = size;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <span style={{ display: "inline-flex", alignItems: "flex-end", gap: "1px" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{
            display: "inline-block",
            width: "3px",
            height: `${height}px`,
            backgroundColor: i < bars ? "#d4af37" : "#ccc",
          }} />
        ))}
      </span>
      {showLabel && <span style={{ fontSize: "11px", color: "#aaa", marginLeft: "4px" }}>{label}</span>}
    </span>
  );
}

// ─── CARD PREVIEW ─────────────────────────────────────────────────────────────

function CardFaceDetail({ face }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: "14px", fontWeight: "700", color: "#fff" }}>{face.name}</span>
        {face.mana_cost && <ManaCost cost={face.mana_cost} />}
      </div>
      <div style={{ color: "#888", fontSize: "12px" }}>{face.type_line}</div>
      {face.oracle_text && (
        <div style={{ color: "#aaa", lineHeight: "1.6", whiteSpace: "pre-wrap", fontSize: "12px" }}>{face.oracle_text}</div>
      )}
      {face.power != null && (
        <div style={{ color: "#aaa", fontSize: "12px" }}>{face.power} / {face.toughness}</div>
      )}
    </div>
  );
}

function CardPreview({ card }) {
  const rarityColor = { common: "#aaa", uncommon: "#8fb4d9", rare: "#d4af37", mythic: "#e07840" };
  const faces       = card.card_faces || null;
  const isDFC       = faces && faces.length >= 2;

  // Images: DFC may have per-face image_uris
  const frontImg = isDFC
    ? (faces[0].image_uris?.normal || card.image_uris?.normal || "")
    : (card.image_uris?.normal || "");
  const backImg  = isDFC ? (faces[1].image_uris?.normal || "") : "";

  return (
    <div style={{ display: "flex", gap: "20px", marginTop: "20px", flexWrap: "wrap" }}>
      {/* Images */}
      <div style={{ display: "flex", gap: "8px", flexShrink: 0, alignSelf: "flex-start" }}>
        {frontImg
          ? <img src={frontImg} alt={faces ? faces[0].name : card.name}
              style={{ width: "150px", borderRadius: "8px" }} />
          : <div style={{
                width: "108px", height: "150px", borderRadius: "8px",
                background: card.colors?.length
                  ? `linear-gradient(135deg, ${card.colors.map(c => MANA_STYLE[c]?.bg || "#333").join(", ")})`
                  : "#222",
                border: "1px solid #333", display: "flex", alignItems: "center",
                justifyContent: "center", flexDirection: "column", gap: "6px"
              }}>
              {(card.colors||[]).map(c => <ManaIcon key={c} c={c} size={28} />)}
            </div>
        }
        {isDFC && backImg && (
          <img src={backImg} alt={faces[1].name}
            style={{ width: "150px", borderRadius: "8px" }} />
        )}
      </div>

      {/* Text detail */}
      <div style={{ flex: 1, minWidth: "180px", fontSize: "13px", color: "#ccc", display: "flex", flexDirection: "column", gap: "12px" }}>
        {isDFC ? (
          <>
            <CardFaceDetail face={faces[0]} />
            <div style={{ borderTop: "1px solid #222", paddingTop: "12px" }}>
              <CardFaceDetail face={faces[1]} />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>{card.name}</div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
              <ManaCost cost={card.mana_cost} />
              <span style={{ color: "#aaa", fontSize: "12px" }}>· CMC {card.cmc}</span>
            </div>
            <div style={{ color: "#aaa" }}>{card.type_line}</div>
            {card.subtypes?.length > 0 && (
              <div style={{ color: "#aaa", fontSize: "12px" }}>Subtypes: {card.subtypes.join(", ")}</div>
            )}
            <div style={{ color: "#aaa", lineHeight: "1.6", whiteSpace: "pre-wrap", fontSize: "12px" }}>
              {card.oracle_text}
            </div>
            {card.power !== null && (
              <div style={{ color: "#aaa", fontSize: "12px" }}>{card.power} / {card.toughness}</div>
            )}
          </>
        )}
        <div style={{ color: rarityColor[card.rarity] || "#aaa", textTransform: "capitalize", fontSize: "12px" }}>
          {card.rarity} · {card.set_name} ({(card.set||"").toUpperCase()}) · CMC {card.cmc}
        </div>
      </div>
    </div>
  );
}

// ─── ADD CARD MODAL ───────────────────────────────────────────────────────────

// ─── SHARED CARD LOOKUP UTILITIES ────────────────────────────────────────────

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

function buildCardObject(parsed) {
  const localId     = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const scryfallId  = (parsed.scryfall_id && parsed.scryfall_id !== "not_found") ? parsed.scryfall_id : "";
  const tl          = parsed.type_line || "";
  const imageNormal = scryfallId ? `https://cards.scryfall.io/normal/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg` : "";
  return {
    id:               localId,
    added_at:         Date.now(),
    scryfall_id:      scryfallId,
    name:             parsed.name || "",
    set:              parsed.set  || "",
    set_name:         parsed.set_name || "",
    cube_set_override: null,
    mana_cost:        parsed.mana_cost || "",
    colors:           Array.isArray(parsed.colors) ? parsed.colors : [],
    cmc:              typeof parsed.cmc === "number" ? parsed.cmc : 0,
    type_line:        tl,
    types:            tl.split(" — ")[0]?.trim().split(" ").filter(Boolean) || [],
    subtypes:         tl.split(" — ")[1]?.trim().split(" ").filter(Boolean) || [],
    oracle_text:      parsed.oracle_text || "",
    power:            parsed.power ?? null,
    toughness:        parsed.toughness ?? null,
    rarity:           parsed.rarity || "unknown",
    image_uris:       { normal: imageNormal },
    tags:             [],
  };
}

async function fetchCardFromAPI(cardName, setCode) {
  // Try Vercel proxy first (real Scryfall data)
  try {
    const url = `/api/scryfall?name=${encodeURIComponent(cardName)}${setCode ? `&set=${setCode}` : ""}`;
    const res  = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.name && data.name !== "not_found") {
        const localId    = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const scryfallId = data.id || "";
        const tl         = data.type_line || "";
        return {
          id:               localId,
          scryfall_id:      scryfallId,
          name:             data.name,
          set:              data.set || "",
          set_name:         data.set_name || "",
          cube_set_override: null,
          mana_cost:        data.mana_cost || "",
          colors:           Array.isArray(data.colors) ? data.colors : [],
          cmc:              data.cmc ?? 0,
          type_line:        tl,
          types:            data.types || tl.split(" — ")[0]?.trim().split(" ").filter(Boolean) || [],
          subtypes:         data.subtypes || tl.split(" — ")[1]?.trim().split(" ").filter(Boolean) || [],
          oracle_text:      data.oracle_text || "",
          power:            data.power ?? null,
          toughness:        data.toughness ?? null,
          rarity:           data.rarity || "unknown",
          image_uris:       { normal: data.image_normal || data.card_faces?.[0]?.image_normal || "" },
          card_faces:       data.card_faces || null,
          tags:             [],
        };
      }
      if (data.error === "Card not found") return null;
    }
  } catch {}

  return null;
}

function computeCardIssues(card, cardTags, allCards) {
  const issues = [];

  // Duplicate check
  const copies = allCards.filter(c => c.name.toLowerCase() === card.name.toLowerCase());
  const isEditing = allCards.some(c => c.id === card.id);
  const dupeCount = isEditing ? copies.length : copies.length + 1;
  if (dupeCount > 1) {
    issues.push({ msg: `${dupeCount} copies of this card have been added. Remove extra copies.`, color: "#c0392b" });
  }

  // No guild
  if (!cardTags?.guild) {
    issues.push({ msg: "This card is not yet assigned to a guild, edit to assign.", color: "#c8a000" });
  }

  // No tags
  if (!cardTags?.ignore_tags) {
    const hasTag = [
      cardTags?.main_archetype, cardTags?.main_archetype_support,
      cardTags?.tribal_archetype, cardTags?.tribal_archetype_support,
      cardTags?.utility,
    ].some(t => t && t.length > 0);
    if (!hasTag) {
      issues.push({ msg: "This card has no tagging. Edit to add tags or ignore them.", color: "#c8a000" });
    }
  }

  return issues;
}



function parseBulkList(text) {
  return text.split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(l => {
      // 1. Strip foil markers: *F*, *FOIL*, [F], (foil)
      let s = l.replace(/\s*\*F\*|\*FOIL\*/gi, "").replace(/\s*\[F\]|\(foil\)/gi, "").trim();

      // 2. Extract leading quantity: "1 " or "1x "
      let qty = 1;
      const qtyMatch = s.match(/^(\d+)x?\s+/i);
      if (qtyMatch) { qty = parseInt(qtyMatch[1]) || 1; s = s.slice(qtyMatch[0].length).trim(); }

      // 3. Extract set code in parens/brackets: (MH2), [MH2] — 2-6 alphanumeric chars
      let setCode = null;
      s = s.replace(/\s*[\(\[]([A-Za-z0-9]{2,6})[\)\]]/g, (_, code) => {
        setCode = code.toLowerCase();
        return "";
      }).trim();

      // 4. Strip collector number at end: "290", "EMA-157", "A25-82", "DD2-23", "42"
      //    Format: optional letters+digits prefix, dash, digits (e.g. A25-82, DD2-23, EMA-157)
      //    Or just digits (e.g. 290, 42)
      s = s.replace(/\s+[A-Za-z0-9]{1,4}-\d+\s*$/i, "").trim();  // prefix-number (A25-82, EMA-157)
      s = s.replace(/\s+\d+\s*$/, "").trim();                      // plain number (290, 42)

      // 6. Normalize split card names: keep full name e.g. "Fire // Ice"
      s = s.replace(/\s*\/\/\s*/g, " // ").trim();

      if (!s) return null;
      return { qty, name: s, setCode };
    })
    .filter(Boolean);
}

function BulkImportTab({ onAddCard, onClose }) {
  const [text,    setText]    = useState("");
  const [lines,   setLines]   = useState([]);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  const total   = lines.reduce((s, l) => s + l.qty, 0);
  const found   = lines.filter(l => results[l.name.toLowerCase()]?.card).reduce((s, l) => s + l.qty, 0);
  const allDone = lines.length > 0 && lines.every(l => results[l.name.toLowerCase()]);

  async function handlePreview() {
    const parsed = parseBulkList(text);
    setLines(parsed);
    setResults({});
    setDone(false);
    if (!parsed.length) return;
    setLoading(true);

    // Deduplicate names
    const uniqueLines = parsed.filter((l, i, arr) => arr.findIndex(x => x.name.toLowerCase() === l.name.toLowerCase()) === i);

    // Build identifiers for /cards/collection (max 75 per batch)
    const identifiers = uniqueLines.map(l => l.setCode ? { name: l.name, set: l.setCode } : { name: l.name });
    const BATCH = 75;
    const allFound = {};
    const allNotFound = new Set();

    for (let i = 0; i < identifiers.length; i += BATCH) {
      const batch = identifiers.slice(i, i + BATCH);
      try {
        const res  = await fetch("/api/scryfall-bulk", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ identifiers: batch }),
        });
        const data = await res.json();
        (data.found || []).forEach(card => { allFound[card.name.toLowerCase()] = card; });
        (data.not_found || []).forEach(name => allNotFound.add(name.toLowerCase()));
      } catch {
        batch.forEach(id => allNotFound.add((id.name || "").toLowerCase()));
      }
    }

    // Build results map
    const newResults = {};
    uniqueLines.forEach(line => {
      const key  = line.name.toLowerCase();
      const raw  = allFound[key];
      if (raw) {
        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        newResults[key] = { card: {
          id:               localId,
          scryfall_id:      raw.id || "",
          name:             raw.name,
          set:              raw.set || "",
          set_name:         raw.set_name || "",
          cube_set_override: null,
          mana_cost:        raw.mana_cost || "",
          colors:           Array.isArray(raw.colors) ? raw.colors : [],
          cmc:              raw.cmc ?? 0,
          type_line:        raw.type_line || "",
          types:            raw.types || [],
          subtypes:         raw.subtypes || [],
          oracle_text:      raw.oracle_text || "",
          power:            raw.power ?? null,
          toughness:        raw.toughness ?? null,
          rarity:           raw.rarity || "unknown",
          image_uris:       { normal: raw.image_normal || raw.card_faces?.[0]?.image_normal || "" },
          card_faces:       raw.card_faces || null,
          tags:             { main_archetype: [], main_archetype_support: [], tribal_archetype: [], tribal_archetype_support: [], utility: [], guild: "", ignore_tags: false },
        }};
      } else {
        newResults[key] = { card: null };
      }
    });

    setResults(newResults);
    setLoading(false);
    setDone(true);
  }

  function handleImport() {
    lines.forEach(line => {
      const key  = line.name.toLowerCase();
      const card = results[key]?.card;
      if (!card) return;
      for (let i = 0; i < line.qty; i++) {
      onAddCard({ ...card, id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, tags: { main_archetype: [], main_archetype_support: [], tribal_archetype: [], tribal_archetype_support: [], utility: [], guild: "", ignore_tags: false } });
      }
    });
    onClose();
  }

  const rowStyle = { display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid #1a1a1a", fontSize: "13px" };

  return (
    <div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setLines([]); setResults({}); setDone(false); }}
        placeholder={"1 Lightning Bolt\n1 Ponder (M10)\n2 Counterspell"}
        style={{
          width: "100%", boxSizing: "border-box", minHeight: "140px",
          backgroundColor: "#000", border: "1px solid #333", borderRadius: "4px",
          color: "#fff", fontSize: "13px", padding: "10px 12px",
          fontFamily: "'Courier New', monospace", resize: "vertical", outline: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", marginBottom: "16px" }}>
        <span style={{ fontSize: "11px", color: "#aaa" }}>
          {text.trim() ? `${parseBulkList(text).length} lines detected` : "Paste your card list above"}
        </span>
        <button onClick={handlePreview} disabled={!text.trim() || loading}
          style={{ ...S.btn, backgroundColor: "#222", borderColor: "#444", opacity: text.trim() && !loading ? 1 : 0.4 }}>
          {loading ? "Looking up..." : "Preview"}
        </button>
      </div>

      {lines.length > 0 && (
        <div>
          {lines.map((line, i) => {
            const key    = line.name.toLowerCase();
            const result = results[key];
            const status = !result ? "loading" : result.card ? "found" : "not_found";
            return (
              <div key={i} style={rowStyle}>
                <span style={{ fontSize: "12px", color: "#aaa", minWidth: "20px", textAlign: "right" }}>{line.qty}×</span>
                <span style={{ flex: 1, color: status === "not_found" ? "#d94a4a" : "#fff" }}>{line.name}</span>
                {line.setCode && <span style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase" }}>{line.setCode}</span>}
                {status === "loading"   && <span style={{ fontSize: "11px", color: "#aaa" }}>⏳</span>}
                {status === "found"     && <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><ManaCost cost={result.card.mana_cost} size={14} /><span style={{ fontSize: "11px", color: "#4a9d5a" }}>{"✓"}</span></span>}
                {status === "not_found" && <span style={{ fontSize: "11px", color: "#d94a4a" }}>✗ not found</span>}
              </div>
            );
          })}
          {allDone && (
            <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "#aaa" }}>{found} of {total} card{total !== 1 ? "s" : ""} ready to import</span>
              <button onClick={handleImport} disabled={found === 0}
                style={{ ...S.btn, backgroundColor: found > 0 ? "#222" : "transparent", borderColor: "#444", opacity: found > 0 ? 1 : 0.4 }}>
                Add {found} card{found !== 1 ? "s" : ""} to Cube
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ADD CARD MODAL ───────────────────────────────────────────────────────────

function AddCardModal({ onClose, onAddCard, tagDB, setTagDB, allCards, db }) {
  const [tab,      setTab]      = useState("single");
  const [query,    setQuery]    = useState("");
  const [card,     setCard]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errMsg,   setErrMsg]   = useState("");
  const [cardTags, setCardTags] = useState({
    main_archetype: [], main_archetype_support: [],
    tribal_archetype: [], tribal_archetype_support: [],
    utility: [], guild: "", ignore_tags: false,
  });

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setCard(null);
    setNotFound(false);
    setErrMsg("");
    try {
      const result = await fetchCardFromAPI(query.trim(), null);
      if (!result) { setNotFound(true); return; }
      setCard(result);
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
            cursor: "pointer", color: "#aaa", fontSize: "20px",
            lineHeight: 1, padding: "4px 8px", minWidth: "44px",
            textAlign: "center", minHeight: "44px", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>✕</div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 16px" }}>
          {tab === "single" && (
            <>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <input
                    style={{ ...S.input, width: "100%", boxSizing: "border-box", paddingRight: query ? "30px" : "12px" }}
                    placeholder="Card name..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKey}
                    autoFocus
                  />
                  {query && <span onClick={() => setQuery("")}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#aaa", fontSize: "16px", lineHeight: 1 }}>×</span>}
                </div>
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
                <div style={{ color: "#aaa", fontSize: "13px", marginTop: "20px" }}>No card found.</div>
              )}

              {card && !loading && (() => {
                const issues = computeCardIssues(card, cardTags, allCards || []);
                return issues.length > 0 && (
                  <div style={{ marginTop: "20px", borderRadius: "4px", overflow: "hidden" }}>
                    {issues.map((issue, i) => (
                      <div key={i} style={{ backgroundColor: issue.color, padding: "8px 12px" }}>
                        <div style={{ fontSize: "12px", color: "#fff" }}>{issue.msg}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {card && !loading && <CardPreview card={card} />}
              {card && !loading && (
                <CardTagging cardTags={cardTags} setCardTags={setCardTags} tagDB={tagDB} setTagDB={setTagDB} cardColors={card.colors} cardTypeLine={card.type_line} db={db} />
              )}

              {card && !loading && (() => {
                const tempCard = { ...card, tags: cardTags };
                const r = getCardRating(tempCard, allCards || []);
                return (
                  <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cube Rating</span>
                    <StarRating stars={r.stars} label={r.label} size={18} showLabel />
                    {r.raw !== undefined && <span style={{ fontSize: "11px", color: "#aaa" }}>score {r.raw}</span>}
                  </div>
                );
              })()}

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
            <BulkImportTab onAddCard={onAddCard} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CARDS PAGE ───────────────────────────────────────────────────────────────

// ─── TAG COLUMN (read-only) ───────────────────────────────────────────────────

function TagColumn({ label, tags }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ minWidth: "80px" }}>
      <div style={{ fontSize: "9px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "3px" }}>{label}</div>
      {tags.map(t => (
        <div key={t} style={{ fontSize: "11px", color: "#333", lineHeight: "1.5" }}>{t}</div>
      ))}
    </div>
  );
}

// ─── CARD ITEM ────────────────────────────────────────────────────────────────

function CardItem({ card, onEdit, issues, allCards, bulkEditMode, isSelected, onToggleSelect }) {
  const tags      = card.tags || {};
  const guild     = tags.guild;
  const guildData = GUILDS_LIST.find(g => g.name === guild);
  const rating    = getCardRating(card, allCards || []);
  const hasIssues = issues && issues.length > 0;

  const handleClick = (e) => {
    if (bulkEditMode) { e.stopPropagation(); onToggleSelect(card.id); }
  };

  return (
    <div style={{ marginBottom: "8px" }} onClick={handleClick}>
      <div style={{
        backgroundColor: "#111",
        border: isSelected ? "4px solid #c0392b" : "1px solid #222",
        borderRadius: hasIssues ? "4px 4px 0 0" : "4px",
        padding: isSelected ? "9px 11px" : "12px 14px",
        display: "flex", gap: "12px", alignItems: "stretch",
        cursor: bulkEditMode ? "pointer" : "default",
      }}>
        {/* Image */}
        <div style={{
          width: "44px", height: "62px", borderRadius: "4px", flexShrink: 0, overflow: "hidden",
          background: card.colors?.length
            ? `linear-gradient(135deg, ${card.colors.map(c => MANA_STYLE[c]?.bg || "#ccc").join(", ")})`
            : "#1a1a1a",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {card.image_uris?.normal
            ? <img src={card.image_uris.normal} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ display: "flex", flexWrap: "wrap", gap: "1px", justifyContent: "center" }}>
                {(card.colors || []).map(c => <ManaIcon key={c} c={c} size={14} />)}
              </span>
          }
        </div>

        {/* Center content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: "700", color: "#fff", fontSize: "14px", marginBottom: "4px" }}>{card.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px", flexWrap: "wrap" }}>
            <ManaCost cost={card.mana_cost} size={14} />
            {card.type_line && <span style={{ fontSize: "11px", color: "#aaa" }}>{card.type_line}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em" }}>Rank</span>
            <StarRating stars={rating.stars} label={rating.label} size={12} />
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-end", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {guild && <span style={{ fontSize: "11px", color: "#aaa" }}>{guildData ? guildData.name : guild}</span>}
            {guildData && (
              <span style={{ display: "inline-flex", gap: "3px", alignItems: "center" }}>
                {guildData.colors.split("").map(c => (
                  <span key={c} style={{
                    width: "7px", height: "7px", borderRadius: "50%",
                    backgroundColor: MANA_STYLE[c]?.bg || "#888",
                    border: `1px solid ${MANA_STYLE[c]?.ring || "#aaa"}`,
                    display: "inline-block", flexShrink: 0,
                  }} />
                ))}
              </span>
            )}
          </div>
          {bulkEditMode ? (
            <div style={{
              width: "22px", height: "22px", borderRadius: "4px", flexShrink: 0,
              border: isSelected ? "2px solid #c0392b" : "2px solid #444",
              backgroundColor: isSelected ? "#c0392b" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isSelected && <span style={{ color: "#fff", fontSize: "13px", lineHeight: 1 }}>✓</span>}
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onEdit(card); }} style={{
              backgroundColor: "transparent", border: "1px solid #333",
              borderRadius: "4px", width: "32px", height: "32px",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 1.5L12.5 4.5L4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="#aaa" strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M8 3L11 6" stroke="#aaa" strokeWidth="1.3"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {hasIssues && (
        <div style={{ borderRadius: "0 0 4px 4px", overflow: "hidden" }}>
          {issues.map((issue, i) => (
            <div key={i} style={{ backgroundColor: issue.color, padding: "6px 14px" }}>
              <div style={{ fontSize: "11px", color: "#fff", letterSpacing: "0.02em" }}>{issue.msg}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkTagBox({ label, existing, added, removed, pool, onToggleRemove, onAdd, onRemoveAdded, normalizeMode = false, poolMeta = {} }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const allShown = [...existing, ...added.filter(t => !existing.includes(t))];
  const filtered = pool.filter(t => t.toLowerCase().includes(search.toLowerCase()) && !allShown.includes(t));
  const canCreate = search.trim() && !pool.some(t => t.toLowerCase() === search.trim().toLowerCase()) && !allShown.includes(search.trim().toLowerCase());

  function handleAdd(tag) { onAdd(tag.toLowerCase()); setSearch(""); setOpen(false); }

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
      <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px", minHeight: "20px" }}>
        {allShown.length === 0 && <span style={{ fontSize: "12px", color: "#444" }}>none</span>}
        {existing.map(tag => {
          const isRemoved = removed.has(tag);
          const bg = isRemoved ? "rgba(192,57,43,0.15)" : normalizeMode ? "rgba(74,157,90,0.15)" : "#1a1a1a";
          const borderColor = isRemoved ? "#c0392b" : normalizeMode ? "#4a9d5a" : "#333";
          const textColor = isRemoved ? "#c0392b" : normalizeMode ? "#4a9d5a" : "#aaa";
          return (
            <span key={tag} onClick={() => onToggleRemove(tag)} style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              backgroundColor: bg, border: `1px solid ${borderColor}`,
              borderRadius: "4px", padding: "2px 8px", fontSize: "11px",
              color: textColor,
              textDecoration: isRemoved ? "line-through" : "none",
              cursor: "pointer",
            }}>
              {tag}
              <span style={{ fontSize: "14px", lineHeight: 1 }}>×</span>
            </span>
          );
        })}
        {added.filter(t => !existing.includes(t)).map(tag => (
          <span key={tag} onClick={() => onRemoveAdded(tag)} style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            backgroundColor: "rgba(74,157,90,0.15)", border: "1px solid #4a9d5a",
            borderRadius: "4px", padding: "2px 8px", fontSize: "11px", color: "#4a9d5a",
            cursor: "pointer",
          }}>
            {tag}
            <span style={{ fontSize: "14px", lineHeight: 1 }}>×</span>
          </span>
        ))}
      </div>
      <div onClick={() => setOpen(o => !o)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        <span style={{ fontSize: "14px" }}>+</span> add
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", marginTop: "4px", overflow: "hidden" }}>
          <div style={{ position: "relative" }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && filtered.length === 1) handleAdd(filtered[0]); }}
              placeholder="Search..."
              style={{ ...S.input, width: "100%", borderRadius: 0, border: "none", borderBottom: "1px solid #333", boxSizing: "border-box", fontSize: "12px", padding: "8px 30px 8px 10px" }} />
            {search && <span onClick={() => setSearch("")} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#aaa", fontSize: "16px", lineHeight: 1 }}>×</span>}
          </div>
          <div style={{ maxHeight: "160px", overflowY: "auto" }}>
            {filtered.length === 0 && !canCreate && <div style={{ padding: "8px 10px", fontSize: "12px", color: "#aaa" }}>No tags found.</div>}
            {filtered.map(t => (
              <div key={t} onClick={() => handleAdd(t)}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#222"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                style={{ padding: "8px 10px", fontSize: "12px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span>{t}</span>
                {poolMeta[t] && <span style={{ fontSize: "10px", color: "#555", flexShrink: 0 }}>{poolMeta[t]}</span>}
              </div>
            ))}
          </div>
          {canCreate && (
            <div onClick={() => handleAdd(search.trim())}
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

function AssignArchetypesModal({ cards, selectedCards, tagDB, setTagDB, onUpdateCard, onBulkUpdateCards, onClose, onDone, S }) {
  const selectedList = cards.filter(c => selectedCards.has(c.id));

  const unionTags = {
    main_archetype: [], main_archetype_support: [],
    tribal_archetype: [], tribal_archetype_support: [], utility: []
  };
  ["main_archetype","main_archetype_support","tribal_archetype","tribal_archetype_support","utility"].forEach(key => {
    const all = new Set();
    selectedList.forEach(c => (c.tags?.[key] || []).forEach(t => all.add(t)));
    unionTags[key] = [...all];
  });

  const [mode, setMode] = React.useState(null);
  const [descOpen, setDescOpen] = React.useState(null);

  // Add/Remove state
  const [removedTags, setRemovedTags] = React.useState({});
  const [addedTags, setAddedTags] = React.useState({});

  // Normalize state (starts with union tags all shown as green)
  const [removedNorm, setRemovedNorm] = React.useState({});
  const [addedNorm, setAddedNorm] = React.useState({});

  // Replace state (starts empty)
  const [replaceTags, setReplaceTags] = React.useState({ main_archetype:[], main_archetype_support:[], tribal_archetype:[], tribal_archetype_support:[], utility:[] });

  const resetModeState = () => {
    setRemovedTags({}); setAddedTags({});
    setRemovedNorm({}); setAddedNorm({});
    setReplaceTags({ main_archetype:[], main_archetype_support:[], tribal_archetype:[], tribal_archetype_support:[], utility:[] });
  };

  const MODES = [
    {
      id: "add_remove",
      title: "Add / Remove",
      desc: "This option will add tags to all selected cards. The removed tags will be deleted from all selected cards that are using them. Remaining tags will not be affected in single card instances: they will be still present if they were present before editing the tags and vice-versa."
    },
    {
      id: "normalize",
      title: "Normalize",
      desc: "You will see the sum of current tags assigned to selected cards. You may add and remove them. When you confirm, all tags in each selected card will be replaced with the edited tags list. Each card will have the same tags."
    },
    {
      id: "replace",
      title: "Replace",
      desc: "Start from scratch: add tags as you can do in single card edit. Existing tags will be replaced by new tags. Each card will have the same tags."
    },
  ];

  const TAG_KEYS = ["main_archetype","main_archetype_support","tribal_archetype","tribal_archetype_support","utility"];

  const toggleRemove = (cat, tag) => {
    setRemovedTags(prev => {
      const set = new Set(prev[cat] || []);
      set.has(tag) ? set.delete(tag) : set.add(tag);
      return { ...prev, [cat]: set };
    });
  };

  const addTag = (cat, tag) => {
    if (!tag) return;
    setAddedTags(prev => {
      const arr = prev[cat] || [];
      if (arr.includes(tag)) return prev;
      return { ...prev, [cat]: [...arr, tag] };
    });
  };

  const removeAdded = (cat, tag) => {
    setAddedTags(prev => ({ ...prev, [cat]: (prev[cat] || []).filter(t => t !== tag) }));
  };

  const handleConfirm = () => {
    const newMain = new Set(tagDB.main_archetypes || []);
    const newTribal = new Set(tagDB.tribal_archetypes || []);
    const newUtility = new Set(tagDB.utility || []);
    let updatedCards = [];

    if (mode === "add_remove") {
      ["main_archetype","main_archetype_support"].forEach(k => (addedTags[k]||[]).forEach(t => newMain.add(t)));
      ["tribal_archetype","tribal_archetype_support"].forEach(k => (addedTags[k]||[]).forEach(t => newTribal.add(t)));
      (addedTags.utility||[]).forEach(t => newUtility.add(t));
      updatedCards = selectedList.map(card => {
        const newTags = { ...(card.tags || {}) };
        TAG_KEYS.forEach(key => {
          let tags = [...(newTags[key] || [])];
          tags = tags.filter(t => !(removedTags[key] || new Set()).has(t));
          (addedTags[key] || []).forEach(t => { if (!tags.includes(t)) tags.push(t); });
          newTags[key] = tags;
        });
        return { ...card, tags: newTags };
      });
    } else if (mode === "normalize") {
      ["main_archetype","main_archetype_support"].forEach(k => (addedNorm[k]||[]).forEach(t => newMain.add(t)));
      ["tribal_archetype","tribal_archetype_support"].forEach(k => (addedNorm[k]||[]).forEach(t => newTribal.add(t)));
      (addedNorm.utility||[]).forEach(t => newUtility.add(t));
      updatedCards = selectedList.map(card => {
        const newTags = { ...(card.tags || {}) };
        TAG_KEYS.forEach(key => {
          const base = [...(unionTags[key]||[]), ...(addedNorm[key]||[]).filter(t => !(unionTags[key]||[]).includes(t))];
          newTags[key] = base.filter(t => !(removedNorm[key] || new Set()).has(t));
        });
        return { ...card, tags: newTags };
      });
    } else if (mode === "replace") {
      ["main_archetype","main_archetype_support"].forEach(k => (replaceTags[k]||[]).forEach(t => newMain.add(t)));
      ["tribal_archetype","tribal_archetype_support"].forEach(k => (replaceTags[k]||[]).forEach(t => newTribal.add(t)));
      (replaceTags.utility||[]).forEach(t => newUtility.add(t));
      updatedCards = selectedList.map(card => ({
        ...card, tags: { ...(card.tags||{}), ...replaceTags }
      }));
    }

    if (updatedCards.length > 0) {
      setTagDB({ main_archetypes:[...newMain], tribal_archetypes:[...newTribal], utility:[...newUtility] });
      onBulkUpdateCards(updatedCards);
    }
    onDone();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: "6px", padding: "28px", width: "600px", maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <span style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>Assign Archetypes</span>
          <span onClick={onClose} style={{ cursor: "pointer", color: "#aaa", fontSize: "20px", lineHeight: 1 }}>✕</span>
        </div>

        {/* Mode selection */}
        <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Choose how you wish to edit tags</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
          {MODES.map(m => (
            <div key={m.id}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div onClick={() => { setMode(m.id); resetModeState(); }}
                  style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${mode === m.id ? "#4a90d9" : "#444"}`, backgroundColor: mode === m.id ? "#4a90d9" : "transparent", cursor: "pointer", flexShrink: 0 }} />
                <span style={{ fontSize: "13px", color: mode === m.id ? "#fff" : "#aaa", fontWeight: mode === m.id ? "600" : "400", cursor: "pointer" }}
                  onClick={() => { setMode(m.id); resetModeState(); }}>
                  {m.title}
                </span>
                <span onClick={() => setDescOpen(descOpen === m.id ? null : m.id)}
                  style={{ cursor: "pointer", color: "#4a90d9", fontWeight: "700", fontSize: "12px", border: "1px solid #333", borderRadius: "50%", width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>?</span>
              </div>
              {descOpen === m.id && (
                <div style={{ marginLeft: "26px", marginTop: "6px", fontSize: "12px", color: "#aaa", lineHeight: "1.6", borderLeft: "2px solid #333", paddingLeft: "10px" }}>
                  {m.desc}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add / Remove editor */}
        {mode === "add_remove" && (
          <div>
            <hr style={{ ...S.divider, marginBottom: "16px" }} />
            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
              {[
                { color: "#4a9d5a", border: "#4a9d5a", label: "Add to all cards" },
                { color: "#c0392b", border: "#c0392b", label: "Remove from all cards" },
                { color: "#aaa",    border: "#333",    label: "Unaffected tags" },
              ].map(({ color, border, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "2px", backgroundColor: `${color}22`, border: `1px solid ${border}`, flexShrink: 0 }} />
                  <span style={{ fontSize: "11px", color: "#aaa" }}>{label}</span>
                </div>
              ))}
            </div>
            {/* Main Archetype */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" }}>Main Archetype</div>
              <div style={{ display: "flex", gap: "12px" }}>
                <BulkTagBox label="Active"
                  existing={unionTags.main_archetype} added={addedTags.main_archetype || []} removed={removedTags.main_archetype || new Set()}
                  pool={PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)}
                  onToggleRemove={t => toggleRemove("main_archetype", t)}
                  onAdd={t => addTag("main_archetype", t)}
                  onRemoveAdded={t => removeAdded("main_archetype", t)} />
                <BulkTagBox label="Support"
                  existing={unionTags.main_archetype_support} added={addedTags.main_archetype_support || []} removed={removedTags.main_archetype_support || new Set()}
                  pool={PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)}
                  onToggleRemove={t => toggleRemove("main_archetype_support", t)}
                  onAdd={t => addTag("main_archetype_support", t)}
                  onRemoveAdded={t => removeAdded("main_archetype_support", t)} />
              </div>
            </div>
            {/* Tribal Archetype */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" }}>Tribal Archetype</div>
              <div style={{ display: "flex", gap: "12px" }}>
                <BulkTagBox label="Active"
                  existing={unionTags.tribal_archetype} added={addedTags.tribal_archetype || []} removed={removedTags.tribal_archetype || new Set()}
                  pool={PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name)}
                  onToggleRemove={t => toggleRemove("tribal_archetype", t)}
                  onAdd={t => addTag("tribal_archetype", t)}
                  onRemoveAdded={t => removeAdded("tribal_archetype", t)} />
                <BulkTagBox label="Support"
                  existing={unionTags.tribal_archetype_support} added={addedTags.tribal_archetype_support || []} removed={removedTags.tribal_archetype_support || new Set()}
                  pool={PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name)}
                  onToggleRemove={t => toggleRemove("tribal_archetype_support", t)}
                  onAdd={t => addTag("tribal_archetype_support", t)}
                  onRemoveAdded={t => removeAdded("tribal_archetype_support", t)} />
              </div>
            </div>
            {/* Utility */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" }}>Utility</div>
              <div style={{ display: "flex" }}>
                <BulkTagBox label=""
                  existing={unionTags.utility} added={addedTags.utility || []} removed={removedTags.utility || new Set()}
                  pool={[...new Set(UTILITY_DATA.map(d => d.sub))].sort()} poolMeta={UTILITY_CAT_MAP}
                  onToggleRemove={t => toggleRemove("utility", t)}
                  onAdd={t => addTag("utility", t)}
                  onRemoveAdded={t => removeAdded("utility", t)} />
                <div style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        )}

        {/* Normalize editor */}
        {mode === "normalize" && (
          <div>
            <hr style={{ ...S.divider, marginBottom: "16px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
              {[
                { color: "#4a9d5a", border: "#4a9d5a", label: "Replace in all cards" },
                { color: "#c0392b", border: "#c0392b", label: "Remove from all cards" },
              ].map(({ color, border, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "2px", backgroundColor: `${color}22`, border: `1px solid ${border}`, flexShrink: 0 }} />
                  <span style={{ fontSize: "11px", color: "#aaa" }}>{label}</span>
                </div>
              ))}
            </div>
            {[
              { key: "main_archetype", key2: "main_archetype_support", title: "Main Archetype" },
              { key: "tribal_archetype", key2: "tribal_archetype_support", title: "Tribal Archetype" },
            ].map(({ key, key2, title }) => (
              <div key={key} style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" }}>{title}</div>
                <div style={{ display: "flex", gap: "12px" }}>
                  {[{ k: key, lbl: "Active" }, { k: key2, lbl: "Support" }].map(({ k, lbl }) => (
                    <BulkTagBox key={k} label={lbl}
                      existing={[...(unionTags[k]||[]), ...(addedNorm[k]||[]).filter(t => !(unionTags[k]||[]).includes(t))]}
                      added={[]}
                      removed={removedNorm[k] || new Set()}
                      pool={k.includes("tribal") ? PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name) : PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)}
                      normalizeMode={true}
                      onToggleRemove={t => setRemovedNorm(p => { const s = new Set(p[k]||[]); s.has(t)?s.delete(t):s.add(t); return {...p,[k]:s}; })}
                      onAdd={t => setAddedNorm(p => { const a=p[k]||[]; return a.includes(t)?p:{...p,[k]:[...a,t]}; })}
                      onRemoveAdded={t => setAddedNorm(p => ({...p,[k]:(p[k]||[]).filter(x=>x!==t)}))} />
                  ))}
                </div>
              </div>
            ))}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" }}>Utility</div>
              <div style={{ display: "flex" }}>
                <BulkTagBox label=""
                  existing={[...(unionTags.utility||[]), ...(addedNorm.utility||[]).filter(t => !(unionTags.utility||[]).includes(t))]}
                  added={[]} removed={removedNorm.utility || new Set()}
                  pool={[...new Set(UTILITY_DATA.map(d => d.sub))].sort()} poolMeta={UTILITY_CAT_MAP} normalizeMode={true}
                  onToggleRemove={t => setRemovedNorm(p => { const s=new Set(p.utility||[]); s.has(t)?s.delete(t):s.add(t); return {...p,utility:s}; })}
                  onAdd={t => setAddedNorm(p => { const a=p.utility||[]; return a.includes(t)?p:{...p,utility:[...a,t]}; })}
                  onRemoveAdded={t => setAddedNorm(p => ({...p,utility:(p.utility||[]).filter(x=>x!==t)}))} />
                <div style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        )}

        {/* Replace editor */}
        {mode === "replace" && (
          <div>
            <hr style={{ ...S.divider, marginBottom: "16px" }} />
            <p style={{ fontSize: "12px", color: "#aaa", marginBottom: "20px", lineHeight: "1.6", borderLeft: "3px solid #333", paddingLeft: "10px" }}>
              All tags will replace existing ones in each selected card.
            </p>
            {[
              { key: "main_archetype", key2: "main_archetype_support", title: "Main Archetype", pool: "main_archetypes" },
              { key: "tribal_archetype", key2: "tribal_archetype_support", title: "Tribal Archetype", pool: "tribal_archetypes" },
            ].map(({ key, key2, title, pool }) => (
              <div key={key} style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" }}>{title}</div>
                <div style={{ display: "flex", gap: "12px" }}>
                  {[{ k: key, lbl: "Active" }, { k: key2, lbl: "Support" }].map(({ k, lbl }) => (
                    <BulkTagBox key={k} label={lbl}
                      existing={[]} added={replaceTags[k]||[]} removed={new Set()}
                      pool={pool === "tribal_archetypes" ? PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name) : PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)}
                      onToggleRemove={() => {}}
                      onAdd={t => setReplaceTags(p => { const a=p[k]||[]; return a.includes(t)?p:{...p,[k]:[...a,t]}; })}
                      onRemoveAdded={t => setReplaceTags(p => ({...p,[k]:(p[k]||[]).filter(x=>x!==t)}))} />
                  ))}
                </div>
              </div>
            ))}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px", fontWeight: "700" }}>Utility</div>
              <div style={{ display: "flex" }}>
                <BulkTagBox label="" existing={[]} added={replaceTags.utility||[]} removed={new Set()}
                  pool={[...new Set(UTILITY_DATA.map(d => d.sub))].sort()} poolMeta={UTILITY_CAT_MAP}
                  onToggleRemove={() => {}}
                  onAdd={t => setReplaceTags(p => { const a=p.utility||[]; return a.includes(t)?p:{...p,utility:[...a,t]}; })}
                  onRemoveAdded={t => setReplaceTags(p => ({...p,utility:(p.utility||[]).filter(x=>x!==t)}))} />
                <div style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {mode && (
          <div style={{ marginTop: "24px" }}>
            <p style={{ fontSize: "12px", color: "#d94a4a", marginBottom: "12px" }}>This operation cannot be undone, please check everything is ok before clicking "Confirm".</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ ...S.btn, padding: "8px 16px", fontSize: "13px", borderColor: "#444", color: "#aaa" }}>Cancel</button>
              <button onClick={handleConfirm} style={{ ...S.btn, padding: "8px 16px", fontSize: "13px", borderColor: "#4a90d9", color: "#4a90d9" }}>Confirm</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AssignGuildModal({ cards, selectedCards, db, onUpdateCard, onClose, onDone, S }) {
  const selectedCardsList = cards.filter(c => selectedCards.has(c.id));
  const availableGuilds = [
    ...GUILDS_LIST.map(g => g.name),
    ...(db.colorless > 0 ? ["Colorless"] : []),
    ...(db.wildcards > 0 ? ["Wildcards"] : []),
  ];
  const guildCounts = {};
  selectedCardsList.forEach(c => {
    const g = c.tags?.guild || "__unassigned__";
    guildCounts[g] = (guildCounts[g] || 0) + 1;
  });
  const unassignedCount = guildCounts["__unassigned__"] || 0;
  const [assignTarget, setAssignTarget] = React.useState("");

  const doAssign = () => {
    selectedCardsList.forEach(c => {
      const updated = { ...c, tags: { ...(c.tags || {}), guild: isUnassign ? "" : assignTarget } };
      onUpdateCard(updated);
    });
    onDone();
  };

  const isUnassign = assignTarget === "__unassign__";
  const assignLabel = isUnassign ? "Unassign" : "Assign";

  const GuildHeader = ({ name }) => {
    const gData = GUILDS_LIST.find(g => g.name === name);
    return (
      <th style={{ ...S.th, padding: "4px 8px", textAlign: "center", verticalAlign: "bottom" }}>
        <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", fontSize: "10px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          {gData && gData.colors.split("").map(c => (
            <span key={c} style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: MANA_STYLE[c]?.bg || "#888", border: `1px solid ${MANA_STYLE[c]?.ring || "#aaa"}`, display: "inline-block", flexShrink: 0 }} />
          ))}
          {name}
        </div>
      </th>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: "6px", padding: "28px", width: "600px", maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>Assign to Guild</span>
          <span onClick={onClose} style={{ cursor: "pointer", color: "#aaa", fontSize: "20px", lineHeight: 1 }}>✕</span>
        </div>
        <p style={{ fontSize: "12px", color: "#aaa", marginBottom: "20px", lineHeight: "1.6", borderLeft: "3px solid #333", paddingLeft: "10px" }}>
          Assigning a guild will replace currently assigned guilds and will assign unassigned cards to the selected guild.
        </p>
        <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Selected cards by current guild</div>
        <div style={{ overflowX: "auto", marginBottom: "20px" }}>
          <table style={{ ...S.table, width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {availableGuilds.map(g => <GuildHeader key={g} name={g} />)}
                <th style={{ ...S.th, padding: "4px 8px", textAlign: "center", verticalAlign: "bottom", backgroundColor: "#1a1a1a" }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", fontSize: "10px" }}>Unassigned</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {availableGuilds.map(g => (
                  <td key={g} style={{ ...S.td(), padding: "8px 10px", textAlign: "center", color: guildCounts[g] > 0 ? "#fff" : "#444", fontWeight: guildCounts[g] > 0 ? "700" : "400" }}>
                    {guildCounts[g] || 0}
                  </td>
                ))}
                <td style={{ ...S.td(), padding: "8px 10px", textAlign: "center", backgroundColor: "#1a1a1a", color: unassignedCount > 0 ? "#fff" : "#444", fontWeight: unassignedCount > 0 ? "700" : "400" }}>
                  {unassignedCount}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Assign to</div>
        <div style={{ marginBottom: "20px" }}>
          <GuildSelect
            value={assignTarget === "__none__" ? "" : assignTarget}
            guilds={GUILDS_LIST}
            wildcards={db.wildcards}
            placeholder="Choose guild"
            onChange={v => { setAssignTarget(v || ""); }}
          />
        </div>
        <p style={{ fontSize: "12px", color: "#d94a4a", marginBottom: "16px" }}>This action cannot be undone. Check selected cards before assigning them.</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...S.btn, padding: "8px 16px", fontSize: "13px", borderColor: "#444", color: "#aaa" }}>Cancel</button>
          <button disabled={!assignTarget} onClick={doAssign} style={{ ...S.btn, padding: "8px 16px", fontSize: "13px", borderColor: assignTarget ? "#4a90d9" : "#444", color: assignTarget ? "#4a90d9" : "#aaa", opacity: assignTarget ? 1 : 0.4, cursor: assignTarget ? "pointer" : "not-allowed" }}>{assignLabel}</button>
        </div>
      </div>
    </div>
  );
}



function EditCardModal({ card, tagDB, setTagDB, allCards, db, onSave, onDelete, onClose }) {
  const DEFAULT_TAGS = {
    main_archetype: [], main_archetype_support: [],
    tribal_archetype: [], tribal_archetype_support: [],
    utility: [], guild: "", ignore_tags: false,
  };
  const [cardTags, setCardTags] = useState({ ...DEFAULT_TAGS, ...(card.tags || {}) });
  const [confirmDel,   setConfirmDel]   = useState(false);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)",
      zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "40px 16px 24px", overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: "#111", border: "1px solid #222", borderRadius: "4px",
        width: "100%", maxWidth: "600px", display: "flex", flexDirection: "column",
        maxHeight: "calc(100vh - 64px)", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderBottom: "1px solid #222",
          position: "sticky", top: 0, backgroundColor: "#111", zIndex: 1,
        }}>
          <div style={{ fontSize: "13px", color: "#fff", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Edit Card
          </div>
          <div onClick={onClose} style={{
            cursor: "pointer", color: "#aaa", fontSize: "20px", lineHeight: 1,
            padding: "4px 8px", minWidth: "44px", textAlign: "center",
            minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 16px" }}>
          {(() => {
            const issues = computeCardIssues(card, cardTags, allCards || []);
            return issues.length > 0 && (
              <div style={{ marginBottom: "16px", borderRadius: "4px", overflow: "hidden" }}>
                {issues.map((issue, i) => (
                  <div key={i} style={{ backgroundColor: issue.color, padding: "8px 12px" }}>
                    <div style={{ fontSize: "12px", color: "#fff" }}>{issue.msg}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <CardPreview card={card} />
          <CardTagging
            cardTags={cardTags} setCardTags={setCardTags}
            tagDB={tagDB} setTagDB={setTagDB}
            cardColors={card.colors} cardTypeLine={card.type_line}
            db={db}
          />

          {/* Rating preview */}
          {(() => {
            const tempCard = { ...card, tags: cardTags };
            const r = getCardRating(tempCard, (allCards || []).filter(c => c.id !== card.id).concat([tempCard]));
            return (
              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cube Rating</span>
                <StarRating stars={r.stars} label={r.label} size={18} showLabel />
                {r.raw !== undefined && <span style={{ fontSize: "11px", color: "#aaa" }}>score {r.raw} · {r.pct}th pct.</span>}
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 16px", borderTop: "1px solid #222",
          position: "sticky", bottom: 0, backgroundColor: "#111",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px",
        }}>
          {confirmDel
            ? <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                <span style={{ fontSize: "12px", color: "#d94a4a" }}>Delete this card?</span>
                <button onClick={() => setConfirmDel(false)} style={{ ...S.btn, fontSize: "12px", padding: "6px 14px" }}>Cancel</button>
                <button onClick={() => onDelete(card.id)} style={{ ...S.btn, fontSize: "12px", padding: "6px 14px", borderColor: "#d94a4a", color: "#d94a4a" }}>Confirm</button>
              </div>
            : <button onClick={() => setConfirmDel(true)} style={{ ...S.btn, fontSize: "12px", padding: "6px 14px", borderColor: "#d94a4a", color: "#d94a4a" }}>
                🗑 Delete
              </button>
          }
          {!confirmDel && (
            <button onClick={() => onSave({ ...card, tags: cardTags })} style={{ ...S.btn, fontSize: "12px", padding: "6px 20px", backgroundColor: "#222", borderColor: "#444" }}>
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CARDS PAGE ───────────────────────────────────────────────────────────────

// ─── FILTER UTILITIES ─────────────────────────────────────────────────────────

const EMPTY_FILTERS = {
  keywords: [],
  types: [], subtypes: [],
  main_archetype: [], main_archetype_support: [],
  tribal_archetype: [], tribal_archetype_support: [],
  utility: [], colors: [], colorless: false,
  mode: "and",
  minRank: 0,
  guilds: [],
  errors: { duplicate: false, missingGuild: false, missingTags: false },
};

function countFilters(f) {
  return (f.keywords || []).length +
    f.types.length + f.subtypes.length +
    f.main_archetype.length + f.main_archetype_support.length +
    f.tribal_archetype.length + f.tribal_archetype_support.length +
    f.utility.length + f.colors.length + (f.colorless ? 1 : 0) +
    (f.minRank > 0 ? 1 : 0) +
    (f.guilds || []).length +
    Object.values(f.errors || {}).filter(Boolean).length;
}

function derivePool(cards, extractor) {
  const s = new Set();
  cards.forEach(c => { const v = extractor(c); (Array.isArray(v) ? v : [v]).forEach(x => x && s.add(x)); });
  return [...s].sort();
}

function applyFilters(cards, f) {
  if (countFilters(f) === 0) return cards;
  const isAnd = f.mode === "and";
  const match = (pool, values) => {
    if (pool.length === 0) return null;
    return isAnd ? pool.every(p => values?.includes(p)) : pool.some(p => values?.includes(p));
  };

  const colorCheck = card => {
    if (f.colors.length === 0 && !f.colorless) return null;
    const cc = card.colors || [];
    const colorMatch = f.colors.length === 0 || (isAnd ? f.colors.every(c => cc.includes(c)) : f.colors.some(c => cc.includes(c)));
    const colorlessMatch = !f.colorless || cc.length === 0;
    if (f.colors.length > 0 && f.colorless) return isAnd ? colorMatch && colorlessMatch : colorMatch || colorlessMatch;
    if (f.colors.length > 0) return colorMatch;
    return colorlessMatch;
  };

  // Pre-compute duplicates for error filter
  const nameCounts = {};
  cards.forEach(c => { const k = c.name.toLowerCase(); nameCounts[k] = (nameCounts[k] || 0) + 1; });

  const rankCheck = card => {
    if (!f.minRank || f.minRank === 0) return null;
    const r = getCardRating(card, cards);
    const bars = r.stars * 2;
    return bars >= f.minRank;
  };

  const guildCheck = card => {
    const gs = f.guilds || [];
    if (gs.length === 0) return null;
    const cardGuild = card.tags?.guild || "";
    return isAnd ? gs.every(g => cardGuild === g) : gs.some(g => cardGuild === g);
  };

  const errorCheck = card => {
    const e = f.errors || {};
    if (!Object.values(e).some(Boolean)) return null;
    const tags = card.tags || {};
    const checks = [];
    if (e.duplicate)    checks.push(nameCounts[card.name.toLowerCase()] > 1);
    if (e.missingGuild) checks.push(!tags.guild);
    if (e.missingTags)  checks.push(!tags.ignore_tags && ![tags.main_archetype, tags.main_archetype_support, tags.tribal_archetype, tags.tribal_archetype_support, tags.utility].some(t => t?.length > 0));
    if (checks.length === 0) return null;
    return isAnd ? checks.every(Boolean) : checks.some(Boolean);
  };

  const keywordCheck = card => {
    const kws = f.keywords || [];
    if (kws.length === 0) return null;
    const text = ((card.name || "") + " " + (card.oracle_text || "")).toLowerCase();
    const checks = kws.map(kw => text.includes(kw.toLowerCase()));
    return isAnd ? checks.every(Boolean) : checks.some(Boolean);
  };

  return cards.filter(card => {
    const tags = card.tags || {};
    const checks = [
      rankCheck(card),
      guildCheck(card),
      keywordCheck(card),
      f.types.length                  > 0 ? match(f.types,                  card.types)                    : null,
      f.subtypes.length               > 0 ? match(f.subtypes,               card.subtypes)                 : null,
      f.main_archetype.length         > 0 ? match(f.main_archetype,         tags.main_archetype)           : null,
      f.main_archetype_support.length > 0 ? match(f.main_archetype_support, tags.main_archetype_support)   : null,
      f.tribal_archetype.length       > 0 ? match(f.tribal_archetype,       tags.tribal_archetype)         : null,
      f.tribal_archetype_support.length>0 ? match(f.tribal_archetype_support, tags.tribal_archetype_support): null,
      f.utility.length                > 0 ? match(f.utility,                tags.utility)                  : null,
      colorCheck(card),
      errorCheck(card),
    ].filter(v => v !== null);

    if (checks.length === 0) return true;
    return isAnd ? checks.every(Boolean) : checks.some(Boolean);
  });
}

// ─── KEYWORDS INPUT ───────────────────────────────────────────────────────────

function KeywordsInput({ keywords, onChange }) {
  const [input, setInput] = useState("");
  const ref = useRef(null);

  function add() {
    const val = input.trim();
    if (!val || keywords.includes(val)) { setInput(""); return; }
    onChange([...keywords, val]);
    setInput("");
  }

  return (
    <div>
      <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "8px", fontStyle: "italic" }}>
        Each entry is searched as an exact phrase in name and rules text.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px", minHeight: "20px" }}>
        {keywords.length === 0
          ? <span style={{ fontSize: "12px", color: "#aaa" }}>none</span>
          : keywords.map(kw => (
              <span key={kw} style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", color: "#aaa" }}>
                {kw}
                <span onClick={() => onChange(keywords.filter(k => k !== kw))} style={{ cursor: "pointer", color: "#aaa", fontSize: "14px", lineHeight: 1 }}>×</span>
              </span>
            ))
        }
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            ref={ref}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") add(); }}
            placeholder='e.g. "flying" or "all creatures"'
            style={{ ...S.input, width: "100%", boxSizing: "border-box", fontSize: "12px", padding: "6px 28px 6px 10px" }}
          />
          {input && (
            <span onClick={() => setInput("")} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#aaa", fontSize: "16px" }}>×</span>
          )}
        </div>
        <button onClick={add} disabled={!input.trim()} style={{ ...S.btn, fontSize: "12px", padding: "6px 14px", opacity: input.trim() ? 1 : 0.4 }}>Add</button>
      </div>
    </div>
  );
}



function FilterDropdown({ selected, pool, onAdd, onRemove, poolMeta = {} }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  const filtered = pool.filter(t => t.toLowerCase().includes(search.toLowerCase()) && !selected.includes(t));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px", minHeight: "20px" }}>
        {selected.length === 0
          ? <span style={{ fontSize: "12px", color: "#aaa" }}>none</span>
          : selected.map(t => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", color: "#aaa" }}>
                {t}<span onClick={() => onRemove(t)} style={{ cursor: "pointer", color: "#aaa", fontSize: "14px", lineHeight: 1 }}>×</span>
              </span>
            ))
        }
      </div>
      <div onClick={() => setOpen(o => !o)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        <span style={{ fontSize: "14px" }}>+</span> add
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", marginTop: "4px", overflow: "hidden" }}>
          <div style={{ position: "relative" }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setOpen(false)}
              placeholder="Search..."
              style={{ ...S.input, width: "100%", borderRadius: 0, border: "none", borderBottom: "1px solid #333", boxSizing: "border-box", fontSize: "12px", padding: "8px 30px 8px 10px" }} />
            {search && <span onClick={() => setSearch("")} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#aaa", fontSize: "16px" }}>×</span>}
          </div>
          <div style={{ maxHeight: "160px", overflowY: "auto" }}>
            {filtered.length === 0
              ? <div style={{ padding: "8px 10px", fontSize: "12px", color: "#aaa" }}>No options.</div>
              : filtered.map(t => (
                  <div key={t} onClick={() => { onAdd(t); setSearch(""); setOpen(false); }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "#222"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                    style={{ padding: "8px 10px", fontSize: "12px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span>{t}</span>
                    {poolMeta[t] && <span style={{ fontSize: "10px", color: "#555", flexShrink: 0 }}>{poolMeta[t]}</span>}
                  </div>
                ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ACCORDION SECTION ────────────────────────────────────────────────────────

function AccordionSection({ title, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #222" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
          {count > 0 && (
            <span style={{ backgroundColor: "#222", border: "1px solid #444", borderRadius: "4px", padding: "1px 7px", fontSize: "11px", color: "#aaa" }}>{count}</span>
          )}
        </div>
        <span style={{ color: "#aaa", fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ paddingBottom: "16px" }}>{children}</div>}
    </div>
  );
}

// ─── COLOR FILTER ─────────────────────────────────────────────────────────────

function ColorFilter({ colors, colorless, onChange }) {
  const toggle = c => onChange({ colors: colors.includes(c) ? colors.filter(x => x !== c) : [...colors, c], colorless });
  const toggleColorless = () => onChange({ colors, colorless: !colorless });
  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
      {["W","U","B","R","G"].map(c => (
        <div key={c} onClick={() => toggle(c)} style={{ opacity: colors.includes(c) ? 1 : 0.3, cursor: "pointer", transition: "opacity 0.15s" }}>
          <ManaIcon c={c} size={28} />
        </div>
      ))}
      <div onClick={toggleColorless} style={{
        width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
        backgroundColor: "#555", border: "2px solid #888",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "11px", color: "#fff", fontWeight: "700",
        opacity: colorless ? 1 : 0.3, transition: "opacity 0.15s",
        fontFamily: "'Courier New', monospace",
      }}>C</div>
    </div>
  );
}

// ─── FILTER MODAL ─────────────────────────────────────────────────────────────

function FilterModal({ cards, appliedFilters, onApply, onClose, db }) {
  const [f, setF] = useState({ ...appliedFilters });

  const add    = (key, val) => setF(p => ({ ...p, [key]: [...p[key], val] }));
  const remove = (key, val) => setF(p => ({ ...p, [key]: p[key].filter(x => x !== val) }));

  const typesPool    = derivePool(cards, c => c.types);
  const subtypesPool = derivePool(cards, c => c.subtypes);
  const mainPool     = PREDEFINED_MAIN_ARCHETYPES.map(a => a.name);
  const tribalPool   = PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name);
  const utilPool     = [...new Set(UTILITY_DATA.map(d => d.sub))].sort();

  const mainCount   = f.main_archetype.length + f.main_archetype_support.length;
  const tribalCount = f.tribal_archetype.length + f.tribal_archetype_support.length;
  const colorCount  = f.colors.length + (f.colorless ? 1 : 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px 24px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: "4px", width: "100%", maxWidth: "520px", maxHeight: "calc(100vh - 64px)", overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #222", position: "sticky", top: 0, backgroundColor: "#111", zIndex: 1 }}>
          <span style={{ fontSize: "13px", color: "#fff", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em" }}>Filter Cards</span>
          <div onClick={onClose} style={{ cursor: "pointer", color: "#aaa", fontSize: "20px", lineHeight: 1, padding: "4px 8px" }}>✕</div>
        </div>

        {/* Mode selector */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Match</span>
          {["and", "or"].map(m => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", color: f.mode === m ? "#fff" : "#888" }}>
              <input type="radio" name="filterMode" value={m} checked={f.mode === m}
                onChange={() => setF(p => ({ ...p, mode: m }))}
                style={{ accentColor: "#4a90d9", cursor: "pointer" }} />
              {m === "and" ? "All filters (AND)" : "Any filter (OR)"}
            </label>
          ))}
        </div>

        {/* Accordions */}
        <div style={{ padding: "0 16px", flex: 1 }}>

          <AccordionSection title="Colors and guilds" count={f.colors.length + (f.colorless ? 1 : 0) + (f.guilds || []).length}>
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Color</div>
              <ColorFilter colors={f.colors} colorless={f.colorless}
                onChange={({ colors, colorless }) => setF(p => ({ ...p, colors, colorless }))} />
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Guild</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {GUILDS_LIST.map(({ name, colors }) => {
                  const selected = (f.guilds || []).includes(name);
                  return (
                    <div key={name} onClick={() => setF(p => ({
                      ...p,
                      guilds: selected ? p.guilds.filter(g => g !== name) : [...(p.guilds || []), name]
                    }))} style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "7px 10px", borderRadius: "4px", cursor: "pointer",
                      backgroundColor: selected ? "#1a1a1a" : "transparent",
                      border: `1px solid ${selected ? "#444" : "transparent"}`,
                    }}>
                      <span style={{ display: "inline-flex", gap: "2px" }}>
                        {colors.split("").map(c => <ManaIcon key={c} c={c} size={16} />)}
                      </span>
                      <span style={{ fontSize: "13px", color: selected ? "#fff" : "#888" }}>{name}</span>
                      {selected && <span style={{ marginLeft: "auto", fontSize: "14px", color: "#4a90d9" }}>{"✓"}</span>}
                    </div>
                  );
                })}
              </div>
              {/* Specials */}
              {(db?.colorless > 0 || db?.wildcards > 0) && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                  {db?.colorless > 0 && (() => {
                    const name = "Colorless";
                    const selected = (f.guilds || []).includes(name);
                    return (
                      <div key={name} onClick={() => setF(p => ({
                        ...p, guilds: selected ? p.guilds.filter(g => g !== name) : [...(p.guilds || []), name]
                      }))} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "4px", cursor: "pointer", backgroundColor: selected ? "#1a1a1a" : "transparent", border: `1px solid ${selected ? "#444" : "transparent"}` }}>
                        <span style={{ fontSize: "13px", color: selected ? "#fff" : "#888" }}>{name}</span>
                        {selected && <span style={{ marginLeft: "auto", color: "#4a90d9" }}>{"✓"}</span>}
                      </div>
                    );
                  })()}
                  {db?.wildcards > 0 && (() => {
                    const name = "Wildcards";
                    const selected = (f.guilds || []).includes(name);
                    return (
                      <div key={name} onClick={() => setF(p => ({
                        ...p, guilds: selected ? p.guilds.filter(g => g !== name) : [...(p.guilds || []), name]
                      }))} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "4px", cursor: "pointer", backgroundColor: selected ? "#1a1a1a" : "transparent", border: `1px solid ${selected ? "#444" : "transparent"}` }}>
                        <span style={{ fontSize: "13px", color: selected ? "#fff" : "#888" }}>{name}</span>
                        {selected && <span style={{ marginLeft: "auto", color: "#4a90d9" }}>{"✓"}</span>}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </AccordionSection>

          <AccordionSection title="Types and subtypes" count={f.types.length + f.subtypes.length}>
            <div style={{ display: "flex", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Types</div>
                <FilterDropdown selected={f.types} pool={typesPool} onAdd={v => add("types", v)} onRemove={v => remove("types", v)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Subtypes</div>
                <FilterDropdown selected={f.subtypes} pool={subtypesPool} onAdd={v => add("subtypes", v)} onRemove={v => remove("subtypes", v)} />
              </div>
            </div>
          </AccordionSection>

          <AccordionSection title="Keywords" count={(f.keywords || []).length}>
            <KeywordsInput keywords={f.keywords || []} onChange={kws => setF(p => ({ ...p, keywords: kws }))} />
          </AccordionSection>

          <AccordionSection title="Archetypes" count={mainCount + tribalCount + f.utility.length}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Main Archetypes</div>
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#aaa", marginBottom: "6px" }}>Active</div>
                  <FilterDropdown selected={f.main_archetype} pool={mainPool} onAdd={v => add("main_archetype", v)} onRemove={v => remove("main_archetype", v)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#aaa", marginBottom: "6px" }}>Support</div>
                  <FilterDropdown selected={f.main_archetype_support} pool={mainPool} onAdd={v => add("main_archetype_support", v)} onRemove={v => remove("main_archetype_support", v)} />
                </div>
              </div>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Tribal</div>
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#aaa", marginBottom: "6px" }}>Active</div>
                  <FilterDropdown selected={f.tribal_archetype} pool={tribalPool} onAdd={v => add("tribal_archetype", v)} onRemove={v => remove("tribal_archetype", v)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#aaa", marginBottom: "6px" }}>Support</div>
                  <FilterDropdown selected={f.tribal_archetype_support} pool={tribalPool} onAdd={v => add("tribal_archetype_support", v)} onRemove={v => remove("tribal_archetype_support", v)} />
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Utility</div>
              <FilterDropdown selected={f.utility} pool={utilPool} poolMeta={UTILITY_CAT_MAP} onAdd={v => add("utility", v)} onRemove={v => remove("utility", v)} />
            </div>
          </AccordionSection>

          <AccordionSection title="Rank" count={f.minRank > 0 ? 1 : 0}>
            <div style={{ paddingTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <StarRating stars={Math.ceil(f.minRank / 2)} label="" size={12} />
                <span style={{ fontSize: "12px", color: "#aaa" }}>
                  {f.minRank === 0 ? "No filter" : `Min ${f.minRank} bar${f.minRank !== 1 ? "s" : ""} (≥ ${Math.ceil(f.minRank / 2)} star${Math.ceil(f.minRank / 2) !== 1 ? "s" : ""})`}
                </span>
              </div>
              <input type="range" min="0" max="10" step="1"
                value={f.minRank}
                onChange={e => setF(p => ({ ...p, minRank: parseInt(e.target.value) }))}
                style={{ width: "100%", accentColor: "#d4af37", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#aaa", marginTop: "4px" }}>
                <span>0</span><span>5</span><span>10</span>
              </div>
            </div>
          </AccordionSection>
          <AccordionSection title="Errors" count={Object.values(f.errors || {}).filter(Boolean).length}>
            {[
              { key: "duplicate",    label: "Duplicate card"  },
              { key: "missingGuild", label: "Missing guild"   },
              { key: "missingTags",  label: "Missing tags"    },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 0", cursor: "pointer", fontSize: "13px", color: "#aaa", borderBottom: "1px solid #1a1a1a" }}>
                <input type="checkbox"
                  checked={!!(f.errors || {})[key]}
                  onChange={e => setF(p => ({ ...p, errors: { ...(p.errors || {}), [key]: e.target.checked } }))}
                  style={{ accentColor: "#4a90d9", cursor: "pointer", width: "14px", height: "14px" }}
                />
                {label}
              </label>
            ))}
          </AccordionSection>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid #222", position: "sticky", bottom: 0, backgroundColor: "#111", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => { onApply({ ...EMPTY_FILTERS }); onClose(); }} style={{ ...S.btn, fontSize: "12px", padding: "6px 16px" }}>Clear Filters</button>
          <button onClick={() => { onApply(f); onClose(); }} style={{ ...S.btn, fontSize: "12px", padding: "6px 20px", backgroundColor: "#222", borderColor: "#444" }}>Submit</button>
        </div>
      </div>
    </div>
  );
}

// ─── SORT & GROUP UTILITIES ───────────────────────────────────────────────────

function getColorSortIndex(card) {
  const tl = (card.type_line || "").toLowerCase();
  const colors = card.colors || [];
  if (colors.length === 0) return COLOR_GROUP_ORDER.indexOf("Colorless");
  if (colors.length >= 3) return COLOR_GROUP_ORDER.indexOf("Wildcards");
  if (colors.length === 1) {
    const name = { W:"White", U:"Blue", B:"Black", R:"Red", G:"Green" }[colors[0]] || "";
    return COLOR_GROUP_ORDER.indexOf(name);
  }
  const guild = GUILDS_LIST.find(g =>
    colors.every(c => g.colors.includes(c)) && g.colors.split("").every(c => colors.includes(c))
  );
  return guild ? COLOR_GROUP_ORDER.indexOf(guild.name) : COLOR_GROUP_ORDER.indexOf("Wildcards");
}

function sortCards(cards, orderBy, allCards) {
  const getRating = card => getCardRating(card, allCards || cards).stars * 2;
  return [...cards].sort((a, b) => {
    switch (orderBy) {
      case "rank_desc": { const d = getRating(b) - getRating(a); return d !== 0 ? d : a.name.localeCompare(b.name); }
      case "rank_asc":  { const d = getRating(a) - getRating(b); return d !== 0 ? d : a.name.localeCompare(b.name); }
      case "mana_color": {
        if (a.cmc !== b.cmc) return (a.cmc || 0) - (b.cmc || 0);
        const ci = getColorSortIndex(a) - getColorSortIndex(b);
        if (ci !== 0) return ci;
        return a.name.localeCompare(b.name);
      }
      case "cmc_asc":    if (a.cmc !== b.cmc) return (a.cmc || 0) - (b.cmc || 0); return a.name.localeCompare(b.name);
      case "cmc_desc":   if (a.cmc !== b.cmc) return (b.cmc || 0) - (a.cmc || 0); return a.name.localeCompare(b.name);
      case "alpha_asc":  return a.name.localeCompare(b.name);
      case "alpha_desc": return b.name.localeCompare(a.name);
      case "date_desc":  return (b.added_at || 0) - (a.added_at || 0);
      case "date_asc":   return (a.added_at || 0) - (b.added_at || 0);
      default:           return 0;
    }
  });
}

const COLOR_GROUP_ORDER = [
  "White","Blue","Black","Red","Green",
  "Azorius","Dimir","Rakdos","Gruul","Selesnya",
  "Orzhov","Izzet","Golgari","Boros","Simic",
  "Wildcards","Colorless",
];

function getColorGroup(card) {
  const colors = card.colors || [];
  if (colors.length === 0) return "Colorless";
  if (colors.length >= 3) return "Wildcards";
  if (colors.length === 2) {
    const guild = GUILDS_LIST.find(g =>
      colors.every(c => g.colors.includes(c)) && g.colors.split("").every(c => colors.includes(c))
    );
    return guild ? guild.name : colors.join("");
  }
  return { W:"White", U:"Blue", B:"Black", R:"Red", G:"Green" }[colors[0]] || colors[0];
}

const SUPERTYPES = new Set(["Legendary", "Basic", "Snow", "World", "Elite"]);

function groupCards(cards, groupBy, allCards) {
  if (groupBy === "none") return [{ key: "all", label: null, cards }];
  const groups = {};
  cards.forEach(card => {
    let key;
    if (groupBy === "color") key = getColorGroup(card);
    else if (groupBy === "type") {
      const types = (card.types || []).filter(t => !SUPERTYPES.has(t));
      key = types.includes("Creature") ? "Creature" : (types[0] || "Unknown");
    }
    else if (groupBy === "guild") key = card.tags?.guild || "No Guild Selected";
    else if (groupBy === "rank") {
      const r = getCardRating(card, allCards || cards);
      key = r.stars ? r.label : (r.label === "N/A" ? "N/A" : "Unrated");
    }
    groups[key] = groups[key] || [];
    groups[key].push(card);
  });

  const order = groupBy === "color"
    ? COLOR_GROUP_ORDER
    : groupBy === "guild"
      ? ["No Guild Selected", ...GUILDS_LIST.map(g => g.name), "Wildcards","Colorless"]
    : groupBy === "rank"
      ? ["Staple", "Key", "Solid", "Niche", "Filler", "Unrated", "N/A"]
      : Object.keys(groups).sort();

  const result = [];
  order.forEach(k => { if (groups[k]) result.push({ key: k, label: k, cards: groups[k] }); });
  Object.keys(groups).forEach(k => { if (!result.find(r => r.key === k)) result.push({ key: k, label: k, cards: groups[k] }); });
  return result;
}

function GroupAccordion({ label, groupBy, count, open, onToggle, children }) {
  const guild = GUILDS_LIST.find(g => g.name === label);
  const singleColor = { White:"W", Blue:"U", Black:"B", Red:"R", Green:"G" }[label];

  return (
    <div style={{ marginBottom: "4px" }}>
      <div onClick={onToggle} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 0 8px", borderBottom: "1px solid #222",
        marginBottom: open ? "8px" : "0", cursor: "pointer", userSelect: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {groupBy === "color" && singleColor && <ManaIcon c={singleColor} size={18} />}
          {groupBy === "color" && guild && guild.colors.split("").map(c => <ManaIcon key={c} c={c} size={18} />)}
          {groupBy === "guild" && guild && guild.colors.split("").map(c => <ManaIcon key={c} c={c} size={18} />)}
          <span style={{ fontSize: "12px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: "700" }}>{label}</span>
          <span style={{ backgroundColor: "#222", border: "1px solid #333", borderRadius: "4px", padding: "1px 7px", fontSize: "11px", color: "#aaa" }}>{count}</span>
        </div>
        <span style={{ color: "#aaa", fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && children}
    </div>
  );
}

// ─── CARDS PAGE ───────────────────────────────────────────────────────────────

function CardsPage({ cards, onAddCard, onUpdateCard, onBulkUpdateCards, onDeleteCard, tagDB, setTagDB, db, appliedFilters: externalFilters, setAppliedFilters: setExternalFilters }) {
  const [showModal,    setShowModal]    = useState(false);
  const [editingCard,  setEditingCard]  = useState(null);
  const [showFilters,  setShowFilters]  = useState(false);
  const [orderBy,      setOrderBy]      = useState("mana_color");
  const [groupBy,      setGroupBy]      = useState("none");
  const [openGroups,   setOpenGroups]   = useState({});

  const [localFilters, setLocalFilters] = useState({ ...EMPTY_FILTERS });
  const appliedFilters    = externalFilters  || localFilters;
  const setAppliedFilters = setExternalFilters || setLocalFilters;

  const filterCount   = countFilters(appliedFilters);
  const filteredCards = applyFilters(cards, appliedFilters);
  const sortedCards   = sortCards(filteredCards, orderBy, cards);
  const groupedCards  = groupCards(sortedCards, groupBy, cards);

  // Reset open state when groupBy changes
  useEffect(() => { setOpenGroups({}); }, [groupBy]);

  const isOpen    = key => openGroups[key] !== false;
  const toggleGroup = key => setOpenGroups(p => ({ ...p, [key]: !isOpen(key) }));
  const openAll   = () => setOpenGroups({});
  const closeAll  = () => { const c = {}; groupedCards.forEach(({ key }) => c[key] = false); setOpenGroups(c); };

  const [bulkEditMode, setBulkEditMode] = React.useState(false);
  const [selectedCards, setSelectedCards] = React.useState(new Set());
  const [bulkModal, setBulkModal] = React.useState(null); // 'archetypes' | 'guild' | null

  const toggleBulkEdit = () => {
    setBulkEditMode(v => !v);
    setSelectedCards(new Set());
    setBulkModal(null);
  };

  const toggleCardSelection = (id) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div style={S.page}>
      {/* Row 1: Add Cards + Bulk Edit + Filters */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button style={{ ...S.btn, borderColor: "#444", minHeight: "44px", opacity: bulkEditMode ? 0.4 : 1, pointerEvents: bulkEditMode ? "none" : "auto" }} onClick={() => setShowModal(true)}>
            + Add Cards
          </button>
          <button
            disabled={cards.length <= 1}
            onClick={toggleBulkEdit}
            style={{
              ...S.btn, minHeight: "44px", padding: "8px 14px",
              display: "flex", alignItems: "center", gap: "6px",
              borderColor: bulkEditMode ? "#4a90d9" : "#444",
              color: bulkEditMode ? "#4a90d9" : "#aaa",
              opacity: cards.length <= 1 ? 0.4 : 1,
              cursor: cards.length <= 1 ? "not-allowed" : "pointer",
            }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M9 1.5l2.5 2.5L4 11.5H1.5V9L9 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
            {bulkEditMode ? "✕" : "Bulk Edit"}
          </button>
        </div>
        <button onClick={() => setShowFilters(true)} style={{
          ...S.btn, minHeight: "44px", padding: "8px 16px",
          display: "flex", alignItems: "center", gap: "8px",
          borderColor: filterCount > 0 ? "#4a90d9" : "#444",
          color: filterCount > 0 ? "#4a90d9" : "#fff",
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 2h12M3 7h8M5 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Filters
          {filterCount > 0 && (
            <span style={{ backgroundColor: "#4a90d9", color: "#fff", borderRadius: "4px", padding: "1px 7px", fontSize: "11px" }}>{filterCount}</span>
          )}
        </button>
      </div>

      {/* Bulk Edit Bar */}
      {bulkEditMode && (
        <div style={{ position: "sticky", top: 0, zIndex: 10, padding: "10px 14px", backgroundColor: "#111", border: "1px solid #333", borderRadius: "4px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: "#aaa" }}>
              <span style={{ color: "#fff", fontWeight: "600" }}>{selectedCards.size}</span> {selectedCards.size === 1 ? "card" : "cards"} selected
            </span>
            {(() => {
              const visibleIds = filteredCards.map(c => c.id);
              const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedCards.has(id));
              const allCardsSelected = cards.length > 0 && cards.every(c => selectedCards.has(c.id));
              const label = filterCount > 0
                ? (allVisibleSelected ? "Unselect All Filtered Cards" : "Select All Filtered Cards")
                : (allCardsSelected ? "Unselect All" : "Select All");
              return (
                <button onClick={() => {
                  if (filterCount > 0) {
                    setSelectedCards(allVisibleSelected
                      ? new Set([...selectedCards].filter(id => !visibleIds.includes(id)))
                      : new Set([...selectedCards, ...visibleIds])
                    );
                  } else {
                    setSelectedCards(allCardsSelected ? new Set() : new Set(cards.map(c => c.id)));
                  }
                }} style={{ backgroundColor: "transparent", border: "none", padding: "0", cursor: "pointer", fontSize: "11px", color: "#4a90d9", textDecoration: "underline", textUnderlineOffset: "2px" }}>
                  {label}
                </button>
              );
            })()}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <button onClick={() => setBulkModal("archetypes")} disabled={selectedCards.size < 1} style={{ ...S.btn, padding: "6px 12px", fontSize: "12px", borderColor: "#444", color: selectedCards.size < 1 ? "#aaa" : "#ccc", opacity: selectedCards.size < 1 ? 0.4 : 1, cursor: selectedCards.size < 1 ? "not-allowed" : "pointer" }}>
              Assign Archetypes
            </button>
            <button onClick={() => setBulkModal("guild")} disabled={selectedCards.size < 1} style={{ ...S.btn, padding: "6px 12px", fontSize: "12px", borderColor: "#444", color: selectedCards.size < 1 ? "#aaa" : "#ccc", opacity: selectedCards.size < 1 ? 0.4 : 1, cursor: selectedCards.size < 1 ? "not-allowed" : "pointer" }}>
              Assign to Guild
            </button>
            <button onClick={() => setBulkModal("delete")} disabled={selectedCards.size < 1} style={{ ...S.btn, padding: "6px 12px", fontSize: "12px", borderColor: selectedCards.size >= 1 ? "#c0392b" : "#444", color: selectedCards.size >= 1 ? "#c0392b" : "#aaa", opacity: selectedCards.size < 1 ? 0.4 : 1, cursor: selectedCards.size < 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Delete
            </button>
          </div>
        </div>
      )}

      {bulkModal === "archetypes" && (
        <AssignArchetypesModal
          cards={cards}
          selectedCards={selectedCards}
          tagDB={tagDB}
          setTagDB={setTagDB}
          onUpdateCard={onUpdateCard}
          onBulkUpdateCards={onBulkUpdateCards}
          onClose={() => setBulkModal(null)}
          onDone={() => { setSelectedCards(new Set()); setBulkModal(null); toggleBulkEdit(); }}
          S={S}
        />
      )}
      {bulkModal === "delete" && (
        <div onClick={() => setBulkModal(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: "6px", padding: "28px", width: "480px", maxWidth: "90vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <span style={{ fontSize: "15px", fontWeight: "700", color: "#c0392b" }}>Delete {selectedCards.size} cards</span>
              <span onClick={() => setBulkModal(null)} style={{ cursor: "pointer", color: "#aaa", fontSize: "20px", lineHeight: 1 }}>✕</span>
            </div>
            <p style={{ color: "#aaa", fontSize: "13px", marginBottom: "20px" }}>Are you sure you want to delete <strong style={{ color: "#fff" }}>{selectedCards.size} cards</strong>? This action cannot be undone.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setBulkModal(null)} style={{ ...S.btn, padding: "8px 16px", fontSize: "13px", borderColor: "#444", color: "#aaa" }}>Cancel</button>
              <button onClick={() => { selectedCards.forEach(id => onDeleteCard(id)); setSelectedCards(new Set()); setBulkModal(null); toggleBulkEdit(); }} style={{ ...S.btn, padding: "8px 16px", fontSize: "13px", borderColor: "#c0392b", color: "#c0392b" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {bulkModal === "guild" && (
        <AssignGuildModal
          cards={cards}
          selectedCards={selectedCards}
          db={db}
          onUpdateCard={onUpdateCard}
          onBulkUpdateCards={onBulkUpdateCards}
          onClose={() => setBulkModal(null)}
          onDone={() => { setSelectedCards(new Set()); setBulkModal(null); toggleBulkEdit(); }}
          S={S}
        />
      )}


      <hr style={{ ...S.divider, marginBottom: "16px" }} />

      {/* Row 2: Order By + Group By + Open/Close All */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Order by</span>
          <select value={orderBy} onChange={e => setOrderBy(e.target.value)} style={{ ...S.select, fontSize: "12px", padding: "6px 10px" }}>
            <option value="mana_color">Mana value + color</option>
            <option value="rank_desc">Rank (high → low)</option>
            <option value="rank_asc">Rank (low → high)</option>
            <option value="cmc_asc">Mana value (low → high)</option>
            <option value="cmc_desc">Mana value (high → low)</option>
            <option value="alpha_asc">Alphabetic (A → Z)</option>
            <option value="alpha_desc">Alphabetic (Z → A)</option>
            <option value="date_desc">Add date (recent → oldest)</option>
            <option value="date_asc">Add date (oldest → recent)</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Group by</span>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ ...S.select, fontSize: "12px", padding: "6px 10px" }}>
            <option value="none">None</option>
            <option value="rank">Rank</option>
            <option value="color">Color</option>
            <option value="type">Type</option>
            <option value="guild">Guild</option>
          </select>
        </div>
        {groupBy !== "none" && groupedCards.length > 1 && (
          <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
            <button onClick={openAll}  style={{ ...S.btn, fontSize: "11px", padding: "6px 12px" }}>Open All</button>
            <button onClick={closeAll} style={{ ...S.btn, fontSize: "11px", padding: "6px 12px" }}>Close All</button>
          </div>
        )}
      </div>
      <hr style={S.divider} />

      {filterCount > 0 && (
        <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#4a90d9" }}>
          <span>Showing {filteredCards.length} of {cards.length} cards</span>
          <button onClick={() => setAppliedFilters({ ...EMPTY_FILTERS })} style={{ ...S.btn, fontSize: "11px", padding: "3px 10px", borderColor: "#4a90d9", color: "#4a90d9" }}>Clear</button>
        </div>
      )}

      {sortedCards.length === 0
        ? <div style={{ color: "#aaa", fontSize: "13px" }}>{cards.length === 0 ? "No cards added yet." : "No cards match the current filters."}</div>
        : (() => {
            const nameCounts = {};
            cards.forEach(c => { const k = c.name.toLowerCase(); nameCounts[k] = nameCounts[k] || []; nameCounts[k].push(c.id); });
            const issueMap = {};
            Object.values(nameCounts).forEach(ids => {
              if (ids.length > 1) ids.forEach(id => { issueMap[id] = issueMap[id] || []; issueMap[id].push({ msg: `${ids.length} copies of this card have been added. Remove extra copies.`, color: "#c0392b" }); });
            });
            cards.forEach(c => {
              if (!c.tags?.guild) { issueMap[c.id] = issueMap[c.id] || []; issueMap[c.id].push({ msg: "This card is not yet assigned to a guild, edit to assign.", color: "#c8a000" }); }
              if (!c.tags?.ignore_tags) {
                const hasTag = [c.tags?.main_archetype, c.tags?.main_archetype_support, c.tags?.tribal_archetype, c.tags?.tribal_archetype_support, c.tags?.utility].some(t => t && t.length > 0);
                if (!hasTag) { issueMap[c.id] = issueMap[c.id] || []; issueMap[c.id].push({ msg: "This card has no tagging. Edit to add tags or ignore them.", color: "#c8a000" }); }
              }
            });

            return (
              <>
                {groupedCards.map(({ key, label, cards: gCards }) => {
                  const cardItems = gCards.map(card => <CardItem key={card.id} card={card} onEdit={setEditingCard} issues={issueMap[card.id] || []} allCards={cards} bulkEditMode={bulkEditMode} isSelected={selectedCards.has(card.id)} onToggleSelect={toggleCardSelection} />);
                  if (!label) return <div key={key}>{cardItems}</div>;
                  return (
                    <GroupAccordion key={key} label={label} groupBy={groupBy} count={gCards.length} open={isOpen(key)} onToggle={() => toggleGroup(key)}>
                      {cardItems}
                    </GroupAccordion>
                  );
                })}
              </>
            );
          })()
      }

      {showModal && <AddCardModal onClose={() => setShowModal(false)} onAddCard={onAddCard} tagDB={tagDB} setTagDB={setTagDB} allCards={cards} db={db} />}
      {editingCard && (
        <EditCardModal card={editingCard} tagDB={tagDB} setTagDB={setTagDB} allCards={cards} db={db}
          onSave={updated => { onUpdateCard(updated); setEditingCard(null); }}
          onDelete={id => { onDeleteCard(id); setEditingCard(null); }}
          onClose={() => setEditingCard(null)} />
      )}
      {showFilters && <FilterModal cards={cards} appliedFilters={appliedFilters} onApply={setAppliedFilters} onClose={() => setShowFilters(false)} db={db} />}
    </div>
  );
}

// ─── TAGS PAGE ────────────────────────────────────────────────────────────────

function getTagFields(type) {
  if (type === "main_archetypes")   return ["main_archetype", "main_archetype_support"];
  if (type === "tribal_archetypes") return ["tribal_archetype", "tribal_archetype_support"];
  return ["utility"];
}

function TagList({ pool, type, tagDB, setTagDB, cards, onUpdateCard }) {
  const [editing,             setEditing]             = useState(null);
  const [editVal,             setEditVal]             = useState("");
  const [adding,              setAdding]              = useState(false);
  const [newTag,              setNewTag]              = useState("");
  const [multiEdit,           setMultiEdit]           = useState(false);
  const [selected,            setSelected]            = useState(new Set());
  const [confirmDelete,       setConfirmDelete]       = useState(false);
  const [confirmSingleDelete, setConfirmSingleDelete] = useState(null);
  const [showMerge,           setShowMerge]           = useState(false);
  const [mergeNewName,        setMergeNewName]        = useState("");
  const [sortOrder,           setSortOrder]           = useState("alpha");

  const fields   = getTagFields(type);

  function getTagCount(tag) {
    return cards.filter(card => fields.some(f => card.tags?.[f]?.includes(tag))).length;
  }

  const sorted   = [...pool].sort((a, b) => {
    if (sortOrder === "quantity") {
      const diff = getTagCount(b) - getTagCount(a);
      return diff !== 0 ? diff : a.localeCompare(b);
    }
    return a.localeCompare(b);
  });
  const selArray = [...selected];
  const canAct   = selArray.length >= 2;

  const countBadge = (tag) => {
    const n = getTagCount(tag);
    return (
      <span style={{ backgroundColor: "#222", border: "1px solid #333", borderRadius: "4px", padding: "1px 7px", fontSize: "11px", color: "#aaa", flexShrink: 0 }}>{n}</span>
    );
  };

  function toggleMultiEdit() {
    setMultiEdit(m => !m);
    setSelected(new Set());
    setConfirmDelete(false);
    setConfirmSingleDelete(null);
    setShowMerge(false);
    setEditing(null);
    setAdding(false);
  }

  function toggleSelect(tag) {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(tag) ? s.delete(tag) : s.add(tag);
      return s;
    });
  }

  function applyToCards(oldTags, newTag) {
    const fields = getTagFields(type);
    cards.forEach(card => {
      const tags = card.tags || {};
      let changed = false;
      const updated = { ...tags };
      fields.forEach(f => {
        if (tags[f]?.some(t => oldTags.includes(t))) {
          let arr = tags[f].filter(t => !oldTags.includes(t));
          if (newTag && !arr.includes(newTag)) arr = [...arr, newTag];
          updated[f] = arr;
          changed = true;
        }
      });
      if (changed) onUpdateCard({ ...card, tags: updated });
    });
  }

  function startEdit(tag) { setEditing(tag); setEditVal(tag); setAdding(false); }
  function cancelEdit()   { setEditing(null); setEditVal(""); }

  function saveEdit(oldTag) {
    const val = editVal.trim().toLowerCase();
    if (!val || val === oldTag) { cancelEdit(); return; }
    setTagDB(p => ({ ...p, [type]: p[type].map(t => t === oldTag ? val : t) }));
    applyToCards([oldTag], val);
    cancelEdit();
  }

  function deleteSingle(tag) {
    setTagDB(p => ({ ...p, [type]: p[type].filter(t => t !== tag) }));
    applyToCards([tag], null);
    setConfirmSingleDelete(null);
  }

  function deleteSelected() {
    setTagDB(p => ({ ...p, [type]: p[type].filter(t => !selected.has(t)) }));
    applyToCards(selArray, null);
    setSelected(new Set());
    setConfirmDelete(false);
  }

  function mergeSelected() {
    const val = mergeNewName.trim().toLowerCase();
    if (!val) return;
    setTagDB(p => {
      const filtered = p[type].filter(t => !selected.has(t));
      return { ...p, [type]: filtered.includes(val) ? filtered : [...filtered, val] };
    });
    applyToCards(selArray, val);
    setSelected(new Set());
    setShowMerge(false);
    setMergeNewName("");
    setMultiEdit(false);
  }

  function addTag() {
    const val = newTag.trim().toLowerCase();
    if (!val || pool.includes(val)) { setAdding(false); setNewTag(""); return; }
    setTagDB(p => ({ ...p, [type]: [...p[type], val] }));
    setAdding(false); setNewTag("");
  }

  const pencilBtn = (onClick) => (
    <button onClick={onClick} style={{ backgroundColor: "transparent", border: "1px solid #222", borderRadius: "4px", width: "28px", height: "28px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
        <path d="M9.5 1.5L12.5 4.5L4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="#888" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M8 3L11 6" stroke="#888" strokeWidth="1.3"/>
      </svg>
    </button>
  );

  const deleteBtn = (onClick) => (
    <button onClick={onClick} style={{ backgroundColor: "transparent", border: "1px solid #222", borderRadius: "4px", width: "28px", height: "28px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M1 1L10 10M10 1L1 10" stroke="#888" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    </button>
  );

  return (
    <div>
      {/* Info text */}
      <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "14px", fontStyle: "italic" }}>
        Editing, removing or merging a tag will modify it in each card.
      </div>

      {/* Order By row + Multi-edit button */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "12px", gap: "8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>Order by</span>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ ...S.select, fontSize: "12px", padding: "4px 8px" }}>
            <option value="alpha">Alphabetic</option>
            <option value="quantity">Quantity</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {multiEdit && (
            <>
              <button onClick={() => { if (canAct) setConfirmDelete(true); }} style={{ ...S.btn, fontSize: "11px", padding: "4px 10px", opacity: canAct ? 1 : 0.35, cursor: canAct ? "pointer" : "not-allowed", color: "#d94a4a", borderColor: "#d94a4a" }}>Delete</button>
              <button onClick={() => { if (canAct) setShowMerge(true); }}    style={{ ...S.btn, fontSize: "11px", padding: "4px 10px", opacity: canAct ? 1 : 0.35, cursor: canAct ? "pointer" : "not-allowed" }}>Merge</button>
            </>
          )}
          <button onClick={toggleMultiEdit} title="Multi-edit tags" style={{
            ...S.btn,
            padding: "5px 10px",
            borderColor: multiEdit ? "#4a90d9" : "#333",
            color: multiEdit ? "#4a90d9" : "#888",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 1.5L12.5 4.5L4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M8 3L11 6" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
            <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Multi-edit</span>
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", padding: "14px", marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", color: "#fff", marginBottom: "12px" }}>Are you sure? This cannot be undone.</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setConfirmDelete(false)} style={{ ...S.btn, fontSize: "12px", padding: "5px 14px" }}>Cancel</button>
            <button onClick={deleteSelected}               style={{ ...S.btn, fontSize: "12px", padding: "5px 14px", color: "#d94a4a", borderColor: "#d94a4a" }}>Delete</button>
          </div>
        </div>
      )}

      {/* Merge dialog */}
      {showMerge && (
        <div style={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", padding: "14px", marginBottom: "12px" }}>
          <label style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "6px" }}>New tag name</label>
          <input
            autoFocus
            value={mergeNewName}
            onChange={e => setMergeNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") mergeSelected(); if (e.key === "Escape") { setShowMerge(false); setMergeNewName(""); } }}
            style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: "12px" }}
          />
          <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "10px" }}>
            <div style={{ marginBottom: "4px" }}>Will replace:</div>
            {selArray.map(t => <div key={t} style={{ paddingLeft: "12px", lineHeight: "1.8" }}>• {t}</div>)}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => { setShowMerge(false); setMergeNewName(""); }} style={{ ...S.btn, fontSize: "12px", padding: "5px 14px" }}>Cancel</button>
            <button onClick={mergeSelected} disabled={!mergeNewName.trim()} style={{ ...S.btn, fontSize: "12px", padding: "5px 14px", opacity: mergeNewName.trim() ? 1 : 0.4 }}>Merge</button>
          </div>
        </div>
      )}

      {/* Tag list */}
      {sorted.length === 0 && !adding && (
        <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "8px" }}>No tags yet.</div>
      )}
      {sorted.map(tag => (
        <div key={tag} style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 0" }}>
            {multiEdit
              ? <>
                  <input type="checkbox" checked={selected.has(tag)} onChange={() => toggleSelect(tag)} style={{ accentColor: "#4a90d9", cursor: "pointer", width: "14px", height: "14px" }} />
                  <span style={{ flex: 1, fontSize: "13px", color: "#ccc" }}>{tag}</span>
                  {countBadge(tag)}
                </>
              : editing === tag
                ? <>
                    <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(tag); if (e.key === "Escape") cancelEdit(); }}
                      style={{ ...S.input, flex: 1, fontSize: "12px", padding: "4px 8px", minWidth: 0 }} />
                    <button onClick={() => saveEdit(tag)} style={{ ...S.btn, fontSize: "11px", padding: "4px 10px" }}>Save</button>
                    <button onClick={cancelEdit}          style={{ ...S.btn, fontSize: "11px", padding: "4px 10px" }}>Cancel</button>
                  </>
                : <>
                    <span style={{ flex: 1, fontSize: "13px", color: "#ccc" }}>{tag}</span>
                    {countBadge(tag)}
                    {pencilBtn(() => { startEdit(tag); setConfirmSingleDelete(null); })}
                    {deleteBtn(() => setConfirmSingleDelete(tag))}
                  </>
            }
          </div>
          {/* Single delete confirmation */}
          {confirmSingleDelete === tag && (
            <div style={{ backgroundColor: "#1a1a1a", borderRadius: "4px", padding: "10px 12px", marginBottom: "6px" }}>
              <div style={{ fontSize: "12px", color: "#fff", marginBottom: "8px" }}>Are you sure? This cannot be undone.</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setConfirmSingleDelete(null)} style={{ ...S.btn, fontSize: "11px", padding: "4px 10px" }}>Cancel</button>
                <button onClick={() => deleteSingle(tag)}            style={{ ...S.btn, fontSize: "11px", padding: "4px 10px", color: "#d94a4a", borderColor: "#d94a4a" }}>Delete</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add new */}
      {!multiEdit && (
        adding
          ? <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
              <input autoFocus value={newTag} onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addTag(); if (e.key === "Escape") { setAdding(false); setNewTag(""); } }}
                placeholder="New tag..."
                style={{ ...S.input, flex: 1, fontSize: "12px", padding: "4px 8px" }} />
              <button onClick={addTag}                                            style={{ ...S.btn, fontSize: "11px", padding: "4px 10px" }}>Add</button>
              <button onClick={() => { setAdding(false); setNewTag(""); }} style={{ ...S.btn, fontSize: "11px", padding: "4px 10px" }}>Cancel</button>
            </div>
          : <div onClick={() => { setAdding(true); setEditing(null); }}
              style={{ display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "10px" }}>
              <span style={{ fontSize: "14px" }}>+</span> add
            </div>
      )}
    </div>
  );
}

const PREDEFINED_MAIN_ARCHETYPES = [
  { name:"Affinity Artifacts", desc:"Reduce the mana cost of spells based on the number of artifacts you control. Requires a minimum density of artifacts to make the cost reduction meaningful.", ratio:"12%" },
  { name:"Affinity Creatures / Convoke", desc:"Reduce the mana cost of spells by tapping creatures (Convoke) or based on the number of creatures you control. Rewards going wide with many small creatures.", ratio:"12%" },
  { name:"Aggro", desc:"Low-curve creatures and direct damage. Wins before interaction matters.", ratio:"0%" },
  { name:"Artifacts Matter", desc:"Permanents that reward controlling many artifacts. Without artifact density as support, the payoffs are blank.", ratio:"12%" },
  { name:"Blink/ETB", desc:"Spells and permanents that exile then return creatures to trigger ETB effects. Completely useless without strong ETB targets.", ratio:"12%" },
  { name:"Burn", desc:"Instants and sorceries that deal damage directly to the opponent. Entirely self-sufficient.", ratio:"0%" },
  { name:"Control", desc:"Removal, counterspells, and card draw to stabilize then win with a single threat.", ratio:"0%" },
  { name:"Cycling", desc:"Permanents that trigger whenever you cycle. Individually fine; with payoff density they generate significant card advantage.", ratio:"12%" },
  { name:"-1/-1 Counters", desc:"Cards that place or benefit from -1/-1 counters -- weakening enemy creatures or exploiting Wither, Persist, and Devoted Druid mechanics.", ratio:"0%" },
  { name:"+1/+1 Counters", desc:"Creatures that place or benefit from +1/+1 counters. Scales heavily with density of counter distribution.", ratio:"0%" },
  { name:"Discard / Madness", desc:"Cards with Madness or that benefit from being discarded need dedicated discard outlets. Without outlets the cards rot in hand.", ratio:"12%" },
  { name:"Enchantments Matter", desc:"Cards that reward controlling enchantments or that trigger off enchantments entering play. Requires a dedicated density of enchantments in the cube.", ratio:"12%" },
  { name:"Graveyard Exit", desc:"Permanents that trigger whenever a card leaves the graveyard. Particularly synergistic with Flashback, Escape, Disturb, and Dredge.", ratio:"12%" },
  { name:"Graveyard Value", desc:"Cards that generate value from creatures dying or sitting in the graveyard. Requires graveyard density to be consistent.", ratio:"0%" },
  { name:"Hand Disruption", desc:"Force the opponent to discard cards from hand -- removes threats before they can be played. Each card works independently.", ratio:"0%" },
  { name:"Heroic", desc:"Creatures with Heroic trigger whenever they are the target of a spell. Requires a minimum density of cheap spells that target creatures.", ratio:"12%" },
  { name:"Landfall", desc:"Permanents that trigger whenever a land enters the battlefield. Fetch lands and ramp spells in the cube act as passive support.", ratio:"0%" },
  { name:"Lands", desc:"Use lands as a primary resource beyond mana production -- recurring lands from the graveyard, playing extra lands per turn, and exploiting land synergies.", ratio:"0%" },
  { name:"Lifedrain", desc:"Gaining life simultaneously drains the opponent -- functions as an alternate win condition. Requires a critical mass of drain effects.", ratio:"12%" },
  { name:"Lifegain", desc:"Cards that gain life trigger payoffs -- drawing cards, growing creatures, or stabilizing. Requires a moderate density of gain triggers.", ratio:"0%" },
  { name:"Midrange", desc:"Efficient threats at every curve point. No specific synergy needed -- just good cards.", ratio:"0%" },
  { name:"Mill", desc:"Win by milling the opponent's library. Cards are individually strong and function without specific support.", ratio:"0%" },
  { name:"Poison", desc:"Win by giving the opponent 10 poison counters. Creatures with Infect or Toxic deal damage as poison counters -- pump spells make them lethal in one hit.", ratio:"12%" },
  { name:"Prowess", desc:"Creatures with Prowess get +1/+1 whenever you cast a non-creature spell. The spell suite already in the cube acts as passive support.", ratio:"12%" },
  { name:"Reanimator", desc:"Two-card combo structure: fill the graveyard with a high-CMC threat, then reanimate it at reduced cost. Without both halves, the engine stalls.", ratio:"12%" },
  { name:"Sacrifice", desc:"Requires two distinct halves: payoff cards (benefit from sacrificing) and outlet cards (ways to sacrifice permanents).", ratio:"12%" },
  { name:"Skies / Flying", desc:"Payoffs that reward controlling flying creatures -- anthems for flyers, creatures that grow with each flyer you control.", ratio:"12%" },
  { name:"Spellslinger", desc:"Creatures or permanents that trigger whenever you cast an instant or sorcery. The spell suite already in the cube for removal and draw acts as passive support.", ratio:"12%" },
  { name:"Stax / Prison", desc:"Tax effects and lock pieces that restrict opponents from playing the game normally. Requires a critical mass of lock pieces to be effective.", ratio:"12%" },
  { name:"Stompy", desc:"Large creatures deployed ahead of curve via ramp. Ramp is technically support but exists in the cube for other reasons.", ratio:"12%" },
  { name:"Storm", desc:"Cast as many spells as possible in one turn, then a Storm payoff copies itself for each spell cast. Requires cheap rituals, cantrips, and a critical mass of low-cost spells.", ratio:"12%" },
  { name:"Superfriends", desc:"Multiple planeswalkers that protect each other and generate incremental advantage. Individually strong but reward density.", ratio:"0%" },
  { name:"Tempo", desc:"Cheap threats + cheap interaction to stay ahead. Cards are individually efficient.", ratio:"0%" },
  { name:"Tokens", desc:"Spells that create multiple creature tokens. Individually strong; with anthem effects or sacrifice outlets they become dominant.", ratio:"0%" },
  { name:"Voltron", desc:"One large or evasive creature loaded with auras and equipment to become a one-shot kill threat.", ratio:"12%" },
];

const PREDEFINED_TRIBAL_ARCHETYPES = [
  { name:"Angels", desc:"Large flying finishers with powerful ETB and static abilities. Reward going tall with big threats.", ratio:"15%" },
  { name:"Beasts", desc:"Large aggressive creatures that reward ramp and stompy strategies. Often have trample or enters-the-battlefield value.", ratio:"15%" },
  { name:"Birds", desc:"Small evasive creatures with flying that reward going wide in the air. Synergize with Skies/Flying payoffs.", ratio:"15%" },
  { name:"Cats", desc:"Aggressive creatures with lifelink and combat abilities. Synergize with lifegain payoffs.", ratio:"15%" },
  { name:"Clerics", desc:"Value-oriented tribe with lifegain triggers and sacrifice synergies. Rewards building around death and devotion.", ratio:"15%" },
  { name:"Demons", desc:"Powerful high-CMC threats with drawbacks that reward build-around strategies. Often synergize with sacrifice.", ratio:"15%" },
  { name:"Dragons", desc:"Large flying threats with ETB damage and tribal payoffs. Reward ramp strategies and going tall.", ratio:"15%" },
  { name:"Druids", desc:"Mana-generating creatures that accelerate into large threats. Reward ramp and lands strategies.", ratio:"15%" },
  { name:"Elementals", desc:"Versatile tribe spanning multiple colors with ETB effects and elemental synergies.", ratio:"15%" },
  { name:"Elves", desc:"Explosive mana generation and wide board presence. Reward critical mass strategies and Overrun effects.", ratio:"15%" },
  { name:"Faeries", desc:"Flash and flying creatures that reward holding up mana. Synergize with instant-speed play and tempo.", ratio:"15%" },
  { name:"Goblins", desc:"Fast aggressive tribe with sacrifice synergies and explosive combo potential.", ratio:"15%" },
  { name:"Humans", desc:"Aggressive tribe with lords and hate bears. Reward going wide and disrupting the opponent.", ratio:"15%" },
  { name:"Insects", desc:"Aggressive creatures with deathtouch and proliferate synergies. Often synergize with -1/-1 counters.", ratio:"15%" },
  { name:"Knights", desc:"Aggressive creatures with first strike and vigilance. Reward going wide with cavalry-style strategies.", ratio:"15%" },
  { name:"Merfolk", desc:"Evasive tempo-oriented tribe with lords that buff each other. Reward going wide in blue.", ratio:"15%" },
  { name:"Rogues", desc:"Evasive creatures that reward mill and hand disruption strategies. Trigger off opponents having cards in graveyard.", ratio:"15%" },
  { name:"Shamans", desc:"Value-generating creatures tied to spellcasting and land play. Synergize with Spellslinger and Landfall.", ratio:"15%" },
  { name:"Slivers", desc:"Each Sliver gives all Slivers an ability -- exponentially powerful with critical mass. Requires 5-color support.", ratio:"15%" },
  { name:"Snakes", desc:"Synergistic tribe with deathtouch and -1/-1 counter interactions.", ratio:"15%" },
  { name:"Soldiers", desc:"Aggressive white tribe with lords and combat tricks. Reward going wide and attacking every turn.", ratio:"15%" },
  { name:"Spirits", desc:"Flash and flying tribe with tempo and graveyard synergies. Reward instant-speed play and sacrifice.", ratio:"15%" },
  { name:"Vampires", desc:"Aggressive tribe with lifelink and drain synergies. Reward going wide and exploiting lifegain payoffs.", ratio:"15%" },
  { name:"Werewolves", desc:"Transform-based tribe that rewards not casting spells. Require a low spell count strategy to stay transformed.", ratio:"15%" },
  { name:"Wizards", desc:"Spellcasting tribe that rewards casting instants and sorceries. Synergize with Spellslinger and Prowess.", ratio:"15%" },
  { name:"Zombies", desc:"Recursive tribe that rewards graveyard strategies and sacrifice. Self-regenerating board presence.", ratio:"15%" },
];

function ArchetypeDetailModal({ archetype, onClose }) {
  if (!archetype) return null;
  return (
    <div onClick={onClose} style={{ position:"fixed", top:0, left:0, right:0, bottom:0, backgroundColor:"rgba(0,0,0,0.6)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor:"#111", border:"1px solid #333", borderRadius:"6px", padding:"28px", width:"460px", maxWidth:"90vw" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"16px" }}>
          <span style={{ fontSize:"17px", fontWeight:"700", color:"#fff" }}>{archetype.name}</span>
          <span onClick={onClose} style={{ cursor:"pointer", color:"#aaa", fontSize:"20px", lineHeight:1, marginLeft:"12px" }}>x</span>
        </div>
        <div style={{ fontSize:"11px", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"6px" }}>Archetype Description</div>
        <p style={{ fontSize:"13px", color:"#aaa", lineHeight:"1.7", margin: archetype.ratio ? "0 0 16px 0" : 0 }}>{archetype.desc || ""}</p>
        {archetype.ratio && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:"1px solid #222", paddingTop:"12px" }}>
            <span style={{ fontSize:"12px", color:"#aaa" }}>Support Ratio</span>
            <span style={{ fontSize:"13px", fontWeight:"700", color: archetype.ratio === "0%" ? "#555" : "#c8a000" }}>{archetype.ratio}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TagsTuningPage({ tagDB, cards }) {
  const [orderBy, setOrderBy] = React.useState("name");
  const [activeDesc, setActiveDesc] = React.useState(null);

  function useCount(name, fields) {
    return cards.filter(c => fields.some(f =>
      (c.tags?.[f] || []).map(t => t.toLowerCase()).includes(name.toLowerCase())
    )).length;
  }

  function sorted(list, fields) {
    const copy = [...list];
    if (orderBy === "count") copy.sort((a, b) => useCount(b.name, fields) - useCount(a.name, fields));
    else copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }

  const mainFields   = ["main_archetype", "main_archetype_support"];
  const tribalFields = ["tribal_archetype", "tribal_archetype_support"];

  function ArchRow({ item, fields }) {
    const n = useCount(item.name, fields);
    return (
      <div style={{ backgroundColor:"#111", border:"1px solid #222", borderRadius:"4px", padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
        <span style={{ fontSize:"13px", color:"#ccc", fontWeight:"500" }}>{item.name}</span>
        <div style={{ display:"flex", alignItems:"center", gap:"10px", flexShrink:0 }}>
          <span style={{ fontSize:"12px", color:n > 0 ? "#fff" : "#444", fontWeight:"600", minWidth:"20px", textAlign:"right" }}>{n}</span>
          <button onClick={() => setActiveDesc(item)} style={{ backgroundColor:"transparent", border:"1px solid #333", borderRadius:"4px", width:"32px", height:"32px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0, flexShrink:0 }}><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="#aaa" strokeWidth="1.3"/><circle cx="8" cy="8" r="2.5" stroke="#aaa" strokeWidth="1.3"/></svg></button>
        </div>
      </div>
    );
  }

  function UtilitySection() {
    const catMap = {};
    UTILITY_DATA.forEach(d => { if (!catMap[d.cat]) catMap[d.cat] = []; catMap[d.cat].push(d); });
    let cats = Object.entries(catMap);
    if (orderBy === "count") {
      cats.sort(([, a], [, b]) => {
        const sa = a.reduce((s, d) => s + useCount(d.sub, ["utility"]), 0);
        const sb = b.reduce((s, d) => s + useCount(d.sub, ["utility"]), 0);
        return sb - sa;
      });
    } else {
      cats.sort(([a], [b]) => a.localeCompare(b));
    }
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
        {cats.map(([cat, entries]) => {
          const total = entries.reduce((s, d) => s + useCount(d.sub, ["utility"]), 0);
          const sortedEntries = orderBy === "count"
            ? [...entries].sort((a, b) => useCount(b.sub, ["utility"]) - useCount(a.sub, ["utility"]))
            : [...entries].sort((a, b) => a.sub.localeCompare(b.sub));
          return (
            <div key={cat}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 14px", backgroundColor:"#0d0d0d", borderRadius:"4px 4px 0 0", border:"1px solid #2a2a2a", marginBottom:"2px" }}>
                <span style={{ fontSize:"11px", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:"700" }}>{cat}</span>
                <span style={{ fontSize:"12px", color:total > 0 ? "#d4af37" : "#444", fontWeight:"600" }}>{total}</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"2px" }}>
                {sortedEntries.map(d => {
                  const n = useCount(d.sub, ["utility"]);
                  return (
                    <div key={d.sub} style={{ backgroundColor:"#111", border:"1px solid #1e1e1e", padding:"8px 14px 8px 22px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
                      <span style={{ fontSize:"12px", color:"#bbb" }}>{d.sub}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:"10px", flexShrink:0 }}>
                        <span style={{ fontSize:"12px", color:n > 0 ? "#fff" : "#444", fontWeight:"600", minWidth:"20px", textAlign:"right" }}>{n}</span>
                        <button onClick={() => setActiveDesc({ name:d.sub, desc:d.desc })} style={{ backgroundColor:"transparent", border:"1px solid #333", borderRadius:"4px", width:"32px", height:"32px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0, flexShrink:0 }}><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="#aaa" strokeWidth="1.3"/><circle cx="8" cy="8" r="2.5" stroke="#aaa" strokeWidth="1.3"/></svg></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"24px" }}>
        <span style={{ fontSize:"11px", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.1em" }}>Order by</span>
        {[["name","Name"],["count","Use Count"]].map(([val, lbl]) => (
          <span key={val} onClick={() => setOrderBy(val)} style={{
            fontSize:"12px", cursor:"pointer", padding:"4px 10px", borderRadius:"4px",
            backgroundColor: orderBy === val ? "#1a1a1a" : "transparent",
            border:"1px solid " + (orderBy === val ? "#4a90d9" : "#333"),
            color: orderBy === val ? "#4a90d9" : "#aaa",
          }}>{lbl}</span>
        ))}
      </div>

      <div style={{ ...S.box, marginBottom:"24px" }}>
        <div style={S.boxTitle}>Main Archetypes</div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
          {sorted(PREDEFINED_MAIN_ARCHETYPES, mainFields).map(a => <ArchRow key={a.name} item={a} fields={mainFields} />)}
        </div>
      </div>

      <div style={{ ...S.box, marginBottom:"24px" }}>
        <div style={S.boxTitle}>Tribal Archetypes</div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
          {sorted(PREDEFINED_TRIBAL_ARCHETYPES, tribalFields).map(a => <ArchRow key={a.name} item={a} fields={tribalFields} />)}
        </div>
      </div>

      <div style={{ ...S.box, marginBottom:"24px" }}>
        <div style={S.boxTitle}>Utility</div>
        <UtilitySection />
      </div>

      {activeDesc && <ArchetypeDetailModal archetype={activeDesc} onClose={() => setActiveDesc(null)} />}
    </div>
  );
}


const COLOR_KEYS = ["W","U","B","R","G"];
const COLOR_NAMES = { W:"White", U:"Blue", B:"Black", R:"Red", G:"Green" };
const COLOR_HEX   = { W:"#c8b882", U:"#4a90d9", B:"#aaa", R:"#d94a4a", G:"#4a9d5a" };

function ManaCurveBar({ cards }) {
  const [mode, setMode] = React.useState("all");
  const filtered = cards.filter(c => {
    const tl = (c.type_line || "").toLowerCase();
    if (mode === "creature") return tl.includes("creature");
    if (mode === "spell")    return !tl.includes("creature") && !tl.includes("land");
    return !tl.includes("land");
  });
  const maxCmc = 7;
  const buckets = Array.from({ length: maxCmc + 1 }, (_, i) => ({
    label: i === maxCmc ? `${maxCmc}+` : String(i),
    count: filtered.filter(c => i === maxCmc ? (c.cmc || 0) >= maxCmc : (c.cmc || 0) === i).length,
  }));
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const barH = 80;
  return (
    <div>
      <div style={{ display:"flex", gap:"8px", marginBottom:"16px" }}>
        {["all","creature","spell"].map(m => (
          <div key={m} onClick={() => setMode(m)} style={{
            padding:"4px 12px", fontSize:"11px", letterSpacing:"0.08em", textTransform:"uppercase",
            cursor:"pointer", borderRadius:"4px", border:"1px solid",
            borderColor: mode===m ? "#c8a000" : "#333",
            color: mode===m ? "#c8a000" : "#aaa",
            backgroundColor: mode===m ? "rgba(200,160,0,0.08)" : "transparent",
          }}>{m === "all" ? "All" : m === "creature" ? "Creatures" : "Spells"}</div>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:"6px", height:`${barH + 28}px` }}>
        {buckets.map(({ label, count }) => {
          const h = count === 0 ? 2 : Math.max(4, Math.round((count / maxCount) * barH));
          return (
            <div key={label} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
              <div style={{ fontSize:"10px", color:"#aaa" }}>{count > 0 ? count : ""}</div>
              <div style={{ width:"100%", height:`${h}px`, backgroundColor: count===0 ? "#1a1a1a" : "#c8a000", borderRadius:"2px 2px 0 0" }} />
              <div style={{ fontSize:"10px", color:"#555" }}>{label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize:"10px", color:"#444", textAlign:"right", marginTop:"4px" }}>CMC</div>
    </div>
  );
}

function ColorDistRow({ colorKey, target, actual }) {
  const over = actual > target;
  const ok   = actual === target;
  const statusColor = ok ? "#4a9d5a" : over ? "#d94a4a" : "#c8a000";
  const barW = Math.min(100, Math.round((actual / Math.max(target, 1)) * 100));
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"7px 0", borderBottom:"1px solid #1a1a1a" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"6px", width:"80px", flexShrink:0 }}>
        <ManaIcon c={colorKey} size={18} />
        <span style={{ fontSize:"12px", color:"#aaa" }}>{COLOR_NAMES[colorKey]}</span>
      </div>
      <div style={{ flex:1, height:"6px", backgroundColor:"#1a1a1a", borderRadius:"3px", overflow:"hidden" }}>
        <div style={{ width:`${barW}%`, height:"100%", backgroundColor: COLOR_HEX[colorKey], borderRadius:"3px" }} />
      </div>
      <div style={{ fontSize:"12px", color: statusColor, minWidth:"80px", textAlign:"right" }}>
        {actual} <span style={{ color:"#444" }}>/</span> {target}
      </div>
    </div>
  );
}

function CubeAnalysisPage({ cards, db, tagDB }) {
  const { size, colorless, monoPerColor, bicolorPerGuild, dualLands } = db;

  const monoTarget = Math.round(monoPerColor || 0);
  const colorDist  = COLOR_KEYS.map(k => ({
    key: k,
    target: monoTarget,
    actual: cards.filter(c => (c.colors||[]).length === 1 && c.colors[0] === k).length,
  }));

  const biTarget      = Math.round(bicolorPerGuild || 0);
  const biActual      = cards.filter(c => (c.colors||[]).length === 2).length;
  const biTargetTotal = biTarget * 10;
  const colorlessActual = cards.filter(c => (c.colors||[]).length === 0 && !(c.type_line||"").toLowerCase().includes("land")).length;
  const landsActual   = cards.filter(c => (c.type_line||"").toLowerCase().includes("land")).length;
  const filled        = cards.length;

  const cardAdvSubs = UTILITY_DATA.filter(d => d.core === 1 && d.cat === "Card Advantage").map(d => d.sub);
  const removalSubs = UTILITY_DATA.filter(d => d.core === 1 && d.cat === "Removal").map(d => d.sub);
  const cardAdvCards = cards.filter(c => (c.tags?.utility || []).some(u => cardAdvSubs.includes(u)));
  const removalCards = cards.filter(c => (c.tags?.utility || []).some(u => removalSubs.includes(u)));

  const mainActive   = PREDEFINED_MAIN_ARCHETYPES.filter(a =>
    cards.some(c => (c.tags?.main_archetype||[]).includes(a.name) || (c.tags?.main_archetype_support||[]).includes(a.name))
  );
  const tribalActive = PREDEFINED_TRIBAL_ARCHETYPES.filter(a =>
    cards.some(c => (c.tags?.tribal_archetype||[]).includes(a.name) || (c.tags?.tribal_archetype_support||[]).includes(a.name))
  );

  const guildCoverage = GUILDS_LIST.map(({ name, colors }) => {
    const gc    = cards.filter(c => c.tags?.guild === name);
    const count = PREDEFINED_MAIN_ARCHETYPES.filter(a =>
      gc.some(c => (c.tags?.main_archetype_support||[]).includes(a.name))
    ).length;
    return { name, colors, count };
  });

  const statBox = (label, value, sub, color="#fff") => (
    <div style={{ backgroundColor:"#111", border:"1px solid #222", borderRadius:"4px", padding:"20px", flex:1, minWidth:"120px" }}>
      <div style={{ fontSize:"10px", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"8px" }}>{label}</div>
      <div style={{ fontSize:"24px", fontWeight:"700", color }}>{value}</div>
      {sub && <div style={{ fontSize:"11px", color:"#555", marginTop:"4px" }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ ...S.page, maxWidth:"960px" }}>
      <div style={{ display:"flex", gap:"12px", marginBottom:"32px", flexWrap:"wrap" }}>
        {statBox("Cards in cube", filled, `of ${size} target`, filled === size ? "#4a9d5a" : filled > size ? "#d94a4a" : "#c8a000")}
        {statBox("Main archetypes", mainActive.length, `of ${PREDEFINED_MAIN_ARCHETYPES.length} defined`, "#c8a000")}
        {statBox("Tribal archetypes", tribalActive.length, `of ${PREDEFINED_TRIBAL_ARCHETYPES.length} defined`, "#4a90d9")}
        {statBox("Card advantage", cardAdvCards.length, "core utility cards")}
        {statBox("Removal", removalCards.length, "core utility cards", "#d94a4a")}
      </div>

      <div style={S.box}>
        <div style={S.boxTitle}>Color distribution — mono slots</div>
        {colorDist.map(({ key, target, actual }) => (
          <ColorDistRow key={key} colorKey={key} target={target} actual={actual} />
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"7px 0", borderBottom:"1px solid #1a1a1a", marginTop:"8px", borderTop:"1px solid #222" }}>
          <span style={{ fontSize:"12px", color:"#aaa", width:"80px", flexShrink:0 }}>Bicolor</span>
          <div style={{ flex:1, height:"6px", backgroundColor:"#1a1a1a", borderRadius:"3px", overflow:"hidden" }}>
            <div style={{ width:`${Math.min(100,Math.round((biActual/Math.max(biTargetTotal,1))*100))}%`, height:"100%", backgroundColor:"#7a5fa0", borderRadius:"3px" }} />
          </div>
          <div style={{ fontSize:"12px", color: biActual===biTargetTotal?"#4a9d5a":biActual>biTargetTotal?"#d94a4a":"#c8a000", minWidth:"80px", textAlign:"right" }}>
            {biActual} <span style={{ color:"#444" }}>/</span> {biTargetTotal}
          </div>
        </div>
        {colorless > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"7px 0", borderBottom:"1px solid #1a1a1a" }}>
            <span style={{ fontSize:"12px", color:"#aaa", width:"80px", flexShrink:0 }}>Colorless</span>
            <div style={{ flex:1, height:"6px", backgroundColor:"#1a1a1a", borderRadius:"3px", overflow:"hidden" }}>
              <div style={{ width:`${Math.min(100,Math.round((colorlessActual/Math.max(colorless,1))*100))}%`, height:"100%", backgroundColor:"#666", borderRadius:"3px" }} />
            </div>
            <div style={{ fontSize:"12px", color: colorlessActual===colorless?"#4a9d5a":colorlessActual>colorless?"#d94a4a":"#c8a000", minWidth:"80px", textAlign:"right" }}>
              {colorlessActual} <span style={{ color:"#444" }}>/</span> {colorless}
            </div>
          </div>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"7px 0" }}>
          <span style={{ fontSize:"12px", color:"#aaa", width:"80px", flexShrink:0 }}>Lands</span>
          <div style={{ flex:1, height:"6px", backgroundColor:"#1a1a1a", borderRadius:"3px", overflow:"hidden" }}>
            <div style={{ width:`${Math.min(100,Math.round((landsActual/Math.max(dualLands||1,1))*100))}%`, height:"100%", backgroundColor:"#5a7a3a", borderRadius:"3px" }} />
          </div>
          <div style={{ fontSize:"12px", color: landsActual===(dualLands||0)?"#4a9d5a":landsActual>(dualLands||0)?"#d94a4a":"#c8a000", minWidth:"80px", textAlign:"right" }}>
            {landsActual} <span style={{ color:"#444" }}>/</span> {dualLands||0}
          </div>
        </div>
      </div>

      <div style={S.box}>
        <div style={S.boxTitle}>Mana curve</div>
        <ManaCurveBar cards={cards} />
      </div>

      <div style={S.box}>
        <div style={S.boxTitle}>Core utility — card advantage &amp; removal</div>
        <div style={{ display:"flex", gap:"0", marginBottom:"8px" }}>
          <div style={{ flex:1 }}></div>
          {COLOR_KEYS.map(k => (
            <div key={k} style={{ width:"44px", display:"flex", justifyContent:"center" }}>
              <ManaIcon c={k} size={16} />
            </div>
          ))}
          <div style={{ width:"52px", textAlign:"right", fontSize:"10px", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.08em", paddingRight:"4px" }}>Total</div>
        </div>
        {[
          { label:"Card Advantage", uc: cardAdvCards, color:"#4a90d9" },
          { label:"Removal",        uc: removalCards,  color:"#d94a4a" },
        ].map(({ label, uc, color }) => {
          const byColor = COLOR_KEYS.map(k => uc.filter(c => (c.colors||[]).includes(k)).length);
          return (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:"0", padding:"8px 0", borderBottom:"1px solid #1a1a1a" }}>
              <div style={{ flex:1, fontSize:"12px", color:"#ccc" }}>{label}</div>
              {byColor.map((cnt, i) => (
                <div key={i} style={{ width:"44px", textAlign:"center", fontSize:"12px", color: cnt>0 ? COLOR_HEX[COLOR_KEYS[i]] : "#333" }}>{cnt || "—"}</div>
              ))}
              <div style={{ width:"52px", textAlign:"right", fontSize:"13px", color, fontWeight:"700", paddingRight:"4px" }}>{uc.length}</div>
            </div>
          );
        })}
      </div>

      <div style={S.box}>
        <div style={S.boxTitle}>Archetype coverage — support per guild</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
          {guildCoverage.map(({ name, colors, count }) => {
            const target      = MAIN_ARCH_PER_GUILD[db.size] || 2;
            const statusColor = count === 0 ? "#333" : count < target ? "#c8a000" : "#4a9d5a";
            return (
              <div key={name} style={{ backgroundColor:"#0d0d0d", border:"1px solid #222", borderRadius:"4px", padding:"12px 16px", minWidth:"140px", flex:"1" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"4px", marginBottom:"8px" }}>
                  {colors.split("").map(c => <ManaIcon key={c} c={c} size={14} />)}
                  <span style={{ fontSize:"11px", color:"#aaa", marginLeft:"4px" }}>{name}</span>
                </div>
                <div style={{ fontSize:"20px", fontWeight:"700", color: statusColor }}>{count}</div>
                <div style={{ fontSize:"10px", color:"#444", marginTop:"2px" }}>archetypes supported</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop:"16px", display:"flex", gap:"16px", fontSize:"11px", color:"#555" }}>
          <span><span style={{ color:"#4a9d5a" }}>■</span> at target ({MAIN_ARCH_PER_GUILD[db.size]||2}+)</span>
          <span><span style={{ color:"#c8a000" }}>■</span> below target</span>
          <span><span style={{ color:"#333" }}>■</span> no archetypes</span>
        </div>
      </div>
    </div>
  );
}


function ArchetypesPage({ cards, db, tagDB }) {
  const guilds = GUILDS_LIST.map(g => g.name);
  const specials = [
    ...(db.colorless > 0 ? ["Colorless"] : []),
    ...(db.wildcards > 0 ? ["Wildcards"] : []),
  ];
  const allCols = [...guilds, ...specials];

  function countActive(tag, field, guildName) {
    return cards.filter(c =>
      c.tags?.guild === guildName && (c.tags?.[field] || []).includes(tag)
    ).length;
  }

  function heatColor(val, max) {
    if (max === 0 || val === 0) return "transparent";
    const intensity = val / max;
    const alpha = 0.15 + intensity * 0.7;
    return `rgba(74, 144, 217, ${alpha.toFixed(2)})`;
  }

  function ArchetypeMatrix({ title, pool, activeField }) {
    if (!pool || pool.length === 0) return null;

    const rows = pool.map(tag => ({
      tag,
      counts: allCols.map(g => countActive(tag, activeField, g)),
    })).filter(r => r.counts.some(c => c > 0))
      .sort((a, b) => Math.max(...b.counts) - Math.max(...a.counts));

    const globalMax = Math.max(...rows.flatMap(r => r.counts), 1);

    return (
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>{title}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left", minWidth: "120px", position: "sticky", left: 0, backgroundColor: "#0d0d0d", zIndex: 1 }}>Archetype</th>
                {allCols.map(g => {
                  const gData = GUILDS_LIST.find(x => x.name === g);
                  return (
                    <th key={g} style={{ ...S.th, textAlign: "center", padding: "6px 4px", minWidth: "40px" }}>
                      {gData
                        ? <span style={{ display: "inline-flex", gap: "1px" }}>{gData.colors.split("").map(c => <ManaIcon key={c} c={c} size={13} />)}</span>
                        : <span style={{ fontSize: "9px", color: "#aaa" }}>{g.slice(0,3)}</span>
                      }
                    </th>
                  );
                })}
                <th style={{ ...S.th, textAlign: "right", color: "#aaa", fontSize: "10px" }}>Peak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tag, counts }) => {
                const peak = Math.max(...counts);
                const peakIdx = counts.indexOf(peak);
                return (
                  <tr key={tag}>
                    <td style={{ ...S.td(), position: "sticky", left: 0, backgroundColor: "#0d0d0d", zIndex: 1, fontWeight: "500", color: "#ccc" }}>{tag}</td>
                    {counts.map((val, i) => (
                      <td key={i} style={{
                        ...S.td(), textAlign: "center", padding: "5px 4px",
                        backgroundColor: heatColor(val, globalMax),
                        color: val > 0 ? (i === peakIdx ? "#fff" : "#aaa") : "#333",
                        fontWeight: i === peakIdx && val > 0 ? "700" : "400",
                        fontSize: "12px",
                      }}>
                        {val > 0 ? val : "·"}
                      </td>
                    ))}
                    <td style={{ ...S.td(), textAlign: "right", fontSize: "11px", color: "#aaa" }}>
                      {peak > 0 ? `${allCols[peakIdx].slice(0,6)}` : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={allCols.length + 2} style={{ ...S.td(), color: "#aaa", fontStyle: "italic" }}>No cards tagged yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <ArchetypeMatrix title="Main Archetypes" pool={PREDEFINED_MAIN_ARCHETYPES.map(a => a.name)} activeField="main_archetype" />
      <ArchetypeMatrix title="Tribal Archetypes" pool={PREDEFINED_TRIBAL_ARCHETYPES.map(a => a.name)} activeField="tribal_archetype" />
      <ArchetypeMatrix title="Utility" pool={[...new Set(UTILITY_DATA.map(d => d.sub))].sort()} activeField="utility" />
    </div>
  );
}




const UTILITY_DATA = [
    { cat:"Acceleration", type:"Cost Reduction", sub:"Cost Reduction", colors:"WUBRG", desc:"Reduces the mana cost of spells or permanents — includes creature cost reduction (Urza\'s Incubator, Herald\'s Horn), artifact cost reduction (Foundry Inspector, Etherium Sculptor), spell cost reduction (Baral, Goblin Electromancer), and enchantment cost reduction (Starfield Mystic, Jukai Naturalist).", core:0, targets:{pSelf:1,pOpp:0,creature:1,artifact:1,enchant:1,pw:1,land:0,token:0,battle:1,instant:1,sorcery:1} },
    { cat:"Acceleration", type:"Mana Fixing",   sub:"Mana Fixing",             colors:"WUBRG", desc:"Ensures access to the right colors of mana regardless of the method. Fetch lands, dual lands, shock lands, tri-color lands, and fixing spells all fall here. Examples: Polluted Delta, Underground Sea, Steam Vents, Reflecting Pool, City of Brass, Farseek, Nature\'s Lore, Chromatic Lantern." , core:0, targets:{pSelf:1,pOpp:0,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Acceleration", type:"Ramp",          sub:"Ramp",                    colors:"GBR", desc:"Anything that produces mana beyond your land-per-turn limit. Mana dorks: creatures that tap for mana (Llanowar Elves, Birds of Paradise). Land ramp: puts extra lands into play (Rampant Growth, Cultivate, Farseek). Mana rocks: artifacts that produce mana (Sol Ring, Signets, Talismans). Rituals: one-time mana burst (Dark Ritual, Pyretic Ritual). Mana multipliers: double or triple your mana output (Nyxbloom Ancient, Dictate of Karametra)." , core:0, targets:{pSelf:1,pOpp:0,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Board Presence", type:"Empower",       sub:"Anthem",         colors:"W",   desc:"A permanent that continuously boosts all your creatures simultaneously — scales best with wide token strategies. Includes haste anthems that let your entire team attack immediately. Examples: Honor of the Pure, Glorious Anthem, Intangible Virtue, Fires of Yavimaya, Mass Hysteria." , core:0, targets:{pSelf:0,pOpp:0,creature:1,artifact:0,enchant:0,pw:0,land:0,token:1,battle:0,instant:0,sorcery:0} },
    { cat:"Board Presence", type:"Empower",       sub:"Buff",          colors:"WGR", desc:"A permanent or lasting effect that boosts a single target creature — distinct from a combat trick in that the bonus persists beyond one turn. Includes haste-granting equipment that lets a creature attack immediately. Examples: Forced Adaptation, Retreat to Kazandu, Lightning Greaves, Swiftfoot Boots." , core:0, targets:{pSelf:0,pOpp:0,creature:1,artifact:0,enchant:0,pw:0,land:0,token:1,battle:0,instant:0,sorcery:0} },
    { cat:"Board Presence", type:"Empower",       sub:"Combat Trick",  colors:"GRW", desc:"Instant +X/+X boost to a single creature for one turn — creates profitable attacks or unexpected blocks. The most common offensive combat trick in green and white. Examples: Giant Growth, Might of Old Krosa, Titanic Growth, Mutagenic Growth." , core:0, targets:{pSelf:0,pOpp:0,creature:1,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Board Presence", type:"Evasion", sub:"Evasion", colors:"WUBGR", desc:"Keywords and abilities that make creatures difficult or impossible to block. Flying: cannot be blocked by non-flying creatures — most common evasion (most blue and white creatures). Trample: excess combat damage carries over to the player — turns large creatures into reliable closers (Rancor, Overrun). Unblockable / Shadow: cannot be blocked at all or only by creatures with Shadow (Whispersilk Cloak, Dauthi Slayer). Menace: can only be blocked by two or more creatures — forces difficult blocking decisions (Mardu Strike Leader). Fear / Intimidate: can only be blocked by artifact creatures or creatures sharing a color (Fear, Intimidate). Skulk: can only be blocked by creatures with equal or lesser power — slips past large defenders (Dimensional Infiltrator). Landwalk: unblockable if opponent controls a specific land type (Zodiac Rooster, Zodiac Tiger)." , core:0, targets:{pSelf:0,pOpp:0,creature:1,artifact:0,enchant:0,pw:0,land:0,token:1,battle:0,instant:0,sorcery:0} },
    { cat:"Board Presence", type:"Proliferate", sub:"Proliferate", colors:"WUB", desc:"Add one counter of each kind already on a permanent or player — multiplies +1/+1 counters, loyalty counters on planeswalkers, and poison counters on opponents. Value scales with what is already in play.", core:0, targets:{pSelf:1,pOpp:1,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Board Presence", type:"Protection", sub:"Protection", colors:"WUG", desc:"Shield your permanents or yourself from interaction — includes hexproof, shroud, indestructible, protection from color, and regeneration. Can protect any permanent type or player. Some effects also prevent spells from being countered. Examples: Mother of Runes, Gods Willing, Blossoming Defense, Teferi's Protection, Privileged Position, Swiftfoot Boots, Darksteel Plate.", core:0, targets:{pSelf:1,pOpp:0,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Board Presence", type:"Trigger Doubling", sub:"Trigger Doubling", colors:"WU", desc:"Double the triggers of your permanents — ETB effects trigger twice, damage triggers twice. Examples: Panharmonicon, Strionic Resonator, Lithoform Engine, Yarok the Desecrated.", core:0, targets:{pSelf:1,pOpp:0,creature:1,artifact:1,enchant:1,pw:1,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Card Advantage", type:"Draw", sub:"Dig",              colors:"UGW",  desc:"Look at the top X cards of your library and put one or more into hand — a mild tutor effect. Unlike Impulse, the cards are not exiled. Unlike Pure Draw, you are selecting from multiple options rather than drawing blindly. May or may not trigger \'whenever you draw a card\' effects depending on the specific card. Examples: Sensei\'s Divining Top, Sylvan Library, Abundance, Mirri\'s Guile, Scroll Rack." , core:1, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Card Advantage", type:"Draw", sub:"Draw",         colors:"WUBGR", desc:"Draw one or more cards with no discard requirement. Covers all pure card advantage variants: Cantrip: draw 1 at low cost with a minor effect (Brainstorm, Ponder, Preordain). Card Draw: draw 2+ unconditionally (Divination, Harmonize, Night\'s Whisper). Repeatable Draw: a permanent that draws every turn (Phyrexian Arena, Rhystic Study). Selective Draw: look at the top X cards and keep specific types — sits between draw and tutor (Collected Company, Lead the Stampede). Group Hug Draw: symmetrical draw for all players — only effective if your strategy exploits the high-card-count state better than the opponent (Howling Mine, Temple Bell, Rites of Flourishing)." , core:1, targets:{pSelf:1,pOpp:1,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Card Advantage", type:"Draw", sub:"Impulse",           colors:"UR",   desc:"Exile top cards and play them later — card selection that does not add to hand immediately. Examples: Glimmer of Genius, Light Up the Stage." , core:1, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Card Advantage", type:"Draw", sub:"Loot",             colors:"UR",   desc:"Draw and discard in various combinations — filters your hand while enabling graveyard strategies. Looting: draw then discard (Faithless Looting, Merfolk Looter). Rummaging: discard then draw — you lose the card before drawing (Tormenting Voice, Wild Guess). Wheel: all players discard their entire hand and redraw — resets the game state and fills graveyards (Wheel of Fortune, Windfall)." , core:1, targets:{pSelf:1,pOpp:1,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Card Advantage", type:"Tutor", sub:"Tutor", colors:"WUBRG", desc:"Find any card from your library and put it in hand or play. Some effects search for all players simultaneously. Includes universal tutors (Demonic Tutor, Vampiric Tutor), type-specific tutors (Chord of Calling, Mystical Tutor, Idyllic Tutor, Fabricate), and group tutors (Collective Voyage, Tempt with Discovery).", core:1, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Deck Manipulation", type:"Mill", sub:"Mill", colors:"UBG", desc:"Put cards from a library directly into the graveyard. Self mill fuels graveyard strategies (Satyr Wayfinder, Stitcher\'s Supplier, Life from the Loam). Opponent mill depletes the opponent\'s library as a win condition (Mesmeric Orb, Glimpse the Unthinkable, Archive Trap).", core:0, targets:{pSelf:1,pOpp:1,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Deck Manipulation", type:"Scry", sub:"Scry", colors:"WUB", desc:"Look at the top X cards of your library and put them back in any order on top or bottom — no cards enter hand. Pure library ordering. Examples: Opt (Scry 1), Serum Visions (Scry 2), Brainstorm (put 2 back), Sensei\'s Divining Top.", core:0, targets:{pSelf:1,pOpp:0,creature:0,artifact:0,enchant:0,pw:0,land:0,battle:0,instant:0,sorcery:0} },
    { cat:"Deck Manipulation", type:"Surveil", sub:"Surveil", colors:"UB", desc:"Look at the top X cards of your library and put them back on top or into the graveyard — fuels graveyard strategies while filtering the deck. Examples: Connive, Surveil spells, Blood Operative, Notion Rain.", core:0, targets:{pSelf:1,pOpp:0,creature:0,artifact:0,enchant:0,pw:0,land:0,battle:0,instant:0,sorcery:0} },
    { cat:"Graveyard Manipulation", type:"Graveyard Hate", sub:"Exile Graveyard", colors:"WUBG", desc:"Exile cards from a graveyard — total or selective. Includes full graveyard exile and surgical extraction.", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Graveyard Manipulation", type:"Recursion", sub:"Recursion", colors:"WUBRG", desc:"Return cards from the graveyard to hand, battlefield, or library. Works on any card type — creatures (Unearth, Animate Dead, Reanimate), instants and sorceries (Snapcaster Mage, Recoup), artifacts (Goblin Welder, Daretti), enchantments (Replenish), lands (Crucible of Worlds), or any type (Regrowth, Noxious Revival).", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Hand Manipulation", type:"Discard", sub:"Discard", colors:"UBR", desc:"Force cards to be discarded from hand — can target yourself or the opponent. Self discard fuels graveyard strategies and enables Madness (Faithless Looting, Survival of the Fittest). Opponent discard removes threats before they are played — targeted (Thoughtseize, Inquisition of Kozilek), edict (Hymn to Tourach), or repeatable (Liliana of the Veil).", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Hand Manipulation", type:"Exile from Hand", sub:"Exile from Hand", colors:"WUR", desc:"Exile cards directly from hand — different from discard as the card goes to exile, not the graveyard. Self exile: delay casting for tempo or mana advantage (Foretell, Suspend, Imprint). Opponent exile: removes a threat permanently with no graveyard recursion possible. Examples: Foretell spells, Delay, Isochron Scepter (Imprint), Mindbreak Trap.", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Removal", type:"Bounce",          sub:"Bounce",          colors:"U",    desc:"Return a permanent to its owner\'s hand — temporary removal that resets ETB triggers and tempo. Works on any permanent type. Examples: Unsummon, Vapor Snag, Cyclonic Rift, Into the Roil.", core:1, targets:{pSelf:0,pOpp:0,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Removal", type:"Burn",             sub:"Burn",             colors:"R",    desc:"Deal damage to any target — creatures, planeswalkers, and players. The most versatile removal in red, doubling as a win condition against the player. Examples: Lightning Bolt, Incinerate, Char, Flame Slash.", core:1, targets:{pSelf:1,pOpp:1,creature:1,artifact:0,enchant:0,pw:1,land:0,token:1,battle:1,instant:0,sorcery:0} },
    { cat:"Removal", type:"Counterspell", sub:"Counterspell", colors:"U", desc:"Prevent a spell from resolving — the most flexible interaction in blue. Universal counters stop anything (Counterspell, Mana Drain, Force of Will). Conditional counters target specific types (Negate for non-creatures, Essence Scatter for creatures, Annul for artifacts/enchantments, Dovin\'s Veto for planeswalkers).", core:1, targets:{pSelf:0,pOpp:0,creature:1,artifact:1,enchant:1,pw:1,land:0,token:0,battle:0,instant:1,sorcery:1} },
    { cat:"Removal", type:"Debuff", sub:"Debuff", colors:"BG", desc:"-X/-X effects that reduce a creature\'s power and toughness — may kill the creature if toughness reaches 0, or simply weaken it. Unlike destroy effects, Debuff bypasses indestructible. Examples: Tragic Slip, Grasp of Darkness, Dismember, Languish, Black Sun\'s Zenith.", core:1, targets:{pSelf:0,pOpp:0,creature:1,artifact:0,enchant:0,pw:0,land:0,token:1,battle:0,instant:0,sorcery:0} },
    { cat:"Removal", type:"Destroy / Exile", sub:"Destroy / Exile", colors:"WUBRG", desc:"Remove or neutralize a permanent — includes destruction, exile, bouncing to hand, tapping/pacifism, fight effects, and -X/-X effects. Covers targeted removal (Swords to Plowshares, Fatal Push), bounce (Unsummon, Cyclonic Rift), pacifism (Arrest, Diminish), fight (Prey Upon), and weakening (-X/-X effects like Tragic Slip).", core:1, targets:{pSelf:0,pOpp:0,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:0,sorcery:0} },
    { cat:"Removal", type:"Fight",             sub:"Fight",             colors:"G",   desc:"Your creature fights target creature — both deal damage equal to their power to each other. Efficient removal that keeps your creature. Examples: Prey Upon, Pit Fight, Ulvenwald Tracker, Feral Contest.", core:1, targets:{pSelf:0,pOpp:0,creature:1,artifact:0,enchant:0,pw:0,land:0,token:1,battle:1,instant:0,sorcery:0} },
    { cat:"Removal", type:"Sacrifice",        sub:"Sacrifice",        colors:"BRG",  desc:"Force an opponent to sacrifice permanents — bypasses indestructible, hexproof, and protection. Examples: Dictate of Erebos, Liliana of the Veil, Diabolic Edict, Crackling Doom.", core:1, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:0,sorcery:0} },
    { cat:"Removal", type:"Tapping / Pacifism", sub:"Tapping / Pacifism", colors:"WU", desc:"Neutralize a permanent without removing it — creature stays in play but cannot attack, block, or use abilities. Examples: Arrest, Diminish, Pacifism, Kasmina\'s Transmutation, Azorius Charm.", core:1, targets:{pSelf:0,pOpp:0,creature:1,artifact:1,enchant:0,pw:1,land:0,token:1,battle:0,instant:0,sorcery:0} },
    { cat:"Removal", type:"Wrath",            sub:"Wrath",            colors:"WB",   desc:"Destroy or exile multiple permanents simultaneously — resets the board. Includes creature wraths (Wrath of God, Damnation), artifact wraths (Shatterstorm), enchantment wraths (Tranquility), and mixed wraths (Austere Command). Examples: Wrath of God, Damnation, Languish, Toxic Deluge.", core:1, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:0,sorcery:0} },
    { cat:"Restriction", type:"Ability Tax",  sub:"Ability Tax",  colors:"WUG",  desc:"Make activated or triggered abilities more expensive or impossible to use. Examples: Cursed Totem (no activated abilities), Collector Ouphe (no artifact abilities), Phyrexian Revoker (named card), Pithing Needle.", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Restriction", type:"Attack Tax",   sub:"Attack Tax",   colors:"WU",   desc:"Make attacking more expensive or difficult — forces the opponent to pay mana or sacrifice resources to attack. Examples: Ghostly Prison, Propaganda, Crawlspace, Sphere of Safety.", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Restriction", type:"Casting Tax",  sub:"Casting Tax",  colors:"WU",   desc:"Increase the mana cost of spells — slows the opponent\'s game plan without fully stopping it. Symmetric or asymmetric. Examples: Thalia Guardian of Thraben (non-creatures), Sphere of Resistance (all spells), Trinisphere, Lodestone Golem, Glowrider.", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:0,token:0,battle:1,instant:1,sorcery:1} },
    { cat:"Restriction", type:"Draw Restriction", sub:"Draw Restriction", colors:"UBR", desc:"Limit how many cards a player can draw per turn — shuts down card advantage engines. Examples: Narset Parter of Veils, Leovold Emissary of Trest, Spirit of the Labyrinth.", core:0, targets:{pSelf:1,pOpp:1,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Restriction", type:"Draw Tax",     sub:"Draw Tax",     colors:"UBR",  desc:"Make drawing cards more expensive or punish the opponent for drawing. Examples: Leovold Emissary of Trest, Notion Thief, Narset Parter of Veils, Hullbreacher.", core:0, targets:{pSelf:1,pOpp:1,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Restriction", type:"Search Tax",   sub:"Search Tax",   colors:"WU",   desc:"Restrict or punish searching the library — shuts down tutors and fetch lands. Examples: Aven Mindcensor (only top 4), Shadow of Doubt, Leonin Arbiter, Stranglehold.", core:0, targets:{pSelf:1,pOpp:1,creature:0,artifact:0,enchant:0,pw:0,land:0,token:0,battle:0,instant:0,sorcery:0} },
    { cat:"Restriction", type:"Spell Casting Restriction", sub:"Spell Casting Restriction", colors:"WU", desc:"Limit how many spells a player can cast per turn — slows combo and control strategies. Examples: Rule of Law, Arcane Laboratory, Eidolon of Rhetoric, Ethersworn Canonist.", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:1,token:1,battle:1,instant:1,sorcery:1} },
    { cat:"Restriction", type:"Trigger Prevention", sub:"Trigger Prevention", colors:"WU", desc:"Prevent triggered abilities from activating — primarily shuts down ETB effects. Examples: Torpor Orb, Hushbringer, Hushwing Gryff, Tocatli Honor Guard.", core:0, targets:{pSelf:1,pOpp:1,creature:1,artifact:1,enchant:1,pw:1,land:0,token:0,battle:1,instant:0,sorcery:0} },
  ]

const UTILITY_CAT_MAP = Object.fromEntries(UTILITY_DATA.map(d => [d.sub, d.cat]));

function UtilityRefTable({ setActiveDesc }) {
  const [filterCat,  setFilterCat]  = React.useState("All");




  const categories = ["All", ...new Set(UTILITY_DATA.map(d => d.cat))];
  const filtered = UTILITY_DATA.filter(d => filterCat === "All" || d.cat === filterCat);

  const pillStyle = (active) => ({
    padding:"4px 12px", borderRadius:"20px", cursor:"pointer", fontSize:"12px",
    backgroundColor: active ? "#4a90d9" : "#1a1a1a",
    color: active ? "#fff" : "#666",
    border: `1px solid ${active ? "#4a90d9" : "#333"}`,
    whiteSpace:"nowrap", userSelect:"none",
  });

  const COLORS_MAP = {W:"W",U:"U",B:"B",R:"R",G:"G",C:"C"};

  function ColorDots({ str }) {
    const letters = [...str].filter(c => "WUBRGC".includes(c));
    if (!letters.length) return null;
    return (
      <span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}>
        {letters.map((c,i) => c === "C"
          ? <span key={i} style={{width:"14px",height:"14px",borderRadius:"50%",backgroundColor:"#555",border:"1px solid #777",display:"inline-block"}} />
          : <ManaIcon key={i} c={c} size={14} />
        )}
      </span>
    );
  }

  const [showFilters, setShowFilters] = React.useState(false);
  const activeFilterCount = (filterCat !== "All" ? 1 : 0);

  return (
    <div>
      {/* Filter button */}
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}>
        <div onClick={() => setShowFilters(true)} style={{
          display:"inline-flex",alignItems:"center",gap:"8px",
          padding:"7px 14px",borderRadius:"4px",cursor:"pointer",
          backgroundColor:"#111",border:"1px solid #333",fontSize:"13px",color:"#ccc",
        }}>
          {"⚙"} Filters
          {activeFilterCount > 0 && (
            <span style={{backgroundColor:"#4a90d9",color:"#fff",borderRadius:"50%",width:"18px",height:"18px",fontSize:"11px",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:"700"}}>{activeFilterCount}</span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <span onClick={() => { setFilterCat("All"); setFilterType("All"); }} style={{fontSize:"12px",color:"#aaa",cursor:"pointer",textDecoration:"underline",textUnderlineOffset:"2px"}}>Clear</span>
        )}
      </div>

      {/* Filter overlay */}
      {showFilters && (
        <div onClick={() => setShowFilters(false)} style={{position:"fixed",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.6)",zIndex:500,display:"flex",alignItems:"flex-start",justifyContent:"flex-end"}}>
          <div onClick={e => e.stopPropagation()} style={{backgroundColor:"#111",borderLeft:"1px solid #222",width:"320px",height:"100%",overflowY:"auto",padding:"24px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px"}}>
              <span style={{fontSize:"14px",fontWeight:"700",color:"#fff"}}>Filters</span>
              <span onClick={() => setShowFilters(false)} style={{cursor:"pointer",color:"#aaa",fontSize:"20px",lineHeight:"1"}}>x</span>
            </div>
            <div style={{fontSize:"10px",color:"#aaa",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"8px"}}>Category</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"20px"}}>
              {categories.map(c => (
                <span key={c} onClick={() => setFilterCat(c)} style={pillStyle(filterCat===c)}>{c}</span>
              ))}
            </div>

          </div>
        </div>
      )}

      <div style={{...S.box, marginBottom:"16px"}}>
        <div style={{fontSize:"12px",color:"#d4af37",fontWeight:"600",marginBottom:"6px"}}>{"✓"} Core Utility</div>
        <p style={{fontSize:"12px",color:"#aaa",margin:0,lineHeight:"1.6"}}>Core utility categories are essential for any functional cube and any draftable deck. <strong style={{color:"#fff"}}>Card Advantage</strong> ensures players can refill their hand and find answers, while <strong style={{color:"#fff"}}>Removal</strong> provides the interaction necessary to deal with threats. Without sufficient density of these two categories, games become one-sided and draft picks lose strategic depth. Every guild should have reliable access to both.</p>
      </div>

      <div style={{overflow:"auto", maxHeight:"calc(100vh - 220px)", border:"1px solid #222", borderRadius:"4px"}}>
        <table style={{...S.table,width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              <th style={{...S.th,padding:"6px 10px",verticalAlign:"bottom",position:"sticky",top:0,zIndex:3,backgroundColor:"#0d0d0d"}} rowSpan={2}>Category</th>
              <th style={{...S.th,padding:"4px 6px",textAlign:"center",verticalAlign:"bottom",position:"sticky",top:0,zIndex:3,backgroundColor:"#0d0d0d"}} rowSpan={2}>
                <div style={{writingMode:"vertical-rl",transform:"rotate(180deg)",whiteSpace:"nowrap",display:"inline-block",fontSize:"10px"}}>Core Utility</div>
              </th>
              <th style={{...S.th,padding:"6px 10px",verticalAlign:"bottom",position:"sticky",top:0,zIndex:3,backgroundColor:"#0d0d0d"}} rowSpan={2}>Type</th>
              <th style={{...S.th,padding:"6px 10px",width:"28px",verticalAlign:"bottom",position:"sticky",top:0,zIndex:3,backgroundColor:"#0d0d0d"}} rowSpan={2}></th>
              <th style={{...S.th,padding:"4px 6px",textAlign:"center",verticalAlign:"bottom",position:"sticky",top:0,zIndex:3,backgroundColor:"#0d0d0d"}} colSpan={2}><span style={{fontSize:"8px",letterSpacing:"0.1em"}}>PLAYER</span></th>
              <th style={{...S.th,padding:"4px 6px",textAlign:"center",verticalAlign:"bottom",position:"sticky",top:0,zIndex:3,backgroundColor:"#0d0d0d"}} colSpan={6}><span style={{fontSize:"8px",letterSpacing:"0.1em"}}>PERMANENT</span></th>
              <th style={{...S.th,padding:"4px 6px",textAlign:"center",verticalAlign:"bottom",position:"sticky",top:0,zIndex:3,backgroundColor:"#0d0d0d"}} colSpan={2}><span style={{fontSize:"8px",letterSpacing:"0.1em"}}>SPELL</span></th>
            </tr>
            <tr>
              {["Self","Opponent","Creature","Artifact","Enchantment","Planeswalker","Battle","Land","Instant","Sorcery"].map(h => (
                <th key={h} style={{...S.th,padding:"4px 6px",textAlign:"center",fontSize:"10px",verticalAlign:"bottom",position:"sticky",top:0,zIndex:3,backgroundColor:"#0d0d0d"}}>
                  <div style={{writingMode:"vertical-rl",transform:"rotate(180deg)",whiteSpace:"nowrap",display:"inline-block"}}>{h}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d,i) => {
              const t = d.targets || {};
              const check = (v) => v ? <span style={{color:"#4a9d5a",fontSize:"13px"}}>{"✓"}</span> : null;
              return (
                <tr key={i} style={{cursor:"default"}}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor="#1a1a1a"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor="transparent"}>
                  <td style={{...S.td(),padding:"6px 10px",color:"#bbb",fontSize:"12px"}}>{d.cat}</td>
                  <td style={{...S.td(),padding:"5px 6px",textAlign:"center"}}>{d.core ? <span style={{color:"#d4af37",fontSize:"13px"}}>{"✓"}</span> : null}</td>
                  <td style={{...S.td(),padding:"6px 10px",color:"#e8e8e8",fontSize:"12px",fontWeight:"500"}}>{d.sub}</td>
                  <td style={{...S.td(),padding:"6px 10px",textAlign:"center"}}>
                    <span onClick={() => setActiveDesc(d.desc)} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span>
                  </td>
                  {[t.pSelf,t.pOpp,t.creature,t.artifact,t.enchant,t.pw,t.battle,t.land,t.instant,t.sorcery].map((v,ci) => (
                    <td key={ci} style={{...S.td(),padding:"5px 6px",textAlign:"center"}}>{check(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReferencePage() {
  const [refTab, setRefTab] = React.useState("Archetypes");
  const [activeDesc, setActiveDesc] = React.useState(null);
  const tabs = ["Archetypes", "Utility", "Tribal"];
  return (
    <div style={{...S.page, paddingTop:"0"}}>
      {activeDesc && (
        <div onClick={() => setActiveDesc(null)} style={{position:"fixed",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          <div onClick={e => e.stopPropagation()} style={{backgroundColor:"#111",border:"1px solid #333",borderRadius:"8px",padding:"24px",maxWidth:"540px",width:"100%",position:"relative"}}>
            <div onClick={() => setActiveDesc(null)} style={{position:"absolute",top:"12px",right:"16px",cursor:"pointer",color:"#aaa",fontSize:"20px",lineHeight:"1"}}>x</div>
            <p style={{color:"#ccc",fontSize:"14px",lineHeight:"1.7",margin:0}}>{activeDesc}</p>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:"1px",borderBottom:"1px solid #222",marginBottom:"24px",paddingTop:"16px"}}>
        {tabs.map(t => (
          <div key={t} onClick={() => setRefTab(t)} style={{padding:"8px 20px",cursor:"pointer",fontSize:"13px",color:refTab===t?"#fff":"#666",borderBottom:refTab===t?"2px solid #d4af37":"2px solid transparent",fontWeight:refTab===t?"600":"400"}}>{t}</div>
        ))}
      </div>
      <div style={{maxWidth:"900px"}}>
        {refTab === "Archetypes" && <div>
          <h1 style={{fontSize:"20px",fontWeight:"700",color:"#fff",marginBottom:"8px",marginTop:"0"}}>Archetypes Reference</h1>
          <div style={{height:"6px"}} />
          <h2 style={{fontSize:"15px",fontWeight:"700",color:"#d4af37",marginBottom:"8px",marginTop:"28px",borderBottom:"1px solid #222",paddingBottom:"6px"}}>Support Ratio</h2>
          <div style={{height:"6px"}} />
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>The support ratio measures what percentage of the cube must be dedicated support cards for this archetype to function consistently in a draft.</p>
          <div style={{height:"6px"}} />
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>```</p>
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>support_ratio = 0.12  →  43 cards in a 360 cube  →  ~5 cards seen per draft</p>
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>```</p>
          <div style={{height:"6px"}} />
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>A drafter sees 12.5% of the cube in their 45-card pool. With a support ratio of <strong style={{color:"#fff"}}>0.12</strong>, the cube contains 12% support cards for that archetype, meaning the drafter will see approximately <strong style={{color:"#fff"}}>5 support cards</strong> in their pool — enough to build a functional deck around the strategy.</p>
          <div style={{height:"6px"}} />
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}><strong style={{color:"#fff"}}>Autonomous archetypes</strong> have a support ratio of <strong style={{color:"#fff"}}>0.0</strong> — their active cards work independently and do not require a specific card type to trigger or enable them. The archetype functions regardless of what else is in the draft pool.</p>
          <div style={{height:"6px"}} />
          <blockquote style={{borderLeft:"3px solid #444",paddingLeft:"12px",color:"#aaa",margin:"12px 0",fontStyle:"italic"}}>Note: support cards can be distributed across multiple guilds. It is the cube builder's responsibility to ensure the total count is met and distributed appropriately.</blockquote>
          <div style={{height:"6px"}} />
          <hr style={{...S.divider,margin:"20px 0"}} />
          <div style={{height:"6px"}} />
          <h2 style={{fontSize:"15px",fontWeight:"700",color:"#d4af37",marginBottom:"8px",marginTop:"28px",borderBottom:"1px solid #222",paddingBottom:"6px"}}>Archetypes Table</h2>
          <div style={{height:"6px"}} />
          <div style={{overflowX:"auto",marginBottom:"16px"}}><table style={{...S.table,width:"100%",borderCollapse:"collapse"}}><thead><tr>
          <th style={{...S.th,padding:"6px 10px",whiteSpace:"nowrap"}}>Archetype</th>
          <th style={{...S.th,padding:"6px 10px",whiteSpace:"nowrap"}}>Colors</th>
          <th style={{...S.th,padding:"6px 10px",whiteSpace:"nowrap"}}>Support Ratio</th>
          <th style={{...S.th,padding:"6px 10px",width:"28px"}}></th>
          </tr></thead><tbody>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Affinity Artifacts</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Reduce the mana cost of spells based on the number of artifacts you control. Requires a minimum density of artifacts to make the cost reduction meaningful. *Example: Thoughtcast, Frogmite, Myr Enforcer, Cranial Plating + artifact lands and mana rocks.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Affinity Creatures / Convoke</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Reduce the mana cost of spells by tapping creatures (Convoke) or based on the number of creatures you control (Affinity for creatures). Rewards going wide with many small creatures. *Example: Chord of Calling, Convoke spells, Venerated Loxodon, Venomous Hierophant + token generators.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Aggro</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Low-curve creatures and direct damage. Wins before interaction matters. *Example: 1-drops into 2-drops into burn to the face.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Burn</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Instants and sorceries that deal damage directly to the opponent. Entirely self-sufficient. *Example: Lightning Bolt, Chain Lightning, Searing Spear.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Control</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="W" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Removal, counterspells, and card draw to stabilize then win with a single threat. *Example: Wrath of God + Sphinx — clear board, land finisher, done.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Midrange</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /><ManaIcon c="B" size={14} /><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Efficient threats at every curve point. No specific synergy needed — just good cards. *Example: Tarmogoyf into Siege Rhino into Grave Titan.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Tempo</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Cheap threats + cheap interaction to stay ahead. Cards are individually efficient. *Example: Delver of Secrets + Mana Leak + Brainstorm.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Tokens</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="G" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Spells that create multiple creature tokens. Individually strong; with anthem effects or sacrifice outlets they become dominant. *Example: Lingering Souls + Intangible Virtue + Anointed Procession.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Superfriends</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="U" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Multiple planeswalkers that protect each other and generate incremental advantage. Individually strong but reward density. *Example: Oko + Teferi + Elspeth + Gideon.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>-1/-1 Counters</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Cards that place or benefit from -1/-1 counters — weakening enemy creatures, generating tokens from counter placement, or exploiting mechanics like Wither, Persist, and Devoted Druid. Each card functions independently; density amplifies the strategy. *Example: Hapatra Vizier of Poisons + Nest of Scarabs + Devoted Druid + Grief.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>+1/+1 Counters</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /><ManaIcon c="W" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Creatures that place or benefit from +1/+1 counters. Scales heavily with density of counter distribution. *Example: Hardened Scales + Walking Ballista + Winding Constrictor.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Lifegain</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="B" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Cards that gain life trigger payoffs — drawing cards, growing creatures, or stabilizing. Requires a moderate density of gain triggers. *Example: Soul Warden + Ajani\'s Pridemate + Griffin Aerie.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Cycling</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="U" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Permanents that trigger whenever you cycle. Individually fine; with payoff density they generate significant card advantage. *Example: Drake Haven + Astral Drift + Decree of Justice.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Heroic</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="U" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Creatures with Heroic trigger whenever they are the target of a spell — growing in size, gaining abilities, or generating tokens. Requires a minimum density of cheap spells that target creatures (pump, protection, auras) to activate consistently. *Example: Akroan Crusader, Favored Hoplite, Tethmos High Priest + Gods Willing + Coordinated Assault.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Skies / Flying</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="U" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Payoffs that reward controlling flying creatures — anthems for flyers, creatures that grow with each flyer you control, and spells that interact specifically with flying. Requires a minimum density of flying creatures to activate payoffs consistently. *Example: Empyrean Eagle, Favorable Winds, Sephara Sky\'s Blade, Gravitational Shift.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Storm</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Cast as many spells as possible in one turn, then a Storm payoff copies itself for each spell cast. Requires cheap rituals, cantrips, and a critical mass of low-cost spells to storm off consistently. *Example: Grapeshot + Dark Ritual + Manamorphose + Gitaxian Probe.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Lands</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Use lands as a primary resource beyond mana production — recurring lands from the graveyard, playing extra lands per turn, and exploiting land synergies. Each card works independently. *Example: Life from the Loam, Exploration, Crucible of Worlds, Titania Protector of Argoth.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Voltron</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("One large or evasive creature loaded with auras and equipment to become a one-shot kill threat. *Example: Kor Duelist + Sword of Fire and Ice + Ethereal Armor.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Stompy</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Large creatures deployed ahead of curve via ramp. Ramp is technically support but exists in the cube for other reasons. *Example: Llanowar Elves into Steel Leaf Champion into Craterhoof.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Landfall</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Permanents that trigger whenever a land enters the battlefield. Fetch lands and ramp spells in the cube act as passive support. *Example: Lotus Cobra + Tireless Tracker + Omnath, Locus of Rage.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Spellslinger</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Creatures or permanents that trigger whenever you cast an instant or sorcery. The spell suite already in the cube for removal and draw acts as passive support. *Example: Prowess creatures + Young Pyromancer + Guttersnipe.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Prowess</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Creatures with Prowess get +1/+1 whenever you cast a non-creature spell. The spell suite already in the cube acts as passive support. *Example: Monastery Swiftspear + Sprite Dragon + Mutagenic Growth.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Lifedrain</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Gaining life simultaneously drains the opponent — functions as an alternate win condition. Requires a critical mass of drain effects. *Example: Exquisite Blood + Sanguine Bond + Gray Merchant of Asphodel.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Graveyard Exit</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Permanents that trigger whenever a card leaves the graveyard — either through recursion, exile, escape, or flashback. Particularly synergistic with mechanics that repeatedly move cards out of the graveyard: Flashback, Escape, Disturb, and Dredge. *Example: Insidious Roots creates a Plant token every time a card leaves your graveyard — combine with Escape spells or Dredge to trigger repeatedly each turn.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Graveyard Value</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Cards that generate value from creatures dying or sitting in the graveyard. Requires graveyard density to be consistent. *Example: Deathrite Shaman + Dredge cards + Vengevine.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Hand Disruption</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Force the opponent to discard cards from hand — removes threats before they can be played. Each card works independently. *Example: Thoughtseize, Hymn to Tourach, Liliana of the Veil, Inquisition of Kozilek.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Discard / Madness</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Cards with Madness or that benefit from being discarded need dedicated discard outlets. Without outlets the cards rot in hand. *Example: Faithless Looting + Fiery Temper + Asylum Visitor.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Mill</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="B" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#aaa",fontWeight:"600"}}>0.0</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Put cards from library into graveyard to fuel graveyard-based payoffs. Requires both mill density and graveyard payoffs. *Example: Traumatize + Mesmeric Orb + Laboratory Maniac.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Enchantments Matter</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="G" size={14} /><ManaIcon c="U" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Cards that reward controlling enchantments or that trigger off enchantments entering play. Requires a dedicated density of enchantments in the cube. *Example: Eidolon of Blossoms + Starfield of Nyx + Sigil of the Empty Throne.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Stax / Prison</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Tax effects and lock pieces that restrict opponents from playing the game normally. Requires a critical mass of lock pieces to be effective. *Example: Smokestack + Tangle Wire + Winter Orb.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Sacrifice</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Requires two distinct halves: payoff cards (benefit from sacrificing) and outlet cards (ways to sacrifice permanents). *Example: Grave Pact (payoff) + Viscera Seer (outlet) + Young Wolf (fodder).*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Reanimator</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="W" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Two-card combo structure: fill the graveyard (enablers) then reanimate a high-CMC threat (payoffs). Without both halves, the engine stalls. *Example: Entomb + Reanimate + Griselbrand.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Artifacts Matter</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Permanents that reward controlling many artifacts. Without artifact density as support, the payoffs are blank. *Example: Shrapnel Blast + Pia and Kiran Nalaar + Cranial Plating.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Blink/ETB</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="U" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Spells and permanents that exile then return creatures to trigger ETB effects. Completely useless without strong ETB targets. *Example: Restoration Angel + Cloudshift + Eternal Witness / Mulldrifter.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Poison</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.12</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Win by giving the opponent 10 poison counters. Creatures with Infect or Toxic deal damage as poison counters rather than regular damage — pump spells make them lethal in one hit. Neither half is useful without the other. *Example: Glistener Elf + Become Immense + Mutagenic Growth + Phyrexian Crusader.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          </tbody></table></div>
          <div style={{height:"6px"}} />
        </div>}
        {refTab === "Utility" && <UtilityRefTable setActiveDesc={setActiveDesc} />}
        {refTab === "Tribal" && <div>
          <h1 style={{fontSize:"20px",fontWeight:"700",color:"#fff",marginBottom:"8px",marginTop:"0"}}>Tribal Archetypes Reference</h1>
          <div style={{height:"6px"}} />
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>Tribal archetypes are built around a shared creature type. Their power comes from <strong style={{color:"#fff"}}>critical mass</strong> — the more creatures of the tribe you control, the stronger the individual pieces become. Unlike main archetypes, tribal decks are inherently synergistic: a single tribal card is usually mediocre; a full tribal package can be dominant.</p>
          <div style={{height:"6px"}} />
          <hr style={{...S.divider,margin:"20px 0"}} />
          <div style={{height:"6px"}} />
          <h2 style={{fontSize:"15px",fontWeight:"700",color:"#d4af37",marginBottom:"8px",marginTop:"28px",borderBottom:"1px solid #222",paddingBottom:"6px"}}>How Tribal Works in a Cube</h2>
          <div style={{height:"6px"}} />
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>Tribal archetypes in a cube require careful design decisions:</p>
          <div style={{height:"6px"}} />
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>- <strong style={{color:"#fff"}}>Density</strong>: A tribe needs enough members to be draftable. Typically 8–12 creatures of the same type per guild or color pair to make the archetype viable.</p>
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>- <strong style={{color:"#fff"}}>Payoffs</strong>: Cards that reward you for controlling many creatures of the tribe (lords, anthems, tribal spells).</p>
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>- <strong style={{color:"#fff"}}>Enablers</strong>: Non-creature cards that reference the tribe (tribal instants, sorceries, enchantments).</p>
          <p style={{color:"#aaa",fontSize:"13px",lineHeight:"1.7",margin:"4px 0"}}>- <strong style={{color:"#fff"}}>Cross-guild support</strong>: Some tribes span multiple guilds and reward drafters who stay on-tribe across color pairs.</p>
          <div style={{height:"6px"}} />
          <hr style={{...S.divider,margin:"20px 0"}} />
          <div style={{height:"6px"}} />
          <h2 style={{fontSize:"15px",fontWeight:"700",color:"#d4af37",marginBottom:"8px",marginTop:"28px",borderBottom:"1px solid #222",paddingBottom:"6px"}}>Tribes</h2>
          <div style={{height:"6px"}} />
          <div style={{overflowX:"auto",marginBottom:"16px"}}><table style={{...S.table,width:"100%",borderCollapse:"collapse"}}><thead><tr>
          <th style={{...S.th,padding:"6px 10px",whiteSpace:"nowrap"}}>Tribe</th>
          <th style={{...S.th,padding:"6px 10px",whiteSpace:"nowrap"}}>Creature Type</th>
          <th style={{...S.th,padding:"6px 10px",whiteSpace:"nowrap"}}>Colors</th>
          <th style={{...S.th,padding:"6px 10px",whiteSpace:"nowrap"}}>Support Ratio</th>
          <th style={{...S.th,padding:"6px 10px",width:"28px"}}></th>
          </tr></thead><tbody>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Angels</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Angel</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Large flying finishers with powerful ETB and static abilities. Reward going tall with big threats. *Example: Serra Angel, Baneslayer Angel, Lyra Dawnbringer.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Beasts</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Beast</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Large aggressive creatures that reward ramp and stompy strategies. Often have trample or enters-the-battlefield value. *Example: Ravenous Baloth, Craterhoof Behemoth, Polukranos.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Birds</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Bird</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="U" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Small evasive creatures with flying that reward going wide in the air. Synergize with Skies/Flying payoffs. *Example: Aven Interrupter, Judge\'s Familiar, Sephara.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Cats</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Cat</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Aggressive creatures with lifelink and combat abilities. Synergize with lifegain payoffs. *Example: Ajani\'s Pridemate, Leonin Warleader, Brimaz.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Clerics</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Cleric</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Value-oriented tribe with lifegain triggers and sacrifice synergies. Rewards building around death and devotion. *Example: Taborax, Orah, Skyclave Hierophant.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Demons</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Demon</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Powerful high-CMC threats with drawbacks that reward build-around strategies. Often synergize with sacrifice. *Example: Griselbrand, Razaketh, Doom Whisperer.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Dragons</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Dragon</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Large flying threats with ETB damage and tribal payoffs. Reward ramp strategies and going tall. *Example: Thunderbreak Regent, Glorybringer, Terror of the Peaks.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Druids</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Druid</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Mana-generating creatures that accelerate into large threats. Reward ramp and lands strategies. *Example: Devoted Druid, Gilt-Leaf Archdruid, Selvala.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Elementals</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Elemental</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="R" size={14} /><ManaIcon c="G" size={14} /><ManaIcon c="U" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Versatile tribe spanning multiple colors with ETB effects and elemental synergies. *Example: Omnath Locus of the Roil, Risen Reef, Cavalier cycle.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Elves</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Elf</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Explosive mana generation and wide board presence. Reward critical mass strategies and Overrun effects. *Example: Llanowar Elves, Elvish Archdruid, Ezuri Renegade Leader.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Faeries</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Faerie</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Flash and flying creatures that reward holding up mana. Synergize with instant-speed play and tempo. *Example: Spellstutter Sprite, Mistbind Clique, Brazen Borrower.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Goblins</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Goblin</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Fast aggressive tribe with sacrifice synergies and explosive combo potential. *Example: Goblin Warchief, Krenko Mob Boss, Goblin Ringleader.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Humans</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Human</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Aggressive tribe with lords and hate bears. Reward going wide and disrupting the opponent. *Example: Champion of the Parish, Thalia Guardian of Thraben, Mayor of Avabruck.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Insects</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Insect</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Aggressive creatures with deathtouch and proliferate synergies. Often synergize with -1/-1 counters. *Example: Hapatra Vizier of Poisons, Hornet Queen, Blex Vexing Pest.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Knights</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Knight</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Aggressive creatures with first strike and vigilance. Reward going wide with cavalry-style strategies. *Example: Knight of the Ebon Legion, Acclaimed Contender, Cavalier of Dawn.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Merfolk</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Merfolk</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Evasive tempo-oriented tribe with lords that buff each other. Reward going wide in blue. *Example: Lord of Atlantis, Master of the Pearl Trident, Merrow Reejerey.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Rogues</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Rogue</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Evasive creatures that reward mill and hand disruption strategies. Trigger off opponents having cards in graveyard. *Example: Thieves Guild Enforcer, Soaring Thought-Thief, Zagras.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Shamans</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Shaman</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="R" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Value-generating creatures tied to spellcasting and land play. Synergize with Spellslinger and Landfall. *Example: Goblin Shaman, Rage Forger, Harmonic Prodigy.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Slivers</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Sliver</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="U" size={14} /><ManaIcon c="B" size={14} /><ManaIcon c="R" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Each Sliver gives all Slivers an ability — exponentially powerful with critical mass. Requires 5-color support. *Example: Crystalline Sliver, Muscle Sliver, Sliver Queen, Sliver Legion.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Soldiers</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Soldier</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Aggressive white tribe with lords and combat tricks. Reward going wide and attacking every turn. *Example: Precinct Captain, Field Marshal, Catapult Master.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Snakes</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Snake</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="G" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Synergistic tribe with deathtouch and -1/-1 counter interactions. *Example: Ophiomancer, Sosuke Son of Seshiro, Seshiro the Anointed.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Spirits</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Spirit</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="W" size={14} /><ManaIcon c="U" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Flash and flying tribe with tempo and graveyard synergies. Reward instant-speed play and sacrifice. *Example: Rattlechains, Supreme Phantom, Skyclave Apparition.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Vampires</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Vampire</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="B" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Aggressive tribe with lifelink and drain synergies. Reward going wide and exploiting lifegain payoffs. *Example: Champion of Dusk, Bloodline Keeper, Drana Liberator of Malakir.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Werewolves</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Werewolf</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="R" size={14} /><ManaIcon c="G" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Transform-based tribe that rewards not casting spells. Require a low spell count strategy to stay transformed. *Example: Huntmaster of the Fells, Tovolar Dire Overlord, Mayor of Avabruck.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Wizards</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Wizard</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="R" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Spellcasting tribe that rewards casting instants and sorceries. Synergize with Spellslinger and Prowess. *Example: Naban Dean of Iteration, Adeliz the Cinder Wind, Docent of Perfection.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          <tr>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><strong style={{color:"#fff"}}>Zombies</strong></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}>Zombie</td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{display:"inline-flex",gap:"2px",alignItems:"center"}}><ManaIcon c="U" size={14} /><ManaIcon c="B" size={14} /></span></td>
          <td style={{...S.td(),padding:"6px 10px",verticalAlign:"top"}}><span style={{color:"#c8a000",fontWeight:"600"}}>0.15</span></td>
          <td style={{...S.td(),padding:"6px 10px",textAlign:"center",verticalAlign:"middle"}}><span onClick={()=>setActiveDesc("Recursive tribe that rewards graveyard strategies and sacrifice. Self-regenerating board presence. *Example: Lord of the Undead, Gravecrawler, Death Baron.*")} style={{cursor:"pointer",color:"#4a90d9",fontWeight:"700",fontSize:"13px",border:"1px solid #333",borderRadius:"50%",width:"18px",height:"18px",display:"inline-flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>?</span></td>
          </tr>
          </tbody></table></div>
          <div style={{height:"6px"}} />
        </div>}
      </div>
    </div>
  );
}


function App() {
  const [active,         setActive]         = useState("Configure");
  const [buildTab,       setBuildTab]       = useState("Cards");
  const [analysisTab,    setAnalysisTab]    = useState("Cube");
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_FILTERS });

  function viewGuildInCards(guildName) {
    setAppliedFilters({ ...EMPTY_FILTERS, guilds: [guildName] });
    setActive("Build");
    setBuildTab("Cards");
  }
  const [db, setDB] = useState(() => createDB("", 360, 30));
  const [cards, setCards] = useState([]);
  const [tagDB, setTagDB] = useState(DEFAULT_TAG_DB);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    async function load() {
      const savedConfig = await Storage.getConfig();
      if (savedConfig) setDB(createDB(savedConfig.name, savedConfig.size, savedConfig.colorless, savedConfig.wildcards || 0, savedConfig.guildCards || undefined));
      const savedCards = await Storage.getCards();
      if (savedCards?.length) {
        const now = Date.now();
        setCards(savedCards.map((c, i) => ({
          ...c,
          added_at: c.added_at || (now - (savedCards.length - 1 - i) * 1000),
        })));
      }
      const savedTagDB = await Storage.getTagDB();
      if (savedTagDB) {
        // Normalize all tag values to lowercase
        setTagDB({
          main_archetypes:   (savedTagDB.main_archetypes   || []).map(t => t.toLowerCase()),
          tribal_archetypes: (savedTagDB.tribal_archetypes || []).map(t => t.toLowerCase()),
          utility:           (savedTagDB.utility           || []).map(t => t.toLowerCase()),
        });
      }
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

  const cardsSaveTimer = useRef(null);

  useEffect(() => {
    if (!storageReady) return;
    if (cardsSaveTimer.current) clearTimeout(cardsSaveTimer.current);
    cardsSaveTimer.current = setTimeout(() => {
      Storage.setCards(cards);
    }, 400);
    return () => clearTimeout(cardsSaveTimer.current);
  }, [cards, storageReady]);

  function addCard(card) {
    setCards(prev => [...prev, card]);
  }

  function updateCard(updated) {
    setCards(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  function bulkUpdateCards(updatedList) {
    setCards(prev => {
      const map = Object.fromEntries(updatedList.map(c => [c.id, c]));
      const next = prev.map(c => map[c.id] || c);
      // Save immediately — bypass debounce to avoid data loss on quick refresh
      if (cardsSaveTimer.current) clearTimeout(cardsSaveTimer.current);
      Storage.setCards(next);
      return next;
    });
  }

  function deleteCard(id) {
    setCards(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div style={{ backgroundColor:"#000", minHeight:"100vh" }}>
    <div style={{ ...S.app, maxWidth:"1024px", margin:"0 auto", minHeight:"100vh", borderLeft:"1px solid #111", borderRight:"1px solid #111" }}>
      <nav style={{...S.nav, justifyContent:"flex-start"}}>
        {NAV_ITEMS.map(item => (
          <div key={item} style={S.navItem(active === item)} onClick={() => setActive(item)}>{item}</div>
        ))}
        <div style={{marginLeft:"auto"}}>
          {NAV_RIGHT.map(item => (
            <div key={item} style={{...S.navItem(active === item), opacity: active===item ? 1 : 0.6}} onClick={() => setActive(item)}>{item}</div>
          ))}
        </div>
      </nav>

      {active === "Build" && (
        <div style={{display:"flex",gap:"1px",borderBottom:"1px solid #222",backgroundColor:"#0d0d0d",paddingLeft:"24px",paddingTop:"12px"}}>
          {["Cards", "Archetypes"].map(tab => (
            <div key={tab} onClick={() => setBuildTab(tab)} style={buildTab===tab
              ? {padding:"8px 20px",cursor:"pointer",fontSize:"13px",color:"#fff",borderBottom:"2px solid #d4af37",fontWeight:"600"}
              : {padding:"8px 20px",cursor:"pointer",fontSize:"13px",color:"#aaa",borderBottom:"2px solid transparent",fontWeight:"400"}}>
              {tab}
            </div>
          ))}
        </div>
      )}

      {active === "Analyze" && (
        <div style={{display:"flex",gap:"1px",borderBottom:"1px solid #222",backgroundColor:"#0d0d0d",paddingLeft:"24px",paddingTop:"12px"}}>
          {["Cube", "Guilds", "Archetypes"].map(tab => (
            <div key={tab} onClick={() => setAnalysisTab(tab)} style={analysisTab===tab
              ? {padding:"8px 20px",cursor:"pointer",fontSize:"13px",color:"#fff",borderBottom:"2px solid #d4af37",fontWeight:"600"}
              : {padding:"8px 20px",cursor:"pointer",fontSize:"13px",color:"#aaa",borderBottom:"2px solid transparent",fontWeight:"400"}}>
              {tab}
            </div>
          ))}
        </div>
      )}

      {active === "Configure" && <HomePage db={db} setDB={setDB} cards={cards} />}
      {active === "Build" && buildTab === "Cards"      && <CardsPage cards={cards} onAddCard={addCard} onUpdateCard={updateCard} onBulkUpdateCards={bulkUpdateCards} onDeleteCard={deleteCard} tagDB={tagDB} setTagDB={setTagDB} db={db} appliedFilters={appliedFilters} setAppliedFilters={setAppliedFilters} />}
      {active === "Build" && buildTab === "Archetypes" && <TagsTuningPage tagDB={tagDB} setTagDB={setTagDB} cards={cards} onUpdateCard={updateCard} />}
      {active === "Analyze" && analysisTab === "Cube"        && <CubeAnalysisPage cards={cards} db={db} tagDB={tagDB} />}
      {active === "Analyze" && analysisTab === "Guilds"      && <div style={S.page}><div style={{ color:"#555", fontSize:"13px" }}>Coming soon.</div></div>}
      {active === "Analyze" && analysisTab === "Archetypes"  && <div style={S.page}><div style={{ color:"#555", fontSize:"13px" }}>Coming soon.</div></div>}
      {active === "Reference" && <ReferencePage />}
    </div>
    </div>
  );
}

