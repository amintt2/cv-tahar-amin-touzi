/* Tahar Amin Touzi — scènes WebGL : relief vivant du hero et terrain 3D du contact.
   WebGL 1 brut, aucune dépendance, aucun texte dans les canvas.
   Repli : si WebGL, l'extension des dérivées ou un shader manque, rien n'est modifié
   (le fond topo.svg et le tracé SVG restent tels quels). */
(function () {
  'use strict';

  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var reduced = mq('(prefers-reduced-motion: reduce)');
  var finePointer = mq('(hover: hover) and (pointer: fine)');
  var small = window.innerWidth < 760;
  // ?gl=force : accepte aussi le rendu logiciel (tests sans GPU).
  var forceGL = /[?&]gl=force\b/.test(window.location.search);
  var stats = window.__sceneStats = { hero: 'off', terrain: 'off', heroScale: 0, terrainScale: 0 };

  /* ---------- Outils WebGL ---------- */
  function context(canvas, opts) {
    opts.stencil = false;
    opts.powerPreference = 'high-performance';
    opts.failIfMajorPerformanceCaveat = !forceGL;
    var gl = null;
    try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;
    return gl;
  }

  function shader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }

  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u, a: function (name) { return gl.getAttribLocation(p, name); } };
  }

  /* ---------- Boucle commune : une seule rAF, pause hors écran et onglet caché ---------- */
  var scenes = [], raf = 0, last = 0;
  function loop(t) {
    raf = 0;
    var raw = last ? (t - last) / 1000 : 1 / 60;
    var dt = Math.min(0.05, raw);
    last = t;
    var any = false;
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].active) { scenes[i].frame(dt, raw); any = true; }
    }
    if (any && !document.hidden) raf = requestAnimationFrame(loop);
    else last = 0;
  }
  function kick() { if (!raf && !reduced && !document.hidden) raf = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; } else kick();
  });

  function watch(el, scene, margin) {
    if (!('IntersectionObserver' in window)) { scene.active = true; kick(); return; }
    new IntersectionObserver(function (entries) {
      scene.active = entries[entries.length - 1].isIntersecting && !scene.frozen;
      if (scene.active) kick();
    }, { rootMargin: margin || '0px' }).observe(el);
  }

  // Qualité adaptative, mesurée sur ~0,8 s : si la cadence chute, on baisse la résolution du canvas ;
  // si elle reste mauvaise au minimum (rendu logiciel, appareil très lent), on fige la scène sur une image.
  function governor(scene, minScale) {
    var acc = 0, n = 0, warm = 0.6, bad = 0;
    return function (raw) {
      if (warm > 0) { warm -= raw; return; }
      acc += raw; n++;
      if (acc < 0.8 || n < 4) return;
      var avg = acc / n; acc = 0; n = 0;
      bad = (avg > 1 / 15 || (avg > 1 / 30 && scene.scale <= minScale)) ? bad + 1 : 0;
      if (bad >= 2) { scene.freeze(); return; }
      if (avg > 1 / 42 && scene.scale > minScale) {
        scene.scale = Math.max(minScale, scene.scale * 0.8);
        scene.resize();
      }
    };
  }
  function freezer(scene, draw, before) {
    return function () {
      scene.frozen = true; scene.active = false;
      if (before) before();
      draw();
      stats.frozen = (stats.frozen || 0) + 1;
    };
  }

  /* ---------- GLSL partagé : bruit simplex (Ashima Arts / Stefan Gustavson, licence MIT) ---------- */
  var MOD289 =
    'vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}\n' +
    'vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}\n' +
    'vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}\n' +
    'vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}\n' +
    'vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}\n';

  var SNOISE3 = MOD289 +
    'float snoise(vec3 v){\n' +
    ' const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);\n' +
    ' vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);\n' +
    ' vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);\n' +
    ' vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;\n' +
    ' i=mod289(i);\n' +
    ' vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));\n' +
    ' float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;\n' +
    ' vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);\n' +
    ' vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);\n' +
    ' vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);\n' +
    ' vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));\n' +
    ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;\n' +
    ' vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);\n' +
    ' vec4 nr=1.79284291400159-.85373472095314*vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3));\n' +
    ' p0*=nr.x;p1*=nr.y;p2*=nr.z;p3*=nr.w;\n' +
    ' vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;\n' +
    ' return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));\n' +
    '}\n';

  var SNOISE2 = MOD289 +
    'float snoise2(vec2 v){\n' +
    ' const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);\n' +
    ' vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);\n' +
    ' vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);\n' +
    ' vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;\n' +
    ' i=mod289(i);\n' +
    ' vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));\n' +
    ' vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;\n' +
    ' vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;\n' +
    ' m*=1.79284291400159-.85373472095314*(a0*a0+h*h);\n' +
    ' vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;\n' +
    ' return 130.*dot(m,g);\n' +
    '}\n';

  // Trait anti-crénelé d'épaisseur constante à l'écran (en pixels du canvas).
  var CONTOUR =
    'float contour(float v,float px){float w=fwidth(v);float d=abs(v-floor(v+.5));\n' +
    ' return 1.-smoothstep(w*max(px*.5-.5,0.),w*(px*.5+.5),d);}\n';

  /* =========================================================
     1. HERO — lignes de niveau vivantes
     ========================================================= */
  var HERO_VS =
    'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}';

  var HERO_FS =
    '#extension GL_OES_standard_derivatives : enable\n' +
    'precision highp float;\n' +
    'uniform vec2 uRes;uniform float uScale;uniform float uTime;uniform float uScroll;uniform float uSpacing;uniform float uAlpha;\n' +
    'uniform vec3 uMouse;\n' +            // x, y (px CSS dans le hero), présence 0..1
    'uniform vec4 uRip[6];\n' +            // x, y, âge (s), amplitude
    'uniform vec4 uPins[4];\n' +           // x, y, signe du relief, rayon (px CSS)
    SNOISE3 + CONTOUR +
    'void main(){\n' +
    ' vec2 size=uRes/uScale;\n' +
    ' vec2 px=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uScale;\n' +
    // Parallaxe : le relief défile plus lentement que la page et suit un peu la souris.
    ' vec2 par=(uMouse.xy/size-.5)*uMouse.z*18.;\n' +
    ' vec2 q=(px-vec2(0.,uScroll*.32)+par)/uSpacing;\n' +
    ' float t=uTime*.035;\n' +
    ' q+=.16*vec2(snoise(vec3(q*.35,t+3.)),snoise(vec3(q*.35+9.,t)));\n' +
    ' float h=snoise(vec3(q,t))*.7+snoise(vec3(q*1.9+7.1,t*1.4))*.17+snoise(vec3(q*3.9-3.7,t*1.9))*.035;\n' +
    // Sommets sous les repères du tracé orange.
    ' for(int i=0;i<4;i++){vec2 d=(px-uPins[i].xy)/uPins[i].w;h+=uPins[i].z*.5*exp(-dot(d,d));}\n' +
    // Le relief se soulève sous le curseur.
    ' vec2 dm=(px-uMouse.xy)/190.;float m=exp(-dot(dm,dm))*uMouse.z;h+=.42*m;\n' +
    // Ondes qui partent du curseur.
    ' float rip=0.;\n' +
    ' for(int i=0;i<6;i++){float d=length(px-uRip[i].xy);float a=uRip[i].z;float f=a*230.;\n' +
    '  float e=exp(-pow((d-f)/85.,2.))*exp(-a*1.1)*uRip[i].w;h+=e*.04*sin((d-f)*.04);rip+=e;}\n' +
    ' float v=h*10.5;\n' +
    ' float idx=floor(v+.5);bool major=abs(mod(idx,5.))<.5;\n' +
    ' float line=contour(v,(major?1.45:1.)*uScale);\n' +
    ' float w=fwidth(v);\n' +
    ' float a=(major?.24:.095)*uAlpha*(1.-smoothstep(.4,.8,w));\n' +
    ' float glow=clamp(m*.95+rip*.6,0.,1.);\n' +
    ' a=mix(a,max(a,.5),glow);\n' +
    ' vec3 night=vec3(.051,.059,.071);vec3 accent=vec3(1.,.353,.122);\n' +
    ' vec3 lc=mix(vec3(.93,.94,.96),accent,glow);\n' +
    ' vec3 col=night+accent*.035*m;\n' +
    ' col=mix(col,lc,line*a);\n' +
    // Même voile que le CSS d'origine : transparent à 55 %, nuit à 90 % en bas.
    ' col=mix(col,night,.9*clamp((px.y/size.y-.55)/.45,0.,1.));\n' +
    ' gl_FragColor=vec4(col,1.);\n' +
    '}\n';

  function initHero() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'gl-canvas hero-gl';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = context(canvas, { alpha: false, antialias: false, depth: false, premultipliedAlpha: true });
    if (!gl) { stats.hero = 'fallback: no-webgl'; return; }
    var prog;
    try { prog = program(gl, HERO_VS, HERO_FS); } catch (e) { stats.hero = 'fallback: ' + e.message; return; }

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = prog.a('aPos');

    var scene = { active: false, scale: Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5) };
    var minScale = small ? 0.75 : 0.8;
    var W = 0, H = 0, time = reduced ? 18 : 6 + Math.random() * 20;
    var pins = new Float32Array(16), rips = new Float32Array(24), ripT = [0, 0, 0, 0, 0, 0], ripN = 0;
    var mouse = { x: -1e4, y: -1e4, sx: 0, sy: 0, inside: 0, amt: 0, cx: 0, cy: 0, has: false, lx: -1e4, ly: -1e4 };
    var spacing = 520;

    function measure() {
      var r = hero.getBoundingClientRect();
      W = r.width; H = r.height;
      spacing = Math.max(W < 600 ? 300 : 420, Math.min(760, W * 0.5));
      var dots = hero.querySelectorAll('.route .pin-dot');
      var signs = [1, -0.75, 1, 1];
      var route = hero.querySelector('.route');
      var rad = route ? route.getBoundingClientRect().height * 0.34 : 140;
      for (var i = 0; i < 4; i++) {
        var o = i * 4;
        if (dots[i]) {
          var d = dots[i].getBoundingClientRect();
          pins[o] = d.left + d.width / 2 - r.left; pins[o + 1] = d.top + d.height / 2 - r.top;
          pins[o + 2] = signs[i]; pins[o + 3] = Math.max(90, rad);
        } else { pins[o] = -1e4; pins[o + 1] = -1e4; pins[o + 2] = 0; pins[o + 3] = 1; }
      }
    }
    scene.resize = function () {
      measure();
      canvas.width = Math.max(1, Math.round(W * scene.scale));
      canvas.height = Math.max(1, Math.round(H * scene.scale));
      stats.heroScale = scene.scale;
      if (reduced || !scene.active) draw();
    };

    function draw() {
      if (gl.isContextLost()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      var u = prog.u;
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uScale, canvas.width / Math.max(1, W));
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uScroll, reduced ? 0 : Math.max(0, window.scrollY || 0));
      gl.uniform1f(u.uSpacing, spacing);
      gl.uniform1f(u.uAlpha, small ? 0.8 : 1);
      gl.uniform3f(u.uMouse, mouse.sx, mouse.sy, mouse.amt);
      gl.uniform4fv(u.uPins, pins);
      gl.uniform4fv(u.uRip, rips);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    var govern = governor(scene, minScale);
    scene.freeze = freezer(scene, draw, function () { mouse.amt = 0; rips.fill(0); });
    scene.frame = function (dt, raw) {
      time += dt;
      // Position du pointeur relative au hero (lue une fois par image).
      if (mouse.has) {
        var r = hero.getBoundingClientRect();
        mouse.x = mouse.cx - r.left; mouse.y = mouse.cy - r.top;
        mouse.inside = (mouse.x >= 0 && mouse.y >= 0 && mouse.x <= r.width && mouse.y <= r.height) ? 1 : 0;
        var dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly;
        if (mouse.inside && dx * dx + dy * dy > 120 * 120) { addRipple(mouse.x, mouse.y, 0.75); mouse.lx = mouse.x; mouse.ly = mouse.y; }
      }
      var k = 1 - Math.exp(-dt * 5);
      if (mouse.amt < 0.01 && mouse.inside) { mouse.sx = mouse.x; mouse.sy = mouse.y; }
      mouse.sx += (mouse.x - mouse.sx) * k; mouse.sy += (mouse.y - mouse.sy) * k;
      mouse.amt += (mouse.inside - mouse.amt) * (1 - Math.exp(-dt * 2.5));
      for (var i = 0; i < 6; i++) {
        var age = time - ripT[i];
        rips[i * 4 + 2] = age;
        if (age > 5) rips[i * 4 + 3] = 0;
      }
      draw();
      govern(raw);
    };

    function addRipple(x, y, amp) {
      var i = ripN++ % 6;
      ripT[i] = time;
      rips[i * 4] = x; rips[i * 4 + 1] = y; rips[i * 4 + 2] = 0; rips[i * 4 + 3] = amp;
    }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      scene.active = false; scene.frame = function () {};
      scenes.splice(scenes.indexOf(scene), 1);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      stats.hero = 'lost';
    });

    hero.insertBefore(canvas, hero.firstChild);
    scene.resize();
    draw();
    stats.hero = 'on';
    requestAnimationFrame(function () { canvas.classList.add('is-on'); });

    if (window.ResizeObserver) new ResizeObserver(function () { scene.resize(); }).observe(hero);
    else window.addEventListener('resize', scene.resize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); if (reduced) draw(); });

    if (reduced) return; // Une seule image, sans animation ni interaction.

    if (finePointer) {
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        mouse.cx = e.clientX; mouse.cy = e.clientY; mouse.has = true;
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', function () { mouse.has = false; mouse.inside = 0; });
    }
    hero.addEventListener('pointerdown', function (e) {
      var r = hero.getBoundingClientRect();
      addRipple(e.clientX - r.left, e.clientY - r.top, 1);
    }, { passive: true });

    scenes.push(scene);
    watch(hero, scene);
  }

  /* =========================================================
     2. CONTACT — terrain 3D, itinéraire orange posé sur le relief
     ========================================================= */
  var NR = 40; // points de l'itinéraire
  var TARGET = [0.2, -0.3];

  var HEIGHT = SNOISE2 +
    'float height(vec2 p){\n' +
    ' float h=snoise2(p*1.15+vec2(3.1,1.7))*.085+snoise2(p*2.4+11.)*.035+snoise2(p*4.8-5.)*.01;\n' +
    ' vec2 d=(p-vec2(' + TARGET[0].toFixed(2) + ',' + TARGET[1].toFixed(2) + '))/.38;h+=.3*exp(-dot(d,d));\n' +
    ' vec2 e=(p-vec2(-.5,.36))/.3;h+=.11*exp(-dot(e,e));\n' +
    ' return h;}\n';

  var TERRAIN_VS =
    'attribute vec2 aPos;uniform mat4 uMVP;varying vec3 vW;\n' + HEIGHT +
    'void main(){float h=height(aPos);vW=vec3(aPos.x,h,aPos.y);gl_Position=uMVP*vec4(vW,1.);}\n';

  var TERRAIN_FS =
    '#extension GL_OES_standard_derivatives : enable\n' +
    'precision highp float;\n' +
    '#define NR ' + NR + '\n' +
    'uniform vec2 uRoute[NR];uniform float uCum[NR];uniform float uLen;uniform float uDraw;\n' +
    'uniform float uTime;uniform float uScale;uniform vec2 uTarget;\n' +
    'varying vec3 vW;\n' + CONTOUR +
    'float wring(float d,float r,float w,float fw){float h=max(w*.5,fw*.6);return 1.-smoothstep(h-fw*.7,h+fw*.7,abs(d-r));}\n' +
    'void main(){\n' +
    ' vec2 p=vW.xz;float r=length(p);\n' +
    ' float fade=1.-smoothstep(.58,.97,r);\n' +
    ' if(fade<=0.)discard;\n' +
    ' vec3 night=vec3(.051,.059,.071);vec3 accent=vec3(1.,.353,.122);vec3 ink=vec3(.93,.94,.96);\n' +
    ' vec3 n=normalize(cross(dFdx(vW),dFdy(vW)));if(n.y<0.)n=-n;\n' +
    ' float diff=clamp(dot(n,normalize(vec3(-.55,.7,.45))),0.,1.);\n' +
    ' vec3 col=night*.8+vec3(.045,.05,.06)*diff;\n' +
    // Lignes de niveau (une sur cinq plus marquée) et grille fine.
    ' float v=vW.y*46.;float idx=floor(v+.5);bool major=abs(mod(idx,5.))<.5;\n' +
    ' float la=(major?.4:.15)*(1.-smoothstep(.35,.7,fwidth(v)));\n' +
    ' col=mix(col,ink,contour(v,(major?1.5:1.)*uScale)*la);\n' +
    ' vec2 g=p*8.;vec2 gw=fwidth(g);vec2 gd=abs(fract(g-.5)-.5)/gw;\n' +
    ' col=mix(col,ink,(1.-clamp(min(gd.x,gd.y),0.,1.))*.045);\n' +
    // Itinéraire : distance à la polyligne et abscisse curviligne.
    ' float best=1e5,s=0.;\n' +
    ' for(int i=0;i<NR-1;i++){vec2 a=uRoute[i];vec2 ba=uRoute[i+1]-a;vec2 pa=p-a;\n' +
    '  float t=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);float d=length(pa-ba*t);\n' +
    '  if(d<best){best=d;s=uCum[i]+t*length(ba);}}\n' +
    ' float head=uDraw*uLen;\n' +
    ' float P=.085;float u=mod((s-uTime*.03)/P*37.,37.);float du=max(fwidth(s)/P*37.,.001);\n' +
    ' float dash=smoothstep(0.,du,u)*(1.-smoothstep(16.-du,16.,u))+smoothstep(25.-du,25.,u)*(1.-smoothstep(28.-du,28.,u));\n' +
    ' float shown=1.-smoothstep(head-.01,head,s);\n' +
    ' float bd=best/max(fwidth(best),1e-6);\n' +
    ' col=mix(col,accent,(1.-smoothstep(1.35*uScale-.75,1.35*uScale+.75,bd))*dash*shown);\n' +
    // Cible au sommet : cercles pointillés et impulsion, posés sur le relief (les repères sont des sprites).
    ' float on=smoothstep(uLen-.03,uLen,head);\n' +
    ' vec2 tp=p-uTarget;float dt=length(tp);float ang=atan(tp.y,tp.x);\n' +
    ' float dots=step(.62,fract(ang*36./6.2832));\n' +
    ' float fw=max(fwidth(dt),1e-5);\n' +
    ' col=mix(col,accent,on*.55*dots*(wring(dt,.15,.0035,fw)+wring(dt,.095,.0035,fw)));\n' +
    ' float ph=fract(uTime/3.2);\n' +
    ' col=mix(col,accent,on*(1.-ph)*.8*wring(dt,mix(.03,.18,ph),.005,fw));\n' +
    ' gl_FragColor=vec4(col*fade,fade);\n' +
    '}\n';

  // Repères (sprites) : cercle orange à fond nuit et point central, taille constante à l'écran.
  var PIN_VS =
    'attribute vec4 aPin;uniform mat4 uMVP;uniform float uScale;uniform float uHead;varying float vOn;varying float vSize;varying float vKind;\n' + HEIGHT +
    'void main(){vec3 w=vec3(aPin.x,height(aPin.xy),aPin.y);gl_Position=uMVP*vec4(w,1.);gl_Position.z-=.004*gl_Position.w;\n' +
    ' vKind=aPin.w;vSize=(aPin.w>.5?32.:26.)*uScale;gl_PointSize=vSize;vOn=smoothstep(aPin.z-.02,aPin.z+.02,uHead);}\n';
  var PIN_FS =
    'precision highp float;varying float vOn;varying float vSize;varying float vKind;uniform float uScale;\n' +
    'void main(){float d=length(gl_PointCoord-.5)*vSize;float r=(vKind>.5?12.:9.)*uScale;float sw=(vKind>.5?2.4:2.2)*uScale;float dr=(vKind>.5?4.2:3.4)*uScale;\n' +
    ' float fill=1.-smoothstep(r+sw*.5-.75,r+sw*.5+.75,d);\n' +
    ' float ring=1.-smoothstep(sw*.5-.6,sw*.5+.6,abs(d-r));float cd=1.-smoothstep(dr-.75,dr+.75,d);\n' +
    ' vec3 col=mix(vec3(.051,.059,.071),vec3(1.,.353,.122),clamp(ring+cd,0.,1.));\n' +
    ' float a=fill*vOn;if(a<.003)discard;gl_FragColor=vec4(col*a,a);}\n';

  // Courbe de Catmull-Rom échantillonnée en NR points, avec longueurs cumulées.
  function buildRoute() {
    var c = [[-1.02, 0.74], [-0.66, 0.44], [-0.34, 0.6], [-0.06, 0.3], [0.38, 0.32], [0.5, -0.04], [TARGET[0], TARGET[1]]];
    var pinsAt = [1, 3, 5];
    var pts = [], cum = [], seg = c.length - 1, pinS = [];
    for (var k = 0; k < NR; k++) {
      var f = k / (NR - 1) * seg, i = Math.min(seg - 1, Math.floor(f)), t = f - i;
      var p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(seg, i + 2)];
      var t2 = t * t, t3 = t2 * t;
      for (var a = 0; a < 2; a++) {
        pts.push(0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3));
      }
    }
    var L = 0;
    for (var j = 0; j < NR; j++) {
      if (j) L += Math.hypot(pts[j * 2] - pts[j * 2 - 2], pts[j * 2 + 1] - pts[j * 2 - 1]);
      cum.push(L);
    }
    pinsAt.forEach(function (ci) {
      var j = Math.round(ci / seg * (NR - 1));
      pinS.push(pts[j * 2], pts[j * 2 + 1], cum[j], 0);
    });
    pinS.push(TARGET[0], TARGET[1], L - 0.025, 1);
    return { pts: new Float32Array(pts), cum: new Float32Array(cum), len: L, pins: new Float32Array(pinS) };
  }

  // Matrices 4×4 (ordre colonne, comme WebGL).
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(e, c, up) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz);
    zx /= l; zy /= l; zz /= l;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }

  function initTerrain(section, holder) {
    var canvas = document.createElement('canvas');
    canvas.className = 'gl-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = context(canvas, { alpha: true, antialias: true, depth: true, premultipliedAlpha: true });
    if (!gl) { stats.terrain = 'fallback: no-webgl'; return; }
    var prog;
    var pinProg;
    try { prog = program(gl, TERRAIN_VS, TERRAIN_FS); pinProg = program(gl, PIN_VS, PIN_FS); } catch (e) { stats.terrain = 'fallback: ' + e.message; return; }
    var pointMax = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1];

    // Maillage : grille carrée [-1, 1]², indices 16 bits.
    var N = small ? 100 : 150, verts = new Float32Array(N * N * 2), idx = new Uint16Array((N - 1) * (N - 1) * 6);
    for (var z = 0, k = 0; z < N; z++) for (var x = 0; x < N; x++) { verts[k++] = x / (N - 1) * 2 - 1; verts[k++] = z / (N - 1) * 2 - 1; }
    for (z = 0, k = 0; z < N - 1; z++) for (x = 0; x < N - 1; x++) {
      var i0 = z * N + x, i1 = i0 + 1, i2 = i0 + N, i3 = i2 + 1;
      idx[k++] = i0; idx[k++] = i2; idx[k++] = i1; idx[k++] = i1; idx[k++] = i2; idx[k++] = i3;
    }
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    var aPos = prog.a('aPos');
    var route = buildRoute();
    var pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, route.pins, gl.STATIC_DRAW);
    var aPin = pinProg.a('aPin');

    var scene = { active: false, scale: Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2, pointMax / 32) };
    var W = 1, H = 1, time = 0, drawStart = -1;
    var tilt = { x: 0, y: 0, sx: 0, sy: 0 };

    scene.resize = function () {
      var r = holder.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * scene.scale); canvas.height = Math.round(H * scene.scale);
      stats.terrainScale = scene.scale;
      if (reduced || !scene.active) draw();
    };

    function ease(t) { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function draw() {
      if (gl.isContextLost()) return;
      var aspect = W / H;
      var yaw = -0.62 + (reduced ? 0 : 0.5 * Math.sin(time * 0.09)) + tilt.sx * 0.35;
      var elev = 0.78 + tilt.sy * 0.08;
      var dist = small ? 2.8 : aspect < 1.1 ? 3.3 : 3.1;
      var eye = [Math.sin(yaw) * Math.cos(elev) * dist, Math.sin(elev) * dist + 0.1, Math.cos(yaw) * Math.cos(elev) * dist];
      var mvp = mul(perspective(0.52, aspect, 0.1, 20), lookAt(eye, [0, 0.06, 0], [0, 1, 0]));
      var drawP = reduced ? 1 : (drawStart < 0 ? 0 : ease((time - drawStart) / 2.8));

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      var u = prog.u;
      gl.uniformMatrix4fv(u.uMVP, false, mvp);
      gl.uniform2fv(u.uRoute, route.pts);
      gl.uniform1fv(u.uCum, route.cum);
      gl.uniform1f(u.uLen, route.len);
      gl.uniform1f(u.uDraw, drawP);
      gl.uniform1f(u.uTime, reduced ? 0.8 : time);
      gl.uniform1f(u.uScale, canvas.width / W);
      gl.uniform2f(u.uTarget, TARGET[0], TARGET[1]);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(aPos);
      // Repères par-dessus, encore masqués par le relief qui passe devant.
      gl.useProgram(pinProg.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, pb);
      gl.enableVertexAttribArray(aPin);
      gl.vertexAttribPointer(aPin, 4, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(pinProg.u.uMVP, false, mvp);
      gl.uniform1f(pinProg.u.uScale, canvas.width / W * (small ? 0.8 : 1));
      gl.uniform1f(pinProg.u.uHead, drawP * route.len);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, route.pins.length / 4);
      gl.depthMask(true);
      gl.disableVertexAttribArray(aPin);
    }

    var govern = governor(scene, small ? 1 : 1.1);
    scene.freeze = freezer(scene, draw, function () { drawStart = time - 10; });
    scene.frame = function (dt, raw) {
      time += dt;
      if (drawStart < 0) drawStart = time + 0.2;
      var k = 1 - Math.exp(-dt * 3);
      tilt.sx += (tilt.x - tilt.sx) * k; tilt.sy += (tilt.y - tilt.sy) * k;
      draw();
      govern(raw);
    };

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      scene.active = false; scene.frame = function () {};
      scenes.splice(scenes.indexOf(scene), 1);
      section.classList.remove('has-terrain');
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      stats.terrain = 'lost';
    });

    holder.appendChild(canvas);
    section.classList.add('has-terrain');
    scene.resize();
    draw();
    stats.terrain = 'on';
    requestAnimationFrame(function () { canvas.classList.add('is-on'); });
    if (window.ResizeObserver) new ResizeObserver(function () { scene.resize(); }).observe(holder);
    else window.addEventListener('resize', scene.resize);

    if (reduced) return;
    if (finePointer) {
      section.addEventListener('pointermove', function (e) {
        tilt.x = e.clientX / window.innerWidth * 2 - 1;
        tilt.y = e.clientY / window.innerHeight * 2 - 1;
      }, { passive: true });
      section.addEventListener('pointerleave', function () { tilt.x = 0; tilt.y = 0; });
    }
    scenes.push(scene);
    watch(holder, scene);
  }

  /* ---------- Démarrage : hero après le premier rendu, terrain à l'approche ---------- */
  function start() {
    try { initHero(); } catch (e) { stats.hero = 'error'; }

    var section = document.querySelector('.contact');
    var holder = section && section.querySelector('.terrain');
    if (!holder) return;
    var go = function () { try { initTerrain(section, holder); } catch (e) { stats.terrain = 'error'; } };
    if (!('IntersectionObserver' in window)) { go(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[entries.length - 1].isIntersecting) return;
      io.disconnect();
      go();
    }, { rootMargin: '600px 0px' });
    io.observe(section);
  }

  requestAnimationFrame(function () { setTimeout(start, 0); });
})();
