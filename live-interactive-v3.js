(function () {
  'use strict';

  const TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const WASM_URL = `${TASKS_VISION_URL}/wasm`;
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  const EFFECTS = [
    { id: 'feedback', zh: '时间反馈', en: 'Motion Feedback' },
    { id: 'flow', zh: '运动流场', en: 'Motion Flow' },
    { id: 'time', zh: '时间切片', en: 'Time Slice' },
    { id: 'electric', zh: '电场轮廓', en: 'Electric Bloom' },
  ];
  const EFFECT_INDEX = { feedback: 0, flow: 1, time: 2, electric: 3 };
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');
  const FRAMED = window.self !== window.top;
  const USE_SUPPLIED_CAMERA = FRAMED && params.has('embedded');
  if (FRAMED) document.documentElement.classList.add('embedded');

  const video = document.getElementById('live-video');
  const canvas = document.getElementById('gl-canvas');
  const status = document.getElementById('live-status');
  const statusText = document.getElementById('live-status-text');
  const hint = document.getElementById('live-hint');
  const select = document.getElementById('interactive-effect-select');
  const meterFill = document.querySelector('.motion-meter span');
  const recordButton = document.getElementById('interactive-record');
  if (!video || !canvas) return;

  const state = {
    effect: EFFECT_INDEX[params.get('effect')] != null ? params.get('effect') : 'feedback',
    hands: [], energy: 0, accel: 0,
    landmarker: null, lastTrackAt: 0, lastTrackTimestamp: 0,
    suppliedCameraStream: null, suppliedResolve: null,
    recorder: null, recordChunks: [], recordStartedAt: 0, recordTimer: 0,
    demoStart: performance.now(), lastRenderAt: performance.now(),
  };

  const suppliedReady = new Promise((resolve) => { state.suppliedResolve = resolve; });
  window.receiveLiveCameraStream = (stream) => {
    state.suppliedCameraStream = stream;
    state.suppliedResolve?.(stream);
  };
  if (USE_SUPPLIED_CAMERA) window.parent?.postMessage({ type: 'framelab-live-ready' }, location.origin);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mixPoint = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

  function trackEvent(name, data = {}) {
    try {
      const payload = { mode: 'live_camera_gpu_v3', effect: state.effect, demo: DEMO, ...data };
      if (typeof window.trackAnalyticsEvent === 'function') window.trackAnalyticsEvent(name, payload);
      else window.va?.('event', { name, data: payload });
    } catch (_) {}
  }

  function setStatus(message, hidden = false) {
    if (statusText) statusText.textContent = message;
    status?.classList.toggle('hidden', hidden);
  }

  function buildToolbar() {
    if (!select) return;
    select.innerHTML = '';
    EFFECTS.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.zh} · ${item.en}`;
      select.appendChild(option);
    });
    select.value = state.effect;
    select.addEventListener('change', () => {
      state.effect = select.value;
      renderer?.resetFeedback();
      trackEvent('Live Effect Changed');
    });
    recordButton?.addEventListener('click', toggleRecording);
  }

  function makeCameraError(name, message) {
    const e = new Error(message); e.name = name; return e;
  }

  async function waitForSuppliedStream() {
    if (state.suppliedCameraStream?.active) return state.suppliedCameraStream;
    return Promise.race([
      suppliedReady.then((stream) => {
        if (!stream?.active) throw makeCameraError('InvalidStateError', '摄像头画面已停止');
        return stream;
      }),
      new Promise((_, reject) => setTimeout(() => reject(makeCameraError('TimeoutError', '父页面没有传入摄像头画面')), 8000)),
    ]);
  }

  function getCameraStream() {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(makeCameraError('NotSupportedError', '当前浏览器不支持摄像头访问'));
    const mobile = matchMedia('(max-width: 760px)').matches;
    return navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: mobile ? 960 : 1280 },
        height: { ideal: mobile ? 540 : 720 },
        frameRate: { ideal: 30, max: 60 },
        facingMode: 'user',
      },
      audio: false,
    });
  }

  function waitForVideoReady() {
    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timeout);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        error ? reject(error) : resolve();
      };
      const onReady = () => { if (video.videoWidth && video.videoHeight) finish(); };
      const onError = () => finish(makeCameraError('NotReadableError', '摄像头画面无法播放'));
      const timeout = setTimeout(() => finish(makeCameraError('TimeoutError', '摄像头画面加载超时')), 8000);
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
    });
  }

  function makeDemoStream() {
    const demo = document.createElement('canvas');
    demo.width = 1280; demo.height = 720;
    const d = demo.getContext('2d');
    function paint(now) {
      const t = now / 1000;
      const g = d.createLinearGradient(0, 0, demo.width, demo.height);
      g.addColorStop(0, '#0e131c'); g.addColorStop(0.45, '#3b2f4d'); g.addColorStop(1, '#143a43');
      d.fillStyle = g; d.fillRect(0, 0, demo.width, demo.height);
      d.fillStyle = 'rgba(255,255,255,.045)';
      for (let x = 0; x < demo.width; x += 48) d.fillRect(x, 0, 1, demo.height);
      for (let y = 0; y < demo.height; y += 48) d.fillRect(0, y, demo.width, 1);
      const cx = demo.width * (0.5 + Math.sin(t * 0.65) * 0.04);
      const cy = demo.height * 0.46;
      d.fillStyle = '#e7c8b9'; d.beginPath(); d.arc(cx, cy - 145, 84, 0, Math.PI * 2); d.fill();
      d.fillStyle = '#202635'; d.beginPath(); d.ellipse(cx, cy + 70, 190, 240, 0, 0, Math.PI * 2); d.fill();
      const hx = cx + Math.sin(t * 1.6) * 300;
      const hy = cy - 30 + Math.cos(t * 1.1) * 105;
      d.strokeStyle = '#e7c8b9'; d.lineWidth = 42; d.lineCap = 'round';
      d.beginPath(); d.moveTo(cx + 120, cy + 35); d.lineTo(hx, hy); d.stroke();
      d.fillStyle = '#f1d7c9'; d.beginPath(); d.arc(hx, hy, 38, 0, Math.PI * 2); d.fill();
      d.fillStyle = 'rgba(255,255,255,.78)'; d.font = '700 22px system-ui';
      d.fillText('FrameLab · realtime motion test', 36, 48);
      requestAnimationFrame(paint);
    }
    requestAnimationFrame(paint);
    return demo.captureStream(30);
  }

  function landmarkToUv(lm) { return { x: 1 - lm.x, y: 1 - lm.y, z: lm.z || 0 }; }
  function palmCenter(points) {
    const ids = [0, 5, 9, 13, 17];
    return ids.reduce((out, id) => ({ x: out.x + points[id].x / ids.length, y: out.y + points[id].y / ids.length }), { x: 0, y: 0 });
  }
  function rawHand(points) {
    const palm = palmCenter(points);
    const scale = Math.max(0.035, dist(points[0], points[9]));
    const pinch = clamp(dist(points[4], points[8]) / Math.max(0.02, scale * 2.15), 0, 1);
    const tips = [4, 8, 12, 16, 20];
    const openness = clamp(tips.reduce((sum, id) => sum + dist(points[id], points[0]), 0) / (tips.length * scale * 2.65), 0, 1);
    return { points, palm, scale, pinch, openness };
  }
  function orderHands(raw, previous) {
    if (raw.length !== 2 || previous.length !== 2) return raw;
    const same = dist(raw[0].palm, previous[0].palm) + dist(raw[1].palm, previous[1].palm);
    const swapped = dist(raw[1].palm, previous[0].palm) + dist(raw[0].palm, previous[1].palm);
    return swapped < same ? [raw[1], raw[0]] : raw;
  }
  function updateHands(result, timestamp) {
    const previous = state.hands;
    const dt = clamp((timestamp - (state.lastTrackTimestamp || timestamp - 50)) / 1000, 1 / 120, 0.12);
    state.lastTrackTimestamp = timestamp;
    let raw = (result.landmarks || []).slice(0, 2).map((landmarks) => rawHand(landmarks.map(landmarkToUv)));
    raw = orderHands(raw, previous);
    state.hands = raw.map((hand, i) => {
      const old = previous[i];
      if (!old) return { ...hand, vx: 0, vy: 0, speed: 0, accel: 0 };
      const palm = mixPoint(old.palm, hand.palm, 0.62);
      const rawVx = (palm.x - old.palm.x) / dt;
      const rawVy = (palm.y - old.palm.y) / dt;
      const vx = lerp(old.vx || 0, rawVx, 0.48);
      const vy = lerp(old.vy || 0, rawVy, 0.48);
      const speed = Math.hypot(vx, vy);
      return {
        ...hand, palm,
        scale: lerp(old.scale, hand.scale, 0.55),
        pinch: lerp(old.pinch, hand.pinch, 0.5),
        openness: lerp(old.openness, hand.openness, 0.5),
        vx, vy, speed, accel: (speed - (old.speed || 0)) / dt,
      };
    });
  }

  function updateDemoHands(now) {
    const t = (now - state.demoStart) / 1000;
    const palm = { x: 0.5 - Math.sin(t * 1.6) * 0.235, y: 0.56 + Math.cos(t * 1.1) * 0.145 };
    const old = state.hands[0];
    const dt = 1 / 60;
    const vx = old ? (palm.x - old.palm.x) / dt : 0;
    const vy = old ? (palm.y - old.palm.y) / dt : 0;
    const speed = Math.hypot(vx, vy);
    const scale = 0.075;
    const points = Array.from({ length: 21 }, (_, i) => ({ x: palm.x + Math.cos(i * 1.7) * scale * 0.8, y: palm.y + Math.sin(i * 1.7) * scale * 0.8 }));
    points[8] = { x: palm.x + scale * 1.25, y: palm.y + scale * 0.5 };
    points[4] = { x: palm.x - scale * 0.9, y: palm.y + scale * 0.35 };
    state.hands = [{ points, palm, scale, pinch: 0.58, openness: 0.82, vx, vy, speed, accel: old ? (speed - old.speed) / dt : 0 }];
  }

  async function initTracking() {
    if (DEMO) return;
    try {
      const { HandLandmarker, FilesetResolver } = await import(TASKS_VISION_URL);
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      state.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.35, minHandPresenceConfidence: 0.35, minTrackingConfidence: 0.35,
      });
    } catch (error) {
      console.warn('Hand tracking unavailable; motion field remains active.', error);
    }
  }

  function maybeTrack(now) {
    if (!state.landmarker || video.readyState < 2 || now - state.lastTrackAt < 45) return;
    state.lastTrackAt = now;
    try { updateHands(state.landmarker.detectForVideo(video, now), now); }
    catch (error) { console.warn('Skipped tracking frame', error); }
  }

  const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = gl_VertexID==0?vec2(-1.,-1.):gl_VertexID==1?vec2(1.,-1.):gl_VertexID==2?vec2(-1.,1.):vec2(1.,1.);
  vUv=p*.5+.5; gl_Position=vec4(p,0.,1.);
}`;

  const FLOW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uCurrent; uniform sampler2D uPrevious; uniform vec2 uResolution;
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec2 srcUv(vec2 uv){uv=clamp(uv,vec2(.002),vec2(.998));return vec2(1.-uv.x,uv.y);}
float cur(vec2 uv){return lum(texture(uCurrent,srcUv(uv)).rgb);}
float prv(vec2 uv){return lum(texture(uPrevious,srcUv(uv)).rgb);}
void main(){
  vec2 px=1./uResolution;
  float a11=0.,a12=0.,a22=0.,b1=0.,b2=0.,temporal=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 o=vec2(float(i),float(j))*px*2.; vec2 q=vUv+o;
    float ix=((cur(q+vec2(px.x,0.))-cur(q-vec2(px.x,0.)))+(prv(q+vec2(px.x,0.))-prv(q-vec2(px.x,0.))))*.25;
    float iy=((cur(q+vec2(0.,px.y))-cur(q-vec2(0.,px.y)))+(prv(q+vec2(0.,px.y))-prv(q-vec2(0.,px.y))))*.25;
    float it=cur(q)-prv(q);
    a11+=ix*ix; a12+=ix*iy; a22+=iy*iy; b1-=ix*it; b2-=iy*it; temporal+=abs(it);
  }
  float det=a11*a22-a12*a12;
  vec2 flowPx=vec2(0.);
  if(det>0.000003) flowPx=vec2(a22*b1-a12*b2,a11*b2-a12*b1)/det;
  flowPx=clamp(flowPx,vec2(-18.),vec2(18.));
  vec2 flowUv=flowPx*px;
  float change=temporal/9.;
  float confidence=smoothstep(.006,.07,change)*smoothstep(.000003,.0012,det);
  flowUv*=confidence;
  vec2 enc=flowUv*14.+.5;
  outColor=vec4(clamp(enc,0.,1.),confidence,change);
}`;

  const SIM_FRAG = `#version 300 es
precision highp float; precision highp int;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uVideo,uFlow,uFeedback,uHistory0,uHistory1,uHistory2,uHistory3;
uniform vec2 uResolution; uniform float uTime,uDelta,uEnergy,uAccel; uniform int uEffect,uHandCount;
uniform vec4 uHand0,uHand1,uMeta,uPoints[12];
vec2 safe(vec2 uv){return clamp(uv,vec2(.002),vec2(.998));}
vec2 srcUv(vec2 uv){uv=safe(uv);return vec2(1.-uv.x,uv.y);}
vec3 cam(vec2 uv){return texture(uVideo,srcUv(uv)).rgb;}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec2 decodeFlow(vec2 uv,out float conf){vec4 f=texture(uFlow,safe(uv));conf=f.b;return (f.rg-.5)/14.;}
vec2 hvel(int h){return h==0?uHand0.zw:uHand1.zw;}
float hopen(int h){return h==0?uMeta.x:uMeta.z;}
float hpinch(int h){return h==0?uMeta.y:uMeta.w;}
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),f.x),f.y);}
vec2 curl(vec2 p){float e=.015;float nx1=noise(p+vec2(e,0)),nx0=noise(p-vec2(e,0)),ny1=noise(p+vec2(0,e)),ny0=noise(p-vec2(0,e));return vec2(ny1-ny0,-(nx1-nx0))/(2.*e);}
vec2 handField(vec2 uv,out float mask){
  vec2 field=vec2(0.);mask=0.;
  for(int i=0;i<12;i++){
    int h=i<6?0:1;if(h>=uHandCount)continue;vec4 p=uPoints[i];vec2 d=uv-p.xy;float r=max(.018,p.z);float d2=dot(d,d);
    float inf=exp(-d2/(r*r*.72))*p.w;vec2 dir=d/(sqrt(d2)+.0008);vec2 tang=vec2(-dir.y,dir.x);vec2 vel=hvel(h);float sp=min(2.5,length(vel));
    field+=vel*inf*uDelta*(.42+sp*.20);field+=tang*inf*hopen(h)*uDelta*(.035+uEnergy*.05);field+=dir*inf*uDelta*(hopen(h)*.045-(1.-hpinch(h))*.12);
    mask=max(mask,inf);
  }
  return field;
}
float edge(vec2 uv){vec2 px=1./uResolution;float gx=lum(cam(uv+vec2(px.x,0)))-lum(cam(uv-vec2(px.x,0)));float gy=lum(cam(uv+vec2(0,px.y)))-lum(cam(uv-vec2(0,px.y)));return length(vec2(gx,gy));}
float lineGlow(vec2 uv,vec2 a,vec2 b,float gate){vec2 ab=b-a;float l=max(length(ab),.001),t=clamp(dot(uv-a,ab)/dot(ab,ab),0.,1.);vec2 n=vec2(-ab.y,ab.x)/l;float j=(sin(t*73.+uTime*19.)+sin(t*131.-uTime*13.)*.55)*.004*gate;float d=length(uv-(mix(a,b,t)+n*j));return (exp(-d*620.)*1.2+exp(-d*95.)*.32)*gate;}
vec3 historyAt(float age,vec2 uv){
  if(age<.22)return mix(texture(uHistory0,srcUv(uv)).rgb,texture(uHistory1,srcUv(uv)).rgb,age/.22);
  if(age<.52)return mix(texture(uHistory1,srcUv(uv)).rgb,texture(uHistory2,srcUv(uv)).rgb,(age-.22)/.30);
  return mix(texture(uHistory2,srcUv(uv)).rgb,texture(uHistory3,srcUv(uv)).rgb,clamp((age-.52)/.48,0.,1.));
}
void main(){
  vec2 uv=vUv;float conf=0.;vec2 flow=decodeFlow(uv,conf);float hm=0.;vec2 hf=handField(uv,hm);float activity=clamp(conf*1.25+hm*(.2+uEnergy*.8),0.,1.);vec2 total=flow*(1.2+uEnergy*.8)+hf;vec3 current=cam(uv);vec3 color=current;
  if(uEffect==0){
    float decay=pow(.955,uDelta*60.);vec2 centered=uv-.5;float zoom=pow(.9975,uDelta*60.);vec2 fuv=.5+centered*zoom-total*(1.3+uEnergy*.8);vec3 fb=texture(uFeedback,safe(fuv)).rgb*decay;
    float wet=clamp(.08+activity*.72+uEnergy*.12,0.,.88);color=mix(current,fb,wet);color+=current*(.32+.24*(1.-wet));
  }else if(uEffect==1){
    vec2 organic=curl(uv*5.+vec2(uTime*.08,-uTime*.05))*activity*(.0015+uEnergy*.003);vec2 disp=total*(1.8+uEnergy*1.6)+organic;
    vec3 a=cam(uv-disp*.45),b=cam(uv-disp),c=cam(uv-disp*1.7);vec3 visc=a*.34+b*.44+c*.22;float wet=clamp(activity*.94+hm*.25,0.,.98);
    vec3 old=texture(uFeedback,safe(uv-disp*.7)).rgb;color=mix(current,mix(visc,old,.12*wet),wet);
  }else if(uEffect==2){
    float handAge=clamp(hm*(.35+uEnergy*.65),0.,1.);float motionAge=clamp(conf*(.32+uEnergy*.4),0.,.75);float stripe=.5+.5*sin((uv.y+flow.x*3.)*38.-uTime*.7);float age=clamp(max(handAge,motionAge)*(.55+.45*stripe),0.,1.);
    vec2 drag=total*(.5+age*2.);vec3 past=historyAt(age,uv-drag);color=mix(current,past,smoothstep(.08,.55,age));
  }else{
    float e=edge(uv);float hot=smoothstep(.045,.18,e)*(1.+conf*1.6+uEnergy*.9);vec3 cyan=vec3(.18,1.18,1.35),mag=vec3(1.3,.16,1.02);float mixv=.5+.5*sin(uv.y*11.+flow.x*180.);vec3 emit=mix(cyan,mag,mixv)*hot;
    emit+=mix(cyan,vec3(1.4),hm)*hm*(.12+uEnergy*.75);if(uHandCount==2){vec2 a=uPoints[2].xy,b=uPoints[8].xy;float prox=1.-smoothstep(.16,.62,distance(a,b));emit+=vec3(.7,1.35,1.5)*lineGlow(uv,a,b,prox*(.55+uEnergy));}
    color=current*.28+emit;
  }
  outColor=vec4(max(color,vec3(0.)),1.);
}`;

  const BRIGHT_FRAG = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform sampler2D uScene;uniform float uThreshold;
void main(){vec3 c=texture(uScene,vUv).rgb;float l=max(max(c.r,c.g),c.b);float k=smoothstep(uThreshold,uThreshold+.28,l);outColor=vec4(c*k,1.);}`;
  const BLUR_FRAG = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform sampler2D uTex;uniform vec2 uTexel;uniform vec2 uDir;
