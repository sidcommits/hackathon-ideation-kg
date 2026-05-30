export type Truth = { question: string; answer: string; entities: string[] };

export type Reflection = { summary: string; truths: Truth[] };

/** Truths whose index is in `checked`, original order preserved. */
export function filterSelected(truths: Truth[], checked: Set<number>): Truth[] {
  return truths.filter((_, i) => checked.has(i));
}
