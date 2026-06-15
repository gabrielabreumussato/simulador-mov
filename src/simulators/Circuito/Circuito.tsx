"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ====================== TEMA / CORES ====================== */
const THEME = {
  bg: "#0b0f14",
  grid: "rgba(120,170,220,0.12)",
  axis: "rgba(220,235,255,0.35)",
  wire: "#c8a28c",
  battery: "#d493d4",
  resistor: "#f28f79",
  electron: "#ffd54a",
  fieldLine: "#9be7a8",
  fieldArrow: "#c7d2fe",
  heat: "rgba(255,120,90,0.35)",
  text: "#e7efff",
};

/* ====================== TIPOS ====================== */
type Vec2 = { x: number; y: number };
type Segment = { a: Vec2; b: Vec2; kind: "wire" | "resistor" | "batteryTop" | "batteryBottom" };
type Electron = { s: number; // posição paramétrica [0,1) ao longo do circuito
                  v: number; // velocidade paramétrica (ciclo/s)
                  jitter: number; // ruído
                };

type Camera = { cx: number; cy: number; scale: number };

/* ====================== GEOMETRIA DO CIRCUITO ======================
   Loop retangular no sentido anti-horário:
   - Bateria na lateral esquerda (parte inferior do retângulo)
   - Resistor no topo (trecho zigue-zague)
   Os "elétrons" andam no sentido da **corrente convencional** invertendo se o usuário pedir.
==================================================================== */
function buildCircuitGeometry(W = 800, H = 520) {
  // retângulo interno
  const pad = 120;
  const left = pad, right = W - pad;
  const top = pad, bottom = H - pad;

  // bateria: um troço vertical na esquerda, ~40% inferior
  const battH = (bottom - top) * 0.32;
  const battBottom = bottom - 10;
  const battTop = battBottom - battH;

  // resistor: central no topo
  const resLen = (right - left) * 0.36;
  const resX0 = (left + right) / 2 - resLen / 2;
  const resX1 = resX0 + resLen;
  const kink = 7; // número de "zigs"
  const resY = top;

  const pts: Segment[] = [];

  // esquerda: de bottom -> battBottom
  pts.push({ a: { x: left, y: bottom }, b: { x: left, y: battBottom }, kind: "wire" });
  // bateria bottom
  pts.push({ a: { x: left, y: battBottom }, b: { x: left, y: battTop }, kind: "batteryBottom" });
  // esquerda: battTop -> top
  pts.push({ a: { x: left, y: battTop }, b: { x: left, y: top }, kind: "wire" });

  // topo: esquerda->resistor início
  pts.push({ a: { x: left, y: top }, b: { x: resX0, y: top }, kind: "wire" });

  // resistor zigue-zague
  const dz = (resX1 - resX0) / (kink * 2);
  let x = resX0;
  let up = true;
  const amp = 20;
  for (let i = 0; i < kink * 2; i++) {
    const nx = x + dz;
    const ny = resY + (up ? -amp : amp);
    pts.push({ a: { x, y: resY }, b: { x: nx, y: ny }, kind: "resistor" });
    pts.push({ a: { x: nx, y: ny }, b: { x: nx + dz, y: resY }, kind: "resistor" });
    x = nx + dz;
    up = !up;
  }

  // topo: resistor fim -> direita-topo
  pts.push({ a: { x: resX1, y: top }, b: { x: right, y: top }, kind: "wire" });

  // direita: topo->bottom
  pts.push({ a: { x: right, y: top }, b: { x: right, y: bottom }, kind: "wire" });

  // baixo: direita->esquerda
  pts.push({ a: { x: right, y: bottom }, b: { x: left, y: bottom }, kind: "wire" });

  // baterIa top "capa" (para desenhar símbolo + -)
  pts.push({ a: { x: left, y: battTop }, b: { x: left, y: battTop - 24 }, kind: "batteryTop" });

  // path total contínuo (ignorando batteryTop)
  const path = pts.filter(s => s.kind !== "batteryTop");

  // comprimentos e cumulativos
  const segLen = (s: Segment) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const lens = path.map(segLen);
  const L = lens.reduce((a, b) => a + b, 0);
  const acc: number[] = [];
  path.reduce((accum, _s, i) => {
    acc[i] = accum;
    return accum + lens[i];
  }, 0);

  return { pts, path, lens, L, acc, left, right, top, bottom, battTop, battBottom };
}

/* ====================== MAPAS UTIL ====================== */
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }

