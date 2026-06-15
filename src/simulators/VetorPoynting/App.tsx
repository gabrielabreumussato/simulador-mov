// App.tsx — Simulador didático de Poynting (linhas E/B/S em "3D")
// Somente um arquivo. Sem cargas visíveis; apenas linhas de campo em perspectiva.

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ================= Temas / UI ================= */
const THEME = {
  panelBg: "#0f1520",
  ring: "#1f2937",
  text: "#e2e8f0",
  sub: "rgba(226,232,240,.7)",
  btnText: "#e5e7eb",
  sliderTrack: "#1f2937",
  sliderFill: "#3b82f6",
  switchOpen: "#c2410c",
  switchClosed: "#16a34a",
};

/* =============== Util / Física básica =============== */
const MU0 = 4e-7 * Math.PI;   // μ0
const RHO_CU = 1.724e-8;      // resistividade cobre ~ 1.724e-8 Ω·m (não usamos σ explicitamente aqui)

function clamp(x:number,a:number,b:number){ return Math.max(a, Math.min(b, x)); }

/* =============== Projeção 3D simples =============== */
// câmera pinhole
type Vec3 = {x:number;y:number;z:number};
type Vec2 = {x:number;y:number};
type Cam = {f:number; cx:number; cy:number; zcam:number};

function project(p:Vec3, cam:Cam): Vec2 {
  const z = (p.z - cam.zcam);
  const k = cam.f / (z <= 1 ? 1 : z);
  return { x: cam.cx + p.x*k, y: cam.cy + p.y*k };
}

// rotação rápida no eixo X/Z para inclinar a cena (efeito 3D)
function rotY(p:Vec3, ang:number): Vec3 {
  const s=Math.sin(ang), c=Math.cos(ang);
  return { x:c*p.x + s*p.z, y:p.y, z:-s*p.x + c*p.z };
}
function rotX(p:Vec3, ang:number): Vec3 {
  const s=Math.sin(ang), c=Math.cos(ang);
  return { x:p.x, y:c*p.y - s*p.z, z:s*p.y + c*p.z };
}

/* =============== Geometria do circuito 3D =============== */
/*
   Loop retangular no plano X–Y com leve curvatura Z para dar profundidade.
   – Bateria: segmento curto no lado esquerdo
   – Resistor: segmento curto no lado direito
   – Fio espesso (raio ~ 24 px na tela)
*/
type Segment = { A:Vec3; B:Vec3; kind:"wire"|"battery"|"resistor" };
type LoopGeom = {
  segs: Segment[];
  wireRadius: number;       // raio do fio (em px de cena; só para escala visual)
  logicalRadius: number;    // raio "físico" (m) para cálculo aproximado
  bbox: {x0:number;x1:number;y0:number;y1:number;z0:number;z1:number};
};

function buildLoopGeometry(): LoopGeom {
  // dimensão "mundo" em unidades arbitrárias; depois o pinhole escala
  const W = 6.0, H = 3.2;  // largura e altura do retângulo base (mundo)
  const Zbow = 0.9;        // arqueamento no eixo Z (para dar volume)
  const batterySpan = 1.2; // tamanho do elemento bateria no lado esquerdo
  const resistorSpan = 1.2;// tamanho do elemento resistor no lado direito

  // pontos chaves (retângulo com leve curvatura em Z)
  const leftX = -W/2, rightX = W/2, topY = -H/2, botY = H/2;

  // trechos: começar no topo-esquerda e seguir horário
  const segs: Segment[] = [];

  // topo esquerdo: BATERIA (curto)
  segs.push({
    A: {x:leftX, y:topY, z: -Zbow}, 
    B: {x:leftX, y:topY + batterySpan, z: -Zbow*0.7},
    kind:"battery"
  });
  // canto superior: fio
  segs.push({
    A: {x:leftX, y:topY + batterySpan, z: -Zbow*0.7},
    B: {x:rightX, y:topY, z: -Zbow},
    kind:"wire"
  });
  // lado direito: RESISTOR (curto)
  segs.push({
    A: {x:rightX, y:topY, z:-Zbow},
    B: {x:rightX, y:topY + resistorSpan, z:-Zbow*0.4},
    kind:"resistor"
  });
  // descida direita: fio
  segs.push({
    A: {x:rightX, y:topY + resistorSpan, z:-Zbow*0.4},
    B: {x:rightX, y:botY, z: Zbow},
    kind:"wire"
  });
  // base: fio
  segs.push({
    A: {x:rightX, y:botY, z: Zbow},
    B: {x:leftX, y:botY, z: Zbow*0.7},
    kind:"wire"
  });
  // subida esquerda: fio até voltar ao topo-esquerda (fecha no ponto da bateria)
  segs.push({
    A: {x:leftX, y:botY, z: Zbow*0.9},
    B: {x:leftX, y:topY, z:-Zbow},
    kind:"wire"
  });

  const bbox = {x0:leftX, x1:rightX, y0:topY, y1:botY, z0:-Zbow, z1:Zbow};
  return { segs, wireRadius: 24, logicalRadius: 4e-3, bbox };
}

