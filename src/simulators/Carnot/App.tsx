import React, { useEffect, useState } from "react";
import PVChart from "./components/PVChart";
import PistonCanvas from "./components/PistonCanvas";
import Controls from "./components/Controls";

// --- util ---
const R = 8.314462618; // J/(mol·K)

function clamp(x:number, a:number, b:number){ return Math.max(a, Math.min(b, x)); }

type Point = { v:number; p:number; T:number };
type CycleGeom = {
  A:Point; B:Point; C:Point; D:Point;
  V1:number; V2:number; V3:number; V4:number;
  Khot:number; Kcold:number; Kbc:number; Kda:number;
  segs:{ points:{v:number;p:number}[]; color:string; dash:number[] }[];
  refHyp:{ points:{v:number;p:number}[]; color:string; strokeWidth:number }[];
  bounds:{ vmin:number; vmax:number; pmin:number; pmax:number };
};

function buildCarnot(Th:number, Tc:number, gamma:number, n:number, r=4): CycleGeom {
  // CARNOT CORRETO: V1,V2 fixos, V3,V4 calculados pela física
  const Vmin_cm3 = 10;  // cm³ (volume mínimo fixo)
  const Vmax_cm3 = 100; // cm³ (volume máximo fixo)
  const V1 = Vmin_cm3 * 1e-6; // m³ - ponto A (compressão máxima)
  const V2 = Vmax_cm3 * 1e-6; // m³ - ponto B (expansão máxima)

  // Fator adiabático Carnot: V3/V2 = V4/V1 = (Th/Tc)^{1/(γ-1)}
  const k = Math.pow(Th/Tc, 1/(gamma-1));
  const V3 = V2 * k; // Volume após expansão adiabática B→C
  const V4 = V1 * k; // Volume após compressão adiabática D→A

  const Khot  = n*R*Th; // p·v = n R T
  const Kcold = n*R*Tc;

  const A:Point = { v:V1, p:Khot/V1, T:Th };
  const B:Point = { v:V2, p:Khot/V2, T:Th };
  const C:Point = { v:V3, p:Kcold/V3, T:Tc };
  const D:Point = { v:V4, p:Kcold/V4, T:Tc };

  // Constantes adiabáticas corretas do Carnot
  const Kbc = B.p*Math.pow(B.v, gamma); // B→C: expansão adiabática  
  const Kda = D.p*Math.pow(D.v, gamma); // D→A: compressão adiabática

  // Amostragem dos 4 trechos
  const sampleIso = (K:number, v0:number, v1:number, steps=180)=>{
    const out:{v:number;p:number}[]=[]; for(let i=0;i<=steps;i++){
      const t=i/steps, v=v0+(v1-v0)*t; out.push({v, p:K/v});
    } return out;
  };
  const sampleAd = (K:number, v0:number, v1:number, γ:number, steps=140)=>{
    const out:{v:number;p:number}[]=[]; for(let i=0;i<=steps;i++){
      const t=i/steps, v=v0+(v1-v0)*t; out.push({v, p:K/Math.pow(v,γ)});
    } return out;
  };

  const redIso   = sampleIso(Khot,  Math.min(A.v,B.v), Math.max(A.v,B.v));
  const greenIso = sampleIso(Kcold, Math.min(C.v,D.v), Math.max(C.v,D.v));
  const adBC     = sampleAd(Kbc, B.v, C.v, gamma);
  const adDA     = sampleAd(Kda, D.v, A.v, gamma);

  // Hipérboles de referência brancas (5 níveis ajustados para escala comprimida)
  const refHyp:CycleGeom["refHyp"]=[];
  for(const level of [1,2,3,4,5]){
    const K_ref = level * 300; // Constante K reduzida para escala comprimida
    const pts:{v:number;p:number}[]=[];
    for(let i=0;i<=180;i++){
      const t=i/180;
      const v_cm3 = 5 + (105)*t; // 5 a 110 cm³ (faixa completa do gráfico)
      const p_MPa = K_ref / v_cm3;    // P = K/V
      if(p_MPa >= 0.1 && p_MPa <= 20) { // dentro da nova faixa comprimida
        const v_m3 = v_cm3 * 1e-6;    // conversão para m³
        const p_Pa = p_MPa * 1e6;     // conversão para Pa
        pts.push({ v:v_m3, p:p_Pa });
      }
    }
    if(pts.length>5) refHyp.push({ points:pts, color:"rgba(255,255,255,0.35)", strokeWidth:1 });
  }

  return {
    A,B,C,D, V1,V2,V3,V4, Khot,Kcold, Kbc,Kda,
    segs: [
      { points:redIso,   color:"#ef4444", dash:[6,6] }, // AB (isoterma quente)
      { points:adBC,     color:"#0ea5e9", dash:[6,6] }, // BC (adiabática)
      { points:greenIso, color:"#22c55e", dash:[6,6] }, // CD (isoterma fria)
      { points:adDA,     color:"#0ea5e9", dash:[6,6] }, // DA (adiabática)
    ],
    refHyp,
    bounds:{ vmin:V1, vmax:V2, pmin:0, pmax:20e6 }
  };
}

