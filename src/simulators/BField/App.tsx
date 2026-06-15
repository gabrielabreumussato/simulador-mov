'use client'

import { useEffect, useRef, useState } from 'react';

// ======= Tema/Cores =======
const THEME = {
  bg: "#0b0f14",
  grid: "rgba(120,170,220,0.12)",
  axis: "rgba(220,235,255,0.8)",
  arrow: "#ffb357",
  arrowIndivid: ["#6ee7ff", "#c084fc", "#f472b6", "#34d399", "#facc15"],
  // cores para N/S
  magnetNorth: "#ff3b3b",
  magnetSouth: "#3d9cff",
  earth: "#22c55e",
  compass: "#facc15",
  line: "#c7d2fe",
  conductor: "rgba(155,155,155,0.75)"
};

// ======= Tipos =======
type Magnet = { id: number; type: 'bar' | 'horseshoe' | 'earth'; x: number; y: number; strength: number; angle: number; size: number; halfLength?: number };
type Compass = { id: number; x: number; y: number; angle: number; omega: number };

type GhostState =
  | { active: false }
  | { active: true; kind: "magnet"; type: 'bar' | 'horseshoe' | 'earth'; sx: number; sy: number }
  | { active: true; kind: "compass"; sx: number; sy: number };

// ======= Transformações =======
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

// ======= Física do Campo Magnético =======
function magneticFieldTotalAtPoint(x: number, y: number, magnets: Magnet[]): { Bx: number; By: number } {
  let Bx = 0, By = 0;

  for (const mag of magnets) {
    const { Bx: bx, By: by } = magneticFieldFromSingle(x, y, mag);
    Bx += bx;
    By += by;
  }

  return { Bx, By };
}

// ======= Campo de um único ímã (modelo físico DIPOLAR) =======
function magneticFieldFromSingle(x: number, y: number, mag: Magnet): { Bx: number; By: number } {
  const EPS2 = 1e-10;
  let Bx = 0, By = 0;

  // Coordenadas relativas ao centro do ímã
  const dx = x - mag.x;
  const dy = y - mag.y;
  const r2 = dx*dx + dy*dy;
  if (r2 < EPS2) return { Bx, By };

  if (mag.type === 'bar') {
    // Rotação mundo → local (sistema do ímã)
    const cos_a = Math.cos(mag.angle);
    const sin_a = Math.sin(mag.angle);
    const x_local = dx * cos_a + dy * sin_a;
    const y_local = -dx * sin_a + dy * cos_a;

    const r2_local = x_local*x_local + y_local*y_local;
    if (r2_local < EPS2) return { Bx, By };

    const r_local = Math.sqrt(r2_local);
    const r3_local = r2_local * r_local;

    // Momento magnético no sistema local (aponta ao longo do eixo x, do S para N)
    const m = mag.strength * (mag.halfLength ?? 1.0);
    const mx_local = -m;  // invertido: aponta de S (direita) para N (esquerda)
    const my_local = 0;

    // produto escalar m·r no sistema local
    const mdotr_local = mx_local * x_local + my_local * y_local;

    // Fórmula do dipolo no sistema local: B = (k/r^3)[3(m·r̂)r̂ – m]
    const bx_local = (3*mdotr_local*x_local / r2_local - mx_local) / r3_local;
    const by_local = (3*mdotr_local*y_local / r2_local - my_local) / r3_local;

    // Rotação local → mundo
    Bx = bx_local * cos_a - by_local * sin_a;
    By = bx_local * sin_a + by_local * cos_a;
  }

  else if (mag.type === 'horseshoe') {
    // Dois polos separados
    const gap = mag.size * 0.8;
    const cos_a = Math.cos(mag.angle);
    const sin_a = Math.sin(mag.angle);

    // Posições dos polos
    const tipN = { x: mag.x - (gap/2)*cos_a, y: mag.y - (gap/2)*sin_a };
    const tipS = { x: mag.x + (gap/2)*cos_a, y: mag.y + (gap/2)*sin_a };

    const q = mag.strength;

    // Campo do polo Norte
    const dxN = x - tipN.x, dyN = y - tipN.y;
    const r2N = dxN*dxN + dyN*dyN;
    if (r2N > EPS2) {
      const r3N = r2N * Math.sqrt(r2N);
      Bx += q * dxN / r3N;
      By += q * dyN / r3N;
    }

    // Campo do polo Sul
    const dxS = x - tipS.x, dyS = y - tipS.y;
    const r2S = dxS*dxS + dyS*dyS;
    if (r2S > EPS2) {
      const r3S = r2S * Math.sqrt(r2S);
      Bx -= q * dxS / r3S;
      By -= q * dyS / r3S;
    }
  }

  else if (mag.type === 'earth') {
    // Terra: dipolo fraco inclinado
    const r = Math.sqrt(r2);
    const r3 = r2 * r;

    // Momento magnético inclinado (11° + orientação do usuário)
    const earthAngle = mag.angle + Math.PI/16; // ~11° de inclinação
    const m0 = 0.3 * mag.strength * (mag.halfLength ?? 1);
    const mx = m0 * Math.cos(earthAngle);
    const my = m0 * Math.sin(earthAngle);

    // produto escalar m·r
    const mdotr = mx*dx + my*dy;

    // Fórmula do dipolo
    Bx = (3*mdotr*dx / r2 - mx) / r3;
    By = (3*mdotr*dy / r2 - my) / r3;
  }

  return { Bx, By };
}

