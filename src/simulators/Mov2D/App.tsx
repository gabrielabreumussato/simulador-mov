import React, { useEffect, useMemo, useRef, useState } from "react";
import { create, all } from "mathjs";

// ==== Paleta ====
const COLORS = {
  bg: "#0b0f14", grid: "#1b2430", axes: "#4a6078",
  point: "#a78bfa", r: "#60a5fa", v: "#fb923c", a: "#34d399",
  ink: "#cbd5e1",
};

// ==== Normalização de expressão (garante ^ como potência) ====
function preprocessExpr(s: string) {
  if (!s) return s;
  let out = s.replace(/ˆ/g, '^').replace(/\*\*/g, '^');
  const map: Record<string,string> = { '⁰':'^0','¹':'^1','²':'^2','³':'^3','⁴':'^4','⁵':'^5','⁶':'^6','⁷':'^7','⁸':'^8','⁹':'^9' };
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (m)=> map[m] || m);
  return out;
}

// ==== Tipos ====
type Sample = { t:number; x:number; y:number; vx:number; vy:number; ax:number; ay:number };
type Axis = "x" | "y";
type ChartKey = 'pos' | 'vel' | 'acc';

// ==== Funções matemáticas com derivadas simbólicas + fallback ====
function useCompiledAndDerivs(math: any, expr: string, fallback: string) {
  return useMemo(() => {
    const code = preprocessExpr(expr.trim() === "" ? fallback : expr);

    let fCompiled: any;
    try { fCompiled = math.compile(code); } catch { fCompiled = math.compile(fallback); }

    let vCompiled: any = null, aCompiled: any = null;
    try { vCompiled = math.compile(math.derivative(code, "t").toString()); } catch {}
    try { if (vCompiled) aCompiled = math.compile(math.derivative(math.derivative(code, "t"), "t").toString()); } catch {}

    const h = 1e-3;
    const f = (t:number) => { try { return Number(fCompiled.evaluate({t})); } catch { return Number(math.compile(fallback).evaluate({t})); } };
    const vNum = (t:number) => (f(t+h)-f(t-h))/(2*h);
    const aNum = (t:number) => (f(t+h)-2*f(t)+f(t-h))/(h*h);

    const v = (t:number) => { try { const val = Number(vCompiled?.evaluate?.({t})); if (Number.isFinite(val)) return val; } catch {} return vNum(t); };
    const a = (t:number) => { try { const val = Number(aCompiled?.evaluate?.({t})); if (Number.isFinite(val)) return val; } catch {} return aNum(t); };
    return { f, v, a };
  }, [math, expr, fallback]);
}

// ==== Transformações mundo/tela com centro deslocável ====
function worldToScreen(width: number, height: number, px: number, center = {x:0,y:0}) {
  const cx = width / 2 - center.x * px;
  const cy = height / 2 + center.y * px;
  return (x: number, y: number) => ({ x: cx + x * px, y: cy - y * px });
}
function screenToWorld(width: number, height: number, px: number, center = {x:0,y:0}) {
  const cx = width / 2 - center.x * px;
  const cy = height / 2 + center.y * px;
  return (sx: number, sy: number) => ({ x: (sx - cx) / px, y: (cy - sy) / px });
}

// ==== Grade ====
function drawGrid(
  ctx: CanvasRenderingContext2D, width: number, height: number, px: number, center = {x:0, y:0}
) {
  ctx.save();
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const w2s = worldToScreen(width, height, px, center);
  const left = -width / (2 * px) + center.x, right = width / (2 * px) + center.x;
  const bottom = -height / (2 * px) + center.y, top = height / (2 * px) + center.y;

  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.floor(left); x <= Math.ceil(right); x++) {
    const p0 = w2s(x, bottom), p1 = w2s(x, top);
    ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
  }
  for (let y = Math.floor(bottom); y <= Math.ceil(top); y++) {
    const p0 = w2s(left, y), p1 = w2s(right, y);
    ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();

  // eixos mais espessos e claros
  ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 3; ctx.beginPath();
  const x0 = w2s(0, bottom), x1 = w2s(0, top);
  const y0 = w2s(left, 0), y1 = w2s(right, 0);
  ctx.moveTo(x0.x, x0.y); ctx.lineTo(x1.x, x1.y);
  ctx.moveTo(y0.x, y0.y); ctx.lineTo(y1.x, y1.y);
  ctx.stroke();
  ctx.restore();
}

