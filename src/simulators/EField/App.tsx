'use client'

import { useEffect, useRef, useState } from 'react';

// ======= Equipotenciais (grade de tela + marching squares) =======
type EquipGrid = {
  nx: number; ny: number; x0: number; y0: number; dx: number; dy: number;
  phi: Float32Array;
};

function buildEquipGrid(
  W: number, H: number,
  s2w: (sx: number, sy: number) => { x: number; y: number },
  charges: Charge[], plates: Plate[], conds: CondMesh[],
  stepPx = 8,
  maskMetalAsNaN = true,
  maskZeroCavityAsNaN = true,
): EquipGrid {
  const nx = Math.max(16, Math.floor(W / stepPx) + 1);
  const ny = Math.max(12, Math.floor(H / stepPx) + 1);
  const x0 = 0, y0 = 0;
  const dx = (W - x0) / (nx - 1);
  const dy = (H - y0) / (ny - 1);

  const phi = new Float32Array(nx * ny);

  let idx = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++, idx++) {
      const sx = x0 + i * dx, sy = y0 + j * dy;
      const { x, y } = s2w(sx, sy);

      // mascara: metal
      if (maskMetalAsNaN && insideConductorMetal(x, y, conds)) {
        phi[idx] = Number.NaN; continue;
      }
      // mascara: cavidade com Qin≈0 (potencial constante -> não desenhar linhas)
      if (maskZeroCavityAsNaN) {
        let inZero = false;
        for (const m of conds) {
          const d = Math.hypot(x - m.cx, y - m.cy);
          if (d < m.Ri && Math.abs(m.Qin) < 1e-9) { inZero = true; break; }
        }
        if (inZero) { phi[idx] = Number.NaN; continue; }
      }
      
      // Filtro adicional: muito próximo da superfície do condutor (evita oscilações)
      let tooCloseToSurface = false;
      for (const m of conds) {
        const d = Math.hypot(x - m.cx, y - m.cy);
        const distOuter = Math.abs(d - m.Ro);
        const distInner = Math.abs(d - m.Ri);
        if (Math.min(distOuter, distInner) < 0.05) { // Muito próximo de qualquer superfície
          tooCloseToSurface = true;
          break;
        }
      }
      if (tooCloseToSurface) { phi[idx] = Number.NaN; continue; }

      phi[idx] = potentialTotalAtPoint(x, y, charges, plates, conds);
    }
  }
  return { nx, ny, x0, y0, dx, dy, phi };
}

function equipLevelsFromGrid(phi: Float32Array, perSide = 7): number[] {
  let maxAbs = 0;
  for (let i = 0; i < phi.length; i++) {
    const p = phi[i];
    if (!Number.isNaN(p)) {
      const a = Math.abs(p);
      if (a > maxAbs) maxAbs = a;
    }
  }
  maxAbs = Math.max(maxAbs, 1e-3);
  const base = maxAbs / Math.pow(2, perSide); // começa baixo e dobra
  const levels: number[] = [];
  for (let k = 0; k < perSide; k++) levels.push(-base * Math.pow(2, k));
  for (let k = 0; k < perSide; k++) levels.push(+base * Math.pow(2, k));
  return levels;
}

function marchingSquaresEquip(
  grid: EquipGrid, levels: number[]
): Array<[number, number, number, number, number]> { // Adicionado level no retorno
  const { nx, ny, x0, y0, dx, dy, phi } = grid;
  const v = (i: number, j: number) => phi[j * nx + i];

  const edgesList = [
    [], [3, 0], [0, 1], [3, 1],
    [1, 2], [3, 2, 1, 0], [0, 2], [3, 2],
    [2, 3], [0, 2], [1, 0, 2, 3], [1, 2],
    [1, 3], [0, 1], [3, 0], []
  ] as number[][];

  const segs: Array<[number, number, number, number, number]> = []; // Incluir level

  for (const L of levels) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const p00 = v(i, j), p10 = v(i + 1, j);
        const p01 = v(i, j + 1), p11 = v(i + 1, j + 1);

        // se qualquer canto é NaN, pula a célula
        if (Number.isNaN(p00) || Number.isNaN(p10) || Number.isNaN(p01) || Number.isNaN(p11)) continue;

        const c0 = p00 > L ? 1 : 0;
        const c1 = p10 > L ? 1 : 0;
        const c2 = p11 > L ? 1 : 0;
        const c3 = p01 > L ? 1 : 0;
        const caseId = (c0 << 0) | (c1 << 1) | (c2 << 2) | (c3 << 3);
        if (caseId === 0 || caseId === 15) continue;

        const sx = x0 + i * dx, sy = y0 + j * dy;
        const ix = (a: number, b: number) => {
          const den = (b - a) || 1e-12;
          let t = (L - a) / den;
          if (t < 0) t = 0; if (t > 1) t = 1;
          return t;
        };
        const P = (edge: number) => {
          switch (edge) {
            case 0: { const t = ix(p00, p10); return { x: sx + t * dx, y: sy }; }
            case 1: { const t = ix(p10, p11); return { x: sx + dx, y: sy + t * dy }; }
            case 2: { const t = ix(p11, p01); return { x: sx + (1 - t) * dx, y: sy + dy }; }
            case 3: { const t = ix(p01, p00); return { x: sx, y: sy + (1 - t) * dy }; }
            default: return { x: sx, y: sy };
          }
        };

        const edges = edgesList[caseId];
        for (let k = 0; k < edges.length; k += 2) {
          const a = P(edges[k]), b = P(edges[k + 1]);
          segs.push([a.x, a.y, b.x, b.y, L]); // em coordenadas de TELA + level
        }
      }
    }
  }
  return segs;
}


// ======= Tema/Cores =======
const THEME = {
  bg: "#0b0f14",
  grid: "rgba(120,170,220,0.12)",
  axis: "rgba(220,235,255,0.8)",
  arrow: "#ffb357",
  arrowIndivid: ["#6ee7ff", "#c084fc", "#f472b6", "#34d399", "#facc15"],
  // cores fortes para +/-
  chargePlus: "#ff3b3b",
  chargeMinus: "#3d9cff",
  platePlus: "#ff8a8a",
  plateMinus: "#7fb6ff",
  line: "#c7d2fe",
  // cinza do condutor mais fraco p/ contraste
  conductor: "rgba(155,155,155,0.75)"
};

// Paleta do mapa de potencial (vermelho claro / azul claro)
const POT_POS_RGB = [255, 100, 100]; // positivo: vermelho mais intenso
const POT_NEG_RGB = [100, 150, 255]; // negativo: azul mais intenso

// Função para calcular cor da equipotencial com variação de tom conforme afastamento
function getEquipotentialColor(level: number, maxLevel: number): string {
  const absLevel = Math.abs(level);
  const absMaxLevel = Math.abs(maxLevel);
  const intensity = Math.min(1, absLevel / (absMaxLevel || 1));
  
  if (level === 0 || absLevel < 1e-9) {
    // Potencial neutro: cinza transparente
    return `rgba(128, 128, 128, 0.3)`;
  } else if (level > 0) {
    // Potencial positivo: Variação do vermelho (perto da carga) ao rosa claro (longe)
    const alpha = 0.6 + 0.4 * intensity; // 0.6 a 1.0
    
    // Transição suave: Vermelho intenso → Vermelho médio → Rosa → Rosa claro
    const red = Math.floor(255 - 80 * (1 - intensity)); // 175 a 255
    const green = Math.floor(60 * (1 - intensity));     // 60 a 0 (menos verde perto da carga)
    const blue = Math.floor(120 * (1 - intensity));     // 120 a 0 (menos azul perto da carga)
    
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  } else {
    // Potencial negativo: Variação do azul claro (perto da carga) ao azul céu (longe)
    const alpha = 0.6 + 0.4 * intensity; // 0.6 a 1.0
    
    // Transição suave: Azul claro → Azul médio → Azul céu → Ciano claro
    const red = Math.floor(100 * (1 - intensity));      // 100 a 0 (menos vermelho perto da carga)
    const green = Math.floor(150 + 105 * (1 - intensity)); // 255 a 150 (mais verde longe da carga)
    const blue = Math.floor(200 + 55 * intensity);      // 200 a 255 (sempre azul, mais intenso perto)
    
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
}

// ======= Tipos =======
type Charge = { id: number; q: number; x: number; y: number };
type Plate = { id: number; sign: 1 | -1; x: number; y: number; theta: number; halfH: number; lambda: number };
type Conductor = { id: number; x: number; y: number; R: number; thick: number };
type Probe = { id: number; sign: 1 | -1; x: number; y: number };

type GhostState =
  | { active: false }
  | { active: true; kind: "charge"; sign: 1 | -1; sx: number; sy: number }
  | { active: true; kind: "plate"; sign: 1 | -1; sx: number; sy: number; theta: number; halfH: number }
  | { active: true; kind: "cond"; sx: number; sy: number; R: number }
  | { active: true; kind: "probe"; sign: 1 | -1; sx: number; sy: number };

// ======= Utils de transformação =======
function worldToScreen(W: number, H: number, px: number, center: { x: number; y: number }) {
  const cx = W / 2 - center.x * px;
  const cy = H / 2 + center.y * px;
  return (x: number, y: number) => ({ x: cx + x * px, y: cy - y * px });
}
function screenToWorld(W: number, H: number, px: number, center: { x: number; y: number }) {
  const cx = W / 2 - center.x * px;
  const cy = H / 2 + center.y * px;
  return (sx: number, sy: number) => ({ x: (sx - cx) / px, y: (cy - sy) / px });
}

// Pinta só o fundo
function fillBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Desenha só as linhas da grade + eixos (sem preencher o fundo)
function drawGridLinesAxes(
  ctx: CanvasRenderingContext2D,
  W: number, H: number, px: number,
  center: { x: number; y: number }
) {
  ctx.save();

  const w2s = worldToScreen(W, H, px, center);
  const left = -W / (2 * px) + center.x, right = W / (2 * px) + center.x;
  const bottom = -H / (2 * px) + center.y, top = H / (2 * px) + center.y;

  // linhas da grade
  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(left); x <= Math.ceil(right); x++) {
    const a = w2s(x, bottom), b = w2s(x, top);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  for (let y = Math.floor(bottom); y <= Math.ceil(top); y++) {
    const a = w2s(left, y), b = w2s(right, y);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // eixos fixos
  ctx.strokeStyle = THEME.axis;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
  ctx.stroke();

  ctx.restore();
}

// ======= Flecha escalável (haste + ponta) =======
function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  thickness: number,
  headLen: number
) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-4) return;

  const ux = dx / L,
    uy = dy / L;
  const baseX = to.x - ux * headLen,
    baseY = to.y - uy * headLen;

  const nx = -uy,
    ny = ux;
  const half = headLen * 0.5;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = thickness;

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(baseX + nx * half, baseY + ny * half);
  ctx.lineTo(baseX - nx * half, baseY - ny * half);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ======= Ícones =======
function drawChargeIcon(ctx: CanvasRenderingContext2D, size: number, sign: 1 | -1) {
  const R = size * 0.38;
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const base = sign > 0 ? THEME.chargePlus : THEME.chargeMinus;
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.2, R * 0.22);
  ctx.beginPath(); ctx.moveTo(cx - R * 0.45, cy); ctx.lineTo(cx + R * 0.45, cy); ctx.stroke();
  if (sign > 0) { ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.45); ctx.lineTo(cx, cy + R * 0.45); ctx.stroke(); }
}
function drawProbeIcon(ctx: CanvasRenderingContext2D, size: number, sign: 1 | -1) {
  const R = size * 0.34;
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  ctx.fillStyle = sign > 0 ? THEME.chargePlus : THEME.chargeMinus;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
}
function drawPlateIcon(ctx: CanvasRenderingContext2D, size: number, sign: 1 | -1) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const w = size * 0.26;
  const h = size * 0.80;
  ctx.fillStyle = sign > 0 ? THEME.platePlus : THEME.plateMinus;
  const x0 = cx - w / 2, y0 = cy - h / 2;
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, size * 0.02);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const yy = y0 + (i + 0.5) * (h / n);
    const r = w * 0.28;
    ctx.beginPath(); ctx.moveTo(cx - r, yy); ctx.lineTo(cx + r, yy); ctx.stroke();
    if (sign > 0) { ctx.beginPath(); ctx.moveTo(cx, yy - r); ctx.lineTo(cx, yy + r); ctx.stroke(); }
  }
}
function drawConductorIcon(ctx: CanvasRenderingContext2D, size: number) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const R = size * 0.33, t = size * 0.12;
  ctx.strokeStyle = THEME.conductor; ctx.lineWidth = t; ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
}