// ======= Linhas de Campo =======
function generateFieldLines(magnets: Magnet[], width: number, height: number, pxPerUnit: number, center: { x: number; y: number }) {
  const lines = [];
  const s2w = screenToWorld(width, height, pxPerUnit, center);

  for (const mag of magnets) {
    if (mag.type === 'earth') continue;

    const startPoints = [];
    const numPoints = mag.type === 'bar' ? 16 : 12;

    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      const r = mag.size * 0.6;
      startPoints.push({
        x: mag.x + r * Math.cos(angle + mag.angle),
        y: mag.y + r * Math.sin(angle + mag.angle)
      });
    }

    for (const start of startPoints) {
      const line = [];
      const pos = { ...start };
      const step = 0.02;
      const maxSteps = 500;

      for (let i = 0; i < maxSteps; i++) {
        line.push({ ...pos });

        const { Bx, By } = magneticFieldTotalAtPoint(pos.x, pos.y, magnets);
        const magnitude = Math.sqrt(Bx*Bx + By*By);

        if (magnitude < 0.001) break;

        const stepSize = step / magnitude;
        pos.x += Bx * stepSize;
        pos.y += By * stepSize;

        // Verificar limites
        const worldBounds = {
          left: s2w(0, 0).x,
          right: s2w(width, 0).x,
          top: s2w(0, 0).y,
          bottom: s2w(0, height).y
        };

        if (pos.x < worldBounds.left || pos.x > worldBounds.right ||
            pos.y < worldBounds.bottom || pos.y > worldBounds.top) break;
      }

      if (line.length > 5) lines.push(line);
    }
  }

  return lines;
}

// ======= Ícones de Objetos =======
function drawBarMagnetIcon(ctx: CanvasRenderingContext2D, size: number) {
  const w = size * 0.7, h = size * 0.3;
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  // North (red)
  ctx.fillStyle = THEME.magnetNorth;
  ctx.fillRect(cx - w/2, cy - h/2, w/2, h);

  // South (blue)
  ctx.fillStyle = THEME.magnetSouth;
  ctx.fillRect(cx, cy - h/2, w/2, h);

  // Labels
  ctx.fillStyle = 'white';
  ctx.font = `${Math.max(8, size/6)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx - w/4, cy + 2);
  ctx.fillText('S', cx + w/4, cy + 2);
}

function drawHorseshoeMagnetIcon(ctx: CanvasRenderingContext2D, size: number) {
  const w = size * 0.35, h = size * 0.45;
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  ctx.lineWidth = size * 0.10;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // Left leg (N - red) - de cima para baixo
  ctx.strokeStyle = THEME.magnetNorth;
  ctx.beginPath();
  ctx.moveTo(cx - w/2, cy - h/2);
  ctx.lineTo(cx - w/2, cy + h/2);
  ctx.stroke();

  // Metade esquerda da curva embaixo (N - red) - divisão vertical no meio
  ctx.beginPath();
  ctx.arc(cx, cy + h/2, w/2, Math.PI, Math.PI/2, true);
  ctx.stroke();

  // Metade direita da curva embaixo (S - blue) - divisão vertical no meio
  ctx.strokeStyle = THEME.magnetSouth;
  ctx.beginPath();
  ctx.arc(cx, cy + h/2, w/2, Math.PI/2, 0, true);
  ctx.stroke();

  // Right leg (S - blue)
  ctx.beginPath();
  ctx.moveTo(cx + w/2, cy + h/2);
  ctx.lineTo(cx + w/2, cy - h/2);
  ctx.stroke();

  // Labels
  ctx.fillStyle = 'white';
  ctx.font = `${Math.max(5, size/10)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx - w/2, cy);
  ctx.fillText('S', cx + w/2, cy);
}

// Cache para a imagem da Terra com campo magnético
const earthImageCache = { loaded: false, img: null as HTMLImageElement | null };

function loadEarthImage() {
  if (!earthImageCache.img) {
    earthImageCache.img = new Image();
    earthImageCache.img.onload = () => { earthImageCache.loaded = true; };
    earthImageCache.img.src = '/earth-magnetic.webp';
  }
  return earthImageCache;
}

function drawEarthIcon(ctx: CanvasRenderingContext2D, size: number) {
  const R = size * 0.4;
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  const earthImg = loadEarthImage();

  if (earthImg.loaded && earthImg.img) {
    // Recorte circular da Terra exatamente no contorno azul claro
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2*Math.PI);
    ctx.clip();

    // Ajustar recorte para pegar exatamente a borda da Terra (onde azul fica claro)
    const imgW = earthImg.img.width;
    const imgH = earthImg.img.height;
    const earthRadius = Math.min(imgW, imgH) * 0.23; // ajustado para contorno exato da Terra
    const srcX = imgW/2 - earthRadius;
    const srcY = imgH/2 - earthRadius;
    const srcSize = earthRadius * 2;

    ctx.drawImage(earthImg.img, srcX, srcY, srcSize, srcSize, cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    // Borda
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2*Math.PI);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Fallback: círculo azul simples
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2*Math.PI);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawCompassIcon(ctx: CanvasRenderingContext2D, size: number) {
  const R = size * 0.4;
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  // Compass body
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2*Math.PI);
  ctx.fillStyle = '#1f2937';
  ctx.fill();
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Needle (losango clássico)
  const L = R * 0.9, W = R * 0.35;

  // Triângulo norte (branco)
  ctx.beginPath();
  ctx.moveTo(cx, cy - L);
  ctx.lineTo(cx + W, cy);
  ctx.lineTo(cx - W, cy);
  ctx.closePath();
  ctx.fillStyle = 'white';
  ctx.fill();

  // Triângulo sul (vermelho)
  ctx.beginPath();
  ctx.moveTo(cx, cy + L);
  ctx.lineTo(cx + W, cy);
  ctx.lineTo(cx - W, cy);
  ctx.closePath();
  ctx.fillStyle = THEME.magnetNorth;
  ctx.fill();
}