// ==== Setas com ponta triangular (base reta) ====
function drawTriArrow(
  ctx: CanvasRenderingContext2D,
  from: {x:number;y:number}, to: {x:number;y:number},
  color: string, width = 3.5, head = 16
) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;

  const ux = dx / len, uy = dy / len;          // direção
  const bx = -uy, by = ux;                     // normal da base

  const baseX = to.x - ux * head;              // base do triângulo
  const baseY = to.y - uy * head;
  const half = head * 0.6;                     // meia-largura da base

  const L = { x: baseX + bx * half, y: baseY + by * half };
  const R = { x: baseX - bx * half, y: baseY - by * half };

  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";

  // haste vai até a base do triângulo (evita sobrepor a ponta)
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(baseX, baseY); ctx.stroke();

  // triângulo
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(L.x, L.y);
  ctx.lineTo(R.x, R.y);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ==== Buffer de amostras ====
function useSampleBuffer() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const push = (s: Sample) => setSamples(prev => {
    const next = [...prev, s];
    if (next.length > 8000) next.splice(0, next.length - 8000);
    return next;
  });
  const clear = () => setSamples([]);
  return { samples, push, clear };
}

// ==== Desenho de séries temporais ====
function drawTimeseries(
  canvas: HTMLCanvasElement,
  series: { label: string; color?: string; values: (s: Sample)=>number }[],
  samples: Sample[],
  tNow: number,
  windowSec: number,
  yLabel: string = "y",
  xLabel: string = "t",
  opts: {
    manualCenter?: number | null;
    manualRange?: number | null;
    drawZero?: boolean;
    autoScale?: boolean;            // default true
    cartesianAxes?: boolean;        // desenhar eixos em 0 (t e valor)
  } = {},
  domainFixed?: number | null,
  usedRangeRef?: { current: number }
) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const pxW = Math.max(200, Math.floor(rect.width * dpr));
  const pxH = Math.max(120, Math.floor(rect.height * dpr));
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.fillStyle = "#0c1117"; ctx.fillRect(0, 0, W, H);

  const fixedDomain = domainFixed != null;
  const tMin = fixedDomain ? 0 : Math.max(0, tNow - windowSec);
  const tMax = fixedDomain ? (domainFixed as number) : tNow;
  const tClipMax = fixedDomain ? Math.min(tNow, tMax) : tMax;
  const inWindow = samples.filter(s => s.t >= tMin && s.t <= tClipMax);
  if (inWindow.length < 2) return;

  let vMin = +Infinity, vMax = -Infinity;
  for (const s of inWindow) {
    for (const sr of series) {
      const v = sr.values(s);
      if (!Number.isFinite(v)) continue;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }
  if (vMin === vMax) { vMin -= 1; vMax += 1; }

  const auto = opts.autoScale !== false;
  const manualCenter = opts.manualCenter ?? 0;
  let center = (vMin + vMax) / 2 + manualCenter; // deslocamento manual atua como offset
  let range = (vMax - vMin) || 1;

  if (!auto) {
    if (opts.manualRange != null && Number.isFinite(opts.manualRange)) range = Math.max(opts.manualRange, 1e-9);
    if (opts.manualCenter != null && Number.isFinite(opts.manualCenter)) center = opts.manualCenter;
  }

  let vMinPlot = center - range/2;
  let vMaxPlot = center + range/2;
  // Em modo cartesiano, garantir que 0 esteja sempre visível
  if (opts.cartesianAxes) {
    vMinPlot = Math.min(vMinPlot, 0);
    vMaxPlot = Math.max(vMaxPlot, 0);
  }

  usedRangeRef && (usedRangeRef.current = (vMaxPlot - vMinPlot));

  // Eixos
  ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (opts.cartesianAxes) {
    if (0 >= tMin && 0 <= tMax) {
      const x0 = 40 + ((0 - tMin) / (tMax - tMin)) * (W - 50);
      ctx.moveTo(x0, 10); ctx.lineTo(x0, H-24);
    }
    if (0 >= vMinPlot && 0 <= vMaxPlot) {
      const y0 = (H-24) - ((0 - vMinPlot) / (vMaxPlot - vMinPlot)) * (H - 34);
      ctx.moveTo(40, y0); ctx.lineTo(W-10, y0);
    }
  } else {
    ctx.moveTo(40, 10); ctx.lineTo(40, H-24); // y
    ctx.moveTo(40, H-24); ctx.lineTo(W-10, H-24); // x
  }
  ctx.stroke();

  // Rótulos de eixos
  ctx.fillStyle = COLORS.ink; ctx.font = "12px ui-sans-serif, system-ui";
  let tx = W - 16; let ty = H - 8; // t sempre embaixo
  if (opts.cartesianAxes) {
    const y0 = (H-24) - ((0 - vMinPlot) / (vMaxPlot - vMinPlot)) * (H - 34);
    ty = Math.max(12, Math.min(H - 6, y0 + 14));
  }
  ctx.fillText(xLabel, tx, ty);
  ctx.save(); ctx.translate(12, 18); ctx.rotate(-Math.PI/2); ctx.fillText(yLabel, 0, 0); ctx.restore();

  const xMap = (t:number)=> 40 + ( (t - tMin) / (tMax - tMin) ) * (W - 50);
  const yMap = (v:number)=> (H-24) - ( (v - vMinPlot) / (vMaxPlot - vMinPlot) ) * (H - 34);

  for (const sr of series) {
    ctx.strokeStyle = sr.color || "#93c5fd";
    ctx.lineWidth = 2; ctx.beginPath();
    let first = true;
    for (const s of inWindow) {
      const x = xMap(s.t), y = yMap(sr.values(s));
      if (first) { ctx.moveTo(x, y); first = false; } else { ctx.lineTo(x, y); }
    }
    ctx.stroke();

    // marcador
    const last = inWindow[inWindow.length-1];
    const mx = xMap(last.t), my = yMap(sr.values(last));
    ctx.fillStyle = sr.color || "#93c5fd"; ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI*2); ctx.fill();
  }
}

