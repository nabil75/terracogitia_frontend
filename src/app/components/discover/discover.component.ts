import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  AfterViewInit,
  Component,
  ElementRef,
  effect,
  HostListener,
  inject,
  Injector,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender
} from '@angular/core';
import {
  CdkDragEnd,
  CdkDragMove,
  DragDropModule
} from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import * as d3 from 'd3';

import {
  ApiService,
  DiscoverActivityPayload,
  ThemeAdminDto,
  SavedDiscoverPropositionRecord,
  StoreSavedDiscoverPropositionPayload,
  OrdreLogiqueQuestionsPayload,
  OrdreLogiqueQuestionsResponseEnriched,
  LearningTimelineStepDto
} from '../../api/api.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';
import { SpinnerComponent } from "../../shared/spinner/spinner.component";
import { DisciplineService } from '../../shared/services/discipline.service';
import { ThemeService } from '../../shared/services/theme.service';
import {
  assignQuestionNumbers,
  extractIdFromOrdreLabel,
  formatQ,
  questionOrdreLabel,
  sortByQuestionId,
  stripOrdreLabelIdSuffix
} from '../../shared/utils/question-order.util';
import { DiscoverAnswerBodyComponent } from '../../shared/discover/discover-answer-body.component';
import {
  DiscoverImageLink,
  isDiscoverKeywordsArray,
  parseDiscoverImageLinks,
  parseDiscoverKeywords,
  sanitizeDiscoverImageLinks,
  stripSectionDisplayText
} from '../../shared/discover/discover-image-links.util';

interface DiscoverQuestion {
  id: string;
  /** Numéro fixe Q1…Qn (rang par `id_question` croissant). */
  qNum: number;
  label: string;
  /** Texte de référence / proposition renvoyé par l’API (champ variable selon le backend). */
  proposedAnswer: string;
  /** Indice de famille (1…6 max côté regroupement IA) ; `null` si non renseigné en base. */
  groupe: number | null;
  /** Libellé de famille (colonne `libelle_groupe`) ; vide si non renvoyé par l’API. */
  libelleGroupe: string | null;
}

interface DiscoverMapTheme {
  id: string;
  label: string;
  description: string;
  subThemes: DiscoverMapSubTheme[];
}

interface DiscoverMapSubTheme {
  id: string;
  label: string;
  description: string;
}

interface MindMapNode {
  id: string;
  kind: 'root' | 'theme' | 'path';
  /** Present when kind is theme or path */
  themeId?: string;
  pathId?: string;
  label: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
  index?: number;
}

interface MindMapLink {
  source: MindMapNode | string;
  target: MindMapNode | string;
  kind: 'root-theme' | 'theme-path';
  themeId: string;
  pathId?: string;
}

interface OrdreLogiqueRelationLink {
  source: string;
  target: string;
  justification: string;
}

interface LearningTimelineStepView {
  /** Position sur la timeline (1…n, ordre API / `qNum`). */
  step: number;
  /** Numéro fixe Q1…Qn. */
  qNum: number;
  id: string;
  /** Libellé brut de la question (tooltip). */
  label: string;
}

/** Ligne normalisée issue de `liens_plats` (API enrichie). */
interface OrdreLogiqueFlatRowView {
  prereq: string;
  question: string;
  justification: string;
}

interface OrdreLogiqueParcoursPrereqView {
  id?: string;
  label: string;
  label_court?: string;
  justification: string;
}

interface OrdreLogiqueParcoursSectionView {
  questionLabel: string;
  questionId?: string;
  prereqs: OrdreLogiqueParcoursPrereqView[];
}

interface SavedDiscoverPropositionEntry {
  id: string;
  dbId?: number;
  questionId: string;
  /** Horodatage affiché tel que stocké en base (JJ/MM/AAAA HH:MM). */
  dateCreation: string;
  createdAt: number;
  statutCurrent: boolean;
  notes: string;
  payload: SavedDiscoverPayload;
}

interface SavedDiscoverPayload {
  discoveredProposition: string;
  discoveredKeyPoints: string[];
  discoveredStructured: DiscoverStructuredProposition | null;
}

/** Sous-partie d’un bloc Analyse ou Exercice (une entrée de l’objet JSON). */
interface DiscoverSubsection {
  title: string;
  text: string;
  /** Titre redondant avec la section parente (ex. clé « Analyse » sous le bloc Analyse). */
  omitTitle?: boolean;
}

/**
 * Bloc texte simple ou objet dont chaque clé devient une sous-section titrée.
 */
type DiscoverRichBlock =
  | { mode: 'plain'; text: string }
  | { mode: 'keyed'; subsections: DiscoverSubsection[] };

/** Proposition structurée renvoyée par discovering (clés alignées sur le backend). */
interface DiscoverStructuredProposition {
  introduction: string;
  contexte: string;
  contexteKeywords: string[];
  contexteImageLinks: DiscoverImageLink[];
  analyse: DiscoverRichBlock;
  analyseKeywords: string[];
  analyseImageLinks: DiscoverImageLink[];
  conclusion: string;
  exercice: DiscoverRichBlock;
}

type DiscoverSectionViewRow =
  | { kind: 'simple'; titleKey: string; text: string; imageLinks: DiscoverImageLink[] }
  | {
      kind: 'nested';
      titleKey: string;
      subsections: DiscoverSubsection[];
      imageLinks: DiscoverImageLink[];
    };

/** Plafond d’indices de famille affichés (aligné sur le prompt backend Mistral, ex. 6 familles max). */
const REGROUPEMENT_GROUPE_INDEX_MAX = 6;

const DISCOVER_MIND_MAP_HEIGHT_STORAGE_KEY = 'terracogitia.discover.mindMapHeightPx';
const DISCOVER_QUESTIONS_LIST_MODE_STORAGE_KEY =
  'terracogitia.discover.questionsListModeBySubtheme';