function GhostCharge({ sign, size = 48 }: { sign: 1 | -1; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr; c.style.width = `${size}px`; c.style.height = `${size}px`;
    const ctx = c.getContext("2d"); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChargeIcon(ctx, size, sign);
  }, [sign, size]);
  return <canvas ref={ref} className="block" />;
}
function GhostProbe({ sign, size = 40 }: { sign: 1 | -1; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr; c.style.width = `${size}px`; c.style.height = `${size}px`;
    const ctx = c.getContext("2d"); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawProbeIcon(ctx, size, sign);
  }, [sign, size]);
  return <canvas ref={ref} className="block" />;
}
function GhostPlate({ sign, size = 64 }: { sign: 1 | -1; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr; c.style.width = `${size}px`; c.style.height = `${size}px`;
    const ctx = c.getContext("2d"); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlateIcon(ctx, size, sign);
  }, [sign, size]);
  return <canvas ref={ref} className="block" />;
}
function GhostConductor({ size = 56 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr; c.style.width = `${size}px`; c.style.height = `${size}px`;
    const ctx = c.getContext("2d"); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawConductorIcon(ctx, size);
  }, [size]);
  return <canvas ref={ref} className="block" />;
}

function ChargeButton(
  { sign, onPointerDown, onPointerUp }:
    { sign: 1 | -1; onPointerDown: () => void; onPointerUp: () => void }
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; const S = 48;
    c.width = S * dpr; c.height = S * dpr; c.style.width = `${S}px`; c.style.height = `${S}px`;
    const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChargeIcon(ctx, S, sign);
  }, [sign]);
  return (
    <button onMouseDown={onPointerDown} onMouseUp={onPointerUp}
      className="p-1 rounded-xl bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]"
      style={{ width: 56, height: 56 }}>
      <canvas ref={ref} className="block" />
    </button>
  );
}
function ProbeButton(
  { sign, onPointerDown, onPointerUp }:
    { sign: 1 | -1; onPointerDown: () => void; onPointerUp: () => void }
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; const S = 40;
    c.width = S * dpr; c.height = S * dpr; c.style.width = `${S}px`; c.style.height = `${S}px`;
    const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawProbeIcon(ctx, S, sign);
  }, [sign]);
  return (
    <button onMouseDown={onPointerDown} onMouseUp={onPointerUp}
      className="p-1 rounded-xl bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]"
      style={{ width: 48, height: 48 }}>
      <canvas ref={ref} className="block" />
    </button>
  );
}
function PlateButton(
  { sign, onPointerDown, onPointerUp }:
    { sign: 1 | -1; onPointerDown: () => void; onPointerUp: () => void }
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; const S = 56;
    c.width = S * dpr; c.height = S * dpr; c.style.width = `${S}px`; c.style.height = `${S}px`;
    const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlateIcon(ctx, S, sign);
  }, [sign]);
  return (
    <button onMouseDown={onPointerDown} onMouseUp={onPointerUp}
      className="p-1 rounded-xl bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]"
      style={{ width: 64, height: 64 }}>
      <canvas ref={ref} className="block" />
    </button>
  );
}
function ConductorButton({ onPointerDown, onPointerUp }: { onPointerDown: () => void; onPointerUp: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const dpr = window.devicePixelRatio || 1; const S = 56;
    c.width = S * dpr; c.height = S * dpr; c.style.width = `${S}px`; c.style.height = `${S}px`;
    const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawConductorIcon(ctx, S);
  }, []);
  return (
    <button onMouseDown={onPointerDown} onMouseUp={onPointerUp}
      className="p-1 rounded-xl bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]"
      style={{ width: 64, height: 64 }}>
      <canvas ref={ref} className="block" />
    </button>
  );
}

// ======= Campo elétrico =======
// --------- Tipos da malha do condutor ----------
type CondNode = { x: number; y: number; nx: number; ny: number; q: number };
type CondMesh = {
  id: number; cx: number; cy: number; Ro: number; Ri: number; Qin: number;
  outer: CondNode[]; inner: CondNode[];
};

// ------- Potencial externo (para BEM simples) -------
function potentialFromSources(x: number, y: number, charges: Charge[], plates: Plate[]) {
  let phi = 0;
  // Cargas pontuais
  for (const c of charges) {
    const r = Math.hypot(x - c.x, y - c.y);
    const soft = 0.06; phi += c.q / Math.max(soft, r);
  }
  // Placas (modelo original - integração ao longo da linha)
  for (const p of plates) {
    const n = Math.max(16, Math.round(p.halfH * 80));
    const ds = (2 * p.halfH) / n;
    const ux = Math.cos(p.theta), uy = Math.sin(p.theta);
    for (let i = 0; i <= n; i++) {
      const s = -p.halfH + i * ds;
      const px = p.x + ux * s, py = p.y + uy * s;
      const r = Math.hypot(x - px, y - py);
      const soft = 0.06; const dq = p.sign * p.lambda * ds; phi += dq / Math.max(soft, r);
    }
  }
  return phi;
}

// ------- Potencial total (inclui induzidas) -------
function potentialTotalAtPoint(x: number, y: number, charges: Charge[], plates: Plate[], conds: CondMesh[]) {
  let phi = potentialFromSources(x, y, charges, plates);
  const soft = 0.06;
  for (const m of conds) {
    for (const nd of m.outer) {
      const r = Math.hypot(x - nd.x, y - nd.y);
      phi += nd.q / Math.max(soft, r);
    }
    for (const nd of m.inner) {
      const r = Math.hypot(x - nd.x, y - nd.y);
      phi += nd.q / Math.max(soft, r);
    }
  }
  return phi;
}

// ------- Solver linear simples (Gauss) -------
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length; const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    if (Math.abs(M[piv][i]) < 1e-12) continue;
    if (piv !== i) { const tmp = M[i]; M[i] = M[piv]; M[piv] = tmp; }
    const div = M[i][i]; for (let c = i; c <= n; c++) M[i][c] /= div;
    for (let r = 0; r < n; r++) if (r !== i) {
      const f = M[r][i]; if (Math.abs(f) < 1e-16) continue;
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map(row => row[n]);
}
// ------- Mínimos quadrados (para sistemas superconstrangidos) -------
function solveLeastSquares(Arows: number[][], b: number[]): number[] {
  if (Arows.length === 0) return [];
  const m = Arows.length; const n = Arows[0].length;
  const MtM: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const Mtb: number[] = Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    const row = Arows[i]; const bi = b[i];
    for (let j = 0; j < n; j++) {
      Mtb[j] += row[j] * bi;
      const rj = row[j];
      for (let k = 0; k < n; k++) MtM[j][k] += rj * row[k];
    }
  }
  return solveLinear(MtM, Mtb);
}

// ------- Malha/indução no condutor -------
function buildConductorMesh(c: Conductor, charges: Charge[], plates: Plate[]): CondMesh {
  const Ro = c.R;
  const Ri = Math.max(0.15, c.R - Math.max(0.1, c.thick));

  // cargas livres dentro da cavidade
  let Qin = 0;
  for (const ch of charges) if (Math.hypot(ch.x - c.x, ch.y - c.y) < Ri - 1e-6) Qin += ch.q;

  const Mo = Math.max(32, Math.round(Ro * 24));
  const Mi = Math.max(32, Math.round(Ri * 24));
  const outer: CondNode[] = new Array(Mo);
  const inner: CondNode[] = new Array(Mi);
  for (let k = 0; k < Mo; k++) {
    const th = (2 * Math.PI * k) / Mo, nx = Math.cos(th), ny = Math.sin(th);
    outer[k] = { x: c.x + Ro * nx, y: c.y + Ro * ny, nx, ny, q: 0 };
  }
  for (let k = 0; k < Mi; k++) {
    const th = (2 * Math.PI * k) / Mi, nx = Math.cos(th), ny = Math.sin(th);
    inner[k] = { x: c.x + Ri * nx, y: c.y + Ri * ny, nx: -nx, ny: -ny, q: 0 };
  }

  // unknowns: q(outer+inner) + Vc
  const N = Mo + Mi;
  const nodes = [...outer, ...inner];
  const Arows: number[][] = [];
  const b: number[] = [];
  const soft = 0.04;

  // Equipotencial: sum_j (q_j/rij) - Vc = -phi_ext(i)
  for (let i = 0; i < N; i++) {
    const row = new Array(N + 1).fill(0);
    for (let j = 0; j < N; j++) {
      const dij = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      row[j] = 1 / Math.max(soft, dij);
    }
    row[N] = -1; // -Vc
    Arows.push(row);
    b.push(-potentialFromSources(nodes[i].x, nodes[i].y, charges, plates));
  }

  // Σ q_inner = -Qin
  {
    const row = new Array(N + 1).fill(0);
    for (let j = 0; j < N; j++) if (j >= Mo) row[j] = 1;
    Arows.push(row); b.push(-Qin);
  }
  // Σ q_outer = +Qin  (condutor neutro)
  {
    const row = new Array(N + 1).fill(0);
    for (let j = 0; j < N; j++) if (j < Mo) row[j] = 1;
    Arows.push(row); b.push(+Qin);
  }

  const xsol = solveLeastSquares(Arows, b);
  for (let j = 0; j < Mo; j++) outer[j].q = xsol[j] || 0;
  for (let j = 0; j < Mi; j++) inner[j].q = xsol[Mo + j] || 0;

  // correção numérica fina para fechar exatamente as somas
  const sumIn = inner.reduce((s, nd) => s + nd.q, 0);
  const sumOut = outer.reduce((s, nd) => s + nd.q, 0);
  const corrIn = (-Qin - sumIn) / Math.max(1, Mi);
  const corrOut = (+Qin - sumOut) / Math.max(1, Mo);
  for (let j = 0; j < Mi; j++) inner[j].q += corrIn;
  for (let j = 0; j < Mo; j++) outer[j].q += corrOut;

  return { id: c.id, cx: c.x, cy: c.y, Ro, Ri, Qin, outer, inner };
}

// ======= Campos individuais (sem bloqueio interno para renderização) =======
function fieldFromCharges(x: number, y: number, charges: Charge[]) {
  const eps = 0.12;
  let Ex = 0, Ey = 0;

  for (const c of charges) {
    const rx = x - c.x, ry = y - c.y;
    const r2 = rx * rx + ry * ry; 
    const r = Math.sqrt(r2);
    if (r < eps) continue;
    const inv = 1 / (r2 * r);
    Ex += c.q * rx * inv;
    Ey += c.q * ry * inv;
  }

  return { Ex, Ey };
}

function fieldFromPlates(x: number, y: number, plates: Plate[]) {
  let Ex = 0, Ey = 0;

  for (const p of plates) {
    const ux = Math.cos(p.theta), uy = Math.sin(p.theta);
    const nx = -uy, ny = ux;
    
    const dx = x - p.x, dy = y - p.y;
    const alongPlate = dx * ux + dy * uy;
    const perpToPlate = dx * nx + dy * ny;
    
    const plateLength = 2 * p.halfH;
    const sigma = p.sign * p.lambda;
    
    const uniformRegion = plateLength * 0.8;
    const isInUniformRegion = Math.abs(alongPlate) <= uniformRegion / 2;
    
    let Ex_plate = 0, Ey_plate = 0;
    
    if (isInUniformRegion && Math.abs(perpToPlate) < 4.0) {
      const E_magnitude = Math.abs(sigma) / 2.0;
      const direction = perpToPlate >= 0 ? 1 : -1;
      const fieldDirection = p.sign > 0 ? direction : -direction;
      
      Ex_plate = E_magnitude * fieldDirection * nx;
      Ey_plate = E_magnitude * fieldDirection * ny;
    } else {
      const n = Math.max(12, Math.round(plateLength * 25));
      const ds = plateLength / n;
      
      for (let i = 0; i < n; i++) {
        const s = -p.halfH + (i + 0.5) * ds;
        const px = p.x + ux * s, py = p.y + uy * s;
        const rx = x - px, ry = y - py;
        const r2 = rx * rx + ry * ry;
        const r = Math.sqrt(r2);
        
        if (r < 0.05) continue;
        
        const dq = sigma * ds;
        const inv = dq / (r2 * r);
        Ex_plate += rx * inv;
        Ey_plate += ry * inv;
      }
    }
    
    Ex += Ex_plate;
    Ey += Ey_plate;
  }

  return { Ex, Ey };
}