// ==== Painel de gráficos ====
function ChartsPanel({
  open,
  axis,
  setAxis,
  samples,
  t,
  windowSec,
  onChangeWindowSec,
  fixed,
  onToggleFixed,
  tTotal,
  onChangeTTotal,
  fixedRanges,
}: {
  open:boolean; axis:Axis; setAxis:(a:Axis)=>void; samples: Sample[]; t:number; windowSec:number; onChangeWindowSec:(w:number)=>void; fixed:boolean; onToggleFixed:(f:boolean)=>void; tTotal:number; onChangeTTotal:(n:number)=>void; fixedRanges: { pos:{min:number,max:number}; vel:{min:number,max:number}; acc:{min:number,max:number} };
}) {
  const refPos = useRef<HTMLCanvasElement>(null);
  const refVel = useRef<HTMLCanvasElement>(null);
  const refAcc = useRef<HTMLCanvasElement>(null);

  const domainFixed = fixed ? tTotal : null;

  const rngPos = useRef(1); const rngVel = useRef(1); const rngAcc = useRef(1);

  // pan vertical por gráfico (quando auto-escala desligada)
  const autoScale = !fixed;
  const [center, setCenter] = useState<Record<ChartKey, number>>({ pos:0, vel:0, acc:0 });
  const [range, setRange] = useState<Record<ChartKey, number | null>>({ pos:null, vel:null, acc:null });

  const drag = useRef<{ key: ChartKey | null; startY: number; startCenter: number }>({ key:null, startY:0, startCenter:0 });
  const onDown = (key: ChartKey) => (e: React.MouseEvent<HTMLCanvasElement>) => { drag.current = { key, startY: e.clientY, startCenter: center[key] || 0 }; };
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag.current.key) return;
    const key = drag.current.key;
    const el = key==='pos' ? refPos.current : key==='vel' ? refVel.current : refAcc.current;
    if (!el) return;
    const H = el.getBoundingClientRect().height || 120;
    const plotH = Math.max(40, H - 34);
    const usedRange = (key==='pos'?rngPos: key==='vel'?rngVel:rngAcc).current;
    const pixels = e.clientY - drag.current.startY;
    const deltaVal = pixels * usedRange / plotH;
    setCenter(prev => ({ ...prev, [key]: drag.current.startCenter + deltaVal }));
  };
  const endDrag = () => { drag.current.key = null; };
  const dbl = (key: ChartKey) => () => setCenter(prev => ({ ...prev, [key]: 0 }));

  useEffect(() => {
    if (!open) return;
    const commonOptsAuto = (ctr:number, rng:number|null) => ({ manualCenter: ctr, manualRange: rng ?? undefined, drawZero: false, autoScale, cartesianAxes: autoScale as boolean });

    const fixedOptsPos = {
      manualCenter: (fixedRanges.pos.min + fixedRanges.pos.max)/2,
      manualRange: Math.max(fixedRanges.pos.max - fixedRanges.pos.min, 1e-9),
      drawZero:false, autoScale:false, cartesianAxes:true
    };
    const fixedOptsVel = {
      manualCenter: (fixedRanges.vel.min + fixedRanges.vel.max)/2,
      manualRange: Math.max(fixedRanges.vel.max - fixedRanges.vel.min, 1e-9),
      drawZero:false, autoScale:false, cartesianAxes:true
    };
    const fixedOptsAcc = {
      manualCenter: (fixedRanges.acc.min + fixedRanges.acc.max)/2,
      manualRange: Math.max(fixedRanges.acc.max - fixedRanges.acc.min, 1e-9),
      drawZero:false, autoScale:false, cartesianAxes:true
    };

    const optsPos = fixed ? fixedOptsPos : commonOptsAuto(center.pos, range.pos);
    const optsVel = fixed ? fixedOptsVel : commonOptsAuto(center.vel, range.vel);
    const optsAcc = fixed ? fixedOptsAcc : commonOptsAuto(center.acc, range.acc);

    if (axis === "x") {
      if (refPos.current) drawTimeseries(refPos.current, [ { label: "x(t)", color: "#60a5fa", values: s=>s.x } ], samples, t, windowSec, "x", "t", optsPos, domainFixed, rngPos);
      if (refVel.current) drawTimeseries(refVel.current, [ { label: "vx(t)", color: "#fb923c", values: s=>s.vx } ], samples, t, windowSec, "vx", "t", optsVel, domainFixed, rngVel);
      if (refAcc.current) drawTimeseries(refAcc.current, [ { label: "ax(t)", color: "#34d399", values: s=>s.ax } ], samples, t, windowSec, "ax", "t", optsAcc, domainFixed, rngAcc);
    } else {
      if (refPos.current) drawTimeseries(refPos.current, [ { label: "y(t)", color: "#a78bfa", values: s=>s.y } ], samples, t, windowSec, "y", "t", optsPos, domainFixed, rngPos);
      if (refVel.current) drawTimeseries(refVel.current, [ { label: "vy(t)", color: "#f59e0b", values: s=>s.vy } ], samples, t, windowSec, "vy", "t", optsVel, domainFixed, rngVel);
      if (refAcc.current) drawTimeseries(refAcc.current, [ { label: "ay(t)", color: "#10b981", values: s=>s.ay } ], samples, t, windowSec, "ay", "t", optsAcc, domainFixed, rngAcc);
    }
  }, [open, axis, samples, t, windowSec, autoScale, center, range, fixed, tTotal, fixedRanges]);

  return (
    <div className={`absolute inset-y-0 left-0 w-[22rem] p-2 pl-3 flex flex-col h-full min-h-0 bg-[#0b1114]/95 backdrop-blur-sm ring-1 ring-slate-800 shadow-2xl z-20 transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"}`}>
      {/* Cabeçalho: eixo + modo (auto/fixo) */}
      <div className="flex items-center gap-2 mb-1 flex-wrap shrink-0">
        <span className="text-sm opacity-80">Eixo:</span>
        <button onClick={()=>setAxis("x")} className={`px-2 py-1 rounded-lg text-sm ring-1 ring-slate-700 ${axis==="x"?"bg-indigo-600":"bg-[#0e1520] hover:bg-[#111b2a]"}`}>x</button>
        <button onClick={()=>setAxis("y")} className={`px-2 py-1 rounded-lg text-sm ring-1 ring-slate-700 ${axis==="y"?"bg-indigo-600":"bg-[#0e1520] hover:bg-[#111b2a]"}`}>y</button>

        {/* Seleção de modo sempre no mesmo lugar */}
        <div className="ml-auto flex items-center gap-4">
          <label className="text-sm flex items-center gap-2 select-none">
            <input type="radio" checked={!fixed} onChange={()=>onToggleFixed(false)} />
            Auto-escala
          </label>
          <label className="text-sm flex items-center gap-2 select-none">
            <input type="radio" checked={fixed} onChange={()=>onToggleFixed(true)} />
            Eixo Fixo
          </label>
        </div>
      </div>

      {/* Linha de controles dependentes do modo (mostra um OU outro) */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        {!fixed ? (
          <>
            <span className="text-sm">Intervalo de tempo (s)</span>
            <input type="range" min={5} max={60} step={1} value={windowSec} onChange={(e)=>onChangeWindowSec(parseFloat((e.target as HTMLInputElement).value))} />
            <span className="tabular-nums w-8 text-right">{windowSec}</span>
          </>
        ) : (
          <>
            <span className="text-sm">Tempo total (s)</span>
            <input type="number" min={5} max={30} step={1} value={tTotal} onChange={(e)=>onChangeTTotal(Math.max(5, Math.min(30, parseFloat((e.target as HTMLInputElement).value) || 5)))} className="w-20 px-2 py-1 rounded bg-[#0b111a] ring-1 ring-slate-800" />
          </>
      )}
      </div>
{/* Três gráficos empilhados */}
      <div className="flex-1 min-h-0 grid grid-rows-3 gap-1 overflow-hidden">
        <div className="rounded-xl p-1 bg-[#0e1520] ring-1 ring-slate-800">
          <canvas ref={refPos} className="w-full h-full min-h-[84px] cursor-ns-resize"
            onMouseDown={onDown('pos')} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag} onDoubleClick={dbl('pos')} />
        </div>
        <div className="rounded-xl p-1 bg-[#0e1520] ring-1 ring-slate-800">
          <canvas ref={refVel} className="w-full h-full min-h-[84px] cursor-ns-resize"
            onMouseDown={onDown('vel')} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag} onDoubleClick={dbl('vel')} />
        </div>
        <div className="rounded-xl p-1 bg-[#0e1520] ring-1 ring-slate-800">
          <canvas ref={refAcc} className="w-full h-full min-h-[84px] cursor-ns-resize"
            onMouseDown={onDown('acc')} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag} onDoubleClick={dbl('acc')} />
        </div>
      </div>
    </div>
  );
}