/* =============== Controles (no próprio arquivo) =============== */
function Row({label, value}:{label:string; value:string}) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", fontSize:14, marginTop:6}}>
      <span style={{opacity:.8}}>{label}</span>
      <span><b>{value}</b></span>
    </div>
  );
}

function Controls({
  V,R,Lsim,vProp, setV,setR,setLsim,setVprop,
  showE,setShowE, showB,setShowB, showS,setShowS,
  switchClosed, onToggleSwitch,
  I, Imax, Pinst, tau
}:{
  V:number; R:number; Lsim:number; vProp:number;
  setV:(n:number)=>void; setR:(n:number)=>void; setLsim:(n:number)=>void; setVprop:(n:number)=>void;
  showE:boolean; setShowE:(b:boolean)=>void;
  showB:boolean; setShowB:(b:boolean)=>void;
  showS:boolean; setShowS:(b:boolean)=>void;
  switchClosed:boolean; onToggleSwitch:()=>void;
  I:number; Imax:number; Pinst:number; tau:number;
}){
  const slider = (label:string, v:number, min:number, max:number, step:number, onChange:(val:number)=>void, unit?:string)=>{
    const display = unit==="μH" ? (v*1e6).toFixed(1) :
                    unit==="μs" ? (v*1e6).toFixed(1) : v.toFixed(2);
    return (
      <div style={{margin:"14px 0"}}>
        <div style={{display:"flex", justifyContent:"space-between", color:THEME.text}}>
          <label style={{fontWeight:600}}>{label}</label>
          <span style={{opacity:.8}}>{unit ? `${display} ${unit}` : display}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={v}
          onChange={e=>onChange(+e.currentTarget.value)}
          style={{width:"100%", height:6, appearance:"none", background:THEME.sliderTrack, borderRadius:999, outline:"none"}}/>
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

  return (
    <div
      style={{
        width:280, padding:16, background:THEME.panelBg, color:THEME.text,
        borderRadius:14, boxShadow:"0 14px 28px rgba(0,0,0,.35)", border:`1px solid ${THEME.ring}`
      }}
    >
      <h3 style={{margin:"6px 0 12px 0"}}>Vetor de Poynting</h3>

      <div style={{margin:"16px 0"}}>
        <button onClick={onToggleSwitch}
          style={{
            width:"100%", padding:"12px", borderRadius:10, border:"none",
            background: switchClosed?THEME.switchClosed:THEME.switchOpen,
            color:THEME.btnText, fontWeight:700, boxShadow:"0 8px 20px rgba(0,0,0,.25)", cursor:"pointer"
          }}>
          {switchClosed ? "🔗 Circuito FECHADO" : "⚡ Circuito ABERTO"}
        </button>
      </div>

      <h4 style={{margin:"18px 0 8px 0", fontSize:14, opacity:0.8}}>Parâmetros</h4>
      {slider("Tensão V", V, 1, 15, 0.1, setV, "V")}
      {slider("Resistência R", R, 0.5, 20, 0.1, setR, "Ω")}
      {slider("Indutância L", Lsim, 0.2e-6, 40e-6, 0.1e-6, setLsim, "μH")}
      {slider("Velocidade da animação", vProp, 40, 400, 10, setVprop, "px/s")}

      <h4 style={{margin:"18px 0 8px 0", fontSize:14, opacity:0.8}}>Mostrar</h4>
      <div style={{display:"grid", gap:8}}>
        <label><input type="checkbox" checked={showE} onChange={e=>setShowE(e.currentTarget.checked)} /> Campo E (vermelho)</label>
        <label><input type="checkbox" checked={showB} onChange={e=>setShowB(e.currentTarget.checked)} /> Campo B (azul)</label>
        <label><input type="checkbox" checked={showS} onChange={e=>setShowS(e.currentTarget.checked)} /> Vetor S (amarelo)</label>
      </div>

      <h4 style={{margin:"18px 0 8px 0", fontSize:14, opacity:0.8}}>Leituras</h4>
      <Row label="I atual" value={`${(I*1000).toFixed(1)} mA`} />
      <Row label="I máx = V/R" value={`${( (V/R)*1000 ).toFixed(1)} mA`} />
      <Row label="Potência = I²R" value={`${( (I*I*R)*1000 ).toFixed(1)} mW`} />
      <Row label="τ = L/R" value={`${( (Lsim/R)*1e6 ).toFixed(1)} μs`} />

      <div style={{marginTop:16, fontSize:12, color:THEME.sub}}>
        S = (1/μ₀) E × B. Fora do fio, S aponta para dentro do fio e flui ao longo dele até entrar no resistor.
      </div>
    </div>
  );
}

/* =============== Renderizador de linhas 3D (Canvas) =============== */
function drawArrow(ctx:CanvasRenderingContext2D, x:number,y:number, dx:number,dy:number, len=8){
  const ang = Math.atan2(dy,dx);
  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.lineTo(x - len*Math.cos(ang - Math.PI/7), y - len*Math.sin(ang - Math.PI/7));
  ctx.moveTo(x,y);
  ctx.lineTo(x - len*Math.cos(ang + Math.PI/7), y - len*Math.sin(ang + Math.PI/7));
  ctx.stroke();
}

function lerp(a:number,b:number,t:number){ return a+(b-a)*t; }

/* =============== App principal =============== */
export default function App(){
  // parâmetros do circuito / animação
  const [V, setV] = useState(6);
  const [R, setR] = useState(4);
  const [Lsim, setLsim] = useState(6e-6);
  const [vProp, setVprop] = useState(160);

  const [showE, setShowE] = useState(true);
  const [showB, setShowB] = useState(true);
  const [showS, setShowS] = useState(true);

  const [switchClosed, setSwitchClosed] = useState(false);

  const loop = useMemo(()=>buildLoopGeometry(),[]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // dinâmica RL simples
  const Imax = V / R;
  const tau = Lsim / R;

  const [I, setI] = useState(0);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());

  useEffect(()=>{
    lastRef.current = performance.now();
  }, [V,R,Lsim,switchClosed]);

  useEffect(()=>{
    let raf=0;
    const tick = ()=>{
      const now = performance.now();
      const dt = (now - lastRef.current)/1000;
      lastRef.current = now;

      // RL: sobe para Imax se fechado; decai para 0 se aberto
      if(switchClosed){
        setI(i=> i + (Imax - i) * (1 - Math.exp(-dt/tau)) );
      }else{
        setI(i=> i * Math.exp(-dt/tau));
      }
      tRef.current += dt;

      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(raf);
  }, [switchClosed, Imax, tau, showE, showB, showS, vProp]);

  function draw(){
    const cnv = canvasRef.current!;
    const dpr = Math.max(1, Math.floor(devicePixelRatio||1));
    const W = 760, H = 440;
    cnv.width = W*dpr; cnv.height = H*dpr; cnv.style.width = `${W}px`; cnv.style.height = `${H}px`;
    const ctx = cnv.getContext("2d")!; ctx.setTransform(dpr,0,0,dpr,0,0);

    // bg
    const grd = ctx.createLinearGradient(0,0,0,H);
    grd.addColorStop(0,"#0b0f14"); grd.addColorStop(1,"#0d1117");
    ctx.fillStyle = grd; ctx.fillRect(0,0,W,H);

    // câmera
    const cam:Cam = { f: 240, cx: W*0.52, cy: H*0.52, zcam: -8.0 };

    // inclinação "3D"
    const tiltX = -0.7;
    const tiltY =  0.22;

    // helpers de projeção após rotações
    const P = (p:Vec3)=> project(rotY(rotX(p, tiltX), tiltY), cam);

    // desenhar segmentos do fio
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(160,168,178,0.7)";
    ctx.fillStyle = "rgba(90,98,110,0.25)";
    for(const seg of loop.segs){
      const A = P(seg.A), B = P(seg.B);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }

    // ======== Campos ========

    // 1) B: anéis ao redor do fio (azul). Densidade ~ I e 1/r.
    if(showB){
      ctx.strokeStyle = "rgba(90,170,255,0.95)";
      ctx.lineWidth = 1.6;
      for(const seg of loop.segs){
        // selecionar apenas fios (não baterias/resistor)
        if(seg.kind!=="wire") continue;

        // pontos ao longo do segmento
        const Ns = 6;
        for(let i=1;i<=Ns;i++){
          const t = i/(Ns+1);
          const cx = lerp(seg.A.x, seg.B.x, t);
          const cy = lerp(seg.A.y, seg.B.y, t);
          const cz = lerp(seg.A.z, seg.B.z, t);

          // círculo no plano perpendicular ao segmento (apróx)
          // direção do segmento
          const tx = (seg.B.x - seg.A.x), ty = (seg.B.y - seg.A.y), tz = (seg.B.z - seg.A.z);
          const len = Math.hypot(tx,ty,tz) || 1;
          const ux = tx/len, uy = ty/len, uz = tz/len;

          // dois vetores perpendiculares (base do círculo)
          // pegar um qualquer não-colinear:
          const ax = Math.abs(ux)<0.9 ? 1 : 0, ay = Math.abs(ux)<0.9 ? 0 : 1, az = 0;
          // v1 = u × a ; v2 = u × v1
          const v1x = uy*az - uz*ay, v1y = uz*ax - ux*az, v1z = ux*ay - uy*ax;
          const vv1 = Math.hypot(v1x,v1y,v1z)||1;
          const n1x = v1x/vv1, n1y = v1y/vv1, n1z = v1z/vv1;
          const v2x = uy*n1z - uz*n1y, v2y = uz*n1x - ux*n1z, v2z = ux*n1y - uy*n1x;
          const rr = 0.28 + 0.05*i; // raio do anel (arbitrário, só para visual)
          const M = 40;
          ctx.beginPath();
          for(let k=0;k<=M;k++){
            const ang = 2*Math.PI*(k/M) + 0.0002*(tRef.current*vProp/60);
            const px = cx + rr*(n1x*Math.cos(ang) + v2x*Math.sin(ang));
            const py = cy + rr*(n1y*Math.cos(ang) + v2y*Math.sin(ang));
            const pz = cz + rr*(n1z*Math.cos(ang) + v2z*Math.sin(ang));
            const s = P({x:px,y:py,z:pz});
            if(k===0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
          }
          ctx.stroke();
        }
      }
    }

    // 2) E: linhas vermelhas cruzando o espaço (do terminal + da bateria ao – do gerador/resistor).
    //    Síntese: arcos "meridionais" passando pelo interior do loop (sem mostrar cargas).
    if(showE){
      ctx.strokeStyle = "rgba(255,80,70,0.95)";
      ctx.lineWidth = 1.6;

      const Nmer = 9;
      for(let m=0;m<Nmer;m++){
        const phi = (m/(Nmer-1))*Math.PI; // espalhar de cima a baixo
        const M = 80;
        ctx.beginPath();
        for(let k=0;k<=M;k++){
          const u = k/M;
          // paramétrica de um "ovo" que liga lado esquerdo (+) ao direito (–) por dentro
          const x = lerp(loop.bbox.x0*0.9, loop.bbox.x1*0.9, u);
          const y = Math.sin(phi)*0.45*loop.bbox.y1 + Math.cos(u*Math.PI)*0.55*loop.bbox.y1*0.4;
          const z = 0.75*Math.sin((u-0.5)*Math.PI)*0.9;
          const s = P({x,y,z});
          if(k===0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();

        // setas espaçadas
        for(let k=15;k<=65;k+=25){
          const u = k/80;
          const x = lerp(loop.bbox.x0*0.9, loop.bbox.x1*0.9, u);
          const y = Math.sin(phi)*0.45*loop.bbox.y1 + Math.cos(u*Math.PI)*0.55*loop.bbox.y1*0.4;
          const z = 0.75*Math.sin((u-0.5)*Math.PI)*0.9;
          const s1 = P({x,y,z});
          const x2 = lerp(loop.bbox.x0*0.9, loop.bbox.x1*0.9, u+0.02);
          const y2 = Math.sin(phi)*0.45*loop.bbox.y1 + Math.cos((u+0.02)*Math.PI)*0.55*loop.bbox.y1*0.4;
          const z2 = 0.75*Math.sin((u+0.02-0.5)*Math.PI)*0.9;
          const s2 = P({x:x2,y:y2,z:z2});
          ctx.strokeStyle = "rgba(255,80,70,0.95)";
          drawArrow(ctx, s2.x, s2.y, s2.x-s1.x, s2.y-s1.y, 7);
        }
      }
    }

    // 3) S: linhas amarelas — seguem ao longo do fio; entram no resistor.
    if(showS){
      ctx.strokeStyle = "rgba(255,220,70,0.92)";
      ctx.lineWidth = 2;

      // ao longo dos segmentos (várias "fitas" paralelas)
      const lanes = 5;
      for(const seg of loop.segs){
        const isRes = seg.kind==="resistor";
        const M = 40;
        for(let l=0;l<lanes;l++){
          const off = (l-(lanes-1)/2)*0.05; // pequeno afastamento para parecer "faixa"
          ctx.beginPath();
          for(let k=0;k<=M;k++){
            const u = k/M;
            const x = lerp(seg.A.x, seg.B.x, u);
            const y = lerp(seg.A.y, seg.B.y, u) + off;
            const z = lerp(seg.A.z, seg.B.z, u);
            const s = P({x,y,z});
            if(k===0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
          }
          ctx.stroke();

          // setas animadas na direção do fluxo (horário)
          for(let k=8;k<=32;k+=12){
            const u = ( (k + (tRef.current*vProp*0.06)) % M ) / M;
            const x1 = lerp(seg.A.x, seg.B.x, u);
            const y1 = lerp(seg.A.y, seg.B.y, u) + off;
            const z1 = lerp(seg.A.z, seg.B.z, u);
            const x2 = lerp(seg.A.x, seg.B.x, u+0.02);
            const y2 = lerp(seg.A.y, seg.B.y, u+0.02) + off;
            const z2 = lerp(seg.A.z, seg.B.z, u+0.02);
            const s1 = P({x:x1,y:y1,z:z1});
            const s2 = P({x:x2,y:y2,z:z2});
            drawArrow(ctx, s2.x, s2.y, s2.x - s1.x, s2.y - s1.y, 8);
          }

          // no resistor: setas entrando radialmente (energia que vira calor)
          if(isRes){
            for(let j=0;j<5;j++){
              const u = (j+1)/6;
              const x = lerp(seg.A.x, seg.B.x, u);
              const y = lerp(seg.A.y, seg.B.y, u);
              const z = lerp(seg.A.z, seg.B.z, u);
              const sC = P({x,y,z});
              // direções radiais para "dentro"
              for(const ang of [0, Math.PI/2, Math.PI, 3*Math.PI/2]){
                const rr = 0.55;
                const s1 = P({x:x+rr*Math.cos(ang), y:y+rr*Math.sin(ang), z});
                ctx.beginPath();
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(sC.x, sC.y);
                ctx.stroke();
              }
            }
          }
        }
      }
    }

    // painel de elementos (ícones simples)
    // bateria (esquerda)
    {
      const b = loop.segs.find(s=>s.kind==="battery")!;
      const A = P(b.A), B = P(b.B);
      ctx.lineWidth=3; ctx.strokeStyle="rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,0.9)";
      ctx.font="12px sans-serif";
      ctx.fillText("+", A.x-10, A.y-6);
      ctx.fillText("−", B.x-10, B.y+14);
    }
    // resistor (direita)
    {
      const r = loop.segs.find(s=>s.kind==="resistor")!;
      const A = P(r.A), B = P(r.B);
      ctx.strokeStyle="rgba(255,255,255,0.9)";
      ctx.lineWidth=2;
      // desenhar símbolo simples em zigue-zague
      const M = 5;
      ctx.beginPath(); ctx.moveTo(A.x, A.y);
      for(let i=1;i<=M;i++){
        const u = i/(M+1);
        const px = lerp(A.x,B.x,u);
        const py = i%2===0? lerp(A.y,B.y,u)+8 : lerp(A.y,B.y,u)-8;
        ctx.lineTo(px,py);
      }
      ctx.lineTo(B.x,B.y); ctx.stroke();
    }
  }

  return (
    <div className="w-screen h-screen grid grid-cols-[280px_1fr] gap-2 p-2">
      <Controls
        V={V} R={R} Lsim={Lsim} vProp={vProp}
        setV={setV} setR={setR} setLsim={setLsim} setVprop={setVprop}
        showE={showE} setShowE={setShowE}
        showB={showB} setShowB={setShowB}
        showS={showS} setShowS={setShowS}
        switchClosed={switchClosed}
        onToggleSwitch={()=> setSwitchClosed(s=>!s)}
        I={I} Imax={Imax} Pinst={I*I*R} tau={tau}
      />
      <canvas ref={canvasRef}
        style={{borderRadius:14, background:"#0b0f14",
          boxShadow:"0 10px 24px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)"}}/>
    </div>
  );
}