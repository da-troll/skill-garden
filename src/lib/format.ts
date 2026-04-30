// Tiny helpers — no deps.

const AGENT_COLORS: Record<string, string> = {
  wilson: '#9CDCFE',
  eve: '#FFD580',
  pepper: '#FF9CC2',
  radar: '#C4A8FF',
  c3po: '#FFE36E',
  shared: '#7CFFB2',
};

export function agentColor(owner: string): string {
  return AGENT_COLORS[owner] || '#888';
}

export function ownerLabel(owner: string, fallback: string): string {
  if (owner === 'shared') return 'shared · all agents';
  return `${fallback} · agent`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'never';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Minimal markdown → HTML. Not a full parser; covers headers, code blocks,
// inline code, bold/italic, links, lists, blockquotes, hr. Defensive against
// HTML injection via basic escaping; tolerates malformed input.
export function mdToHtml(md: string): string {
  if (!md) return '';
  // Escape HTML
  let s = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code fences ```lang\n...\n```
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code}</code></pre>`);

  // Inline code `...`
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Headers
  s = s.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Horizontal rule
  s = s.replace(/^---\s*$/gm, '<hr/>');

  // Blockquote
  s = s.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold + italic
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Bullet lists (consecutive lines starting with - or *)
  s = s.replace(/(^[\-\*]\s+.+(\n[\-\*]\s+.+)*)/gm, (block) => {
    const items = block.split('\n').map((l) => l.replace(/^[\-\*]\s+/, ''));
    return '<ul>' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';
  });

  // Numbered lists (1. 2. 3. ...)
  s = s.replace(/(^\d+\.\s+.+(\n\d+\.\s+.+)*)/gm, (block) => {
    const items = block.split('\n').map((l) => l.replace(/^\d+\.\s+/, ''));
    return '<ol>' + items.map((i) => `<li>${i}</li>`).join('') + '</ol>';
  });

  // Paragraphs: wrap consecutive non-block lines in <p>
  s = s.split(/\n{2,}/).map((para) => {
    if (/^<(h\d|pre|ul|ol|blockquote|hr)/i.test(para.trim())) return para;
    return `<p>${para.replace(/\n/g, ' ')}</p>`;
  }).join('\n');

  return s;
}
