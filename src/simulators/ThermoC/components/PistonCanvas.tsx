import React, { useEffect, useRef } from "react";

type Props = {
  width?: number; height?: number;
  theta: number;               // ângulo do virabrequim (rad)
  heat?: number;               // -1..+1 (cor de glow)
  contactHot?: boolean;        // fonte quente encostada
  contactCold?: boolean;       // fonte fria encostada
};

export default function PistonCanvas({
  width=680, height=220, theta, heat=0, contactHot=false, contactCold=false
}: Props){
  const ref = useRef<HTMLCanvasElement>(null);

  // geometria
  const pad = 20;
  const y = height*0.62;
  const cx = width - 110, cy = y;       // centro do virabrequim
  const R = 36; const L = 130;          // slider-crank
  const bore = 90; const wall = 14;

  useEffect(()=>{
    const c = ref.current!; const dpr = Math.max(1, Math.floor(devicePixelRatio||1));
    c.width = width*dpr; c.height = height*dpr; c.style.width = `${width}px`; c.style.height = `${height}px`;
    const ctx = c.getContext("2d")!; ctx.setTransform(dpr,0,0,dpr,0,0);

    const xPin = sliderX(theta, cx, R, L);
    const xFace = xPin - 44, xSkirt = xPin + 28;

    drawBG(ctx, width, height);
    drawCylinder(ctx, pad+40, cx - (L+R) + 50, y, bore, wall, heat);
    drawSources(ctx, pad, y, bore, contactHot, contactCold);
    drawCrank(ctx, cx, cy, 34, theta, R);
    drawRod(ctx, xPin, y, cx + R*Math.cos(theta), cy + R*Math.sin(theta), 18);
    drawPiston(ctx, xFace, xSkirt, y, bore);
  },[theta, heat, contactHot, contactCold, width, height]);

  return <canvas ref={ref} style={{borderRadius:16, background:"linear-gradient(180deg,#f8fafc,#eef2f7)", boxShadow:"0 8px 22px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.6)"}}/>;
}

function sliderX(ang:number, cx:number, R:number, L:number){
  const s = R*Math.cos(ang) + Math.sqrt(Math.max(0, L*L - (R*Math.sin(ang))**2));
  return cx - s;
}

function drawBG(ctx:CanvasRenderingContext2D,w:number,h:number){
  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,"#f8fafc"); g.addColorStop(1,"#eef2f7");
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}

function drawCylinder(ctx:CanvasRenderingContext2D, xL:number, xR:number, y:number, bore:number, wall:number, heat:number){
  const r=bore/2, hot=(heat+1)/2, cold=1-hot;
  // glow térmico
  const glow = ctx.createLinearGradient(xL-40,y,xR+40,y);
  glow.addColorStop(0, `rgba(255,60,0,${0.22*hot})`);
  glow.addColorStop(1, `rgba(0,120,255,${0.22*cold})`);
  ctx.fillStyle=glow; ctx.fillRect(xL-60, y-bore*0.9, (xR-xL)+120, bore*1.8);

  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.15)"; ctx.shadowBlur=12;
  ctx.fillStyle="#9aa3ad";
  roundRect(ctx, xL-wall, y-r-wall, (xR-xL)+wall*2, bore+wall*2, 12);
  ctx.fill(); ctx.restore();

  const lg = ctx.createLinearGradient(0,y-r,0,y+r);
  lg.addColorStop(0,"#dfe4ea"); lg.addColorStop(0.5,"#c9ced6"); lg.addColorStop(1,"#e9edf2");
  ctx.fillStyle=lg; roundRect(ctx, xL, y-r, xR-xL, bore, 10); ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,.25)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(xL,y-r); ctx.lineTo(xR,y-r); ctx.moveTo(xL,y+r); ctx.lineTo(xR,y+r); ctx.stroke();

  // tampa esquerda
  const cap = ctx.createLinearGradient(xL-wall,y-r, xL+wall*0.5,y+r);
  cap.addColorStop(0,"#c6ccd3"); cap.addColorStop(1,"#959da6");
  ctx.fillStyle=cap; roundRect(ctx, xL-wall, y-r-wall, wall+6, bore+wall*2, 8); ctx.fill();
}

