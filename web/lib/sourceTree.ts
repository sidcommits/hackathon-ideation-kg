import type { Citation } from "@/lib/chatReducer";

export type TreeKind = "root" | "group" | "document" | "passage";

export type TreeNode = {
  kind: TreeKind;
  label: string;
  children: TreeNode[];
  meta?: {
    sensitivity?: string;
    passageCount?: number;
    path?: string[]; // root → … → document label
  };
};

type ProvenanceMap = Record<string, { chain: string[] }>;

/** Root-first origin chain for a document title, or the __default__ fallback. */
export function resolveChain(docTitle: string, prov: ProvenanceMap): string[] {
  return prov[docTitle]?.chain ?? prov.__default__?.chain ?? ["Unfiled"];
}

/** Merge this answer's citations into a nested provenance tree. */
export function buildSourceTree(citations: Citation[], prov: ProvenanceMap): TreeNode[] {
  // Group citations by document first (doc_title → passages + sensitivity).
  const docs = new Map<string, { sensitivity: string; passages: string[] }>();
  for (const c of citations) {
    if (!docs.has(c.doc_title)) docs.set(c.doc_title, { sensitivity: c.sensitivity, passages: [] });
    docs.get(c.doc_title)!.passages.push(c.chunk_text);
  }

  const roots: TreeNode[] = [];
  const findOrAdd = (siblings: TreeNode[], label: string, kind: TreeKind): TreeNode => {
    let n = siblings.find((s) => s.label === label && s.kind === kind);
    if (!n) {
      n = { kind, label, children: [] };
      siblings.push(n);
    }
    return n;
  };

  for (const [docTitle, info] of docs) {
    const chain = resolveChain(docTitle, prov);
    let level = roots;
    chain.forEach((seg, i) => {
      const node = findOrAdd(level, seg, i === 0 ? "root" : "group");
      level = node.children;
    });
    // Append the document leaf with its passages.
    const docNode: TreeNode = {
      kind: "document",
      label: docTitle,
      children: info.passages.map((p) => ({ kind: "passage", label: p, children: [] })),
      meta: {
        sensitivity: info.sensitivity,
        passageCount: info.passages.length,
        path: [...chain, docTitle],
      },
    };
    level.push(docNode);
  }

  return roots;
}
