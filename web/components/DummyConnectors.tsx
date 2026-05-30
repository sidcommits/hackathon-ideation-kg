// ⚠️ DEMO-ONLY — DUMMY TOOL CALLS (frontend mock, no backend).
// Showcases future connectors (GitHub, Confluence, Jira). Purely cosmetic.
// TO REVERSE: delete this file and remove the <DummyConnectors /> block in ChatThread.tsx.
import React from "react";

type Connector = {
  name: string;
  query: string;
  summary: string;
  color: string;
  Logo: () => React.ReactElement;
};

function GitHubLogo() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.42.37.8 1.1.8 2.22v3.29c0 .31.21.67.8.56A11.53 11.53 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5Z" />
    </svg>
  );
}

function ConfluenceLogo() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.3 17.9c-.2.35-.46.8-.66 1.12a.6.6 0 0 0 .2.82l4.3 2.65a.6.6 0 0 0 .83-.2c.18-.3.4-.7.65-1.1 1.74-2.87 3.5-2.52 6.65-1.01l4.27 2.03a.6.6 0 0 0 .8-.3l2.05-4.64a.6.6 0 0 0-.3-.78c-.9-.42-2.69-1.27-4.3-2.05-5.8-2.82-10.73-2.64-14.5 3.46Z" />
      <path d="M21.7 6.1c.2-.35.46-.8.66-1.12a.6.6 0 0 0-.2-.82L17.86 1.5a.6.6 0 0 0-.84.2c-.18.3-.4.7-.65 1.1-1.74 2.87-3.5 2.52-6.65 1.01L5.46 1.79a.6.6 0 0 0-.8.3L2.6 6.73a.6.6 0 0 0 .3.78c.9.42 2.69 1.27 4.3 2.05 5.81 2.82 10.74 2.63 14.5-3.46Z" />
    </svg>
  );
}

function JiraLogo() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.57 11.41 3.6 3.44A.55.55 0 0 0 3.21 4.4l4.32 4.32 3.65 3.65a.55.55 0 0 0 .78 0l3.65-3.65 1.13-1.13a.55.55 0 0 0 0-.78L11.96 0a.55.55 0 0 0-.78.78l3.65 3.65a.55.55 0 0 1 0 .78l-2.48 2.48a.55.55 0 0 1-.78 0Z" opacity=".55" />
      <path d="M12.04 12.55a4.78 4.78 0 0 1-.01-6.75L7.7 1.46a.55.55 0 0 0-.78 0L.78 7.6a.55.55 0 0 0 0 .78l6.14 6.14 5.12 5.12a.55.55 0 0 0 .78 0l4.33-4.33-5.11-2.76Z" transform="translate(5.6 4.1)" />
    </svg>
  );
}

// Static, professional mock connectors. Always shown as "done".
const CONNECTORS: Connector[] = [
  {
    name: "github.search_repos",
    query: 'repo: "six-financial/reference-data"',
    summary: "3 matching PRs · CONNECT TO ENABLE",
    color: "#E6EDF3",
    Logo: GitHubLogo,
  },
  {
    name: "confluence.search_pages",
    query: 'space: "REG" label: "mifid-ii"',
    summary: "12 pages indexed · CONNECT TO ENABLE",
    color: "#2684FF",
    Logo: ConfluenceLogo,
  },
  {
    name: "jira.search_issues",
    query: 'project = REG AND status = "In Review"',
    summary: "5 open tickets · CONNECT TO ENABLE",
    color: "#2684FF",
    Logo: JiraLogo,
  },
];

export function DummyConnectors() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 pl-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--fg-3)]">
          Connected Sources
        </span>
        <span className="rounded-full border border-[color:var(--line)] bg-[color:var(--bg-2)]/70 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--fg-3)]">
          Preview
        </span>
      </div>

      {CONNECTORS.map((c) => (
        <div key={c.name} className="tool-card glass overflow-hidden rounded-xl opacity-80">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full"
              style={{ color: c.color, background: `${c.color}1f` }}
            >
              <c.Logo />
            </span>

            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--fg-3)]">
              Tool
            </span>

            <span className="font-mono text-xs font-medium text-[color:var(--accent)]">
              {c.name}
            </span>

            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--fg-3)]">
              ({c.query})
            </span>
          </div>

          <div className="border-t border-[color:var(--line)] bg-[color:var(--bg-2)]/40 px-3 py-1.5 pl-9 font-mono text-[11px] text-[color:var(--fg-2)]">
            {c.summary}
          </div>
        </div>
      ))}
    </div>
  );
}
