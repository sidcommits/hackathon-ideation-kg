import { describe, it, expect } from "vitest";
import { filterSelected, type Truth } from "@/lib/learnings";

const truths: Truth[] = [
  { question: "q0", answer: "a0", entities: ["MiFIR"] },
  { question: "q1", answer: "a1", entities: [] },
  { question: "q2", answer: "a2", entities: ["SFDR"] },
];

describe("filterSelected", () => {
  it("keeps only truths whose index is checked, preserving order", () => {
    const sel = filterSelected(truths, new Set([0, 2]));
    expect(sel.map((t) => t.question)).toEqual(["q0", "q2"]);
  });

  it("returns empty when nothing is checked", () => {
    expect(filterSelected(truths, new Set())).toEqual([]);
  });
});
