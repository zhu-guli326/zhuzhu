const HERO = new Set(["holo", "glitch", "triprism"]);
const FRAME_ONLY = new Set([
  "funhouse", "negative", "colornegative", "dot", "antidot", "vangogh",
  "neon", "raster", "thermal", "waveprint", "retropink", "spectrum",
]);
const LABELS = { holo: "捏合棱镜", glitch: "挥手撕裂", triprism: "框选传送门" };
const SIGNAL_TTL = 64;
const SWIPE_TTL = 480;
const SWIPE_COOLDOWN = 145;
const PORTAL_RELEASE = 60;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const toolbar = document.getElementById("toolbar");

if (video && canvas && toolbar) {
  const ctx = canvas.getContext("2d");
  const source = document.createElement("canvas");
  const sctx = source.getContext("2d");
  let raf = 0;
  let lastEffect = "";
  let tears = [];
  let lastSwipe = -Infinity;
  const portal = { quad: null, back: null, alpha: 0, seen: 0, lost: 0 };

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const effectId = () => toolbar.querySelector('button[data-id].active,button[data-id][aria-pressed="true"]')?.dataset.id || "";

  function signal(now) {
    const s = globalThis.FRAMELAB_GESTURE_3D;
    return s && Number.isFinite(s.timestamp) && now - s.timestamp <= SIGNAL_TTL ? s : null;
  }

  function size() {
    const w = canvas.width || video.videoWidth || 1280;
    const h = canvas.height || video.videoHeight || 720;
    if (source.width !== w || source.height !== h) { source.width = w; source.height = h; }
    return { w, h };
  }

  function capture(w, h) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.translate(w, 0); sctx.scale(-1, 1);
    sctx.drawImage(video, 0, 0, w, h);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function clean(w, h) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none";
    ctx.clearRect(0, 0, w, h); ctx.drawImage(source, 0, 0);
    ctx.restore();
  }

  function path(q) {
    ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
  }

  function rename() {
    for (const [id, label] of Object.entries(LABELS)) {
      const b = toolbar.querySelector(`button[data-id="${id}"]`);
      if (!b) continue;
      const key = b.querySelector(".key")?.textContent?.trim() || "";
      if (b.dataset.heroLabel === label) continue;
      b.innerHTML = `${key ? `<span class="key">${key}</span>` : ""}${label}`;
      b.title = `${label}${key ? ` (${key})` : ""}`;
      b.dataset.heroLabel = label;
    }
  }

  function drawPinch(s, w, h) {
    const p = s?.pinch;
    if (!p || p.handIndex < 0 || p.strength < 0.1) return;
    const hand = s.hands?.[p.handIndex];
    const strength = clamp(p.strength * .9 + Math.abs(hand?.vz || 0) * .18);
    const cx = p.x * w, cy = p.y * h;
    const depth = clamp((-p.z + .02) * 4.2, -.15, 1);
    const radius = clamp((hand?.palmScale || .12) * Math.min(w, h) * (1.4 + strength), Math.min(w,h)*.09, Math.min(w,h)*.3);
    const tilt = clamp(p.tiltZ * 8, -1, 1);

    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, radius, radius * (.78 + depth * .08), tilt * .2, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy); ctx.scale(1.08 + strength * .38, 1.08 + strength * .38); ctx.translate(-cx, -cy);
    ctx.filter = `saturate(${1.4 + strength}) contrast(${1.1 + strength*.3})`;
    ctx.drawImage(source, 0, 0); ctx.filter = "none";
    ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = .2 + strength*.2;
    const split = radius * (.05 + strength*.1);
    ctx.filter = "hue-rotate(105deg) saturate(2)"; ctx.drawImage(source, split, -split*.2);
    ctx.filter = "hue-rotate(-95deg) saturate(2)"; ctx.drawImage(source, -split, split*.2);
    ctx.restore();

    ctx.save(); ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(cx,cy,0,cx,cy,radius*1.35);
    glow.addColorStop(0,`rgba(255,255,255,${.18+strength*.24})`);
    glow.addColorStop(.35,`rgba(199,241,91,${.12+strength*.25})`);
    glow.addColorStop(.68,`rgba(82,105,255,${.1+strength*.2})`); glow.addColorStop(1,"rgba(255,60,165,0)");
    ctx.fillStyle=glow; ctx.fillRect(cx-radius*1.4,cy-radius*1.4,radius*2.8,radius*2.8);
    const ring=ctx.createLinearGradient(cx-radius,cy-radius,cx+radius,cy+radius);
    ring.addColorStop(0,"#eaffff"); ring.addColorStop(.3,"#c7f15b"); ring.addColorStop(.58,"#596aff"); ring.addColorStop(.82,"#ff48a8"); ring.addColorStop(1,"#eaffff");
    ctx.strokeStyle=ring; ctx.lineWidth=2.2+strength*3; ctx.shadowColor="#69e9ff"; ctx.shadowBlur=16+strength*20;
    ctx.beginPath(); ctx.ellipse(cx,cy,radius,radius*(.78+depth*.08),tilt*.2,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }

  function spawnSwipe(s, now) {
    const p = s?.swipe;
    if (!p || p.handIndex < 0 || p.strength < .34 || now-lastSwipe < SWIPE_COOLDOWN) return;
    lastSwipe = now;
    tears.push({ born:now, x:p.x, y:p.y, vx:p.vx, vy:p.vy, vz:p.vz, axis:p.axis, dir:p.direction||1, strength:p.strength, seed:Math.random()*20 });
    if (tears.length > 6) tears.shift();
  }

  function drawSwipe(s, w, h, now) {
    spawnSwipe(s, now);
    tears = tears.filter(t => now-t.born < SWIPE_TTL);
    for (const t of tears) {
      const age=(now-t.born)/SWIPE_TTL, fade=1-age, horizontal=t.axis==="x";
      const cx=t.x*w, cy=t.y*h, speed=1+clamp(Math.abs(t.vz)*.5,0,.8);
      const max=(horizontal?w:h)*(.03+t.strength*.09)*speed*fade;
      ctx.save();
      for(let i=0;i<10;i++){
        const u=i/9-.5, wave=Math.sin(t.seed+i*2.4)*.75;
        ctx.globalAlpha=.28+.58*fade; ctx.filter=i%3===0?"hue-rotate(85deg) saturate(1.8)":i%3===1?"hue-rotate(-80deg) saturate(1.8)":"none";
        if(horizontal){const bh=Math.max(4,h*(.009+t.strength*.012)), y=clamp(cy+u*h*.4+wave*bh,0,h-bh);ctx.drawImage(source,0,y,w,bh,max*t.dir*(.55+Math.abs(wave)),y+wave*2,w,bh);}
        else {const bw=Math.max(4,w*(.009+t.strength*.012)), x=clamp(cx+u*w*.4+wave*bw,0,w-bw);ctx.drawImage(source,x,0,bw,h,x+wave*2,max*t.dir*(.55+Math.abs(wave)),bw,h);}
      }
      ctx.filter="none";ctx.globalCompositeOperation="screen";ctx.shadowBlur=14;ctx.shadowColor=horizontal?"#ff3d98":"#3ee6ff";ctx.lineWidth=1.5+t.strength*3;
      const g=horizontal?ctx.createLinearGradient(0,cy,w,cy):ctx.createLinearGradient(cx,0,cx,h);g.addColorStop(0,"rgba(255,50,145,0)");g.addColorStop(.45,`rgba(255,50,145,${.35*fade})`);g.addColorStop(.52,`rgba(235,255,255,${.8*fade})`);g.addColorStop(.6,`rgba(55,230,255,${.35*fade})`);g.addColorStop(1,"rgba(55,230,255,0)");ctx.strokeStyle=g;
      ctx.beginPath();if(horizontal){ctx.moveTo(0,cy);ctx.lineTo(w,cy+t.vy*h*.018);}else{ctx.moveTo(cx,0);ctx.lineTo(cx+t.vx*w*.018,h);}ctx.stroke();ctx.restore();
    }
  }

  function portalGeometry(frame,w,h){
    const q=frame.quad.map(p=>({x:p.x*w,y:p.y*h}));
    const depths=frame.cornerDepths||[0,0,0,0], avg=depths.reduce((a,b)=>a+b,0)/4;
    const depth=clamp((-frame.depth+.025)*4+frame.depthSpread*3,.08,1), tilt=clamp(frame.depthDelta*8,-1,1), ext=14+depth*42;
    const back=q.map((p,i)=>({x:p.x+tilt*(16+depth*22)+clamp((avg-(depths[i]||0))*8,-.65,.65)*ext*.7,y:p.y+8+depth*20+ext*.08}));
    return {q,back,depth,tilt};
  }

  function updatePortal(s,now,w,h){
    const f=s?.frame;
    if(f?.valid&&f.quad?.length===4){
      const g=portalGeometry(f,w,h); portal.seen=now;portal.lost=0;
      if(!portal.quad){portal.quad=g.q;portal.back=g.back;}else{portal.quad=portal.quad.map((p,i)=>({x:mix(p.x,g.q[i].x,.4),y:mix(p.y,g.q[i].y,.4)}));portal.back=portal.back.map((p,i)=>({x:mix(p.x,g.back[i].x,.4),y:mix(p.y,g.back[i].y,.4)}));}
      portal.depth=g.depth;portal.alpha=mix(portal.alpha,1,.48);return;
    }
    portal.lost++;portal.alpha*=.28;
    if(portal.lost>=2||now-portal.seen>PORTAL_RELEASE){portal.quad=null;portal.back=null;portal.alpha=0;}
  }

  function drawPortal(s,w,h,now){
    updatePortal(s,now,w,h); if(!portal.quad||portal.alpha<.01)return;
    const q=portal.quad,b=portal.back,center=q.reduce((a,p)=>({x:a.x+p.x/4,y:a.y+p.y/4}),{x:0,y:0});
    ctx.save();ctx.globalAlpha=portal.alpha;ctx.globalCompositeOperation="screen";
    for(let i=0;i<4;i++){const j=(i+1)%4,g=ctx.createLinearGradient(q[i].x,q[i].y,b[i].x,b[i].y);g.addColorStop(0,i%2?"rgba(255,65,165,.45)":"rgba(199,241,91,.45)");g.addColorStop(1,i%2?"rgba(55,230,255,.38)":"rgba(82,105,255,.42)");ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(q[i].x,q[i].y);ctx.lineTo(q[j].x,q[j].y);ctx.lineTo(b[j].x,b[j].y);ctx.lineTo(b[i].x,b[i].y);ctx.closePath();ctx.fill();}
    ctx.restore();
    ctx.save();ctx.globalAlpha=portal.alpha;path(q);ctx.clip();ctx.translate(center.x,center.y);ctx.scale(1.08+portal.depth*.18,1.08+portal.depth*.18);ctx.translate(-center.x,-center.y);ctx.filter=`saturate(${1.5+portal.depth*.7}) contrast(${1.1+portal.depth*.3})`;ctx.drawImage(source,0,0);ctx.restore();
    ctx.save();ctx.globalAlpha=portal.alpha;ctx.globalCompositeOperation="screen";const g=ctx.createLinearGradient(q[0].x,q[0].y,q[2].x,q[2].y);g.addColorStop(0,"#eaffff");g.addColorStop(.25,"#c7f15b");g.addColorStop(.55,"#596aff");g.addColorStop(.8,"#ff48a8");g.addColorStop(1,"#eaffff");ctx.strokeStyle=g;ctx.lineWidth=2.5+portal.depth*2.5;ctx.shadowColor="#61e8ff";ctx.shadowBlur=16+portal.depth*16;path(q);ctx.stroke();ctx.globalAlpha*=.5;path(b);ctx.stroke();ctx.restore();
  }

  function resetEffectState(){tears=[];lastSwipe=-Infinity;portal.quad=null;portal.back=null;portal.alpha=0;portal.lost=0;}

  function render(now){
    const e=effectId(); if(e!==lastEffect){resetEffectState();lastEffect=e;rename();}
    if(video.readyState<HTMLMediaElement.HAVE_CURRENT_DATA||!video.videoWidth){schedule();return;}
    const {w,h}=size();capture(w,h);const s=signal(now);
    if(HERO.has(e)){
      clean(w,h);
      if(e==="holo")drawPinch(s,w,h);
      else if(e==="glitch")drawSwipe(s,w,h,now);
      else drawPortal(s,w,h,now);
    } else if(FRAME_ONLY.has(e)&&!s?.quadValid){
      // Final compositor wins over the legacy 25-frame hold.
      clean(w,h);
    }
    if(globalThis.__FRAMELAB_DEBUG__) window.dispatchEvent(new CustomEvent("framelab-runtime-frame",{detail:{effect:e,fresh:Boolean(s),quadValid:Boolean(s?.quadValid)}}));
    schedule();
  }

  function schedule(){setTimeout(()=>{raf=requestAnimationFrame(render);},0);}
  const observer=new MutationObserver(rename);observer.observe(toolbar,{childList:true});rename();setTimeout(()=>observer.disconnect(),15000);
  function start(){if(video.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA&&canvas.width)schedule();else requestAnimationFrame(start);}start();
  window.addEventListener("pagehide",()=>cancelAnimationFrame(raf),{once:true});
}
