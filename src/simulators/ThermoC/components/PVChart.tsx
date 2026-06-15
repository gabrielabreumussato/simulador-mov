import React, { useEffect, useRef } from "react";
import type { PVPoint } from "../sim/physics";

type Guide = { points: PVPoint[]; color: string; dash?: number[] };

type Props = {
  width?: number;
  height?: number;
  point: PVPoint;              // ponto atual
  guide?: Guide[];             // linhas pontilhadas do ciclo (isotermas/adiabáticas)
  phase?: string;              // muda cor do segmento atual
  paramsKey?: any;             // mudar => reset total
  pRange?: [number, number];
  vRange?: [number, number];
};

const THEME = {
  bgTop: "#fbfdff",
  bgBot: "#f1f5f9",
  axes: "rgba(0,0,0,.85)",
  grid: "rgba(0,0,0,.08)",
  text: "rgba(0,0,0,.7)",
  marker: "#111827",
  fill: "rgba(37,99,235,.12)",
  trail: "#2563eb",
  phase: {
    isoThot: "#ef4444",
    isoTcold: "#22c55e",
    adiabat: "#0ea5e9",
    adiabat2: "#0ea5e9",
  } as Record<string,string>
};

export default function PVChart({
  width=640, height=360, point, guide, phase, paramsKey, pRange, vRange
}: Props){
  const trail = useRef<HTMLCanvasElement>(null);
  const over  = useRef<HTMLCanvasElement>(null);
  const first = useRef<{x:number;y:number}|null>(null);
  const last  = useRef<{x:number;y:number}|null>(null);
  const ranges = useRef<{p:[number,number]; v:[number,number]}>({
    p: pRange ?? [5e4, 2e5],
    v: vRange ?? [2e-4, 1.4e-3],
  });

  // init + reset ao trocar paramsKey
  useEffect(()=>{
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio||1));
    for(const c of [trail.current!, over.current!]){
      c.width = Math.round(width*dpr);
      c.height = Math.round(height*dpr);
      c.style.width = `${width}px`; c.style.height = `${height}px`;
      const ctx = c.getContext("2d")!; ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,width,height);
    }
    first.current = null; last.current = null;
    drawAxes(); drawGuides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, paramsKey]);

  // atualiza ranges explícitos
  useEffect(()=>{
    if(pRange) ranges.current.p = pRange;
    if(vRange) ranges.current.v = vRange;
    drawAxes(); drawGuides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pRange?.[0], pRange?.[1], vRange?.[0], vRange?.[1]]);

  // desenha segmento e marcador
  useEffect(()=>{
    const proj = projector();
    const x = proj.x(point.v), y = proj.y(point.p);

    if(!first.current){ first.current = {x,y}; last.current = {x,y}; drawMarker(x,y); return; }

    const ctx = trail.current!.getContext("2d")!;
    const l = last.current!;
    if(Math.hypot(x-l.x, y-l.y) >= 1.0){
      ctx.strokeStyle = THEME.phase[phase||""] || THEME.trail;
      ctx.lineWidth = 2; ctx.lineCap="round"; ctx.lineJoin="round";
      ctx.beginPath(); ctx.moveTo(l.x,l.y); ctx.lineTo(x,y); ctx.stroke();
      last.current = {x,y};
      // fechamento do ciclo → "selo" de área
      if(Math.hypot(x-first.current.x, y-first.current.y) < 8 &&
         Math.hypot(l.x-first.current.x, l.y-first.current.y) > 30){
         ctx.fillStyle = THEME.fill;
         ctx.beginPath(); ctx.arc(first.current.x, first.current.y, 18, 0, Math.PI*2); ctx.fill();
         first.current = {x,y}; last.current = {x,y};
      }
    }
    drawMarker(x,y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point.p, point.v, phase]);

  function drawAxes(){
    const ctx = over.current!.getContext("2d")!;
    // fundo
    const g = ctx.createLinearGradient(0,0,0,height);
    g.addColorStop(0, THEME.bgTop); g.addColorStop(1, THEME.bgBot);
    ctx.fillStyle=g; ctx.fillRect(0,0,width,height);

    const p = ranges.current.p, v = ranges.current.v;
    const pad = {l:64,r:20,t:24,b:44};
    const gx = (width - pad.l - pad.r);
    const gy = (height - pad.t - pad.b);

    // grid
    ctx.strokeStyle = THEME.grid; ctx.lineWidth = 1;
    const tick = (min:number,max:number,n=6)=>{
      const span=max-min||1; const s0=Math.pow(10,Math.floor(Math.log10(span/n)));
      const cand=[1,2,2.5,5,10].map(k=>k*s0);
      let step=cand[0],best=1e9;
      for(const s of cand){ const k=Math.ceil(max/s)-Math.floor(min/s); const sc=Math.abs(k-n); if(sc<best){best=sc; step=s;}}
      const start=Math.ceil(min/step)*step; const arr:number[]=[];
      for(let x=start; x<=max+1e-12; x+=step) arr.push(+x.toFixed(12));
      return arr;
    };
    const xt= tick(v[0],v[1]), yt=tick(p[0],p[1]);

    const proj = projector();

    // linhas verticais
    for(const vx of xt){ const x = proj.x(vx); ctx.beginPath(); ctx.moveTo(x,pad.t); ctx.lineTo(x,pad.t+gy); ctx.stroke(); }
    // horizontais
    for(const py of yt){ const y = proj.y(py); ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+gx,y); ctx.stroke(); }

    // eixos
    ctx.strokeStyle = THEME.axes; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t+gy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t+gy); ctx.lineTo(pad.l+gx, pad.t+gy); ctx.stroke();

    // labels
    ctx.fillStyle = THEME.text; ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign="right"; ctx.textBaseline="middle";
    for(const py of yt){ const y = proj.y(py); ctx.fillText(formatSI(py,"Pa"), pad.l-8, y); }
    ctx.textAlign="center"; ctx.textBaseline="top";
    for(const vx of xt){ const x = proj.x(vx); ctx.fillText(formatSI(vx,"m³"), x, pad.t+gy+6); }

    ctx.textAlign="left"; ctx.textBaseline="alphabetic";
    ctx.fillText("P–V", pad.l, pad.t-6);
  }

  function drawGuides(){
    if(!guide?.length) return;
    const ctx = over.current!.getContext("2d")!;
    const proj = projector();
    for(const g of guide){
      ctx.save();
      if(g.dash) ctx.setLineDash(g.dash);
      ctx.strokeStyle = g.color; ctx.lineWidth=2;
      ctx.beginPath();
      g.points.forEach((pt,i)=>{
        const x = proj.x(pt.v), y=proj.y(pt.p);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMarker(x:number,y:number){
    drawAxes(); drawGuides();
    const ctx = over.current!.getContext("2d")!;
    ctx.save();
    ctx.strokeStyle="rgba(0,0,0,.25)"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(x,y,7.5,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = THEME.marker;
    ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function projector(){
    const p = ranges.current.p, v = ranges.current.v;
    const pad = {l:64,r:20,t:24,b:44};
    const gx = (width - pad.l - pad.r);
    const gy = (height - pad.t - pad.b);
    const sx = gx / (v[1]-v[0]); const sy = gy / (p[1]-p[0]);
    const x = (V:number)=> pad.l + (V - v[0]) * sx;
    const y = (P:number)=> pad.t + gy - (P - p[0]) * sy;
    return { x, y };
  }

  function formatSI(x:number, unit:string){
    const a=Math.abs(x);
    const pref=[{k:1e9,s:"G"},{k:1e6,s:"M"},{k:1e3,s:"k"},{k:1,s:""},{k:1e-3,s:"m"},{k:1e-6,s:"µ"},{k:1e-9,s:"n"}];
    const p=pref.find(p=>a>=p.k)||pref[pref.length-1];
    return `${(x/p.k).toFixed(2)} ${p.s}${unit}`;
  }

  return (
    <div style={{position:"relative", width, height}}>
      <canvas ref={trail} style={{position:"absolute", inset:0, borderRadius:14, boxShadow:"inset 0 1px 0 rgba(255,255,255,.6), 0 12px 28px rgba(0,0,0,.08)"}}/>
      <canvas ref={over}  style={{position:"absolute", inset:0, borderRadius:14, pointerEvents:"none"}}/>
    </div>
  );
}