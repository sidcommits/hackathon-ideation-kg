'use client';

import { useState } from 'react';
import { IcoChevron } from './Icons';
import { getSourceConfig, SOURCE_CONFIGS } from './SourceIcons';

type Status = 'running' | 'done' | 'error';

interface ToolCardProps {
  toolName: string;
  args: unknown;
  status: Status;
  result?: unknown;
}

function formatArgs(args: unknown): string {
  if (typeof args === 'string') return args;
  try {
    const s = JSON.stringify(args, null, 2);
    // Trim long values for compact display
    return s.length > 300 ? s.slice(0, 300) + '…' : s;
  } catch { return String(args); }
}

function formatResult(result: unknown): string {
  if (typeof result === 'string') return result.length > 200 ? result.slice(0, 200) + '…' : result;
  try {
    const s = JSON.stringify(result);
    return s.length > 200 ? s.slice(0, 200) + '…' : s;
  } catch { return String(result); }
}

/* Readable label from snake_case tool name */
function toolLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ToolCard({ toolName, args, status, result }: ToolCardProps) {
  // Start collapsed once done, open while running
  const [open, setOpen] = useState(status === 'running');

  const source = getSourceConfig(toolName);

  // Fallback icon for unknown tools
  const fallbackIcon = (
    <div className="tool-source-icon" style={{ background: 'rgba(37,99,235,0.12)' }}>
      <svg viewBox="0 0 16 16" fill="none" width="11" height="11">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="#3b82f6"/>
      </svg>
    </div>
  );

  return (
    <div className="msg-tool">
      <div className="tool-header" onClick={() => setOpen(o => !o)}>
        {/* Source icon */}
        {source ? (
          <div className="tool-source-icon" style={{ background: source.bg }} title={source.label}>
            {source.icon}
          </div>
        ) : fallbackIcon}

        {/* Tool name */}
        <span className="tool-name">{toolLabel(toolName)}</span>

        {/* Status */}
        <span className="tool-status-badge" data-status={status}>
          {status === 'running' && <span className="tool-dot-pulse" />}
          {status === 'done' && <span className="tool-dot-done" />}
          {status === 'error' && <span className="tool-dot-error" />}
          <span className="tool-status-label">
            {status === 'running' ? 'Fetching' : status === 'error' ? 'Error' : 'Done'}
          </span>
        </span>

        {/* Chevron */}
        <span className={`tool-chevron ${open ? 'open' : ''}`}>
          <IcoChevron open={open} />
        </span>
      </div>

      {open && (
        <div className="tool-body">
          <pre className="tool-args">{formatArgs(args)}</pre>
          {result != null && status === 'done' && (
            <div className="tool-result">{formatResult(result)}</div>
          )}
        </div>
      )}
    </div>
  );
}
