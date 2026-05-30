"use client";
import { useEffect, useRef } from "react";

interface WaveformCanvasProps {
  analyserNode: AnalyserNode | null;
  isActive: boolean;
}

export function WaveformCanvas({ analyserNode, isActive }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!isActive || !analyserNode) return;

    dataArrayRef.current = new Uint8Array(analyserNode.frequencyBinCount);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let lastTime = performance.now();

    const draw = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;

      if (!analyserNode || !dataArrayRef.current) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      analyserNode.getByteTimeDomainData(dataArrayRef.current);
      const data = dataArrayRef.current;

      // Background
      ctx.fillStyle = "rgba(10, 11, 13, 0.3)";
      ctx.fillRect(0, 0, w, h);

      // Glow
      const gradient = ctx.createLinearGradient(w / 2, 0, w / 2, h);
      gradient.addColorStop(0, "rgba(122, 90, 248, 0.08)");
      gradient.addColorStop(0.5, "rgba(122, 90, 248, 0.15)");
      gradient.addColorStop(1, "rgba(59, 130, 246, 0.08)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Waveform line
      ctx.beginPath();
      ctx.strokeStyle = "rgba(122, 90, 248, 0.8)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(122, 90, 248, 0.4)";
      ctx.shadowBlur = 8;

      const sliceWidth = w / data.length;
      let x = 0;

      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0;
        const y = (v * h) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyserNode, isActive]);

  return (
    <div className="relative h-24 w-full rounded-xl overflow-hidden border border-[color:var(--line)] bg-[color:var(--bg)]/50">
      <canvas ref={canvasRef} className="w-full h-full" />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--fg-3)]">
            Mic inactive
          </span>
        </div>
      )}
    </div>
  );
}