// ======= Campo das cargas induzidas (forçado a cancelar campos externos) =======
function fieldFromInducedCharges(x: number, y: number, cond: CondMesh, charges: Charge[], plates: Plate[]) {
  // Verificar se o ponto está dentro do condutor
  const d = Math.hypot(x - cond.cx, y - cond.cy);
  const isInsideConductor = (d >= cond.Ri && d <= cond.Ro) || (d < cond.Ri && Math.abs(cond.Qin) < 1e-9);
  
  if (isInsideConductor) {
    // DENTRO DO CONDUTOR: Campo induzido = oposto da soma dos campos externos
    const extCharges = fieldFromCharges(x, y, charges);
    const extPlates = fieldFromPlates(x, y, plates);
    
    // Retornar exatamente o oposto para cancelar
    return {
      Ex: -(extCharges.Ex + extPlates.Ex),
      Ey: -(extCharges.Ey + extPlates.Ey)
    };
  } else {
    // FORA DO CONDUTOR: Usar cálculo normal das cargas induzidas
    let Ex = 0, Ey = 0;
    const soft = 0.06;
    
    // cargas induzidas na superfície externa
    for (const nd of cond.outer) {
      const rx = x - nd.x, ry = y - nd.y;
      const r2 = rx * rx + ry * ry;
      const r = Math.sqrt(r2);
      if (r < soft) continue;
      const inv = 1 / (r2 * r);
      Ex += nd.q * rx * inv;
      Ey += nd.q * ry * inv;
    }
    
    // cargas induzidas na superfície interna
    for (const nd of cond.inner) {
      const rx = x - nd.x, ry = y - nd.y;
      const r2 = rx * rx + ry * ry;
      const r = Math.sqrt(r2);
      if (r < soft) continue;
      const inv = 1 / (r2 * r);
      Ex += nd.q * rx * inv;
      Ey += nd.q * ry * inv;
    }
    
    return { Ex, Ey };
  }
}

// ======= Campo total =======
function fieldAtPoint(x: number, y: number, charges: Charge[], plates: Plate[], conds: CondMesh[]) {
  // Função simplificada - verificação global feita na renderização
  // Mantém apenas para compatibilidade com outras partes do código

  const eps = 0.12;
  let Ex = 0, Ey = 0;

  // ponto-cargas
  for (const c of charges) {
    const rx = x - c.x, ry = y - c.y;
    const r2 = rx * rx + ry * ry; const r = Math.sqrt(r2);
    if (r < eps) continue;
    const inv = 1 / (r2 * r);
    Ex += c.q * rx * inv;
    Ey += c.q * ry * inv;
  }

  // placas - modelo híbrido: uniforme no centro + efeitos de borda
  for (const p of plates) {
    const ux = Math.cos(p.theta), uy = Math.sin(p.theta);
    const nx = -uy, ny = ux; // vetor normal à placa (perpendicular)
    
    // Coordenadas locais em relação à placa
    const dx = x - p.x, dy = y - p.y;
    const alongPlate = dx * ux + dy * uy;  // coordenada ao longo da placa
    const perpToPlate = dx * nx + dy * ny; // coordenada perpendicular à placa
    
    // Parâmetros da placa
    const plateLength = 2 * p.halfH;
    const sigma = p.sign * p.lambda; // densidade superficial equivalente
    
    // Região central com campo uniforme (80% do comprimento da placa)
    const uniformRegion = plateLength * 0.8;
    const isInUniformRegion = Math.abs(alongPlate) <= uniformRegion / 2;
    
    let Ex_plate = 0, Ey_plate = 0;
    
    if (isInUniformRegion && Math.abs(perpToPlate) < 4.0) {
      // REGIÃO CENTRAL: Campo uniforme perpendicular à placa
      // Para placa carregada: E = σ/(2ε₀) sempre na direção da normal
      // Positiva: campo para FORA (ambos os lados)
      // Negativa: campo para DENTRO (ambos os lados)
      const E_magnitude = Math.abs(sigma) / 2.0;
      const direction = perpToPlate >= 0 ? 1 : -1; // lado da placa
      const fieldDirection = p.sign > 0 ? direction : -direction; // sempre para fora se + ou para dentro se -
      
      Ex_plate = E_magnitude * fieldDirection * nx;
      Ey_plate = E_magnitude * fieldDirection * ny;
    } else {
      // REGIÃO DE BORDA: Integração numérica (modelo de linha de cargas)
      const n = Math.max(12, Math.round(plateLength * 25));
      const ds = plateLength / n;
      
      for (let i = 0; i < n; i++) {
        const s = -p.halfH + (i + 0.5) * ds;
        const px = p.x + ux * s, py = p.y + uy * s;
        const rx = x - px, ry = y - py;
        const r2 = rx * rx + ry * ry;
        const r = Math.sqrt(r2);
        
        if (r < 0.05) continue; // evitar singularidades
        
        const dq = sigma * ds;
        const inv = dq / (r2 * r);
        Ex_plate += inv * rx;
        Ey_plate += inv * ry;
      }
    }
    
    Ex += Ex_plate;
    Ey += Ey_plate;
  }

  // induzidas
  for (const m of conds) {
    for (const nd of m.outer) {
      const rx = x - nd.x, ry = y - nd.y;
      const r2 = rx * rx + ry * ry; const r = Math.sqrt(r2); const soft = 0.06; if (r < soft) continue;
      const inv = 1 / (r2 * r); Ex += nd.q * rx * inv; Ey += nd.q * ry * inv;
    }
    for (const nd of m.inner) {
      const rx = x - nd.x, ry = y - nd.y;
      const r2 = rx * rx + ry * ry; const r = Math.sqrt(r2); const soft = 0.06; if (r < soft) continue;
      const inv = 1 / (r2 * r); Ex += nd.q * rx * inv; Ey += nd.q * ry * inv;
    }
  }

  return { Ex, Ey };
}

// ======= Interseções: segmento × círculos (inner/outer) =======
function firstIntersectionWithAnyConductor(
  p0: { x: number; y: number }, p1: { x: number; y: number }, conds: CondMesh[]
): { hit: boolean; point: { x: number; y: number } } {
  let bestT = Infinity; let best: { x: number; y: number } | null = null;
  const dx = p1.x - p0.x, dy = p1.y - p0.y; const a = dx * dx + dy * dy; if (a < 1e-12) return { hit: false, point: p1 };
  for (const m of conds) {
    for (const R of [m.Ro, m.Ri]) {
      const fx = p0.x - m.cx, fy = p0.y - m.cy;
      const b = 2 * (dx * fx + dy * fy);
      const c = fx * fx + fy * fy - R * R;
      const disc = b * b - 4 * a * c; if (disc < 0) continue;
      const sdisc = Math.sqrt(disc);
      const t1 = (-b - sdisc) / (2 * a); const t2 = (-b + sdisc) / (2 * a);
      const cand = [t1, t2].filter(t => t >= 0 && t <= 1);
      if (cand.length === 0) continue;
      const t = Math.min(...cand);
      if (t < bestT) { bestT = t; best = { x: p0.x + dx * t, y: p0.y + dy * t }; }
    }
  }
  if (best) return { hit: true, point: best };
  return { hit: false, point: p1 };
}
function insideConductorMetal(x: number, y: number, conds: CondMesh[]) {
  for (const m of conds) {
    const d = Math.hypot(x - m.cx, y - m.cy);
    if (d >= m.Ri && d <= m.Ro) return true;
  }
  return false;
}

// ======= Glifos + / - (reduz espessura do traço em 30%) =======
function drawSignGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, sign: 1 | -1) {
  const r = Math.max(2, size);
  ctx.save();
  ctx.strokeStyle = sign > 0 ? THEME.chargePlus : THEME.chargeMinus;
  // antes: r * 0.6  -> agora 30% mais fino
  ctx.lineWidth = Math.max(1, r * 0.42);
  ctx.lineCap = "round";
  // traço horizontal
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.stroke();
  // traço vertical para '+'
  if (sign > 0) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  }
  ctx.restore();
}

