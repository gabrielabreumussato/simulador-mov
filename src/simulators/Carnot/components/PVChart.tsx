import React from "react";
import type { PVPoint } from "../sim/physics";

type Seg = { points: {v:number; p:number}[]; color:string; dash?:number[] };

type Props = {
  width:number; 
  height:number;
  segs: Seg[];
  point?: {v:number; p:number};
  scale?: "linear"|"loglog"; // default loglog ajuda a ver adiabáticas nítidas
  dark?: boolean;
  onProjectXNorm?: (xNorm: number) => void;
  paramsKey?: any;
  phase?: string;
  bounds?: { V1:number; V3:number; P1:number };
  referenceHyperbolas?: { points: {v:number; p:number}[]; color:string; strokeWidth:number }[];
};

export default function PVChart({width, height, segs, point, scale="linear", dark=true, onProjectXNorm, paramsKey, phase, bounds, referenceHyperbolas}:Props){
  // --- unidade de apresentação ---
  const vToDisp = (v:number)=> v*1e6;    // m³ → cm³
  const pToDisp = (p:number)=> p/1e6;    // Pa → MPa

  // domínios adaptativos para acomodar todo o ciclo de Carnot
  const allV = segs.flatMap(s=>s.points.map(p=>vToDisp(p.v)));
  const allP = segs.flatMap(s=>s.points.map(p=>pToDisp(p.p)));
  
  const vmin = 0;      // cm³ - sempre começa do zero
  const vmax = Math.max(88, Math.max(...allV) * 1.1) * 0.8; // 20% menor (110 * 0.8 = 88)
  const pmin = 0;      // MPa - sempre começa do zero  
  const pmax = Math.max(20, Math.max(...allP) * 1.1);  // adapta ao ciclo + 10% margem

  const pad = {l:70,r:20,t:28,b:36};
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  
  // SINCRONIZAÇÃO: largura útil do gráfico = largura do recipiente do pistão
  const graphUsableWidth = (width - pad.l - pad.r) * 0.8; // mesmo cálculo do PistonCanvas

  const nx = (x:number)=>
    scale==="loglog" ? (Math.log(x)-Math.log(vmin))/(Math.log(vmax)-Math.log(vmin))
                     : (x - vmin)/(vmax - vmin);
  const ny = (y:number)=>
    scale==="loglog" ? (Math.log(y)-Math.log(pmin))/(Math.log(pmax)-Math.log(pmin))
                     : (y - pmin)/(pmax - pmin);

  const sx = (v:number)=> pad.l + nx(vToDisp(v))*graphUsableWidth; // usa largura sincronizada
  const sy = (p:number)=> pad.t + (1-ny(pToDisp(p)))*H;

  // Callback para sincronização com pistão
  React.useEffect(()=>{
    if(onProjectXNorm && point) {
      const vNorm = nx(vToDisp(point.v));
      onProjectXNorm(Math.max(0, Math.min(1, vNorm)));
    }
  }, [point, onProjectXNorm, vmin, vmax, scale]);

  return (
    <svg width={width} height={height} style={{background: dark?"#0b0f14":"#fff", borderRadius:12, boxShadow:"0 10px 24px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)"}}>
      {/* grid */}
      <g stroke={dark?"#2a3442":"#e5e7eb"} strokeWidth={1}>
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t+H} />
        <line x1={pad.l} y1={pad.t+H} x2={pad.l+graphUsableWidth} y2={pad.t+H} />
        
        {/* Grid lines */}
        {[1,2,3,4,5].map(i => {
          const xx = pad.l + i*graphUsableWidth/5; // usa largura sincronizada
          const yy = pad.t + i*H/5;
          return (
            <g key={i}>
              <line x1={xx} y1={pad.t} x2={xx} y2={pad.t+H} opacity={0.3}/>
              <line x1={pad.l} y1={yy} x2={pad.l+graphUsableWidth} y2={yy} opacity={0.3}/>
            </g>
          );
        })}
      </g>

      {/* hipérboles de referência do App único */}
      {referenceHyperbolas?.map((hyperbola, idx) => (
        <g key={`ref-${idx}`} fill="none" stroke={hyperbola.color} strokeWidth={hyperbola.strokeWidth}>
          <path d={hyperbola.points.reduce((d,pt,j)=>{
            const X = sx(pt.v);
            const Y = sy(pt.p);
            return d + (j?` L ${X} ${Y}`:`M ${X} ${Y}`);
          },"")} />
        </g>
      ))}

      {/* curvas do ciclo */}
      {segs.map((s,i)=>(
        <g key={i} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash?.join(",")}>
          <path d={s.points.reduce((d,pt,j)=>{
            const X=sx(pt.v), Y=sy(pt.p);
            return d + (j?` L ${X} ${Y}`:`M ${X} ${Y}`);
          },"")} />
        </g>
      ))}

      {/* linha pontilhada vertical sincronizada */}
      {point && (
        <g>
          <line 
            x1={sx(point.v)} 
            y1={pad.t} 
            x2={sx(point.v)} 
            y2={pad.t+H} 
            stroke={dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"} 
            strokeWidth={2}
            strokeDasharray="6,6"
          />
          <circle cx={sx(point.v)} cy={sy(point.p)} r={6} fill="#e5e7eb" stroke="rgba(0,0,0,0.4)" strokeWidth={3}/>
        </g>
      )}

      {/* labels e valores de referência */}
      <text x={pad.l} y={20} fill={dark?"#e5e7eb":"#111827"} fontWeight={600} fontSize="16">P×V (Ciclo de Carnot)</text>
      <text x={pad.l-8} y={pad.t-8} fill={dark?"#cbd5e1":"#334155"} textAnchor="end" fontSize="12">P [MPa]</text>
      <text x={pad.l+graphUsableWidth+8} y={pad.t+H+18} fill={dark?"#cbd5e1":"#334155"} textAnchor="start" fontSize="12">V [cm³]</text>
      
      {/* valores de referência nos eixos */}
      {/* Eixo P (vertical) */}
      <text x={pad.l-5} y={pad.t+5} fill={dark?"#94a3b8":"#6b7280"} textAnchor="end" fontSize="10">
        {pmax.toFixed(0)}
      </text>
      <text x={pad.l-5} y={pad.t+H-5} fill={dark?"#94a3b8":"#6b7280"} textAnchor="end" fontSize="10">
        {pmin.toFixed(0)}
      </text>
      
      {/* Eixo V (horizontal) */}
      <text x={pad.l+5} y={pad.t+H+12} fill={dark?"#94a3b8":"#6b7280"} textAnchor="start" fontSize="10">
        {vmin.toFixed(0)}
      </text>
      <text x={pad.l+graphUsableWidth-5} y={pad.t+H+12} fill={dark?"#94a3b8":"#6b7280"} textAnchor="end" fontSize="10">
        {vmax.toFixed(0)}
      </text>
    </svg>
  );
}