/** devolve posição 2D ao longo do caminho para s in [0,1) */
function posOnLoop(geom: ReturnType<typeof buildCircuitGeometry>, s: number): Vec2 {
  const { path, lens, L, acc } = geom;
  let d = (s - Math.floor(s)) * L;
  // encontra segmento
  let i = 0;
  while (i < path.length - 1 && d >= acc[i + 1]) i++;
  const seg = path[i];
  const t = clamp((d - acc[i]) / lens[i], 0, 1);
  return { x: lerp(seg.a.x, seg.b.x, t), y: lerp(seg.a.y, seg.b.y, t) };
}

/* ====================== COMPONENTE ====================== */
export default function ElectricCircuitSimulator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI / estado
  const [width, height] = [980, 640];
  const [showElectrons, setShowElectrons] = useState(true);
  const [showFieldOnWire, setShowFieldOnWire] = useState(true);
  const [showFieldOutside, setShowFieldOutside] = useState(true);
  const [batteryOn, setBatteryOn] = useState(true);
  const [conventionalCurrent, setConventionalCurrent] = useState(true); // alterna direção
  const [voltage, setVoltage] = useState(9);          // V
  const [resistance, setResistance] = useState(10);   // ohms
  const [electronCount, setElectronCount] = useState(120);
  const [cam, setCam] = useState<Camera>({ cx: width / 2, cy: height / 2, scale: 1.0 });

  // geometria memorizada
  const geom = useMemo(() => buildCircuitGeometry(width, height), [width, height]);

  // partículas
  const electronsRef = useRef<Electron[]>([]);
  useEffect(() => {
    const arr: Electron[] = [];
    for (let i = 0; i < electronCount; i++) {
      arr.push({
        s: Math.random(),
        v: 0,
        jitter: (Math.random() * 2 - 1) * 0.002,
      });
    }
    electronsRef.current = arr;
  }, [electronCount]);

  // interação: pan/zoom
  useEffect(() => {
    const cvs = canvasRef.current!;
    let dragging = false;
    let last: Vec2 = { x: 0, y: 0 };

    const onDown = (e: MouseEvent) => { dragging = true; last = { x: e.clientX, y: e.clientY }; };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = (e.clientX - last.x), dy = (e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      setCam(c => ({ ...c, cx: c.cx - dx / c.scale, cy: c.cy - dy / c.scale }));
    };
    const onUp = () => (dragging = false);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.001);
      setCam(c => {
        const mx = (e.offsetX / c.scale) + (c.cx - width / (2 * c.scale));
        const my = (e.offsetY / c.scale) + (c.cy - height / (2 * c.scale));
        const ns = clamp(c.scale * factor, 0.5, 2.5);
        // zoom focado no mouse
        const nx = mx - e.offsetX / ns + width / (2 * ns);
        const ny = my - e.offsetY / ns + height / (2 * ns);
        return { cx: nx, cy: ny, scale: ns };
      });
    };

    cvs.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    cvs.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cvs.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cvs.removeEventListener("wheel", onWheel);
    };
  }, [width, height]);

  // loop
  const tRef = useRef<number>(0);
  useEffect(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    let raf = 0;

    const drawGrid = (ctx: CanvasRenderingContext2D) => {
      const step = 40;
      ctx.save();
      ctx.strokeStyle = THEME.grid;
      ctx.lineWidth = 1;
      // grid em coords da câmera
      const s = cam.scale;
      const ox = width / 2 - cam.cx * s;
      const oy = height / 2 - cam.cy * s;
      const x0 = -ox % (step * s);
      const y0 = -oy % (step * s);
      for (let x = x0; x < width; x += step * s) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = y0; y < height; y += step * s) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      ctx.restore();
    };

    const worldToScreen = (p: Vec2): Vec2 => {
      const s = cam.scale;
      return { x: (p.x - cam.cx) * s + width / 2, y: (p.y - cam.cy) * s + height / 2 };
    };

    const drawSegment = (s: Segment, color: string, lw = 4) => {
      const A = worldToScreen(s.a), B = worldToScreen(s.b);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
      ctx.strokeStyle = color; ctx.lineWidth = lw * cam.scale;
      ctx.stroke();
    };

    const drawResistor = () => {
      ctx.save();
      for (const seg of geom.pts) {
        if (seg.kind === "resistor") drawSegment(seg, THEME.resistor, 4);
      }
      // brilho/"calor" proporcional à corrente
      const I = batteryOn ? voltage / Math.max(0.5, resistance) : 0;
      if (I > 0) {
        ctx.globalAlpha = Math.min(0.6, 0.05 + I * 0.08);
        for (const seg of geom.pts) {
          if (seg.kind === "resistor") {
            const A = worldToScreen(seg.a), B = worldToScreen(seg.b);
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
            ctx.strokeStyle = THEME.heat; ctx.lineWidth = 14 * cam.scale;
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    };

    const drawBattery = () => {
      // corpo
      const { battTop, battBottom, left } = geom;
      const pad = 16;
      const w = 44;
      const A = worldToScreen({ x: left - w / 2, y: battTop - pad });
      const B = worldToScreen({ x: left + w / 2, y: battBottom + pad });
      ctx.fillStyle = THEME.battery;
      ctx.strokeStyle = THEME.battery;
      ctx.lineWidth = 3 * cam.scale;
      ctx.beginPath(); ctx.rect(A.x, A.y, B.x - A.x, B.y - A.y); ctx.fill();
      ctx.stroke();

      // polos
      ctx.fillStyle = THEME.text;
      ctx.font = `${14 * cam.scale}px system-ui, sans-serif`;
      const plus = worldToScreen({ x: left, y: battBottom + 8 });
      const minus = worldToScreen({ x: left, y: battTop - 8 });
      ctx.textAlign = "center";
      ctx.fillText("+", plus.x, plus.y);
      ctx.fillText("–", minus.x, minus.y);

      // terminais no desenho (segments já existem)
      for (const seg of geom.pts) {
        if (seg.kind === "batteryBottom" || seg.kind === "batteryTop") {
          drawSegment(seg, THEME.wire, 4);
        }
      }
    };

    const drawWires = () => {
      for (const seg of geom.pts) {
        if (seg.kind === "wire") drawSegment(seg, THEME.wire, 4);
      }
    };

    const drawFieldOnWire = (time: number) => {
      if (!showFieldOnWire) return;
      const I = batteryOn ? voltage / Math.max(0.5, resistance) : 0;
      const dash = 32;
      const speed = 120; // px/s para efeito de "onda"
      const phase = (time * speed) % dash;

      ctx.save();
      ctx.strokeStyle = THEME.fieldArrow;
      ctx.lineWidth = 2 * cam.scale;
      ctx.setLineDash([dash * cam.scale * 0.6, dash * cam.scale * 0.4]);
      ctx.lineDashOffset = conventionalCurrent ? -phase * cam.scale : phase * cam.scale;

      for (const seg of geom.path) {
        // intensidade visual ~ I
        ctx.globalAlpha = clamp(0.15 + I * 0.15, 0.1, 0.85);
        drawSegment(seg, THEME.fieldArrow, 2.5);
      }
      ctx.restore();
    };

    // linhas de campo "externas" aproximadas (offsets do retângulo e curvas suaves)
    const drawFieldOutside = (time: number) => {
      if (!showFieldOutside) return;
      const loops = 5;
      const spread = 24;
      ctx.save();
      ctx.strokeStyle = THEME.fieldLine;
      ctx.lineWidth = 1.8 * cam.scale;

      const k = batteryOn ? 1 : 0.15;
      for (let i = 1; i <= loops; i++) {
        const off = i * spread;
        const poly: Vec2[] = [
          { x: geom.left - off, y: geom.bottom + off * 0.2 },
          { x: geom.left - off * 0.2, y: geom.top - off },
          { x: geom.right + off * 0.2, y: geom.top - off },
          { x: geom.right + off, y: geom.bottom + off * 0.2 },
          { x: geom.left - off, y: geom.bottom + off * 0.2 },
        ];
        ctx.globalAlpha = clamp(0.08 * k * (1 - i / (loops + 1)) + 0.06, 0.04, 0.35);
        ctx.beginPath();
        poly.forEach((p, idx) => {
          const s = worldToScreen(p);
          if (idx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();

        // setinhas marchando
        const T = time * 0.6 + i * 0.3;
        const N = 12;
        for (let j = 0; j < N; j++) {
          const t = ((j / N) + (T % 1));
          // pega ponto na polilinha
          const idx = Math.floor(t * (poly.length - 1));
          const t2 = t * (poly.length - 1) - idx;
          const P = {
            x: lerp(poly[idx].x, poly[idx + 1].x, t2),
            y: lerp(poly[idx].y, poly[idx + 1].y, t2),
          };
          const Q = {
            x: lerp(poly[idx].x, poly[idx + 1].x, clamp(t2 + 0.04, 0, 1)),
            y: lerp(poly[idx].y, poly[idx + 1].y, clamp(t2 + 0.04, 0, 1)),
          };
          const sP = worldToScreen(P), sQ = worldToScreen(Q);
          const ang = Math.atan2(sQ.y - sP.y, sQ.x - sP.x);
          const len = 10 * cam.scale;
          ctx.beginPath();
          ctx.moveTo(sP.x, sP.y);
          ctx.lineTo(sP.x - len * Math.cos(ang - 0.3), sP.y - len * Math.sin(ang - 0.3));
          ctx.moveTo(sP.x, sP.y);
          ctx.lineTo(sP.x - len * Math.cos(ang + 0.3), sP.y - len * Math.sin(ang + 0.3));
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    const drawElectrons = (dt: number) => {
      if (!showElectrons) return;
      const I = batteryOn ? voltage / Math.max(0.5, resistance) : 0;
      const direction = conventionalCurrent ? 1 : -1;

      // drift paramétrico (ciclos/s) – pequeno, mas proporcional a I
      const drift = 0.05 * I * (conventionalCurrent ? 1 : -1);

      // colisões extras quando no resistor
      const isResSeg = (s: number) => {
        // mapeia s→segmento
        const { acc, lens, path, L } = geom;
        let d = (s - Math.floor(s)) * L;
        let i = 0;
        while (i < path.length - 1 && d >= acc[i + 1]) i++;
        return path[i].kind === "resistor";
      };

      const arr = electronsRef.current;
      for (const e of arr) {
        // ruído térmico
        e.s += (drift + e.jitter * (isResSeg(e.s) ? 6 : 1)) * dt;
        // colisões (reset pequeno aleatório) dentro do resistor
        if (isResSeg(e.s) && Math.random() < 0.15 * dt * Math.abs(I)) {
          e.s += (Math.random() - 0.5) * 0.02 * direction;
        }
      }

      // desenho
      ctx.save();
      for (const e of arr) {
        const p = posOnLoop(geom, e.s);
        const s = worldToScreen(p);
        ctx.beginPath();
        ctx.fillStyle = THEME.electron;
        ctx.arc(s.x, s.y, 4.2 * cam.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawUIHints = () => {
      ctx.save();
      ctx.fillStyle = THEME.text;
      ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.textAlign = "left";
      const I = batteryOn ? voltage / Math.max(0.5, resistance) : 0;
      ctx.fillText(`V = ${voltage.toFixed(1)} V   R = ${resistance.toFixed(1)} Ω   I ≈ ${I.toFixed(2)} A`, 14, 22);
      ctx.fillText(`Electrons: ${showElectrons ? "on" : "off"} | Field on wire: ${showFieldOnWire ? "on" : "off"} | Field outside: ${showFieldOutside ? "on" : "off"}`, 14, 40);
      ctx.restore();
    };

    const tick = (now: number) => {
      const t = now * 0.001;
      const dt = Math.min(0.05, t - tRef.current);
      tRef.current = t;

      // clear
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, width, height);

      drawGrid(ctx);

      // wires, resistor, bateria
      drawWires();
      drawResistor();
      drawBattery();

      // campos
      drawFieldOnWire(t);
      drawFieldOutside(t);

      // elétrons
      drawElectrons(dt);

      drawUIHints();

      raf = requestAnimationFrame(tick);
    };

    tRef.current = 0;
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geom, cam, showElectrons, showFieldOnWire, showFieldOutside, voltage, resistance, batteryOn, conventionalCurrent, width, height]);

  return (
    <div className="w-full flex flex-col gap-3" style={{ color: THEME.text }}>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={batteryOn} onChange={e => setBatteryOn(e.target.checked)} />
          bateria ligada
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showElectrons} onChange={e => setShowElectrons(e.target.checked)} />
          elétrons
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showFieldOnWire} onChange={e => setShowFieldOnWire(e.target.checked)} />
          campo no fio
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showFieldOutside} onChange={e => setShowFieldOutside(e.target.checked)} />
          campo externo
        </label>
        <label className="flex items-center gap-2">
          direção:
          <select
            value={conventionalCurrent ? "conv" : "elec"}
            onChange={e => setConventionalCurrent(e.target.value === "conv")}
          >
            <option value="conv">corrente convencional (+ → −)</option>
            <option value="elec">elétrons (− → +)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2">
          V
          <input type="range" min={1} max={30} step={0.5} value={voltage} onChange={e => setVoltage(parseFloat(e.target.value))} />
          <span>{voltage.toFixed(1)} V</span>
        </label>
        <label className="flex items-center gap-2">
          R
          <input type="range" min={1} max={60} step={0.5} value={resistance} onChange={e => setResistance(parseFloat(e.target.value))} />
          <span>{resistance.toFixed(1)} Ω</span>
        </label>
        <label className="flex items-center gap-2">
          nº de elétrons
          <input type="range" min={20} max={280} step={10} value={electronCount} onChange={e => setElectronCount(parseInt(e.target.value))} />
          <span>{electronCount}</span>
        </label>
        <span style={{ opacity: 0.8 }}>arraste para pan • scroll para zoom</span>
      </div>

      <canvas ref={canvasRef} width={width} height={height} style={{ width, height, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }} />
    </div>
  );
}