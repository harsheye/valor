import React, { useRef, useEffect, useCallback } from 'react';

export type SpinnerPreset = 'fire-circle' | 'fire-ring' | 'flame-burst';

export const SPINNER_PRESETS: { id: SpinnerPreset; name: string; emoji: string }[] = [
  { id: 'fire-circle', name: 'Fire Circle', emoji: '🔥' },
  { id: 'fire-ring', name: 'Flame Ring', emoji: '🌀' },
  { id: 'flame-burst', name: 'Flame Burst', emoji: '💥' },
];

interface LoadingSpinnerProps {
  customLoaderUrl?: string;
  customLoaderType?: 'default' | 'image' | 'video' | 'gif';
  preset?: SpinnerPreset;
}

/* ═══════════════════════════════════════════════════════════════════
   1. FIRE CIRCLE — Dense particle ring with heat glow
   ═══════════════════════════════════════════════════════════════════ */
const FireCircle: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;
    const S = 180;
    canvas.width = S; canvas.height = S;
    const cx = S / 2, cy = S / 2, R = 48;

    interface P {
      a: number; r: number; s: number; l: number; ml: number;
      va: number; vr: number; h: number; bright: number;
    }

    const ps: P[] = [];
    let rot = 0;

    const draw = () => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.clearRect(0, 0, S, S);

      rot += 0.028;

      // Spawn dense ring particles
      for (let i = 0; i < 12; i++) {
        const a = rot + Math.random() * Math.PI * 2;
        ps.push({
          a,
          r: R + (Math.random() - 0.5) * 14,
          s: 1.5 + Math.random() * 6,
          l: 0,
          ml: 12 + Math.random() * 25,
          va: (Math.random() - 0.5) * 0.015,
          vr: (Math.random() - 0.5) * 1.5 + (Math.random() > 0.5 ? -0.3 : 0.3),
          h: Math.random(),
          bright: 0.4 + Math.random() * 0.6,
        });
      }

      // Background glow
      const bg = ctx.createRadialGradient(cx, cy, R - 18, cx, cy, R + 28);
      bg.addColorStop(0, 'rgba(255,50,0,0)');
      bg.addColorStop(0.4, 'rgba(255,60,0,0.06)');
      bg.addColorStop(0.7, 'rgba(255,30,0,0.03)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S, S);

      // Subtle ring track
      ctx.strokeStyle = 'rgba(255,60,0,0.08)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';

      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.l++;
        p.a += p.va;
        p.r += p.vr * 0.3;
        p.s *= 0.985;
        p.vr *= 0.96;

        if (p.l > p.ml || p.s < 0.2) { ps.splice(i, 1); continue; }

        const t = p.l / p.ml;
        const fade = t < 0.1 ? t * 10 : Math.pow(1 - t, 1.2);
        const alpha = fade * p.bright;
        const px = cx + Math.cos(p.a) * p.r;
        const py = cy + Math.sin(p.a) * p.r;

        const g = ctx.createRadialGradient(px, py, 0, px, py, p.s);
        if (p.h > 0.6) {
          g.addColorStop(0, `rgba(255,255,180,${alpha})`);
          g.addColorStop(0.25, `rgba(255,200,50,${alpha * 0.85})`);
          g.addColorStop(0.6, `rgba(255,100,0,${alpha * 0.5})`);
          g.addColorStop(1, 'rgba(255,30,0,0)');
        } else if (p.h > 0.3) {
          g.addColorStop(0, `rgba(255,160,20,${alpha * 0.95})`);
          g.addColorStop(0.3, `rgba(255,80,0,${alpha * 0.7})`);
          g.addColorStop(0.7, `rgba(200,20,0,${alpha * 0.3})`);
          g.addColorStop(1, 'rgba(120,0,0,0)');
        } else {
          g.addColorStop(0, `rgba(255,80,0,${alpha * 0.8})`);
          g.addColorStop(0.4, `rgba(180,20,0,${alpha * 0.5})`);
          g.addColorStop(1, 'rgba(80,0,0,0)');
        }

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, p.s, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      if (ps.length > 500) ps.splice(0, ps.length - 400);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return <canvas ref={canvasRef} style={{ width: 140, height: 140 }} />;
};

