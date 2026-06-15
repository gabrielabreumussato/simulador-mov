import React from "react";

type Props = {
  Th: number; Tc: number; rpm: number; gamma: number;
  onChange: (p: Partial<{Th:number;Tc:number;rpm:number;gamma:number}>)=>void;
  W: number; Qin: number; Qout: number; etaCarnot: number; eta: number;
  onPlayPause: ()=>void; playing: boolean; onReset: ()=>void;
  // leituras instantâneas
  pCurr?: number; vCurr?: number; TCurr?: number;
};

function Row({label, value}:{label:string; value:string}) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", fontSize:14, marginTop:6}}>
      <span style={{opacity:.8}}>{label}</span>
      <span><b>{value}</b></span>
    </div>
  );
}

const PANEL = {
  bg: "#0f1520",           // mesmo do seu app de campo
  ring: "#1f2937",         // slate-800 (ring)
  text: "#e2e8f0",         // slate-200
  subtext: "rgba(226,232,240,.75)",
  btnBg: "#121a24",
  btnBg2: "#0f172a",       // alternativa sutil
  btnText: "#e5e7eb",
  sliderTrack: "#1f2937",
  sliderFill: "#3b82f6"
};

export default function Controls({
  Th,Tc,rpm,gamma,onChange,W,Qin,Qout,etaCarnot,eta,onPlayPause,playing,onReset,pCurr,vCurr,TCurr
}: Props){
  const slider = (label:string, v:number, min:number, max:number, step:number, key:keyof Props, unit?:string)=>{
    return (
      <div style={{margin:"14px 0"}}>
        <div style={{display:"flex", justifyContent:"space-between", color:PANEL.text}}>
          <label style={{fontWeight:600}}>{label}</label>
          <span style={{opacity:.8}}>{unit ? `${v.toFixed(0)} ${unit}` : v.toFixed(0)}</span>
        </div>
        {/* input range estilizado no tema escuro */}
        <input
          type="range" min={min} max={max} step={step} value={v}
          onChange={e=>onChange({[key as any]: +e.currentTarget.value})}
          style={{
            width:"100%", height:6, appearance:"none", background:PANEL.sliderTrack,
            borderRadius:999, outline:"none"
          }}
        />
        <style>{`
          input[type="range"]::-webkit-slider-thumb{
            -webkit-appearance:none; appearance:none;
            width:16px; height:16px; border-radius:999px;
            background:${PANEL.sliderFill}; border:2px solid #93c5fd; cursor:pointer;
            margin-top:-5px;
          }
          input[type="range"]::-moz-range-thumb{
            width:16px; height:16px; border-radius:999px;
            background:${PANEL.sliderFill}; border:2px solid #93c5fd; cursor:pointer;
          }
          input[type="range"]::-webkit-slider-runnable-track{
            height:6px; border-radius:999px; background:${PANEL.sliderTrack};
          }
          input[type="range"]::-moz-range-track{
            height:6px; border-radius:999px; background:${PANEL.sliderTrack};
          }
        `}</style>
      </div>
    );
  };

  const button = (label:string, onClick:()=>void, kind:"primary"|"ghost"="primary")=>{
    const bg = kind==="primary" ? PANEL.btnBg : PANEL.btnBg2;
    const bd = kind==="primary" ? "#243041" : "#1f2937";
    return (
      <button
        onClick={onClick}
        style={{
          flex:1, padding:"8px 10px", borderRadius:10, border:`1px solid ${bd}`,
          background:bg, color:PANEL.btnText, fontWeight:600, boxShadow:"0 8px 20px rgba(0,0,0,.25)"
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        width:280, padding:16, background:PANEL.bg, color:PANEL.text,
        borderRadius:14, boxShadow:"0 14px 28px rgba(0,0,0,.35)", border:`1px solid ${PANEL.ring}`
      }}
    >
      <h3 style={{margin:"6px 0 12px 0"}}>Par�metros</h3>

      {slider("T quente (K)", Th, 500, 1200, 10, "Th")}
      {slider("T fria (K)",   Tc, 250,  600, 10, "Tc")}
      {slider("γ (gamma)",    gamma, 1.1, 1.67, 0.01, "gamma")}
      {slider("rpm",          rpm,5, 40, 1, "rpm")}

      <div style={{display:"flex", gap:8, marginTop:8}}>
        {button(playing ? "Pause" : "Play", onPlayPause, "primary")}
        {button("Reset", onReset, "ghost")}
      </div>

      {/* escala removida - sempre linear */}

      <h3 style={{margin:"18px 0 8px 0"}}>Estado atual</h3>
      <Row label="p" value={typeof pCurr==="number" ? `${(pCurr/1e6).toFixed(2)} MPa` : "—"} />
      <Row label="V" value={typeof vCurr==="number" ? `${(vCurr*1e6).toFixed(1)} cm³` : "—"} />
      <Row label="T" value={typeof TCurr==="number" ? `${TCurr.toFixed(0)} K` : "—"} />

      <h3 style={{margin:"18px 0 8px 0"}}>Resultados</h3>
      <Row label="W por ciclo" value={`${(W).toFixed(2)} J`} />
      <Row label="Q_in"        value={`${(Qin).toFixed(2)} J`} />
      <Row label="Q_out"       value={`${(Qout).toFixed(2)} J`} />
      <Row label="� (simulado)" value={`${(eta*100).toFixed(1)} %`} />
      <Row label="�_Carnot"     value={`${(etaCarnot*100).toFixed(1)} %`} />

      <div style={{marginTop:14, fontSize:12, color:PANEL.subtext}}>
        * Cores e bordas iguais ao seu painel (bg <code>#0f1520</code>, ring <code>#1f2937</code>, texto claro).
      </div>
    </div>
  );
}