'use client'

import React, { useState, useRef, useEffect, useCallback } from "react";

type Measure = { n: number; t: number; x: number };
type Sensor = { id: number; x: number; on: boolean };
type ExperimentType = "MRU" | "MRUV" | "MRUR";

const THEME = {
  bg: "#0a0e13",
  panel: "#0f1520", 
  ring: "#1f2937",
  text: "#e2e8f0",
  sub: "rgba(226,232,240,.7)",
  button: "#3b82f6",
  object: "#f59e0b",
  sensor: "#10b981",
  sensorActive: "#ef4444",
  grid: "#374151"
};

export default function MovExperiments() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  
  // Estado do experimento
  const [experiment, setExperiment] = useState<ExperimentType>("MRU");
  const [running, setRunning] = useState(false);
  const [t, setT] = useState(0);
  const [x, setX] = useState(0);
  const [v, setV] = useState(0);
  const [startTime, setStartTime] = useState(0);
  
  // Parâmetros por experimento
  const [vTerminal, setVTerminal] = useState(2.0); // MRU
  const [theta, setTheta] = useState(15); // MRUV - ângulo
  const [mu, setMu] = useState(0.1); // MRUV/MRUR - atrito
  const [v0, setV0] = useState(5.0); // MRUR - velocidade inicial
  
  // Medidas e sensores
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [nextSensorId, setNextSensorId] = useState(1);
  
  // Gráfico
  const [graphPoints, setGraphPoints] = useState<{x: number, y: number}[]>([]);
  const [axisX, setAxisX] = useState<"t" | "t2">("t");
  const [axisY, setAxisY] = useState<"x" | "v">("x");
  const [fitResult, setFitResult] = useState<{a: number, b: number, r2: number} | null>(null);

  // Física
  const getAcceleration = () => {
    switch (experiment) {
      case "MRU": return 0;
      case "MRUV": return 9.81 * Math.sin(theta * Math.PI / 180) - mu * 9.81 * Math.cos(theta * Math.PI / 180);
      case "MRUR": return -mu * 9.81;
      default: return 0;
    }
  };

  // Simulação física
  useEffect(() => {
    if (!running) return;
    
    const dt = 1/60;
    
    const update = () => {
      setT(prev => {
        const newT = prev + dt;
        
        // Física
        const a = getAcceleration();
        let newV = v;
        let newX = x;
        
        if (experiment === "MRU") {
          // Velocidade terminal com suavização
          const tau = 0.3;
          newV = newT < 3 * tau ? vTerminal * (1 - Math.exp(-newT / tau)) : vTerminal;
        } else {
          newV = experiment === "MRUR" ? Math.max(0, v0 + a * newT) : v + a * dt;
        }
        
        newX = x + newV * dt;
        
        // Parar se velocidade zero (MRUR) ou fim da pista
        if ((experiment === "MRUR" && newV <= 0) || newX > 10) {
          setRunning(false);
          return newT;
        }
        
        setV(newV);
        setX(newX);
        
        // Verificar sensores
        sensors.forEach(sensor => {
          if (sensor.on && x < sensor.x && newX >= sensor.x) {
            addMeasure(newT, sensor.x);
          }
        });
        
        return newT;
      });
      
      if (running) {
        animRef.current = requestAnimationFrame(update);
      }
    };
    
    animRef.current = requestAnimationFrame(update);
    
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [running, v, x, experiment, vTerminal, theta, mu, v0, sensors]);

  const addMeasure = useCallback((time: number, position: number) => {
    setMeasures(prev => {
      const newMeasures = [...prev, { n: prev.length + 1, t: time, x: position }];
      return newMeasures.sort((a, b) => a.t - b.t).map((m, i) => ({ ...m, n: i + 1 }));
    });
  }, []);

  const markTime = () => {
    if (running) {
      addMeasure(t, x);
    }
  };

  const reset = () => {
    setRunning(false);
    setT(0);
    setX(experiment === "MRUR" ? 0 : 0);
    setV(experiment === "MRUR" ? v0 : 0);
    setMeasures([]);
    setGraphPoints([]);
    setFitResult(null);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  };

  const addSensor = () => {
    setSensors(prev => [...prev, { id: nextSensorId, x: 2 + nextSensorId, on: true }]);
    setNextSensorId(prev => prev + 1);
  };

  // Renderização do canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Configurar escala (0-10m em x, altura proporcional)
    const scale = canvas.width / 12; // margem
    const y0 = canvas.height * 0.7;
    
    // Fundo do experimento
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Desenhar experimento específico
    if (experiment === "MRU") {
      // Tubo vertical
      ctx.strokeStyle = THEME.text;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(scale, scale);
      ctx.lineTo(scale, y0);
      ctx.stroke();
      
      // Graduações
      for (let i = 0; i <= 10; i++) {
        const y = scale + (y0 - scale) * i / 10;
        ctx.beginPath();
        ctx.moveTo(scale - 10, y);
        ctx.lineTo(scale + 10, y);
        ctx.stroke();
        
        ctx.fillStyle = THEME.text;
        ctx.font = "12px monospace";
        ctx.fillText(`${(10-i).toFixed(1)}m`, scale + 15, y + 4);
      }
    } else {
      // Plano inclinado ou horizontal
      const angle = experiment === "MRUV" ? theta * Math.PI / 180 : 0;
      const length = 10 * scale;
      const x1 = scale, y1 = y0;
      const x2 = x1 + length * Math.cos(angle);
      const y2 = y1 - length * Math.sin(angle);
      
      ctx.strokeStyle = THEME.text;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Graduações ao longo da rampa
      for (let i = 0; i <= 10; i++) {
        const fx = x1 + (x2 - x1) * i / 10;
        const fy = y1 + (y2 - y1) * i / 10;
        const nx = -(y2 - y1) / length * 10; // normal
        const ny = (x2 - x1) / length * 10;
        
        ctx.beginPath();
        ctx.moveTo(fx + nx, fy + ny);
        ctx.lineTo(fx - nx, fy - ny);
        ctx.stroke();
        
        ctx.fillStyle = THEME.text;
        ctx.font = "12px monospace";
        ctx.fillText(`${i.toFixed(1)}m`, fx + nx + 5, fy + ny);
      }
    }
    
    // Desenhar sensores
    sensors.forEach(sensor => {
      let sx, sy;
      if (experiment === "MRU") {
        sx = scale;
        sy = scale + (y0 - scale) * (10 - sensor.x) / 10;
      } else {
        const angle = experiment === "MRUV" ? theta * Math.PI / 180 : 0;
        const fx = sensor.x / 10;
        sx = scale + 10 * scale * fx * Math.cos(angle);
        sy = y0 - 10 * scale * fx * Math.sin(angle);
      }
      
      ctx.fillStyle = sensor.on ? THEME.sensor : THEME.sub;
      ctx.beginPath();
      ctx.rect(sx - 3, sy - 15, 6, 30);
      ctx.fill();
      
      ctx.fillStyle = THEME.text;
      ctx.font = "10px monospace";
      ctx.fillText(`${sensor.x.toFixed(1)}`, sx - 10, sy - 20);
    });
    
    // Desenhar objeto
    let objX, objY;
    if (experiment === "MRU") {
      objX = scale + 15;
      objY = scale + (y0 - scale) * (10 - x) / 10;
    } else {
      const angle = experiment === "MRUV" ? theta * Math.PI / 180 : 0;
      const fx = x / 10;
      objX = scale + 10 * scale * fx * Math.cos(angle);
      objY = y0 - 10 * scale * fx * Math.sin(angle);
    }
    
    ctx.fillStyle = THEME.object;
    ctx.beginPath();
    ctx.arc(objX, objY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Info do estado
    ctx.fillStyle = THEME.text;
    ctx.font = "14px monospace";
    ctx.fillText(`t: ${t.toFixed(2)}s`, 20, 30);
    ctx.fillText(`x: ${x.toFixed(2)}m`, 20, 50);
    ctx.fillText(`v: ${v.toFixed(2)}m/s`, 20, 70);
    
  }, [experiment, x, t, v, sensors, theta]);

  // Ajuste de curva (regressão linear)
  const fitCurve = () => {
    if (measures.length < 2) return;
    
    const data = measures.map(m => ({
      x: axisX === "t" ? m.t : m.t * m.t,
      y: axisY === "x" ? m.x : (measures.find(next => next.n === m.n + 1)?.x ?? m.x) - m.x / (measures.find(next => next.n === m.n + 1)?.t ?? m.t) - m.t
    }));
    
    const n = data.length;
    const sumX = data.reduce((s, p) => s + p.x, 0);
    const sumY = data.reduce((s, p) => s + p.y, 0);
    const sumXY = data.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = data.reduce((s, p) => s + p.x * p.x, 0);
    const sumY2 = data.reduce((s, p) => s + p.y * p.y, 0);
    
    const a = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const b = (sumY - a * sumX) / n;
    
    const yMean = sumY / n;
    const ssRes = data.reduce((s, p) => s + Math.pow(p.y - (a * p.x + b), 2), 0);
    const ssTot = data.reduce((s, p) => s + Math.pow(p.y - yMean, 2), 0);
    const r2 = 1 - ssRes / ssTot;
    
    setFitResult({ a, b, r2 });
  };

  return (
    <div className="w-screen h-screen grid grid-cols-[2fr_1fr_1fr] gap-2 p-2 bg-[#0a0e13] text-slate-200">
      {/* Coluna 1: Experimento */}
      <div className="flex flex-col gap-4">
        <div className="bg-[#0f1520] p-4 rounded-lg border border-[#1f2937]">
          <h2 className="text-lg font-semibold mb-4">Experimentos de Movimento</h2>
          
          {/* Seletor de experimento */}
          <div className="flex gap-2 mb-4">
            {["MRU", "MRUV", "MRUR"].map(exp => (
              <button 
                key={exp}
                onClick={() => { setExperiment(exp as ExperimentType); reset(); }}
                className={`px-3 py-1 rounded ${experiment === exp ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                {exp}
              </button>
            ))}
          </div>
          
          {/* Parâmetros */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {experiment === "MRU" && (
              <label>
                v terminal: {vTerminal.toFixed(1)} m/s
                <input type="range" min="0.5" max="5" step="0.1" value={vTerminal} 
                       onChange={e => setVTerminal(+e.target.value)} className="w-full" />
              </label>
            )}
            {experiment === "MRUV" && (
              <>
                <label>
                  Ângulo: {theta}°
                  <input type="range" min="0" max="30" value={theta} 
                         onChange={e => setTheta(+e.target.value)} className="w-full" />
                </label>
                <label>
                  Atrito μ: {mu.toFixed(2)}
                  <input type="range" min="0" max="0.3" step="0.01" value={mu} 
                         onChange={e => setMu(+e.target.value)} className="w-full" />
                </label>
              </>
            )}
            {experiment === "MRUR" && (
              <>
                <label>
                  v₀: {v0.toFixed(1)} m/s
                  <input type="range" min="1" max="10" step="0.1" value={v0} 
                         onChange={e => setV0(+e.target.value)} className="w-full" />
                </label>
                <label>
                  Atrito μ: {mu.toFixed(2)}
                  <input type="range" min="0.1" max="0.6" step="0.01" value={mu} 
                         onChange={e => setMu(+e.target.value)} className="w-full" />
                </label>
              </>
            )}
          </div>
          
          {/* Controles */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setRunning(!running)} 
                    className="px-4 py-2 bg-blue-600 rounded">
              {running ? "Pausar" : "Iniciar"}
            </button>
            <button onClick={reset} className="px-4 py-2 bg-gray-600 rounded">
              Reset
            </button>
            <button onClick={markTime} disabled={!running}
                    className="px-4 py-2 bg-green-600 rounded disabled:opacity-50">
              Marcar Tempo
            </button>
            <button onClick={addSensor} className="px-4 py-2 bg-purple-600 rounded">
              Add Sensor
            </button>
          </div>
        </div>
        
        {/* Canvas */}
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={400}
          className="border border-[#1f2937] rounded-lg bg-[#0f1520]"
        />
      </div>
      
      {/* Coluna 2: Tabela */}
      <div className="bg-[#0f1520] p-4 rounded-lg border border-[#1f2937]">
        <h3 className="text-lg font-semibold mb-4">Medidas</h3>
        
        <div className="overflow-y-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="text-left p-1">n</th>
                <th className="text-left p-1">t (s)</th>
                <th className="text-left p-1">x (m)</th>
                <th className="text-left p-1">Δt</th>
                <th className="text-left p-1">Δx</th>
                <th className="text-left p-1">v (m/s)</th>
              </tr>
            </thead>
            <tbody>
              {measures.map((m, i) => {
                const prev = i > 0 ? measures[i-1] : null;
                const dt = prev ? m.t - prev.t : 0;
                const dx = prev ? m.x - prev.x : 0;
                const vel = dt > 0 ? dx / dt : 0;
                
                return (
                  <tr key={m.n} className="border-b border-gray-700">
                    <td className="p-1">{m.n}</td>
                    <td className="p-1">{m.t.toFixed(2)}</td>
                    <td className="p-1">{m.x.toFixed(2)}</td>
                    <td className="p-1">{prev ? dt.toFixed(2) : "-"}</td>
                    <td className="p-1">{prev ? dx.toFixed(2) : "-"}</td>
                    <td className="p-1">{prev ? vel.toFixed(2) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <button 
          onClick={() => {
            const csv = measures.map((m, i) => {
              const prev = i > 0 ? measures[i-1] : null;
              const dt = prev ? m.t - prev.t : 0;
              const dx = prev ? m.x - prev.x : 0;
              const vel = dt > 0 ? dx / dt : 0;
              return `${m.n},${m.t.toFixed(3)},${m.x.toFixed(3)},${dt.toFixed(3)},${dx.toFixed(3)},${vel.toFixed(3)}`;
            }).join('\n');
            
            const blob = new Blob(['n,t,x,dt,dx,v\n' + csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${experiment}_data.csv`;
            a.click();
          }}
          className="mt-4 px-4 py-2 bg-green-600 rounded w-full"
        >
          Exportar CSV
        </button>
      </div>
      
      {/* Coluna 3: Gráfico */}
      <div className="bg-[#0f1520] p-4 rounded-lg border border-[#1f2937]">
        <h3 className="text-lg font-semibold mb-4">Gráfico</h3>
        
        {/* Seletores de eixo */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <label>
            Eixo X:
            <select value={axisX} onChange={e => setAxisX(e.target.value as "t"|"t2")} 
                    className="w-full bg-gray-700 rounded p-1">
              <option value="t">t (s)</option>
              <option value="t2">t² (s²)</option>
            </select>
          </label>
          <label>
            Eixo Y:
            <select value={axisY} onChange={e => setAxisY(e.target.value as "x"|"v")} 
                    className="w-full bg-gray-700 rounded p-1">
              <option value="x">x (m)</option>
              <option value="v">v (m/s)</option>
            </select>
          </label>
        </div>
        
        {/* Área do gráfico */}
        <div className="bg-gray-900 p-4 rounded h-80 relative border">
          <svg width="100%" height="100%" className="absolute inset-0">
            {/* Grade */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#374151" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            
            {/* Pontos plotados */}
            {graphPoints.map((point, i) => (
              <circle key={i} cx={point.x} cy={point.y} r="4" fill={THEME.button} />
            ))}
            
            {/* Linha de ajuste */}
            {fitResult && (
              <line 
                x1="10%" y1={`${90 - (fitResult.a * 0 + fitResult.b) * 80}%`}
                x2="90%" y2={`${90 - (fitResult.a * 1 + fitResult.b) * 80}%`}
                stroke={THEME.button} strokeWidth="2"
              />
            )}
          </svg>
        </div>
        
        <div className="mt-4 space-y-2">
          <button onClick={fitCurve} className="w-full px-4 py-2 bg-blue-600 rounded">
            Ajustar Curva
          </button>
          
          {fitResult && (
            <div className="bg-gray-800 p-2 rounded text-sm">
              <div>y = {fitResult.a.toFixed(3)}x + {fitResult.b.toFixed(3)}</div>
              <div>R² = {fitResult.r2.toFixed(3)}</div>
            </div>
          )}
          
          <button 
            onClick={() => { setGraphPoints([]); setFitResult(null); }}
            className="w-full px-4 py-2 bg-gray-600 rounded"
          >
            Limpar Gráfico
          </button>
        </div>
      </div>
    </div>
  );
}