/* ═══════════════════════════════════════════════════════════════════
   2. FIRE RING — Thick flame arc with head-to-tail gradient,
      purple core, flying embers, organic turbulence
   ═══════════════════════════════════════════════════════════════════ */
const FireRing: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;
    const S = 200;
    canvas.width = S; canvas.height = S;
    const cx = S / 2, cy = S / 2, R = 60;
    const ARC_LEN = Math.PI * 1.3; // ~235° of arc

    interface P {
      a: number; rOff: number; s: number; l: number; ml: number;
      vr: number; va: number; type: 'body' | 'core' | 'purple' | 'ember' | 'tip';
    }

    const ps: P[] = [];
    let head = 0;

    // Simple noise-like function
    const noise = (x: number) => Math.sin(x * 1.7) * 0.5 + Math.sin(x * 3.1) * 0.3 + Math.sin(x * 7.3) * 0.2;

    const draw = () => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, S, S);
      head += 0.038;

      // Spawn particles along the arc
      for (let i = 0; i < 18; i++) {
        const pos = Math.random(); // 0 = head, 1 = tail
        const a = head - pos * ARC_LEN;
        const turb = noise(a * 5 + head * 3);
        const widthAtPos = (1 - pos * 0.6) * 22; // wider at head, narrower at tail

        // Main body particle
        ps.push({
          a: a + turb * 0.08,
          rOff: (Math.random() - 0.5) * widthAtPos + turb * 3,
          s: 2 + Math.random() * 7 * (1 - pos * 0.4),
          l: 0,
          ml: 6 + Math.random() * 14,
          vr: (Math.random() - 0.5) * 1.8 + turb * 0.5,
          va: (Math.random() - 0.5) * 0.006,
          type: 'body',
        });

        // Bright core (denser near head)
        if (pos < 0.4 && Math.random() < 0.5) {
          ps.push({
            a: a + turb * 0.04,
            rOff: (Math.random() - 0.5) * 6,
            s: 1.5 + Math.random() * 4,
            l: 0,
            ml: 5 + Math.random() * 8,
            vr: (Math.random() - 0.5) * 0.6,
            va: (Math.random() - 0.5) * 0.003,
            type: 'core',
          });
        }

        // Purple inner (sparse, center line)
        if (Math.random() < 0.15) {
          ps.push({
            a: a + turb * 0.03,
            rOff: (Math.random() - 0.5) * 8,
            s: 1.5 + Math.random() * 3.5,
            l: 0,
            ml: 5 + Math.random() * 10,
            vr: (Math.random() - 0.5) * 0.4,
            va: (Math.random() - 0.5) * 0.002,
            type: 'purple',
          });
        }
      }

      // Ember spawning
      if (Math.random() < 0.6) {
        const ePos = Math.random() * 1.4; // can extend past tail
        const ea = head - ePos * ARC_LEN;
        const dir = Math.random() > 0.5 ? 1 : -1;
        ps.push({
          a: ea,
          rOff: dir * (18 + Math.random() * 22),
          s: 1 + Math.random() * 3,
          l: 0,
          ml: 15 + Math.random() * 25,
          vr: dir * (1 + Math.random() * 2.5),
          va: (Math.random() - 0.5) * 0.02,
          type: 'ember',
        });
      }

      // Flame tip particles at the leading edge
      for (let i = 0; i < 3; i++) {
        const ta = head + (Math.random() - 0.3) * 0.3;
        ps.push({
          a: ta,
          rOff: (Math.random() - 0.5) * 12,
          s: 1.5 + Math.random() * 3.5,
          l: 0,
          ml: 4 + Math.random() * 8,
          vr: (Math.random() - 0.5) * 2,
          va: 0.01 + Math.random() * 0.015,
          type: 'tip',
        });
      }

      // Ambient glow
      const bg = ctx.createRadialGradient(cx, cy, R - 25, cx, cy, R + 40);
      bg.addColorStop(0, 'rgba(255,50,0,0)');
      bg.addColorStop(0.4, 'rgba(255,40,0,0.04)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S, S);

      ctx.globalCompositeOperation = 'lighter';

      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.l++;
        p.rOff += p.vr * 0.4;
        p.a += p.va;
        p.vr *= 0.97;

        if (p.l > p.ml) { ps.splice(i, 1); continue; }

        const t = p.l / p.ml;
        const fade = t < 0.08 ? t * 12.5 : Math.pow(1 - t, 0.8);
        const px = cx + Math.cos(p.a) * (R + p.rOff);
        const py = cy + Math.sin(p.a) * (R + p.rOff);
        const sz = p.s * (1 - t * 0.3);

        // Determine color based on position along arc
        const headDist = ((head - p.a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const arcPos = Math.min(headDist / ARC_LEN, 1.2); // 0=head, 1=tail

        const g = ctx.createRadialGradient(px, py, 0, px, py, sz);

        if (p.type === 'core') {
          g.addColorStop(0, `rgba(255,255,230,${fade * 0.95})`);
          g.addColorStop(0.2, `rgba(255,240,120,${fade * 0.85})`);
          g.addColorStop(0.5, `rgba(255,180,30,${fade * 0.6})`);
          g.addColorStop(1, 'rgba(255,80,0,0)');
        } else if (p.type === 'purple') {
          g.addColorStop(0, `rgba(180,100,255,${fade * 0.85})`);
          g.addColorStop(0.4, `rgba(130,50,230,${fade * 0.55})`);
          g.addColorStop(1, 'rgba(80,0,180,0)');
        } else if (p.type === 'ember') {
          g.addColorStop(0, `rgba(255,180,50,${fade * 0.9})`);
          g.addColorStop(0.4, `rgba(255,80,0,${fade * 0.5})`);
          g.addColorStop(1, 'rgba(180,0,0,0)');
        } else if (p.type === 'tip') {
          g.addColorStop(0, `rgba(255,230,100,${fade * 0.9})`);
          g.addColorStop(0.3, `rgba(255,160,0,${fade * 0.65})`);
          g.addColorStop(1, 'rgba(255,60,0,0)');
        } else {
          // Body — color depends on arc position
          if (arcPos < 0.25) {
            g.addColorStop(0, `rgba(255,220,60,${fade * 0.9})`);
            g.addColorStop(0.3, `rgba(255,140,0,${fade * 0.7})`);
            g.addColorStop(0.7, `rgba(255,60,0,${fade * 0.35})`);
            g.addColorStop(1, 'rgba(200,20,0,0)');
          } else if (arcPos < 0.55) {
            g.addColorStop(0, `rgba(255,100,0,${fade * 0.85})`);
            g.addColorStop(0.35, `rgba(230,40,0,${fade * 0.6})`);
            g.addColorStop(0.7, `rgba(180,10,0,${fade * 0.3})`);
            g.addColorStop(1, 'rgba(120,0,0,0)');
          } else if (arcPos < 0.8) {
            g.addColorStop(0, `rgba(200,30,0,${fade * 0.7})`);
            g.addColorStop(0.4, `rgba(150,0,30,${fade * 0.4})`);
            g.addColorStop(1, 'rgba(80,0,60,0)');
          } else {
            g.addColorStop(0, `rgba(140,10,40,${fade * 0.5})`);
            g.addColorStop(0.5, `rgba(90,0,80,${fade * 0.25})`);
            g.addColorStop(1, 'rgba(40,0,40,0)');
          }
        }

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      if (ps.length > 800) ps.splice(0, ps.length - 600);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return <canvas ref={canvasRef} style={{ width: 160, height: 160 }} />;
};


/* ═══════════════════════════════════════════════════════════════════
   3. FLAME BURST — Full-screen edge flames. Proper flame-shaped
      bezier particles that flicker, rise, and vanish like real fire.
      Includes entrance build-up and exit fade-down transitions.
   ═══════════════════════════════════════════════════════════════════ */
const FlameBurst: React.FC<{ fullscreen?: boolean }> = ({ fullscreen = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const sizeRef = useRef({ w: 180, h: 180 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent && fullscreen) {
        const rect = parent.getBoundingClientRect();
        sizeRef.current = { w: Math.round(rect.width), h: Math.round(rect.height) };
      } else {
        sizeRef.current = { w: 180, h: 180 };
      }
      canvas.width = sizeRef.current.w;
      canvas.height = sizeRef.current.h;
    };
    resize();

    let resizeObserver: ResizeObserver | null = null;
    if (fullscreen && canvas.parentElement) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas.parentElement);
    }

    interface Flame {
      x: number; y: number; size: number; angle: number;
      life: number; maxLife: number; vx: number; vy: number;
      flicker: number; flickerSpeed: number; hue: number; isEmber: boolean;
    }

    const flames: Flame[] = [];
    const startTime = Date.now();
    let frameTime = 0;

    /* Draw a single flame shape using bezier curves */
    const drawFlame = (f: Flame, time: number, intensity: number) => {
      const t = f.life / f.maxLife;
      const fadeIn = Math.min(t * 8, 1);
      const fadeOut = Math.pow(1 - t, 0.6);
      const alpha = fadeIn * fadeOut * intensity;
      if (alpha < 0.01) return;

      const flk = Math.sin(time * f.flickerSpeed + f.flicker);
      const flk2 = Math.sin(time * f.flickerSpeed * 1.7 + f.flicker * 2.3);
      const sz = f.size * (0.7 + flk * 0.15 + flk2 * 0.15) * (1 - t * 0.3);

      if (f.isEmber) {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, sz);
        g.addColorStop(0, `rgba(255,200,50,${alpha})`);
        g.addColorStop(0.4, `rgba(255,100,0,${alpha * 0.6})`);
        g.addColorStop(1, 'rgba(255,30,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(f.x, f.y, sz, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);

      const h = sz * 2.5;
      const w = sz;
      const wobX = flk * w * 0.18;
      const wobX2 = flk2 * w * 0.12;

      // Outer flame body (red/orange)
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.bezierCurveTo(w * 0.3 + wobX, -h * 0.7, w * 0.8 + wobX2, -h * 0.3, w * 0.5, h * 0.1);
      ctx.bezierCurveTo(w * 0.4, h * 0.35, w * 0.15, h * 0.45, 0, h * 0.4);
      ctx.bezierCurveTo(-w * 0.15, h * 0.45, -w * 0.4, h * 0.35, -w * 0.5, h * 0.1);
      ctx.bezierCurveTo(-w * 0.8 - wobX2, -h * 0.3, -w * 0.3 - wobX, -h * 0.7, 0, -h);
      ctx.closePath();

      const og = ctx.createLinearGradient(0, -h, 0, h * 0.4);
      og.addColorStop(0, `rgba(200,20,0,${alpha * 0.35})`);
      og.addColorStop(0.25, `rgba(255,80,0,${alpha * 0.75})`);
      og.addColorStop(0.6, `rgba(255,120,0,${alpha * 0.9})`);
      og.addColorStop(1, `rgba(255,60,0,${alpha * 0.5})`);
      ctx.fillStyle = og;
      ctx.fill();

      // Inner core (yellow)
      const iw = w * 0.5, ih = h * 0.65;
      ctx.beginPath();
      ctx.moveTo(0, -ih);
      ctx.bezierCurveTo(iw * 0.25 + wobX * 0.5, -ih * 0.65, iw * 0.7 + wobX2 * 0.3, -ih * 0.2, iw * 0.35, ih * 0.15);
      ctx.bezierCurveTo(iw * 0.2, ih * 0.3, -iw * 0.2, ih * 0.3, -iw * 0.35, ih * 0.15);
      ctx.bezierCurveTo(-iw * 0.7 - wobX2 * 0.3, -ih * 0.2, -iw * 0.25 - wobX * 0.5, -ih * 0.65, 0, -ih);
      ctx.closePath();

      const ig = ctx.createLinearGradient(0, -ih, 0, ih * 0.3);
      ig.addColorStop(0, `rgba(255,180,30,${alpha * 0.4})`);
      ig.addColorStop(0.4, `rgba(255,230,80,${alpha * 0.9})`);
      ig.addColorStop(1, `rgba(255,200,40,${alpha * 0.65})`);
      ctx.fillStyle = ig;
      ctx.fill();

      ctx.restore();
    };

    const spawnFlame = (edge: number) => {
      const { w, h } = sizeRef.current;
      let x = 0, y = 0, vx = 0, vy = 0, angle = 0;
      const speed = fullscreen ? (0.3 + Math.random() * 1.5) : (0.2 + Math.random() * 1.0);
      const sz = fullscreen ? (5 + Math.random() * 18) : (3 + Math.random() * 10);
      const edgeD = fullscreen ? 15 : 8;
      const isEmber = Math.random() < 0.3;
      const emberSz = fullscreen ? (1.5 + Math.random() * 4) : (1 + Math.random() * 3);

      switch (edge) {
        case 0: // top — flames point down
          x = Math.random() * w; y = Math.random() * edgeD;
          vx = (Math.random() - 0.5) * speed * 0.3; vy = speed;
          angle = Math.PI + (Math.random() - 0.5) * 0.5;
          break;
        case 1: // right — flames point left
          x = w - Math.random() * edgeD; y = Math.random() * h;
          vx = -speed; vy = (Math.random() - 0.5) * speed * 0.3;
          angle = Math.PI * 0.5 + (Math.random() - 0.5) * 0.5;
          break;
        case 2: // bottom — flames point up
          x = Math.random() * w; y = h - Math.random() * edgeD;
          vx = (Math.random() - 0.5) * speed * 0.3; vy = -speed;
          angle = (Math.random() - 0.5) * 0.5;
          break;
        case 3: // left — flames point right
          x = Math.random() * edgeD; y = Math.random() * h;
          vx = speed; vy = (Math.random() - 0.5) * speed * 0.3;
          angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 0.5;
          break;
      }

      flames.push({
        x, y, size: isEmber ? emberSz : sz, angle,
        life: 0, maxLife: isEmber ? (8 + Math.random() * 15) : (15 + Math.random() * 35),
        vx, vy, flicker: Math.random() * Math.PI * 2,
        flickerSpeed: 5 + Math.random() * 10, hue: Math.random(), isEmber,
      });
    };

    const draw = () => {
      const { w, h } = sizeRef.current;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);

      frameTime = (Date.now() - startTime) / 1000;
      // Entrance: 0→1 over 800ms with ease-in
      const intensity = Math.min(1, Math.pow(Math.min(frameTime / 0.8, 1), 2));

      const perimFactor = fullscreen ? Math.max(1, (w + h) / 250) : 1;
      const spawnsPerEdge = Math.round(4 * perimFactor * intensity);
      for (let e = 0; e < 4; e++) {
        for (let i = 0; i < spawnsPerEdge; i++) spawnFlame(e);
      }

      ctx.globalCompositeOperation = 'lighter';

      // Edge glow strips
      const glowD = fullscreen ? Math.min(100, Math.max(w, h) * 0.07) : 35;
      const ga = 0.12 * intensity;
      const gt = ctx.createLinearGradient(0, 0, 0, glowD);
      gt.addColorStop(0, `rgba(255,60,0,${ga})`); gt.addColorStop(1, 'rgba(255,30,0,0)');
      ctx.fillStyle = gt; ctx.fillRect(0, 0, w, glowD);
      const gb = ctx.createLinearGradient(0, h, 0, h - glowD);
      gb.addColorStop(0, `rgba(255,60,0,${ga})`); gb.addColorStop(1, 'rgba(255,30,0,0)');
      ctx.fillStyle = gb; ctx.fillRect(0, h - glowD, w, glowD);
      const gl2 = ctx.createLinearGradient(0, 0, glowD, 0);
      gl2.addColorStop(0, `rgba(255,60,0,${ga})`); gl2.addColorStop(1, 'rgba(255,30,0,0)');
      ctx.fillStyle = gl2; ctx.fillRect(0, 0, glowD, h);
      const gr2 = ctx.createLinearGradient(w, 0, w - glowD, 0);
      gr2.addColorStop(0, `rgba(255,60,0,${ga})`); gr2.addColorStop(1, 'rgba(255,30,0,0)');
      ctx.fillStyle = gr2; ctx.fillRect(w - glowD, 0, glowD, h);

      // Corner glow
      for (const [cx2, cy2] of [[0,0],[w,0],[w,h],[0,h]]) {
        const cg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, glowD * 1.8);
        cg.addColorStop(0, `rgba(255,80,0,${ga * 0.8})`);
        cg.addColorStop(1, 'rgba(255,30,0,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(cx2, cy2, glowD * 1.8, 0, Math.PI * 2); ctx.fill();
      }

      // Update & draw flames
      for (let i = flames.length - 1; i >= 0; i--) {
        const f = flames[i];
        f.life++;
        f.x += f.vx; f.y += f.vy;
        f.vx *= 0.97; f.vy *= 0.97;
        if (f.life > f.maxLife) { flames.splice(i, 1); continue; }
        drawFlame(f, frameTime, intensity);
      }

      ctx.globalCompositeOperation = 'source-over';
      const maxP = fullscreen ? 2000 : 600;
      if (flames.length > maxP) flames.splice(0, flames.length - Math.round(maxP * 0.75));

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animRef.current); resizeObserver?.disconnect(); };
  }, [fullscreen]);

  if (fullscreen) {
    return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
  }
  return <canvas ref={canvasRef} style={{ width: 150, height: 150 }} />;
};


