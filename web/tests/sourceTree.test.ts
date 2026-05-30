import { describe, it, expect } from "vitest";
import { buildSourceTree, resolveChain } from "@/lib/sourceTree";
import type { Citation } from "@/lib/chatReducer";

const PROV: Record<string, { chain: string[] }> = {
  "ABC.pdf": { chain: ["SharePoint", "Compliance Dept"] },
  "DEF.pdf": { chain: ["SharePoint", "Compliance Dept"] },
  "GHI.pdf": { chain: ["GitHub", "Tax Eng"] },
  __default__: { chain: ["SharePoint", "Unfiled"] },
};

const cite = (doc: string, text: string): Citation => ({
  doc_title: doc,
  sensitivity: "C2 Internal",
  chunk_text: text,
});

describe("resolveChain", () => {
  it("returns the mapped chain when present", () => {
    expect(resolveChain("ABC.pdf", PROV)).toEqual(["SharePoint", "Compliance Dept"]);
  });
  it("falls back to __default__ for unmapped docs", () => {
    expect(resolveChain("ZZZ.pdf", PROV)).toEqual(["SharePoint", "Unfiled"]);
  });
});

describe("buildSourceTree", () => {
  it("returns [] for no citations", () => {
    expect(buildSourceTree([], PROV)).toEqual([]);
  });

  it("merges documents sharing a chain prefix under shared parents", () => {
    const tree = buildSourceTree(
      [cite("ABC.pdf", "p1"), cite("DEF.pdf", "p2")],
      PROV,
    );
    expect(tree).toHaveLength(1); // single SharePoint root
    const root = tree[0];
    expect(root.kind).toBe("root");
    expect(root.label).toBe("SharePoint");
    expect(root.children).toHaveLength(1); // one shared "Compliance Dept" group
    const group = root.children[0];
    expect(group.kind).toBe("group");
    expect(group.children.map((d) => d.label).sort()).toEqual(["ABC.pdf", "DEF.pdf"]);
  });

  it("separates documents with different roots", () => {
    const tree = buildSourceTree([cite("ABC.pdf", "p1"), cite("GHI.pdf", "p2")], PROV);
    expect(tree.map((r) => r.label).sort()).toEqual(["GitHub", "SharePoint"]);
  });

  it("attaches passages and metadata to document nodes", () => {
    const tree = buildSourceTree([cite("ABC.pdf", "first"), cite("ABC.pdf", "second")], PROV);
    const doc = tree[0].children[0].children[0];
    expect(doc.kind).toBe("document");
    expect(doc.meta?.passageCount).toBe(2);
    expect(doc.meta?.sensitivity).toBe("C2 Internal");
    expect(doc.children.map((p) => p.label)).toEqual(["first", "second"]);
    expect(doc.children[0].kind).toBe("passage");
  });

  it("records the root→leaf path on each document for the breadcrumb", () => {
    const tree = buildSourceTree([cite("ABC.pdf", "p1")], PROV);
    const doc = tree[0].children[0].children[0];
    expect(doc.meta?.path).toEqual(["SharePoint", "Compliance Dept", "ABC.pdf"]);
  });
});