// ======= Componente =======
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 640 });
  const [pxPerUnit, setPxPerUnit] = useState(100);
  const [center, setCenter] = useState({ x: 0, y: 0 });

  const [charges, setCharges] = useState<Charge[]>([]);
  const [plates, setPlates] = useState<Plate[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [condMeshes, setCondMeshes] = useState<CondMesh[]>([]);
  const [nextId, setNextId] = useState(1);

  const [showResultant, setShowResultant] = useState(true);
  const [showIndividuals, setShowIndividuals] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const [density, setDensity] = useState(48);

  // Novos toggles
  const [showPotential, setShowPotential] = useState(false); // degradê
  const [showEquip, setShowEquip] = useState(false);        // equipotenciais
  const [isRealVectors, setIsRealVectors] = useState(false); // vetores reais vs didáticos
  const [forceUpdate, setForceUpdate] = useState(0); // força re-render

  const [ghost, setGhost] = useState<GhostState>({ active: false });
  const [dragFromPalette, setDragFromPalette] = useState<null | { kind: "charge" | "plate" | "cond" | "probe"; sign?: 1 | -1 }>(null);
  const [isHoveringTrashArea, setIsHoveringTrashArea] = useState(false);

  const [dragChargeId, setDragChargeId] = useState<number | null>(null);
  const dragChargeOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const [dragProbeId, setDragProbeId] = useState<number | null>(null);
  const dragProbeOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const [dragPlate, setDragPlate] = useState<null | { id: number; mode: "move" | "handle" }>(null);
  const dragPlateOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const [dragCond, setDragCond] = useState<null | { id: number; mode: "move" | "radius" }>(null);
  const dragCondOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const [hoverRadiusHandle, setHoverRadiusHandle] = useState<null | { id: number }>(null);

  const basePx = 100;
  const zoomScale = Math.min(2.2, Math.max(0.7, Math.pow(pxPerUnit / basePx, 0.85)));
  const fieldCacheRef = useRef<Map<string, { Ex: number; Ey: number }>>(new Map());

  // Forçar re-render imediato quando mudar modo de vetores
  useEffect(() => {
    // Invalidar todos os caches para forçar recálculo imediato
    equipCacheRef.current = null;
    fieldCacheRef.current.clear();
  }, [isRealVectors]);

  const handleReset = () => {
    setCharges([]); setPlates([]); setConductors([]); setProbes([]);
    setCenter({ x: 0, y: 0 }); setPxPerUnit(basePx);
    // Limpar todos os caches
    equipCacheRef.current = null;
    fieldCacheRef.current.clear();
  };

  // resize
  useEffect(() => {
    const onResize = () => {
      const host = canvasRef.current?.parentElement; if (!host) return;
      const r = host.getBoundingClientRect();
      setSize({ w: Math.max(720, Math.floor(r.width)), h: Math.max(460, Math.floor(r.height)) });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // recalcula indução
  useEffect(() => {
    const meshes = conductors.map(c => buildConductorMesh(c, charges, plates));
    setCondMeshes(meshes);
  }, [conductors, charges, plates]);

  // Ghost da paleta
  useEffect(() => {
    if (!dragFromPalette) return;
    if (dragFromPalette.kind === "charge") {
      setGhost({ active: true, kind: "charge", sign: dragFromPalette.sign as (1 | -1), sx: -1000, sy: -1000 });
    } else if (dragFromPalette.kind === "plate") {
      setGhost({ active: true, kind: "plate", sign: dragFromPalette.sign as (1 | -1), sx: -1000, sy: -1000, theta: Math.PI / 2, halfH: 1.4 });
    } else if (dragFromPalette.kind === "probe") {
      setGhost({ active: true, kind: "probe", sign: dragFromPalette.sign as (1 | -1), sx: -1000, sy: -1000 });
    } else {
      setGhost({ active: true, kind: "cond", sx: -1000, sy: -1000, R: 1.2 });
    }

    const onMove = (e: MouseEvent) => setGhost((g) => g.active ? ({ ...g, sx: e.clientX, sy: e.clientY } as GhostState) : g);
    const onUp = (e: MouseEvent) => {
      const canvas = canvasRef.current; if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
          const { x, y } = s2w(e.clientX - rect.left, e.clientY - rect.top);
          if (dragFromPalette.kind === "charge") {
            setCharges((old) => [...old, { id: nextId, q: dragFromPalette.sign as (1 | -1), x, y }]);
            setNextId((n) => n + 1);
          } else if (dragFromPalette.kind === "plate") {
            setPlates((old) => [...old, { id: nextId, sign: dragFromPalette.sign as (1 | -1), x, y, theta: Math.PI / 2, halfH: 1.4, lambda: 1 }]);
            setNextId((n) => n + 1);
          } else if (dragFromPalette.kind === "probe") {
            setProbes((old) => [...old, { id: nextId, sign: dragFromPalette.sign as (1 | -1), x, y }]);
            setNextId((n) => n + 1);
          } else {
            setConductors((old) => [...old, { id: nextId, x, y, R: 1.2, thick: 0.28 }]);
            setNextId((n) => n + 1);
          }
        }
      }
      setDragFromPalette(null);
      setGhost({ active: false });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragFromPalette, size.w, size.h, pxPerUnit, center, nextId]);

  // pan/zoom + mover objetos
  const dragging = useRef(false);
  const start = useRef({ sx: 0, sy: 0, cx: 0, cy: 0 });

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragFromPalette) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    const w2s = worldToScreen(size.w, size.h, pxPerUnit, center);
    const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
    const mouseWorld = s2w(sx, sy);

    // PROBE
    if (probes.length > 0) {
      const hitPx = 14 * zoomScale;
      for (const p of probes) {
        const ps = w2s(p.x, p.y);
        if (Math.hypot(ps.x - sx, ps.y - sy) <= hitPx) {
          setDragProbeId(p.id);
          dragProbeOffset.current = { dx: mouseWorld.x - p.x, dy: mouseWorld.y - p.y };
          return;
        }
      }
    }
    // CARGA
    if (charges.length > 0) {
      const hitPx = Math.max(6, Math.min(28, 12 * zoomScale)) * 1.5;
      for (const c of charges) {
        const p = w2s(c.x, c.y);
        if (Math.hypot(p.x - sx, p.y - sy) <= hitPx) {
          setDragChargeId(c.id);
          dragChargeOffset.current = { dx: mouseWorld.x - c.x, dy: mouseWorld.y - c.y };
          return;
        }
      }
    }
    // PLACA
    if (plates.length > 0) {
      for (const p of plates) {
        const ux = Math.cos(p.theta), uy = Math.sin(p.theta);
        const A = { x: p.x - ux * p.halfH, y: p.y - uy * p.halfH };
        const B = { x: p.x + ux * p.halfH, y: p.y + uy * p.halfH };
        const As = w2s(A.x, A.y), Bs = w2s(B.x, B.y);
        const Cs = w2s(p.x, p.y);
        const hitHandlePx = 18 * zoomScale + 12; // Aumentar área dos handles
        const dA = Math.hypot(As.x - sx, As.y - sy);
        const dB = Math.hypot(Bs.x - sx, Bs.y - sy);
        if (dA < hitHandlePx || dB < hitHandlePx) {
          setDragPlate({ id: p.id, mode: "handle" });
          return;
        }
        const dC = Math.hypot(Cs.x - sx, Cs.y - sy);
        const hitCenterPx = 20 * zoomScale + 15; // Aumentar área do centro
        if (dC < hitCenterPx) {
          setDragPlate({ id: p.id, mode: "move" });
          dragPlateOffset.current = { dx: mouseWorld.x - p.x, dy: mouseWorld.y - p.y };
          return;
        }
      }
    }
    // CONDUTOR
    if (conductors.length > 0) {
      for (const c of conductors) {
        const Cs = w2s(c.x, c.y);
        const RoPx = Math.max(8, c.R * pxPerUnit);
        const RiPx = Math.max(1, (c.R - Math.max(0.1, c.thick)) * pxPerUnit);
        const dC = Math.hypot(Cs.x - sx, Cs.y - sy);

        // handle (pininho) - área ampliada
        const handle = { x: Cs.x + RoPx, y: Cs.y };
        const dH = Math.hypot(handle.x - sx, handle.y - sy);
        if (dH < 22 * zoomScale + 18) { // Aumentado de 16+14 para 22+18
          setDragCond({ id: c.id, mode: "radius" });
          return;
        }

        // Bordas do condutor - área ampliada
        if (Math.abs(dC - RoPx) <= 15 * zoomScale || Math.abs(dC - RiPx) <= 15 * zoomScale) { // Aumentado de 10 para 15
          setDragCond({ id: c.id, mode: "move" });
          dragCondOffset.current = { dx: mouseWorld.x - c.x, dy: mouseWorld.y - c.y };
          return;
        }
        // Centro do condutor - área ampliada  
        if (dC < 20 * zoomScale + 15) { // Aumentado de 14+10 para 20+15
          setDragCond({ id: c.id, mode: "move" });
          dragCondOffset.current = { dx: mouseWorld.x - c.x, dy: mouseWorld.y - c.y };
          return;
        }
      }
    }

    // pan
    dragging.current = true;
    start.current = { sx: e.clientX, sy: e.clientY, cx: center.x, cy: center.y };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    
    // Detectar se está sobre a área "Arraste para o plano" (paleta) - baseado no centro geométrico
    const isOverRemovalArea = sx > size.w - 352 && sy > size.h - 200; // Canto inferior direito
    const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
    const w2s = worldToScreen(size.w, size.h, pxPerUnit, center);

    // hover do pino de raio
    if (!dragCond && !dragChargeId && !dragPlate && !dragProbeId) {
      // Limpar hover da área de descarte quando não está arrastando nada
      setIsHoveringTrashArea(false);
      
      let hovering: null | { id: number } = null;
      for (const c of conductors) {
        const Cs = w2s(c.x, c.y);
        const RoPx = Math.max(8, c.R * pxPerUnit);
        const handle = { x: Cs.x + RoPx, y: Cs.y };
        const dH = Math.hypot(handle.x - sx, handle.y - sy);
        if (dH < 16 * zoomScale + 14) { hovering = { id: c.id }; break; }
      }
      setHoverRadiusHandle(hovering);
      canvas.style.cursor = hovering ? "ew-resize" : "";
    }

    if (dragProbeId != null) {
      const { x, y } = s2w(sx, sy);
      const nx = x - dragProbeOffset.current.dx, ny = y - dragProbeOffset.current.dy;
      const centerS = w2s(nx, ny);
      
      // Verificar se está fora do canvas (remoção por sair dos limites)
      // Zona permissiva MÁXIMA para probes (elimina travamentos)
      const midFieldHeight = size.h - 500; // Zona extremamente ampla
      const isInPermissiveZone = centerS.x > size.w - 700 && centerS.x < size.w + 400 && centerS.y > midFieldHeight;
      
      // NENHUMA validação de limite durante drag - movimento totalmente livre
      
      // Atualizar posição normalmente
      setProbes((old) => old.map((p) => (p.id === dragProbeId ? { ...p, x: nx, y: ny } : p)));
      
      // Probe vai para lixeira com tolerância aumentada
      const isOverTrashArea = centerS.x > size.w - 80 && centerS.y > size.h - 600;
      setIsHoveringTrashArea(isOverTrashArea);
      canvas.style.cursor = isOverTrashArea ? "no-drop" : "move";
      return;
    }
    if (dragChargeId != null) {
      const { x, y } = s2w(sx, sy);
      const nx = x - dragChargeOffset.current.dx, ny = y - dragChargeOffset.current.dy;
      const centerS = w2s(nx, ny);
      
      // Verificar se está fora do canvas (remoção por sair dos limites)
      // Zona permissiva MÁXIMA para cargas (elimina travamentos)
      const midFieldHeight = size.h - 500; // Zona extremamente ampla
      const isInPermissiveZone = centerS.x > size.w - 700 && centerS.x < size.w + 400 && centerS.y > midFieldHeight;
      
      // NENHUMA validação de limite durante drag - movimento totalmente livre
      
      // Atualizar posição normalmente
      setCharges((old) => old.map((c) => (c.id === dragChargeId ? { ...c, x: nx, y: ny } : c)));
      
      // Carga vai para lixeira com tolerância aumentada
      const isOverTrashArea = centerS.x > size.w - 80 && centerS.y > size.h - 600;
      setIsHoveringTrashArea(isOverTrashArea);
      canvas.style.cursor = isOverTrashArea ? "no-drop" : "move";
      return;
    }
    if (dragPlate) {
      const p = plates.find((pl) => pl.id === dragPlate.id);
      if (!p) return;
      if (dragPlate.mode === "move") {
        const { x, y } = s2w(sx, sy);
        const nx = x - dragPlateOffset.current.dx, ny = y - dragPlateOffset.current.dy;
        const centerS = w2s(nx, ny);
        
        // Verificar se está fora do canvas (remoção por sair dos limites)
        // Zona permissiva MÁXIMA para placas (elimina travamentos)
        const midFieldHeight = size.h - 500; // Zona extremamente ampla
        const isInPermissiveZone = centerS.x > size.w - 700 && centerS.x < size.w + 400 && centerS.y > midFieldHeight;
        
        // NENHUMA validação de limite durante drag - movimento totalmente livre
        
        // Atualizar posição normalmente
        setPlates((old) => old.map((pl) => (pl.id === p.id ? { ...pl, x: nx, y: ny } : pl)));
        
        // Placa vai para lixeira com tolerância muito aumentada
        const isOverTrashArea = centerS.x > size.w - 120 && centerS.y > size.h - 650;
        setIsHoveringTrashArea(isOverTrashArea);
        canvas.style.cursor = isOverTrashArea ? "no-drop" : "move";
      } else {
        const C = { x: p.x, y: p.y };
        const { x, y } = s2w(sx, sy);
        const dx = x - C.x, dy = y - C.y;
        setPlates((old) => old.map((pl) => (pl.id === p.id ? { ...pl, theta: Math.atan2(dy, dx), halfH: Math.max(0.3, Math.hypot(dx, dy)) } : pl)));
      }
      return;
    }
    if (dragCond) {
      const c = conductors.find(cc => cc.id === dragCond.id); if (!c) return;
      if (dragCond.mode === "move") {
        const { x, y } = s2w(sx, sy);
        const nx = x - dragCondOffset.current.dx, ny = y - dragCondOffset.current.dy;
        const centerS = w2s(nx, ny);
        
        // Verificar se está fora do canvas (remoção por sair dos limites)
        // Zona permissiva MÁXIMA para condutores (elimina travamentos)
        const midFieldHeight = size.h - 500; // Zona extremamente ampla
        const isInPermissiveZone = centerS.x > size.w - 700 && centerS.x < size.w + 400 && centerS.y > midFieldHeight;
        
        // NENHUMA validação de limite durante drag - movimento totalmente livre
        
        // Atualizar posição normalmente
        setConductors((old) => old.map((cc) => (cc.id === c.id ? { ...cc, x: nx, y: ny } : cc)));
        
        // Condutor vai para lixeira com tolerância aumentada
        const isOverTrashArea = centerS.x > size.w - 50 && centerS.y > size.h - 600;
        setIsHoveringTrashArea(isOverTrashArea);
        canvas.style.cursor = isOverTrashArea ? "no-drop" : "move";
      } else {
        const { x, y } = s2w(sx, sy);
        let newR = Math.max(0.4, Math.hypot(x - c.x, y - c.y));
        if (e.shiftKey) newR = Math.round(newR / 0.05) * 0.05;
        setConductors((old) => old.map((cc) => (cc.id === c.id ? { ...cc, R: newR } : cc)));
      }
      return;
    }
    if (!dragging.current) return;
    const dx = e.clientX - start.current.sx;
    const dy = e.clientY - start.current.sy;
    setCenter({ x: start.current.cx - dx / pxPerUnit, y: start.current.cy + dy / pxPerUnit });
  };

  const endDrag = (e?: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    
    // LIXEIRA: Remoção apenas se SOLTAR dentro da área de descarte
    if (e && canvas && isHoveringTrashArea) {
      let itemRemoved = false;
      
      if (dragProbeId != null) {
        setProbes((old) => old.filter(p => p.id !== dragProbeId));
        itemRemoved = true;
      }
      
      if (dragChargeId != null) {
        setCharges((old) => old.filter(c => c.id !== dragChargeId));
        itemRemoved = true;
      }
      
      if (dragPlate?.mode === "move") {
        setPlates((old) => old.filter(p => p.id !== dragPlate.id));
        itemRemoved = true;
      }
      
      if (dragCond?.mode === "move") {
        setConductors((old) => old.filter(c => c.id !== dragCond.id));
        itemRemoved = true;
      }
      
      if (itemRemoved) {
        equipCacheRef.current = null;
        fieldCacheRef.current.clear();
      }
    }
    
    // Limpar todos os estados
    dragging.current = false;
    setDragProbeId(null); setDragChargeId(null); setDragPlate(null); setDragCond(null);
    setHoverRadiusHandle(null);
    setIsHoveringTrashArea(false);
    if (canvas) canvas.style.cursor = "";
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
    const before = s2w(mx, my);

    const factor = Math.pow(1.1, -e.deltaY / 100);
    const newPx = Math.max(20, Math.min(320, pxPerUnit * factor));
    setPxPerUnit(newPx);

    const after = screenToWorld(size.w, size.h, newPx, center)(mx, my);
    setCenter({ x: center.x + (before.x - after.x), y: center.y + (before.y - after.y) });
  };
  // === Cache das equipotenciais ===
  const equipCacheRef = useRef<{ key: string; segs: Array<[number, number, number, number, number]> } | null>(null);

  function quant(v: number) { return Math.round(v * 100) / 100; }
  function makeEquipKey() {
    return JSON.stringify({
      kind: 'equip',
      px: Math.round(pxPerUnit),
      cx: quant(center.x), cy: quant(center.y),
      charges: charges.map(c => ({ id: c.id, q: c.q, x: quant(c.x), y: quant(c.y) })).sort((a, b) => a.id - b.id),
      plates: plates.map(p => ({ id: p.id, s: p.sign, x: quant(p.x), y: quant(p.y), th: quant(p.theta), h: quant(p.halfH) })).sort((a, b) => a.id - b.id),
      conds: conductors.map(k => ({ id: k.id, x: quant(k.x), y: quant(k.y), R: quant(k.R), t: quant(k.thick) })).sort((a, b) => a.id - b.id),
    });
  }
  // Limpar cache de equipotenciais quando qualquer coisa muda
  useEffect(() => {
    equipCacheRef.current = null;
    fieldCacheRef.current.clear();
  }, [charges, plates, conductors, pxPerUnit, center.x, center.y]);

  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = touch.clientX - rect.left, sy = touch.clientY - rect.top;
    
    // Simular o MouseDown para reaproveitar a lógica
    const mouseEvent = { clientX: touch.clientX, clientY: touch.clientY } as any;
    onMouseDown(mouseEvent);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Impedir scroll da página durante o arraste
    if (dragging.current || dragChargeId || dragPlate || dragCond || dragProbeId || dragFromPalette) {
      if (e.cancelable) e.preventDefault();
    }
    
    const touch = e.touches[0];
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    const mouseEvent = { clientX: touch.clientX, clientY: touch.clientY } as any;
    onMouseMove(mouseEvent);
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    endDrag();
  };

  // desenho
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1) fundo
    fillBackground(ctx, size.w, size.h);

    // 2) POTENCIAL (degradê) - Otimizado para melhor performance
    if (showPotential) {
      const DPR = window.devicePixelRatio || 1;
      
      // Reduzir resolução para melhor performance  
      const RESOLUTION_SCALE = 0.35; // Reduz mais para otimização
      const Wd = Math.floor(size.w * DPR * RESOLUTION_SCALE);
      const Hd = Math.floor(size.h * DPR * RESOLUTION_SCALE);

      const phi = new Float32Array(Wd * Hd);
      let maxAbs = 1e-9, idx = 0;
      const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);

      // Calcular potencial em grade reduzida com otimizações
      const STEP = 2; // Pular pixels para reduzir cálculos
      for (let y = 0; y < Hd; y += STEP) {
        for (let x = 0; x < Wd; x += STEP, idx += STEP) {
          if (idx >= phi.length) break;
          
          // Ajustar coordenadas para a grade reduzida
          const cssx = (x + 0.5) / (DPR * RESOLUTION_SCALE);
          const cssy = (y + 0.5) / (DPR * RESOLUTION_SCALE);
          const { x: Xw, y: Yw } = s2w(cssx, cssy);

          let p = 0;
          if (!insideConductorMetal(Xw, Yw, condMeshes)) {
            p = potentialTotalAtPoint(Xw, Yw, charges, plates, condMeshes);
          }
          
          // Preencher área STEP x STEP com o mesmo valor
          for (let dy = 0; dy < STEP && y + dy < Hd; dy++) {
            for (let dx = 0; dx < STEP && x + dx < Wd; dx++) {
              const fillIdx = (y + dy) * Wd + (x + dx);
              if (fillIdx < phi.length) {
                phi[fillIdx] = p;
                const a = Math.abs(p); 
                if (a > maxAbs) maxAbs = a;
              }
            }
          }
        }
        // Ajustar idx para próxima linha
        idx = (y + STEP) * Wd;
      }

      // Criar imagem na resolução reduzida
      const img = ctx.createImageData(Wd, Hd);
      const data = img.data;
      const alphaScale = 1.02; // Reduzir 15% da intensidade (1.2 * 0.85 = 1.02)

      for (let i = 0; i < phi.length; i++) {
        const p = phi[i];
        if (p === 0) { data[4 * i + 3] = 0; continue; }
        const tRaw = Math.min(1, Math.abs(p) / (maxAbs || 1));
        const t = Math.pow(tRaw, 0.5); // Maior alcance do gradiente (menos suavizado)
        const a = t * alphaScale;
        const [R, G, B] = p > 0 ? POT_POS_RGB : POT_NEG_RGB;
        data[4 * i + 0] = R;
        data[4 * i + 1] = G;
        data[4 * i + 2] = B;
        data[4 * i + 3] = Math.floor(a * 255);
      }

      // Criar canvas temporário para escalar a imagem
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCanvas.width = Wd;
      tempCanvas.height = Hd;
      tempCtx.putImageData(img, 0, 0);
      
      // Desenhar imagem escalada no canvas principal
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tempCanvas, 0, 0, size.w, size.h); // Corrigir dimensões
      ctx.restore();
    }


    // 3) grade + eixos (sem preencher o fundo!)
    drawGridLinesAxes(ctx, size.w, size.h, pxPerUnit, center);

    const w2s = worldToScreen(size.w, size.h, pxPerUnit, center);
    const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
    // 4) equipotenciais, linhas, setas, objetos...

    // pontos-amostra para o bloco "INDIVIDUAIS"
    const samplePts = (() => {
      const step = Math.max(18, density);
      const cols = Math.floor(size.w / step) + 2;
      const rows = Math.floor(size.h / step) + 2;
      const offX = (size.w % step) / 2;
      const offY = (size.h % step) / 2;

      const arr: { sx: number; sy: number; x: number; y: number; nearBoost: number }[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = c * step + offX;
          const sy = r * step + offY;
          const { x, y } = s2w(sx, sy);
          // MODIFICADO: Permitir vetores em toda a região do condutor (metal + cavidade)
          // para mostrar campos individuais que se cancelam
          // if (insideConductorMetal(x, y, condMeshes)) continue;
          
          // Comentado filtro de cavidade vazia para mostrar vetores individuais
          // let inZeroCavity = false;
          // for (const m of condMeshes) { 
          //   const d = Math.hypot(x - m.cx, y - m.cy); 
          //   if (d < m.Ri && Math.abs(m.Qin) < 1e-9) { 
          //     inZeroCavity = true; 
          //     break; 
          //   } 
          // }
          // if (inZeroCavity) continue;
          
          // Verificar distância mínima das cargas negativas e placas negativas (apenas para vetores realistas)
          if (isRealVectors) {
            let tooCloseToNegativeItem = false;
            for (const ch of charges) {
              if (ch.q < 0) {
                const dist = Math.hypot(x - ch.x, y - ch.y);
                if (dist < 0.8) {
                  tooCloseToNegativeItem = true;
                  break;
                }
              }
            }
            if (!tooCloseToNegativeItem) {
              for (const pl of plates) {
                if (pl.sign < 0) {
                  const dist = Math.hypot(x - pl.x, y - pl.y);
                  if (dist < 0.8) {
                    tooCloseToNegativeItem = true;
                    break;
                  }
                }
              }
            }
            if (tooCloseToNegativeItem) continue;
          }
          
          arr.push({ sx, sy, x, y, nearBoost: 1.0 });
        }
      } // <-- fecha o for externo

      return arr;
    })();


    // ==== EQUIPOTENCIAIS (tela) com cores baseadas na intensidade ====
    if (showEquip) {
      const key = makeEquipKey();
      let segs: Array<[number, number, number, number, number]>;

      if (equipCacheRef.current?.key === key) {
        segs = equipCacheRef.current.segs;
      } else {
        const grid = buildEquipGrid(size.w, size.h, s2w, charges, plates, condMeshes, 6, true, true); // Resolução maior
        const levels = equipLevelsFromGrid(grid.phi, 7);
        segs = marchingSquaresEquip(grid, levels);
        equipCacheRef.current = { key, segs };
      }

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1.2, 1.8 * zoomScale);
      
      // Encontrar o nível máximo para normalização
      const maxLevel = segs.reduce((max, seg) => Math.max(max, Math.abs(seg[4])), 0);
      
      // Agrupar segmentos por nível para desenhar com a mesma cor
      const segsByLevel = new Map<number, Array<[number, number, number, number]>>();
      for (const [x1, y1, x2, y2, level] of segs) {
        // filtra segmentos cujo ponto médio está no metal
        const midW = s2w((x1 + x2) * 0.5, (y1 + y2) * 0.5);
        if (insideConductorMetal(midW.x, midW.y, condMeshes)) continue;
        
        if (!segsByLevel.has(level)) {
          segsByLevel.set(level, []);
        }
        segsByLevel.get(level)!.push([x1, y1, x2, y2]);
      }
      
      // Desenhar cada grupo de segmentos com sua cor específica
      for (const [level, levelSegs] of segsByLevel) {
        ctx.strokeStyle = getEquipotentialColor(level, maxLevel);
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of levelSegs) {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
      
      ctx.restore();
    }