/* ─── Preset Router ─── */
const PresetSpinner: React.FC<{ preset: SpinnerPreset; fullscreen?: boolean }> = ({ preset, fullscreen }) => {
  switch (preset) {
    case 'fire-ring': return <FireRing />;
    case 'flame-burst': return <FlameBurst fullscreen={fullscreen} />;
    case 'fire-circle':
    default: return <FireCircle />;
  }
};

/* ─── Main Export ─── */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  customLoaderUrl, customLoaderType = 'default', preset = 'fire-circle'
}) => {
  const isCustomActive = customLoaderType !== 'default' && customLoaderUrl;
  if (isCustomActive) {
    if (customLoaderType === 'video') {
      return (
        <div className="custom-loader-wrapper">
          <video src={customLoaderUrl} autoPlay loop muted playsInline
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      );
    }
    return (
      <div className="custom-loader-wrapper">
        <img src={customLoaderUrl} alt="Loading..."
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    );
  }
  if (preset === 'flame-burst') return <PresetSpinner preset={preset} fullscreen={true} />;
  return <PresetSpinner preset={preset} />;
};

/* ─── Gallery Thumbnail ─── */
export const SpinnerThumbnail: React.FC<{ preset: SpinnerPreset; size?: number }> = ({ preset, size = 64 }) => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
    <div style={{ transform: `scale(${(size * 1.45) / 150})`, transformOrigin: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <PresetSpinner preset={preset} fullscreen={false} />
    </div>
  </div>
);

/* ─── Buffering Overlay Wrapper ─── */
export const BufferingOverlay: React.FC<{ isBuffering: boolean; customLoaderUrl?: string; customLoaderType?: any; preset?: any }> = ({ isBuffering, customLoaderUrl, customLoaderType, preset }) => {
  const [shouldRender, setShouldRender] = React.useState(isBuffering);
  const [visible, setVisible] = React.useState(isBuffering);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (isBuffering) {
      setShouldRender(true);
      // Small delay to allow DOM to mount before triggering CSS transition
      timeoutId = setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
      // Wait for fade out animation (800ms) before unmounting to free up CPU
      timeoutId = setTimeout(() => setShouldRender(false), 800);
    }
    return () => clearTimeout(timeoutId);
  }, [isBuffering]);

  if (!shouldRender) return null;

  return (
    <div 
      className="buffering-spinner-overlay" 
      onClick={(e) => e.stopPropagation()}
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.8s ease-in-out',
        pointerEvents: visible ? 'auto' : 'none'
      }}
    >
      <LoadingSpinner customLoaderUrl={customLoaderUrl} customLoaderType={customLoaderType} preset={preset} />
    </div>
  );
};

