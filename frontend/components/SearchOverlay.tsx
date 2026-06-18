'use client';

import { useState, useEffect, useRef } from 'react';
import { IcoSearch, IcoClose, IcoStar } from './Icons';

const SUGGESTIONS = [
  'What are the latest breakthroughs in quantum computing?',
  'Analyze trends in renewable energy investments this year',
  'Summarize recent AI safety research papers',
  'Compare top open-source LLMs on coding benchmarks',
  'Find competitors to our product in the EU market',
];

interface SearchOverlayProps {
  onClose: () => void;
  onSubmit: (query: string) => void;
}

export default function SearchOverlay({ onClose, onSubmit }: SearchOverlayProps) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = (text: string) => { onSubmit(text); onClose(); };

  return (
    <div className="search-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-modal">
        <div className="search-modal-top">
          <span style={{ color: '#93c5fd' }}><IcoSearch /></span>
          <input
            ref={ref}
            className="search-modal-input"
            placeholder="Search or ask anything..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && q.trim() && submit(q.trim())}
          />
          <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28 }}>
            <IcoClose />
          </button>
        </div>
        <div className="search-items">
          <div className="search-section-label">Suggestions</div>
          {SUGGESTIONS.map((s, i) => (
            <div key={i} className="search-item" onClick={() => submit(s)}>
              <div className="search-item-icon"><IcoStar /></div>
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
