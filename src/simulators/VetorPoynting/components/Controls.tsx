import React from "react";

const THEME = {
  panelBg: "#0f1520",
  ring: "#1f2937",
  text: "#e2e8f0",
  sub: "rgba(226,232,240,.7)",
  btnBg: "#121a24",
  btnBg2: "#0f172a",
  btnText: "#e5e7eb",
  sliderTrack: "#1f2937",
  sliderFill: "#3b82f6",
  switchOpen: "#c2410c",
  switchClosed: "#16a34a",
};

type Props = {
  V: number; setV: (v: number) => void;
  R: number; setR: (r: number) => void;
  Lsim: number; setLsim: (l: number) => void;
  vProp: number; setVprop: (v: number) => void;
  showCharges: boolean; setShowCharges: (s: boolean) => void;
  showE: boolean; setShowE: (s: boolean) => void;
  showB: boolean; setShowB: (s: boolean) => void;
  showS: boolean; setShowS: (s: boolean) => void;
  switchClosed: boolean;
  onToggleSwitch: () => void;
  I: number;
  Pinst: number;
  Imax: number;
  tau: number;
};

function Row({label, value}:{label:string; value:string}) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", fontSize:14, marginTop:6}}>
      <span style={{opacity:.8}}>{label}</span>
      <span><b>{value}</b></span>
    </div>
  );
}

export default function Controls({
  V, setV, R, setR, Lsim, setLsim, vProp, setVprop,
  showCharges, setShowCharges, showE, setShowE, showB, setShowB, showS, setShowS,
  switchClosed, onToggleSwitch, I, Pinst, Imax, tau
}: Props) {

  const slider = (label:string, v:number, min:number, max:number, step:number, onChange:(val:number)=>void, unit?:string)=>{
    const displayValue = unit === "μH" ? (v * 1e6).toFixed(1) : 
                        unit === "mA" ? (v * 1000).toFixed(1) :
                        unit === "mW" ? (v * 1000).toFixed(1) :
                        unit === "μs" ? (v * 1e6).toFixed(1) :
                        v.toFixed(1);
    
    return (
      <div style={{margin:"14px 0"}}>
        <div style={{display:"flex", justifyContent:"space-between", color:THEME.text}}>
          <label style={{fontWeight:600}}>{label}</label>
          <span style={{opacity:.8}}>{unit ? `${displayValue} ${unit}` : displayValue}</span>
        </div>
        <input
          type="range" min={min} max={max} step={step} value={v}
          onChange={e=>onChange(+e.currentTarget.value)}
          style={{
            width:"100%", height:6, appearance:"none", background:THEME.sliderTrack,
            borderRadius:999, outline:"none"
          }}
        />
        <style>{`
          input[type="range"]::-webkit-slider-thumb{
            -webkit-appearance:none; appearance:none;
            width:16px; height:16px; border-radius:999px;
            background:${THEME.sliderFill}; border:2px solid #93c5fd; cursor:pointer;
            margin-top:-5px;
          }
          input[type="range"]::-moz-range-thumb{
            width:16px; height:16px; border-radius:999px;
            background:${THEME.sliderFill}; border:2px solid #93c5fd; cursor:pointer;
          }
          input[type="range"]::-webkit-slider-runnable-track{
            height:6px; border-radius:999px; background:${THEME.sliderTrack};
          }
          input[type="range"]::-moz-range-track{
            height:6px; border-radius:999px; background:${THEME.sliderTrack};
          }
        `}</style>
      </div>
    );
  };

  const toggle = (label:string, checked:boolean, onChange:(val:boolean)=>void)=>{
    return (
      <div style={{margin:"12px 0", display:"flex", alignItems:"center", gap:8}}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e=>onChange(e.currentTarget.checked)}
          style={{width:16, height:16}}
        />
        <label style={{color:THEME.text, fontSize:14}}>{label}</label>
      </div>
    );
  };

  const button = (label:string, onClick:()=>void, active:boolean)=>{
    const bg = active ? THEME.switchClosed : THEME.switchOpen;
    return (
      <button
        onClick={onClick}
        style={{
          width:"100%", padding:"12px", borderRadius:10, border:"none",
          background:bg, color:THEME.btnText, fontWeight:600, 
          boxShadow:"0 8px 20px rgba(0,0,0,.25)", cursor:"pointer",
          fontSize:16
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        width:280, padding:16, background:THEME.panelBg, color:THEME.text,
        borderRadius:14, boxShadow:"0 14px 28px rgba(0,0,0,.35)", border:`1px solid ${THEME.ring}`,
        height:"fit-content"
      }}
    >
      <h3 style={{margin:"6px 0 12px 0"}}>Vetor de Poynting</h3>

      {/* Interruptor */}
      <div style={{margin:"16px 0"}}>
        {button(switchClosed ? "🔗 Circuito FECHADO" : "⚡ Circuito ABERTO", onToggleSwitch, switchClosed)}
      </div>

      {/* Parâmetros do circuito */}
      <h4 style={{margin:"18px 0 8px 0", fontSize:14, opacity:0.8}}>Parâmetros</h4>
      {slider("Tensão", V, 1, 15, 0.1, setV, "V")}
      {slider("Resistência", R, 0.5, 10, 0.1, setR, "Ω")}
      {slider("Indutância", Lsim, 1e-6, 20e-6, 1e-7, setLsim, "μH")}
      {slider("Velocidade prop.", vProp, 50, 400, 10, setVprop, "px/s")}

      {/* Visualização */}
      <h4 style={{margin:"18px 0 8px 0", fontSize:14, opacity:0.8}}>Mostrar</h4>
      {toggle("Cargas móveis", showCharges, setShowCharges)}
      {toggle("Campo E (vermelho)", showE, setShowE)}
      {toggle("Campo B (azul)", showB, setShowB)}
      {toggle("Vetor S (amarelo)", showS, setShowS)}

      {/* Leituras */}
      <h4 style={{margin:"18px 0 8px 0", fontSize:14, opacity:0.8}}>Leituras</h4>
      <Row label="I atual" value={`${(I*1000).toFixed(1)} mA`} />
      <Row label="I máximo" value={`${(Imax*1000).toFixed(1)} mA`} />
      <Row label="Potência" value={`${(Pinst*1000).toFixed(1)} mW`} />
      <Row label="τ = L/R" value={`${(tau*1e6).toFixed(1)} μs`} />

      <div style={{marginTop:16, fontSize:12, color:THEME.sub, lineHeight:1.4}}>
        <p><strong>S = E × B / μ₀</strong></p>
        <p>O vetor de Poynting mostra o fluxo de energia eletromagnética.</p>
        <p>Campo E tangencial aos fios, B circular ao redor da corrente.</p>
      </div>
    </div>
  );
}