import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ApiService } from '../../api/api.service';
import { DisciplineService } from '../../shared/services/discipline.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';

interface DiscoverQuestion {
  id: string;
  label: string;
  /** Texte de référence / proposition renvoyé par l’API (champ variable selon le backend). */
  proposedAnswer: string;
}

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    CommonModule,
    TransverseRailComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
    MatSnackBarModule
  ],
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss'
})
export class DiscoverComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly disciplineService = inject(DisciplineService);
  private querySub?: Subscription;

  themes: any[] = [];
  expandedThemeId: string | null = null;

  selectedThemeId = '';
  selectedThemeLabel = '';
  selectedSubThemeId = '';
  selectedSubThemeLabel = '';

  questions: DiscoverQuestion[] = [];
  selectedQuestionId: string | null = null;
  loadingThemes = true;
  loadingQuestions = false;
  loadThemesError = '';
  loadQuestionsError = '';

  /** Proposition renvoyée par l’API discover (colonne de droite). */
  discoveredProposition = '';
  /** Points clés éventuels renvoyés par la même API, affichés en liste à puces. */
  discoveredKeyPoints: string[] = [];
  isGenerating = false;

  ngOnInit(): void {
    this.querySub = this.route.queryParamMap.subscribe((q) => {
      const theme = q.get('theme') ?? '';
      const sub = q.get('subTheme') ?? '';
      const themeLabel = q.get('themeLabel') ?? '';
      const subLabel = q.get('subThemeLabel') ?? '';
      if (theme && sub) {
        this.selectedThemeId = theme;
        this.selectedSubThemeId = sub;
        this.selectedThemeLabel = themeLabel;
        this.selectedSubThemeLabel = subLabel;
        this.expandedThemeId = theme;
      }
    });
    this.loadThemes();
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
  }

  private loadThemes(): void {
    this.loadingThemes = true;
    this.loadThemesError = '';
    this.api.getAllThemes(this.disciplineService.selectedDisciplineId()).subscribe({
      next: (data: unknown) => {
        if (Array.isArray(data)) {
          this.themes = data;
        } else {
          const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
          const nested = d?.['themes'] ?? d?.['data'];
          this.themes = Array.isArray(nested) ? nested : [];
        }
        if (this.selectedSubThemeId) {
          this.loadQuestionsForSubTheme();
        }
      },
      error: () => {
        this.loadThemesError = this.translate.instant('discover.loadThemesError');
        this.themes = [];
      },
      complete: () => {
        this.loadingThemes = false;
      }
    });
  }

  toggleTheme(themeId: string): void {
    this.expandedThemeId = this.expandedThemeId === themeId ? null : themeId;
  }

  selectSubTheme(theme: any, sub: any): void {
    this.selectedThemeId = String(theme.id);
    this.selectedThemeLabel = theme.label ?? '';
    this.selectedSubThemeId = String(sub.id);
    this.selectedSubThemeLabel = sub.label ?? '';
    this.questions = [];
    this.selectedQuestionId = null;
    this.discoveredProposition = '';
    this.discoveredKeyPoints = [];
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        theme: this.selectedThemeId,
        subTheme: this.selectedSubThemeId,
        themeLabel: this.selectedThemeLabel,
        subThemeLabel: this.selectedSubThemeLabel
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.loadQuestionsForSubTheme();
  }

  selectQuestion(id: string): void {
    this.selectedQuestionId = id;
    this.discoveredProposition = '';
    this.discoveredKeyPoints = [];
  }

  discover(): void {
    if (!this.selectedQuestionId) return;
    const label = this.selectedQuestionLabel();
    this.isGenerating = true;
    this.api.getPropositionForQuestion(label, this.selectedSubThemeLabel).subscribe({
      next: (response) => {
        const { text, keyPoints } = this.parseDiscoverApiResponse(response);
        this.discoveredProposition = text;
        this.discoveredKeyPoints = keyPoints;
        this.isGenerating = false;
        if (!text.trim() && keyPoints.length === 0) {
          this.snackBar.open(
            this.translate.instant('discover.propositionUnexpectedShape'),
            this.translate.instant('common.close'),
            { duration: 6000 }
          );
        }
      },
      error: () => {
        this.isGenerating = false;
        this.snackBar.open(
          this.translate.instant('discover.propositionLoadError'),
          this.translate.instant('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  private loadQuestionsForSubTheme(): void {
    if (!this.selectedSubThemeId) return;
    this.loadQuestionsError = '';
    this.loadingQuestions = true;
    this.questions = [];
    this.selectedQuestionId = null;
    this.discoveredProposition = '';
    this.discoveredKeyPoints = [];
    this.api.getQuestionsBySubTheme(this.selectedSubThemeId).subscribe({
      next: (response: unknown) => {
        this.questions = this.normalizeQuestions(response);
      },
      error: () => {
        this.loadQuestionsError = this.translate.instant('discover.loadQuestionsError');
      },
      complete: () => {
        this.loadingQuestions = false;
      }
    });
  }

  private normalizeQuestions(response: unknown): DiscoverQuestion[] {
    const records = Array.isArray(response)
      ? response
      : (response as { questions?: unknown[]; data?: unknown[] })?.questions ||
        (response as { data?: unknown[] })?.data ||
        [];
    return records
      .map((record: any, index: number) => {
        const rawLabel = String(record?.libelle ?? record?.label ?? '');
        const label = this.decodeQuestionText(rawLabel).trim();
        const id = String(record?.id ?? record?.id_question ?? index);
        const proposedAnswer = this.extractProposedAnswer(record);
        return { id, label, proposedAnswer };
      })
      .filter((q) => q.label.length > 0);
  }

  /** Reprise de la logique Review : libellés parfois encodés en URI. */
  private decodeQuestionText(value: string): string {
    if (!value) return '';
    try {
      return decodeURIComponent(value).replace(/''/g, "'");
    } catch {
      return value.replace(/''/g, "'");
    }
  }

  /**
   * Proposition / correction attendue : noms de champs possibles côté API.
   * À élargir si le backend expose un nom fixe documenté.
   */
  private extractProposedAnswer(record: any): string {
    const raw =
      record?.proposition_reponse ??
      record?.propositionReponse ??
      record?.reponse_proposee ??
      record?.reponseProposee ??
      record?.reponse_attendue ??
      record?.reponseAttendue ??
      record?.exemple_reponse ??
      record?.exempleReponse ??
      record?.correction ??
      record?.corrige ??
      record?.model_answer ??
      record?.contenu_reponse ??
      record?.reponse_reference ??
      record?.reponse ??
      '';
    if (raw == null) return '';
    const s = typeof raw === 'string' ? raw : String(raw);
    return this.decodeQuestionText(s).trim();
  }

  selectedQuestionLabel(): string {
    const q = this.questions.find((x) => x.id === this.selectedQuestionId);
    return q?.label ?? '';
  }

  selectedProposedAnswer(): string {
    const q = this.questions.find((x) => x.id === this.selectedQuestionId);
    return q?.proposedAnswer?.trim() ?? '';
  }

  /** Colonne « proposition » : texte principal (API discover puis données question). */
  answerColumnBody(): string {
    const fromApi = this.discoveredProposition.trim();
    if (fromApi.length > 0) return fromApi;
    if (this.discoveredKeyPoints.length > 0) return '';
    return this.selectedProposedAnswer();
  }

  /** Texte et points clés issus de la réponse discovering. */
  private parseDiscoverApiResponse(response: unknown): { text: string; keyPoints: string[] } {
    const payload = this.normalizeDiscoverPayload(response);
    return {
      text: this.extractPropositionTextFromApi(payload),
      keyPoints: this.extractKeyPointsFromApi(payload)
    };
  }

  /** Si le backend renvoie une chaîne JSON ou un double-sérialisation, on parse une fois. */
  private normalizeDiscoverPayload(raw: unknown): unknown {
    if (raw == null) return raw;
    if (typeof raw !== 'string') return raw;
    const t = raw.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return JSON.parse(t) as unknown;
      } catch {
        return raw;
      }
    }
    return raw;
  }

  /** Liste `caractéristiques` même si la clé varie (accents, casse). */
  private getCaracteristiquesArray(ob: Record<string, unknown>): unknown[] | null {
    const exact =
      ob['caractéristiques'] ?? ob['caracteristiques'] ?? ob['characteristics'] ?? ob['caracteristics'];
    if (Array.isArray(exact)) return exact;
    for (const key of Object.keys(ob)) {
      const k = key.toLowerCase();
      if ((k.includes('caract') && k.includes('rist')) || k === 'traits') {
        const v = ob[key];
        if (Array.isArray(v)) return v;
      }
    }
    return null;
  }

  hasAnswerColumnContent(): boolean {
    return this.answerColumnBody().length > 0 || this.discoveredKeyPoints.length > 0;
  }

  /**
   * Liste de points clés : tableaux de chaînes ou chaînes multi-lignes / à puces.
   * Parcourt aussi les objets enveloppes (ex. { proposition: { texte, points_cles } }).
   */
  private extractKeyPointsFromApi(response: unknown): string[] {
    const acc: string[] = [];

    const pushFromArray = (arr: unknown[]): void => {
      for (const item of arr) {
        if (typeof item === 'string') {
          const t = item.trim();
          if (t) acc.push(this.decodeQuestionText(t));
        } else if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          const ob = item as Record<string, unknown>;
          /** Structure discovering : { type, caractéristiques: string[] } */
          const caracteristiques = this.getCaracteristiquesArray(ob);
          if (caracteristiques !== null && caracteristiques.length > 0) {
            const typ = ob['type'] ?? ob['titre'];
            if (typeof typ === 'string' && typ.trim()) {
              acc.push(this.decodeQuestionText(typ.trim()));
            }
            for (const c of caracteristiques) {
              if (typeof c === 'string' && c.trim()) {
                acc.push(this.decodeQuestionText(c.trim()));
              }
            }
            continue;
          }
          const noteSynth = ob['note_synthèse'] ?? ob['note_synthese'];
          if (typeof noteSynth === 'string' && noteSynth.trim()) {
            acc.push(this.decodeQuestionText(noteSynth.trim()));
            continue;
          }
          const inner =
            ob['text'] ??
            ob['label'] ??
            ob['libelle'] ??
            ob['content'] ??
            ob['point'] ??
            ob['titre'] ??
            ob['description'] ??
            ob['valeur'];
          if (typeof inner === 'string' && inner.trim()) {
            acc.push(this.decodeQuestionText(inner.trim()));
          }
        }
      }
    };

    const tryParseJsonArrayString = (raw: string): unknown[] | null => {
      const t = raw.trim();
      if (!t.startsWith('[')) return null;
      try {
        const parsed = JSON.parse(t) as unknown;
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };

    const isLikelyKeyPointArray = (arr: unknown[]): boolean => {
      if (arr.length === 0 || arr.length > 40) return false;
      return arr.every(
        (x) =>
          typeof x === 'string' ||
          (x !== null && typeof x === 'object' && !Array.isArray(x))
      );
    };

    const visit = (node: unknown): void => {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        pushFromArray(node);
        return;
      }
      const o = node as Record<string, unknown>;
      const listKeys = [
        'points_cles',
        'points_clés',
        'pointsCles',
        'points_cles_list',
        'key_points',
        'keyPoints',
        'bullet_points',
        'liste_points',
        'idees_cles',
        'idees_clés',
        'elements_cles',
        'elements_clés',
        'highlights',
        'points_forts',
        'synthese_points_forts',
        'takeaways',
        'keywords',
        'bullets',
        'liste',
        'items',
        'arguments',
        'choix',
        'essentiel',
        'principaux_points'
      ];
      for (const k of listKeys) {
        const v = o[k];
        if (Array.isArray(v)) {
          pushFromArray(v);
        } else if (typeof v === 'string' && v.trim()) {
          const parsedArr = tryParseJsonArrayString(v);
          if (parsedArr) {
            pushFromArray(parsedArr);
          } else {
            v.split(/\n+/)
              .map((s) => s.replace(/^\s*[-*•·]\s*/, '').trim())
              .filter(Boolean)
              .forEach((s) => acc.push(this.decodeQuestionText(s)));
          }
        }
      }

      for (const v of Object.values(o)) {
        if (!Array.isArray(v) || !isLikelyKeyPointArray(v)) continue;
        pushFromArray(v);
      }

      const wrapKeys = [
        'proposition',
        'proposition_reponse',
        'reponse',
        'response',
        'result',
        'answer',
        'output',
        'payload',
        'body',
        'data'
      ];
      for (const wk of wrapKeys) {
        const v = o[wk];
        if (v != null && typeof v === 'object' && !Array.isArray(v)) visit(v);
      }
    };

    visit(response);
    const seen = new Set<string>();
    return acc.filter((s) => {
      const k = s.trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * Normalise la payload renvoyée par GET discovering (JSON variable selon le backend).
   */
  private extractPropositionTextFromApi(response: unknown): string {
    if (response == null) return '';
    if (typeof response === 'string') {
      const normalized = this.normalizeDiscoverPayload(response);
      if (normalized !== response && typeof normalized === 'object') {
        return this.extractPropositionTextFromApi(normalized);
      }
      return response.trim();
    }
    if (typeof response !== 'object') return String(response).trim();
    if (Array.isArray(response)) {
      const first = response.find((x) => typeof x === 'string' && x.trim().length > 0);
      return first != null ? String(first).trim() : '';
    }

    const o = response as Record<string, unknown>;
    const directKeys = [
      'proposition',
      'proposition_reponse',
      'propositionReponse',
      'reponse',
      'reponse_proposee',
      'reponse_proposee_ia',
      'response',
      'result',
      'content',
      'text',
      'texte',
      'message',
      'answer',
      'output',
      'corps'
    ];
    for (const key of directKeys) {
      const v = o[key];
      if (v == null) continue;
      if (typeof v === 'string') {
        const t = v.trim();
        if (t.length > 0) return t;
        continue;
      }
      if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
      if (typeof v === 'object' && !Array.isArray(v)) {
        const nested = this.extractPropositionTextFromApi(v);
        if (nested.length > 0) return nested;
      }
    }

    const data = o['data'];
    if (data != null && typeof data === 'object') {
      const nested = this.extractPropositionTextFromApi(data);
      if (nested.length > 0) return nested;
    }

    const stringValues = Object.values(o).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (stringValues.length === 1) return stringValues[0].trim();

    return '';
  }

  isSubSelected(sub: { id?: unknown }): boolean {
    return this.selectedSubThemeId === String(sub?.id ?? '');
  }
}
