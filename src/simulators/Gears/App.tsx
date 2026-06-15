import React, { useEffect, useMemo, useRef, useState } from "react";

// ===== Paleta (mesma vibe do seu App.tsx) =====
const COLORS = {
  bg: "#0a0e13",
  panel: "#0f1520",
  ring: "#1f2a37",
  grid: "#1b2430",
  axes: "#4a6078",
  ink: "#cbd5e1",
  accent: "#6366f1",
  good: "#10b981",
  warn: "#f59e0b",
  belt: "#94a3b8",
  pulleyA: "#60a5fa",
  pulleyB: "#a78bfa",
  chain: "#94a3b8",
};

// ===== Util: clamp, fmt =====
const clamp = (x:number, a:number, b:number)=> Math.max(a, Math.min(b, x));
const fmt = (x:number, d=3)=> (Number.isFinite(x)? x.toFixed(d) : "—");

// ===== Canvas helpers =====
function drawGrid(ctx: CanvasRenderingContext2D, W:number, H:number) {
  ctx.save();
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
  const step = 40; ctx.beginPath();
  for (let x=0; x<=W; x+=step) { ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for (let y=0; y<=H; y+=step) { ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx:CanvasRenderingContext2D, x1:number,y1:number,x2:number,y2:number, color:string){
  const dx=x2-x1, dy=y2-y1; const L=Math.hypot(dx,dy)||1; const ux=dx/L, uy=dy/L; const head=10;
  ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=2; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2-ux*head,y2-uy*head); ctx.stroke();
  ctx.beginPath();
  const bx=-uy, by=ux; const baseX=x2-ux*head, baseY=y2-uy*head; const half=head*0.6;
  ctx.moveTo(x2,y2); ctx.lineTo(baseX+bx*half, baseY+by*half); ctx.lineTo(baseX-bx*half, baseY-by*half); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPulley(ctx:CanvasRenderingContext2D, cx:number, cy:number, r:number, theta:number, color:string, label?:string){
  ctx.save();
  // disco
  const grad = ctx.createRadialGradient(cx,cy,r*0.2, cx,cy,r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color+"33");
  ctx.fillStyle = grad; ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
  // eixo
  ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.arc(cx,cy,r*0.08,0,Math.PI*2); ctx.fill();
  // marcador radial
  const mx = cx + r * Math.cos(theta), my = cy + r * Math.sin(theta);
  ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(mx,my); ctx.stroke();
  // rótulo
  if (label){ ctx.fillStyle = COLORS.ink; ctx.font = "12px ui-sans-serif"; ctx.fillText(label, cx - r, cy - r - 6); }
  ctx.restore();
}

function drawBelt(ctx:CanvasRenderingContext2D, c1:[number,number], r1:number, c2:[number,number], r2:number, crossed:boolean){
  // Correia aberta ou cruzada aproximada por linhas tangentes
  const [x1,y1] = c1, [x2,y2] = c2; const dx=x2-x1, dy=y2-y1; const D=Math.hypot(dx,dy);
  if (D < Math.abs(r1-r2)+2) return; // evita degenerar
  const ux = dx/D, uy = dy/D;
  let alpha = Math.acos((r1-r2)/D);
  if (crossed) alpha = Math.acos((r1+r2)/D);
  const ang = Math.atan2(uy,ux);
  const a1 = ang + (crossed? alpha : alpha);
  const a2 = ang - (crossed? alpha : alpha);

  // pontos de tangência (simplificados)
  const t1a = [x1 + r1*Math.cos(a1), y1 + r1*Math.sin(a1)];
  const t2a = [x2 + (crossed?-r2:r2)*Math.cos(a1), y2 + (crossed?-r2:r2)*Math.sin(a1)];
  const t1b = [x1 + r1*Math.cos(a2), y1 + r1*Math.sin(a2)];
  const t2b = [x2 + (crossed?-r2:r2)*Math.cos(a2), y2 + (crossed?-r2:r2)*Math.sin(a2)];

  ctx.save(); ctx.strokeStyle = COLORS.belt; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(t1a[0], t1a[1]); ctx.lineTo(t2a[0], t2a[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(t1b[0], t1b[1]); ctx.lineTo(t2b[0], t2b[1]); ctx.stroke();
  ctx.restore();
}

function drawChain(ctx:CanvasRenderingContext2D, c1:[number,number], r1:number, c2:[number,number], r2:number){
  // versão simples: duas retas tangenciais paralelas (como a correia aberta)
  drawBelt(ctx, c1, r1, c2, r2, false);
}

// ===== Tipos/modes =====
 type Mode = 1 | 2 | 3; // 1: polias eixos diferentes, 2: mesmo eixo, 3: bicicleta

export default function AppGears(){
  // ---- Estado global de UI ----
  const [mode, setMode] = useState<Mode>(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showVectors, setShowVectors] = useState(true);
  const [crossed, setCrossed] = useState(false); // correia cruzada no modo 1

  // Polias modo 1 (eixos diferentes)
  const [R1, setR1] = useState(0.35);
  const [R2, setR2] = useState(0.65);
  const [w1, setW1] = useState(2.0); // rad/s

  // Mesmo eixo modo 2
  const [R1s, setR1s] = useState(0.25);
  const [R2s, setR2s] = useState(0.55);
  const [wS, setWS] = useState(2.0);

  // Bicicleta modo 3
  const [N1, setN1] = useState(42);
  const [N2, setN2] = useState(14);
  const [wPedal, setWPedal] = useState(1.6);
  const [RWheel, setRWheel] = useState(0.32); // ~ aro 700c ≈ 0.33 m

  // Derivadas (ω₂, v etc.)
  const w2_mode1 = (crossed? -1:1) * w1 * (R1 / Math.max(1e-6,R2));
  const v_mode1 = w1 * R1; // v comum na correia

  const v1_mode2 = wS * R1s; const v2_mode2 = wS * R2s; // mesma ω, v diferentes

  const w2_mode3 = wPedal * (N1 / Math.max(1,N2));
  const v_mode3  = w2_mode3 * RWheel; // velocidade linear da roda

  // Ângulos animados
  const [theta1, setTheta1] = useState(0);
  const [theta2, setTheta2] = useState(0);
  const [thetaS, setThetaS]   = useState(0); // modo 2 (mesmo eixo)
  const [thetaCrank, setThetaCrank] = useState(0); // modo 3
  const [thetaWheel, setThetaWheel] = useState(0);

  // Canvas size + loop
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const [size, setSize] = useState({w: 960, h: 560});
  useEffect(()=>{
    const onResize = ()=>{
      const parent = canvasRef.current?.parentElement; if(!parent) return;
      const rect = parent.getBoundingClientRect();
      setSize({ w: Math.max(760, Math.floor(rect.width)), h: Math.max(460, Math.floor(rect.height) - 12) });
    };
    onResize(); window.addEventListener("resize", onResize);
    return ()=> window.removeEventListener("resize", onResize);
  },[]);

  useEffect(()=>{
    if(!playing) return;
    let id:number; let last:number|null=null;
    const loop = (t:number)=>{
      if(last==null) last=t; const dt=(t-last)/1000; last=t;
      const k = clamp(speed,0.05,5);
      setTheta1(th=> th + w1 * dt * k);
      setTheta2(th=> th + w2_mode1 * dt * k);
      setThetaS (th=> th + wS * dt * k);
      setThetaCrank(th=> th + wPedal * dt * k);
      setThetaWheel(th=> th + w2_mode3 * dt * k);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return ()=> cancelAnimationFrame(id);
  },[playing, speed, w1, w2_mode1, wS, wPedal, w2_mode3]);

  // Desenho principal
  useEffect(()=>{
    const cvs = canvasRef.current; if(!cvs) return; const dpr = window.devicePixelRatio||1;
    cvs.width = Math.floor(size.w * dpr); cvs.height = Math.floor(size.h * dpr);
    cvs.style.width = `${size.w}px`; cvs.style.height = `${size.h}px`;
    const ctx = cvs.getContext("2d"); if(!ctx) return; ctx.setTransform(dpr,0,0,dpr,0,0);

    const W=size.w, H=size.h; drawGrid(ctx, W, H);

    if (mode===1){
      const c1:[number,number] = [W*0.32, H*0.55];
      const c2:[number,number] = [W*0.68, H*0.45];
      const px = 140; // escala m→px
      const r1 = Math.max(20, R1*px); const r2 = Math.max(20, R2*px);

      // correia
      drawBelt(ctx, c1, r1, c2, r2, crossed);
      // polias
      drawPulley(ctx, c1[0], c1[1], r1, theta1, COLORS.pulleyA, `R1=${fmt(R1,2)} m`);
      drawPulley(ctx, c2[0], c2[1], r2, theta2, COLORS.pulleyB, `R2=${fmt(R2,2)} m`);

      // vetores v (tangenciais)
      if (showVectors){
        const v1 = v_mode1, v2 = Math.abs(w2_mode1)*R2; // magnitudes
        drawArrow(ctx, c1[0], c1[1], c1[0] + Math.cos(theta1+Math.PI/2)*r1*0.9, c1[1] + Math.sin(theta1+Math.PI/2)*r1*0.9, COLORS.warn);
        drawArrow(ctx, c2[0], c2[1], c2[0] + Math.cos(theta2+Math.PI/2)*r2*0.9, c2[1] + Math.sin(theta2+Math.PI/2)*r2*0.9, COLORS.warn);
        ctx.fillStyle = COLORS.ink; ctx.font = "12px ui-sans-serif";
        ctx.fillText(`|v| = ${fmt(v1,2)} m/s`, c1[0]-r1, c1[1]+r1+16);
        ctx.fillText(`|v| = ${fmt(v2,2)} m/s`, c2[0]-r2, c2[1]+r2+16);
      }
    }

    if (mode===2){
      const c:[number,number] = [W*0.5, H*0.5];
      const px = 160;
      const r1 = Math.max(20, R1s*px); const r2 = Math.max(20, R2s*px);
      drawPulley(ctx, c[0], c[1], r2, thetaS, COLORS.pulleyB, `R2=${fmt(R2s,2)} m`);
      drawPulley(ctx, c[0], c[1], r1, thetaS, COLORS.pulleyA, `R1=${fmt(R1s,2)} m`);
      if (showVectors){
        const a = thetaS + Math.PI/2;
        drawArrow(ctx, c[0], c[1], c[0] + Math.cos(a)*r1*0.9, c[1] + Math.sin(a)*r1*0.9, COLORS.warn);
        drawArrow(ctx, c[0], c[1], c[0] + Math.cos(a)*r2*0.9, c[1] + Math.sin(a)*r2*0.9, COLORS.warn);
      }
    }

    if (mode===3){
      const crank:[number,number] = [W*0.32, H*0.55];
      const wheel:[number,number] = [W*0.72, H*0.55];
      const px = 160;
      const rCrank = Math.max(24, 0.14*px); // raio visual da coroa dianteira
      const rRear  = Math.max(22, 0.06*px); // raio visual do pinhão traseiro
      const rWheel = Math.max(40, RWheel*px);

      drawChain(ctx, crank, rCrank, wheel, rRear);
      drawPulley(ctx, crank[0], crank[1], rCrank, thetaCrank, COLORS.pulleyA, `Coroa N1=${N1}`);
      drawPulley(ctx, wheel[0], wheel[1], rRear, thetaWheel, COLORS.pulleyB, `Pinhão N2=${N2}`);
      // roda traseira (grande)
      drawPulley(ctx, wheel[0]+rRear+rWheel+24, wheel[1], rWheel, thetaWheel, COLORS.ink, `R roda=${fmt(RWheel,2)} m`);
      if (showVectors){
        const a = thetaWheel + Math.PI/2;
        drawArrow(ctx, wheel[0]+rRear+rWheel+24, wheel[1], wheel[0]+rRear+rWheel+24 + Math.cos(a)*rWheel*0.85, wheel[1] + Math.sin(a)*rWheel*0.85, COLORS.warn);
      }
    }

  },[size, mode, crossed, showVectors, // desenho
      // modo1
      R1, R2, w1, theta1, theta2,
      // modo2
      R1s, R2s, wS, thetaS,
      // modo3
      N1, N2, wPedal, RWheel, thetaCrank, thetaWheel]);

  // ===== UI =====
  return (
    <div className="w-full h-[92vh] grid grid-cols-[1fr_22rem] gap-4 p-4 overflow-hidden bg-[#0a0e13] text-slate-200 select-none relative">
      {/* Canvas principal */}
      <div className="relative rounded-2xl shadow-lg ring-1 ring-slate-800 overflow-hidden h-full">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* Painel lateral (controles) */}
      <div className="w-[22rem] h-full flex flex-col gap-2 overflow-y-auto">
        <div className="rounded-2xl p-3 bg-[#0f1520] shadow ring-1 ring-slate-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Simulador de Polias & Bicicleta</h2>
            <div className="flex items-center gap-2">
              <button onClick={()=>setPlaying(p=>!p)} className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500">{playing?"Pause":"Play"}</button>
            </div>
          </div>

          {/* Seleção de modo */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <button onClick={()=>setMode(1)} className={`px-2 py-1.5 rounded-lg ring-1 ${mode===1?"bg-indigo-600 ring-indigo-400":"bg-[#0b111a] ring-slate-700 hover:bg-[#111b2a]"}`}>Polias (eixos dif.)</button>
            <button onClick={()=>setMode(2)} className={`px-2 py-1.5 rounded-lg ring-1 ${mode===2?"bg-indigo-600 ring-indigo-400":"bg-[#0b111a] ring-slate-700 hover:bg-[#111b2a]"}`}>Mesmo eixo</button>
            <button onClick={()=>setMode(3)} className={`px-2 py-1.5 rounded-lg ring-1 ${mode===3?"bg-indigo-600 ring-indigo-400":"bg-[#0b111a] ring-slate-700 hover:bg-[#111b2a]"}`}>Bicicleta</button>
          </div>

          {/* Controles comuns */}
          <div className="mt-2">
            <label className="text-sm">Velocidade da simulação: <span className="opacity-80">{fmt(speed,2)}x</span></label>
            <input type="range" min={0.1} max={3} step={0.1} value={speed} onChange={(e)=>setSpeed(parseFloat(e.target.value))} className="w-full" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={showVectors} onChange={e=>setShowVectors(e.target.checked)} />Mostrar vetores</label>
            {mode===1 && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={crossed} onChange={e=>setCrossed(e.target.checked)} />Correia cruzada</label>
            )}
          </div>
        </div>

        {/* Blocos por modo */}
        {mode===1 && (
          <div className="rounded-2xl p-3 bg-[#0f1520] shadow ring-1 ring-slate-800">
            <h3 className="font-semibold mb-2">Polias com eixos diferentes</h3>
            <div className="space-y-2">
              <div>
                <label className="text-sm">R₁ (m): <span className="opacity-80">{fmt(R1,2)}</span></label>
                <input type="range" min={0.1} max={1.0} step={0.01} value={R1} onChange={(e)=>setR1(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-sm">R₂ (m): <span className="opacity-80">{fmt(R2,2)}</span></label>
                <input type="range" min={0.1} max={1.2} step={0.01} value={R2} onChange={(e)=>setR2(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-sm">ω₁ (rad/s): <span className="opacity-80">{fmt(w1,2)}</span></label>
                <input type="range" min={-10} max={10} step={0.1} value={w1} onChange={(e)=>setW1(parseFloat(e.target.value))} className="w-full" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">ω₂ = <span className="text-emerald-400">{fmt(w2_mode1,3)}</span> rad/s</div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">|v| = <span className="text-emerald-400">{fmt(v_mode1,3)}</span> m/s</div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">Razão ω₁/ω₂ = <span className="text-indigo-400">{fmt(w1/Math.max(1e-9,w2_mode1),3)}</span></div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">R₂/R₁ = <span className="text-indigo-400">{fmt(R2/Math.max(1e-9,R1),3)}</span></div>
            </div>
          </div>
        )}

        {mode===2 && (
          <div className="rounded-2xl p-3 bg-[#0f1520] shadow ring-1 ring-slate-800">
            <h3 className="font-semibold mb-2">Polias no mesmo eixo</h3>
            <div className="space-y-2">
              <div>
                <label className="text-sm">R₁ (m): <span className="opacity-80">{fmt(R1s,2)}</span></label>
                <input type="range" min={0.1} max={0.8} step={0.01} value={R1s} onChange={(e)=>setR1s(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-sm">R₂ (m): <span className="opacity-80">{fmt(R2s,2)}</span></label>
                <input type="range" min={0.15} max={1.2} step={0.01} value={R2s} onChange={(e)=>setR2s(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-sm">ω (rad/s): <span className="opacity-80">{fmt(wS,2)}</span></label>
                <input type="range" min={-10} max={10} step={0.1} value={wS} onChange={(e)=>setWS(parseFloat(e.target.value))} className="w-full" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">v₁ = <span className="text-emerald-400">{fmt(v1_mode2,3)}</span> m/s</div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">v₂ = <span className="text-emerald-400">{fmt(v2_mode2,3)}</span> m/s</div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">ω (comum) = <span className="text-indigo-400">{fmt(wS,3)}</span> rad/s</div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">R₂/R₁ = <span className="text-indigo-400">{fmt(R2s/Math.max(1e-9,R1s),3)}</span></div>
            </div>
          </div>
        )}

        {mode===3 && (
          <div className="rounded-2xl p-3 bg-[#0f1520] shadow ring-1 ring-slate-800">
            <h3 className="font-semibold mb-2">Bicicleta (coroa, pinhão, roda)</h3>
            <div className="space-y-2">
              <div>
                <label className="text-sm">Dentes dianteiros N₁: <span className="opacity-80">{N1}</span></label>
                <input type="range" min={22} max={56} step={1} value={N1} onChange={(e)=>setN1(parseInt(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-sm">Dentes traseiros N₂: <span className="opacity-80">{N2}</span></label>
                <input type="range" min={9} max={34} step={1} value={N2} onChange={(e)=>setN2(parseInt(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-sm">ω₁ (pedal) rad/s: <span className="opacity-80">{fmt(wPedal,2)}</span></label>
                <input type="range" min={0} max={6} step={0.1} value={wPedal} onChange={(e)=>setWPedal(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-sm">Raio da roda (m): <span className="opacity-80">{fmt(RWheel,2)}</span></label>
                <input type="range" min={0.2} max={0.4} step={0.005} value={RWheel} onChange={(e)=>setRWheel(parseFloat(e.target.value))} className="w-full" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">ω₂ (roda livre) = <span className="text-emerald-400">{fmt(w2_mode3,3)}</span> rad/s</div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">v roda = <span className="text-emerald-400">{fmt(v_mode3,3)}</span> m/s</div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">N₁/N₂ = <span className="text-indigo-400">{fmt(N1/Math.max(1,N2),3)}</span></div>
              <div className="rounded-xl p-2 bg-[#0b111a] ring-1 ring-slate-800">Curiosidade: 20 km/h ≈ {fmt(v_mode3*3.6,2)} km/h</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