/** Ordre d’affichage de la colonne « Questions du parcours ». */
type QuestionsListDisplayMode = 'backend' | 'sequence' | 'group';
type QuestionsListPersistedMode = 'sequence' | 'group';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    TransverseRailComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
    MatSnackBarModule,
    SpinnerComponent,
    DiscoverAnswerBodyComponent
],
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss'
})
export class DiscoverComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Comme review : bornes des séparateurs redimensionnables (colonnes en %). */
  private readonly minColumnPercent = 18;
  private readonly minDividerGapPercent = 14;

  @ViewChild('discoverLayout') discoverLayoutRef?: ElementRef<HTMLElement>;
  @ViewChild('mindMapHost') mindMapHost?: ElementRef<HTMLDivElement>;
  @ViewChild('learningTimelineHost') learningTimelineHost?: ElementRef<HTMLDivElement>;

  /** Positions des séparateurs en % de la largeur totale du layout (0–100). */
  divider1Percent = 30;
  divider2Percent = 62;
  isResizingPanels = false;

  /** Hauteur explicite de la carte mentale (px) ; `null` = min-height CSS par défaut. */
  mindMapHostHeightPx: number | null = null;
  isResizingMindMap = false;
  private readonly mindMapMinHeightPx = 220;
  private readonly mindMapMaxHeightRatio = 0.85;

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly disciplineService = inject(DisciplineService);
  private readonly themeService = inject(ThemeService);
  private readonly injector = inject(Injector);
  private readonly ngZone = inject(NgZone);
  private querySub?: Subscription;
  private langSub?: Subscription;
  private firstDisciplineRun = true;

  private mindMapSimulation?: d3.Simulation<MindMapNode, undefined>;
  private mindMapSvg?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private mindMapZoom?: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private mindMapLinks?: d3.Selection<SVGLineElement, MindMapLink, SVGGElement, unknown>;
  private mindMapNodes?: d3.Selection<SVGGElement, MindMapNode, SVGGElement, unknown>;
  private mindMapResizeObs?: ResizeObserver;
  private mindMapResizeRaf = 0;

  /**
   * Carte mentale : filtre sur un seul thème (masque les autres au prochain rendu) + zoom ciblé.
   * Distinct de la sélection parcours (URL / panneaux).
   */
  mindMapDetailThemeId: string | null = null;

  /** Texte d’aide carte (zoom, clic…) : masqué jusqu’au clic sur le bouton à côté du titre. */
  mindMapZoomHintVisible = false;

  /** Zone carte (chargement, graphe…) : repliable via le caret en barre du haut. */
  mindMapPanelBodyVisible = true;

  /** Panneau timeline d’apprentissage (sous la carte), repliable comme la carte mentale. */
  timelinePanelBodyVisible = true;

  /** Réponse ordre logique (cache `subtheme.timeline` ou Mistral). */
  learningOrderLoading = false;
  learningOrderRegenerating = false;
  learningOrderError = '';
  ordreLogiqueEnriched: OrdreLogiqueQuestionsResponseEnriched | null = null;
  /** Étapes affichées sur la timeline D3 (ordre suggéré si disponible). */
  learningOrderTimelineSteps: LearningTimelineStepView[] = [];
  /** Séquence suggérée (ordre des ids) avant affichage. */
  private learningOrderSuggestedSteps: LearningTimelineStepView[] = [];
  /** True si prérequis IA exploitables et séquence calculée. */
  learningOrderHasSuggestion = false;
  /** True si l’ordre suggéré est identique à l’ordre API (Q1→Qn par `id_question`). */
  learningOrderMatchesApiOrder = true;
  /** True si chargé depuis `subtheme.timeline` (pas d’appel Mistral). */
  timelineFromCache = false;
  /**
   * True si le graphe comporte un cycle ou des nœuds non triables : la fin de la séquence
   * complète au mieux selon l’ordre du parcours.
   */
  learningOrderSequencePartial = false;
  private learningOrderSub?: Subscription;
  private timelineResizeObs?: ResizeObserver;
  private timelineResizeRaf = 0;
  /** Survol d’un nœud timeline : aperçu des libellés prérequis uniquement. */
  timelineHoverStepId: string | null = null;
  /** Clic sur un nœud : panneau scrollable avec justifications. */
  timelineDetailStepId: string | null = null;
  private timelineHoverHideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly prereqsByQuestionId = new Map<string, OrdreLogiqueParcoursPrereqView[]>();

  /** Recherche globale sur les libellés des questions des parcours (carte mentale). */
  mindMapSearchQuery = '';
  /** True pendant le chargement des questions de tous les parcours pour l’index de recherche. */
  mindMapSearchIndexing = false;

  /** IDs parcours dont au moins une question contient un des termes recherchés. */
  readonly mindMapSearchMatchPathIds = new Set<string>();

  /**
   * Incrémenté quand l’ensemble des correspondances recherche change, pour forcer le re-rendu
   * des libellés surlignés (la mutation du Set seule n’est pas détectée par le template).
   */
  mindMapSearchMatchStamp = 0;

  private readonly pathQuestionsSearchBlob = new Map<string, string>();
  private mindMapSearchIndexSub?: Subscription;
  private mindMapSearchDebounceTimer?: ReturnType<typeof setTimeout>;

  private mindMapHoveredNodeId: string | null = null;
  private mindMapLastNodes: MindMapNode[] = [];
  private mindMapLastLinks: MindMapLink[] = [];

  /** Session parcours pour l'évaluation avancée (entrée / sortie / durée). */
  private activeSubthemeSessionId: number | null = null;
  private trackedSubthemeId: string | null = null;

  selectedThemeId = '';
  selectedThemeLabel = '';
  selectedSubThemeId = '';
  selectedSubThemeLabel = '';
  mapThemes: DiscoverMapTheme[] = [];
  loadingMap = false;
  loadMapError = '';

  questions: DiscoverQuestion[] = [];
  /** Ordre API (réponse `getQuestionsBySubTheme`), avant tri d’affichage groupe / séquence. */
  private questionsInBackendOrder: DiscoverQuestion[] = [];
  questionsListDisplayMode: QuestionsListDisplayMode = 'backend';
  selectedQuestionId: string | null = null;
  loadingQuestions = false;
  /** Appel `regroupement_questions_parcours` en cours. */
  regroupementQuestionsBusy = false;
  loadQuestionsError = '';

  /** Brouillon IA non encore enregistré (remplace temporairement la proposition courante). */
  draftPayload: SavedDiscoverPayload | null = null;
  savedPropositionsByQuestionId: Record<string, SavedDiscoverPropositionEntry[]> = {};
  loadingSavedPropositions = false;
  savedPropositionsError = '';
  savingSavedProposition = false;
  deletingSavedPropositionId: string | null = null;
  settingCurrentPropositionId: string | null = null;
  isGenerating = false;

  personalNotes = '';
  savingPersonalNotes = false;
  personalNotesError = '';
  private personalNotesSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private personalNotesDirty = false;

  /** Menu clic droit : sélection → Wikipédia (nouvel onglet). */
  wikiContextMenuOpen = false;
  wikiContextMenuX = 0;
  wikiContextMenuY = 0;
  wikiContextMenuSelection = '';

  private readonly reloadMindMapOnDiscipline = effect(() => {
    this.disciplineService.selectedDisciplineId();
    if (this.firstDisciplineRun) {
      this.firstDisciplineRun = false;
      return;
    }
    this.loadMentalMap();
  });

  /** Re-dessine la carte D3 quand le thème UI clair/sombre change. */
  private readonly reMindMapOnUiTheme = effect(() => {
    this.themeService.activeTheme();
    if (!this.loadingMap && this.mapThemes.length > 0) {
      this.scheduleMindMapRender();
    }
    if (this.learningOrderTimelineSteps.length > 0 && this.timelinePanelBodyVisible) {
      this.scheduleLearningTimelineRender();
    }
  });

  ngOnInit(): void {
    this.restoreMindMapHeightFromStorage();
    this.loadMentalMap();
    this.langSub = this.translate.onLangChange.subscribe(() => {
      if (!this.loadingMap && this.mapThemes.length > 0) {
        this.scheduleMindMapRender();
      }
    });
    this.querySub = this.route.queryParamMap.subscribe((q) => {
      const theme = q.get('theme') ?? '';
      const sub = q.get('subTheme') ?? '';
      const themeLabel = q.get('themeLabel') ?? '';
      const subLabel = q.get('subThemeLabel') ?? '';
      if (theme && sub) {
        this.selectedThemeId = theme;
        this.selectedSubThemeId = sub;
        const fallbackLabels = this.findMapLabels(theme, sub);
        this.selectedThemeLabel = themeLabel || fallbackLabels.themeLabel;
        this.selectedSubThemeLabel = subLabel || fallbackLabels.subThemeLabel;
        this.loadQuestionsForSubTheme();
        this.updateMindMapHighlight();
      }
    });
  }

  ngAfterViewInit(): void {
    this.setupMindMapResizeObserver();
    if (this.mapThemes.length > 0 && !this.loadingMap) {
      this.scheduleMindMapRender();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.wikiContextMenuOpen) {
      ev.preventDefault();
      this.closeWikiContextMenu();
      return;
    }
  }

  ngOnDestroy(): void {
    this.endActiveSubthemeSession();
    this.flushPersonalNotesSave();
    this.querySub?.unsubscribe();
    this.langSub?.unsubscribe();
    this.mindMapSearchIndexSub?.unsubscribe();
    if (this.mindMapSearchDebounceTimer) clearTimeout(this.mindMapSearchDebounceTimer);
    this.mindMapSimulation?.stop();
    this.mindMapResizeObs?.disconnect();
    if (this.mindMapResizeRaf) cancelAnimationFrame(this.mindMapResizeRaf);
    this.learningOrderSub?.unsubscribe();
    this.timelineResizeObs?.disconnect();
    if (this.timelineResizeRaf) cancelAnimationFrame(this.timelineResizeRaf);
    this.cancelTimelineHoverHide();
  }

  /** Libellé discipline pour le titre (hors fallback « toutes disciplines »). */
  mindMapDisciplineLabelTrimmed(): string | null {
    const raw = this.disciplineService.selectedDisciplineLabel();
    const trimmed = raw?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
  }

  mindMapPanelTitleAriaLabel(): string {
    const d = this.mindMapDisciplineLabelTrimmed();
    return d
      ? this.translate.instant('discover.mentalMapTitle', { discipline: d })
      : this.translate.instant('discover.mentalMapTitleNoSelection');
  }

  onDividerDragStart(): void {
    this.isResizingPanels = true;
  }

  onFirstDividerDragMoved(event: CdkDragMove): void {
    const layout = this.discoverLayoutRef?.nativeElement;
    if (!layout) return;

    const rect = layout.getBoundingClientRect();
    const relativeX = event.pointerPosition.x - rect.left;
    const percentage = (relativeX / rect.width) * 100;
    const maxP1 = this.divider2Percent - this.minDividerGapPercent;
    this.divider1Percent = this.clampPercent(percentage, this.minColumnPercent, maxP1);
    event.source.reset();
  }

  onSecondDividerDragMoved(event: CdkDragMove): void {
    const layout = this.discoverLayoutRef?.nativeElement;
    if (!layout) return;

    const rect = layout.getBoundingClientRect();
    const relativeX = event.pointerPosition.x - rect.left;
    const percentage = (relativeX / rect.width) * 100;
    const minP2 = this.divider1Percent + this.minDividerGapPercent;
    const maxP2 = 100 - this.minColumnPercent;
    this.divider2Percent = this.clampPercent(percentage, minP2, maxP2);
    event.source.reset();
  }

  onDividerDragEnded(event: CdkDragEnd): void {
    this.isResizingPanels = false;
    event.source.reset();
  }

  get showMindMapResizeHandle(): boolean {
    return (
      this.mindMapPanelBodyVisible &&
      !this.loadingMap &&
      !this.loadMapError &&
      this.mapThemes.length > 0
    );
  }

  private restoreMindMapHeightFromStorage(): void {
    try {
      const raw = localStorage.getItem(DISCOVER_MIND_MAP_HEIGHT_STORAGE_KEY);
      if (raw == null) return;
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      this.mindMapHostHeightPx = this.clampMindMapHeightPx(Math.round(n));
    } catch {
      /* localStorage indisponible */
    }
  }

  private persistMindMapHeightToStorage(): void {
    if (this.mindMapHostHeightPx == null) return;
    try {
      localStorage.setItem(
        DISCOVER_MIND_MAP_HEIGHT_STORAGE_KEY,
        String(this.mindMapHostHeightPx)
      );
    } catch {
      /* localStorage indisponible */
    }
  }

  private clampMindMapHeightPx(height: number): number {
    const max = Math.round(window.innerHeight * this.mindMapMaxHeightRatio);
    return Math.min(max, Math.max(this.mindMapMinHeightPx, height));
  }

  onMindMapResizeStart(): void {
    this.isResizingMindMap = true;
  }

  onMindMapResizeMoved(event: CdkDragMove): void {
    const host = this.mindMapHost?.nativeElement;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const height = event.pointerPosition.y - rect.top;
    this.mindMapHostHeightPx = this.clampMindMapHeightPx(Math.round(height));
    event.source.reset();
  }

  onMindMapResizeEnded(event: CdkDragEnd): void {
    this.isResizingMindMap = false;
    event.source.reset();
    this.persistMindMapHeightToStorage();
  }

  selectQuestion(id: string): void {
    this.flushPersonalNotesSave();
    this.selectedQuestionId = id;
    this.draftPayload = null;
    this.personalNotes = '';
    this.personalNotesDirty = false;
    this.savedPropositionsError = '';
    this.loadSavedPropositionsForQuestion(id);
  }

  onPersonalNotesInput(): void {
    this.personalNotesDirty = true;
    if (this.personalNotesSaveTimer) clearTimeout(this.personalNotesSaveTimer);
    this.personalNotesSaveTimer = setTimeout(() => this.persistPersonalNotes(), 800);
  }

  private flushPersonalNotesSave(): void {
    if (this.personalNotesSaveTimer) {
      clearTimeout(this.personalNotesSaveTimer);
      this.personalNotesSaveTimer = null;
    }
    if (this.personalNotesDirty && this.selectedQuestionId) {
      this.persistPersonalNotes();
    }
  }

  private syncPersonalNotesFromCurrentEntry(): void {
    const current = this.currentSavedEntry;
    if (current) {
      this.personalNotes = current.notes ?? '';
    } else if (!this.personalNotesDirty) {
      this.personalNotes = '';
    }
    this.personalNotesDirty = false;
  }

  private persistPersonalNotes(): void {
    if (!this.selectedQuestionId || !this.personalNotesDirty) return;
    const idQuestion = this.parseIntegerId(this.selectedQuestionId);
    if (idQuestion === null) return;

    this.savingPersonalNotes = true;
    this.personalNotesError = '';
    const questionId = this.selectedQuestionId;
    this.api.upsertQuestionPropositionNotes(idQuestion, this.personalNotes).subscribe({
      next: (row) => {
        this.personalNotes = row.notes ?? '';
        this.personalNotesDirty = false;
        this.savingPersonalNotes = false;
        if (row.id_proposition != null) {
          this.loadSavedPropositionsForQuestion(questionId);
        }
      },
      error: () => {
        this.savingPersonalNotes = false;
        this.personalNotesError = this.translate.instant('discover.notesSaveError');
      }
    });
  }

  discover(): void {
    if (!this.selectedQuestionId) return;
    const label = this.selectedQuestionLabel();
    this.logDiscoverActivityEvent('proposition_requested');
    this.isGenerating = true;
    this.api.getPropositionForQuestion(label, this.selectedSubThemeLabel).subscribe({
      next: (response) => {
        const payload = this.buildDiscoverPayloadFromApiResponse(response);
        const hasContent = this.savedPayloadHasContent(payload);
        this.isGenerating = false;
        if (!hasContent) {
          this.snackBar.open(
            this.translate.instant('discover.propositionUnexpectedShape'),
            this.translate.instant('common.close'),
            { duration: 6000 }
          );
          return;
        }
        this.draftPayload = payload;
        if (this.draftPayloadHasExercise(payload)) {
          this.logDiscoverActivityEvent('exercise_in_proposition');
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

  private clearLearningOrderUi(): void {
    this.ordreLogiqueEnriched = null;
    this.learningOrderTimelineSteps = [];
    this.learningOrderSuggestedSteps = [];
    this.learningOrderHasSuggestion = false;
    this.learningOrderMatchesApiOrder = true;
    this.timelineFromCache = false;
    this.learningOrderSequencePartial = false;
    this.timelineHoverStepId = null;
    this.timelineDetailStepId = null;
    this.cancelTimelineHoverHide();
    this.prereqsByQuestionId.clear();
    this.clearLearningTimelineDom();
  }

  private clearLearningOrderAfterQuestionsError(): void {
    this.learningOrderSub?.unsubscribe();
    this.learningOrderLoading = false;
    this.learningOrderRegenerating = false;
    this.clearLearningOrderUi();
    this.learningOrderError = '';
  }

  private normalizeTimelineSteps(raw: unknown): LearningTimelineStepView[] {
    if (!Array.isArray(raw)) return [];
    const out: LearningTimelineStepView[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as LearningTimelineStepDto & Record<string, unknown>;
      const rawLabel = String(o.label ?? o['libelle'] ?? '').trim();
      if (!rawLabel) continue;
      const id = String(o.id ?? o['id_question'] ?? '').trim();
      const step = Number(o.step);
      const qNum = this.qNumForQuestionId(id) || this.qNumFromOrdreLabel(rawLabel);
      out.push({
        step: Number.isFinite(step) && step > 0 ? Math.round(step) : out.length + 1,
        qNum,
        id: id || String(out.length + 1),
        label: this.plainLabelFromOrdreLabel(rawLabel)
      });
    }
    return out.map((s, i) => ({ ...s, step: i + 1 }));
  }

  private qNumForQuestionId(id: string): number {
    const q = this.questions.find((x) => x.id === id);
    return q?.qNum ?? 0;
  }

  private qNumFromOrdreLabel(label: string): number {
    const m = /^Q(\d+)\b/i.exec(label.trim());
    if (!m) return 0;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  private plainLabelFromOrdreLabel(label: string): string {
    const t = label.trim();
    const m = /^Q\d+\s*[-–—]\s*/i.exec(t);
    return m ? t.slice(m[0].length).trim() : t;
  }

  /** Ordre de référence du parcours : Q1…Qn par `id_question`. */
  private apiTimelineSteps(): LearningTimelineStepView[] {
    return this.questionsInQNumOrder().map((q, i) => ({
      step: i + 1,
      qNum: q.qNum,
      id: q.id,
      label: q.label
    }));
  }

  private sequenceIdsMatchApiOrder(ids: string[]): boolean {
    const apiIds = this.questionsInQNumOrder().map((q) => q.id);
    if (ids.length !== apiIds.length) return false;
    return ids.every((id, i) => id === apiIds[i]);
  }

  /** Affichage timeline + indicateurs (suggéré vs ordre API). */
  private refreshLearningOrderTimelineState(suggested: LearningTimelineStepView[]): void {
    if (this.learningOrderStructureEmpty || suggested.length === 0) {
      this.learningOrderHasSuggestion = false;
      this.learningOrderMatchesApiOrder = true;
      this.learningOrderSuggestedSteps = [];
      this.learningOrderTimelineSteps = this.apiTimelineSteps();
      this.reapplyQuestionsListDisplayOrder();
      return;
    }
    this.learningOrderSuggestedSteps = suggested;
    this.learningOrderHasSuggestion = true;
    this.learningOrderMatchesApiOrder = this.sequenceIdsMatchApiOrder(
      suggested.map((s) => s.id)
    );
    this.learningOrderTimelineSteps = suggested;
    this.reapplyQuestionsListDisplayOrder();
  }

  /** True si la timeline suit un ordre suggéré distinct de Q1→Qn. */
  get learningOrderShowsSuggestedPath(): boolean {
    return this.learningOrderHasSuggestion && !this.learningOrderMatchesApiOrder;
  }

  private buildSuggestedStepsFromRelations(): LearningTimelineStepView[] {
    const ordered = this.questionsInQNumOrder();
    const labelList = ordered.map((q) => this.ordreLabelForQuestion(q));
    const byLabel = new Map(ordered.map((q) => [this.ordreLabelForQuestion(q), q]));
    const edges = this.learningOrderEdgesForSequence();
    if (edges.length === 0) return [];
    const { order } = DiscoverComponent.topologicalSortQuestionLabels(labelList, edges);
    return order
      .map((lbl, i) => {
        const q = byLabel.get(lbl);
        if (!q) return null;
        return { step: i + 1, qNum: q.qNum, id: q.id, label: q.label };
      })
      .filter((s): s is LearningTimelineStepView => s != null);
  }

  private timelineMatchesCachedResponse(res: OrdreLogiqueQuestionsResponseEnriched): boolean {
    const seq = res.sequence;
    if (!Array.isArray(seq) || seq.length === 0) return false;
    const cachedIds = [...seq].map((s) => String(s.id)).sort();
    const currentIds = this.questions.map((q) => String(q.id)).sort();
    if (cachedIds.length !== currentIds.length) return false;
    return cachedIds.every((id, i) => id === currentIds[i]);
  }

  private applyOrdreLogiqueEnriched(data: OrdreLogiqueQuestionsResponseEnriched): void {
    const d = data as Record<string, unknown>;
    const looksEnriched =
      'relations_par_libelle' in d || 'liens_plats' in d || 'liste_par_parcours' in d || 'sequence' in d;
    this.ordreLogiqueEnriched = looksEnriched
      ? data
      : ({ relations_par_libelle: data } as OrdreLogiqueQuestionsResponseEnriched);
    this.timelineFromCache = !!data.from_cache;
    this.timelineHoverStepId = null;
    this.timelineDetailStepId = null;
    this.rebuildPrereqsByQuestionId();
    if (this.learningOrderStructureEmpty) {
      this.learningOrderSequencePartial = false;
      this.refreshLearningOrderTimelineState([]);
    } else {
      const fromApi = this.normalizeTimelineSteps(data.sequence);
      if (fromApi.length > 0) {
        this.learningOrderSequencePartial = !!data.partial;
        this.refreshLearningOrderTimelineState(fromApi);
      } else {
        this.recomputeLearningOrderTimelineFromRelations();
      }
    }
    afterNextRender(
      () => {
        this.setupLearningTimelineResizeObserver();
        this.scheduleLearningTimelineRender();
      },
      { injector: this.injector }
    );
  }

  /** True si aucune relation de prérequis exploitable pour la séquence. */
  get learningOrderStructureEmpty(): boolean {
    const r = this.getRelationsRecordForGraph();
    return r == null || Object.keys(r).length === 0;
  }

  private static pickOrdreStr(o: Record<string, unknown>, keys: string[]): string {
    for (const k of keys) {
      if (!(k in o)) continue;
      const v = o[k];
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v).trim();
        if (s) return s;
      }
    }
    return '';
  }

  private normalizeLienPlatRow(row: unknown): OrdreLogiqueFlatRowView | null {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const o = row as Record<string, unknown>;
    const prereq = DiscoverComponent.pickOrdreStr(o, [
      'libelle_prerequis',
      'libelle_prérequis',
      'label_prerequis',
      'prerequis_libelle',
      'libelle_pre_requis',
      'libelle_préalable',
      'libelle_prerequisite',
      'source',
      'from',
      'prereq',
      'prérequis',
      'prerequis'
    ]);
    const question = DiscoverComponent.pickOrdreStr(o, [
      'libelle_question',
      'label_question',
      'question_libelle',
      'libelle_question_cible',
      'question_cible',
      'cible',
      'target',
      'question',
      'to',
      'dependant',
      'dependante',
      'question_dependante'
    ]);
    const justification = DiscoverComponent.pickOrdreStr(o, [
      'justification',
      'raison',
      'motif',
      'explication'
    ]);
    if (!prereq || !question) return null;
    return { prereq, question, justification };
  }

  private normalizeParcoursItem(item: unknown): OrdreLogiqueParcoursSectionView | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const o = item as Record<string, unknown>;
    const questionLabel =
      DiscoverComponent.pickOrdreStr(o, [
        'libelle_question',
        'label_question',
        'question',
        'libelle',
        'label',
        'titre',
        'title',
        'question_libelle'
      ]) || DiscoverComponent.pickOrdreStr(o, ['id_question', 'id', 'question_id']);
    if (!questionLabel) return null;
    const questionId =
      DiscoverComponent.pickOrdreStr(o, ['id_question', 'question_id', 'id']) || undefined;
    const rawPrereqs = (o['prerequis'] ??
      o['pre-requis'] ??
      o['pre_requis'] ??
      o['prérequis'] ??
      []) as unknown;
    if (!Array.isArray(rawPrereqs)) return { questionLabel, questionId, prereqs: [] };
    const prereqs: OrdreLogiqueParcoursPrereqView[] = [];
    for (const p of rawPrereqs) {
      if (!p || typeof p !== 'object') continue;
      const po = p as Record<string, unknown>;
      const label = DiscoverComponent.pickOrdreStr(po, [
        'label',
        'libelle',
        'libelle_prerequis',
        'titre',
        'title'
      ]);
      const id = DiscoverComponent.pickOrdreStr(po, ['id', 'id_prerequis', 'id_question']) || undefined;
      const justification = DiscoverComponent.pickOrdreStr(po, ['justification', 'raison', 'motif']);
      const labelCourt = DiscoverComponent.pickOrdreStr(po, ['label_court', 'labelCourt']);
      if (label) {
        prereqs.push({
          id,
          label,
          label_court: labelCourt || undefined,
          justification
        });
      }
    }
    return { questionLabel, questionId, prereqs };
  }

  private static ordreLabelFold(label: string): string {
    return stripOrdreLabelIdSuffix(label).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /** Rapproche un libellé Mistral (éventuellement avec « (id=…) ») du libellé parcours. */
  private resolveOrdreLabelToCanonical(mistralLabel: string): string | null {
    const trimmed = mistralLabel.trim();
    if (!trimmed) return null;
    const idFromSuffix = extractIdFromOrdreLabel(trimmed);
    if (idFromSuffix) {
      const q = this.questions.find((x) => x.id === idFromSuffix);
      if (q) return this.ordreLabelForQuestion(q);
    }
    const fold = DiscoverComponent.ordreLabelFold(trimmed);
    for (const q of this.questionsInQNumOrder()) {
      const ours = this.ordreLabelForQuestion(q);
      if (DiscoverComponent.ordreLabelFold(ours) === fold) return ours;
    }
    return null;
  }

  private rebuildPrereqsByQuestionId(): void {
    this.prereqsByQuestionId.clear();
    const e = this.ordreLogiqueEnriched;
    if (!e) return;

    const rawListe = e.liste_par_parcours ?? [];
    for (const item of rawListe) {
      const section = this.normalizeParcoursItem(item);
      if (!section || section.prereqs.length === 0) continue;
      let qid = section.questionId;
      if (!qid) {
        qid = extractIdFromOrdreLabel(section.questionLabel);
      }
      if (!qid) {
        const canon = this.resolveOrdreLabelToCanonical(section.questionLabel);
        if (canon) {
          const q = this.questionsInQNumOrder().find((x) => this.ordreLabelForQuestion(x) === canon);
          qid = q?.id;
        }
      }
      if (qid) {
        this.prereqsByQuestionId.set(String(qid), section.prereqs);
      }
    }

    if (this.prereqsByQuestionId.size > 0) return;

    const rows = (e.liens_plats ?? [])
      .map((row) => this.normalizeLienPlatRow(row))
      .filter((x): x is OrdreLogiqueFlatRowView => x !== null);
    for (const r of rows) {
      const targetCanon = this.resolveOrdreLabelToCanonical(r.question);
      if (!targetCanon) continue;
      const tq = this.questionsInQNumOrder().find((x) => this.ordreLabelForQuestion(x) === targetCanon);
      if (!tq) continue;
      const list = this.prereqsByQuestionId.get(tq.id) ?? [];
      const srcCanon = this.resolveOrdreLabelToCanonical(r.prereq);
      const sq = srcCanon
        ? this.questionsInQNumOrder().find((x) => this.ordreLabelForQuestion(x) === srcCanon)
        : undefined;
      list.push({
        id: sq?.id,
        label: r.prereq,
        justification: r.justification
      });
      this.prereqsByQuestionId.set(tq.id, list);
    }
  }

  getTimelinePrereqs(stepId: string): OrdreLogiqueParcoursPrereqView[] {
    return this.prereqsByQuestionId.get(stepId) ?? [];
  }

  /** Libellé prérequis pour l’UI (texte complet, sans suffixe « (id=…) »). */
  displayPrereqLabel(fullLabel: string): string {
    return stripOrdreLabelIdSuffix(fullLabel).trim();
  }

  get timelineDetailStep(): LearningTimelineStepView | null {
    if (!this.timelineDetailStepId) return null;
    return this.learningOrderTimelineSteps.find((s) => s.id === this.timelineDetailStepId) ?? null;
  }

  get timelineHoverPreview(): { step: LearningTimelineStepView; lines: string[] } | null {
    if (!this.timelineHoverStepId || this.timelineDetailStepId) return null;
    const step = this.learningOrderTimelineSteps.find((s) => s.id === this.timelineHoverStepId);
    if (!step) return null;
    const prereqs = this.getTimelinePrereqs(step.id);
    if (prereqs.length === 0) {
      return { step, lines: [this.translate.instant('discover.timelinePrereqNone')] };
    }
    return {
      step,
      lines: prereqs.map((p) => this.displayPrereqLabel(p.label))
    };
  }

  closeTimelinePrereqDetail(): void {
    this.timelineDetailStepId = null;
    this.scheduleLearningTimelineRender();
  }

  private cancelTimelineHoverHide(): void {
    if (this.timelineHoverHideTimer) {
      clearTimeout(this.timelineHoverHideTimer);
      this.timelineHoverHideTimer = null;
    }
  }

  private scheduleTimelineHoverHide(stepId?: string): void {
    this.cancelTimelineHoverHide();
    this.timelineHoverHideTimer = setTimeout(() => {
      this.timelineHoverHideTimer = null;
      if (stepId != null) {
        if (this.timelineHoverStepId === stepId) {
          this.timelineHoverStepId = null;
        }
      } else {
        this.timelineHoverStepId = null;
      }
    }, 220);
  }

  onTimelineNodeEnter(stepId: string): void {
    this.cancelTimelineHoverHide();
    this.timelineHoverStepId = stepId;
  }

  onTimelineNodeLeave(stepId: string): void {
    this.scheduleTimelineHoverHide(stepId);
  }

  onTimelineHoverBandEnter(stepId: string): void {
    this.cancelTimelineHoverHide();
    this.timelineHoverStepId = stepId;
  }

  onTimelineHoverBandLeave(): void {
    this.scheduleTimelineHoverHide();
  }

  openTimelinePrereqDetail(stepId: string): void {
    if (this.getTimelinePrereqs(stepId).length === 0) return;
    this.cancelTimelineHoverHide();
    this.timelineDetailStepId = stepId;
    this.timelineHoverStepId = null;
    this.scheduleLearningTimelineRender();
  }

  onTimelineNodeClick(stepId: string): void {
    if (this.getTimelinePrereqs(stepId).length === 0) return;
    this.timelineDetailStepId = this.timelineDetailStepId === stepId ? null : stepId;
    this.cancelTimelineHoverHide();
    this.timelineHoverStepId = null;
    this.scheduleLearningTimelineRender();
  }

  private buildRelationsFromLiens(rows: OrdreLogiqueFlatRowView[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      const q = r.question.trim();
      if (!q) continue;
      if (!out[q]) out[q] = { 'pre-requis': [] as unknown[] };
      const entry = out[q] as Record<string, unknown>;
      const list = (entry['pre-requis'] ?? entry['prerequis']) as unknown[];
      if (!Array.isArray(list)) continue;
      list.push({ label: r.prereq, justification: r.justification });
    }
    return out;
  }

  private buildRelationsFromSections(sections: OrdreLogiqueParcoursSectionView[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const s of sections) {
      const q = s.questionLabel.trim();
      if (!q) continue;
      out[q] = {
        'pre-requis': s.prereqs.map((p) => ({
          label: p.label,
          justification: p.justification
        }))
      };
    }
    return out;
  }

  private getRelationsRecordForGraph(): Record<string, unknown> | null {
    const e = this.ordreLogiqueEnriched;
    if (!e) return null;
    const rel = e.relations_par_libelle;
    if (
      rel &&
      typeof rel === 'object' &&
      !Array.isArray(rel) &&
      Object.keys(rel as object).length > 0
    ) {
      return rel as Record<string, unknown>;
    }
    const rawLiens = e.liens_plats ?? [];
    const rows = rawLiens
      .map((row) => this.normalizeLienPlatRow(row))
      .filter((x): x is OrdreLogiqueFlatRowView => x !== null);
    if (rows.length > 0) {
      return this.buildRelationsFromLiens(rows);
    }
    const rawListe = e.liste_par_parcours ?? [];
    const sections = rawListe
      .map((item) => this.normalizeParcoursItem(item))
      .filter((x): x is OrdreLogiqueParcoursSectionView => x !== null);
    if (sections.length > 0) {
      return this.buildRelationsFromSections(sections);
    }
    return null;
  }

  /**
   * Arêtes « prérequis → question » : `source` doit être traité avant `target`.
   * Ne garde que les paires dont les deux libellés sont ceux du parcours courant.
   */
  private learningOrderEdgesForSequence(): { source: string; target: string }[] {
    const labelList = this.questionsInQNumOrder().map((q) => this.ordreLabelForQuestion(q));
    const labelSet = new Set(labelList);
    const raw = this.getRelationsRecordForGraph();
    if (!raw || Object.keys(raw).length === 0) return [];
    const links = this.parseOrdreLogiqueRelations(raw);
    const out: { source: string; target: string }[] = [];
    const seen = new Set<string>();
    for (const l of links) {
      const source = l.source.trim();
      const target = l.target.trim();
      if (!source || !target || source === target) continue;
      if (!labelSet.has(source) || !labelSet.has(target)) continue;
      const key = `${source}\0${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source, target });
    }
    return out;
  }

  /**
   * Tri topologique : tout prérequis apparaît avant les questions qui en dépendent.
   * Égalités : ordre d’origine du parcours. Cycle : nœuds restants ajoutés à la fin (parcours).
   */
  private static topologicalSortQuestionLabels(
    labelList: string[],
    edges: { source: string; target: string }[]
  ): { order: string[]; partial: boolean } {
    const nodes = labelList.map((s) => s.trim());
    const rank = new Map<string, number>();
    nodes.forEach((n, i) => rank.set(n, i));
    const indegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of nodes) {
      indegree.set(n, 0);
      adj.set(n, []);
    }
    for (const e of edges) {
      const u = e.source.trim();
      const v = e.target.trim();
      if (!rank.has(u) || !rank.has(v) || u === v) continue;
      adj.get(u)!.push(v);
      indegree.set(v, (indegree.get(v) ?? 0) + 1);
    }
    const order: string[] = [];
    const remaining = new Set(nodes);
    const byRank = (a: string, b: string) =>
      (rank.get(a)! - rank.get(b)!) || a.localeCompare(b, undefined, { sensitivity: 'base' });
    while (remaining.size > 0) {
      const zeros = [...remaining].filter((n) => (indegree.get(n) ?? 0) === 0).sort(byRank);
      if (zeros.length === 0) break;
      for (const n of zeros) {
        order.push(n);
        remaining.delete(n);
        for (const v of adj.get(n) ?? []) {
          indegree.set(v, (indegree.get(v) ?? 0) - 1);
        }
      }
    }
    const partial = remaining.size > 0;
    if (partial) {
      order.push(...[...remaining].sort(byRank));
    }
    return { order, partial };
  }

  private recomputeLearningOrderTimelineFromRelations(): void {
    this.learningOrderSequencePartial = false;
    if (this.questions.length === 0) {
      this.learningOrderTimelineSteps = [];
      this.learningOrderSuggestedSteps = [];
      this.learningOrderHasSuggestion = false;
      this.learningOrderMatchesApiOrder = true;
      return;
    }
    if (!this.ordreLogiqueEnriched || this.learningOrderStructureEmpty) {
      this.refreshLearningOrderTimelineState([]);
      return;
    }
    const labelList = this.questionsInQNumOrder().map((q) => this.ordreLabelForQuestion(q));
    const edges = this.learningOrderEdgesForSequence();
    if (edges.length === 0) {
      this.refreshLearningOrderTimelineState([]);
      return;
    }
    const { partial } = DiscoverComponent.topologicalSortQuestionLabels(labelList, edges);
    this.learningOrderSequencePartial = partial;
    this.refreshLearningOrderTimelineState(this.buildSuggestedStepsFromRelations());
  }

  private buildOrdreLogiquePayload(): OrdreLogiqueQuestionsPayload {
    return {
      id_subtheme: this.selectedSubThemeId,
      questions: this.questionsInQNumOrder().map((q) => ({
        id: q.id,
        label: this.ordreLabelForQuestion(q)
      }))
    };
  }

  /** Charge la timeline depuis la base ou appelle Mistral puis persiste côté API. */
  private scheduleLearningOrderFetch(): void {
    this.learningOrderSub?.unsubscribe();
    this.learningOrderError = '';
    if (!this.selectedSubThemeId || this.questions.length === 0) {
      this.learningOrderLoading = false;
      this.clearLearningOrderUi();
      return;
    }
    this.learningOrderLoading = true;
    const payload = this.buildOrdreLogiquePayload();
    this.learningOrderSub = this.api
      .getSubthemeTimeline(this.selectedSubThemeId)
      .pipe(
        switchMap((cached) =>
          this.timelineMatchesCachedResponse(cached)
            ? of(cached)
            : this.api.ordreLogiqueQuestions(payload, { legacy: false })
        ),
        catchError(() => this.api.ordreLogiqueQuestions(payload, { legacy: false })),
        finalize(() => (this.learningOrderLoading = false))
      )
      .subscribe({
        next: (data) => this.applyOrdreLogiqueEnriched(data),
        error: () => {
          this.clearLearningOrderUi();
          this.learningOrderError = this.translate.instant('discover.learningOrderError');
        }
      });
  }

  regenerateLearningTimeline(): void {
    if (!this.selectedSubThemeId || this.questions.length === 0 || this.learningOrderRegenerating) return;
    this.learningOrderSub?.unsubscribe();
    this.learningOrderRegenerating = true;
    this.learningOrderError = '';
    const payload = this.buildOrdreLogiquePayload();
    this.learningOrderSub = this.api
      .ordreLogiqueQuestions(payload, { legacy: false, forceRefresh: true })
      .pipe(finalize(() => (this.learningOrderRegenerating = false)))
      .subscribe({
        next: (data) => this.applyOrdreLogiqueEnriched(data),
        error: () => {
          this.learningOrderError = this.translate.instant('discover.learningOrderError');
        }
      });
  }

  /** Liens prérequis → question dérivés de la réponse API (pour la séquence). */
  private parseOrdreLogiqueRelations(raw: Record<string, unknown>): OrdreLogiqueRelationLink[] {
    const links: OrdreLogiqueRelationLink[] = [];
    for (const [targetKey, val] of Object.entries(raw)) {
      if (val == null || typeof val !== 'object' || Array.isArray(val)) continue;
      const o = val as Record<string, unknown>;
      const list = (o['pre-requis'] ??
        o['pre_requis'] ??
        o['prerequis'] ??
        o['prérequis'] ??
        []) as unknown[];
      if (!Array.isArray(list)) continue;
      const tk = targetKey.trim();
      const targetCanon = this.resolveOrdreLabelToCanonical(tk);
      if (!targetCanon) continue;
      for (const p of list) {
        if (p == null || typeof p !== 'object') continue;
        const po = p as Record<string, unknown>;
        const src = String(po['label'] ?? po['libelle'] ?? '').trim();
        if (!src) continue;
        const sourceCanon = this.resolveOrdreLabelToCanonical(src);
        if (!sourceCanon || sourceCanon === targetCanon) continue;
        links.push({
          source: sourceCanon,
          target: targetCanon,
          justification: String(po['justification'] ?? '').trim()
        });
      }
    }
    return links;
  }

  private clearLearningTimelineDom(): void {
    const host = this.learningTimelineHost?.nativeElement;
    if (host) d3.select(host).selectAll('*').remove();
  }

  private setupLearningTimelineResizeObserver(): void {
    const host = this.learningTimelineHost?.nativeElement;
    if (!host) return;
    this.timelineResizeObs?.disconnect();
    this.timelineResizeObs = new ResizeObserver(() => {
      if (this.timelineResizeRaf) cancelAnimationFrame(this.timelineResizeRaf);
      this.timelineResizeRaf = requestAnimationFrame(() => {
        this.timelineResizeRaf = 0;
        if (this.timelinePanelBodyVisible && this.learningOrderTimelineSteps.length > 0) {
          this.renderLearningTimeline();
        }
      });
    });
    this.timelineResizeObs.observe(host);
  }

  private scheduleLearningTimelineRender(): void {
    if (!this.timelinePanelBodyVisible || this.learningOrderTimelineSteps.length === 0) return;
    if (this.timelineResizeRaf) cancelAnimationFrame(this.timelineResizeRaf);
    this.timelineResizeRaf = requestAnimationFrame(() => {
      this.timelineResizeRaf = 0;
      this.renderLearningTimeline();
    });
  }

  private renderLearningTimeline(): void {
    const host = this.learningTimelineHost?.nativeElement;
    const steps = this.learningOrderTimelineSteps;
    if (!host || steps.length === 0) return;

    this.clearLearningTimelineDom();

    const w = Math.max(360, host.clientWidth || 640);
    const h = Math.max(68, host.clientHeight || 76);
    const padX = 44;
    const yAxis = h * 0.5;
    const n = steps.length;
    const innerW = Math.max(40, w - padX * 2);
    const gap = n > 1 ? innerW / (n - 1) : 0;

    const svg = d3
      .select(host)
      .append('svg')
      .attr('class', 'discover-timeline-svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g').attr('class', 'discover-timeline-layer');

    const positions = steps.map((_, i) => (n === 1 ? w / 2 : padX + i * gap));
    const suggestedPath = this.learningOrderShowsSuggestedPath;
    const linkStroke = suggestedPath
      ? 'color-mix(in srgb, var(--app-forest) 88%, var(--app-brand-ink) 12%)'
      : 'color-mix(in srgb, var(--app-forest) 72%, var(--app-stroke-strong) 28%)';

    if (n > 1) {
      for (let i = 1; i < n; i++) {
        const line = g
          .append('line')
          .attr('x1', positions[i - 1])
          .attr('y1', yAxis)
          .attr('x2', positions[i])
          .attr('y2', yAxis)
          .attr('stroke', linkStroke)
          .attr('stroke-width', suggestedPath ? 2.75 : 2.5)
          .attr('stroke-linecap', 'round');
        if (suggestedPath) {
          line.attr('stroke-dasharray', '5 4');
        }
      }
    }

    steps.forEach((step, i) => {
      const x = positions[i];
      const qLabel = step.qNum > 0 ? formatQ(step.qNum) : '?';
      const tooltip = step.label.trim() || qLabel;
      const prereqs = this.getTimelinePrereqs(step.id);
      const hasPrereqs = prereqs.length > 0;
      const isDetail = this.timelineDetailStepId === step.id;
      const node = g
        .append('g')
        .attr('class', 'discover-timeline-node')
        .attr('role', 'button')
        .attr('tabindex', hasPrereqs ? 0 : -1)
        .attr(
          'aria-label',
          hasPrereqs
            ? `${qLabel} — ${tooltip}. ${this.translate.instant('discover.timelinePrereqClickHint')}`
            : `${qLabel} — ${tooltip}`
        )
        .classed('discover-timeline-node--has-prereqs', hasPrereqs)
        .classed('discover-timeline-node--detail', isDetail);

      const hit = node
        .append('circle')
        .attr('cx', x)
        .attr('cy', yAxis)
        .attr('r', 15)
        .attr(
          'fill',
          isDetail
            ? 'color-mix(in srgb, var(--app-forest) 22%, var(--app-surface-strong) 78%)'
            : suggestedPath
              ? 'color-mix(in srgb, var(--app-surface-strong) 82%, var(--app-forest) 18%)'
              : 'color-mix(in srgb, var(--app-surface-strong) 90%, var(--app-forest) 10%)'
        )
        .attr('stroke', 'var(--app-forest)')
        .attr('stroke-width', isDetail ? 2.75 : suggestedPath ? 2.25 : 2)
        .style('cursor', hasPrereqs ? 'pointer' : 'default')
        .on('mouseenter', () => {
          this.ngZone.run(() => this.onTimelineNodeEnter(step.id));
        })
        .on('mouseleave', () => {
          this.ngZone.run(() => this.onTimelineNodeLeave(step.id));
        })
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          this.ngZone.run(() => this.onTimelineNodeClick(step.id));
        });

      hit.append('title').text(
        hasPrereqs
          ? `${tooltip}\n${this.translate.instant('discover.timelinePrereqClickHint')}`
          : tooltip
      );

      if (hasPrereqs) {
        node
          .append('circle')
          .attr('class', 'discover-timeline-node__badge')
          .attr('cx', x + 11)
          .attr('cy', yAxis - 11)
          .attr('r', 7)
          .attr('fill', 'var(--app-forest)')
          .attr('stroke', 'var(--app-surface-strong)')
          .attr('stroke-width', 1.5)
          .attr('pointer-events', 'none');
        node
          .append('text')
          .attr('class', 'discover-timeline-node__badge-count')
          .attr('x', x + 11)
          .attr('y', yAxis - 11)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', 8)
          .attr('font-weight', 700)
          .attr('fill', 'var(--app-surface-strong)')
          .attr('pointer-events', 'none')
          .text(String(prereqs.length));
      }

      node
        .append('text')
        .attr('x', x)
        .attr('y', yAxis)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('fill', 'var(--app-brand-ink)')
        .attr('pointer-events', 'none')
        .text(qLabel);

      if (suggestedPath) {
        node
          .append('text')
          .attr('class', 'discover-timeline-node__step')
          .attr('x', x)
          .attr('y', yAxis + 24)
          .attr('text-anchor', 'middle')
          .attr('font-size', 8)
          .attr('font-weight', 600)
          .attr('fill', 'var(--app-text-muted)')
          .attr('pointer-events', 'none')
          .text(String(step.step));
      }
    });
  }

  totalMapSubThemes(): number {
    return this.mapThemes.reduce((acc, theme) => acc + theme.subThemes.length, 0);
  }

  selectSubThemeFromMap(theme: DiscoverMapTheme, subTheme: DiscoverMapSubTheme): void {
    this.ngZone.run(() => {
      this.selectedThemeId = theme.id;
      this.selectedSubThemeId = subTheme.id;
      this.selectedThemeLabel = theme.label;
      this.selectedSubThemeLabel = subTheme.label;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          theme: theme.id,
          subTheme: subTheme.id,
          themeLabel: theme.label,
          subThemeLabel: subTheme.label
        },
        queryParamsHandling: 'merge'
      });

      this.loadQuestionsForSubTheme();
      this.updateMindMapHighlight();
    });
  }

  toggleMindMapZoomHint(): void {
    this.mindMapZoomHintVisible = !this.mindMapZoomHintVisible;
  }

  onMindMapSearchQueryChange(value: string): void {
    this.mindMapSearchQuery = value;
    if (this.mindMapSearchDebounceTimer) clearTimeout(this.mindMapSearchDebounceTimer);
    this.mindMapSearchDebounceTimer = setTimeout(() => {
      this.ngZone.run(() => this.applyMindMapSearchMatches());
    }, 280);
  }

  toggleMindMapPanelBody(): void {
    this.mindMapPanelBodyVisible = !this.mindMapPanelBodyVisible;
    if (!this.mindMapPanelBodyVisible) {
      this.mindMapResizeObs?.disconnect();
      this.mindMapSimulation?.stop();
      return;
    }
    if (this.mapThemes.length > 0 && !this.loadingMap) {
      afterNextRender(
        () => {
          this.setupMindMapResizeObserver();
          this.scheduleMindMapRender();
        },
        { injector: this.injector }
      );
    }
  }

  toggleTimelinePanelBody(): void {
    this.timelinePanelBodyVisible = !this.timelinePanelBodyVisible;
    if (!this.timelinePanelBodyVisible) {
      this.timelineResizeObs?.disconnect();
      return;
    }
    if (this.learningOrderTimelineSteps.length > 0) {
      afterNextRender(
        () => {
          this.setupLearningTimelineResizeObserver();
          this.scheduleLearningTimelineRender();
        },
        { injector: this.injector }
      );
    }
  }

  /**
   * Réinitialise la carte : si un seul thème était affiché, réaffiche toute la discipline ;
   * sinon remet le zoom / pan par défaut sur la vue courante.
   */
  resetMindMapView(): void {
    if (this.mindMapDetailThemeId !== null) {
      this.mindMapDetailThemeId = null;
      this.scheduleMindMapRender();
      return;
    }
    const svg = this.mindMapSvg;
    const zoom = this.mindMapZoom;
    if (!svg || !zoom) return;
    void svg.transition().duration(220).call(zoom.transform, d3.zoomIdentity);
  }

  private loadMentalMap(): void {
    const disciplineId = this.disciplineService.selectedDisciplineId();
    this.loadingMap = true;
    this.loadMapError = '';
    this.mindMapDetailThemeId = null;
    this.mindMapSearchQuery = '';
    this.clearLearningOrderUi();
    this.mindMapSearchMatchPathIds.clear();
    this.mindMapSearchMatchStamp++;
    this.pathQuestionsSearchBlob.clear();
    this.mindMapSearchIndexSub?.unsubscribe();
    this.mindMapSearchIndexSub = undefined;
    if (this.mindMapSearchDebounceTimer) clearTimeout(this.mindMapSearchDebounceTimer);
    this.mapThemes = [];
    this.api.getAllThemes(disciplineId).subscribe({
      next: (raw) => {
        this.mapThemes = this.normalizeMapThemes(raw);
        this.tryHydrateLabelsFromMap();
        this.scheduleMindMapRender();
        this.prefetchMindMapSearchIndex();
      },
      error: () => {
        this.loadMapError = this.translate.instant('discover.loadThemesError');
      },
      complete: () => {
        this.loadingMap = false;
      }
    });
  }

  private normalizeMapThemes(raw: unknown): DiscoverMapTheme[] {
    const records: ThemeAdminDto[] = Array.isArray(raw)
      ? (raw as ThemeAdminDto[])
      : ((raw as { themes?: ThemeAdminDto[]; data?: ThemeAdminDto[] })?.themes ??
          (raw as { data?: ThemeAdminDto[] })?.data ??
          []);
    return records
      .map((theme) => ({
        id: String((theme as any)?.id ?? (theme as any)?.id_theme ?? ''),
        label: String((theme as any)?.label ?? (theme as any)?.libelle ?? ''),
        description: String((theme as any)?.description ?? (theme as any)?.tagline ?? ''),
        subThemes: this.normalizeMapSubThemes((theme as any)?.subThemes ?? (theme as any)?.sub_themes ?? [])
      }))
      .filter((theme) => theme.id.length > 0 && theme.label.length > 0);
  }

  private normalizeMapSubThemes(raw: unknown): DiscoverMapSubTheme[] {
    const records = Array.isArray(raw) ? raw : [];
    return records
      .map((sub: any) => ({
        id: String(sub?.id ?? sub?.id_subtheme ?? ''),
        label: String(sub?.label ?? sub?.libelle ?? ''),
        description: String(sub?.description ?? '')
      }))
      .filter((sub) => sub.id.length > 0 && sub.label.length > 0);
  }

  private tryHydrateLabelsFromMap(): void {
    if (!this.selectedThemeId || !this.selectedSubThemeId) return;
    const labels = this.findMapLabels(this.selectedThemeId, this.selectedSubThemeId);
    if (!this.selectedThemeLabel && labels.themeLabel) {
      this.selectedThemeLabel = labels.themeLabel;
    }
    if (!this.selectedSubThemeLabel && labels.subThemeLabel) {
      this.selectedSubThemeLabel = labels.subThemeLabel;
    }
  }

  private findMapLabels(themeId: string, subThemeId: string): { themeLabel: string; subThemeLabel: string } {
    const theme = this.mapThemes.find((t) => t.id === themeId);
    const sub = theme?.subThemes.find((s) => s.id === subThemeId);
    return {
      themeLabel: theme?.label ?? '',
      subThemeLabel: sub?.label ?? ''
    };
  }

  /** Précharge les textes des questions par parcours pour une recherche locale rapide. */
  private prefetchMindMapSearchIndex(): void {
    this.mindMapSearchIndexSub?.unsubscribe();
    if (this.mapThemes.length === 0) return;
    const pathIds = this.collectPathIdsForMindMapSearch();
    if (pathIds.length === 0) return;
    const requests = pathIds.map((pathId) =>
      this.api.getQuestionsBySubTheme(pathId).pipe(
        map((raw) => ({ pathId, blob: this.flattenQuestionsForSearchBlob(raw) })),
        catchError(() => of({ pathId, blob: '' }))
      )
    );
    this.mindMapSearchIndexing = true;
    this.mindMapSearchIndexSub = forkJoin(requests).subscribe({
      next: (rows) => {
        this.pathQuestionsSearchBlob.clear();
        for (const r of rows) {
          this.pathQuestionsSearchBlob.set(r.pathId, r.blob);
        }
        this.mindMapSearchIndexing = false;
        if (this.mindMapSearchQuery.trim().length > 0) {
          this.applyMindMapSearchMatches();
        }
      },
      error: () => {
        this.mindMapSearchIndexing = false;
      }
    });
  }

  private collectPathIdsForMindMapSearch(): string[] {
    const ids: string[] = [];
    for (const t of this.mapThemes) {
      for (const s of t.subThemes) ids.push(s.id);
    }
    return ids;
  }

  private flattenQuestionsForSearchBlob(raw: unknown): string {
    const qs = this.normalizeQuestions(raw);
    const parts: string[] = [];
    for (const q of qs) {
      parts.push(q.label);
      const pa = q.proposedAnswer?.trim();
      if (pa) parts.push(pa);
    }
    return this.normalizeMindMapSearchText(parts.join('\n'));
  }

  private normalizeMindMapSearchText(s: string): string {
    return (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  }

  private parseMindMapSearchTokens(query: string): string[] {
    return query
      .split(/\s+/)
      .map((t) => this.normalizeMindMapSearchText(t.trim()))
      .filter((t) => t.length > 0);
  }

  private applyMindMapSearchMatches(): void {
    try {
      const tokens = this.parseMindMapSearchTokens(this.mindMapSearchQuery);
      if (tokens.length === 0 || this.mapThemes.length === 0) {
        this.mindMapSearchMatchPathIds.clear();
        this.updateMindMapHighlight();
        return;
      }
      if (this.pathQuestionsSearchBlob.size === 0) {
        this.mindMapSearchMatchPathIds.clear();
        if (!this.mindMapSearchIndexing) {
          this.prefetchMindMapSearchIndex();
        }
        this.updateMindMapHighlight();
        return;
      }
      this.mindMapSearchMatchPathIds.clear();
      for (const [pathId, blob] of this.pathQuestionsSearchBlob) {
        if (tokens.some((tok) => blob.includes(tok))) {
          this.mindMapSearchMatchPathIds.add(pathId);
        }
      }
      this.updateMindMapHighlight();
    } finally {
      this.mindMapSearchMatchStamp++;
    }
  }

  /** Clic droit sur la proposition : menu si une sélection non vide est dans la zone. */
  onDiscoverWikiContextMenu(event: MouseEvent): void {
    const host = event.currentTarget as HTMLElement | null;
    if (!host) return;
    const sel = window.getSelection();
    const raw = sel?.toString() ?? '';
    const text = raw.normalize('NFC').trim();
    if (!text || text.length > 500) return;
    if (!this.wikiSelectionInsideHost(sel, host)) return;
    event.preventDefault();
    event.stopPropagation();

    const pad = 8;
    const mw = 260;
    const mh = 96;
    let x = event.clientX;
    let y = event.clientY;
    if (typeof window !== 'undefined') {
      if (x + mw + pad > window.innerWidth) x = Math.max(pad, window.innerWidth - mw - pad);
      if (y + mh + pad > window.innerHeight) y = Math.max(pad, event.clientY - mh - pad);
    }

    this.wikiContextMenuX = x;
    this.wikiContextMenuY = y;
    this.wikiContextMenuSelection = text;
    this.wikiContextMenuOpen = true;
  }

  closeWikiContextMenu(): void {
    this.wikiContextMenuOpen = false;
    this.wikiContextMenuSelection = '';
  }

  openWikipediaFromContextMenu(): void {
    const t = this.wikiContextMenuSelection;
    this.closeWikiContextMenu();
    if (!t) return;
    const url = this.wikipediaFrArticleUrlFromSelection(t);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** URL article Wikipédia fr : titre = sélection (espaces → tirets bas), encodage UTF-8. */
  wikipediaFrArticleUrlFromSelection(title: string): string {
    const raw = title.normalize('NFC').trim().replace(/\s+/g, '_');
    if (!raw) return 'https://fr.wikipedia.org/wiki/';
    return 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(raw).replace(/%20/g, '_');
  }

  
  openGoogleFromContextMenu(): void {
    const t = this.wikiContextMenuSelection;
    this.closeWikiContextMenu();
    if (!t) return;
    const url = this.googleArticleUrlFromSelection(t);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** URL article Google : titre = sélection (espaces → tirets bas), encodage UTF-8. */
  googleArticleUrlFromSelection(title: string): string {
    const raw = title.normalize('NFC').trim().replace(/\s+/g, '_');
    if (!raw) return 'https://google.fr/';
    return 'https://google.fr/search?q=' + encodeURIComponent(raw);
  }


  private wikiSelectionInsideHost(sel: Selection | null, host: HTMLElement): boolean {
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const root = sel.getRangeAt(0).commonAncestorContainer;
    const el =
      root.nodeType === Node.ELEMENT_NODE ? (root as Element) : root.parentElement;
    return !!el && host.contains(el);
  }

  /** Segments du libellé question : portions correspondant aux termes de recherche (parcours orange). */
  mindMapQuestionLabelSegments(label: string): { text: string; hit: boolean }[] {
    void this.mindMapSearchMatchStamp;
    const pathId = this.selectedSubThemeId;
    if (!pathId || !this.mindMapSearchMatchPathIds.has(pathId)) {
      return [{ text: label, hit: false }];
    }
    const tokens = this.parseMindMapSearchTokens(this.mindMapSearchQuery);
    if (tokens.length === 0) {
      return [{ text: label, hit: false }];
    }
    const { norm, starts, ends } = this.mindMapSearchNormCharToOrig(label);
    if (!norm.length) {
      return [{ text: label, hit: false }];
    }
    const intervals: [number, number][] = [];
    for (const tok of tokens) {
      if (!tok.length) continue;
      let from = 0;
      while (from <= norm.length - tok.length) {
        const idx = norm.indexOf(tok, from);
        if (idx === -1) break;
        const orig0 = starts[idx] ?? 0;
        const orig1 = ends[idx + tok.length - 1] ?? orig0;
        if (orig1 > orig0) intervals.push([orig0, orig1]);
        from = idx + 1;
      }
    }
    if (intervals.length === 0) {
      return [{ text: label, hit: false }];
    }
    const merged = this.mergeMindMapSearchOrigIntervals(intervals);
    return this.splitTextByMindMapSearchHits(label, merged);
  }

  private mindMapSearchNormCharToOrig(s: string): {
    norm: string;
    starts: number[];
    ends: number[];
  } {
    const str = s ?? '';
    let norm = '';
    const starts: number[] = [];
    const ends: number[] = [];
    for (let i = 0; i < str.length; ) {
      const cp = str.codePointAt(i)!;
      const ch = String.fromCodePoint(cp);
      const w = ch.length;
      const piece = ch.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      for (let k = 0; k < piece.length; k++) {
        norm += piece[k];
        starts.push(i);
        ends.push(i + w);
      }
      i += w;
    }
    return { norm, starts, ends };
  }

  private mergeMindMapSearchOrigIntervals(intervals: [number, number][]): [number, number][] {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out: [number, number][] = [];
    let cs = sorted[0][0];
    let ce = sorted[0][1];
    for (let i = 1; i < sorted.length; i++) {
      const [s, e] = sorted[i];
      if (s <= ce) ce = Math.max(ce, e);
      else {
        out.push([cs, ce]);
        cs = s;
        ce = e;
      }
    }
    out.push([cs, ce]);
    return out;
  }

  private splitTextByMindMapSearchHits(
    text: string,
    merged: [number, number][]
  ): { text: string; hit: boolean }[] {
    const out: { text: string; hit: boolean }[] = [];
    let pos = 0;
    const len = text.length;
    for (const [a, b] of merged) {
      const aa = Math.max(0, Math.min(a, len));
      const bb = Math.max(aa, Math.min(b, len));
      if (aa > pos) out.push({ text: text.slice(pos, aa), hit: false });
      if (bb > aa) out.push({ text: text.slice(aa, bb), hit: true });
      pos = Math.max(pos, bb);
    }
    if (pos < len) out.push({ text: text.slice(pos), hit: false });
    return out.length > 0 ? out : [{ text, hit: false }];
  }

  private mindMapLinkSearchHit(link: MindMapLink): boolean {
    return (
      link.kind === 'theme-path' &&
      link.pathId != null &&
      link.pathId.length > 0 &&
      this.mindMapSearchMatchPathIds.has(link.pathId)
    );
  }

  private setupMindMapResizeObserver(): void {
    const host = this.mindMapHost?.nativeElement;
    if (!host) return;
    this.mindMapResizeObs?.disconnect();
    this.mindMapResizeObs = new ResizeObserver(() => {
      if (this.mindMapResizeRaf) cancelAnimationFrame(this.mindMapResizeRaf);
      this.mindMapResizeRaf = requestAnimationFrame(() => {
        if (this.mapThemes.length > 0 && !this.loadingMap) {
          this.scheduleMindMapRender();
        }
      });
    });
    this.mindMapResizeObs.observe(host);
  }

  private scheduleMindMapRender(): void {
    afterNextRender(
      () => {
        requestAnimationFrame(() => this.renderForceMindMap());
      },
      { injector: this.injector }
    );
  }

  private renderForceMindMap(): void {
    const host = this.mindMapHost?.nativeElement;
    if (!host || this.mapThemes.length === 0) return;

    this.mindMapSimulation?.stop();
    this.mindMapHoveredNodeId = null;

    const width = Math.max(320, host.clientWidth || 640);
    const rect = host.getBoundingClientRect();
    const measuredH =
      host.clientHeight > 8 ? host.clientHeight : rect.height > 8 ? rect.height : 0;
    const height = Math.max(
      320,
      measuredH > 40 ? Math.floor(measuredH) : Math.min(640, Math.round(width * 0.56))
    );

    const cs = getComputedStyle(document.body);
    const ink = (cs.getPropertyValue('--app-text') || '#2c2825').trim();
    const themeAccent = (cs.getPropertyValue('--app-forest') || '#2d5a3d').trim();
    const mutedResolved =
      d3.color((cs.getPropertyValue('--app-text-muted') || '#6b635a').trim()) ?? d3.rgb(107, 99, 90);
    const forestResolved =
      d3.color((cs.getPropertyValue('--app-forest') || '#2d6a4f').trim()) ?? d3.rgb(45, 106, 79);
    const strokeBase = document.body.classList.contains('dark-theme')
      ? 'rgba(234, 231, 224, 0.55)'
      : 'rgba(61, 51, 41, 0.22)';
    const circleStroke = document.body.classList.contains('dark-theme')
      ? 'rgba(234, 231, 224, 0.88)'
      : '#ffffff';

    const rootLabelRaw =
      this.disciplineService.selectedDisciplineLabel() ??
      this.translate.instant('discover.mapRootFallback');
    const rootLabel = this.truncateMindMapLabel(rootLabelRaw, 42);

    if (
      this.mindMapDetailThemeId !== null &&
      !this.mapThemes.some((t) => t.id === this.mindMapDetailThemeId)
    ) {
      this.mindMapDetailThemeId = null;
    }
    const themesForGraph =
      this.mindMapDetailThemeId !== null
        ? this.mapThemes.filter((t) => t.id === this.mindMapDetailThemeId)
        : this.mapThemes;
    if (this.mindMapDetailThemeId !== null && themesForGraph.length === 0) {
      this.mindMapDetailThemeId = null;
    }

    const nodes: MindMapNode[] = [
      {
        id: 'root',
        kind: 'root',
        label: rootLabel,
        fx: 0,
        fy: 0
      }
    ];
    const links: MindMapLink[] = [];

    const nThemes = Math.max(themesForGraph.length, 1);
    themesForGraph.forEach((theme, ti) => {
      const tid = `t:${theme.id}`;
      nodes.push({
        id: tid,
        kind: 'theme',
        themeId: theme.id,
        label: theme.label
      });
      links.push({
        source: 'root',
        target: tid,
        kind: 'root-theme',
        themeId: theme.id
      });
      const angleBase = (ti / nThemes) * Math.PI * 2 - Math.PI / 2;
      const r0 = Math.min(130, width / 5);

      theme.subThemes.forEach((sub, si) => {
        const pid = `p:${theme.id}:${sub.id}`;
        const spread = theme.subThemes.length;
        const delta = spread <= 1 ? 0 : (si - (spread - 1) / 2) * 0.14;
        const angle = angleBase + delta;
        const jitter = (Math.sin(si * 12.9898 + ti * 4.933) + 1) * 9;
        nodes.push({
          id: pid,
          kind: 'path',
          themeId: theme.id,
          pathId: sub.id,
          label: sub.label,
          x: Math.cos(angle) * (r0 + 95) + jitter,
          y: Math.sin(angle) * (r0 + 95) + jitter * 0.6
        });
        links.push({
          source: tid,
          target: pid,
          kind: 'theme-path',
          themeId: theme.id,
          pathId: sub.id
        });
      });

      const tNode = nodes.find((n) => n.id === tid);
      if (tNode && (tNode.x == null || tNode.y == null)) {
        tNode.x = Math.cos(angleBase) * r0;
        tNode.y = Math.sin(angleBase) * r0;
      }
    });

    this.mindMapLastNodes = nodes;
    this.mindMapLastLinks = links;

    host.replaceChildren();

    const svg = d3
      .select(host)
      .append('svg')
      .attr('class', 'discover-mindmap-svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', this.mindMapPanelTitleAriaLabel());

    this.mindMapSvg = svg;

    const zoomLayer = svg.append('g').attr('class', 'mindmap-zoom-layer');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 2.8])
      .filter((event: unknown) => {
        const e = event as MouseEvent;
        if (
          (e.type === 'mousedown' || e.type === 'touchstart') &&
          (e.target as Element | null)?.closest(
            '.mindmap-node--theme, .mindmap-node--path'
          )
        ) {
          return false;
        }
        return (!e.ctrlKey || e.type === 'wheel') && !e.button;
      })
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform.toString());
      });

    svg.call(zoom);
    this.mindMapZoom = zoom;

    const pointerInGraphSpace = (
      ev: MouseEvent | TouchEvent | d3.D3DragEvent<SVGGElement, MindMapNode, MindMapNode>
    ): [number, number] => {
      const svgEl = svg.node();
      if (!svgEl) return [0, 0];
      const inv = d3.zoomTransform(svgEl).invert(d3.pointer(ev as MouseEvent, svgEl));
      return [inv[0], inv[1]];
    };

    const linkForce = d3
      .forceLink<MindMapNode, MindMapLink>(links)
      .id((d) => d.id)
      .distance((d) => (d.kind === 'root-theme' ? 115 : 72))
      .strength(0.85);

    const simulation = d3
      .forceSimulation<MindMapNode>(nodes)
      .force('link', linkForce)
      .force('charge', d3.forceManyBody().strength(-260))
      .force(
        'collide',
        d3.forceCollide<MindMapNode>().radius((d) => {
          if (d.kind === 'root') return 44;
          if (d.kind === 'theme') return 34;
          return 26;
        })
      )
      .alphaDecay(0.045)
      .velocityDecay(0.62);

    this.mindMapSimulation = simulation;

    const linkG = zoomLayer.append('g').attr('class', 'mindmap-links');

    const linkSel = linkG
      .selectAll<SVGLineElement, MindMapLink>('line')
      .data(links)
      .join('line')
      .attr('stroke-linecap', 'round');

    this.mindMapLinks = linkSel;

    const nodeG = zoomLayer.append('g').attr('class', 'mindmap-nodes');

    const nodeSel = nodeG
      .selectAll<SVGGElement, MindMapNode>('g')
      .data(nodes)
      .join('g')
      .attr(
        'class',
        (d) =>
          `mindmap-node mindmap-node--${d.kind} mindmap-filter-${d.kind} mindmap-type-${d.kind}`
      );

    this.mindMapNodes = nodeSel;

    nodeSel
      .filter((d) => d.kind === 'theme')
      .on('click.focusTheme', (event: MouseEvent, d) => {
        event.stopPropagation();
        const tid = d.themeId;
        if (!tid) return;
        this.ngZone.run(() => {
          if (this.mindMapDetailThemeId === tid) return;
          this.mindMapDetailThemeId = tid;
          this.scheduleMindMapRender();
        });
      });

    nodeSel
      .filter((d) => d.kind === 'path')
      .on('click', (event: MouseEvent, d) => {
        event.stopPropagation();
        const theme = this.mapThemes.find((t) => t.id === d.themeId);
        const sub = theme?.subThemes.find((s) => s.id === d.pathId);
        if (theme && sub) this.selectSubThemeFromMap(theme, sub);
      });

    nodeSel.each((d, i, groups) => {
      const g = d3.select(groups[i]);
      g.selectAll('*').remove();
      const r = d.kind === 'root' ? 15 : d.kind === 'theme' ? 11 : 8;
      g.append('circle')
        .attr('class', 'mindmap-node__circle')
        .attr('r', r)
        .attr('stroke', circleStroke)
        .attr('stroke-width', 1.6);
      const maxChars = d.kind === 'path' ? 26 : d.kind === 'theme' ? 20 : 36;
      const labelEl = g
        .append('text')
        .attr('class', 'mindmap-node__label')
        .attr('text-anchor', 'middle')
        .attr('fill', d.kind === 'theme' ? themeAccent : ink)
        .attr('font-size', d.kind === 'root' ? 12 : d.kind === 'theme' ? 11 : 10)
        .attr('font-weight', d.kind === 'path' ? 500 : 700)
        .attr('pointer-events', 'none')
        .attr('dy', d.kind === 'theme' ? -16 : d.kind === 'root' ? 24 : 14)
        .text(this.truncateMindMapLabel(d.label, maxChars));
      if (d.kind === 'path') {
        labelEl.attr('dy', 18);
      }
      const tooltip = this.mindMapNodeTooltipLabel(d);
      if (tooltip) {
        g.append('title').text(tooltip);
      }
    });

    const tick = (): void => {
      linkSel
        .attr('x1', (d) => (d.source as MindMapNode).x ?? 0)
        .attr('y1', (d) => (d.source as MindMapNode).y ?? 0)
        .attr('x2', (d) => (d.target as MindMapNode).x ?? 0)
        .attr('y2', (d) => (d.target as MindMapNode).y ?? 0);

      nodeSel.attr('transform', (d) => {
        const x = d.x ?? 0;
        const y = d.y ?? 0;
        return `translate(${x},${y})`;
      });
    };

    simulation.alpha(1);
    while (simulation.alpha() > simulation.alphaMin()) {
      simulation.tick();
    }
    simulation.stop();
    tick();

    type DragMindNode = MindMapNode & { _dragLX?: number; _dragLY?: number };

    const unpinNode = (n: MindMapNode): void => {
      n.fx = null;
      n.fy = null;
    };

    const pinNode = (n: MindMapNode): void => {
      n.fx = n.x ?? null;
      n.fy = n.y ?? null;
    };

    const dragBehavior = d3
      .drag<SVGGElement, MindMapNode>()
      .clickDistance(8)
      .filter((event) => {
        const ev = event as MouseEvent & { type?: string };
        if (ev.ctrlKey) return false;
        if (ev.type?.startsWith('touch')) return true;
        return ev.button === 0;
      })
      .on('start', (event, d) => {
        if (d.kind === 'root') return;
        this.mindMapHoveredNodeId = null;
        this.applyMindMapHoverStyles();
        event.sourceEvent.stopPropagation();
        const hostNode = (event.sourceEvent.target as Element).closest('g.mindmap-node');
        if (hostNode) {
          d3.select(hostNode).raise();
        }

        if (d.kind === 'theme') {
          unpinNode(d);
          for (const n of nodes) {
            if (n.kind === 'path' && n.themeId === d.themeId) unpinNode(n);
          }
        } else {
          unpinNode(d);
        }

        const [px, py] = pointerInGraphSpace(event);
        const ext = d as DragMindNode;
        ext._dragLX = px;
        ext._dragLY = py;
      })
      .on('drag', (event, d) => {
        if (d.kind === 'root') return;
        const ext = d as DragMindNode;
        const [px, py] = pointerInGraphSpace(event);
        const lx = ext._dragLX ?? px;
        const ly = ext._dragLY ?? py;
        const dx = px - lx;
        const dy = py - ly;
        ext._dragLX = px;
        ext._dragLY = py;

        const shift = (n: MindMapNode): void => {
          n.x = (n.x ?? 0) + dx;
          n.y = (n.y ?? 0) + dy;
        };

        if (d.kind === 'path') {
          shift(d);
        } else {
          shift(d);
          for (const n of nodes) {
            if (n.kind === 'path' && n.themeId === d.themeId) shift(n);
          }
        }
        tick();
      })
      .on('end', (_event, d) => {
        if (d.kind === 'root') return;
        const ext = d as DragMindNode;
        delete ext._dragLX;
        delete ext._dragLY;

        if (d.kind === 'theme') {
          pinNode(d);
          for (const n of nodes) {
            if (n.kind === 'path' && n.themeId === d.themeId) pinNode(n);
          }
        } else {
          pinNode(d);
        }
      });

    nodeSel
      .filter((d) => d.kind === 'theme' || d.kind === 'path')
      .style('cursor', 'grab')
      .call(dragBehavior);

    nodeSel.on('mouseenter.mmhover', (_evt, d) => {
      this.mindMapHoveredNodeId = d.id;
      this.applyMindMapHoverStyles();
    });

    svg.on('pointerleave.mmhover', () => {
      if (this.mindMapHoveredNodeId === null) return;
      this.mindMapHoveredNodeId = null;
      this.applyMindMapHoverStyles();
    });

    this.updateMindMapHighlight(mutedResolved.formatHex(), forestResolved.formatHex(), strokeBase);

    const zoomDetailId = this.mindMapDetailThemeId;
    if (zoomDetailId !== null) {
      this.animateMindMapZoomToDetailSubtree(svg, zoom, nodes, zoomDetailId, width, height);
    }
  }

  /** Centre et zoome sur la sous-arborescence (racine + thème + parcours du détail). */
  private animateMindMapZoomToDetailSubtree(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    zoom: d3.ZoomBehavior<SVGSVGElement, unknown>,
    nodes: MindMapNode[],
    detailThemeId: string,
    width: number,
    height: number
  ): void {
    const pad = (kind: MindMapNode['kind']): number => {
      if (kind === 'root') return 52;
      if (kind === 'theme') return 56;
      return 44;
    };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (const n of nodes) {
      if (n.kind === 'path' && n.themeId !== detailThemeId) continue;
      if (n.kind === 'theme' && n.themeId !== detailThemeId) continue;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const p = pad(n.kind);
      minX = Math.min(minX, x - p);
      maxX = Math.max(maxX, x + p);
      minY = Math.min(minY, y - p);
      maxY = Math.max(maxY, y + p);
      any = true;
    }
    if (!any || !Number.isFinite(minX)) return;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const bw = Math.max(maxX - minX, 96);
    const bh = Math.max(maxY - minY, 96);
    const margin = 0.8;
    let k = Math.min((width * margin) / bw, (height * margin) / bh);
    k = Math.max(0.35, Math.min(2.8, k));
    const t = d3.zoomIdentity.translate(-cx, -cy).scale(k);
    void svg.interrupt().transition().duration(520).ease(d3.easeCubicOut).call(zoom.transform, t);
  }

  private mindMapLinkEndpointId(end: MindMapNode | string): string {
    return typeof end === 'string' ? end : end.id;
  }

  /**
   * Focus = chaîne hiérarchique ; transversal = parcours frères (même thème) ou autres thèmes (même discipline).
   */
  private computeMindMapHoverSets(hoveredId: string): {
    focus: Set<string>;
    transversal: Set<string>;
  } {
    const nodes = this.mindMapLastNodes;
    const links = this.mindMapLastLinks;
    const focus = new Set<string>();
    const transversal = new Set<string>();
    const byId = new Map(nodes.map((n) => [n.id, n]));

    const children = new Map<string, string[]>();
    const parents = new Map<string, string[]>();
    for (const n of nodes) {
      children.set(n.id, []);
      parents.set(n.id, []);
    }
    for (const l of links) {
      const sid = this.mindMapLinkEndpointId(l.source);
      const tid = this.mindMapLinkEndpointId(l.target);
      children.get(sid)?.push(tid);
      parents.get(tid)?.push(sid);
    }

    focus.add(hoveredId);
    const stackUp = [...(parents.get(hoveredId) ?? [])];
    while (stackUp.length) {
      const x = stackUp.pop()!;
      if (focus.has(x)) continue;
      focus.add(x);
      stackUp.push(...(parents.get(x) ?? []));
    }
    const stackDown = [...(children.get(hoveredId) ?? [])];
    while (stackDown.length) {
      const x = stackDown.pop()!;
      if (focus.has(x)) continue;
      focus.add(x);
      stackDown.push(...(children.get(x) ?? []));
    }

    const ho = byId.get(hoveredId);
    if (!ho) {
      return { focus, transversal };
    }

    if (ho.kind === 'path' && ho.themeId) {
      for (const n of nodes) {
        if (n.kind === 'path' && n.themeId === ho.themeId && n.id !== hoveredId) {
          transversal.add(n.id);
        }
      }
    } else if (ho.kind === 'theme') {
      for (const n of nodes) {
        if (n.kind === 'theme' && n.id !== hoveredId) {
          transversal.add(n.id);
        }
      }
    }

    for (const id of focus) {
      transversal.delete(id);
    }

    return { focus, transversal };
  }

  /** Survol : atténuation des nœuds / liens hors focus et hors voisinage transversal. */
  private applyMindMapHoverStyles(): void {
    const nodesSel = this.mindMapNodes;
    const linksSel = this.mindMapLinks;
    if (!nodesSel || !linksSel) return;

    const hid = this.mindMapHoveredNodeId;
    if (!hid) {
      nodesSel.style('opacity', null);
      linksSel.style('opacity', null);
      return;
    }

    const { focus, transversal } = this.computeMindMapHoverSets(hid);

    nodesSel.style('opacity', (d) => {
      if (d.id === hid) return '1';
      if (focus.has(d.id)) return '1';
      if (transversal.has(d.id)) return '0.62';
      return '0.22';
    });

    linksSel.style('opacity', (ld) => {
      const sid = this.mindMapLinkEndpointId(ld.source);
      const tid = this.mindMapLinkEndpointId(ld.target);
      const sf = focus.has(sid);
      const tf = focus.has(tid);
      const st = transversal.has(sid);
      const tt = transversal.has(tid);
      if (sf && tf) return '1';
      if ((sf && tt) || (st && tf)) return '0.52';
      if (st && tt) return '0.38';
      return '0.12';
    });
  }

  private truncateMindMapLabel(s: string, max: number): string {
    const t = (s ?? '').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
  }

  /** Libellé complet affiché au survol (tooltip native SVG) pour thème / parcours. */
  private mindMapNodeTooltipLabel(d: MindMapNode): string {
    if (d.kind === 'theme' && d.themeId) {
      return (this.mapThemes.find((t) => t.id === d.themeId)?.label ?? d.label).trim();
    }
    if (d.kind === 'path' && d.themeId && d.pathId) {
      const theme = this.mapThemes.find((t) => t.id === d.themeId);
      return (theme?.subThemes.find((s) => s.id === d.pathId)?.label ?? d.label).trim();
    }
    return '';
  }

  private mindMapLinkActive(link: MindMapLink): boolean {
    const tid = this.selectedThemeId;
    const pid = this.selectedSubThemeId;
    if (!tid || !pid) return false;
    if (link.kind === 'root-theme') return link.themeId === tid;
    return link.themeId === tid && link.pathId === pid;
  }

  private mindMapNodeActive(node: MindMapNode): boolean {
    const tid = this.selectedThemeId;
    const pid = this.selectedSubThemeId;
    if (!tid || !pid) return false;
    if (node.kind === 'root') return true;
    if (node.kind === 'theme') return node.themeId === tid;
    return node.themeId === tid && node.pathId === pid;
  }

  private updateMindMapHighlight(
    mutedHex?: string,
    forestHex?: string,
    strokeBaseFallback?: string
  ): void {
    const linksSel = this.mindMapLinks;
    const nodesSel = this.mindMapNodes;
    if (!linksSel || !nodesSel) return;

    const cs = getComputedStyle(document.body);
    const mutedColor = d3.rgb(
      (mutedHex ? d3.color(mutedHex) : null) ??
        d3.color((cs.getPropertyValue('--app-text-muted') || '#6b635a').trim()) ??
        d3.rgb(107, 99, 90)
    );
    const forestColor = d3.rgb(
      (forestHex ? d3.color(forestHex) : null) ??
        d3.color((cs.getPropertyValue('--app-forest') || '#2d6a4f').trim()) ??
        d3.rgb(45, 106, 79)
    );
    const strokeBase =
      strokeBaseFallback ??
      (document.body.classList.contains('dark-theme')
        ? 'rgba(234, 231, 224, 0.42)'
        : 'rgba(61, 51, 41, 0.2)');
    const activeGlow = document.body.classList.contains('dark-theme')
      ? 'rgba(168, 214, 186, 0.95)'
      : forestColor.formatRgb();
    const circleStrokeRing = document.body.classList.contains('dark-theme')
      ? 'rgba(234, 231, 224, 0.88)'
      : '#ffffff';

    const warnRaw = (cs.getPropertyValue('--warning-alert') || '#ff9800').trim();
    const searchOrange = d3.rgb(d3.color(warnRaw) ?? d3.rgb(255, 152, 0));
    const pathSearchLabelFill = document.body.classList.contains('dark-theme')
      ? '#ffb74d'
      : '#e65100';

    linksSel
      .attr('stroke', (d) => {
        if (this.mindMapLinkActive(d)) return activeGlow;
        if (this.mindMapLinkSearchHit(d)) return searchOrange.formatRgb();
        return strokeBase;
      })
      .attr('stroke-width', (d) => {
        if (this.mindMapLinkActive(d)) return 3.2;
        if (this.mindMapLinkSearchHit(d)) return 2.35;
        return 1.35;
      })
      .attr('stroke-opacity', (d) => {
        if (this.mindMapLinkActive(d)) return 1;
        if (this.mindMapLinkSearchHit(d)) return 1;
        return 0.65;
      });

    const inkLabel = (cs.getPropertyValue('--app-text') || '#2c2825').trim();
    const forestLightRgb =
      (
        d3.color((cs.getPropertyValue('--app-forest-light') || '').trim()) ?? forestColor
      ).formatRgb();

    nodesSel.each((d, i, groups) => {
      const g = d3.select(groups[i]);
      const active = this.mindMapNodeActive(d);
      const searchHit =
        d.kind === 'path' && d.pathId != null && this.mindMapSearchMatchPathIds.has(d.pathId);
      const circle = g.select<SVGCircleElement>('circle.mindmap-node__circle');
      const fillHex = forestColor.formatHex();
      const mutedHexNode = mutedColor.formatHex();
      const themeFillHex = forestColor.formatHex();

      if (active) {
        circle
          .attr('fill', fillHex)
          .attr(
            'fill-opacity',
            d.kind === 'path' ? 0.82 : d.kind === 'theme' ? 0.52 : 0.34
          )
          .attr('stroke', forestColor.formatRgb())
          .attr('stroke-opacity', 1)
          .attr('stroke-width', 2.6);
      } else if (searchHit) {
        circle
          .attr('fill', searchOrange.formatRgb())
          .attr('fill-opacity', d.kind === 'path' ? 0.88 : 0.72)
          .attr('stroke', searchOrange.brighter(0.15).formatRgb())
          .attr('stroke-opacity', 1)
          .attr('stroke-width', d.kind === 'path' ? 2.25 : 2);
      } else {
        circle
          .attr('fill', d.kind === 'theme' ? themeFillHex : mutedHexNode)
          .attr(
            'fill-opacity',
            d.kind === 'theme' ? 0.48 : 0.2
          )
          .attr('stroke', circleStrokeRing)
          .attr('stroke-opacity', d.kind === 'theme' ? 0.92 : 0.85)
          .attr('stroke-width', d.kind === 'theme' ? 2 : 1.6);
      }

      const labelSel = g.select('text.mindmap-node__label');
      labelSel.attr('font-weight', active ? 700 : searchHit && d.kind === 'path' ? 700 : d.kind === 'path' ? 500 : 700);
      if (d.kind === 'theme') {
        labelSel.attr('fill', active ? forestLightRgb : forestColor.formatRgb());
      } else if (d.kind === 'path' && searchHit && !active) {
        labelSel.attr('fill', pathSearchLabelFill);
      } else {
        labelSel.attr('fill', inkLabel);
      }
    });

    this.applyMindMapHoverStyles();
  }

  private loadQuestionsForSubTheme(options?: { preserveSelection?: boolean }): void {
    if (!this.selectedSubThemeId) return;
    this.beginSubthemeSessionIfNeeded();
    const preserve = options?.preserveSelection === true;
    const previousQuestionId = preserve ? this.selectedQuestionId : null;

    this.loadQuestionsError = '';
    this.loadingQuestions = true;
    this.questions = [];
    this.questionsInBackendOrder = [];
    if (!preserve) {
      this.selectedQuestionId = null;
      this.draftPayload = null;
      this.personalNotes = '';
      this.savedPropositionsByQuestionId = {};
      this.savedPropositionsError = '';
    }
    this.api.getQuestionsBySubTheme(this.selectedSubThemeId).subscribe({
      next: (response: unknown) => {
        const normalized = assignQuestionNumbers(this.normalizeQuestions(response));
        this.questionsInBackendOrder = normalized;
        this.questionsListDisplayMode = this.resolveQuestionsListDisplayMode(normalized);
        this.questions = this.applyQuestionsDisplayOrder(
          normalized,
          this.questionsListDisplayMode
        );
        if (preserve && previousQuestionId) {
          if (this.questions.some((q) => q.id === previousQuestionId)) {
            this.selectedQuestionId = previousQuestionId;
            this.loadSavedPropositionsForQuestion(previousQuestionId);
          } else {
            this.selectedQuestionId = null;
            this.draftPayload = null;
            this.savedPropositionsByQuestionId = {};
            this.savedPropositionsError = '';
          }
        }
        this.scheduleLearningOrderFetch();
      },
      error: () => {
        this.loadQuestionsError = this.translate.instant('discover.loadQuestionsError');
        this.clearLearningOrderAfterQuestionsError();
      },
      complete: () => {
        this.loadingQuestions = false;
      }
    });
  }

  /**
   * Regrouper : 1er clic → IA + affichage par familles ;
   * clics suivants (familles déjà en base) → bascule groupe ↔ séquence suggérée.
   */
  triggerQuestionRegroupement(): void {
    if (!this.selectedSubThemeId || this.questions.length === 0 || this.regroupementQuestionsBusy) {
      return;
    }
    if (!this.hasQuestionsGrouping()) {
      this.runQuestionRegroupement();
      return;
    }
    if (this.questionsListDisplayMode === 'group') {
      this.setQuestionsListDisplayMode('sequence');
    } else {
      this.setQuestionsListDisplayMode('group');
    }
  }

  hasQuestionsGrouping(): boolean {
    return this.questionsInBackendOrder.some((q) => this.isValidQuestionGroupe(q.groupe));
  }

  groupQuestionsButtonTooltip(): string {
    if (!this.hasQuestionsGrouping()) {
      return this.translate.instant('discover.groupQuestionsTooltip');
    }
    if (this.questionsListDisplayMode === 'group') {
      return this.translate.instant('discover.showSequenceOrderTooltip');
    }
    return this.translate.instant('discover.showGroupOrderTooltip');
  }

  groupQuestionsButtonAria(): string {
    if (!this.hasQuestionsGrouping()) {
      return this.translate.instant('discover.groupQuestionsAria');
    }
    if (this.questionsListDisplayMode === 'group') {
      return this.translate.instant('discover.showSequenceOrderAria');
    }
    return this.translate.instant('discover.showGroupOrderAria');
  }

  /** Classe CSS pour le point de couleur du groupe, ou `null` si aucun groupe en base. */
  questionGroupDotClass(q: DiscoverQuestion): string | null {
    const g = q.groupe;
    if (g == null || !Number.isFinite(g)) return null;
    const idx = Math.round(Number(g));
    if (idx < 1 || idx > REGROUPEMENT_GROUPE_INDEX_MAX) return null;
    return `discover-q__group-dot discover-q__group-dot--${idx}`;
  }

  /** Une entrée par indice de `groupe` présent dans la liste (pour la légende sous le titre). */
  questionGroupLegendItems(): { groupe: number; dotClass: string; tooltip: string }[] {
    const labelByGroupe = new Map<number, string>();
    for (const q of this.questions) {
      const g = q.groupe;
      if (g == null || !Number.isFinite(g)) continue;
      const idx = Math.round(Number(g));
      if (idx < 1 || idx > REGROUPEMENT_GROUPE_INDEX_MAX) continue;
      const raw = (q.libelleGroupe ?? '').trim();
      const prev = labelByGroupe.get(idx);
      if (prev == null) labelByGroupe.set(idx, raw);
      else if (!prev && raw) labelByGroupe.set(idx, raw);
    }
    return [...labelByGroupe.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([groupe, libelle]) => ({
        groupe,
        dotClass: `discover-q__group-dot discover-q__group-dot--${groupe}`,
        tooltip:
          libelle ||
          this.translate.instant('discover.questionGroupTooltipFallback', { n: groupe })
      }));
  }

  /** Texte de tooltip pour le point coloré d’une ligne question. */
  questionGroupDotTooltip(q: DiscoverQuestion): string {
    const g = q.groupe;
    if (g == null || !Number.isFinite(g)) return '';
    const idx = Math.round(Number(g));
    if (idx < 1 || idx > REGROUPEMENT_GROUPE_INDEX_MAX) return '';
    const libelle = (q.libelleGroupe ?? '').trim();
    return (
      libelle ||
      this.translate.instant('discover.questionGroupTooltipFallback', { n: idx })
    );
  }

  private runQuestionRegroupement(): void {
    if (!this.selectedSubThemeId) return;
    this.regroupementQuestionsBusy = true;
    this.api
      .regroupementQuestionsParcours({
        id_subtheme: this.selectedSubThemeId
      })
      .pipe(
        finalize(() => {
          this.regroupementQuestionsBusy = false;
        })
      )
      .subscribe({
        next: () => {
          if (this.selectedSubThemeId) {
            this.persistQuestionsListMode(this.selectedSubThemeId, 'group');
            this.questionsListDisplayMode = 'group';
          }
          this.snackBar.open(
            this.translate.instant('discover.groupQuestionsSuccess'),
            this.translate.instant('common.close'),
            { duration: 5000 }
          );
          this.loadQuestionsForSubTheme({ preserveSelection: true });
        },
        error: () => {
          this.snackBar.open(
            this.translate.instant('discover.groupQuestionsError'),
            this.translate.instant('common.close'),
            { duration: 7000 }
          );
        }
      });
  }

  /**
   * Liste Discover : tri par `groupe` croissant (1…n), ordre d’origine conservé à l’intérieur d’un même groupe.
   * Questions sans groupe ou avec indice hors plage → en fin de liste.
   */
  /** Ordre canonique Q1…Qn (par `id_question`), indépendant du tri d’affichage par famille. */
  private questionsInQNumOrder(): DiscoverQuestion[] {
    return sortByQuestionId(this.questions);
  }

  private ordreLabelForQuestion(q: DiscoverQuestion): string {
    return questionOrdreLabel(q.qNum, q.label);
  }

  private isValidQuestionGroupe(g: number | null | undefined): boolean {
    if (g == null || !Number.isFinite(g)) return false;
    const n = Math.round(Number(g));
    return n >= 1 && n <= REGROUPEMENT_GROUPE_INDEX_MAX;
  }

  private resolveQuestionsListDisplayMode(
    items: DiscoverQuestion[]
  ): QuestionsListDisplayMode {
    if (!items.some((q) => this.isValidQuestionGroupe(q.groupe))) {
      return 'backend';
    }
    const saved = this.selectedSubThemeId
      ? this.readPersistedQuestionsListMode(this.selectedSubThemeId)
      : null;
    return saved ?? 'backend';
  }

  private setQuestionsListDisplayMode(mode: QuestionsListDisplayMode): void {
    this.questionsListDisplayMode = mode;
    if (
      (mode === 'group' || mode === 'sequence') &&
      this.selectedSubThemeId
    ) {
      this.persistQuestionsListMode(this.selectedSubThemeId, mode);
    }
    this.reapplyQuestionsListDisplayOrder();
  }

  private reapplyQuestionsListDisplayOrder(): void {
    if (this.questionsInBackendOrder.length === 0) return;
    this.questions = this.applyQuestionsDisplayOrder(
      this.questionsInBackendOrder,
      this.questionsListDisplayMode
    );
  }

  private applyQuestionsDisplayOrder(
    items: DiscoverQuestion[],
    mode: QuestionsListDisplayMode
  ): DiscoverQuestion[] {
    if (mode === 'group' && this.hasQuestionsGroupingIn(items)) {
      return this.sortQuestionsByGroupeStable(items);
    }
    if (mode === 'sequence') {
      return this.sortQuestionsBySuggestedSequence(items);
    }
    return [...items];
  }

  private hasQuestionsGroupingIn(items: DiscoverQuestion[]): boolean {
    return items.some((q) => this.isValidQuestionGroupe(q.groupe));
  }

  private sortQuestionsBySuggestedSequence(items: DiscoverQuestion[]): DiscoverQuestion[] {
    const steps = this.learningOrderTimelineSteps;
    if (steps.length === 0) return [...items];
    const rank = new Map(steps.map((s, i) => [String(s.id), i]));
    const withIdx = items.map((q, i) => ({ q, i }));
    withIdx.sort((a, b) => {
      const ra = rank.get(String(a.q.id)) ?? Number.POSITIVE_INFINITY;
      const rb = rank.get(String(b.q.id)) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.i - b.i;
    });
    return withIdx.map((x) => x.q);
  }

  private readPersistedQuestionsListMode(
    subthemeId: string
  ): QuestionsListPersistedMode | null {
    try {
      const raw = localStorage.getItem(DISCOVER_QUESTIONS_LIST_MODE_STORAGE_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw) as Record<string, unknown>;
      const v = map[String(subthemeId)];
      return v === 'sequence' || v === 'group' ? v : null;
    } catch {
      return null;
    }
  }

  private persistQuestionsListMode(
    subthemeId: string,
    mode: QuestionsListPersistedMode
  ): void {
    try {
      const raw = localStorage.getItem(DISCOVER_QUESTIONS_LIST_MODE_STORAGE_KEY);
      const map =
        raw != null && raw !== '' ? (JSON.parse(raw) as Record<string, string>) : {};
      map[String(subthemeId)] = mode;
      localStorage.setItem(DISCOVER_QUESTIONS_LIST_MODE_STORAGE_KEY, JSON.stringify(map));
    } catch {
      /* localStorage indisponible */
    }
  }

  private sortQuestionsByGroupeStable(items: DiscoverQuestion[]): DiscoverQuestion[] {
    const withIdx = items.map((q, i) => ({ q, i }));
    const rank = (q: DiscoverQuestion): number => {
      const g = q.groupe;
      if (!this.isValidQuestionGroupe(g)) return Number.POSITIVE_INFINITY;
      return Math.round(Number(g));
    };
    withIdx.sort((a, b) => {
      const ra = rank(a.q);
      const rb = rank(b.q);
      if (ra !== rb) return ra - rb;
      return a.i - b.i;
    });
    return withIdx.map((x) => x.q);
  }

  private normalizeQuestions(response: unknown): Omit<DiscoverQuestion, 'qNum'>[] {
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
        const groupeRaw = record?.groupe ?? record?.id_groupe ?? record?.group_index ?? null;
        let groupe: number | null = null;
        if (groupeRaw != null && groupeRaw !== '') {
          const n = Number(groupeRaw);
          if (Number.isFinite(n)) groupe = n;
        }
        const libelleGroupeRaw = record?.libelle_groupe ?? record?.libelleGroupe ?? null;
        const libelleGroupe =
          libelleGroupeRaw != null && String(libelleGroupeRaw).trim() !== ''
            ? this.decodeQuestionText(String(libelleGroupeRaw)).trim()
            : null;
        return { id, label, proposedAnswer, groupe, libelleGroupe };
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

  get hasDraft(): boolean {
    return this.draftPayload !== null;
  }

  get currentSavedEntry(): SavedDiscoverPropositionEntry | null {
    const list = this.currentQuestionSavedPropositions;
    const flagged = list.filter((e) => e.statutCurrent);
    if (flagged.length === 0) return null;
    if (flagged.length === 1) return flagged[0];
    return flagged.reduce((best, e) =>
      (e.dbId ?? 0) > (best.dbId ?? 0) ? e : best
    );
  }

  /** Une seule entrée « courante » dans l’historique (alignée sur la colonne du milieu). */
  isHistoryEntryCurrent(entry: SavedDiscoverPropositionEntry): boolean {
    const current = this.currentSavedEntry;
    if (current?.dbId == null || entry.dbId == null) return false;
    return entry.dbId === current.dbId;
  }

  get mainDisplayPayload(): SavedDiscoverPayload | null {
    if (this.draftPayload) return this.draftPayload;
    return this.currentSavedEntry?.payload ?? null;
  }

  mainPlainBody(): string {
    const payload = this.mainDisplayPayload;
    if (!payload) return '';
    return this.savedPayloadPlainBody(payload);
  }

  mainKeyPoints(): string[] {
    const payload = this.mainDisplayPayload;
    if (!payload) return [];
    return this.savedPayloadKeyPoints(payload);
  }

  /**
   * Sections à afficher (ordre fixe), uniquement si non vides après discover structuré.
   */
  get mainStructuredSections(): ReadonlyArray<DiscoverSectionViewRow> {
    const payload = this.mainDisplayPayload;
    return this.buildStructuredSectionRows(payload?.discoveredStructured ?? null);
  }

  /** Même rendu que la colonne « Proposition de réponse », pour une payload sauvegardée. */
  structuredSectionsForSavedPayload(payload: SavedDiscoverPayload): ReadonlyArray<DiscoverSectionViewRow> {
    return this.buildStructuredSectionRows(payload.discoveredStructured ?? null);
  }

  savedPayloadPlainBody(payload: SavedDiscoverPayload): string {
    const structured = payload.discoveredStructured ?? null;
    if (structured !== null && this.hasStructuredContent(structured)) return '';
    const text = (payload.discoveredProposition ?? '').trim();
    if (text.length > 0) return text;
    return '';
  }

  savedPayloadKeyPoints(payload: SavedDiscoverPayload): string[] {
    return (payload.discoveredKeyPoints ?? [])
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter((p) => p.length > 0);
  }

  private buildStructuredSectionRows(s: DiscoverStructuredProposition | null): DiscoverSectionViewRow[] {
    if (s === null || !this.hasStructuredContent(s)) return [];
    const rows: DiscoverSectionViewRow[] = [];
    const pushPlain = (
      titleKey: string,
      raw: string,
      imageLinks: DiscoverImageLink[] = [],
      keywords: string[] = []
    ): void => {
      const links = sanitizeDiscoverImageLinks(imageLinks);
      const t = stripSectionDisplayText(raw.trim(), links, keywords);
      if (t.length > 0 || links.length > 0) {
        rows.push({ kind: 'simple', titleKey, text: t, imageLinks: links });
      }
    };
    const pushRich = (
      titleKey: string,
      block: DiscoverRichBlock,
      imageLinks: DiscoverImageLink[] = [],
      keywords: string[] = []
    ): void => {
      const links = sanitizeDiscoverImageLinks(imageLinks);
      if (!this.richBlockHasContent(block) && links.length === 0) return;
      if (block.mode === 'plain') {
        const t = stripSectionDisplayText(block.text.trim(), links, keywords);
        if (t.length > 0 || links.length > 0) {
          rows.push({ kind: 'simple', titleKey, text: t, imageLinks: links });
        }
      } else {
        const subsections = block.subsections
          .map((sub) => ({
            ...sub,
            text: stripSectionDisplayText(sub.text, links, keywords)
          }))
          .filter((sub) => sub.text.trim().length > 0);
        if (subsections.length === 0 && links.length === 0) return;
        rows.push({ kind: 'nested', titleKey, subsections, imageLinks: links });
      }
    };
    pushPlain('discover.sectionIntroduction', s.introduction);
    pushPlain(
      'discover.sectionContext',
      s.contexte,
      s.contexteImageLinks,
      s.contexteKeywords
    );
    pushRich('discover.sectionAnalysis', s.analyse, s.analyseImageLinks, s.analyseKeywords);
    pushPlain('discover.sectionConclusion', s.conclusion);
    pushRich('discover.sectionExercise', s.exercice);
    return rows;
  }

  private parseSectionKeywords(o: Record<string, unknown>, section: 'contexte' | 'analyse'): string[] {
    const keys =
      section === 'contexte'
        ? ['contexte_mots_cles', 'contexteMotsCles', 'Contexte_mots_cles', 'contexte_keywords']
        : ['analyse_mots_cles', 'analyseMotsCles', 'Analyse_mots_cles', 'analyse_keywords'];
    return parseDiscoverKeywords(this.pickFirst(o, keys));
  }

  private parseSectionImageLinks(o: Record<string, unknown>, section: 'contexte' | 'analyse'): DiscoverImageLink[] {
    const keys =
      section === 'contexte'
        ? [
            'contexte_liens_images',
            'contexteLiensImages',
            'contexte_image_links',
            'contexteImageLinks'
          ]
        : [
            'analyse_liens_images',
            'analyseLiensImages',
            'analyse_image_links',
            'analyseImageLinks'
          ];
    return parseDiscoverImageLinks(this.pickFirst(o, keys));
  }

  /** Proposition structurée déjà sauvegardée (sans repasser par tryParse strict). */
  private enrichStoredStructured(o: Record<string, unknown>): DiscoverStructuredProposition | null {
    if (!this.recordHasKeyCi(o, 'introduction')) return null;
    const contexteLinks = this.parseSectionImageLinks(o, 'contexte');
    const contexteKw = this.parseSectionKeywords(o, 'contexte');
    const analyseLinks = this.parseSectionImageLinks(o, 'analyse');
    const analyseKw = this.parseSectionKeywords(o, 'analyse');
    const contexteText = stripSectionDisplayText(
      this.coerceDiscoverSection(this.pickFirst(o, ['contexte', 'Contexte', 'context'])),
      contexteLinks,
      contexteKw
    );
    return {
      introduction: this.coerceDiscoverSection(this.pickFirst(o, ['introduction', 'Introduction'])),
      contexte: contexteText,
      contexteKeywords: contexteKw,
      contexteImageLinks: contexteLinks,
      analyse: this.parseRichBlock(this.pickFirst(o, ['analyse', 'Analyse', 'analysis']), 'analyse'),
      analyseKeywords: analyseKw,
      analyseImageLinks: analyseLinks,
      conclusion: this.coerceDiscoverSection(this.pickFirst(o, ['conclusion', 'Conclusion'])),
      exercice: this.parseRichBlock(
        this.pickFirst(o, ['exercice', 'Exercice', 'exercise', 'exercises']),
        'exercice'
      )
    };
  }

  /** Texte et points clés — ancien format JSON (hors blocs introduction / Contexte / …). */
  private parseDiscoverLegacyResponse(response: unknown): { text: string; keyPoints: string[] } {
    const payload = this.normalizeDiscoverPayload(response);
    return {
      text: this.extractPropositionTextFromApi(payload),
      keyPoints: this.extractKeyPointsFromApi(payload)
    };
  }

  private tryParseStructuredDiscover(raw: unknown): DiscoverStructuredProposition | null {
    const root = this.normalizeDiscoverPayload(raw);
    const candidates: Record<string, unknown>[] = [];
    if (root !== null && typeof root === 'object' && !Array.isArray(root)) {
      const o = root as Record<string, unknown>;
      candidates.push(o);
      for (const wrap of ['data', 'result', 'response', 'body']) {
        const v = o[wrap];
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          candidates.push(v as Record<string, unknown>);
        }
      }
    }
    for (const o of candidates) {
      if (!this.looksLikeStructuredDiscoverProposition(o)) continue;
      const contexteRaw = this.coerceDiscoverSection(
        this.pickFirst(o, ['Contexte', 'contexte', 'Context', 'context'])
      );
      const analyseRaw = this.pickFirst(o, ['Analyse', 'analyse', 'Analysis', 'analysis']);
      const contexteLinks = this.parseSectionImageLinks(o, 'contexte');
      const contexteKw = this.parseSectionKeywords(o, 'contexte');
      const analyseLinks = this.parseSectionImageLinks(o, 'analyse');
      const analyseKw = this.parseSectionKeywords(o, 'analyse');
      return {
        introduction: this.coerceDiscoverSection(this.pickFirst(o, ['introduction', 'Introduction'])),
        contexte: stripSectionDisplayText(contexteRaw, contexteLinks, contexteKw),
        contexteKeywords: contexteKw,
        contexteImageLinks: contexteLinks,
        analyse: this.parseRichBlock(analyseRaw, 'analyse'),
        analyseKeywords: analyseKw,
        analyseImageLinks: analyseLinks,
        conclusion: this.coerceDiscoverSection(this.pickFirst(o, ['Conclusion', 'conclusion'])),
        exercice: this.parseRichBlock(
          this.pickFirst(o, [
            'exercice',
            'Exercice',
            'EXERCICE',
            'Exercise',
            'exercise',
            'Exercices',
            'exercises'
          ]),
          'exercice'
        )
      };
    }
    return null;
  }

  private looksLikeStructuredDiscoverProposition(o: Record<string, unknown>): boolean {
    if (!this.recordHasKeyCi(o, 'introduction')) return false;
    return (
      this.recordHasKeyCi(o, 'contexte') ||
      this.recordHasKeyCi(o, 'context') ||
      this.recordHasKeyCi(o, 'analyse') ||
      this.recordHasKeyCi(o, 'analysis') ||
      this.recordHasKeyCi(o, 'conclusion') ||
      this.recordHasKeyCi(o, 'exercice') ||
      this.recordHasKeyCi(o, 'exercise') ||
      this.recordHasKeyCi(o, 'exercises')
    );
  }

  /** Compare les noms de clés JSON (casse ignorée), y compris alias usuels sans normalisation Unicode lourde. */
  private recordHasKeyCi(o: Record<string, unknown>, name: string): boolean {
    const needle = name.toLowerCase();
    return Object.keys(o).some((k) => k.toLowerCase() === needle);
  }

  private pickFirst(o: Record<string, unknown>, keys: string[]): unknown {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(o, k)) return o[k];
    }
    const map = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k] as const));
    for (const k of keys) {
      const orig = map.get(k.toLowerCase());
      if (orig !== undefined) return o[orig];
    }
    return undefined;
  }

  /** Objet sérialisé depuis le front (`{ mode, text }` ou `{ mode, subsections }`). */
  private isSerializedRichBlockObject(raw: unknown): raw is Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const mode = (raw as Record<string, unknown>)['mode'];
    return mode === 'plain' || mode === 'keyed';
  }

  private parseSerializedRichBlock(o: Record<string, unknown>, parent?: 'analyse' | 'exercice'): DiscoverRichBlock | null {
    if (o['mode'] === 'plain') {
      const textRaw = o['text'] ?? o['Text'] ?? o['body'] ?? '';
      return {
        mode: 'plain',
        text: this.coerceDiscoverSection(textRaw).trim()
      };
    }
    if (o['mode'] === 'keyed') {
      const rawSubs = o['subsections'] ?? o['subSections'];
      if (!Array.isArray(rawSubs)) {
        return { mode: 'keyed', subsections: [] };
      }
      const subsections: DiscoverSubsection[] = [];
      for (const item of rawSubs) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const s = item as Record<string, unknown>;
        const text = this.coerceDiscoverSection(s['text'] ?? s['Text']).trim();
        if (!text) continue;
        const title = String(s['title'] ?? s['Title'] ?? '').trim();
        subsections.push({
          title,
          text,
          omitTitle: Boolean(s['omitTitle'] ?? s['omit_title'])
        });
      }
      return { mode: 'keyed', subsections };
    }
    return null;
  }

  /**
   * Analyse / Exercice : chaîne ou tableau → bloc plat ; objet → une sous-section par clé (titre = clé).
   * @param parent Permet d’éviter un sous-titre identique au titre de section (ex. clé « Analyse »).
   */
  private parseRichBlock(raw: unknown, parent?: 'analyse' | 'exercice'): DiscoverRichBlock {
    if (raw == null) return { mode: 'plain', text: '' };
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      return { mode: 'plain', text: this.coerceDiscoverSection(raw) };
    }
    if (Array.isArray(raw)) {
      if (isDiscoverKeywordsArray(raw)) {
        return { mode: 'plain', text: '' };
      }
      return { mode: 'plain', text: this.coerceDiscoverSection(raw) };
    }
    const o = raw as Record<string, unknown>;
    const serialized = this.parseSerializedRichBlock(o, parent);
    if (serialized) return serialized;

    const keys = Object.keys(o).filter((k) => o[k] != null);
    if (keys.length === 0) return { mode: 'plain', text: '' };
    const subsections: DiscoverSubsection[] = [];
    for (const key of keys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
      if (this.isDiscoverMetadataJsonKey(key)) continue;
      let text = this.coerceDiscoverSection(o[key]).trim();
      if (text.length === 0) continue;
      const title = this.formatDiscoverSubsectionKey(key);
      text = this.stripLeadingHeadingDuplicate(text, title);
      const omitTitle = this.isRedundantSubsectionKey(key, parent);
      subsections.push({ title, text, omitTitle });
    }
    if (subsections.length === 0) return { mode: 'plain', text: '' };
    return { mode: 'keyed', subsections };
  }

  /** Clé JSON qui reprend le nom de la section parente (affichage : pas de h4 en doublon). */
  private isRedundantSubsectionKey(key: string, parent: 'analyse' | 'exercice' | undefined): boolean {
    if (!parent) return false;
    const label = this.formatDiscoverSubsectionKey(key)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    const variants =
      parent === 'analyse'
        ? ['analyse', 'analysis']
        : ['exercice', 'exercise', 'exercices', 'exercises'];
    return variants.includes(label);
  }

  /**
   * Si le corps commence par la même ligne que le titre (ou « titre : »), on retire cette répétition.
   */
  private stripLeadingHeadingDuplicate(body: string, title: string): string {
    const lines = body.split(/\r?\n/);
    if (lines.length === 0) return body;
    const firstRaw = lines[0].trim();
    const titleNorm = title.trim();
    const firstNorm = this.normalizeHeadingForCompare(firstRaw);
    const titleCmp = this.normalizeHeadingForCompare(titleNorm);
    if (firstNorm === titleCmp) {
      return lines.slice(1).join('\n').replace(/^\s+/, '');
    }
    const firstNoColon = this.normalizeHeadingForCompare(firstRaw.replace(/:\s*$/, ''));
    if (firstNoColon === titleCmp) {
      return lines.slice(1).join('\n').replace(/^\s+/, '');
    }
    return body;
  }

  private normalizeHeadingForCompare(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[*#_`]/g, '')
      .trim();
  }

  /** Libellé affiché pour une clé d’objet (ex. snake_case → espaces). */
  private formatDiscoverSubsectionKey(key: string): string {
    const d = this.decodeQuestionText(key).trim();
    return d.replace(/_/g, ' ');
  }

  private richBlockHasContent(block: DiscoverRichBlock): boolean {
    if (block.mode === 'plain') return block.text.trim().length > 0;
    return block.subsections.some((s) => s.text.trim().length > 0);
  }

  private isDiscoverImageLinkObject(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const o = raw as Record<string, unknown>;
    const url = o['url'] ?? o['href'] ?? o['lien'] ?? o['link'];
    const fichier = o['fichier'] ?? o['file'] ?? o['filename'];
    const hasUrl = typeof url === 'string' && url.trim().length > 0;
    const hasFichier = typeof fichier === 'string' && fichier.trim().length > 0;
    if (!hasUrl && !hasFichier) return false;
    return (
      typeof o['label'] === 'string' ||
      typeof o['titre'] === 'string' ||
      typeof o['title'] === 'string' ||
      typeof o['legende'] === 'string' ||
      Object.keys(o).length <= 4
    );
  }

  private coerceDiscoverSection(raw: unknown): string {
    if (raw == null) return '';
    if (this.isSerializedRichBlockObject(raw)) return '';
    if (this.isDiscoverImageLinkObject(raw)) return '';
    if (typeof raw === 'string') return this.decodeQuestionText(raw).trim();
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw).trim();
    if (Array.isArray(raw)) {
      if (isDiscoverKeywordsArray(raw)) {
        return '';
      }
      return raw
        .map((x) => this.coerceDiscoverSection(x))
        .filter((x) => x.length > 0)
        .join('\n')
        .trim();
    }
    if (typeof raw === 'object') {
      const fromKnown = this.extractPropositionTextFromApi(raw);
      if (fromKnown.trim().length > 0) return fromKnown.trim();
      /* Objet avec plusieurs champs texte (ex. Analyse / exercice structurés côté backend) : tout agréger. */
      const o = raw as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(o).sort()) {
        if (this.isDiscoverMetadataJsonKey(key)) continue;
        if (
          /^(url|href|lien|link|fichier|file|filename|thumbnailurl|thumbnail_url|pageurl|page_url|pexelsurl|pexels_url|mot_cle|motcle|keyword)$/i.test(
            key
          )
        ) {
          continue;
        }
        const v = o[key];
        if (v == null) continue;
        const piece = this.coerceDiscoverSection(v);
        if (piece.length > 0) parts.push(piece);
      }
      return parts.join('\n\n').trim();
    }
    return '';
  }

  private hasStructuredContent(s: DiscoverStructuredProposition): boolean {
    return (
      this.sectionTextHasContent(s.introduction) ||
      this.sectionTextHasContent(s.contexte) ||
      s.contexteImageLinks.length > 0 ||
      this.richBlockHasContent(s.analyse) ||
      s.analyseImageLinks.length > 0 ||
      this.sectionTextHasContent(s.conclusion) ||
      this.richBlockHasContent(s.exercice)
    );
  }

  private isDiscoverMetadataJsonKey(key: string): boolean {
    const k = key.toLowerCase().replace(/_/g, '');
    return (
      k.includes('liensimages') ||
      k.includes('imagelinks') ||
      k.includes('motscles') ||
      k.endsWith('keywords') ||
      k.endsWith('keyword')
    );
  }

  private sectionTextHasContent(t: string): boolean {
    return t.trim().length > 0;
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

  hasMainDisplayContent(): boolean {
    const payload = this.mainDisplayPayload;
    return payload !== null && this.savedPayloadHasContent(payload);
  }

  get currentQuestionSavedPropositions(): ReadonlyArray<SavedDiscoverPropositionEntry> {
    if (!this.selectedQuestionId) return [];
    return this.savedPropositionsByQuestionId[this.selectedQuestionId] ?? [];
  }

  get canSaveDraft(): boolean {
    return (
      this.selectedQuestionId !== null &&
      this.draftPayload !== null &&
      this.savedPayloadHasContent(this.draftPayload) &&
      !this.savingSavedProposition
    );
  }

  cancelDraft(): void {
    if (this.draftPayload && this.savedPayloadHasContent(this.draftPayload)) {
      this.logDiscoverActivityEvent('proposition_discarded');
    }
    this.draftPayload = null;
  }

  saveDraftProposition(): void {
    if (!this.canSaveDraft || !this.draftPayload || !this.selectedQuestionId) return;
    const questionId = this.selectedQuestionId;
    const idTheme = this.parseIntegerId(this.selectedThemeId);
    const idSubtheme = this.parseIntegerId(this.selectedSubThemeId);
    const idQuestion = this.parseIntegerId(this.selectedQuestionId);
    if (idTheme === null || idSubtheme === null || idQuestion === null) {
      this.snackBar.open(
        this.translate.instant('discover.savedStoreError'),
        this.translate.instant('common.close'),
        { duration: 3500 }
      );
      return;
    }
    const storePayload: StoreSavedDiscoverPropositionPayload = {
      id_theme: idTheme,
      id_subtheme: idSubtheme,
      id_question: idQuestion,
      proposition_payload: this.cloneDiscoverPayload(this.draftPayload),
      notes: this.personalNotes
    };
    this.savingSavedProposition = true;
    this.api.storeSavedDiscoverProposition(storePayload).subscribe({
      next: () => {
        this.logDiscoverActivityEvent('proposition_saved');
        this.draftPayload = null;
        this.personalNotesDirty = false;
        this.loadSavedPropositionsForQuestion(questionId);
        this.savingSavedProposition = false;
        this.snackBar.open(
          this.translate.instant('discover.savedPropositionStored'),
          this.translate.instant('common.close'),
          { duration: 2500 }
        );
      },
      error: () => {
        this.savingSavedProposition = false;
        this.snackBar.open(
          this.translate.instant('discover.savedStoreError'),
          this.translate.instant('common.close'),
          { duration: 3500 }
        );
      }
    });
  }

  setCurrentSavedProposition(entry: SavedDiscoverPropositionEntry, event?: Event): void {
    event?.stopPropagation();
    if (!entry.dbId || entry.statutCurrent || this.settingCurrentPropositionId === entry.id) {
      return;
    }
    this.settingCurrentPropositionId = entry.id;
    this.api.setCurrentDiscoverProposition(entry.dbId).subscribe({
      next: () => {
        const qid = entry.questionId;
        this.loadSavedPropositionsForQuestion(qid);
        this.settingCurrentPropositionId = null;
        if (this.draftPayload) this.draftPayload = null;
        this.snackBar.open(
          this.translate.instant('discover.setCurrentSuccess'),
          this.translate.instant('common.close'),
          { duration: 2500 }
        );
      },
      error: () => {
        this.settingCurrentPropositionId = null;
        this.snackBar.open(
          this.translate.instant('discover.setCurrentError'),
          this.translate.instant('common.close'),
          { duration: 3500 }
        );
      }
    });
  }

  /** Affiche la date de sauvegarde issue de ``proposition.date_creation``. */
  formatSavedPropositionDate(entry: SavedDiscoverPropositionEntry): string {
    const stored = entry.dateCreation?.trim();
    if (stored) return stored;
    if (entry.createdAt > 0) {
      return new Intl.DateTimeFormat(this.translate.currentLang === 'fr' ? 'fr-FR' : 'en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(entry.createdAt));
    }
    return '';
  }

  deleteSavedProposition(entry: SavedDiscoverPropositionEntry, event?: Event): void {
    event?.stopPropagation();
    if (!entry.dbId || this.deletingSavedPropositionId === entry.id) return;
    this.deletingSavedPropositionId = entry.id;
    this.api.deleteSavedDiscoverProposition(entry.dbId).subscribe({
      next: () => {
        const qid = entry.questionId;
        const existing = this.savedPropositionsByQuestionId[qid] ?? [];
        const updated = existing.filter((x) => x.id !== entry.id);
        this.savedPropositionsByQuestionId = {
          ...this.savedPropositionsByQuestionId,
          [qid]: updated
        };
        this.snackBar.open(
          this.translate.instant('discover.savedDeleteSuccess'),
          this.translate.instant('common.close'),
          { duration: 2500 }
        );
      },
      error: () => {
        this.snackBar.open(
          this.translate.instant('discover.savedDeleteError'),
          this.translate.instant('common.close'),
          { duration: 3500 }
        );
      },
      complete: () => {
        this.deletingSavedPropositionId = null;
      }
    });
  }

  private buildDiscoverPayloadFromApiResponse(response: unknown): SavedDiscoverPayload {
    const structured = this.tryParseStructuredDiscover(response);
    if (structured) {
      return {
        discoveredProposition: '',
        discoveredKeyPoints: [],
        discoveredStructured: structured
      };
    }
    const { text, keyPoints } = this.parseDiscoverLegacyResponse(response);
    return {
      discoveredProposition: text,
      discoveredKeyPoints: keyPoints,
      discoveredStructured: null
    };
  }

  private savedPayloadHasContent(payload: SavedDiscoverPayload): boolean {
    const structured = payload.discoveredStructured;
    if (structured !== null && this.hasStructuredContent(structured)) return true;
    if ((payload.discoveredProposition ?? '').trim().length > 0) return true;
    return (payload.discoveredKeyPoints ?? []).some((p) => p.trim().length > 0);
  }

  private cloneDiscoverPayload(payload: SavedDiscoverPayload): SavedDiscoverPayload {
    return {
      discoveredProposition: payload.discoveredProposition,
      discoveredKeyPoints: [...payload.discoveredKeyPoints],
      discoveredStructured: payload.discoveredStructured
        ? (JSON.parse(JSON.stringify(payload.discoveredStructured)) as DiscoverStructuredProposition)
        : null
    };
  }

  private loadSavedPropositionsForQuestion(questionId: string): void {
    const idQuestion = this.parseIntegerId(questionId);
    if (idQuestion === null) {
      this.savedPropositionsByQuestionId[questionId] = [];
      return;
    }
    this.loadingSavedPropositions = true;
    this.savedPropositionsError = '';
    this.api.getSavedDiscoverPropositionsByQuestion(idQuestion).subscribe({
      next: (rawResponse) => {
        const rows = this.coerceSavedPropositionsResponse(rawResponse);
        const mapped = rows
          .map((r) => this.normalizeSavedRowLoose(r, questionId))
          .filter((x): x is SavedDiscoverPropositionEntry => x !== null);
        this.savedPropositionsByQuestionId = {
          ...this.savedPropositionsByQuestionId,
          [questionId]: mapped
        };
      },
      error: (err: HttpErrorResponse) => {
        /* Endpoint absent côté backend (404) : on garde la page fonctionnelle sans bruit d'erreur bloquant. */
        if (err.status === 404) {
          this.savedPropositionsError = '';
          this.savedPropositionsByQuestionId = {
            ...this.savedPropositionsByQuestionId,
            [questionId]: []
          };
          if (this.selectedQuestionId === questionId) {
            this.syncPersonalNotesFromCurrentEntry();
          }
          return;
        }
        this.savedPropositionsError = this.translate.instant('discover.savedLoadError');
        this.savedPropositionsByQuestionId = {
          ...this.savedPropositionsByQuestionId,
          [questionId]: []
        };
        if (this.selectedQuestionId === questionId) {
          this.syncPersonalNotesFromCurrentEntry();
        }
      },
      complete: () => {
        this.loadingSavedPropositions = false;
        if (this.selectedQuestionId === questionId) {
          this.syncPersonalNotesFromCurrentEntry();
        }
      }
    });
  }

  /** Liste renvoyée telle quelle ou dans une enveloppe { data }, selon le backend. */
  private coerceSavedPropositionsResponse(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      for (const key of ['data', 'results', 'items', 'propositions', 'saved_propositions']) {
        const v = o[key];
        if (Array.isArray(v)) return v;
      }
    }
    return [];
  }

  /**
   * Normalise une ligne API même si les clés varient (camelCase / snake_case) ou si les ids sont des chaînes.
   */
  private normalizeSavedRowLoose(raw: unknown, fallbackQuestionId: string): SavedDiscoverPropositionEntry | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;

    /* Backend : id_proposition + objet proposition { id_theme, id_subtheme, proposition_payload?, … } */
    const dbId = this.coercePositiveInt(
      o['id_proposition'] ?? o['idProposition'] ?? o['id']
    );
    const rowQuestionId = this.coercePositiveInt(o['id_question'] ?? o['idQuestion']);
    const questionId = rowQuestionId !== null ? String(rowQuestionId) : fallbackQuestionId;

    if (dbId === null) return null;

    const dateCreationRaw = o['date_creation'] ?? o['dateCreation'];
    const dateCreation =
      typeof dateCreationRaw === 'string' ? dateCreationRaw.trim() : '';
    const createdAt = this.toTimestamp(dateCreationRaw) ?? 0;

    const payloadRaw =
      o['proposition'] ??
      o['proposition_payload'] ??
      o['propositionPayload'] ??
      o['payload'] ??
      o['body'];

    const payload = this.normalizeSavedPayload(payloadRaw);
    if (!payload) return null;

    const statutCurrent = this.coerceStatutCurrent(o['statut_current'] ?? o['statutCurrent']);
    const notes = typeof o['notes'] === 'string' ? o['notes'] : '';

    return {
      id: `saved-db-${dbId}`,
      dbId,
      questionId,
      dateCreation,
      createdAt,
      statutCurrent,
      notes,
      payload
    };
  }

  private toTimestamp(dateLike: unknown): number | null {
    if (typeof dateLike !== 'string' || !dateLike.trim()) return null;
    const s = dateLike.trim();
    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/u.exec(s);
    if (fr) {
      const day = Number(fr[1]);
      const month = Number(fr[2]) - 1;
      const year = Number(fr[3]);
      const hour = fr[4] !== undefined ? Number(fr[4]) : 0;
      const minute = fr[5] !== undefined ? Number(fr[5]) : 0;
      const d = new Date(year, month, day, hour, minute);
      return Number.isFinite(d.getTime()) ? d.getTime() : null;
    }
    const n = Date.parse(s);
    return Number.isFinite(n) ? n : null;
  }

  private normalizeSavedPayload(raw: unknown): SavedDiscoverPayload | null {
    let node: unknown = raw;

    if (typeof raw === 'string') {
      const t = raw.trim();
      if (!t) {
        return { discoveredProposition: '', discoveredKeyPoints: [], discoveredStructured: null };
      }
      try {
        node = JSON.parse(t) as unknown;
      } catch {
        return { discoveredProposition: t, discoveredKeyPoints: [], discoveredStructured: null };
      }
    }

    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      const fallback =
        raw === undefined || raw === null ? '' : typeof raw === 'string' ? raw.trim() : String(raw).trim();
      return {
        discoveredProposition: fallback,
        discoveredKeyPoints: [],
        discoveredStructured: null
      };
    }

    const o = node as Record<string, unknown>;

    /* Enregistrement tel que POST store : { id_theme, id_subtheme, id_question, proposition_payload } */
    const explicitEnvelope =
      o['proposition_payload'] ?? o['propositionPayload'];
    if (explicitEnvelope !== undefined) {
      return this.normalizeSavedPayload(explicitEnvelope);
    }

    /* Même niveau : métadonnées DB + contenu Discover — on retire les ids pour parser le reste */
    const metaKeys = new Set([
      'id_theme',
      'id_subtheme',
      'id_question',
      'idTheme',
      'idSubtheme',
      'idQuestion'
    ]);
    const hasMeta = Object.keys(o).some((k) => metaKeys.has(k));
    if (
      hasMeta &&
      o['discoveredProposition'] === undefined &&
      o['discovered_proposition'] === undefined &&
      o['discoveredStructured'] === undefined &&
      o['discovered_structured'] === undefined
    ) {
      const stripped: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (!metaKeys.has(k)) stripped[k] = v;
      }
      if (Object.keys(stripped).length > 0) {
        return this.normalizeSavedPayload(stripped);
      }
    }

    /* Payload imbriqué côté stockage */
    if (
      o['discoveredStructured'] === undefined &&
      o['discoveredProposition'] === undefined &&
      o['discovered_proposition'] === undefined &&
      typeof o['payload'] === 'object' &&
      o['payload'] !== null &&
      !Array.isArray(o['payload'])
    ) {
      return this.normalizeSavedPayload(o['payload']);
    }

    const discoveredProposition =
      typeof o['discoveredProposition'] === 'string'
        ? o['discoveredProposition']
        : typeof o['discovered_proposition'] === 'string'
          ? o['discovered_proposition']
          : '';

    const kpRaw = o['discoveredKeyPoints'] ?? o['discovered_key_points'];
    const discoveredKeyPoints = Array.isArray(kpRaw)
      ? kpRaw.filter((x): x is string => typeof x === 'string')
      : [];

    const structuredRaw = o['discoveredStructured'] ?? o['discovered_structured'];
    let discoveredStructured: DiscoverStructuredProposition | null = null;
    if (structuredRaw && typeof structuredRaw === 'object' && !Array.isArray(structuredRaw)) {
      discoveredStructured =
        this.tryParseStructuredDiscover(structuredRaw) ??
        this.enrichStoredStructured(structuredRaw as Record<string, unknown>);
    }

    if (!discoveredStructured) {
      const parsedRoot = this.tryParseStructuredDiscover(node);
      if (parsedRoot !== null) discoveredStructured = parsedRoot;
    }

    if (
      !discoveredStructured &&
      (!discoveredProposition.trim() && discoveredKeyPoints.length === 0)
    ) {
      const legacyText = this.extractPropositionTextFromApi(node);
      const legacyKp = this.extractKeyPointsFromApi(node);
      if (legacyText.trim().length > 0 || legacyKp.length > 0) {
        return {
          discoveredProposition: legacyText,
          discoveredKeyPoints: legacyKp,
          discoveredStructured: null
        };
      }
    }

    return { discoveredProposition, discoveredKeyPoints, discoveredStructured };
  }

  private coerceStatutCurrent(raw: unknown): boolean {
    if (raw === true || raw === 1) return true;
    if (raw === false || raw === null || raw === undefined || raw === 0) return false;
    if (typeof raw === 'string') {
      const v = raw.trim().toLowerCase();
      if (v === 'true' || v === 't' || v === '1' || v === 'yes' || v === 'oui') return true;
      if (v === 'false' || v === 'f' || v === '0' || v === 'no' || v === 'non' || v === '') {
        return false;
      }
      return false;
    }
    return false;
  }

  private coercePositiveInt(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const n = Math.floor(value);
      return n > 0 ? n : null;
    }
    const s = String(value).trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }

  private endActiveSubthemeSession(): void {
    if (this.activeSubthemeSessionId == null) {
      this.trackedSubthemeId = null;
      return;
    }
    const sessionId = this.activeSubthemeSessionId;
    this.activeSubthemeSessionId = null;
    this.trackedSubthemeId = null;
    this.api
      .endSubthemeSession(sessionId)
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  private beginSubthemeSessionIfNeeded(): void {
    const subId = this.selectedSubThemeId?.trim();
    if (!subId) {
      this.endActiveSubthemeSession();
      return;
    }
    if (this.trackedSubthemeId === subId && this.activeSubthemeSessionId != null) {
      return;
    }
    this.endActiveSubthemeSession();
    const idSubtheme = this.parseIntegerId(subId);
    if (idSubtheme === null) return;
    const idTheme = this.parseIntegerId(this.selectedThemeId);
    this.trackedSubthemeId = subId;
    this.api
      .startSubthemeSession({
        id_theme: idTheme,
        id_subtheme: idSubtheme,
        source: 'discover'
      })
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        const idSession =
          res && typeof res === 'object' && 'id_session' in res
            ? Number((res as { id_session: number }).id_session)
            : null;
        if (idSession != null && Number.isFinite(idSession) && this.trackedSubthemeId === subId) {
          this.activeSubthemeSessionId = idSession;
        }
      });
  }

  private logDiscoverActivityEvent(
    eventType: DiscoverActivityPayload['event_type'],
    extra?: {
      id_question?: number | null;
      id_proposition?: number | null;
      meta?: Record<string, unknown> | null;
    }
  ): void {
    this.api
      .logDiscoverActivity({
        id_theme: this.parseIntegerId(this.selectedThemeId),
        id_subtheme: this.parseIntegerId(this.selectedSubThemeId),
        id_question:
          extra?.id_question !== undefined
            ? extra.id_question
            : this.parseIntegerId(this.selectedQuestionId ?? ''),
        event_type: eventType,
        id_proposition: extra?.id_proposition ?? null,
        meta: extra?.meta ?? null
      })
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  private draftPayloadHasExercise(payload: SavedDiscoverPayload): boolean {
    const structured = payload.discoveredStructured;
    return structured != null && this.richBlockHasContent(structured.exercice);
  }

  private parseIntegerId(value: string): number | null {
    const n = Number(String(value).trim());
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }

  private clampPercent(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
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
    if (stringValues.length > 1) {
      return stringValues.map((s) => this.decodeQuestionText(s).trim()).join('\n\n').trim();
    }

    return '';
  }
}
