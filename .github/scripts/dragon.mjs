// Generate an animated "dragon eats your contribution graph" SVG.
// Usage:  GITHUB_TOKEN=xxx node dragon.mjs <username> <outDir>
//         node dragon.mjs --mock <outDir>      (random data, for testing)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , userArg, outDir = "dist"] = process.argv;

// ─────────────────────────── config ───────────────────────────
const CELL = 11, GAP = 3, PITCH = CELL + GAP;
const PAD_X = 44, PAD_TOP = 40, PAD_BOTTOM = 30;
const STEP = 0.07;            // seconds per cell the head travels
const SEGMENTS = 24;          // body segments
const SPACING = 0.68;         // distance between segments (in steps)
const LEAD = 6;               // steps entering from the left

const THEMES = {
  dark: {
    file: "dragon-dark.svg",
    bg: "#0a0a0c",
    empty: "#17171c",
    levels: ["#4a1010", "#8a1616", "#d11f1f", "#ff2a2a"],
    body: ["#ff2a2a", "#6e0b0b"],     // head → tail gradient
    belly: "#ffd36b",
    horn: "#f5c400",
    eye: "#f5c400",
    fire: ["#fff3b0", "#f5c400", "#ff2a2a"],
    text: "#8a7d55",
  },
  light: {
    file: "dragon.svg",
    bg: "#ffffff",
    empty: "#ebedf0",
    levels: ["#b8f3ff", "#5fdcf0", "#00a8c6", "#006d82"],
    body: ["#d6007f", "#6a1fd1"],
    belly: "#ffe0f3",
    horn: "#3b2a55",
    eye: "#00a8c6",
    fire: ["#ffe066", "#ff8a00", "#d6007f"],
    text: "#57606a",
  },
};

// ─────────────────────────── data ───────────────────────────
async function fetchWeeks(user) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    totalContributions weeks{contributionDays{weekday contributionLevel contributionCount}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const map = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  const weeks = cal.weeks.map((w) => {
    const col = new Array(7).fill(null);
    for (const d of w.contributionDays) col[d.weekday] = map[d.contributionLevel] ?? 0;
    return col;
  });
  return { weeks, total: cal.totalContributions };
}

function mockWeeks() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const weeks = Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => (w === 52 && d > 3 ? null : rnd() < 0.45 ? 0 : 1 + Math.floor(rnd() * 4)))
  );
  return { weeks, total: 742 };
}

// ─────────────────────────── geometry ───────────────────────────
const cx = (c) => PAD_X + c * PITCH + CELL / 2;
const cy = (r) => PAD_TOP + r * PITCH + CELL / 2;

function buildPath(nCols) {
  // long horizontal passes, U-turning in the side padding
  const pts = [];
  for (let i = LEAD; i >= 1; i--) pts.push({ x: cx(-i - 1), y: cy(0) });
  const cellIndex = {};
  for (let r = 0; r < 7; r++) {
    const ltr = r % 2 === 0;
    const cols = [...Array(nCols).keys()];
    if (!ltr) cols.reverse();
    for (const c of cols) { cellIndex[`${c},${r}`] = pts.length; pts.push({ x: cx(c), y: cy(r) }); }
    if (r < 6) { // U-turn outside the grid
      const ex = ltr ? cx(nCols - 1) + PITCH * 1.4 : cx(0) - PITCH * 1.4;
      pts.push({ x: ex, y: cy(r) + PITCH * 0.15 });
      pts.push({ x: ex, y: cy(r) + PITCH * 0.85 });
    }
  }
  const tailLen = Math.ceil(SEGMENTS * SPACING) + 8;
  for (let i = 1; i <= tailLen; i++) pts.push({ x: cx(nCols - 1 + i), y: cy(6) });
  // angles (unwrapped so rotations never spin the long way round)
  let prev = 0;
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    const a = (Math.atan2(q.y - o.y, q.x - o.x) * 180) / Math.PI;
    let d = a - prev; while (d > 180) d -= 360; while (d < -180) d += 360;
    p.a = i === 0 ? a : prev + d; prev = p.a;
  });
  return { pts, cellIndex };
}

const f = (n) => +n.toFixed(2);

// ─────────────────────────── drawing ───────────────────────────
function headSVG(t) {
  // drawn facing +x, centred on (0,0)
  return `
  <g class="fire"><path d="M9 0 Q15 -5 23 -2 Q19 0 23 2 Q15 5 9 0Z" fill="url(#fireG)"/></g>
  <path d="M-7 -3 L-14 -11 L-9 -4Z" fill="${t.horn}"/>
  <path d="M-4 -4 L-8 -13 L-2 -5Z" fill="${t.horn}"/>
  <path d="M-8 -6 Q2 -9 9 -3 L11 0 L9 3 Q2 8 -8 6 Q-11 0 -8 -6Z" fill="${t.body[0]}"/>
  <path d="M-4 3 Q3 5 9 2 L10 3 Q3 7 -5 5Z" fill="${t.belly}" opacity=".9"/>
  <circle cx="2" cy="-3" r="2.1" fill="${t.eye}"/>
  <circle cx="2.6" cy="-3.2" r=".8" fill="#000"/>
  <circle cx="8" cy="-1.2" r=".6" fill="#000" opacity=".6"/>
  <path d="M6 2 Q0 9 -9 12" stroke="${t.horn}" stroke-width=".8" fill="none" opacity=".8"/>
  <path d="M6 -2 Q0 -9 -6 -15" stroke="${t.horn}" stroke-width=".8" fill="none" opacity=".5"/>`;
}

