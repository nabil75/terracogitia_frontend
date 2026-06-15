/** Affiche un libellé snake_case en texte lisible (ex. lecture_graphique → Lecture graphique). */
export function humanizeSnakeLabel(raw: string | null | undefined): string {
  if (raw == null) return '';
  const text = String(raw).trim();
  if (!text || !text.includes('_') || /\s/.test(text)) {
    return text;
  }
  return text
    .split('_')
    .filter((word) => word.length > 0)
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0
        ? lower.charAt(0).toUpperCase() + lower.slice(1)
        : lower;
    })
    .join(' ');
}

function humanizeSubthemeRecord<T extends Record<string, unknown>>(sub: T): T {
  const current = (sub['label'] ?? sub['libelle']) as string | undefined;
  const label = humanizeSnakeLabel(current);
  if (!label || label === current) {
    return sub;
  }
  return {
    ...sub,
    ...(sub['label'] != null ? { label } : {}),
    ...(sub['libelle'] != null ? { libelle: label } : {})
  };
}

function humanizeThemeRecord<T extends Record<string, unknown>>(theme: T): T {
  const current = (theme['label'] ?? theme['libelle']) as string | undefined;
  const label = humanizeSnakeLabel(current);
  let out: T = theme;
  if (label && label !== current) {
    out = {
      ...theme,
      ...(theme['label'] != null ? { label } : {}),
      ...(theme['libelle'] != null ? { libelle: label } : {})
    };
  }
  for (const key of ['subThemes', 'sub_themes', 'subthemes', 'parcours', 'paths']) {
    const children = out[key];
    if (Array.isArray(children)) {
      out = {
        ...out,
        [key]: children.map((child) =>
          humanizeSubthemeRecord(child as Record<string, unknown>)
        )
      };
    }
  }
  return out;
}

/** Normalise les libellés thème / parcours d'une réponse `all_themes`. */
export function humanizeThemesPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map((theme) => humanizeThemeRecord(theme as Record<string, unknown>));
  }
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
  const record = raw as Record<string, unknown>;
  let changed = false;
  const result: Record<string, unknown> = { ...record };
  for (const key of ['themes', 'data']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      result[key] = nested.map((theme) =>
        humanizeThemeRecord(theme as Record<string, unknown>)
      );
      changed = true;
    }
  }
  return changed ? result : raw;
}

/** Arborescence Résumé : thèmes et parcours. */
export function humanizeKnowledgeOverview<T extends { themes: Array<{ label: string; subthemes: Array<{ label: string }> }> }>(
  disciplines: T[]
): T[] {
  return disciplines.map((discipline) => ({
    ...discipline,
    themes: discipline.themes.map((theme) => ({
      ...theme,
      label: humanizeSnakeLabel(theme.label),
      subthemes: theme.subthemes.map((subtheme) => ({
        ...subtheme,
        label: humanizeSnakeLabel(subtheme.label)
      }))
    }))
  }));
}

/** Fiche discipline (page Discipline) : thèmes associés. */
export function humanizeDisciplineDetail<T extends {
  themes: Array<{
    label: string;
    tagline?: string | null;
  }>;
}>(detail: T): T {
  return {
    ...detail,
    themes: detail.themes.map((theme) => ({
      ...theme,
      label: humanizeSnakeLabel(theme.label),
      tagline: theme.tagline ? humanizeSnakeLabel(theme.tagline) : theme.tagline
    }))
  };
}

/** Sessions parcours de l'évaluation avancée. */
export function humanizeAdvancedEvaluationOverview<T extends {
  discover_effort: {
    subtheme_sessions: Array<{
      theme_label?: string | null;
      subtheme_label?: string | null;
    }>;
  };
}>(overview: T): T {
  return {
    ...overview,
    discover_effort: {
      ...overview.discover_effort,
      subtheme_sessions: overview.discover_effort.subtheme_sessions.map((session) => ({
        ...session,
        theme_label: session.theme_label
          ? humanizeSnakeLabel(session.theme_label)
          : session.theme_label,
        subtheme_label: session.subtheme_label
          ? humanizeSnakeLabel(session.subtheme_label)
          : session.subtheme_label
      }))
    }
  };
}
