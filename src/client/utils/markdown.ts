import { Marked } from 'marked';

export interface TocItem {
  id: string;
  text: string;
  cleanText: string;
  level: number;
}

export interface MarkdownParseResult {
  html: string;
  markdownHtml: string;
  tocItems: TocItem[];
}

export function parseMarkdown(rawContent: string): MarkdownParseResult {
  if (!rawContent || !rawContent.trim()) {
    return { html: '', markdownHtml: '', tocItems: [] };
  }

  const items: TocItem[] = [];
  const slugCounts = new Map<string, number>();

  const slugify = (text: string) => {
    const clean = text
      .toLowerCase()
      .trim()
      .replace(/[^\w\u4e00-\u9fa5\-_ ]+/g, '')
      .replace(/\s+/g, '-') || 'section';
    const count = slugCounts.get(clean) || 0;
    slugCounts.set(clean, count + 1);
    return count > 0 ? `${clean}-${count}` : clean;
  };

  // 净化独立 [TOC] 标记，避免在正文中遗留占位字符
  const sanitizedContent = rawContent.replace(/^\s*\[(?:TOC|toc)\]\s*$/gm, '');

  const markedInstance = new Marked({
    gfm: true,
    breaks: true,
  });

  markedInstance.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const id = slugify(text);
        const cleanText = text
          .replace(/\[(?:TOC|toc)\]/gi, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[*_`~]/g, '')
          .trim();
        items.push({ id, text, cleanText, level: depth });
        const inner = this.parser.parseInline(tokens);
        return `<h${depth} id="${id}" class="heading-anchor group scroll-mt-6">${inner}<a href="#${id}" class="heading-anchor-link opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-blue-500 font-normal select-none" aria-hidden="true">#</a></h${depth}>\n`;
      },
      code(token) {
        const lang = (token.lang || '').trim().toLowerCase();
        if (lang === 'mermaid') {
          const encodedCode = encodeURIComponent(token.text);
          return `<div class="mermaid-diagram-placeholder my-5" data-mermaid-code="${encodedCode}"></div>\n`;
        }
        return false;
      },
    },
  });

  try {
    const html = markedInstance.parse(sanitizedContent) as string;
    return { html, markdownHtml: html, tocItems: items };
  } catch (err) {
    console.error('Markdown parse error:', err);
    const fallbackHtml = `<pre class="whitespace-pre-wrap font-mono text-xs">${rawContent}</pre>`;
    return {
      html: fallbackHtml,
      markdownHtml: fallbackHtml,
      tocItems: [],
    };
  }
}