// ======= Botões de Objetos =======
function BarMagnetButton({ onPointerDown, onPointerUp }: { onPointerDown: () => void; onPointerUp: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; const S = 48;
    c.width = S * dpr; c.height = S * dpr; c.style.width = `${S}px`; c.style.height = `${S}px`;
    const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBarMagnetIcon(ctx, S);
  }, []);
  return (
    <button onMouseDown={onPointerDown} onMouseUp={onPointerUp}
      className="p-1 rounded-xl bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]"
      style={{ width: 56, height: 56 }}>
      <canvas ref={ref} className="block" />
    </button>
  );
}

function HorseshoeMagnetButton({ onPointerDown, onPointerUp }: { onPointerDown: () => void; onPointerUp: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; const S = 48;
    c.width = S * dpr; c.height = S * dpr; c.style.width = `${S}px`; c.style.height = `${S}px`;
    const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHorseshoeMagnetIcon(ctx, S);
  }, []);
  return (
    <button onMouseDown={onPointerDown} onMouseUp={onPointerUp}
      className="p-1 rounded-xl bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]"
      style={{ width: 56, height: 56 }}>
      <canvas ref={ref} className="block" />
    </button>
  );
}

function EarthButton({ onPointerDown, onPointerUp }: { onPointerDown: () => void; onPointerUp: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; const S = 48;
    c.width = S * dpr; c.height = S * dpr; c.style.width = `${S}px`; c.style.height = `${S}px`;
    const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawEarthIcon(ctx, S);
  }, []);
  return (
    <button onMouseDown={onPointerDown} onMouseUp={onPointerUp}
      className="p-1 rounded-xl bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]"
      style={{ width: 56, height: 56 }}>
      <canvas ref={ref} className="block" />
    </button>
  );
}

function CompassButton({ onPointerDown, onPointerUp }: { onPointerDown: () => void; onPointerUp: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; const S = 40;
    c.width = S * dpr; c.height = S * dpr; c.style.width = `${S}px`; c.style.height = `${S}px`;
    const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCompassIcon(ctx, S);
  }, []);
  return (
    <button onMouseDown={onPointerDown} onMouseUp={onPointerUp}
      className="p-1 rounded-xl bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]"
      style={{ width: 48, height: 48 }}>
      <canvas ref={ref} className="block" />
    </button>
  );
}