// ==== Painel de Exemplos ====
function ExamplesPanel({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (x: string, y: string) => void }) {
  const items = [
    { key: 'mru', label: 'MRU', x: '1.5*t', y: '0', desc: 'x=1.5t, y=0' },
    { key: 'mruv', label: 'MRUV', x: '0.5*t + 0.15*t^2', y: '0', desc: 'x=0.5t+0.15t^2, y=0' },
    { key: 'arranque', label: 'Arranque constante', x: '0.1*t^3', y: '0', desc: 'x=0.1t^3, y=0' },
    { key: 'queda', label: 'Queda Livre', x: '0', y: '5 - 4.9*t^2', desc: 'x=0, y=5-4.9t^2' },
    { key: 'lanv', label: 'Lançamento Vertical', x: '0', y: '10*t - 4.9*t^2', desc: 'x=0, y=10t-4.9t^2' },
    { key: 'lanh', label: 'Lançamento Horizontal', x: '3*t', y: '5 - 4.9*t^2', desc: 'x=3t, y=5-4.9t^2' },
    { key: 'lanob', label: 'Lançamento Oblíquo', x: '3*cos(pi/4)*t', y: '3*sin(pi/4)*t - 4.9*t^2', desc: 'v0=3, θ=45°' },
    { key: 'mcu', label: 'MCU', x: '2*cos(1*t)', y: '2*sin(1*t)', desc: 'raio=2, ω=1' },
    { key: 'eliptico', label: 'Elíptico', x: '2*cos(0.6*t)', y: '1.2*sin(0.6*t)', desc: 'x=2cos(0.6t), y=1.2sin(0.6t)' },
    { key: 'mhs', label: 'MHS', x: '2*cos(1.2*t)', y: '0', desc: 'x=2cos(1.2t), y=0' },
    { key: 'amort', label: 'Oscilação Amortecida', x: '2*exp(-0.15*t)*cos(1.5*t)', y: '0', desc: 'x=2*exp(-0.15t)*cos(1.5t), y=0' },
    { key: 'forcada', label: 'Oscilação Forçada', x: 'exp(-0.1*t)*cos(1.2*t) + 0.8*cos(1.6*t)', y: '0', desc: 'x=exp(-0.1t)*cos(1.2t)+0.8*cos(1.6t), y=0' }
  ];
  return (
    <div
      className={`pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 transition-all duration-300 ease-in-out ${open ? 'translate-y-0 opacity-100' : '-translate-y-[120%] opacity-0'}`}
    >
      <div className="pointer-events-auto w-[42rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-[#0f1520] ring-1 ring-slate-800 shadow-2xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold">Exemplos</h3>
          <button onClick={onClose} className="px-2 py-1 rounded-lg text-sm bg-slate-700 hover:bg-slate-600">Fechar</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => onPick(it.x, it.y)}
              className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800 hover:ring-indigo-500 text-left transition-shadow w-full">
              <div className="font-medium">{it.label}</div>
              <div className="text-[11px] opacity-80 mt-1 leading-snug break-words"><code className="break-all">{it.desc}</code></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==== App ====
export default function App() {
  const math = useMemo(() => create(all, {}), []);

  // ---- UI state ----
  const [exprX, setExprX] = useState("2*cos(0.6*t)");
  const [exprY, setExprY] = useState("1.2*sin(0.6*t)");
  const [draftX, setDraftX] = useState(exprX);
  const [draftY, setDraftY] = useState(exprY);
  const [errX, setErrX] = useState<string | null>(null);
  const [errY, setErrY] = useState<string | null>(null);

  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [pxPerUnit, setPxPerUnit] = useState(80);
  const [center, setCenter] = useState<{x:number;y:number}>({x:0, y:0});
  const [showR, setShowR] = useState(true);
  const [showV, setShowV] = useState(true);
  const [showA, setShowA] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [scaleV, setScaleV] = useState(1);
  const [scaleA, setScaleA] = useState(0.5);
  const [showCharts, setShowCharts] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [windowSec, setWindowSec] = useState(10);
  const [axis, setAxis] = useState<Axis>("x");
  const [fixedCharts, setFixedCharts] = useState(false);
  const [tTotal, setTTotal] = useState(10);
  const [stopAtTTotal, setStopAtTTotal] = useState(false);
  useEffect(()=>{ setStopAtTTotal(fixedCharts); }, [fixedCharts]);

  const { samples, push, clear } = useSampleBuffer();

  const X = useCompiledAndDerivs(math, exprX, "2*cos(0.6*t)");
  const Y = useCompiledAndDerivs(math, exprY, "1.2*sin(0.6*t)");

  // === Faixas fixas por série (pos/vel/acc) e por eixo (x/y) ===
  function computeRangeForSeries(axisKey: Axis, key: ChartKey, T: number) {
    const N = Math.max(120, Math.floor(T*60));
    let vMin = Number.POSITIVE_INFINITY;
    let vMax = Number.NEGATIVE_INFINITY;
    for (let i=0; i<=N; i++) {
      const tt = (i/N)*T;
      let val = 0;
      if (axisKey === 'x') {
        val = key==='pos' ? X.f(tt) : key==='vel' ? X.v(tt) : X.a(tt);
      } else {
        val = key==='pos' ? Y.f(tt) : key==='vel' ? Y.v(tt) : Y.a(tt);
      }
      if (Number.isFinite(val)) {
        if (val < vMin) vMin = val;
        if (val > vMax) vMax = val;
      }
    }
    if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) { vMin = -1; vMax = 1; }
    // garantir que o 0 esteja visível
    vMin = Math.min(vMin, 0);
    vMax = Math.max(vMax, 0);
    if (vMin === vMax) { vMin -= 1; vMax += 1; }
    return { min: vMin, max: vMax };
  }

  const [rangesByAxis, setRangesByAxis] = useState<{
    x: { pos:{min:number,max:number}; vel:{min:number,max:number}; acc:{min:number,max:number} };
    y: { pos:{min:number,max:number}; vel:{min:number,max:number}; acc:{min:number,max:number} };
  }>(()=>({ x:{ pos:{min:-2,max:2}, vel:{min:-2,max:2}, acc:{min:-2,max:2} }, y:{ pos:{min:-2,max:2}, vel:{min:-2,max:2}, acc:{min:-2,max:2} } }));

  // quando modo fixo ou T_total/expressões mudarem, recalculamos ranges para x e y, por série
  useEffect(() => {
    if (!fixedCharts) return;
    const T = Math.max(5, Math.min(30, tTotal));
    if (T !== tTotal) setTTotal(T);
    const xPos = computeRangeForSeries('x', 'pos', T);
    const xVel = computeRangeForSeries('x', 'vel', T);
    const xAcc = computeRangeForSeries('x', 'acc', T);
    const yPos = computeRangeForSeries('y', 'pos', T);
    const yVel = computeRangeForSeries('y', 'vel', T);
    const yAcc = computeRangeForSeries('y', 'acc', T);
    setRangesByAxis({ x:{ pos:xPos, vel:xVel, acc:xAcc }, y:{ pos:yPos, vel:yVel, acc:yAcc } });
  }, [fixedCharts, tTotal, exprX, exprY]);

  // debounce/validação (evita site cair ao digitar)
  useEffect(() => {
    const id = setTimeout(() => {
      try { create(all, {}).compile(preprocessExpr(draftX || "2*cos(0.6*t)")); setErrX(null); setExprX(draftX || "2*cos(0.6*t)"); }
      catch { setErrX("expressão inválida"); }
      try { create(all, {}).compile(preprocessExpr(draftY || "1.2*sin(0.6*t)")); setErrY(null); setExprY(draftY || "1.2*sin(0.6*t)"); }
      catch { setErrY("expressão inválida"); }
    }, 250);
    return () => clearTimeout(id);
  }, [draftX, draftY]);

  // reset imediato ao começar a digitar/selecionar (evita "rastro" da função anterior)
  useEffect(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setPlaying(false);
    tRef.current = 0; setT(0); setTrail([]); clear();
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.width / dpr;
        const H = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }, [draftX, draftY]);

  // reset quando muda função
  useEffect(() => { 
    tRef.current = 0; setT(0); setTrail([]); clear(); 
    setPlaying(false);
    const p0 = { x: X.f(0), y: Y.f(0) }; setCenter(p0); 
  }, [exprX, exprY, X, Y]);

  const r = (tt:number)=>({ x: X.f(tt), y: Y.f(tt) });
  const vFun = (tt:number)=>({ x: X.v(tt), y: Y.v(tt) });
  const aFun = (tt:number)=>({ x: X.a(tt), y: Y.a(tt) });

  // resize
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 960, h: 560 });
  useEffect(() => {
    const onResize = () => {
      const parent = canvasRef.current?.parentElement; if (!parent) return;
      const rect = parent.getBoundingClientRect();
      setSize({ w: Math.max(760, Math.floor(rect.width)), h: Math.max(460, Math.floor(rect.height) - 12) });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // animação + amostragem
  const [trail, setTrail] = useState<{x:number;y:number}[]>([]);
  useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    const loop = (time: number) => {
      if (last == null) last = time;
      const dt = (time - last) / 1000; last = time;
      tRef.current += dt * speed;
      if (fixedCharts && stopAtTTotal && tRef.current >= tTotal) {
        tRef.current = tTotal;
        setT(tRef.current);
        const pos = r(tRef.current); const vel = vFun(tRef.current); const acc = aFun(tRef.current);
        push({ t: tRef.current, x: pos.x, y: pos.y, vx: vel.x, vy: vel.y, ax: acc.x, ay: acc.y });
        setPlaying(false);
        return;
      }
      setT(tRef.current);

      const pos = r(tRef.current); const vel = vFun(tRef.current); const acc = aFun(tRef.current);

      setTrail((old) => { if (!showTrail) return old; const next = [...old, pos]; if (next.length > 1200) next.shift(); return next; });
      push({ t: tRef.current, x: pos.x, y: pos.y, vx: vel.x, vy: vel.y, ax: acc.x, ay: acc.y });

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [playing, speed, showTrail, fixedCharts, stopAtTTotal, tTotal]);

  // desenho principal
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    canvas.style.width = `${size.w}px`; canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawGrid(ctx, size.w, size.h, pxPerUnit, center);
    const w2s = worldToScreen(size.w, size.h, pxPerUnit, center);

    const pos = r(t), vel = vFun(t), acc = aFun(t);

    if (showTrail) {
      ctx.save();
      ctx.strokeStyle = "rgba(167,139,250,0.5)"; ctx.lineWidth = 2; ctx.beginPath();
      trail.forEach((p, i) => { const P = w2s(p.x, p.y); if (i === 0) ctx.moveTo(P.x, P.y); else ctx.lineTo(P.x, P.y); });
      ctx.stroke(); ctx.restore();
    }

    const P = w2s(pos.x, pos.y);
    if (showR) drawTriArrow(ctx, w2s(0,0), P, COLORS.r, 3.5, 16);
    if (showV) drawTriArrow(ctx, P, w2s(pos.x + vel.x*scaleV, pos.y + vel.y*scaleV), COLORS.v, 3.5, 16);
    if (showA) drawTriArrow(ctx, P, w2s(pos.x + acc.x*scaleA, pos.y + acc.y*scaleA), COLORS.a, 3.5, 16);

    ctx.save(); ctx.fillStyle = COLORS.point; ctx.beginPath(); ctx.arc(P.x, P.y, 6, 0, Math.PI*2); ctx.fill(); ctx.restore();
  }, [size, t, pxPerUnit, center, showR, showV, showA, showTrail, scaleV, scaleA, exprX, exprY, trail]);

  // pan/zoom estilo mapas
  const draggingRef = useRef(false);
  const dragStartRef = useRef<{sx:number; sy:number}>({sx:0, sy:0});
  const centerStartRef = useRef<{x:number;y:number}>({x:0,y:0});

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    draggingRef.current = true; dragStartRef.current = { sx: e.clientX, sy: e.clientY }; centerStartRef.current = { ...center };
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const dxPx = e.clientX - dragStartRef.current.sx; const dyPx = e.clientY - dragStartRef.current.sy;
    setCenter({ x: centerStartRef.current.x - dxPx / pxPerUnit, y: centerStartRef.current.y + dyPx / pxPerUnit });
  };
  const endDrag = () => { draggingRef.current = false; };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

    const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
    const worldBefore = s2w(mx, my);

    const zoomFactor = Math.pow(1.1, -e.deltaY / 100);
    const newPx = Math.max(5, Math.min(800, pxPerUnit * zoomFactor));
    setPxPerUnit(newPx);

    const s2wNew = screenToWorld(size.w, size.h, newPx, center);
    const worldAfter = s2wNew(mx, my);
    const cx = center.x + (worldBefore.x - worldAfter.x);
    const cy = center.y + (worldBefore.y - worldAfter.y);
    setCenter({ x: cx, y: cy });
  };

  const hardReset = (recenter = false) => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    tRef.current = 0; setT(0); setTrail([]); clear();
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.width / dpr;
        const H = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);
      }
    }
    if (recenter) {
      const p0 = r(0);
      setCenter({ x: p0.x, y: p0.y });
    }
  };
  const handleReset = () => { hardReset(true); };

  return (
    <div className="w-screen h-screen grid grid-cols-[1fr_22rem] gap-2 p-2 overflow-hidden bg-[#0a0e13] text-slate-200 select-none relative">
      <ExamplesPanel open={showExamples} onClose={() => setShowExamples(false)} onPick={(x, y) => { setDraftX(x); setDraftY(y); setShowExamples(false); }} />
      {/* Painel de gráficos */}
      <ChartsPanel open={showCharts} axis={axis} setAxis={setAxis} samples={samples} t={t}
        windowSec={windowSec} onChangeWindowSec={(w)=>setWindowSec(w)} fixed={fixedCharts} onToggleFixed={(f)=>{ setFixedCharts(f); if (f) { setPlaying(false); hardReset(true); } }}
        tTotal={tTotal} onChangeTTotal={(n)=>setTTotal(n)} fixedRanges={rangesByAxis[axis]} />

      {/* Área principal */}
      <div className="relative rounded-2xl shadow-lg ring-1 ring-slate-800 overflow-hidden h-full">
        <canvas ref={canvasRef} className="block w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag} onWheel={onWheel} />
      </div>

      {/* Controles */}
      <div className="w-[22rem] h-full flex flex-col gap-2">
        <div className="rounded-2xl p-3 bg-[#0f1520] shadow ring-1 ring-slate-800">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold">Funções horárias</h2>
            <button onClick={() => setShowExamples(true)} className="px-2 py-1 rounded-lg text-sm bg-slate-700 hover:bg-slate-600">Exemplos</button>
          </div>
          <label className="text-sm opacity-80">x(t)</label>
          <input value={draftX} onChange={(e)=>setDraftX((e.target as HTMLInputElement).value)}
                 className="w-full mt-0.5 px-3 py-2 rounded-xl bg-[#0b111a] ring-1 ring-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                 placeholder="ex: 2*cos(0.6*t) ou t^2/2" />
          <label className="text-sm opacity-80 mt-1.5 block">y(t)</label>
          <input value={draftY} onChange={(e)=>setDraftY((e.target as HTMLInputElement).value)}
                 className="w-full mt-0.5 px-3 py-2 rounded-xl bg-[#0b111a] ring-1 ring-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                 placeholder="ex: 1.2*sin(0.6*t) (ou 0)" />
          <p className="text-xs mt-1 opacity-70">Suporta <code>^, cos, sin, exp, sqrt, pi</code>. Use <code>t</code> como variável. {errX && <span className="text-red-400 ml-2">x(t): {errX}</span>} {errY && <span className="text-red-400 ml-2">y(t): {errY}</span>}</p>
        </div>

        <div className="rounded-2xl p-3 bg-[#0f1520] shadow ring-1 ring-slate-800">
          <h2 className="text-lg font-semibold mb-2">Controles</h2>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={()=>setPlaying(p=>!p)} className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500">{playing ? "Pause" : "Play"}</button>
            <button onClick={handleReset} className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600">Reset</button>
            <button onClick={()=>setShowCharts(s=>!s)} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500">{showCharts ? "Ocultar gráficos" : "Mostrar gráficos"}</button>
          </div>
          <div className="mt-2">
            <label className="text-sm">Velocidade: <span className="opacity-80">{speed.toFixed(2)}x</span></label>
            <input type="range" min={0.1} max={3} step={0.1} value={speed} onChange={(e)=>setSpeed(parseFloat((e.target as HTMLInputElement).value))} className="w-full" />
          </div>
          <div className="mt-2">
            <label className="text-sm">Zoom (px/unid): <span className="opacity-80">{pxPerUnit}</span></label>
            <input type="range" min={5} max={800} step={2} value={pxPerUnit} onChange={(e)=>setPxPerUnit(parseFloat((e.target as HTMLInputElement).value))} className="w-full" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Escala |v|</label>
              <input type="range" min={0.2} max={3} step={0.1} value={scaleV} onChange={(e)=>setScaleV(parseFloat((e.target as HTMLInputElement).value))} className="w-full" />
            </div>
            <div>
              <label className="text-sm">Escala |a|</label>
              <input type="range" min={0.1} max={2} step={0.1} value={scaleA} onChange={(e)=>setScaleA(parseFloat((e.target as HTMLInputElement).value))} className="w-full" />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={showR} onChange={(e)=>setShowR((e.target as HTMLInputElement).checked)} /><span style={{color: COLORS.r}}>posição</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showV} onChange={(e)=>setShowV((e.target as HTMLInputElement).checked)} /><span style={{color: COLORS.v}}>velocidade</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showA} onChange={(e)=>setShowA((e.target as HTMLInputElement).checked)} /><span style={{color: COLORS.a}}>aceleração</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showTrail} onChange={(e)=>setShowTrail((e.target as HTMLInputElement).checked)} /><span className="opacity-90">trajetória</span></label>
          </div>
          <div className="mt-3 text-xs opacity-70 leading-relaxed">
            <p><strong>Pan/Zoom:</strong> arraste com o mouse para mover o plano. Use a rolagem para dar zoom (o ponto sob o cursor permanece fixo).</p>
          </div>
        </div>
      </div>
    </div>
  );
}

