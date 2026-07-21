/** Échappe le texte avant injection dans du HTML généré localement. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Applique le markdown inline courant sur du texte déjà échappé HTML. */
function formatInlineMarkdown(escapedText: string): string {
  let result = escapedText;

  result = result.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
  result = result.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
  result = result.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  result = result.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em>$1</em>');

  return result;
}

function renderInlineText(text: string): string {
  return formatInlineMarkdown(escapeHtml(text));
}

const NUMBERED_PREFIX = /^\s*(?:\d{1,2}|[ivxIVX]+)[\.\)\]:\-–—]\s+/;
const BULLET_PREFIX = /^\s*[-•*–—]\s+/;

function stripNumberedPrefix(line: string): string {
  return line.replace(NUMBERED_PREFIX, '').trim();
}

function stripBulletPrefix(line: string): string {
  return line.replace(BULLET_PREFIX, '').trim();
}

function isNumberedLine(line: string): boolean {
  return NUMBERED_PREFIX.test(line);
}

function isBulletLine(line: string): boolean {
  return BULLET_PREFIX.test(line);
}

/** Découpe une ligne unique du type « 1. A 2. B 3. C ». */
function splitInlineNumberedItems(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed
    .split(/(?=(?:^|\s)\d{1,2}[\.\)]\s+)/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  if (!parts.every((p) => isNumberedLine(p))) return null;
  return parts.map(stripNumberedPrefix).filter((p) => p.length > 0);
}

function renderOrderedList(items: string[]): string {
  const lis = items.map((item) => `<li>${renderInlineText(item)}</li>`).join('');
  return `<ol>${lis}</ol>`;
}

function renderBulletList(items: string[]): string {
  const lis = items.map((item) => `<li>${renderInlineText(item)}</li>`).join('');
  return `<ul>${lis}</ul>`;
}

function renderParagraph(text: string): string {
  return `<p>${renderInlineText(text)}</p>`;
}

function renderBlock(block: string): string {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return '';

  if (lines.length === 1) {
    const inlineNumbered = splitInlineNumberedItems(lines[0]);
    if (inlineNumbered && inlineNumbered.length >= 2) {
      return renderOrderedList(inlineNumbered);
    }
    return renderParagraph(lines[0]);
  }

  const numberedCount = lines.filter(isNumberedLine).length;
  const bulletCount = lines.filter(isBulletLine).length;

  if (numberedCount >= 2 && numberedCount >= lines.length * 0.6) {
    return renderOrderedList(lines.map(stripNumberedPrefix).filter((l) => l.length > 0));
  }

  if (bulletCount >= 2 && bulletCount >= lines.length * 0.6) {
    return renderBulletList(lines.map(stripBulletPrefix).filter((l) => l.length > 0));
  }

  return lines.map((line) => renderParagraph(line)).join('');
}

/**
 * Transforme le texte brut d'une section Discover en HTML lisible :
 * paragraphes séparés, listes numérotées ou à puces selon la structure détectée.
 */
export function formatDiscoverProseHtml(text: string): string {
  const normalized = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const blocks = normalized.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 0);
  if (blocks.length === 0) return renderParagraph(normalized);

  return blocks.map(renderBlock).join('');
}