// ======= Componente Principal =======
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 640 });
  const [pxPerUnit, setPxPerUnit] = useState(100);
  const [center, setCenter] = useState({ x: 0, y: 0 });

  const [magnets, setMagnets] = useState<Magnet[]>([]);
  const [compasses, setCompasses] = useState<Compass[]>([]);
  const [nextId, setNextId] = useState(1);

  const [showResultant, setShowResultant] = useState(true);
  const [showIndividuals, setShowIndividuals] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const [density, setDensity] = useState(48);

  const [, setGhost] = useState<GhostState>({ active: false });
  const [dragFromPalette, setDragFromPalette] = useState<null | { kind: "magnet" | "compass"; type?: 'bar' | 'horseshoe' | 'earth' }>(null);
  const [isHoveringTrashArea, setIsHoveringTrashArea] = useState(false);

  const [dragMagnetId] = useState<number | null>(null);
  const dragMagnetOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const [dragMagnet, setDragMagnet] = useState<null | { id: number; mode: "move" | "handle" | "gap" }>(null);
  const [hoverHandle, setHoverHandle] = useState<null | { id: number }>(null);

  const [dragCompassId, setDragCompassId] = useState<number | null>(null);
  const dragCompassOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const basePx = 100;
  const zoomScale = Math.min(2.2, Math.max(0.7, Math.pow(pxPerUnit / basePx, 0.85)));

  const handleReset = () => {
    setMagnets([]); setCompasses([]);
    setCenter({ x: 0, y: 0 }); setPxPerUnit(basePx);
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

  // Ghost da paleta
  useEffect(() => {
    if (!dragFromPalette) return;
    if (dragFromPalette.kind === "magnet") {
      setGhost({ active: true, kind: "magnet", type: dragFromPalette.type as ('bar' | 'horseshoe' | 'earth'), sx: -1000, sy: -1000 });
    } else {
      setGhost({ active: true, kind: "compass", sx: -1000, sy: -1000 });
    }

    const onMove = (e: MouseEvent) => setGhost((g) => g.active ? ({ ...g, sx: e.clientX, sy: e.clientY } as GhostState) : g);
    const onUp = (e: MouseEvent) => {
      const canvas = canvasRef.current; if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
          const { x, y } = s2w(e.clientX - rect.left, e.clientY - rect.top);
          if (dragFromPalette.kind === "magnet" && dragFromPalette.type) {
            setMagnets((old) => [...old, {
              id: nextId,
              type: dragFromPalette.type,
              x, y,
              strength: 1.0,
              angle: 0,
              size: dragFromPalette.type === 'earth' ? 1.2 : 0.8,
              halfLength: (dragFromPalette.type === 'bar' || dragFromPalette.type === 'horseshoe') ? 1.0 : undefined
            }]);
            setNextId((n) => n + 1);
          } else if (dragFromPalette.kind === "compass") {
            setCompasses((old) => [...old, { id: nextId, x, y, angle: 0, omega: 0 }]);
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

  // Alinhamento com inércia (oscila e assenta)
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    let last = performance.now();
    const K = 7.0;  // "mola" (tende a alinhar)
    const D = 3.0;  // amortecimento

    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      setCompasses(prev => prev.map(c => {
        const { Bx, By } = magneticFieldTotalAtPoint(c.x, c.y, magnets);
        const theta = Math.atan2(By, Bx);

        const damping = 0.90;  // amortecimento mais suave
        const omega = damping * (c.omega ?? 0) + (1 - damping) * (theta - c.angle);
        const angle = c.angle + omega;

        return { ...c, angle, omega };
      }));

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [magnets]);

  // Mouse handlers
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragFromPalette) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
    const w2s = worldToScreen(size.w, size.h, pxPerUnit, center);
    const mouseWorld = s2w(sx, sy);

    // Verificar clique em bússola
    for (const compass of compasses) {
      const compassScreen = w2s(compass.x, compass.y);
      const hitPx = 20;
      if (Math.hypot(compassScreen.x - sx, compassScreen.y - sy) <= hitPx) {
        setDragCompassId(compass.id);
        dragCompassOffset.current = { dx: mouseWorld.x - compass.x, dy: mouseWorld.y - compass.y };
        return;
      }
    }

    // Verificar clique em handles dos ímãs de barra e ferradura
    for (const magnet of magnets) {
      if ((magnet.type === 'bar' || magnet.type === 'horseshoe') && magnet.halfLength) {
        const halfLen = magnet.halfLength;
        const ux = Math.cos(magnet.angle), uy = Math.sin(magnet.angle);

        let handle1, handle2, handleGap = null;
        if (magnet.type === 'bar') {
          handle1 = { x: magnet.x - ux * halfLen, y: magnet.y - uy * halfLen };
          handle2 = { x: magnet.x + ux * halfLen, y: magnet.y + uy * halfLen };
        } else { // horseshoe
          const gapWidth = magnet.size || 0.5;
          const vx = -uy, vy = ux; // vetor perpendicular
          handle1 = { x: magnet.x - vx * gapWidth/2 - ux * halfLen, y: magnet.y - vy * gapWidth/2 - uy * halfLen };
          handle2 = { x: magnet.x + vx * gapWidth/2 - ux * halfLen, y: magnet.y + vy * gapWidth/2 - uy * halfLen };
          handleGap = { x: magnet.x, y: magnet.y }; // handle no centro (meio das pernas)
        }

        const handleHitPx = 8;

        // Check gap handle first (horseshoe only)
        if (handleGap) {
          const gapScreen = w2s(handleGap.x, handleGap.y);
          if (Math.hypot(gapScreen.x - sx, gapScreen.y - sy) <= handleHitPx) {
            setDragMagnet({ id: magnet.id, mode: "gap" });
            dragMagnetOffset.current = { dx: mouseWorld.x - magnet.x, dy: mouseWorld.y - magnet.y };
            return;
          }
        }

        const h1Screen = w2s(handle1.x, handle1.y);
        const h2Screen = w2s(handle2.x, handle2.y);

        if (Math.hypot(h1Screen.x - sx, h1Screen.y - sy) <= handleHitPx ||
            Math.hypot(h2Screen.x - sx, h2Screen.y - sy) <= handleHitPx) {
          setDragMagnet({ id: magnet.id, mode: "handle" });
          dragMagnetOffset.current = { dx: mouseWorld.x - magnet.x, dy: mouseWorld.y - magnet.y };
          return;
        }
      }
    }

    // Verificar clique no corpo dos ímãs
    for (const magnet of magnets) {
      const magnetScreen = w2s(magnet.x, magnet.y);
      const hitPx = Math.max(20, magnet.size * pxPerUnit * 0.6);
      if (Math.hypot(magnetScreen.x - sx, magnetScreen.y - sy) <= hitPx) {
        setDragMagnet({ id: magnet.id, mode: "move" });
        dragMagnetOffset.current = { dx: mouseWorld.x - magnet.x, dy: mouseWorld.y - magnet.y };
        return;
      }
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);
    const w2s = worldToScreen(size.w, size.h, pxPerUnit, center);
    const mouseWorld = s2w(sx, sy);

    // Drag compass
    if (dragCompassId != null) {
      const nx = mouseWorld.x - dragCompassOffset.current.dx;
      const ny = mouseWorld.y - dragCompassOffset.current.dy;
      setCompasses((old) => old.map((c) => (c.id === dragCompassId ? { ...c, x: nx, y: ny } : c)));
      return;
    }

    // Drag magnet
    if (dragMagnet) {
      if (dragMagnet.mode === "move") {
        const nx = mouseWorld.x - dragMagnetOffset.current.dx;
        const ny = mouseWorld.y - dragMagnetOffset.current.dy;
        setMagnets((old) => old.map((m) => (m.id === dragMagnet.id ? { ...m, x: nx, y: ny } : m)));
      } else if (dragMagnet.mode === "handle") {
        // Ajustar comprimento e ângulo
        const magnet = magnets.find(m => m.id === dragMagnet.id);
        if (magnet && (magnet.type === 'bar' || magnet.type === 'horseshoe')) {
          const dx = mouseWorld.x - magnet.x;
          const dy = mouseWorld.y - magnet.y;
          const newHalfLength = Math.max(0.3, Math.min(3.0, Math.hypot(dx, dy)));
          // O ângulo deve apontar na direção do polo Sul (handle arrastado)
          // Como N está em -halfLen e S em +halfLen, o ângulo é direto
          const newAngle = Math.atan2(dy, dx);
          setMagnets((old) => old.map((m) =>
            m.id === dragMagnet.id ? { ...m, halfLength: newHalfLength, angle: newAngle, strength: newHalfLength } : m
          ));
        }
      } else if (dragMagnet.mode === "gap") {
        // Ajustar abertura do U (horseshoe)
        const magnet = magnets.find(m => m.id === dragMagnet.id);
        if (magnet && magnet.type === 'horseshoe') {
          const dx = mouseWorld.x - magnet.x;
          const dy = mouseWorld.y - magnet.y;
          const ux = Math.cos(magnet.angle), uy = Math.sin(magnet.angle);
          const vx = -uy, vy = ux; // vetor perpendicular
          // Projeção no vetor perpendicular (determina abertura)
          const perpDist = Math.abs(dx * vx + dy * vy);
          const newSize = Math.max(0.3, Math.min(2.0, perpDist * 2));
          setMagnets((old) => old.map((m) =>
            m.id === dragMagnet.id ? { ...m, size: newSize } : m
          ));
        }
      }
      return;
    }

    // Hover detection para handles
    setHoverHandle(null);
    for (const magnet of magnets) {
      if ((magnet.type === 'bar' || magnet.type === 'horseshoe') && magnet.halfLength) {
        const halfLen = magnet.halfLength;
        const ux = Math.cos(magnet.angle), uy = Math.sin(magnet.angle);

        let handle1, handle2;
        if (magnet.type === 'bar') {
          handle1 = { x: magnet.x - ux * halfLen, y: magnet.y - uy * halfLen };
          handle2 = { x: magnet.x + ux * halfLen, y: magnet.y + uy * halfLen };
        } else { // horseshoe
          const gapWidth = magnet.size || 0.5;
          const vx = -uy, vy = ux; // vetor perpendicular
          handle1 = { x: magnet.x - vx * gapWidth/2 - ux * halfLen, y: magnet.y - vy * gapWidth/2 - uy * halfLen };
          handle2 = { x: magnet.x + vx * gapWidth/2 - ux * halfLen, y: magnet.y + vy * gapWidth/2 - uy * halfLen };
        }

        const h1Screen = w2s(handle1.x, handle1.y);
        const h2Screen = w2s(handle2.x, handle2.y);
        const handleHitPx = 8;

        if (Math.hypot(h1Screen.x - sx, h1Screen.y - sy) <= handleHitPx ||
            Math.hypot(h2Screen.x - sx, h2Screen.y - sy) <= handleHitPx) {
          setHoverHandle({ id: magnet.id });
          break;
        }
      }
    }
  };

  const endDrag = () => {
    // Handle removal in trash area
    if (isHoveringTrashArea) {
      if (dragMagnet) {
        setMagnets(prev => prev.filter(m => m.id !== dragMagnet.id));
      }
      if (dragCompassId != null) {
        setCompasses(prev => prev.filter(c => c.id !== dragCompassId));
      }
    }

    setDragMagnet(null);
    setDragCompassId(null);
    setIsHoveringTrashArea(false);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setPxPerUnit((px) => Math.max(20, Math.min(320, px * factor)));
  };

  // render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size.w;
    canvas.height = size.h;

    const w2s = worldToScreen(size.w, size.h, pxPerUnit, center);

    // Clear
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, size.w, size.h);

    // Grid
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    for (let x = Math.floor(center.x - size.w/(2*pxPerUnit)); x <= Math.ceil(center.x + size.w/(2*pxPerUnit)); x++) {
      const screen = w2s(x, center.y - size.h/(2*pxPerUnit));
      const screen2 = w2s(x, center.y + size.h/(2*pxPerUnit));
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen2.x, screen2.y);
      ctx.stroke();
    }
    for (let y = Math.floor(center.y - size.h/(2*pxPerUnit)); y <= Math.ceil(center.y + size.h/(2*pxPerUnit)); y++) {
      const screen = w2s(center.x - size.w/(2*pxPerUnit), y);
      const screen2 = w2s(center.x + size.w/(2*pxPerUnit), y);
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen2.x, screen2.y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = 2;
    const axisX1 = w2s(center.x - size.w/(2*pxPerUnit), 0);
    const axisX2 = w2s(center.x + size.w/(2*pxPerUnit), 0);
    const axisY1 = w2s(0, center.y - size.h/(2*pxPerUnit));
    const axisY2 = w2s(0, center.y + size.h/(2*pxPerUnit));

    ctx.beginPath();
    ctx.moveTo(axisX1.x, axisX1.y);
    ctx.lineTo(axisX2.x, axisX2.y);
    ctx.moveTo(axisY1.x, axisY1.y);
    ctx.lineTo(axisY2.x, axisY2.y);
    ctx.stroke();

    // Field lines
    if (showLines) {
      const fieldLines = generateFieldLines(magnets, size.w, size.h, pxPerUnit, center);
      ctx.strokeStyle = THEME.line;
      ctx.lineWidth = 1;

      for (const line of fieldLines) {
        if (line.length < 2) continue;

        ctx.beginPath();
        const firstScreen = w2s(line[0].x, line[0].y);
        ctx.moveTo(firstScreen.x, firstScreen.y);

        for (let i = 1; i < line.length; i++) {
          const screen = w2s(line[i].x, line[i].y);
          ctx.lineTo(screen.x, screen.y);
        }
        ctx.stroke();

        // Arrows
        if (line.length >= 10) {
          const midPoint = Math.floor(line.length / 2);
          const p1 = w2s(line[midPoint - 1].x, line[midPoint - 1].y);
          const p2 = w2s(line[midPoint + 1].x, line[midPoint + 1].y);
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const mid = w2s(line[midPoint].x, line[midPoint].y);

          ctx.save();
          ctx.translate(mid.x, mid.y);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-8, -3);
          ctx.lineTo(-8, 3);
          ctx.closePath();
          ctx.fillStyle = THEME.line;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Função para desenhar seta melhorada
    const drawArrow = (ctx: CanvasRenderingContext2D, from: {x: number, y: number}, to: {x: number, y: number}, color: string, thickness: number, headSize: number) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const angle = Math.atan2(dy, dx);
      const length = Math.hypot(dx, dy);

      ctx.save();
      ctx.translate(from.x, from.y);
      ctx.rotate(angle);

      // Shaft
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length - headSize * 0.8, 0);
      ctx.stroke();

      // Head
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(length, 0);
      ctx.lineTo(length - headSize, -headSize * 0.4);
      ctx.lineTo(length - headSize * 0.6, 0);
      ctx.lineTo(length - headSize, headSize * 0.4);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    // Vetores de campo
    if (showResultant || showIndividuals) {
      const step = Math.max(16, Math.floor(720 / density));
      const s2w = screenToWorld(size.w, size.h, pxPerUnit, center);

      for (let sx = 0; sx <= size.w; sx += step) {
        for (let sy = 0; sy <= size.h; sy += step) {
          const { x, y } = s2w(sx, sy);

          if (showResultant) {
            const { Bx, By } = magneticFieldTotalAtPoint(x, y, magnets);
            const magnitude = Math.sqrt(Bx*Bx + By*By);
            const eps = 1e-12;
            if (magnitude < eps) continue;

            const maxLen = step * 0.8;
            const scale = Math.min(1.0, Math.max(0.3, Math.log10(magnitude * 10 + 1) / 1.5));
            const arrowLen = maxLen * scale;

            const ux = Bx / magnitude;
            const uy = By / magnitude;
            const to = { x: sx + ux * arrowLen, y: sy - uy * arrowLen };

            const thickness = Math.max(1.5, 2.5 * zoomScale);
            const headSize = Math.max(6, 8 * zoomScale);
            drawArrow(ctx, { x: sx, y: sy }, to, THEME.arrow, thickness, headSize);
          }

          if (showIndividuals) {
            let colorIndex = 0;
            for (const mag of magnets) {
              const { Bx, By } = magneticFieldFromSingle(x, y, mag);
              const magnitude = Math.sqrt(Bx*Bx + By*By);
              const eps = 1e-12;
              if (magnitude < eps) continue;

              const maxLen = step * 0.6;
              const scale = Math.min(1.0, Math.max(0.3, Math.log10(magnitude * 10 + 1) / 1.8));
              const arrowLen = maxLen * scale;
              const ux = Bx / magnitude;
              const uy = By / magnitude;
              const to = { x: sx + ux * arrowLen, y: sy - uy * arrowLen };

              const color = THEME.arrowIndivid[colorIndex % THEME.arrowIndivid.length];
              const thickness = Math.max(1.2, 2 * zoomScale);
              const headSize = Math.max(5, 6 * zoomScale);
              drawArrow(ctx, { x: sx, y: sy }, to, color, thickness, headSize);
              colorIndex++;
            }
          }
        }
      }
    }

    // Draw magnets
    for (const magnet of magnets) {
      const screen = w2s(magnet.x, magnet.y);
      const screenSize = magnet.size * pxPerUnit;

      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(-magnet.angle);  // Inverte porque o canvas Y cresce para baixo

      // Selection highlight
      const isDragging = dragMagnetId === magnet.id;
      if (isDragging) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(-screenSize*0.6, -screenSize*0.6, screenSize*1.2, screenSize*1.2);
      }

      switch (magnet.type) {
        case 'bar': {
          const halfLen = (magnet.halfLength || 1.0) * pxPerUnit;
          const barHeight = screenSize * 0.5;
          // North pole (red)
          ctx.fillStyle = THEME.magnetNorth;
          ctx.fillRect(-halfLen, -barHeight/2, halfLen, barHeight);
          // South pole (blue)
          ctx.fillStyle = THEME.magnetSouth;
          ctx.fillRect(0, -barHeight/2, halfLen, barHeight);
          // Labels - ajustado para ficar dentro do ímã
          ctx.fillStyle = 'white';
          const fontSize = Math.min(halfLen/3, barHeight * 0.6, 16);
          ctx.font = `${Math.max(8, fontSize)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('N', -halfLen/2, 0);
          ctx.fillText('S', halfLen/2, 0);

          // Handles nas pontas
          const handleR = Math.max(3, 5 * zoomScale);
          ctx.fillStyle = hoverHandle && hoverHandle.id === magnet.id ? "#ffffff" : "#e5e7eb";
          ctx.beginPath();
          ctx.arc(-halfLen, 0, handleR, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(halfLen, 0, handleR, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'horseshoe': {
          const halfLen = (magnet.halfLength || 0.6) * pxPerUnit;
          const gapWidth = (magnet.size || 0.5) * pxPerUnit;
          const thickness = Math.max(8, 10 * zoomScale);

          // U: pontas para cima, curva embaixo conectando
          ctx.lineWidth = thickness;
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'miter';

          // Perna esquerda (Norte - vermelho) - de cima para baixo
          ctx.strokeStyle = THEME.magnetNorth;
          ctx.beginPath();
          ctx.moveTo(-gapWidth/2, -halfLen);
          ctx.lineTo(-gapWidth/2, halfLen);
          ctx.stroke();

          // Metade esquerda da curva embaixo (Norte - vermelho) - divisão vertical exata
          ctx.beginPath();
          ctx.arc(0, halfLen, gapWidth/2, Math.PI, Math.PI/2, true);
          ctx.stroke();

          // Metade direita da curva embaixo (Sul - azul) - divisão vertical exata
          ctx.strokeStyle = THEME.magnetSouth;
          ctx.beginPath();
          ctx.arc(0, halfLen, gapWidth/2, Math.PI/2, 0, true);
          ctx.stroke();

          // Perna direita (Sul - azul) - de baixo para cima
          ctx.beginPath();
          ctx.moveTo(gapWidth/2, halfLen);
          ctx.lineTo(gapWidth/2, -halfLen);
          ctx.stroke();

          // Linha branca discreta no meio das pernas (handle visual)
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-gapWidth/2, 0);
          ctx.lineTo(gapWidth/2, 0);
          ctx.stroke();

          // Rótulos
          ctx.fillStyle = 'white';
          const fontSize = Math.min(halfLen/3, thickness * 1.5, 14);
          ctx.font = `${Math.max(8, fontSize)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('N', -gapWidth/2, -halfLen * 0.6);
          ctx.fillText('S', gapWidth/2, -halfLen * 0.6);

          // Handles nas pontas (CIMA) e no meio (para variar abertura)
          const handleR = Math.max(3, 5 * zoomScale);
          ctx.fillStyle = hoverHandle && hoverHandle.id === magnet.id ? "#ffffff" : "#e5e7eb";
          ctx.beginPath();
          ctx.arc(-gapWidth/2, -halfLen, handleR, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(gapWidth/2, -halfLen, handleR, 0, Math.PI * 2);
          ctx.fill();
          // Handle do meio para variar distância
          ctx.beginPath();
          ctx.arc(0, 0, handleR, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'earth': {
          const earthImg = loadEarthImage();
          const R = screenSize/2;

          if (earthImg.loaded && earthImg.img) {
            // Recorte circular da Terra exatamente no contorno azul claro
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, R, 0, 2*Math.PI);
            ctx.clip();

            // Ajustar recorte para pegar exatamente a borda da Terra (onde azul fica claro)
            const imgW = earthImg.img.width;
            const imgH = earthImg.img.height;
            const earthRadius = Math.min(imgW, imgH) * 0.23; // ajustado para contorno exato da Terra
            const srcX = imgW/2 - earthRadius;
            const srcY = imgH/2 - earthRadius;
            const srcSize = earthRadius * 2;

            ctx.drawImage(earthImg.img, srcX, srcY, srcSize, srcSize, -R, -R, R * 2, R * 2);
            ctx.restore();

            // Borda
            ctx.beginPath();
            ctx.arc(0, 0, R, 0, 2*Math.PI);
            ctx.strokeStyle = '#1f2937';
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            // Fallback: círculo azul simples
            ctx.beginPath();
            ctx.arc(0, 0, R, 0, 2*Math.PI);
            ctx.fillStyle = '#3b82f6';
            ctx.fill();
            ctx.strokeStyle = '#1f2937';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          break;
        }
      }

      ctx.restore();
    }

    // Draw compasses
    for (const compass of compasses) {
      const screen = w2s(compass.x, compass.y);
      const compassSize = 18 * zoomScale;

      ctx.save();
      ctx.translate(screen.x, screen.y);

      // Selection highlight
      const isDragging = dragCompassId === compass.id;
      if (isDragging) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, compassSize + 4, 0, 2*Math.PI);
        ctx.stroke();
      }

      // Compass body
      ctx.beginPath();
      ctx.arc(0, 0, compassSize, 0, 2*Math.PI);
      ctx.fillStyle = '#1f2937';
      ctx.fill();
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Compass needle
      ctx.rotate(-compass.angle);  // Inverte porque o canvas Y cresce para baixo
      const L = compassSize * 0.9, W = compassSize * 0.35;

      // Norte (branco)
      ctx.beginPath();
      ctx.moveTo(0, -L);
      ctx.lineTo(+W, 0);
      ctx.lineTo(-W, 0);
      ctx.closePath();
      ctx.fillStyle = 'white';
      ctx.fill();

      // Sul (vermelho)
      ctx.beginPath();
      ctx.moveTo(0, +L);
      ctx.lineTo(+W, 0);
      ctx.lineTo(-W, 0);
      ctx.closePath();
      ctx.fillStyle = THEME.magnetNorth;
      ctx.fill();

      ctx.restore();
    }

  }, [size, pxPerUnit, center, density, magnets, compasses, showResultant, showIndividuals, showLines, zoomScale, dragMagnet, dragCompassId, hoverHandle, dragMagnetId]);

  // Verificar se está na zona de lixeira
  useEffect(() => {
    if (dragMagnet || dragCompassId != null) {
      const w2s = worldToScreen(size.w, size.h, pxPerUnit, center);
      let isHovering = false;

      if (dragMagnet) {
        const magnet = magnets.find(m => m.id === dragMagnet.id);
        if (magnet) {
          const screen = w2s(magnet.x, magnet.y);
          isHovering = screen.x > size.w - 350; // área do painel direito
        }
      }

      if (dragCompassId != null) {
        const compass = compasses.find(c => c.id === dragCompassId);
        if (compass) {
          const screen = w2s(compass.x, compass.y);
          isHovering = screen.x > size.w - 350;
        }
      }

      setIsHoveringTrashArea(isHovering);
    }
  }, [dragMagnet, dragCompassId, magnets, compasses, size, pxPerUnit, center]);

  return (
    <div className="w-screen h-screen grid grid-cols-[1fr_22rem] gap-2 p-2 bg-[#0a0e13] text-slate-200 select-none">
      {/* Área do canvas */}
      <div className="relative rounded-2xl ring-1 ring-slate-800 shadow-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          className="block w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onWheel={onWheel}
        />
      </div>

      {/* Painel lateral direito */}
      <div className="w-[22rem] h-full flex flex-col gap-3">
        <div className="rounded-2xl p-3 bg-[#0f1520] ring-1 ring-slate-800 shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Campo Magnético</h3>
            <div className="flex gap-2">
              <button onClick={handleReset} className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">Reset</button>
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
          </div>
          <div className="mt-2">
            <label className="text-xs">Densidade de vetores: {density}</label>
            <input
              type="range" min="12" max="96" step="6" value={density}
              onChange={(e) => setDensity(Number(e.currentTarget.value))}
              className="w-full h-1 rounded bg-slate-800 appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* Paleta */}
        <div className={`rounded-2xl p-3 ring-1 shadow transition-all duration-200 ${isHoveringTrashArea ? 'bg-red-800/40 ring-red-400 ring-2 shadow-red-500/20 shadow-lg' : (dragMagnet != null || dragCompassId != null) ? 'bg-red-900/20 ring-red-500/50' : 'bg-[#0f1520] ring-slate-800'}`}>
          <div className={`text-sm mb-2 transition-all duration-200 flex items-center gap-2 ${isHoveringTrashArea ? 'opacity-100 text-red-200 font-semibold scale-105' : (dragMagnet != null || dragCompassId != null) ? 'opacity-100 text-red-300' : 'opacity-75'}`}>
            {isHoveringTrashArea && <span className="text-lg">🗑️</span>}
            {isHoveringTrashArea ? 'Solte para DESCARTAR' : 'Arraste para o plano:'}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <BarMagnetButton onPointerDown={() => setDragFromPalette({ kind: "magnet", type: "bar" })} onPointerUp={() => { }} />
            <HorseshoeMagnetButton onPointerDown={() => setDragFromPalette({ kind: "magnet", type: "horseshoe" })} onPointerUp={() => { }} />
            <EarthButton onPointerDown={() => setDragFromPalette({ kind: "magnet", type: "earth" })} onPointerUp={() => { }} />
            <CompassButton onPointerDown={() => setDragFromPalette({ kind: "compass" })} onPointerUp={() => { }} />
          </div>
          <div className="text-xs mt-2 opacity-70">
            {isHoveringTrashArea ? (
              <span className="text-red-200 font-semibold animate-pulse">🗑️ ZONA DE DESCARTE ATIVA - Solte para remover</span>
            ) : (dragMagnet != null || dragCompassId != null) ? (
              <span className="text-red-300 font-medium">⚠️ Arraste até aqui e solte para REMOVER</span>
            ) : (
              <>* Solte dentro do plano para criar o objeto. Arraste objetos para movê-los. Ímãs de barra: arraste as pontas para rotacionar/ajustar comprimento. A bússola aponta na direção do campo magnético.</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}