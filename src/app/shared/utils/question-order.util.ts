/** Question identifiable par un identifiant string (souvent `id_question`). */
export interface WithQuestionId {
  id: string;
}

/** Compare deux `id_question` (numérique si possible, sinon lexicographique). */
export function compareQuestionIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Tri stable par `id_question` croissant (ordre canonique du parcours). */
export function sortByQuestionId<T extends WithQuestionId>(items: T[]): T[] {
  return [...items].sort((a, b) => compareQuestionIds(a.id, b.id));
}

/**
 * Attribue Q1…Qn selon le rang de `id_question` (indépendant de l’ordre d’affichage).
 */
export function assignQuestionNumbers<T extends WithQuestionId>(
  items: T[]
): (T & { qNum: number })[] {
  const sorted = sortByQuestionId(items);
  const rank = new Map(sorted.map((q, i) => [q.id, i + 1] as const));
  return items.map((q) => ({
    ...q,
    qNum: rank.get(q.id) ?? 0
  }));
}

export function formatQ(qNum: number): string {
  return `Q${qNum}`;
}

/** Libellé envoyé à l’API ordre logique / Mistral (« Qn - … »). */
export function questionOrdreLabel(qNum: number, label: string): string {
  return `${formatQ(qNum)} - ${label}`.trim();
}

/** Retire le suffixe « (id=815) » parfois ajouté par Mistral. */
export function stripOrdreLabelIdSuffix(label: string): string {
  return label.trim().replace(/\s*\(id\s*=\s*\d+\s*\)\s*$/i, '').trim();
}

/** Extrait l’id question du suffixe « (id=815) » si présent. */
export function extractIdFromOrdreLabel(label: string): string | undefined {
  const m = /\s*\(id\s*=\s*(\d+)\s*\)\s*$/i.exec(label.trim());
  return m ? m[1] : undefined;
}