function drawPiston(ctx:CanvasRenderingContext2D, xFace:number, xSkirt:number, y:number, bore:number){
  const r=bore/2; const yTop=y-r+3, yBot=y+r-3;
  ctx.save(); ctx.shadowColor="rgba(0,0,0,.25)"; ctx.shadowBlur=10;

  const g = ctx.createLinearGradient(xFace, yTop, xFace+48, yBot);
  g.addColorStop(0,"#f3f6f9"); g.addColorStop(0.5,"#c6cdd6"); g.addColorStop(1,"#a6aeb8");
  ctx.fillStyle=g; roundRect(ctx, xFace, yTop, 48, yBot-yTop, 8); ctx.fill();

  ctx.strokeStyle="rgba(0,0,0,.35)"; ctx.lineWidth=2;
  for(let i=0;i<3;i++){ const yy=yTop+10+i*8; ctx.beginPath(); ctx.moveTo(xFace+6,yy); ctx.lineTo(xFace+42,yy); ctx.stroke(); }

  const sL = xSkirt - (xFace+48), sx=xFace+48;
  const sg = ctx.createLinearGradient(sx,yTop, xSkirt,yBot);
  sg.addColorStop(0,"#e5e9ee"); sg.addColorStop(1,"#b0b8c1");
  ctx.fillStyle=sg; roundRect(ctx, sx, yTop+10, sL, yBot-(yTop+10), 8); ctx.fill();

  ctx.fillStyle="#7b848d"; ctx.beginPath(); ctx.arc(sx+sL*0.45, y, 8, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawCrank(ctx:CanvasRenderingContext2D, x:number, y:number, r:number, ang:number, R:number){
  const g = ctx.createRadialGradient(x-r*0.3,y-r*0.3,6,x,y,r);
  g.addColorStop(0,"#f6f8fa"); g.addColorStop(0.6,"#c8cdd3"); g.addColorStop(1,"#9da5ae");
  ctx.save(); ctx.shadowColor="rgba(0,0,0,.2)"; ctx.shadowBlur=12;
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#6c737b"; ctx.beginPath(); ctx.arc(x,y,5.5,0,Math.PI*2); ctx.fill();
  const px=x+R*Math.cos(ang), py=y+R*Math.sin(ang);
  const gp=ctx.createRadialGradient(px-3,py-3,1,px,py,9); gp.addColorStop(0,"#fff"); gp.addColorStop(1,"#9aa2ab");
  ctx.fillStyle=gp; ctx.beginPath(); ctx.arc(px,py,9,0,Math.PI*2); ctx.fill(); ctx.restore();
}

function drawRod(ctx:CanvasRenderingContext2D, x1:number,y1:number,x2:number,y2:number, thick:number){
  const vx=x2-x1, vy=y2-y1, len=Math.hypot(vx,vy)||1, ux=vx/len, uy=vy/len, nx=-uy, ny=ux, h=thick/2;
  const p1x=x1+nx*h, p1y=y1+ny*h, p2x=x2+nx*h, p2y=y2+ny*h, p3x=x2-nx*h, p3y=y2-ny*h, p4x=x1-nx*h, p4y=y1-ny*h;
  const grad = ctx.createLinearGradient(p1x,p1y,p3x,p3y);
  grad.addColorStop(0,"#dfe4ea"); grad.addColorStop(0.5,"#b8bfc7"); grad.addColorStop(1,"#e9edf2");
  ctx.save(); ctx.shadowColor="rgba(0,0,0,.2)"; ctx.shadowBlur=8;
  ctx.fillStyle=grad; ctx.beginPath(); ctx.moveTo(p1x,p1y); ctx.lineTo(p2x,p2y); ctx.lineTo(p3x,p3y); ctx.lineTo(p4x,p4y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,.25)"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(x1,y1,thick*0.7,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x2,y2,thick*0.8,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}

function drawSources(ctx:CanvasRenderingContext2D, x:number, y:number, bore:number, hot:boolean, cold:boolean){
  const r = bore/2, offset = 12;
  // quente (vermelho) — encosta nas isotermas quentes
  ctx.fillStyle = "#ff6b5a";
  const dxHot = hot ? 0 : -offset;
  roundRect(ctx, x+dxHot, y-r-18, 26, r*2+36, 8); ctx.fill();
  // fria (azul) — encosta nas isotermas frias
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