void main(){vec3 c=texture(uTex,vUv).rgb*.227027;c+=texture(uTex,vUv+uDir*uTexel*1.384615).rgb*.316216;c+=texture(uTex,vUv-uDir*uTexel*1.384615).rgb*.316216;c+=texture(uTex,vUv+uDir*uTexel*3.230769).rgb*.070270;c+=texture(uTex,vUv-uDir*uTexel*3.230769).rgb*.070270;outColor=vec4(c,1.);}`;
  const COPY_FRAG = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform sampler2D uTex;void main(){outColor=texture(uTex,vUv);}`;
  const POST_FRAG = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform sampler2D uScene,uBloomHalf,uBloomQuarter;uniform float uBloom,uExposure;
void main(){vec3 s=texture(uScene,vUv).rgb;vec3 b=texture(uBloomHalf,vUv).rgb*.7+texture(uBloomQuarter,vUv).rgb*1.1;vec3 c=s+b*uBloom;c=vec3(1.)-exp(-c*uExposure);c=pow(max(c,vec3(0.)),vec3(1./2.2));outColor=vec4(c,1.);}`;

  let renderer = null;
  function createRenderer() {
    const gl = canvas.getContext('webgl2', { alpha:false, antialias:false, depth:false, stencil:false, premultipliedAlpha:false, preserveDrawingBuffer:false, powerPreference:'high-performance' });
    if (!gl) return createFallbackRenderer();
    function compile(type, src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader compile failed');return s;}
    function makeProgram(fs){const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,VERT));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Program link failed');return p;}
    const flowP=makeProgram(FLOW_FRAG),simP=makeProgram(SIM_FRAG),brightP=makeProgram(BRIGHT_FRAG),blurP=makeProgram(BLUR_FRAG),postP=makeProgram(POST_FRAG),copyP=makeProgram(COPY_FRAG);
    const vao=gl.createVertexArray();gl.bindVertexArray(vao);
    const loc=(p,n)=>gl.getUniformLocation(p,n);
    function tex(filter=gl.LINEAR){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(16));return t;}
    function target(w,h,filter=gl.LINEAR){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer incomplete');return{t,f,w,h};}
    function bind(unit,t){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);}
    function upload(t){bind(0,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);}
    function draw(p,fbo,w,h){gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,w,h);gl.useProgram(p);gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
    function clearTarget(x){gl.bindFramebuffer(gl.FRAMEBUFFER,x.f);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}

    const videoTex=[tex(),tex()];let currentIndex=0,previousIndex=1,hasFrame=false,videoSerial=0;
    const history=[tex(),tex(),tex(),tex()];let historyHead=0;
    let width=0,height=0,flowT=null,scene=[null,null],sceneWrite=0,bHalfA=null,bHalfB=null,bQuarterA=null,bQuarterB=null;

    const U={
      flow:{cur:loc(flowP,'uCurrent'),prev:loc(flowP,'uPrevious'),res:loc(flowP,'uResolution')},
      sim:{video:loc(simP,'uVideo'),flow:loc(simP,'uFlow'),feedback:loc(simP,'uFeedback'),hist:[0,1,2,3].map(i=>loc(simP,`uHistory${i}`)),res:loc(simP,'uResolution'),time:loc(simP,'uTime'),delta:loc(simP,'uDelta'),energy:loc(simP,'uEnergy'),accel:loc(simP,'uAccel'),effect:loc(simP,'uEffect'),count:loc(simP,'uHandCount'),h0:loc(simP,'uHand0'),h1:loc(simP,'uHand1'),meta:loc(simP,'uMeta'),points:loc(simP,'uPoints[0]')},
      bright:{scene:loc(brightP,'uScene'),threshold:loc(brightP,'uThreshold')},
      blur:{tex:loc(blurP,'uTex'),texel:loc(blurP,'uTexel'),dir:loc(blurP,'uDir')},
      post:{scene:loc(postP,'uScene'),half:loc(postP,'uBloomHalf'),quarter:loc(postP,'uBloomQuarter'),bloom:loc(postP,'uBloom'),exposure:loc(postP,'uExposure')},
      copy:{tex:loc(copyP,'uTex')},
    };

    function resize(){
      const vw=video.videoWidth||1280,vh=video.videoHeight||720,maxDim=matchMedia('(max-width:760px)').matches?900:1280,scale=Math.min(1,maxDim/Math.max(vw,vh));
      const w=Math.max(2,Math.round(vw*scale)),h=Math.max(2,Math.round(vh*scale));document.documentElement.style.setProperty('--video-aspect',String(vw/vh));if(w===width&&h===height)return;
      width=w;height=h;canvas.width=w;canvas.height=h;
      [flowT,...scene,bHalfA,bHalfB,bQuarterA,bQuarterB].filter(Boolean).forEach(x=>{gl.deleteTexture(x.t);gl.deleteFramebuffer(x.f);});
      flowT=target(Math.max(2,w>>1),Math.max(2,h>>1));scene=[target(w,h),target(w,h)];sceneWrite=0;
      bHalfA=target(Math.max(2,w>>1),Math.max(2,h>>1));bHalfB=target(bHalfA.w,bHalfA.h);bQuarterA=target(Math.max(2,w>>2),Math.max(2,h>>2));bQuarterB=target(bQuarterA.w,bQuarterA.h);
      scene.forEach(clearTarget);
    }
    function resetFeedback(){if(scene[0])scene.forEach(clearTarget);}
    function pushVideoFrame(){
      if(video.readyState<2)return;resize();previousIndex=currentIndex;currentIndex=1-currentIndex;upload(videoTex[currentIndex]);
      if(!hasFrame){upload(videoTex[previousIndex]);history.forEach(upload);hasFrame=true;historyHead=0;}else if((++videoSerial%3)===0){historyHead=(historyHead+1)%4;upload(history[historyHead]);}
    }
    function orderedHistory(){return [0,1,2,3].map(i=>history[(historyHead-i+4)%4]);}
    function handVec(hand){return hand?[hand.palm.x,hand.palm.y,hand.vx,hand.vy]:[-2,-2,0,0];}
    function pointData(){const out=new Float32Array(48);for(let h=0;h<2;h++){const hand=state.hands[h];if(!hand)continue;[-1,4,8,12,16,20].forEach((id,k)=>{const p=id===-1?hand.palm:hand.points[id],o=(h*6+k)*4;out[o]=p.x;out[o+1]=p.y;out[o+2]=hand.scale*(k===0?2.15:1.15);out[o+3]=k===0?1:.72;});}return out;}
    function blurPass(src,a,b){
      gl.useProgram(blurP);bind(0,src.t);gl.uniform1i(U.blur.tex,0);gl.uniform2f(U.blur.texel,1/src.w,1/src.h);gl.uniform2f(U.blur.dir,1,0);draw(blurP,a.f,a.w,a.h);
      bind(0,a.t);gl.uniform2f(U.blur.texel,1/a.w,1/a.h);gl.uniform2f(U.blur.dir,0,1);draw(blurP,b.f,b.w,b.h);
    }
    function render(now,dt){
      resize();if(!hasFrame||!width||!height)return;
      gl.useProgram(flowP);bind(0,videoTex[currentIndex]);bind(1,videoTex[previousIndex]);gl.uniform1i(U.flow.cur,0);gl.uniform1i(U.flow.prev,1);gl.uniform2f(U.flow.res,width,height);draw(flowP,flowT.f,flowT.w,flowT.h);
      const write=scene[sceneWrite],read=scene[1-sceneWrite];gl.useProgram(simP);bind(0,videoTex[currentIndex]);bind(1,flowT.t);bind(2,read.t);const hist=orderedHistory();hist.forEach((t,i)=>bind(3+i,t));
      gl.uniform1i(U.sim.video,0);gl.uniform1i(U.sim.flow,1);gl.uniform1i(U.sim.feedback,2);U.sim.hist.forEach((u,i)=>gl.uniform1i(u,3+i));gl.uniform2f(U.sim.res,width,height);gl.uniform1f(U.sim.time,now/1000);gl.uniform1f(U.sim.delta,dt);gl.uniform1f(U.sim.energy,state.energy);gl.uniform1f(U.sim.accel,state.accel);gl.uniform1i(U.sim.effect,EFFECT_INDEX[state.effect]??0);gl.uniform1i(U.sim.count,state.hands.length);gl.uniform4fv(U.sim.h0,handVec(state.hands[0]));gl.uniform4fv(U.sim.h1,handVec(state.hands[1]));gl.uniform4f(U.sim.meta,state.hands[0]?.openness||0,state.hands[0]?.pinch??1,state.hands[1]?.openness||0,state.hands[1]?.pinch??1);gl.uniform4fv(U.sim.points,pointData());draw(simP,write.f,width,height);
      gl.useProgram(brightP);bind(0,write.t);gl.uniform1i(U.bright.scene,0);gl.uniform1f(U.bright.threshold,state.effect==='electric'?.42:.7);draw(brightP,bHalfA.f,bHalfA.w,bHalfA.h);blurPass(bHalfA,bHalfB,bHalfA);
      gl.useProgram(copyP);bind(0,bHalfA.t);gl.uniform1i(U.copy.tex,0);draw(copyP,bQuarterA.f,bQuarterA.w,bQuarterA.h);blurPass(bQuarterA,bQuarterB,bQuarterA);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(postP);bind(0,write.t);bind(1,bHalfA.t);bind(2,bQuarterA.t);gl.uniform1i(U.post.scene,0);gl.uniform1i(U.post.half,1);gl.uniform1i(U.post.quarter,2);gl.uniform1f(U.post.bloom,state.effect==='electric'?1.25:state.effect==='feedback'?.38:.18);gl.uniform1f(U.post.exposure,state.effect==='electric'?1.16:1.04);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      sceneWrite=1-sceneWrite;
    }
    return{type:'webgl2-v3',render,pushVideoFrame,resetFeedback};
  }

  function createFallbackRenderer(){const c=canvas.getContext('2d',{alpha:false});return{type:'2d-fallback',resetFeedback(){},pushVideoFrame(){},render(){const w=video.videoWidth||1280,h=video.videoHeight||720;canvas.width=w;canvas.height=h;c.save();c.translate(w,0);c.scale(-1,1);c.drawImage(video,0,0,w,h);c.restore();}};}

  function updateEnergy(){
    const speed=state.hands.reduce((s,h)=>s+Math.min(2.2,h.speed),0),acc=state.hands.reduce((s,h)=>s+Math.min(8,Math.abs(h.accel)),0);
    const te=clamp(speed*.58,0,1),ta=clamp(acc*.09,0,1);state.energy=lerp(state.energy,te,te>state.energy?.22:.08);state.accel=lerp(state.accel,ta,ta>state.accel?.2:.06);if(!state.hands.length){state.energy*=.94;state.accel*=.9;}
  }

  function startVideoFrameLoop(){
    let lastTime=-1;
    if(typeof video.requestVideoFrameCallback==='function'){
      const onFrame=(now)=>{renderer?.pushVideoFrame();maybeTrack(now);video.requestVideoFrameCallback(onFrame);};video.requestVideoFrameCallback(onFrame);
    }else{
      const tick=(now)=>{if(video.currentTime!==lastTime){lastTime=video.currentTime;renderer?.pushVideoFrame();maybeTrack(now);}requestAnimationFrame(tick);};requestAnimationFrame(tick);
    }
  }
  function renderLoop(now){if(DEMO)updateDemoHands(now);updateEnergy();const dt=clamp((now-state.lastRenderAt)/1000,1/120,.05);state.lastRenderAt=now;renderer?.render(now,dt);if(meterFill)meterFill.style.transform=`scaleX(${Math.max(.03,state.energy)})`;hint?.classList.toggle('quiet',state.energy>.08);requestAnimationFrame(renderLoop);}

  function supportedMime(){if(typeof MediaRecorder==='undefined')return'';return['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';}
  function resetRecordUi(){clearInterval(state.recordTimer);state.recordTimer=0;recordButton?.classList.remove('is-recording');const l=recordButton?.querySelector('.interactive-record-label'),t=recordButton?.querySelector('time');if(l)l.textContent='录制';if(t)t.textContent='00:00';}
  function toggleRecording(){
    if(!recordButton)return;if(state.recorder?.state==='recording'){state.recorder.stop();return;}if(!canvas.captureStream||typeof MediaRecorder==='undefined')return;
    const stream=canvas.captureStream(30),mime=supportedMime(),rec=mime?new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:12_000_000}):new MediaRecorder(stream);state.recorder=rec;state.recordChunks=[];
    rec.ondataavailable=e=>{if(e.data.size)state.recordChunks.push(e.data);};rec.onerror=()=>trackEvent('Live Recording Failed');rec.onstop=()=>{resetRecordUi();const fm=rec.mimeType||mime||'video/webm';if(state.recordChunks.length){const blob=new Blob(state.recordChunks,{type:fm}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`FrameLab-live-${new Date().toISOString().replace(/[:.]/g,'-')}.${fm.startsWith('video/mp4')?'mp4':'webm'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);}stream.getTracks().forEach(t=>t.stop());state.recorder=null;state.recordChunks=[];trackEvent('Live Recording Completed');};
    rec.start(1000);state.recordStartedAt=Date.now();recordButton.classList.add('is-recording');recordButton.querySelector('.interactive-record-label').textContent='停止';state.recordTimer=setInterval(()=>{const sec=Math.floor((Date.now()-state.recordStartedAt)/1000);recordButton.querySelector('time').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;},250);trackEvent('Live Recording Started');
  }

  async function boot(){
    buildToolbar();
    try{
      setStatus(DEMO?'正在启动演示画面…':USE_SUPPLIED_CAMERA?'正在连接摄像头…':'正在请求摄像头权限…');
      const stream=DEMO?makeDemoStream():USE_SUPPLIED_CAMERA?await waitForSuppliedStream():await getCameraStream();video.srcObject=stream;await waitForVideoReady();await video.play();
      renderer=createRenderer();await initTracking();renderer.pushVideoFrame();startVideoFrameLoop();setStatus(renderer.type.startsWith('webgl2')?'Realtime GPU Visual 已启动':'WebGL2 不可用，显示原始摄像头',renderer.type.startsWith('webgl2'));trackEvent('Live Camera Started',{renderer:renderer.type,width:video.videoWidth,height:video.videoHeight});requestAnimationFrame(renderLoop);
    }catch(error){console.error(error);setStatus(error?.message||'实时摄像头启动失败');trackEvent('Live Camera Failed',{reason:error?.name||'unknown'});}
  }
  boot();
})();
