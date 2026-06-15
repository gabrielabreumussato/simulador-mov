import React from "react";

type Props = {
  Th: number; Tc: number; n: number; r: number; rpm: number;
  onChange: (p: Partial<{Th:number;Tc:number;n:number;r:number;rpm:number}>)=>void;
  W: number; Qin: number; Qout: number; etaCarnot: number; eta: number;
  onPlayPause: ()=>void; playing: boolean; onReset: ()=>void;
};

function Row({label, value, unit}:{label:string; value:string; unit?:string}) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", fontSize:14, marginTop:6}}>
      <span style={{opacity:.75}}>{label}</span>
      <span><b>{value}</b></span>
    </div>
  );
}

export default function Controls({
  Th,Tc,n,r,rpm,onChange,W,Qin,Qout,etaCarnot,eta,onPlayPause,playing,onReset
}: Props){
  const s = (label:string, v:number, min:number, max:number, step:number, key:keyof Props)=>{
    return (
      <div style={{margin:"14px 0"}}>
        <div style={{display:"flex", justifyContent:"space-between"}}>
          <label style={{fontWeight:600}}>{label}</label>
          <span style={{opacity:.7}}>{v.toFixed(0)}</span>
        </div>
        <input type="range" min={min} max={max} step={step}
          value={v} onChange={e=>onChange({[key as any]: +e.currentTarget.value})}
          style={{width:"100%"}}/>
      </div>
    );
  };

  return (
    <div style={{width:280, padding:16, background:"#fff", borderRadius:14, boxShadow:"0 10px 24px rgba(0,0,0,.08)"}}>
      <h3 style={{margin:"6px 0 12px 0"}}>Parâmetros</h3>
      {s("T quente (K)", Th, 500, 1200, 10, "Th")}
      {s("T fria (K)", Tc, 250, 500, 10, "Tc")}
      {s("n (mol)", n, 0.005, 0.05, 0.001, "n")}
      {s("r = Vmax/Vmin", r, 2, 10, 0.1, "r")}
      {s("rpm", rpm, 5, 40, 1, "rpm")}
      <div style={{display:"flex", gap:8, marginTop:6}}>
        <button onClick={onPlayPause} style={{flex:1, padding:"8px 10px", borderRadius:10, border:"1px solid #cbd5e1", background:"#f8fafc"}}>
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={onReset} style={{flex:1, padding:"8px 10px", borderRadius:10, border:"1px solid #cbd5e1", background:"#fff"}}>
          Reset
        </button>
      </div>

      <h3 style={{margin:"18px 0 8px 0"}}>Resultados</h3>
      <Row label="W por ciclo" value={`${(W).toFixed(2)} J`} />
      <Row label="Q_in" value={`${(Qin).toFixed(2)} J`} />
      <Row label="Q_out" value={`${(Qout).toFixed(2)} J`} />
      <Row label="η (simulado)" value={`${(eta*100).toFixed(1)} %`} />
      <Row label="η_Carnot" value={`${(etaCarnot*100).toFixed(1)} %`} />
    </div>
  );
}