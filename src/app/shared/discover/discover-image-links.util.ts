/** Utilitaires Discover : nettoyage du texte (mots-clés / illustrations legacy). */
export interface DiscoverImageLink {
  label: string;
  url: string;
  motCle?: string;
  pexelsUrl?: string;
}

const HTTP_URL_RE = /^https?:\/\//i;

export function isSafeDiscoverImageUrl(url: string): boolean {
  const t = url.trim();
  if (!HTTP_URL_RE.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseDiscoverImageLinks(raw: unknown): DiscoverImageLink[] {
  if (!Array.isArray(raw)) return [];
  const out: DiscoverImageLink[] = [];
  for (const item of raw) {
    const link = coerceDiscoverImageLink(item);
    if (link) out.push(link);
  }
  return out.slice(0, 5);
}

function coerceDiscoverImageLink(item: unknown): DiscoverImageLink | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const rawUrl = String(o['url'] ?? o['href'] ?? '').trim();
  if (!isSafeDiscoverImageUrl(rawUrl)) return null;
  const label = String(o['label'] ?? o['titre'] ?? o['title'] ?? '').trim();
  const motCle = String(o['mot_cle'] ?? o['motCle'] ?? o['keyword'] ?? '').trim();
  const pexelsUrl = String(o['pexelsUrl'] ?? o['pexels_url'] ?? '').trim();
  return {
    label: label || motCle || rawUrl,
    url: rawUrl,
    motCle: motCle || undefined,
    pexelsUrl: isSafeDiscoverImageUrl(pexelsUrl) ? pexelsUrl : undefined
  };
}

export function sanitizeDiscoverImageLinks(links: DiscoverImageLink[]): DiscoverImageLink[] {
  return parseDiscoverImageLinks(links);
}

/** Tableau JSON de mots-clés (4–5 entrées courtes), pas du texte de section. */
export function isDiscoverKeywordsArray(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8) return false;
  return raw.every((x) => {
    if (typeof x !== 'string') return false;
    const t = x.trim();
    return t.length >= 2 && t.length <= 80 && !/[.!?]/.test(t) && t.split(/\s+/).length <= 6;
  });
}

export function parseDiscoverKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (t.length < 2) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Retire du corps de section les mots-clés / libellés d’illustrations
 * (évite le doublon texte + liens cliquables dans les propositions sauvegardées).
 */
export function stripSectionDisplayText(
  text: string,
  imageLinks: DiscoverImageLink[] = [],
  keywords: string[] = []
): string {
  const remove = new Set<string>();
  for (const kw of keywords) {
    const t = kw.trim();
    if (t) remove.add(t.toLowerCase());
  }
  for (const link of imageLinks) {
    const label = link.label?.trim();
    if (label) remove.add(label.toLowerCase());
    const mot = link.motCle?.trim();
    if (mot) remove.add(mot.toLowerCase());
    if (label.includes(' — ')) {
      remove.add(label.split(' — ')[0].trim().toLowerCase());
    }
  }

  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      kept.push('');
      continue;
    }
    if (/^illustrations?\s*(\(pexels\))?$/i.test(t)) continue;
    if (remove.has(t.toLowerCase())) continue;
    if (imageLinks.some((l) => l.url === t || l.pexelsUrl === t)) continue;
    const parts = t.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 6 && parts.every((p) => remove.has(p.toLowerCase()))) {
      continue;
    }
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
