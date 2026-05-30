"use client";
import { useEffect, useRef, useState } from "react";

interface TreeNode {
  id: string;
  label: string;
  eliminated?: boolean;
  children?: TreeNode[];
}

const DEMO_TREE: TreeNode = {
  id: "root",
  label: "Is this instrument covered?",
  children: [
    {
      id: "mifid",
      label: "MiFID II Scope Check",
      children: [
        {
          id: "complex",
          label: "Is it a complex instrument?\n✓ Structured note → YES",
        },
        {
          id: "esg",
          label: "ESG-linked?\n✓ Taxonomy-aligned → In scope",
        },
        {
          id: "exempted",
          label: "Prof. client exemption?\n✗ No evidence → Ruled out",
          eliminated: true,
        },
      ],
    },
    {
      id: "sfdr",
      label: "SFDR Applicability",
      children: [
        {
          id: "sfdr_article8",
          label: "Article 8 (light green)\n✓ ESG integration → Applies",
        },
        {
          id: "sfdr_article9",
          label: "Article 9 (dark green)\n✗ Not impact-focused → Ruled out",
          eliminated: true,
        },
      ],
    },
    {
      id: "fatca",
      label: "FATCA Reporting?\n✗ Non-US issuer → Ruled out",
      eliminated: true,
    },
  ],
};

const NODE_W = 220;
const NODE_H = 60;
const H_GAP = 80;
const V_GAP = 100;
const PAD = 60;

function getTreeWidth(node: TreeNode): number {
  if (!node.children || node.children.length === 0) return NODE_W;
  return node.children.reduce((sum, c) => sum + getTreeWidth(c) + H_GAP, -H_GAP);
}

export function CausalTree() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let raf: number;
    const startTime = performance.now();
    const animate = (t: number) => {
      setFrame(Math.floor((t - startTime) / 16));
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    function drawNodeCard(
      node: TreeNode,
      x: number,
      y: number,
      depth: number,
      fadeIn: number
    ) {
      const eliminated = node.eliminated ?? false;
      ctx.save();
      ctx.globalAlpha = fadeIn * (eliminated ? 0.3 : 0.95);

      ctx.beginPath();
      ctx.roundRect(x, y, NODE_W, NODE_H, 10);
      if (eliminated) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
        ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
      } else {
        const grad = ctx.createLinearGradient(x, y, x, y + NODE_H);
        grad.addColorStop(0, "rgba(168, 85, 247, 0.15)");
        grad.addColorStop(1, "rgba(59, 130, 246, 0.1)");
        ctx.fillStyle = grad;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = eliminated
        ? "rgba(239, 68, 68, 0.55)"
        : "rgba(226, 232, 240, 0.9)";
      ctx.font = "400 11px ui-sans-serif, system-ui, sans-serif";
      const lines = node.label.split("\n");
      lines.forEach((line, i) => {
        ctx.fillText(line, x + 12, y + 18 + i * 16);
      });

      if (eliminated) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + NODE_H / 2);
        ctx.lineTo(x + NODE_W - 10, y + NODE_H / 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    function drawTree(
      node: TreeNode,
      x: number,
      y: number,
      depth: number,
      offset: number
    ): number {
      const cx = x + NODE_W / 2;
      const cy = y + NODE_H / 2;
      const fadeIn = Math.min(1, frame / (15 + depth * 5));

      if (node.children && node.children.length > 0) {
        let childX = x - offset / 2 + NODE_W / 2;
        const childY = y + NODE_H + V_GAP;

        node.children.forEach((child) => {
          const childWidth = getTreeWidth(child);
          const childCenterX = childX + childWidth / 2;

          // Draw edge
          ctx.save();
          ctx.globalAlpha = fadeIn * (child.eliminated ? 0.2 : 0.5);
          ctx.strokeStyle = child.eliminated
            ? "rgba(239, 68, 68, 0.25)"
            : "rgba(148, 163, 184, 0.3)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(childCenterX, childY + NODE_H / 2);
          ctx.stroke();
          ctx.restore();

          drawTree(child, childX, childY, depth + 1, childWidth);
          childX += childWidth + H_GAP;
        });

        drawNodeCard(node, x, y, depth, fadeIn);
        return offset;
      } else {
        drawNodeCard(node, x, y, depth, fadeIn);
        return NODE_W;
      }
    }

    const totalWidth = getTreeWidth(DEMO_TREE);
    drawTree(DEMO_TREE, PAD, PAD, 0, totalWidth);
  }, [visible, frame]);

  return (
    <div className="flex flex-col rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg)]/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className="text-[color:var(--node-reasoning)]"
          >
            <path
              d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-3)]">
            Deductive Reasoning Trace
          </span>
        </div>
        <button
          onClick={() => setVisible(!visible)}
          className="text-[10px] font-medium text-[color:var(--accent)] hover:text-[color:var(--fg)] transition-colors cursor-pointer"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {visible && (
        <div className="relative" style={{ height: 420 }}>
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}