// Parametrização temporal do ponto no ciclo (u ∈ [0,1))
function pvTAtU(u:number, cyc:CycleGeom, gamma:number, weights={isoHot:0.25, adi12:0.25, isoCold:0.25, adi41:0.25}){
  const {A,B,C,D,Khot,Kcold,Kbc,Kda} = cyc;
  const w1=weights.isoHot, w2=weights.adi12, w3=weights.isoCold, w4=weights.adi41;
  const s1=w1, s2=w1+w2, s3=w1+w2+w3; 
  
  let phase:"hot"|"ad1"|"cold"|"ad2"="hot";

  if(u<s1){ // A→B isoterma quente (expansão)
    phase="hot";
    const t=u/w1, v=A.v+(B.v-A.v)*t; 
    return { v, p:Khot/v, T:A.T, phase };
  } else if(u<s2){ // B→C adiabática (expansão)
    phase="ad1"; 
    const t=(u-s1)/w2, v=B.v+(C.v-B.v)*t; 
    const p = Kbc/Math.pow(v,gamma);
    const T = p*v/(0.03*8.314); // pV = nRT
    return { v, p, T, phase };
  } else if(u<s3){ // C→D isoterma fria (compressão)
    phase="cold"; 
    const t=(u-s2)/w3, v=C.v+(D.v-C.v)*t; 
    return { v, p:Kcold/v, T:C.T, phase };
  } else { // D→A adiabática (compressão)
    phase="ad2"; 
    const t=(u-s3)/w4, v=D.v+(A.v-D.v)*t; 
    const p = Kda/Math.pow(v,gamma);
    const T = p*v/(0.03*8.314); // pV = nRT
    return { v, p, T, phase };
  }
}

