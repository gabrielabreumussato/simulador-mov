import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

// lazy via index.tsx dentro de cada simulador
// src/App.tsx
const Mov2D = lazy(() => import("./simulators/Mov2D/App"));
const EField = lazy(() => import("./simulators/EField/App"));
const ThermoC = lazy(() => import("./simulators/ThermoC/App"));
const Carnot = lazy(() => import("./simulators/Carnot"));
const VetorPoynting = lazy(() => import("./simulators/VetorPoynting"));
const MovExperiments = lazy(() => import("./simulators/MovExperiments"));
const Circuito = lazy(() => import("./simulators/Circuito/App"));
const BField = lazy(() => import("./simulators/BField/App"));
const Gears = lazy(() => import("./simulators/Gears/App"));


// Home simples com links
function Home() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Simuladores</h1>
      <nav className="flex items-center gap-3 text-sm">
        <Link to="/sim/2d-mov" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Movimento 2D
        </Link>
        <Link to="/sim/efield" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Campo Elétrico
        </Link>
        <Link to="/sim/thermoc" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Ciclos Termodinâmicos
        </Link>
        <Link to="/sim/carnot" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Carnot
        </Link>
        <Link to="/sim/vetor-poynting" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Vetor Poynting
        </Link>
        <Link to="/sim/mov-experiments" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Experimentos Movimento
        </Link>
        <Link to="/sim/circuito" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Circuito Elétrico
        </Link>
        <Link to="/sim/bfield" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Campo Magnético
        </Link>
        <Link to="/sim/gears" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">
          Engrenagens/Polias
        </Link>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="w-full h-screen bg-[#0a0e13] text-slate-200">
        <header className="h-14 px-4 flex items-center justify-between ring-1 ring-slate-800 bg-[#0f1520]">
          <Link to="/" className="font-semibold">Simulações</Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/sim/2d-mov" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Movimento 2D</Link>
            <Link to="/sim/efield" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Campo Elétrico</Link>
            <Link to="/sim/thermoc" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Ciclos Termodinâmicos</Link>
            <Link to="/sim/carnot" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Carnot</Link>
            <Link to="/sim/vetor-poynting" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Vetor Poynting</Link>
            <Link to="/sim/mov-experiments" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Experimentos Movimento</Link>
            <Link to="/sim/circuito" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Circuito Elétrico</Link>
            <Link to="/sim/bfield" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Campo Magnético</Link>
            <Link to="/sim/gears" className="px-2 py-1 rounded-lg bg-[#121a24] ring-1 ring-slate-800 hover:bg-[#162131]">Engrenagens/Polias</Link>
          </nav>
        </header>

        <main className="w-full h-[calc(100vh-56px)]">
          <Suspense fallback={<div className="p-6">Carregando…</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/sim/2d-mov" element={<Mov2D />} />
              <Route path="/sim/efield" element={<EField />} />
              <Route path="/sim/thermoc" element={<ThermoC />} />
              <Route path="/sim/carnot" element={<Carnot />} />
              <Route path="/sim/vetor-poynting" element={<VetorPoynting />} />
              <Route path="/sim/mov-experiments" element={<MovExperiments />} />
              <Route path="/sim/circuito" element={<Circuito />} />
              <Route path="/sim/bfield" element={<BField />} />
              <Route path="/sim/gears" element={<Gears />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
}
