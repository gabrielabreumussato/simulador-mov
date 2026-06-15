import React, { useEffect, useRef } from "react";

type Props = {
  width?: number; height?: number;
  theta: number;          // rotação do virabrequim (visual)
  norm: number;           // 0..1 mapeado de Vmin..Vmax → posição do pistão
  heat?: number;          // -1..+1 (glow quente/frio)
  contactHot?: boolean;
  contactCold?: boolean;
  linkXNorm?: number;     // 0..1: x normalizado para desenhar a linha pontilhada
};

export default function PistonCanvas({
  width=760, height=200, theta, norm, heat=0, contactHot=false, contactCold=false, linkXNorm=0.5
}: Props){
  const ref = useRef<HTMLCanvasElement>(null);

  // geometria do pistão
  const pad = 24;
  const y = height*0.45; // subiu um pouco para centralizar melhor
  const bore = 90; const wall = 14;

  useEffect(()=>{
    const c = ref.current!; const dpr = Math.max(1, Math.floor(devicePixelRatio||1));
    c.width = width*dpr; c.height = height*dpr; c.style.width = `${width}px`; c.style.height = `${height}px`;
    const ctx = c.getContext("2d")!; ctx.setTransform(dpr,0,0,dpr,0,0);

    drawBG(ctx, width, height);

    // Linha pontilhada na mesma posição X da partícula do gráfico
    const graphPadL = 64; // PAD.l do gráfico
    const graphUsableWidth = (width - graphPadL - 20) * 0.8; // 20% menor (largura útil reduzida)
    const lineX = graphPadL + linkXNorm * graphUsableWidth;
    
    // PISTÃO FICA EXATAMENTE NA LINHA PONTILHADA
    const xFace = lineX; // face esquerda do pistão = linha pontilhada
    const xSkirt = lineX + 72; // definir largura do pistão
    
    // Recipiente baseado na linha pontilhada (20% menor)
    const xL = graphPadL; // início do recipiente
    const xR = graphPadL + graphUsableWidth; // fim do recipiente (já reduzido em 20%)
    
    // Cilindro do tamanho certo
    drawCylinder(ctx, xL, xR, y, bore, wall, heat);

    // Linha pontilhada
    ctx.save();
    ctx.setLineDash([4,4]);
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = 2;
    ctx.beginPath(); 
    ctx.moveTo(lineX, 8); 
    ctx.lineTo(lineX, height-8); 
    ctx.stroke();
    ctx.restore();

    // fontes térmicas
    drawSources(ctx, pad, y, bore, contactHot, contactCold);

    // SEM VIRABREQUIM - apenas o pistão
    drawPiston(ctx, xFace, xSkirt, y, bore);
  },[theta, norm, heat, contactHot, contactCold, linkXNorm, width, height]);

  return <canvas ref={ref} style={{borderRadius:14, background:"#0b0f14", boxShadow:"0 10px 24px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)"}}/>;
}

// Removido sliderX - não precisa mais do virabrequim

function drawBG(ctx:CanvasRenderingContext2D,w:number,h:number){
  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,"#0b0f14"); g.addColorStop(1,"#0d1117");
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}

function drawCylinder(ctx:CanvasRenderingContext2D, xL:number, xR:number, y:number, bore:number, wall:number, heat:number){
  const r=bore/2, hot=(heat+1)/2, cold=1-hot;
  // glow térmico colorido - azul mais calcinha no lado direito
  const glow = ctx.createLinearGradient(xL-40,y,xR+40,y);
  glow.addColorStop(0, `rgba(255,60,0,${0.18*hot})`);       // vermelho quente à esquerda
  glow.addColorStop(1, `rgba(100,180,255,${0.25*cold})`);   // azul calcinha à direita
  ctx.fillStyle=glow; ctx.fillRect(xL-60, y-bore*0.9, (xR-xL)+120, bore*1.8);

  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.55)"; ctx.shadowBlur=18;
  ctx.fillStyle="#8e98a3";
  roundRect(ctx, xL-wall, y-r-wall, (xR-xL)+wall*2, bore+wall*2, 12);
  ctx.fill(); ctx.restore();

  const lg = ctx.createLinearGradient(0,y-r,0,y+r);
  lg.addColorStop(0,"#d6dbe1"); lg.addColorStop(0.5,"#b6bcc4"); lg.addColorStop(1,"#dfe3e8");
  ctx.fillStyle=lg; roundRect(ctx, xL, y-r, xR-xL, bore, 10); ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,.35)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(xL,y-r); ctx.lineTo(xR,y-r); ctx.moveTo(xL,y+r); ctx.lineTo(xR,y+r); ctx.stroke();

  // tampa esquerda
  const cap = ctx.createLinearGradient(xL-wall,y-r, xL+wall*0.5,y+r);
  cap.addColorStop(0,"#c3c9d0"); cap.addColorStop(1,"#8f97a1");
  ctx.fillStyle=cap; roundRect(ctx, xL-wall, y-r-wall, wall+6, bore+wall*2, 8); ctx.fill();
}

function drawPiston(ctx:CanvasRenderingContext2D, xFace:number, xSkirt:number, y:number, bore:number){
  const r=bore/2; const yTop=y-r+3, yBot=y+r-3;
  ctx.save(); ctx.shadowColor="rgba(0,0,0,.5)"; ctx.shadowBlur=14;

  const g = ctx.createLinearGradient(xFace, yTop, xFace+48, yBot);
  g.addColorStop(0,"#f3f6f9"); g.addColorStop(0.5,"#c6cdd6"); g.addColorStop(1,"#a6aeb8");
  ctx.fillStyle=g; roundRect(ctx, xFace, yTop, 48, yBot-yTop, 8); ctx.fill();

  ctx.strokeStyle="rgba(0,0,0,.55)"; ctx.lineWidth=2;
  for(let i=0;i<3;i++){ const yy=yTop+10+i*8; ctx.beginPath(); ctx.moveTo(xFace+6,yy); ctx.lineTo(xFace+42,yy); ctx.stroke(); }

  const sL = xSkirt - (xFace+48), sx=xFace+48;
  const sg = ctx.createLinearGradient(sx,yTop, xSkirt,yBot);
  sg.addColorStop(0,"#e5e9ee"); sg.addColorStop(1,"#b0b8c1");
  ctx.fillStyle=sg; roundRect(ctx, sx, yTop+10, sL, yBot-(yTop+10), 8); ctx.fill();

  ctx.fillStyle="#7b848d"; ctx.beginPath(); ctx.arc(sx+sL*0.45, y, 8, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

// Removidas funções drawCrank e drawRod - não precisa mais do virabrequim

function drawSources(ctx:CanvasRenderingContext2D, x:number, y:number, bore:number, hot:boolean, cold:boolean){
  const r = bore/2, offset = 12;
  // quente (vermelho)
  ctx.fillStyle = "#ff6b5a";
  const dxHot = hot ? 0 : -offset;
  roundRect(ctx, x+dxHot, y-r-18, 26, r*2+36, 8); ctx.fill();
  // fria (azul)
  ctx.fillStyle = "#5aa0ff";
  const dxCold = cold ? 0 : -offset;
  roundRect(ctx, x+dxCold, y-r-18 + (r*2+36)+10, 26, r*0.9, 8); ctx.fill();
}

function roundRect(ctx:CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number){
  const rr=Math.min(r, w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y, x+w,y+h, rr);
  ctx.arcTo(x+w,y+h, x,y+h, rr);
  ctx.arcTo(x,y+h, x,y, rr);
  ctx.arcTo(x,y, x+w,y, rr);
  ctx.closePath();
}