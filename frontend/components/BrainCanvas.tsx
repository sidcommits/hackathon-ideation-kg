'use client';

import { useEffect, useRef } from 'react';

type Phase = 'idle' | 'thinking' | 'graph';

export default function BrainCanvas({ phase }: { phase: Phase }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      return { w: rect.width, h: rect.height, ctx };
    };

    let { w, h, ctx } = setup();

    const LABELS = ['arxiv','Nature','IBM','Google','MIT','Stanford','DeepMind','Microsoft','CERN','Harvard','Oxford','ETH'];
    const N = 12;
    const nodes = Array.from({ length: N }, (_, i) => ({
      x: 24 + Math.random() * (w - 48),
      y: 24 + Math.random() * (h - 48),
      vx: (Math.random() - .5) * .26,
      vy: (Math.random() - .5) * .26,
      r: 2.8 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      label: LABELS[i],
      gx: w/2 + Math.cos((i / N) * Math.PI * 2) * (Math.min(w,h) * .33),
      gy: h/2 + Math.sin((i / N) * Math.PI * 2) * (Math.min(w,h) * .33),
      _rx: 0, _ry: 0,
    }));

    const edges: { a: number; b: number; signals: { p: number }[] }[] = [];
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        if (Math.sqrt(dx*dx+dy*dy) < w*.55 && Math.random() < .38)
          edges.push({ a: i, b: j, signals: [] });
      }

    const rndRect = (c: CanvasRenderingContext2D, x: number, y: number, w2: number, h2: number, r: number) => {
      c.beginPath();
      c.moveTo(x+r,y); c.lineTo(x+w2-r,y);
      c.quadraticCurveTo(x+w2,y,x+w2,y+r); c.lineTo(x+w2,y+h2-r);
      c.quadraticCurveTo(x+w2,y+h2,x+w2-r,y+h2); c.lineTo(x+r,y+h2);
      c.quadraticCurveTo(x,y+h2,x,y+h2-r); c.lineTo(x,y+r);
      c.quadraticCurveTo(x,y,x+r,y); c.closePath();
    };

    let gl = 0, t = 0;

    const draw = () => {
      const ph = phaseRef.current;
      ctx.clearRect(0, 0, w, h);
      gl += ph === 'graph' ? .025 : -.02;
      gl = Math.max(0, Math.min(1, gl));

      nodes.forEach(node => {
        if (gl < 1) { node.x += node.vx; node.y += node.vy; }
        if (node.x < 18 || node.x > w-18) node.vx *= -1;
        if (node.y < 18 || node.y > h-18) node.vy *= -1;
        node._rx = node.x + (node.gx - node.x) * gl;
        node._ry = node.y + (node.gy - node.y) * gl;
        node.phase += .038;
      });

      edges.forEach(e => {
        const a = nodes[e.a], b = nodes[e.b];
        const alpha = gl > .5 ? .16 : .06 + .055*Math.sin(t*1.8+e.a);
        ctx.beginPath(); ctx.moveTo(a._rx,a._ry); ctx.lineTo(b._rx,b._ry);
        ctx.strokeStyle = `rgba(37,99,235,${alpha})`;
        ctx.lineWidth = gl > .5 ? 1.4 : .9;
        ctx.stroke();

        if (gl < .75) {
          if (Math.random() < .006) e.signals.push({ p: 0 });
          e.signals = e.signals.filter(s => s.p < 1);
          e.signals.forEach(s => {
            s.p += .014 + Math.random()*.009;
            const sx = a._rx + (b._rx-a._rx)*s.p, sy = a._ry + (b._ry-a._ry)*s.p;
            ctx.beginPath(); ctx.arc(sx,sy,1.8,0,Math.PI*2);
            ctx.fillStyle = `rgba(59,130,246,${Math.sin(s.p*Math.PI)*.85})`; ctx.fill();
          });
        }
      });

      nodes.forEach(node => {
        const pulse = 1 + .28*Math.sin(node.phase)*(1-gl);
        const r = node.r * pulse;

        if (gl < .5) {
          const g = ctx.createRadialGradient(node._rx,node._ry,0,node._rx,node._ry,r*3.8);
          g.addColorStop(0, `rgba(37,99,235,${.09+.06*Math.sin(node.phase)})`);
          g.addColorStop(1, 'rgba(37,99,235,0)');
          ctx.beginPath(); ctx.arc(node._rx,node._ry,r*3.8,0,Math.PI*2);
          ctx.fillStyle = g; ctx.fill();
        }

        if (gl > .45) {
          ctx.save(); ctx.globalAlpha = Math.min(1,(gl-.45)*1.8);
          ctx.font = '9.5px DM Sans, sans-serif';
          const tw = ctx.measureText(node.label).width;
          ctx.fillStyle = 'rgba(219,234,254,0.94)';
          rndRect(ctx, node._rx-tw/2-5, node._ry+r+3, tw+10, 16, 3.5);
          ctx.fill();
          ctx.fillStyle = '#1d4ed8';
          ctx.fillText(node.label, node._rx-tw/2, node._ry+r+14.5);
          ctx.restore();
        }

        ctx.beginPath(); ctx.arc(node._rx,node._ry,r,0,Math.PI*2);
        ctx.fillStyle = gl > .5 ? '#2563eb' : `rgba(37,99,235,${.45+.44*Math.sin(node.phase)})`;
        ctx.fill();
      });

      t += .016;
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}
