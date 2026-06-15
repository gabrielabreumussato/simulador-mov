// Física do ciclo de Carnot (quase-estático) + integrador simples

export type CarnotParams = {
  n: number;         // mol
  Th: number;        // T_quente (K)
  Tc: number;        // T_fria (K)
  r: number;         // razão Vmax/Vmin (>= 2, idealmente >= (Th/Tc)^(1/(γ-1)))
  rpm: number;       // virabrequim (apenas para tempo/θ)
  R?: number;        // constante dos gases (padrão 8.314)
  gamma?: number;    // Cp/Cv (padrão 1.4)
};

export type CarnotState = {
  t: number;         // tempo (s)
  theta: number;     // ângulo do virabrequim (rad) [0..2π)
  V: number;         // volume atual (m³, arbitrário, coerente entre pontos)
  T: number;         // temperatura (K)
  p: number;         // pressão (Pa)
  // acumuladores por ciclo
  W: number;         // trabalho (J)
  Qin: number;       // calor absorvido (J)
  Qout: number;      // calor rejeitado (J, positivo em módulo)
  lap: number;       // voltas completas
  phase: "isoThot" | "adiabat" | "isoTcold" | "adiabat2"; // rótulo para cor
  // marcos do ciclo
  V1: number; V2: number; V3: number; V4: number;
  Kbc: number; Kad: number; // constantes das adiabáticas (T V^{γ-1})
};

export type PVPoint = { p: number; v: number };

const EPS = 1e-12;