function segmentSVG(k, t) {
  const u = k / (SEGMENTS - 1);
  const r = f(7.2 - 4.6 * u);
  const fill = `url(#bodyG${k})`;
  if (k === SEGMENTS - 1) // tail fin
    return `<path d="M3 0 L-9 -8 L-4 0 L-9 8Z" fill="${t.body[1]}"/>`;
  let s = `<circle r="${r}" fill="${fill}"/>`;
  if (k % 2 === 0) s += `<path d="M${-r * 0.6} ${-r * 0.7} L${-r * 0.1} ${-r - 3.5} L${r * 0.5} ${-r * 0.75}Z" fill="${t.horn}" opacity=".85"/>`;
  if (k === 3 || k === 10) // little legs with claws
    s += `<path d="M0 ${r} L-3 ${r + 4} M0 ${r} L1 ${r + 4.5} M0 ${-r} L-3 ${-r - 4}" stroke="${t.body[1]}" stroke-width="1.6" stroke-linecap="round"/>`;
  s += `<circle r="${f(r * 0.45)}" cy="${f(r * 0.25)}" fill="${t.belly}" opacity=".35"/>`;
  return s;
}

function render({ weeks, total }, t) {
  const nCols = weeks.length;
  const W = PAD_X * 2 + nCols * PITCH - GAP;
  const H = PAD_TOP + 7 * PITCH - GAP + PAD_BOTTOM;
  const { pts, cellIndex } = buildPath(nCols);
  const T = f(pts.length * STEP);
  const pct = (i) => f((i / (pts.length - 1)) * 100);

  // movement keyframes shared by head + every body segment
  const move = pts.map((p, i) => `${pct(i)}%{transform:translate(${f(p.x)}px,${f(p.y)}px) rotate(${f(p.a)}deg)}`).join("");

  let css = `
  @keyframes mv{${move}}
  .m{animation:mv ${T}s linear infinite;}
  .fire{animation:fl .5s ease-in-out infinite alternate;transform-origin:9px 0}
  @keyframes fl{from{opacity:.15;transform:scale(.5)}to{opacity:1;transform:scale(1.1)}}`;

  // cells
  let cells = "";
  let n = 0;
  weeks.forEach((col, c) =>
    col.forEach((lvl, r) => {
      if (lvl === null) return;
      const x = PAD_X + c * PITCH, y = PAD_TOP + r * PITCH;
      if (lvl === 0) { cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${t.empty}"/>`; return; }
      const p = pct(cellIndex[`${c},${r}`]);
      const id = `c${n++}`;
      const col1 = t.levels[lvl - 1];
      css += `@keyframes ${id}{0%,${p}%{fill:${col1}}${f(p + 0.3)}%,99.6%{fill:${t.empty}}100%{fill:${col1}}}.${id}{animation:${id} ${T}s linear infinite}`;
      cells += `<rect class="${id}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${col1}"/>`;
    })
  );

  // gradients for body segments
  let defs = `<linearGradient id="fireG" x1="0" x2="1"><stop offset="0" stop-color="${t.fire[0]}"/><stop offset=".5" stop-color="${t.fire[1]}"/><stop offset="1" stop-color="${t.fire[2]}" stop-opacity="0"/></linearGradient>`;
  const mix = (a, b, u) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - u) + parseInt(b.slice(i, i + 2), 16) * u).toString(16).padStart(2, "0")).join("");
  for (let k = 0; k < SEGMENTS; k++) {
    const c = mix(t.body[0], t.body[1], k / (SEGMENTS - 1));
    defs += `<radialGradient id="bodyG${k}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="${mix(c, "#ffffff", 0.35)}"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
  }

  // body (drawn tail-first so the head sits on top)
  let dragon = "";
  for (let k = SEGMENTS - 1; k >= 0; k--) {
    const delay = f((k + 1) * SPACING * STEP - T);
    dragon += `<g class="m" style="animation-delay:${delay}s">${segmentSVG(k, t)}</g>`;
  }
  dragon += `<g class="m" style="animation-delay:-${T}s"><g transform="scale(1.45)">${headSVG(t)}</g></g>`;

  const label = `<text x="${PAD_X}" y="20" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="12" fill="${t.text}">&gt; dragon.exe --eat contributions   // ${total} contributions in the last year</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${defs}</defs>
<style>${css}</style>
<rect width="100%" height="100%" rx="8" fill="${t.bg}"/>
${label}
${cells}
${dragon}
</svg>`;
}

// ─────────────────────────── main ──────────────────────────
const data = userArg === "--mock" ? mockWeeks() : await fetchWeeks(userArg);
mkdirSync(outDir, { recursive: true });
for (const t of Object.values(THEMES)) {
  writeFileSync(join(outDir, t.file), render(data, t));
  console.log("wrote", join(outDir, t.file));
}
