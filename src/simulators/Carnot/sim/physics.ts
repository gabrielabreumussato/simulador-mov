// Física do ciclo de Carnot MOTOR (SI)

export type CarnotParams = {
  n?: number;       // mol
  Th: number;      // K
  Tc: number;      // K
  riso?: number;   // V2/V1  (nome antigo)
  r?: number;      // V2/V1  (nome preferido)
  rpm: number;
  P1target?: number; // Pa (default 1e5)
  R?: number;        // 8.314
  gamma?: number;    // 1.4 (diatômico) ou 5/3
  weights?: {        // frações de tempo em 1 volta (somam 1; serão normalizadas)
    isoHot: number;  // 1→2
    adi12: number;   // 2→3
    isoCold: number; // 3→4
    adi41: number;   // 4→1
  };
};

export type CarnotState = {
  t: number; theta: number;
  V: number; T: number; p: number;
  W: number; Qin: number; Qout: number; lap: number;
  phase: "isoThot" | "adiabat" | "isoTcold" | "adiabat2";
  V1: number; V2: number; V3: number; V4: number;
  P1: number; P2: number; P3: number; P4: number;
  K23: number; K41: number;
};

export type PVPoint = { p:number; v:number };

const EPS = 1e-12;

export function makeCarnot(params: CarnotParams){
  const R = params.R ?? 8.314;
  const gamma = params.gamma ?? 1.4;
  const n = params.n ?? 0.03;  // mol - valor padrão otimizado
  const Cv = R/(gamma-1);
  
  // VOLUMES FIXOS para coincidir com hipérboles de referência
  const Vmin = 3e-4;  // m³ - volume mínimo fixo (bem longe de zero)
  const Vmax = 1.2e-3; // m³ - volume máximo fixo (não vai até o fim do eixo)
  
  // As temperaturas agora vêm dos parâmetros de entrada
  const Th_input = params.Th;
  const Tc_input = params.Tc;
  
  // Cantos do ciclo baseados nas hipérboles e volumes fixos
  const V1 = Vmin;        // Volume mínimo
  const V2 = Vmax;        // Volume máximo
  
  // Pressões das isotermas baseadas nas hipérboles ajustadas
  const P1 = (n*R*Th_input) / V1;   // Isoterma quente - ponto inicial
  const P2 = (n*R*Th_input) / V2;   // Isoterma quente - final da expansão isotérmica

  // Calcular volumes adiabáticos
  const k = Math.pow(Th_input/Tc_input, 1/(gamma-1));
  const V3 = V2 * k;
  const V4 = V1 * k;
  
  // Pressões das isotermas frias
  const P3 = (n*R*Tc_input) / V3;   // Isoterma fria
  const P4 = (n*R*Tc_input) / V4;   // Isoterma fria

  // Calcular weights baseado nas temperaturas - mais tempo nas isotermas
  const iso_time = 0.35; // 35% cada isoterma
  const adi_time = 0.15; // 15% cada adiabática
  const W = {
    isoHot: iso_time,
    adi12: adi_time,
    isoCold: iso_time,
    adi41: adi_time
  };

  // Constantes das adiabáticas
  const K23 = P2*Math.pow(V2,gamma); // P V^γ = const
  const K41 = P4*Math.pow(V4,gamma);

  // Sanity check simplificado
  if(Math.abs(V2/V1 - V3/V4) > 0.1) {
    console.warn("Volumes não proporcionais:", {V1,V2,V3,V4});
  }

  const st: CarnotState = {
    t:0, theta:0,
    V:V1, T:Th_input, p:P1,
    W:0, Qin:0, Qout:0, lap:0,
    phase:"isoThot",
    V1,V2,V3,V4, P1,P2,P3,P4, K23,K41
  };

  function step(dt:number){
    const omega = (params.rpm*2*Math.PI)/60;
    const thetaPrev = st.theta;
    st.theta = (st.theta + omega*dt)%(2*Math.PI);
    st.t += dt;

    // fase fracionária de 0..1
    const phi = st.theta/(2*Math.PI);

    // quebras por peso
    const s0 = 0;
    const s1 = W.isoHot;
    const s2 = s1 + W.adi12;
    const s3 = s2 + W.isoCold;
    const s4 = 1;

    let Vt=st.V, Tt=st.T, Pt=st.p, ph=st.phase;

    const lerp = (a:number,b:number,t:number)=> a + (b-a)*t;

    if(phi < s1){                    // 1→2  isoterma quente
      ph="isoThot";
      const u = (phi - s0)/(s1 - s0);
      Vt = lerp(st.V1, st.V2, u);
      Tt = Th_input;
      Pt = (n*R*Th_input) / Vt;
    }else if(phi < s2){              // 2→3  adiabática
      ph="adiabat";
      const u = (phi - s1)/(s2 - s1);
      Vt = lerp(st.V2, st.V3, u);
      Pt = K23/Math.pow(Vt, gamma);
      Tt = (Pt*Vt)/(n*R);
    }else if(phi < s3){              // 3→4  isoterma fria
      ph="isoTcold";
      const u = (phi - s2)/(s3 - s2);
      Vt = lerp(st.V3, st.V4, u);
      Tt = Tc_input;
      Pt = (n*R*Tc_input) / Vt;
    }else{                           // 4→1  adiabática
      ph="adiabat2";
      const u = (phi - s3)/(s4 - s3);
      Vt = lerp(st.V4, st.V1, u);
      Pt = K41/Math.pow(Vt, gamma);
      Tt = (Pt*Vt)/(n*R);
    }

    // 1ª lei (integração explícita simples)
    const Vprev=st.V, Tprev=st.T, Pprev=st.p;
    st.V=Vt; st.T=Tt; st.p=Pt; st.phase=ph;

    const dV = st.V - Vprev;
    const dU = n*Cv*(st.T - Tprev);
    const dW = Pprev*dV;        // trabalho do gás
    const dQ = dU + dW;

    st.W += dW;
    if(dQ>=0) st.Qin += dQ; else st.Qout += -dQ;

    if(thetaPrev>3*Math.PI/2 && st.theta<Math.PI/2) st.lap += 1;
  }

  function guidePathSplit(N=120){
    const hot: PVPoint[]  = [];
    const ad1: PVPoint[]  = [];
    const cold: PVPoint[] = [];
    const ad2: PVPoint[]  = [];

    // 1→2 (isoterma quente)
    for(let i=0;i<=N;i++){ const u=i/N; const V=V1+(V2-V1)*u; hot.push({v:V,p:(n*R*Th_input)/V}); }
    // 2→3 (adiabática expansão)
    for(let i=1;i<=N;i++){ const u=i/N; const V=V2+(V3-V2)*u; ad1.push({v:V,p:K23/Math.pow(V,gamma)}); }
    // 3→4 (isoterma fria)
    for(let i=1;i<=N;i++){ const u=i/N; const V=V3+(V4-V3)*u; cold.push({v:V,p:(n*R*Tc_input)/V}); }
    // 4→1 (adiabática compressão)
    for(let i=1;i<=N;i++){ const u=i/N; const V=V4+(V1-V4)*u; ad2.push({v:V,p:K41/Math.pow(V,gamma)}); }
    
    return { hot, ad1, cold, ad2 };
  }

  function guidePath(N=120): PVPoint[]{
    const out:PVPoint[]=[];
    // 1→2
    for(let i=0;i<=N;i++){ const u=i/N; const V=V1+(V2-V1)*u; out.push({v:V,p:(n*R*Th_input)/V}); }
    // 2→3
    for(let i=1;i<=N;i++){ const u=i/N; const V=V2+(V3-V2)*u; out.push({v:V,p:K23/Math.pow(V,gamma)}); }
    // 3→4
    for(let i=1;i<=N;i++){ const u=i/N; const V=V3+(V4-V3)*u; out.push({v:V,p:(n*R*Tc_input)/V}); }
    // 4→1
    for(let i=1;i<=N;i++){ const u=i/N; const V=V4+(V1-V4)*u; out.push({v:V,p:K41/Math.pow(V,gamma)}); }
    return out;
  }

  return { params:{...params, R, gamma, Cv, n }, state:st, step, guidePathSplit, guidePath };
}

export function contactsFromPhase(phase: CarnotState["phase"]){
  return { hot: phase==="isoThot", cold: phase==="isoTcold" };
}

export function volumeToNorm(V:number, Vmin:number, Vmax:number){
  return (V - Vmin)/Math.max(1e-12, Vmax - Vmin);
}