// ================== LINHAS DE CAMPO (perímetro + pares opostos + anel) ==================
if (showLines && (charges.length > 0 || plates.length > 0 || condMeshes.length > 0)) {
  // ---------- parâmetros globais e helpers ----------
  // fator vindo do slider de densidade: CORRIGIDO (slider direita = menos, esquerda = mais)
  const seedFactor = Math.max(0.35, Math.min(4.0, (96 - density) / 24)); // máximo 4x

  // alterna 1 sim / 1 não. use fases diferentes por banda p/ não criar faixas vazias
  const HALF = true; // deixe true se quiser ~metade das linhas
  const keepAlt = (i: number, phase = 0) => (!HALF ? true : (((i + phase) & 1) === 0));

  // limites do mundo visível
  const worldTL = s2w(0, 0);
  const worldBR = s2w(size.w, size.h);
  const xMin = Math.min(worldTL.x, worldBR.x), xMax = Math.max(worldTL.x, worldBR.x);
  const yMin = Math.min(worldTL.y, worldBR.y), yMax = Math.max(worldTL.y, worldBR.y);

  type Pt = { x: number; y: number };
  let seeds: Pt[] = [];

  // ---------- (A) sementes no perímetro visível ----------
  {
    const inset = 0.02 * (xMax - xMin + yMax - yMin);
    const baseTop = 15, baseBot = 15, baseL = 10, baseR = 10;
    const N_TOP = Math.max(2, Math.round(baseTop * seedFactor));
    const N_BOT = Math.max(2, Math.round(baseBot * seedFactor));
    const N_LEFT = Math.max(2, Math.round(baseL * seedFactor));
    const N_RIGHT = Math.max(2, Math.round(baseR * seedFactor));

    // topo (fase 0)
    for (let i = 0; i < N_TOP; i++) {
      if (!keepAlt(i, 0)) continue;
      const t = (i + 0.5) / N_TOP;
      const x = xMin + t * (xMax - xMin);
      const y = yMax - inset;
      seeds.push({ x, y });
    }
    // base (fase 1)
    for (let i = 0; i < N_BOT; i++) {
      if (!keepAlt(i, 1)) continue;
      const t = (i + 0.5) / N_BOT;
      const x = xMin + t * (xMax - xMin);
      const y = yMin + inset;
      seeds.push({ x, y });
    }
    // esquerda (fase 0)
    for (let i = 0; i < N_LEFT; i++) {
      if (!keepAlt(i, 0)) continue;
      const t = (i + 0.5) / N_LEFT;
      const y = yMin + t * (yMax - yMin);
      const x = xMin + inset;
      seeds.push({ x, y });
    }
    // direita (fase 1)
    for (let i = 0; i < N_RIGHT; i++) {
      if (!keepAlt(i, 1)) continue;
      const t = (i + 0.5) / N_RIGHT;
      const y = yMin + t * (yMax - yMin);
      const x = xMax - inset;
      seeds.push({ x, y });
    }
  }

  // ---------- (B) "rake" entre pares de cargas opostas (preenche lacunas entre + e -) ----------
  {
    const SEP_MIN = 2.2;   // ativa rake só se o par estiver razoavelmente separado
    const BASE_RAKE = 7;   // base; será escalado
    const FRACTION = 0.28; // largura transversal coberta

    for (let i = 0; i < charges.length; i++) {
      for (let j = i + 1; j < charges.length; j++) {
        const ci = charges[i], cj = charges[j];
        if (ci.q * cj.q >= 0) continue; // só opostas

        const dx = cj.x - ci.x, dy = cj.y - ci.y;
        const d = Math.hypot(dx, dy);
        if (d < SEP_MIN * 0.45) continue; // muito coladas -> o anel de sementes já resolve

        // mais perto => mais linhas: cresce ~ linear até 1/d (com clamp)
        const nearBoost = Math.min(2.2, Math.max(1.0, 1.2 / Math.max(0.5, d)));
        const N_RAKE = Math.max(3, Math.round(BASE_RAKE * seedFactor * nearBoost));

        const mx = (ci.x + cj.x) / 2, my = (ci.y + cj.y) / 2;
        const nx = -dy / (d || 1), ny = dx / (d || 1);

        const phase = (i + j) & 1; // alterna 0/1 por par
        for (let k = -Math.floor(N_RAKE / 2); k <= Math.floor(N_RAKE / 2); k++) {
          if (!keepAlt(k + Math.floor(N_RAKE / 2), phase)) continue;
          const off = (k / (N_RAKE / 2)) * (FRACTION * d);
          const x = mx + off * nx, y = my + off * ny;
          if (x > xMin && x < xMax && y > yMin && y < yMax) seeds.push({ x, y });
        }
      }
    }
  }

  // ---------- (B2) "rake" entre pares de PLACAS opostas (correção da estrutura) ----------
  {
    const SEP_MIN = 2.2;   // ativa rake só se o par estiver razoavelmente separado
    const BASE_RAKE = 7;   // base; será escalado
    const FRACTION = 0.28; // largura transversal coberta

    for (let i = 0; i < plates.length; i++) {
      for (let j = i + 1; j < plates.length; j++) {
        const pi = plates[i], pj = plates[j];
        
        // CORREÇÃO: usar plate.sign e plate.x, plate.y
        if (pi.sign * pj.sign >= 0) continue; // só opostas

        const dx = pj.x - pi.x, dy = pj.y - pi.y;
        const d = Math.hypot(dx, dy);
        if (d < SEP_MIN * 0.45) continue; // muito coladas -> o anel de sementes já resolve

        // mais perto => mais linhas: cresce ~ linear até 1/d (com clamp)
        const nearBoost = Math.min(2.2, Math.max(1.0, 1.2 / Math.max(0.5, d)));
        const N_RAKE = Math.max(3, Math.round(BASE_RAKE * seedFactor * nearBoost));

        const mx = (pi.x + pj.x) / 2, my = (pi.y + pj.y) / 2;
        const nx = -dy / (d || 1), ny = dx / (d || 1);

        const phase = (i + j) & 1; // alterna 0/1 por par
        for (let k = -Math.floor(N_RAKE / 2); k <= Math.floor(N_RAKE / 2); k++) {
          if (!keepAlt(k + Math.floor(N_RAKE / 2), phase)) continue;
          const off = (k / (N_RAKE / 2)) * (FRACTION * d);
          const x = mx + off * nx, y = my + off * ny;
          if (x > xMin && x < xMax && y > yMin && y < yMax) seeds.push({ x, y });
        }
      }
    }
  }

  // ---------- (C) anel de sementes ao redor das cargas E PLACAS (cópia exata) ----------
  {
    const START_R = 0.28;              // raio de partida (em mundo)
    const BASE_RING = 48;              // base angular; escalado pelo slider
    
    // ORIGINAL: ao redor das cargas
    for (const cp of charges) {
      const N_RING = Math.max(12, Math.round(BASE_RING * seedFactor));
      const theta0 = -Math.PI, theta1 = Math.PI;

      for (let a = 0; a < N_RING; a++) {
        if (!keepAlt(a, cp.id & 1)) continue; // uma sim/uma não por carga (fase por id)
        const th = theta0 + (a + 0.5) * (theta1 - theta0) / N_RING;
        const x0 = cp.x + START_R * Math.cos(th);
        const y0 = cp.y + START_R * Math.sin(th);
        if (x0 > xMin && x0 < xMax && y0 > yMin && y0 < yMax) seeds.push({ x: x0, y: y0 });
      }
    }
    
    // NOVO: ao redor das placas (CORREÇÃO da estrutura de dados)
    for (let plateIdx = 0; plateIdx < plates.length; plateIdx++) {
      const plate = plates[plateIdx];
      
      // Sementes ao redor do centro da placa
      const cp = { 
        x: plate.x, 
        y: plate.y, 
        id: plateIdx 
      };
      
      const N_RING = Math.max(12, Math.round(BASE_RING * seedFactor));
      const theta0 = -Math.PI, theta1 = Math.PI;

      for (let a = 0; a < N_RING; a++) {
        if (!keepAlt(a, cp.id & 1)) continue;
        const th = theta0 + (a + 0.5) * (theta1 - theta0) / N_RING;
        const x0 = cp.x + START_R * Math.cos(th);
        const y0 = cp.y + START_R * Math.sin(th);
        if (x0 > xMin && x0 < xMax && y0 > yMin && y0 < yMax) seeds.push({ x: x0, y: y0 });
      }

      // NOVO: Sementes espalhadas ao longo de toda a placa
      const ux = Math.cos(plate.theta), uy = Math.sin(plate.theta);
      const nx = -uy, ny = ux; // normal à placa
      
      const N_ALONG = Math.max(8, Math.round(20 * seedFactor)); // sementes ao longo da placa
      const OFFSET_DIST = 0.15; // distância da placa
      
      for (let i = 0; i < N_ALONG; i++) {
        if (!keepAlt(i, (plateIdx + 1) & 1)) continue; // fase diferente do anel
        
        // Posição ao longo da placa (de -halfH a +halfH)
        const t = (i / (N_ALONG - 1 || 1)) - 0.5; // -0.5 a +0.5
        const s = t * 2 * plate.halfH; // -halfH a +halfH
        const baseX = plate.x + ux * s;
        const baseY = plate.y + uy * s;
        
        // Ambos os lados da placa
        for (const side of [-1, 1]) {
          const seedX = baseX + nx * (OFFSET_DIST * side);
          const seedY = baseY + ny * (OFFSET_DIST * side);
          
          if (seedX > xMin && seedX < xMax && seedY > yMin && seedY < yMax) {
            seeds.push({ x: seedX, y: seedY });
          }
        }
      }
    }
  }

  // ---------- Cache do campo elétrico para estabilidade ----------
  const FIELD_CACHE_GRID = 0.03; // grade do cache
  const fieldCache = fieldCacheRef.current; // <- usar o ref persistente
  
  const getCachedField = (x: number, y: number) => {
    const gx = Math.round(x / FIELD_CACHE_GRID);
    const gy = Math.round(y / FIELD_CACHE_GRID);
    const key = `${gx},${gy}`;
    
    let cached = fieldCache.get(key);
    if (!cached) {
      const wx = gx * FIELD_CACHE_GRID;
      const wy = gy * FIELD_CACHE_GRID;
      const field = fieldAtPoint(wx, wy, charges, plates, condMeshes);
      cached = { Ex: field.Ex, Ey: field.Ey };
      fieldCache.set(key, cached);
    }
    return cached;
  };

  // ---------- Integração com Euler explícito (mais estável que RK2) ----------
  const MAX_STEPS = 2000;
  const FIXED_H = 6 / pxPerUnit;  // passo completamente fixo
  const NEAR_SRC = 0.12;
  const OUT_MARGIN = 0.1 * Math.max(xMax - xMin, yMax - yMin);

  const nearAnySource = (x: number, y: number) => {
    for (const c of charges) {
      if (Math.hypot(x - c.x, y - c.y) < NEAR_SRC) return true;
    }
    for (const m of condMeshes) {
      const d = Math.hypot(x - m.cx, y - m.cy);
      if (d >= m.Ri && d <= m.Ro) return true;
      if (d < m.Ri && Math.abs(m.Qin) < 1e-9) return true;
    }
    return false;
  };

  const outside = (x: number, y: number) =>
    x < xMin - OUT_MARGIN || x > xMax + OUT_MARGIN || y < yMin - OUT_MARGIN || y > yMax + OUT_MARGIN;

  // Usar Euler simples ao invés de RK2 - mais previsível
  function eulerStep(x: number, y: number, dir: 1 | -1) {
    const field = getCachedField(x, y);
    let m = Math.hypot(field.Ex, field.Ey);
    if (m < 1e-12) return { x, y, ok: false };
    
    const ux = (field.Ex / m) * dir;
    const uy = (field.Ey / m) * dir;
    
    return { 
      x: x + FIXED_H * ux, 
      y: y + FIXED_H * uy, 
      ok: true 
    };
  }

  function traceFromSeed(sx: number, sy: number): Pt[] {
    // ignora semente se cai no metal/cavidade com Qin=0
    for (const m of condMeshes) {
      const d = Math.hypot(sx - m.cx, sy - m.cy);
      if ((d >= m.Ri && d <= m.Ro) || (d < m.Ri && Math.abs(m.Qin) < 1e-9)) return [];
    }

    // Forward direction
    const forward: Pt[] = [{ x: sx, y: sy }];
    let x = sx, y = sy;
    let stepCount = 0;
    
    for (let i = 0; i < MAX_STEPS; i++) {
      if (outside(x, y)) break;
      
      // Parar com base em número de passos E proximidade
      if (nearAnySource(x, y)) {
        stepCount++;
        if (stepCount >= 2) break; // Para após 2 passos consecutivos perto de fonte
      } else {
        stepCount = 0;
      }
      
      const step = eulerStep(x, y, +1);
      if (!step.ok) break;
      
      x = step.x; y = step.y;
      forward.push({ x, y });
    }

    // Backward direction
    const backward: Pt[] = [];
    x = sx; y = sy;
    stepCount = 0;
    
    for (let i = 0; i < MAX_STEPS; i++) {
      if (outside(x, y)) break;
      
      if (nearAnySource(x, y)) {
        stepCount++;
        if (stepCount >= 2) break;
      } else {
        stepCount = 0;
      }
      
      const step = eulerStep(x, y, -1);
      if (!step.ok) break;
      
      x = step.x; y = step.y;
      backward.push({ x, y });
    }

    backward.reverse();
    return backward.concat(forward);
  }

  // ---------- traça e desenha ----------
  ctx.save();
  ctx.strokeStyle = THEME.line;
  ctx.lineWidth = Math.max(0.9, 1.3 * zoomScale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // grade de ocupação em mundo para evitar muitas sobreposições
  const occ = new Set<string>();
  const gSize = 0.08; // tamanho da célula (mundo)
  const kOf = (x: number, y: number) => `${Math.round(x / gSize)},${Math.round(y / gSize)}`;
  const minLenPx = 10;

  for (const s of seeds) {
    const key = kOf(s.x, s.y);
    if (occ.has(key)) continue;

    const path = traceFromSeed(s.x, s.y);
    if (path.length < 2) continue;

    ctx.beginPath();
    const p0 = w2s(path[0].x, path[0].y);
    ctx.moveTo(p0.x, p0.y);
    let lastS = p0;

    for (let i = 1; i < path.length; i++) {
      const ps = w2s(path[i].x, path[i].y);
      ctx.lineTo(ps.x, ps.y);
      lastS = ps;
      occ.add(kOf(path[i].x, path[i].y));
    }
    if (Math.hypot(lastS.x - p0.x, lastS.y - p0.y) > minLenPx) ctx.stroke();
  }
  ctx.restore();
}




    // mapeamento de magnitude p/ setas
    const MAG_FLOOR = 0.28, MAG_CEIL = 1.0, MAG_GAIN = 26;
    // Normalizacao separada para placas (menos normalizada)
    const PLATE_MAG_FLOOR = 0.15, PLATE_MAG_CEIL = 1.2, PLATE_MAG_GAIN = 8;
    const ARROW_HEAD_BASE = 6 * zoomScale; const ARROW_THICK_BASE = 1.7 * zoomScale;
    

    function clipArrowToConductors(ptWorld: { x: number; y: number }, dirWorld: { ux: number; uy: number }, Lpx: number) {
      const Lw = Lpx / pxPerUnit;
      const p0 = { x: ptWorld.x, y: ptWorld.y };
      const p1 = { x: ptWorld.x + dirWorld.ux * Lw, y: ptWorld.y + dirWorld.uy * Lw };
      const hit = firstIntersectionWithAnyConductor(p0, p1, condMeshes);
      if (!hit.hit) return { x: p1.x, y: p1.y };
      const epsW = 1.0 / pxPerUnit;
      const vx = hit.point.x - p0.x, vy = hit.point.y - p0.y; const vlen = Math.hypot(vx, vy) || 1;
      const t = Math.max(0, (vlen - epsW) / (Lw || 1));
      return { x: p0.x + dirWorld.ux * Lw * t, y: p0.y + dirWorld.uy * Lw * t };
    }

    // RESULTANTE = soma vetorial das contribuições individuais
    if (showResultant && (charges.length > 0 || plates.length > 0 || condMeshes.length > 0)) {
      const step = Math.max(18, density);

      for (const pt of samplePts) {
        // VERIFICAR SE PONTO ESTÁ DENTRO DO CONDUTOR SEM PARTÍCULAS
        let insideEmptyConductor = false;
        for (const m of condMeshes) {
          const d = Math.hypot(pt.x - m.cx, pt.y - m.cy);
          
          // Verificar se há partículas dentro da cavidade deste condutor
          let hasParticlesInside = false;
          for (const ch of charges) {
            if (Math.hypot(ch.x - m.cx, ch.y - m.cy) < m.Ri - 1e-6) {
              hasParticlesInside = true;
              break;
            }
          }
          
          // Se está no metal OU na cavidade sem partículas -> campo resultante zero
          if ((d >= m.Ri && d <= m.Ro) || (d < m.Ri && !hasParticlesInside)) {
            insideEmptyConductor = true;
            break;
          }
        }
        
        if (insideEmptyConductor) continue; // Pular este ponto - campo resultante é zero
        
        // Soma EXATA das mesmas contas que usamos para os individuais
        let Ex = 0, Ey = 0;

        // cargas
        for (const ch of charges) {
          const { Ex: chEx, Ey: chEy } = fieldAtPoint(pt.x, pt.y, [ch], [], []);
          Ex += chEx; Ey += chEy;
        }
        // placas — << aqui garantimos que a resultante das placas é a soma das individuais >>
        for (const pl of plates) {
          const { Ex: plEx, Ey: plEy } = fieldAtPoint(pt.x, pt.y, [], [pl], []);
          Ex += plEx; Ey += plEy;
        }
        // condutores (malhas induzidas)
        for (const cond of condMeshes) {
          const { Ex: cEx, Ey: cEy } = fieldAtPoint(pt.x, pt.y, [], [], [cond]);
          Ex += cEx; Ey += cEy;
        }
        

        const mag = Math.hypot(Ex, Ey);
        if (mag < 1e-6) continue;

        const scale = isRealVectors
          ? Math.min(3.0, Math.max(0.05, mag)) // realista (1/r²)
          : pt.nearBoost * (MAG_FLOOR + (mag * MAG_GAIN) / (1 + mag * MAG_GAIN) * (MAG_CEIL - MAG_FLOOR)); // didático

        const L = step * 0.5 * scale * zoomScale;
        const thick = (ARROW_THICK_BASE * 0.9) * scale;
        const head = Math.max(2.5, ARROW_HEAD_BASE * 0.75 * (0.75 + 0.25 * scale));
        const uxs = Ex / mag, uys = Ey / mag;

        drawArrow(
          ctx,
          { x: pt.sx, y: pt.sy },
          w2s(pt.x + uxs * (L / pxPerUnit), pt.y + uys * (L / pxPerUnit)),
          THEME.arrow,
          thick,
          head
        );
      }
    }

    // INDIVIDUAIS
    if (showIndividuals && (charges.length > 0 || plates.length > 0 || condMeshes.length > 0)) {
      const step = Math.max(18, density);

      const sourcesCount = charges.length + plates.length + condMeshes.length;
      const colors: string[] = []; for (let i = 0; i < sourcesCount; i++) colors.push(THEME.arrowIndivid[i % THEME.arrowIndivid.length]);
      let idx = 0;
      for (const ch of charges) {
        const color = colors[idx++ % colors.length];
        for (const pt of samplePts) {
          const { Ex, Ey } = fieldFromCharges(pt.x, pt.y, [ch]);
          const mag = Math.hypot(Ex, Ey); if (mag < 1e-6) continue;
          const scale = isRealVectors 
            ? Math.min(3.0, Math.max(0.05, mag)) // Vetores reais: magnitude direta da Lei de Coulomb (1/r²)
            : pt.nearBoost * (MAG_FLOOR + (mag * MAG_GAIN) / (1 + mag * MAG_GAIN) * (MAG_CEIL - MAG_FLOOR)); // Vetores didáticos
          const L = step * 0.5 * scale * zoomScale;
          const thick = (ARROW_THICK_BASE * 0.9) * scale;
          const head = Math.max(2.5, ARROW_HEAD_BASE * 0.75 * (0.75 + 0.25 * scale));
          const uxs = Ex / mag, uys = Ey / mag;
          drawArrow(ctx, { x: pt.sx, y: pt.sy }, w2s(pt.x + uxs * (L / pxPerUnit), pt.y + uys * (L / pxPerUnit)), color, thick, head);
        }
      }
      for (const pl of plates) {
        const color = colors[idx++ % colors.length];
        for (const pt of samplePts) {
          const { Ex, Ey } = fieldFromPlates(pt.x, pt.y, [pl]);
          const mag = Math.hypot(Ex, Ey); if (mag < 1e-6) continue;
          const scale = isRealVectors 
            ? Math.min(3.0, Math.max(0.05, mag)) // Vetores reais: magnitude direta da Lei de Coulomb (1/r²)
            : pt.nearBoost * (PLATE_MAG_FLOOR + (mag * PLATE_MAG_GAIN) / (1 + mag * PLATE_MAG_GAIN) * (PLATE_MAG_CEIL - PLATE_MAG_FLOOR)); // Vetores didáticos com normalizacao menor
          const L = step * 0.5 * scale * zoomScale;
          const thick = (ARROW_THICK_BASE * 0.9) * scale;
          const head = Math.max(2.5, ARROW_HEAD_BASE * 0.75 * (0.75 + 0.25 * scale));
          const uxs = Ex / mag, uys = Ey / mag;
          drawArrow(ctx, { x: pt.sx, y: pt.sy }, w2s(pt.x + uxs * (L / pxPerUnit), pt.y + uys * (L / pxPerUnit)), color, thick, head);
        }
      }
      for (const m of condMeshes) {
        const color = colors[idx++ % colors.length];
        for (const pt of samplePts) {
          // MODIFICADO: campo induzido forçado a cancelar campos externos dentro do condutor
          const { Ex, Ey } = fieldFromInducedCharges(pt.x, pt.y, m, charges, plates);
          const mag = Math.hypot(Ex, Ey); if (mag < 1e-6) continue;
          
          const scale = isRealVectors 
            ? Math.min(3.0, Math.max(0.05, mag)) // Vetores reais: magnitude direta da Lei de Coulomb (1/r²)
            : pt.nearBoost * (MAG_FLOOR + (mag * MAG_GAIN) / (1 + mag * MAG_GAIN) * (MAG_CEIL - MAG_FLOOR)); // Vetores didáticos
          const L = step * 0.5 * scale * zoomScale;
          const thick = (ARROW_THICK_BASE * 0.9) * scale;
          const head = Math.max(2.5, ARROW_HEAD_BASE * 0.75 * (0.75 + 0.25 * scale));
          const uxs = Ex / mag, uys = Ey / mag;
          drawArrow(ctx, { x: pt.sx, y: pt.sy }, w2s(pt.x + uxs * (L / pxPerUnit), pt.y + uys * (L / pxPerUnit)), color, thick, head);
        }
      }
    }

    // cargas (com glow)
    const baseR = 12 * zoomScale;
    for (const c of charges) {
      const p = w2s(c.x, c.y);
      const R = Math.max(6, Math.min(28, baseR));
      const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, R * 2.2) as any;
      const base = c.q > 0 ? THEME.chargePlus : THEME.chargeMinus;
      glow.addColorStop(0, `${base}AA`); glow.addColorStop(1, `${base}00`);
      ctx.save(); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = base; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.2, 2 * zoomScale);
      ctx.beginPath(); ctx.moveTo(p.x - R * 0.45, p.y); ctx.lineTo(p.x + R * 0.45, p.y); ctx.stroke();
      if (c.q > 0) { ctx.beginPath(); ctx.moveTo(p.x, p.y - R * 0.45); ctx.lineTo(p.x, p.y + R * 0.45); ctx.stroke(); }
      ctx.restore();
    }

    // placas
    for (const pl of plates) {
      const pxW = Math.max(6, 10 * zoomScale);
      const nSym = Math.max(4, Math.min(14, Math.round(pl.halfH * 2 * 2)));
      const ux = Math.cos(pl.theta), uy = Math.sin(pl.theta);
      const A = { x: pl.x - ux * pl.halfH, y: pl.y - uy * pl.halfH };
      const B = { x: pl.x + ux * pl.halfH, y: pl.y + uy * pl.halfH };
      const As = w2s(A.x, A.y), Bs = w2s(B.x, B.y);

      ctx.save();
      ctx.strokeStyle = pl.sign > 0 ? THEME.platePlus : THEME.plateMinus;
      ctx.lineWidth = pxW; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(As.x, As.y); ctx.lineTo(Bs.x, Bs.y); ctx.stroke();

      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.2, 1.8 * zoomScale);
      for (let i = 0; i < nSym; i++) {
        const t = (i + 0.5) / nSym;
        const sx = As.x + (Bs.x - As.x) * t; const sy = As.y + (Bs.y - As.y) * t;
        const nx = -uy, ny = ux; const r = Math.max(4, 6 * zoomScale);
        ctx.beginPath(); ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy); ctx.stroke();
        if (pl.sign > 0) { ctx.beginPath(); ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r); ctx.stroke(); }
      }
      const rH = Math.max(4, 6 * zoomScale);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(As.x, As.y, rH, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(Bs.x, Bs.y, rH, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // condutores (anel + glifos +/– + handle)
    for (const m of condMeshes) {
      const Cs = w2s(m.cx, m.cy);
      const Ro = m.Ro * pxPerUnit, Ri = m.Ri * pxPerUnit;
      const midR = (Ro + Ri) * 0.5; const width = Math.max(2, (Ro - Ri));

      ctx.save();
      // anel
      ctx.strokeStyle = THEME.conductor; ctx.lineWidth = width; ctx.beginPath();
      ctx.arc(Cs.x, Cs.y, midR, 0, Math.PI * 2); ctx.stroke();

      // sinais mais densos (mesmo tamanho variável, traço 30% mais fino via drawSignGlyph)
      const avgAbsOuter = m.outer.reduce((s, nd) => s + Math.abs(nd.q), 0) / Math.max(1, m.outer.length);
      const outerStep = Math.max(1, Math.floor(m.outer.length / 48));
      for (let k = 0; k < m.outer.length; k += outerStep) {
        const nd = m.outer[k];
        const sgn = Math.sign(nd.q) as 1 | -1 | 0;
        if (sgn === 0) continue;
        const ps = w2s(nd.x, nd.y);
        const mag = Math.abs(nd.q);
        if (mag < 0.18 * avgAbsOuter) continue;
        const size = Math.max(3, 5.0 * zoomScale * (0.85 + 0.6 * (mag / (avgAbsOuter + 1e-12))));
        drawSignGlyph(ctx, ps.x, ps.y, size, sgn > 0 ? +1 : -1);
      }

      if (Math.abs(m.Qin) > 1e-9) {
        const avgAbsInner = m.inner.reduce((s, nd) => s + Math.abs(nd.q), 0) / Math.max(1, m.inner.length);
        const innerStep = Math.max(1, Math.floor(m.inner.length / 40));
        for (let k = 0; k < m.inner.length; k += innerStep) {
          const nd = m.inner[k];
          const sgn = Math.sign(nd.q) as 1 | -1 | 0;
          if (sgn === 0) continue;
          const ps = w2s(nd.x, nd.y);
          const mag = Math.abs(nd.q);
          if (mag < 0.18 * avgAbsInner) continue;
          const size = Math.max(3, 4.6 * zoomScale * (0.85 + 0.6 * (mag / (avgAbsInner + 1e-12))));
          drawSignGlyph(ctx, ps.x, ps.y, size, sgn > 0 ? +1 : -1);
        }
      }

      // guia e pino
      const h = { x: Cs.x + Ro, y: Cs.y };
      const handleR = Math.max(4, 6 * zoomScale);
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Cs.x, Cs.y, Ro, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = hoverRadiusHandle && hoverRadiusHandle.id === m.id ? "#ffffff" : "#e5e7eb";
      ctx.beginPath(); ctx.arc(h.x, h.y, handleR, 0, Math.PI * 2); ctx.fill();

      // mostrador do raio
      ctx.fillStyle = "#e5e7eb";
      ctx.font = `${Math.max(10, 11.5 * zoomScale)}px ui-sans-serif`;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(`R=${m.Ro.toFixed(2)}`, h.x + 8, h.y);

      ctx.restore();
    }

    // PROBES: partícula + vetor Fe (25% maior) + label em negrito
    for (const p of probes) {
      const ps = w2s(p.x, p.y);
      const r = Math.max(4, Math.min(10, 6 * zoomScale));
      ctx.save();
      ctx.fillStyle = p.sign > 0 ? THEME.chargePlus : THEME.chargeMinus;
      ctx.beginPath(); ctx.arc(ps.x, ps.y, r, 0, Math.PI * 2); ctx.fill();

      const { Ex, Ey } = fieldAtPoint(p.x, p.y, charges, plates, condMeshes);
      let mag = Math.hypot(Ex, Ey);
      if (mag > 1e-9) {
        const dirx = (Ex / mag) * p.sign;
        const diry = (Ey / mag) * p.sign;

        const floorF = 0.45, ceilF = 1.0, gainF = 18;
        const scale = floorF + (mag * gainF) / (1 + mag * gainF) * (ceilF - floorF);
        const Lpx = 1.8 * Math.max(26, 54 * zoomScale) * scale; // Aumentado para 1.8 (mais 20% = 44% total)

        const toW = (() => {
          const Lw = Lpx / pxPerUnit; const p0 = { x: p.x, y: p.y }; const p1 = { x: p.x + dirx * Lw, y: p.y + diry * Lw };
          const hit = firstIntersectionWithAnyConductor(p0, p1, condMeshes);
          if (!hit.hit) return p1; const epsW = 1.0 / pxPerUnit; const vx = hit.point.x - p0.x, vy = hit.point.y - p0.y; const vlen = Math.hypot(vx, vy) || 1; const t = Math.max(0, (vlen - epsW) / (Lw || 1)); return { x: p0.x + dirx * Lw * t, y: p0.y + diry * Lw * t };
        })();
        const toS = w2s(toW.x, toW.y);
        const color = p.sign > 0 ? THEME.chargePlus : THEME.chargeMinus;
        drawArrow(ctx, { x: ps.x, y: ps.y }, { x: toS.x, y: toS.y }, color, 2.6 * zoomScale, 9.5 * zoomScale);

        // label "Fe" em negrito, 20% maior, posicionado acima do meio do vetor
        const vx = toS.x - ps.x;
        const vy = toS.y - ps.y;
        const vlen = Math.hypot(vx, vy) || 1;
        const normalX = -vy / vlen; // Normal perpendicular ao vetor
        const normalY = vx / vlen;
        const offset = 12 * zoomScale; // Deslocamento perpendicular
        const mid = { 
          x: (ps.x + toS.x) / 2 + normalX * offset, 
          y: (ps.y + toS.y) / 2 + normalY * offset 
        };
        ctx.fillStyle = color;
        ctx.font = `700 ${Math.max(11, 1.44 * 13 * zoomScale)}px ui-sans-serif`; // 1.2 * 1.2 = 1.44 (mais 20%)
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("Fe", mid.x, mid.y);
      }
      ctx.restore();
    }
  }, [size, pxPerUnit, center, density, charges, plates, probes, conductors, condMeshes, showResultant, showIndividuals, showLines, zoomScale, hoverRadiusHandle, showPotential, showEquip, isRealVectors]);

  return (
    <div className="w-screen h-screen flex flex-col lg:grid lg:grid-cols-[1fr_22rem] gap-2 p-2 bg-[#0a0e13] text-slate-200 select-none overflow-hidden">
      {/* Área do canvas */}
      <div className="relative flex-1 rounded-2xl ring-1 ring-slate-800 shadow-lg overflow-hidden min-h-[50vh]">
        <canvas
          ref={canvasRef}
          className="block w-full h-full cursor-grab active:cursor-grabbing touch-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
      </div>

      {/* Painel lateral / Inferior */}
      <div className="w-full lg:w-[22rem] h-auto lg:h-full flex flex-col gap-3 overflow-y-auto pb-4 lg:pb-0">
        <div className="rounded-2xl p-3 bg-[#0f1520] ring-1 ring-slate-800 shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Campo</h3>
            <div className="flex gap-2">
              <button onClick={handleReset} className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">Reset</button>
              <div className="relative group">
                <button 
                  onClick={() => setIsRealVectors(!isRealVectors)} 
                  className="px-2 py-1 rounded-lg bg-blue-700 hover:bg-blue-600 text-sm whitespace-nowrap"
                >
                  {isRealVectors ? 'Selecionar vetores didáticos' : 'Selecionar vetores realistas'}
                </button>
                <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
                  <div>
                    {isRealVectors 
                      ? 'Vetor didático tem módulo ilustrativo para fins didáticos.' 
                      : 'Vetor realista tem módulo compatível à Lei de Coulomb.'
                    }
                  </div>
                  <div className="absolute top-full right-4 border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showResultant} onChange={(e) => setShowResultant(e.currentTarget.checked)} />
              Campo resultante
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showIndividuals} onChange={(e) => setShowIndividuals(e.currentTarget.checked)} />
              Campos individuais
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.currentTarget.checked)} />
              Linhas de campo
            </label>

            <div className="mt-1 pt-2 border-t border-slate-800/60" />

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showPotential}
                onChange={(e) => setShowPotential(e.currentTarget.checked)}
              />
              Potencial elétrico
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showEquip}
                onChange={(e) => setShowEquip(e.currentTarget.checked)}
              />
              Equipotenciais
            </label>
          </div>

          <div className="mt-3">
            <label className="text-sm">Densidade de setas e linhas</label>
            <input className="w-full" type="range" min={26} max={90} step={2} value={density} onChange={(e) => setDensity(parseInt(e.currentTarget.value))} />
          </div>
          <div className="mt-2">
            <label className="text-sm">Zoom (px/unid): <span className="opacity-80">{Math.round(pxPerUnit)}</span></label>
            <input className="w-full" type="range" min={20} max={320} step={2} value={pxPerUnit} onChange={(e) => setPxPerUnit(parseInt(e.currentTarget.value))} />
          </div>
        </div>

        {/* Paleta */}
        <div className={`rounded-2xl p-3 ring-1 shadow transition-all duration-200 ${isHoveringTrashArea ? 'bg-red-800/40 ring-red-400 ring-2 shadow-red-500/20 shadow-lg' : (dragChargeId != null || dragProbeId != null || (dragPlate?.mode === 'move') || (dragCond?.mode === 'move')) ? 'bg-red-900/20 ring-red-500/50' : 'bg-[#0f1520] ring-slate-800'}`}>
          <div className={`text-sm mb-2 transition-all duration-200 flex items-center gap-2 ${isHoveringTrashArea ? 'opacity-100 text-red-200 font-semibold scale-105' : (dragChargeId != null || dragProbeId != null || (dragPlate?.mode === 'move') || (dragCond?.mode === 'move')) ? 'opacity-100 text-red-300' : 'opacity-75'}`}>
            {isHoveringTrashArea && <span className="text-lg">🗑️</span>}
            {isHoveringTrashArea ? 'Solte para DESCARTAR' : 'Arraste para o plano:'}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <ChargeButton sign={1} onPointerDown={() => setDragFromPalette({ kind: "charge", sign: +1 })} onPointerUp={() => { }} />
            <ChargeButton sign={-1} onPointerDown={() => setDragFromPalette({ kind: "charge", sign: -1 })} onPointerUp={() => { }} />

            <PlateButton sign={1} onPointerDown={() => setDragFromPalette({ kind: "plate", sign: +1 })} onPointerUp={() => { }} />
            <PlateButton sign={-1} onPointerDown={() => setDragFromPalette({ kind: "plate", sign: -1 })} onPointerUp={() => { }} />

            <ConductorButton onPointerDown={() => setDragFromPalette({ kind: "cond" })} onPointerUp={() => { }} />

            <ProbeButton sign={1} onPointerDown={() => setDragFromPalette({ kind: "probe", sign: +1 })} onPointerUp={() => { }} />
            <ProbeButton sign={-1} onPointerDown={() => setDragFromPalette({ kind: "probe", sign: -1 })} onPointerUp={() => { }} />
          </div>
          <div className="text-xs mt-2 opacity-70">
            {isHoveringTrashArea ? (
              <span className="text-red-200 font-semibold animate-pulse">🗑️ ZONA DE DESCARTE ATIVA - Solte para remover</span>
            ) : (dragChargeId != null || dragProbeId != null || (dragPlate?.mode === 'move') || (dragCond?.mode === 'move')) ? (
              <span className="text-red-300 font-medium">⚠️ Arraste até aqui e solte para REMOVER</span>
            ) : (
              <>* Solte dentro do plano para criar o objeto. Placas: arraste a ponta para rotacionar/ajustar altura.
              Condutor: arraste o anel/centro para mover e o ponto à direita para ajustar o raio (segure Shift para passos finos). Carga de Prova: arraste para ver a força <b>Fe</b>.</>
            )}
          </div>
        </div>
      </div>

      {ghost.active && ghost.kind === "charge" && (
        <div className="fixed pointer-events-none z-[60]" style={{ left: (ghost as any).sx - 24, top: (ghost as any).sy - 24 }}>
          <GhostCharge sign={(ghost as any).sign} size={48} />
        </div>
      )}
      {ghost.active && ghost.kind === "plate" && (
        <div className="fixed pointer-events-none z-[60]" style={{ left: (ghost as any).sx - 32, top: (ghost as any).sy - 32 }}>
          <GhostPlate sign={(ghost as any).sign} size={64} />
        </div>
      )}
      {ghost.active && ghost.kind === "cond" && (
        <div className="fixed pointer-events-none z-[60]" style={{ left: (ghost as any).sx - 28, top: (ghost as any).sy - 28 }}>
          <GhostConductor size={56} />
        </div>
      )}
      {ghost.active && ghost.kind === "probe" && (
        <div className="fixed pointer-events-none z-[60]" style={{ left: (ghost as any).sx - 20, top: (ghost as any).sy - 20 }}>
          <GhostProbe sign={(ghost as any).sign} size={40} />
        </div>
      )}
    </div>
  );
}