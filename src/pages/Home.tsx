import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Simulações</h1>
      <div className="grid sm:grid-cols-2 gap-3">
        <Link to="/sim/2d-mov" className="rounded-xl p-4 bg-[#0f1520] ring-1 ring-slate-800 hover:bg-[#121a24]">
          <div className="text-lg font-medium mb-1">Movimento 2D</div>
          <div className="opacity-80 text-sm">Vetores r, v, a; pan/zoom; gráficos.</div>
        </Link>
        <Link to="/sim/efield" className="rounded-xl p-4 bg-[#0f1520] ring-1 ring-slate-800 hover:bg-[#121a24]">
          <div className="text-lg font-medium mb-1">Campo Elétrico</div>
          <div className="opacity-80 text-sm">Em breve: linhas de campo, forças, etc.</div>
        </Link>
      </div>
    </div>
  );
}
