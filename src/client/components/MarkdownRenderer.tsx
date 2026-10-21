import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MermaidBlock } from './MermaidBlock';

interface MarkdownRendererProps {
  html: string;
  className?: string;
}

interface MermaidPortalItem {
  id: string;
  code: string;
  element: HTMLElement;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ html, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [portals, setPortals] = useState<MermaidPortalItem[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const placeholders = containerRef.current.querySelectorAll<HTMLElement>('.mermaid-diagram-placeholder');
    const newPortals: MermaidPortalItem[] = [];

    placeholders.forEach((el, index) => {
      const encoded = el.getAttribute('data-mermaid-code') || '';
      try {
        const code = decodeURIComponent(encoded);
        newPortals.push({
          id: `mermaid-${index}-${code.slice(0, 20)}`,
          code,
          element: el,
        });
      } catch (e) {
        console.error('Failed to decode mermaid code:', e);
      }
    });

    setPortals(newPortals);
  }, [html]);

  return (
    <div className="relative w-full">
      <div
        ref={containerRef}
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {portals.map((item) =>
        item.element.isConnected
          ? createPortal(<MermaidBlock code={item.code} key={item.id} />, item.element)
          : null
      )}
    </div>
  );
};
