export interface SourceConfig {
  label: string;
  bg: string;
  icon: React.ReactNode;
}

/* ── Brand icons (16×16 SVG) ── */

const Confluence = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <path d="M2.1 10.6c-.3.5-.1 1 .4 1.3l2 .9 1.8-3.5-1.9-3z" fill="white"/>
    <path d="M13.9 5.4c.3-.5.1-1-.4-1.3l-2-.9-1.8 3.5 1.9 3z" fill="rgba(255,255,255,.75)"/>
  </svg>
);

const Slack = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <rect x="1.5" y="5.3" width="6.8" height="2.1" rx="1.05" fill="#36C5F0"/>
    <rect x="7.7" y="8.6" width="6.8" height="2.1" rx="1.05" fill="#ECB22E"/>
    <rect x="5.3" y="1.5" width="2.1" height="6.8" rx="1.05" fill="#2EB67D"/>
    <rect x="8.6" y="7.7" width="2.1" height="6.8" rx="1.05" fill="#E01E5A"/>
  </svg>
);

const GoogleDocs = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0H10l3 3v11a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 14V1.5z" fill="white" fillOpacity=".9"/>
    <path d="M10 0l3 3h-3V0z" fill="white" fillOpacity=".55"/>
    <rect x="5" y="6.5" width="6" height="1" rx=".5" fill="#4285F4"/>
    <rect x="5" y="8.5" width="6" height="1" rx=".5" fill="#4285F4" fillOpacity=".7"/>
    <rect x="5" y="10.5" width="4" height="1" rx=".5" fill="#4285F4" fillOpacity=".5"/>
  </svg>
);

const SharePoint = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <circle cx="6.5" cy="6.5" r="5.5" fill="white" fillOpacity=".9"/>
    <circle cx="10.5" cy="10.5" r="5" fill="white" fillOpacity=".7"/>
    <path d="M5 9.5c0-.83.67-1.5 1.5-1.5h3.5v1H6.5a.5.5 0 0 0-.5.5v.5H5v-.5z" fill="#038387" fillOpacity=".5"/>
    <text x="4" y="10" fontSize="6.5" fontWeight="700" fill="#038387" fontFamily="system-ui">SP</text>
  </svg>
);

const Notion = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <rect x="2" y="1" width="12" height="14" rx="2" fill="white" fillOpacity=".9"/>
    <path d="M5 3.5h1.2l4.3 6V3.5H11v9H9.8L5.5 6.5V12.5H5v-9z" fill="#1a1a1a"/>
  </svg>
);

const GitHub = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <path fillRule="evenodd" clipRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33C3.72 14.45 3.26 13 3.26 13c-.36-.92-.88-1.17-.88-1.17-.72-.49.05-.48.05-.48.8.06 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.67 7.67 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.45.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" fill="white" fillOpacity=".9"/>
  </svg>
);

const Jira = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <path d="M8 1.3L2.5 6.8a1 1 0 0 0 0 1.4l2.1 2.1L8 7 5.3 4.3 8 1.6 10.7 4.3 8 7l3.4 3.3 2.1-2.1a1 1 0 0 0 0-1.4L8 1.3z" fill="white" fillOpacity=".9"/>
    <path d="M8 7l-2.4 2.4 2.4 2.4 2.4-2.4L8 7z" fill="white" fillOpacity=".6"/>
    <circle cx="8" cy="13.5" r="1.5" fill="white" fillOpacity=".9"/>
  </svg>
);

const Sharepoint2 = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <circle cx="6" cy="6" r="5" fill="white" fillOpacity=".85"/>
    <circle cx="10.5" cy="10.5" r="4.5" fill="white" fillOpacity=".65"/>
  </svg>
);

/* ── Source config map — keyed by tool name fragment ── */
export const SOURCE_CONFIGS: Record<string, SourceConfig> = {
  confluence: {
    label: 'Confluence',
    bg: '#0052CC',
    icon: <Confluence />,
  },
  slack: {
    label: 'Slack',
    bg: '#4A154B',
    icon: <Slack />,
  },
  google_drive: {
    label: 'Google Docs',
    bg: '#4285F4',
    icon: <GoogleDocs />,
  },
  google_docs: {
    label: 'Google Docs',
    bg: '#4285F4',
    icon: <GoogleDocs />,
  },
  sharepoint: {
    label: 'SharePoint',
    bg: '#038387',
    icon: <SharePoint />,
  },
  notion: {
    label: 'Notion',
    bg: '#2F3437',
    icon: <Notion />,
  },
  github: {
    label: 'GitHub',
    bg: '#24292E',
    icon: <GitHub />,
  },
  jira: {
    label: 'Jira',
    bg: '#0052CC',
    icon: <Jira />,
  },
  web: {
    label: 'Web',
    bg: '#2563eb',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
        <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="1.4" fill="none" strokeOpacity=".9"/>
        <path d="M8 2c-1.2 1.5-2 3.6-2 6s.8 4.5 2 6M8 2c1.2 1.5 2 3.6 2 6s-.8 4.5-2 6M2 8h12" stroke="white" strokeWidth="1.2" strokeOpacity=".9"/>
      </svg>
    ),
  },
  synthesize: {
    label: 'Synthesis',
    bg: '#7c3aed',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
        <circle cx="4" cy="4" r="2.2" fill="white" fillOpacity=".9"/>
        <circle cx="12" cy="4" r="2.2" fill="white" fillOpacity=".9"/>
        <circle cx="8" cy="12" r="2.2" fill="white" fillOpacity=".9"/>
        <line x1="4" y1="4" x2="12" y2="4" stroke="white" strokeWidth="1" strokeOpacity=".5"/>
        <line x1="4" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1" strokeOpacity=".5"/>
        <line x1="12" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1" strokeOpacity=".5"/>
      </svg>
    ),
  },
};

/* Detect which source config matches a tool name */
export function getSourceConfig(toolName: string): SourceConfig | null {
  const name = toolName.toLowerCase();
  for (const [key, config] of Object.entries(SOURCE_CONFIGS)) {
    if (name.includes(key)) return config;
  }
  return null;
}