export function makeCarnot(params: CarnotParams) {
  const R = params.R ?? 8.314;
  const gamma = params.gamma ?? 1.4;
  const Cv = R / (gamma - 1);

  // --- volumes característicos usando r = V3/V1 ---
  // escolhemos V1 = 1 (escala arbitrária), V3 = r
  const V1 = 1.0;
  const V3 = Math.max(params.r, 1.1) * V1;

  // Adiabática B→C: Th * V2^{γ-1} = Tc * V3^{γ-1}  → V2
  const V2 = V3 * Math.pow(params.Tc / params.Th, 1 / (gamma - 1));
  // Adiabática D→A: Tc * V4^{γ-1} = Th * V1^{γ-1}  → V4
  const V4 = V1 * Math.pow(params.Th / params.Tc, 1 / (gamma - 1));

  // Se r for pequeno demais para essas relações, ainda funciona (o ciclo "aperta").

  const st: CarnotState = {
    t: 0,
    theta: Math.PI,          // comece em A (TDC → V1)
    V: V1,
    T: params.Th,
    p: (params.n * R * params.Th) / V1,
    W: 0, Qin: 0, Qout: 0, lap: 0,
    phase: "isoThot",
    V1, V2, V3, V4,
    Kbc: params.Th * Math.pow(V2, gamma - 1),
    Kad: params.Tc * Math.pow(V4, gamma - 1),
  };

  function pFromTV(T: number, V: number) {
    return (params.n * R * T) / Math.max(V, EPS);
  }

  function step(dt: number) {
    const omega = (params.rpm * 2 * Math.PI) / 60; // rad/s
    const thetaPrev = st.theta;
    st.theta = (st.theta + omega * dt) % (2 * Math.PI);
    st.t += dt;

    // mapeamos a volta em 4 quartos (25% cada) para A→B→C→D→A
    // 0..π/2: isotérmica quente (A→B)  | V: V1→V2
    // π/2..π: adiabática (B→C)         | V: V2→V3
    // π..3π/2: isotérmica fria (C→D)   | V: V3→V4
    // 3π/2..2π: adiabática (D→A)       | V: V4→V1
    const th = st.theta;
    let Vtarget = st.V;
    let Tnew = st.T;
    let phase: CarnotState["phase"] = st.phase;

    // helper para "andar" V suavemente (ease-in/out) evitando cantos
    const seg = (start: number, end: number) => {
      const L = end - start;
      const u = Math.min(1, Math.max(0, (th - start) / Math.max(L, 1e-6)));
      // ease sinusoidal
      return 0.5 - 0.5 * Math.cos(Math.PI * u);
    };

    if (th < Math.PI / 2) {
      phase = "isoThot";
      const u = seg(0, Math.PI / 2);
      Vtarget = st.V1 + (st.V2 - st.V1) * u;
      Tnew = params.Th; // isotérmica quente
    } else if (th < Math.PI) {
      phase = "adiabat";
      const u = seg(Math.PI / 2, Math.PI);
      Vtarget = st.V2 + (st.V3 - st.V2) * u;
      // T(V) na adiabat: T = K / V^{γ-1}
      Tnew = st.Kbc / Math.pow(Vtarget, (gamma - 1));
    } else if (th < 3 * Math.PI / 2) {
      phase = "isoTcold";
      const u = seg(Math.PI, 3 * Math.PI / 2);
      Vtarget = st.V3 + (st.V4 - st.V3) * u;
      Tnew = params.Tc; // isotérmica fria
    } else {
      phase = "adiabat2";
      const u = seg(3 * Math.PI / 2, 2 * Math.PI);
      Vtarget = st.V4 + (st.V1 - st.V4) * u;
      Tnew = st.Kad / Math.pow(Vtarget, (gamma - 1));
    }

    // numérico: integre δW = p δV e δQ = δU + p δV
    const Vprev = st.V, Tprev = st.T, pprev = st.p;
    st.V = Vtarget;
    st.T = Tnew;
    st.p = pFromTV(st.T, st.V);

    const dV = st.V - Vprev;
    const dU = params.n * Cv * (st.T - Tprev);
    const dW = pprev * dV;                 // boa aproximação com p do início
    const dQ = dU + dW;

    st.W += dW;
    if (dQ >= 0) st.Qin += dQ; else st.Qout += -dQ;
    st.phase = phase;

    // fechou a volta?
    if (thetaPrev > 3 * Math.PI / 2 && st.theta < Math.PI / 2) {
      st.lap += 1;
    }
  }

  // caminho "guia" pontilhado (A,B,C,D) para o gráfico
  function guidePath(samplesPerLeg = 60): PVPoint[] {
    const out: PVPoint[] = [];
    const pushLeg = (Vi: number, Vf: number, mode: "isoThot" | "adiabat" | "isoTcold" | "adiabat2") => {
      for (let i = 0; i <= samplesPerLeg; i++) {
        const u = i / samplesPerLeg;
        const V = Vi + (Vf - Vi) * u;
        let T = st.T;
        if (mode === "isoThot") T = params.Th;
        else if (mode === "isoTcold") T = params.Tc;
        else if (mode === "adiabat") T = st.Kbc / Math.pow(V, (gamma - 1));
        else T = st.Kad / Math.pow(V, (gamma - 1));
        const p = (params.n * (params.R ?? 8.314) * T) / V;
        out.push({ p, v: V });
      }
    };
    pushLeg(st.V1, st.V2, "isoThot");
    pushLeg(st.V2, st.V3, "adiabat");
    pushLeg(st.V3, st.V4, "isoTcold");
    pushLeg(st.V4, st.V1, "adiabat2");
    return out;
  }

  return { params: { ...params, R, gamma, Cv }, state: st, step, guidePath };
}

// util opcional: normalização de volume (0..1) para dirigir o pistão
export function volumeToNorm(V: number, Vmin: number, Vmax: number) {
  return (V - Vmin) / Math.max(1e-12, Vmax - Vmin);
}

// contato térmico ativo (para animar fontes encostando/saindo)
export type Contacts = { hot: boolean; cold: boolean };

export function contactsFromPhase(phase: "isoThot" | "adiabat" | "isoTcold" | "adiabat2"): Contacts {
  return {
    hot: phase === "isoThot",
    cold: phase === "isoTcold",
  };
}