export default function App(){
  // *** parâmetros do ciclo matemático ***
  const [Th, setTh]   = useState(600);      // K - temperatura quente
  const [Tc, setTc]   = useState(400);      // K - temperatura fria
  const [rpm,setRpm]  = useState(20);       // rotações por minuto
  const [gamma, setGamma] = useState(1.4);  // γ para gás diatômico
  // removido scale - sempre linear
  const [playing, setPlaying] = useState(true);
  const [paramsKey, setParamsKey] = useState(0);

  const WEIGHTS = { isoHot: 0.25, adi12: 0.25, isoCold: 0.25, adi41: 0.25 };
  const n = 0.03;

  const { guideSegs, chartData, cycle } = React.useMemo(()=>{
    const cycle = buildCarnot(Th, Tc, gamma, n, /*r=*/4); // r=4 abre bem o gráfico
    return {
      guideSegs: cycle.segs,
      chartData: { 
        vmin: cycle.bounds.vmin*1e9, vmax: cycle.bounds.vmax*1e9, 
        pmin: cycle.bounds.pmin/1e3,  pmax: cycle.bounds.pmax/1e3,
        referenceHyperbolas: cycle.refHyp
      },
      cycle
    };
  }, [Th, Tc, gamma, /*r fixo*/]);

  const [theta, setTheta] = useState(0);
  const [phase, setPhase] = useState<"hot"|"ad1"|"cold"|"ad2">("hot");
  const [pv, setPV] = useState({p:0, v:0});
  const [pvtCurr, setPvtCurr] = useState({p:0, v:0, T:0});
  const [xNorm, setXNorm] = useState(0.5);

  // métricas por ciclo (fixas enquanto Th/Tc/gamma não mudarem)
  const ln_r = Math.log(4);
  const Qin_fix  = n*R*Th*ln_r;
  const Qout_fix = n*R*Tc*ln_r;
  const W_fix    = Qin_fix - Qout_fix;
  const etaCarnot = 1 - Tc/Th;

  useEffect(()=>{
    let raf=0, last=performance.now();
    const tick=()=>{
      const now = performance.now(); const dt=(now-last)/1000; last=now;
      if(playing){
        const ω = 2*Math.PI*(rpm/60); // rad/s
        setTheta(prevTheta => {
          const newTheta = prevTheta + ω*dt;
          const u = (newTheta/(2*Math.PI)) % 1;
          const s = pvTAtU(u, cycle, gamma, WEIGHTS);
          setPV({p:s.p, v:s.v});
          setPvtCurr({p:s.p, v:s.v, T:s.T});
          setPhase(s.phase);
          return newTheta;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf);
  }, [playing, rpm, gamma, cycle]);

  // Conversão de fase para contatos
  const contacts = { hot: phase==="hot", cold: phase==="cold" };
  const norm = Math.max(0, Math.min(1, (pv.v - cycle.V1) / (cycle.V2 - cycle.V1))); // 0..1 entre Vmin e Vmax

  return (
    <div className="w-screen h-screen grid grid-cols-[280px_1fr] gap-2 p-2">
      <Controls
        Th={Th} Tc={Tc} rpm={rpm} gamma={gamma}
        onChange={(p)=>{
          if(p.Th!=null) setTh(p.Th);
          if(p.Tc!=null) setTc(p.Tc);
          if(p.rpm!=null) setRpm(p.rpm);
          if(p.gamma!=null) setGamma(p.gamma);
        }}
        onPlayPause={()=>setPlaying(v=>!v)} playing={playing}
        onReset={()=> setParamsKey(k=>k+1)}
        // fixos por ciclo:
        W={W_fix} Qin={Qin_fix} Qout={Qout_fix} eta={W_fix/Math.max(Qin_fix,1e-12)} etaCarnot={etaCarnot}
        // leituras instantâneas
        pCurr={pvtCurr.p} vCurr={pvtCurr.v} TCurr={pvtCurr.T}
      />
      <div className="grid grid-rows-[1fr_auto] gap-2">
        <PVChart
          width={760}
          height={420}
          segs={guideSegs}
          point={{ v: pv.v, p: pv.p }}        // ponto matemático do ciclo
          scale="linear"
          bounds={{ V1: cycle.V1, V3: cycle.V3, P1: cycle.A.p }}
          paramsKey={paramsKey}
          phase={phase}
          referenceHyperbolas={chartData.referenceHyperbolas}
          onProjectXNorm={(vNorm)=> setXNorm(vNorm)}
        />
        <PistonCanvas
          width={760}
          height={200}
          theta={theta}
          norm={norm} // 0..1 usando Vmin..Vmax do ciclo
          heat={(phase==="hot"?+1:0) + (phase==="cold"?-1:0)}
          contactHot={phase==="hot"}
          contactCold={phase==="cold"}
          linkXNorm={xNorm}
        />
      </div>
    </div>
  );
}