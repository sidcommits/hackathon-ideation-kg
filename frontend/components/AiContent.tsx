'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { IcoGlobe } from './Icons';

const components: Components = {
  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="md-h4">{children}</h4>,
  p: ({ children }) => <p className="md-p">{children}</p>,
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  li: ({ children }) => <li className="md-li">{children}</li>,
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,
  em: ({ children }) => <em className="md-em">{children}</em>,
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-');
    return isBlock
      ? <code className={`md-code-block ${className ?? ''}`}>{children}</code>
      : <code className="md-code-inline">{children}</code>;
  },
  pre: ({ children }) => <pre className="md-pre">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
  a: ({ href, children }) => (
    <a href={href} className="md-link" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  hr: () => <hr className="md-hr" />,
  table: ({ children }) => <div className="md-table-wrap"><table className="md-table">{children}</table></div>,
  th: ({ children }) => <th className="md-th">{children}</th>,
  td: ({ children }) => <td className="md-td">{children}</td>,
};

export function AiMessage({ content }: { content: string }) {
  return (
    <div className="msg-ai">
      <div className="ai-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
