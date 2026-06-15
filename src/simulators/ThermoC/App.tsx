import React, { useEffect, useMemo, useRef, useState } from "react";
import PVChart from "./components/PVChart";
import PistonCanvas from "./components/PistonCanvas";
import Controls from "./components/Controls";
import { makeCarnot } from "./sim/physics";
import { contactsFromPhase, volumeToNorm } from "./sim/physics";

export default function App(){
  // parâmetros controláveis
  const [Th, setTh] = useState(800);
  const [Tc, setTc] = useState(300);
  const [n,  setN]  = useState(0.02);
  const [r,  setR]  = useState(6);
  const [rpm,setRpm]= useState(20);
  const [playing, setPlaying] = useState(true);
  const [paramsKey, setParamsKey] = useState(0);

  const simRef = useRef(makeCarnot({Th, Tc, n, r, rpm}));
  const guide = useMemo(()=>{
    const pts = simRef.current.guidePath(80);
    // separe por cores aproximadas (4 pernas iguais)
    const seg = Math.floor(pts.length/4);
    return [
      { points: pts.slice(0, seg+1), color:"#ef4444", dash:[6,6] },        // iso quente
      { points: pts.slice(seg, 2*seg+1), color:"#0ea5e9", dash:[6,6] },    // adiabat
      { points: pts.slice(2*seg, 3*seg+1), color:"#22c55e", dash:[6,6] },  // iso fria
      { points: pts.slice(3*seg).concat([pts[0]]), color:"#0ea5e9", dash:[6,6] }, // adiabat
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  // reset quando parâmetros mudarem
  useEffect(()=>{
    simRef.current = makeCarnot({Th, Tc, n, r, rpm});
    setParamsKey(k=>k+1);
  }, [Th, Tc, n, r, rpm]);

  // loop
  const [pv, setPV] = useState({p: simRef.current.state.p, v: simRef.current.state.V});
  const [phase, setPhase] = useState(simRef.current.state.phase);
  const [theta, setTheta] = useState(simRef.current.state.theta);
  const [metrics, setMetrics] = useState({W:0, Qin:0, Qout:0, eta:0});

  useEffect(()=>{
    let raf = 0; let last = performance.now();
    const tick = ()=>{
      const now = performance.now(); const dt = (now - last)/1000; last = now;
      if(playing){
        simRef.current.step(Math.min(1/60, dt)); // limita dt
        const st = simRef.current.state;
        setPV({p: st.p, v: st.V});
        setPhase(st.phase);
        setTheta(st.theta);
        const eta = st.Qin>1e-12 ? st.W/st.Qin : 0;
        setMetrics({W:st.W, Qin:st.Qin, Qout:st.Qout, eta});
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(raf);
  }, [playing]);

  const contacts = contactsFromPhase(phase as any);
  const norm = volumeToNorm(simRef.current.state.V, simRef.current.state.V1, simRef.current.state.V3);
  const etaCarnot = 1 - Tc/Th;

  return (
    <div className="w-screen h-screen grid grid-cols-[280px_1fr] gap-2 p-2">
      <Controls
        Th={Th} Tc={Tc} n={n} r={r} rpm={rpm}
        onChange={(p)=>{
          if(p.Th!=null) setTh(p.Th);
          if(p.Tc!=null) setTc(p.Tc);
          if(p.n!=null)  setN(p.n);
          if(p.r!=null)  setR(p.r);
          if(p.rpm!=null) setRpm(p.rpm);
        }}
        onPlayPause={()=>setPlaying(v=>!v)} playing={playing}
        onReset={()=>{ setParamsKey(k=>k+1); simRef.current = makeCarnot({Th,Tc,n,r,rpm}); }}
        W={metrics.W} Qin={metrics.Qin} Qout={metrics.Qout} eta={metrics.eta} etaCarnot={etaCarnot}
      />
      <div className="grid grid-rows-[1fr_auto] gap-2">
        <PVChart width={760} height={420} point={pv} phase={phase} guide={guide} paramsKey={paramsKey}/>
        <PistonCanvas theta={theta} heat={(contacts.hot?+1:0) + (contacts.cold?-1:0)} contactHot={contacts.hot} contactCold={contacts.cold}/>
      </div>
    </div>
  );
}