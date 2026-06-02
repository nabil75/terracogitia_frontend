import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  afterNextRender
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, of } from 'rxjs';

import { Chart, ChartConfiguration, registerables } from 'chart.js';
import * as d3 from 'd3';

import {
  ApiService,
  EvaluationRecord,
  SubThemeStats
} from '../../api/api.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';
import { ThemeService } from '../../shared/services/theme.service';
import { DisciplineService } from '../../shared/services/discipline.service';
import { InactiveThemeVisibilityService } from '../../shared/services/inactive-theme-visibility.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import {
  GaugePathPickerDialogComponent,
  GaugePathPickerDialogData
} from './dialogs/gauge-path-picker-dialog.component';
import {
  RadarThemePickerDialogComponent,
  RadarThemePickerDialogData
} from './dialogs/radar-theme-picker-dialog.component';

Chart.register(...registerables);

interface ThemeNode {
  id: string;
  label: string;
  description?: string;
  subThemes: SubThemeNode[];
}

interface SubThemeNode {
  id: string;
  label: string;
  description?: string;
  /** Renseigné après jointure avec les agrégats d’évaluations. */
  stats?: SubThemeStats;
}

/** Cible navigation « Review » — stockée sur chaque série radar (parcours). */
interface RadarDatasetReviewTarget {
  themeId: string;
  subThemeId: string;
  themeLabel: string;
  subThemeLabel: string;
}

type RadarChartDataset = ChartConfiguration<'radar'>['data']['datasets'][number] & {
  reviewTarget?: RadarDatasetReviewTarget;
};

interface MindMapNode {
  name: string;
  level: 'root' | 'theme' | 'subtheme';
  data?: ThemeNode | SubThemeNode;
  children?: MindMapNode[];
}

/** Agrégat au niveau thème, dérivé des stats par sous-thème. */
interface ThemeAggregate {
  theme: ThemeNode;
  evaluation_count: number;
  avg_note: number | null;
  min_note: number | null;
  max_note: number | null;
}

/** Stats affichées sur une jauge (tout le thème ou un parcours choisi). */
interface GaugeCardStats {
  evaluation_count: number;
  avg_note: number | null;
  min_note: number | null;
  max_note: number | null;
}

/** Couleurs pour Chart.js / canvas, alignées sur les variables CSS du thème actif. */
interface ChartThemeColors {
  text: string;
  muted: string;
  grid: string;
  legendColor: string;
  smoothedLine: string;
  rawNoteLine: string;
  rawNoteFill: string;
  fillAreaSmoothed: string;
  gaugeTrack: string;
  tooltipBg: string;
  tooltipBorder: string;
}

/** Tranche d'exploration selon le nombre d'évaluations (mindmap + badges). */
type ExplorationTier = 'none' | 'early' | 'progress' | 'full';

function explorationTier(count: number): ExplorationTier {
  const n = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
  if (n === 0) return 'none';
  if (n < 3) return 'early';
  if (n <= 6) return 'progress';
  return 'full';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    TransverseRailComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatTooltipModule,
    TranslateModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mindMapHost', { static: false })
  mindMapHost?: ElementRef<HTMLDivElement>;

  @ViewChild('radarCanvas', { static: false })
  radarCanvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('progressionCanvas', { static: false })
  progressionCanvas?: ElementRef<HTMLCanvasElement>;

  @ViewChildren('gaugeCanvas')
  gaugeCanvases?: QueryList<ElementRef<HTMLCanvasElement>>;

  loading = true;
  loadError = '';

  themes: ThemeNode[] = [];
  allEvaluations: EvaluationRecord[] = [];
  statsBySubThemeKey: Record<string, SubThemeStats> = {};

  /** Indique si une discipline précise est sélectionnée (sinon les deux moitiés sont identiques). */
  hasSelectedDiscipline = false;

  /** Compteurs filtrés sur la discipline courante. */
  currentTotalEvaluations = 0;
  currentExploredSubThemesCount = 0;
  currentTotalSubThemesCount = 0;
  currentAverageNote: number | null = null;

  /** Compteurs toutes disciplines confondues. */
  totalEvaluations = 0;
  exploredSubThemesCount = 0;
  totalSubThemesCount = 0;
  globalAverageNote: number | null = null;

  /** Index global (toutes disciplines) — utilisé uniquement pour les compteurs « globaux ». */
  private allThemesFlat: Array<{ id_theme: string; id_subtheme: string }> = [];
  private currentDisciplineThemeIds = new Set<number>();

  /** Vue sélectionnée pour le radar (null = agrégé global). */
  selectedThemeIdForRadar: string | null = null;

  /**
   * Par thème : id du parcours sélectionné pour la jauge (absent ou chaîne vide = tous les parcours).
   */
  gaugeParcoursByThemeId: Record<string, string> = {};

  private radarChart?: Chart;
  private progressionChart?: Chart;
  private gaugeCharts: Chart[] = [];
  private resizeObserver?: ResizeObserver;

  private readonly apiService = inject(ApiService);
  private readonly injector = inject(Injector);
  private readonly themeService = inject(ThemeService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly inactiveThemeVisibility = inject(InactiveThemeVisibilityService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private langSub?: Subscription;
  private gaugeCanvasListSub?: Subscription;

  /** Re-dessine graphiques + mindmap quand on bascule clair / sombre. */
  private readonly rechartOnTheme = effect(() => {
    this.themeService.activeTheme();
    if (!this.loading && this.themes.length > 0) {
      this.scheduleVisualizationRender();
    }
  });

  /** Recharge les données quand la discipline active change (sauf au premier appel — `ngOnInit` s'en charge). */
  private firstDisciplineRun = true;
  private readonly reloadOnDiscipline = effect(() => {
    this.disciplineService.selectedDisciplineId();
    if (this.firstDisciplineRun) {
      this.firstDisciplineRun = false;
      return;
    }
    this.loadDashboardData();
  });

  /** Re-dessine quand on masque/affiche les thèmes sans parcours depuis la transverse rail. */
  private readonly rechartOnInactiveToggle = effect(() => {
    this.inactiveThemeVisibility.showInactiveThemes();
    if (!this.loading && this.themes.length > 0) {
      if (
        this.selectedThemeIdForRadar &&
        !this.themesForVisuals().some((t) => t.id === this.selectedThemeIdForRadar)
      ) {
        this.selectedThemeIdForRadar = null;
      }
      this.sanitizeGaugeSelections();
      this.scheduleVisualizationRender();
    }
  });

  ngOnInit(): void {
    this.langSub = this.translate.onLangChange.subscribe(() => {
      if (!this.loading && this.themes.length > 0) {
        this.scheduleVisualizationRender();
      }
    });
    this.loadDashboardData();
  }

  ngAfterViewInit(): void {
    /* Les canvas des jauges / radar / progression ne sont pas tous montés tant que l’onglet
       correspondant n’a pas été affiché : on re-rend quand la liste change. */
    this.gaugeCanvasListSub = this.gaugeCanvases?.changes.subscribe(() => {
      if (!this.loading && this.themes.length > 0) {
        this.scheduleVisualizationRender();
      }
    });
  }

  /**
   * Quand les corps d’onglets Material passent visible/invisible, Chart.js et le layout du SVG
   * ont besoin d’un rendu après stabilisation du cadre (évite canvas à taille 0 au premier chargement).
   */
  onDashboardTabChanged(): void {
    if (this.loading || this.themes.length === 0) return;
    this.scheduleVisualizationRender();
  }

  private scheduleVisualizationRender(): void {
    afterNextRender(
      () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => this.renderAllVisualizations());
        });
      },
      { injector: this.injector }
    );
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
    this.gaugeCanvasListSub?.unsubscribe();
    this.destroyCharts();
    this.resizeObserver?.disconnect();
    this.inactiveThemeVisibility.setInactiveThemesCount(0);
  }

  private themeHasPaths(theme: ThemeNode): boolean {
    return Array.isArray(theme.subThemes) && theme.subThemes.length > 0;
  }

  private themesForVisuals(): ThemeNode[] {
    if (this.inactiveThemeVisibility.showInactiveThemes()) return this.themes;
    return this.themes.filter((theme) => this.themeHasPaths(theme));
  }

  private updateInactiveThemesCount(): void {
    const count = this.themes.reduce(
      (acc, theme) => acc + (this.themeHasPaths(theme) ? 0 : 1),
      0
    );
    this.inactiveThemeVisibility.setInactiveThemesCount(count);
  }

  /** Liste des sous-thèmes avec leurs stats. */
  get flatSubThemes(): Array<{ theme: ThemeNode; sub: SubThemeNode }> {
    const out: Array<{ theme: ThemeNode; sub: SubThemeNode }> = [];
    for (const t of this.themesForVisuals()) {
      for (const s of t.subThemes) {
        out.push({ theme: t, sub: s });
      }
    }
    return out;
  }

  /**
   * Agrégats par thème (utilisés pour les jauges).
   * - evaluation_count : somme des compteurs par sous-thème
   * - avg_note : moyenne pondérée par le nombre d'évaluations de chaque sous-thème
   * - min_note / max_note : min et max globaux sur les sous-thèmes
   */
  get themeStats(): ThemeAggregate[] {
    return this.themesForVisuals().map((theme) => {
      let totalCount = 0;
      let weightedSum = 0;
      let weightedCount = 0;
      const minCandidates: number[] = [];
      const maxCandidates: number[] = [];

      for (const sub of theme.subThemes) {
        const s = sub.stats;
        const c = s?.evaluation_count ?? 0;
        totalCount += c;

        if (c > 0 && typeof s?.avg_note === 'number' && Number.isFinite(s.avg_note)) {
          weightedSum += s.avg_note * c;
          weightedCount += c;
        }
        if (typeof s?.min_note === 'number' && Number.isFinite(s.min_note)) {
          minCandidates.push(s.min_note);
        }
        if (typeof s?.max_note === 'number' && Number.isFinite(s.max_note)) {
          maxCandidates.push(s.max_note);
        }
      }

      return {
        theme,
        evaluation_count: totalCount,
        avg_note: weightedCount > 0 ? weightedSum / weightedCount : null,
        min_note: minCandidates.length ? Math.min(...minCandidates) : null,
        max_note: maxCandidates.length ? Math.max(...maxCandidates) : null
      };
    });
  }

  selectThemeForRadar(themeId: string | null): void {
    this.selectedThemeIdForRadar = themeId;
    this.renderRadarChart();
  }

  openRadarThemeDialog(): void {
    const data: RadarThemePickerDialogData = {
      selectedId: this.selectedThemeIdForRadar ?? '',
      options: this.themesForVisuals().map((t) => ({ id: t.id, label: t.label }))
    };
    this.dialog
      .open(RadarThemePickerDialogComponent, { data })
      .afterClosed()
      .subscribe((selected) => {
        if (selected == null) return;
        this.selectThemeForRadar(selected || null);
      });
  }

  radarSelectedThemeLabel(): string {
    if (this.selectedThemeIdForRadar == null) {
      return this.translate.instant('dashboard.radarAllThemes');
    }
    const theme = this.themesForVisuals().find((t) => t.id === this.selectedThemeIdForRadar);
    return theme?.label ?? this.translate.instant('dashboard.radarAllThemes');
  }

  /** Valeur du select « parcours » pour une jauge thème (vide = tous les parcours). */
  gaugeParcoursSelection(themeId: string): string {
    return this.gaugeParcoursByThemeId[themeId] ?? '';
  }

  onGaugeParcoursChange(themeId: string, subThemeId: string): void {
    if (!subThemeId) {
      const { [themeId]: _removed, ...rest } = this.gaugeParcoursByThemeId;
      this.gaugeParcoursByThemeId = rest;
    } else {
      this.gaugeParcoursByThemeId = { ...this.gaugeParcoursByThemeId, [themeId]: subThemeId };
    }
    this.scheduleVisualizationRender();
  }

  openGaugeParcoursDialog(theme: ThemeNode): void {
    const data: GaugePathPickerDialogData = {
      themeLabel: theme.label,
      selectedId: this.gaugeParcoursSelection(theme.id),
      options: theme.subThemes.map((s) => ({ id: s.id, label: s.label }))
    };
    this.dialog
      .open(GaugePathPickerDialogComponent, { data })
      .afterClosed()
      .subscribe((selected) => {
        if (selected == null) return;
        this.onGaugeParcoursChange(theme.id, selected);
      });
  }

  gaugeSelectedPathLabel(theme: ThemeNode): string {
    const selectedId = this.gaugeParcoursSelection(theme.id);
    if (!selectedId) return this.translate.instant('dashboard.gaugeAllPaths');
    const sub = theme.subThemes.find((s) => s.id === selectedId);
    return sub?.label ?? this.translate.instant('dashboard.gaugeAllPaths');
  }

  /**
   * Stats affichées (jauge + pied de carte) : agrégat thème ou parcours sélectionné.
   */
  gaugeCardStats(entry: ThemeAggregate): GaugeCardStats {
    const sel = this.gaugeParcoursByThemeId[entry.theme.id];
    if (!sel) {
      return {
        evaluation_count: entry.evaluation_count,
        avg_note: entry.avg_note,
        min_note: entry.min_note,
        max_note: entry.max_note
      };
    }
    const sub = entry.theme.subThemes.find((s) => s.id === sel);
    const s = sub?.stats;
    if (!s) {
      return { evaluation_count: 0, avg_note: null, min_note: null, max_note: null };
    }
    return {
      evaluation_count: s.evaluation_count ?? 0,
      avg_note:
        typeof s.avg_note === 'number' && Number.isFinite(s.avg_note) ? s.avg_note : null,
      min_note:
        typeof s.min_note === 'number' && Number.isFinite(s.min_note) ? s.min_note : null,
      max_note:
        typeof s.max_note === 'number' && Number.isFinite(s.max_note) ? s.max_note : null
    };
  }

  private sanitizeGaugeSelections(): void {
    if (this.themes.length === 0) {
      this.gaugeParcoursByThemeId = {};
      return;
    }
    const next: Record<string, string> = {};
    for (const [themeId, subId] of Object.entries(this.gaugeParcoursByThemeId)) {
      const theme = this.themesForVisuals().find((t) => t.id === themeId);
      if (theme?.subThemes.some((s) => s.id === subId)) {
        next[themeId] = subId;
      }
    }
    this.gaugeParcoursByThemeId = next;
  }

  explorationLabel(count: number): string {
    const tier = explorationTier(count);
    const key = `dashboard.exploration.${tier}` as const;
    return this.translate.instant(key);
  }

  explorationClass(count: number): string {
    switch (explorationTier(count)) {
      case 'none':
        return 'exploration--none';
      case 'early':
        return 'exploration--early';
      case 'progress':
        return 'exploration--partial';
      case 'full':
        return 'exploration--full';
    }
  }

  private loadDashboardData(): void {
    this.loading = true;
    this.loadError = '';

    const disciplineId = this.disciplineService.selectedDisciplineId();
    this.hasSelectedDiscipline = disciplineId != null;

    // On charge en plus l'arbre complet (toutes disciplines) pour calculer les KPI « globaux ».
    // Si aucune discipline n'est sélectionnée, les deux requêtes sont équivalentes : on évite l'appel.
    forkJoin({
      themes: this.apiService.getAllThemes(disciplineId),
      allThemes: disciplineId != null
        ? this.apiService.getAllThemes(null)
        : of(null),
      stats: this.apiService.getStatsBySubTheme(),
      evaluations: this.apiService.getAllEvaluations()
    }).subscribe({
      next: ({ themes, allThemes, stats, evaluations }) => {
        this.themes = this.normalizeThemes(themes);
        this.updateInactiveThemesCount();
        this.allEvaluations = evaluations ?? [];
        this.statsBySubThemeKey = this.indexStats(stats ?? []);
        this.mergeStatsIntoThemes();
        this.indexAllThemes(allThemes ?? themes);
        this.computeGlobalSummary();
        this.sanitizeGaugeSelections();
        if (
          this.selectedThemeIdForRadar &&
          !this.themesForVisuals().some((t) => t.id === this.selectedThemeIdForRadar)
        ) {
          this.selectedThemeIdForRadar = null;
        }
        this.loading = false;
        /* Attendre le rendu du DOM / mat-tab (dimensions réelles pour Chart.js & mind map). */
        this.scheduleVisualizationRender();
      },
      error: () => {
        this.loadError = this.translate.instant('dashboard.loadError');
        this.loading = false;
        this.inactiveThemeVisibility.setInactiveThemesCount(0);
      }
    });
  }

  /**
   * Construit un index plat (id_theme/id_subtheme) sur l'arbre complet pour les KPI « toutes
   * disciplines ». Si l'API ne renvoie pas un payload exploitable, on retombe sur l'arbre filtré
   * de la discipline courante (cas où aucune discipline n'est sélectionnée).
   */
  private indexAllThemes(raw: any): void {
    const records: any[] = Array.isArray(raw)
      ? raw
      : (raw?.themes ?? raw?.data ?? []);
    const flat: Array<{ id_theme: string; id_subtheme: string }> = [];
    for (const t of records) {
      const themeId = String(t?.id ?? t?.id_theme ?? '');
      const subThemes = t?.subThemes ?? t?.sub_themes ?? t?.parcours ?? [];
      if (Array.isArray(subThemes)) {
        for (const s of subThemes) {
          flat.push({
            id_theme: themeId,
            id_subtheme: String(s?.id ?? s?.id_subtheme ?? '')
          });
        }
      }
    }
    this.allThemesFlat = flat;
  }

  private normalizeThemes(raw: any): ThemeNode[] {
    const records: any[] = Array.isArray(raw) ? raw : (raw?.themes ?? raw?.data ?? []);
    return records.map((t) => ({
      id: String(t?.id ?? t?.id_theme ?? ''),
      label: String(t?.label ?? t?.libelle ?? this.translate.instant('dashboard.fallbackTheme')),
      description: t?.description ?? t?.tagline ?? '',
      subThemes: this.normalizeSubThemes(t?.subThemes ?? t?.sub_themes ?? t?.parcours ?? [])
    }));
  }

  private normalizeSubThemes(raw: any): SubThemeNode[] {
    const records: any[] = Array.isArray(raw) ? raw : [];
    return records.map((s) => ({
      id: String(s?.id ?? s?.id_subtheme ?? ''),
      label: String(s?.label ?? s?.libelle ?? this.translate.instant('dashboard.fallbackPath')),
      description: s?.description ?? ''
    }));
  }

  private indexStats(rows: SubThemeStats[]): Record<string, SubThemeStats> {
    const map: Record<string, SubThemeStats> = {};
    for (const r of rows) {
      map[`${r.id_theme}:${r.id_subtheme}`] = r;
    }
    return map;
  }

  private mergeStatsIntoThemes(): void {
    for (const theme of this.themes) {
      for (const sub of theme.subThemes) {
        const key = `${theme.id}:${sub.id}`;
        sub.stats = this.statsBySubThemeKey[key];
      }
    }
  }

  private computeGlobalSummary(): void {
    // --- KPI globaux (toutes disciplines confondues) -----------------------------------------
    const flatAll = this.allThemesFlat.length > 0
      ? this.allThemesFlat
      : this.flatSubThemes.map(({ theme, sub }) => ({
          id_theme: theme.id,
          id_subtheme: sub.id
        }));

    this.totalEvaluations = this.allEvaluations.length;
    this.totalSubThemesCount = flatAll.length;
    this.exploredSubThemesCount = flatAll.filter(({ id_theme, id_subtheme }) => {
      const s = this.statsBySubThemeKey[`${id_theme}:${id_subtheme}`];
      return (s?.evaluation_count ?? 0) > 0;
    }).length;

    const allNotes = this.allEvaluations
      .map((e) => (typeof e.note === 'number' ? e.note : null))
      .filter((n): n is number => n !== null && Number.isFinite(n));
    this.globalAverageNote = allNotes.length
      ? allNotes.reduce((a, b) => a + b, 0) / allNotes.length
      : null;

    // --- KPI filtrés sur la discipline courante ----------------------------------------------
    // `themes` est déjà filtré côté API par la discipline sélectionnée (ou contient tout si aucune
    // discipline n'est sélectionnée).
    this.currentDisciplineThemeIds = new Set(
      this.themes
        .map((t) => Number(t.id))
        .filter((id) => Number.isFinite(id))
    );

    this.currentTotalSubThemesCount = this.flatSubThemes.length;
    this.currentExploredSubThemesCount = this.flatSubThemes.filter(
      ({ sub }) => (sub.stats?.evaluation_count ?? 0) > 0
    ).length;

    const currentEvaluations = this.hasSelectedDiscipline
      ? this.allEvaluations.filter((e) =>
          this.currentDisciplineThemeIds.has(Number(e.id_theme))
        )
      : this.allEvaluations;

    this.currentTotalEvaluations = currentEvaluations.length;

    const currentNotes = currentEvaluations
      .map((e) => (typeof e.note === 'number' ? e.note : null))
      .filter((n): n is number => n !== null && Number.isFinite(n));
    this.currentAverageNote = currentNotes.length
      ? currentNotes.reduce((a, b) => a + b, 0) / currentNotes.length
      : null;
  }

  private renderAllVisualizations(): void {
    this.renderMindMap();
    this.renderRadarChart();
    this.renderProgressionChart();
    this.renderGaugeCharts();
  }

  /** Lit les couleurs du thème sur `body` (clair / sombre). */
  private readChartTheme(): ChartThemeColors {
    const cs = getComputedStyle(document.body);
    const text = (cs.getPropertyValue('--app-text') || '#2c2825').trim();
    const muted = (cs.getPropertyValue('--app-text-muted') || '#6b635a').trim();
    const dark = document.body.classList.contains('dark-theme');
    const grid = dark ? 'rgba(232, 228, 220, 0.16)' : '#e8e4dc';
    const gaugeTrack = dark ? 'rgba(232, 228, 220, 0.18)' : '#e8e4dc';
    const tooltipBg = (cs.getPropertyValue('--app-surface-strong') || (dark ? '#282d3a' : '#fffdf8')).trim();
    const tooltipBorder = dark ? 'rgba(232, 228, 220, 0.2)' : 'rgba(61, 51, 41, 0.12)';
    return {
      text,
      muted,
      grid,
      legendColor: text,
      smoothedLine: dark ? text : '#2c2825',
      rawNoteLine: dark ? muted : '#9c958b',
      rawNoteFill: dark ? muted : '#9c958b',
      fillAreaSmoothed: dark ? 'rgba(234, 231, 224, 0.09)' : 'rgba(44, 40, 37, 0.07)',
      gaugeTrack,
      tooltipBg,
      tooltipBorder
    };
  }

  // ============================== MindMap (D3) ==============================

  private renderMindMap(): void {
    const host = this.mindMapHost?.nativeElement;
    if (!host) return;

    host.replaceChildren();

    const ink = this.readChartTheme().text;
    const dark = document.body.classList.contains('dark-theme');
    const circleStroke = dark ? 'rgba(234, 231, 224, 0.88)' : '#ffffff';

    const width = host.clientWidth || 800;
    const height = Math.max(520, Math.min(720, width * 0.85));
    const radius = Math.min(width, height) / 2 - 80;

    const root: MindMapNode = {
      name: this.translate.instant('dashboard.mindMapRoot'),
      level: 'root',
      children: this.themesForVisuals().map((t) => ({
        name: t.label,
        level: 'theme',
        data: t,
        children: t.subThemes.map((s) => ({
          name: s.label,
          level: 'subtheme',
          data: s
        }))
      }))
    };

    const hierarchy = d3.hierarchy<MindMapNode>(root);
    const cluster = d3.cluster<MindMapNode>().size([360, radius]);
    cluster(hierarchy);

    const svg = d3
      .select(host)
      .append('svg')
      .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height)
      .attr('class', 'mindmap-svg');

    const g = svg.append('g');

    const linkGenerator = d3
      .linkRadial<d3.HierarchyPointLink<MindMapNode>, d3.HierarchyPointNode<MindMapNode>>()
      .angle((d) => (d.x * Math.PI) / 180)
      .radius((d) => d.y);

    g.append('g')
      .attr('class', 'mindmap-links')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', 1.3)
      .selectAll('path')
      .data(
        (hierarchy as d3.HierarchyPointNode<MindMapNode>).links() as Array<
          d3.HierarchyPointLink<MindMapNode>
        >
      )
      .join('path')
      .attr('d', linkGenerator)
      .attr('stroke', (l) => this.mindMapLinkColor(l.target.data));

    const nodeSel = g
      .append('g')
      .attr('class', 'mindmap-nodes')
      .selectAll('g')
      .data(
        (hierarchy as d3.HierarchyPointNode<MindMapNode>).descendants().filter(
          (d) => d.data.level !== 'root'
        )
      )
      .join('g')
      .attr(
        'transform',
        (d) => `rotate(${d.x - 90}) translate(${d.y},0)`
      )
      .attr('class', (d) => `mindmap-node mindmap-node--${d.data.level}`);

    const self = this;
    nodeSel.each(function (d: d3.HierarchyPointNode<MindMapNode>) {
      const nodeG = d3.select(this);

      nodeG
        .append('circle')
        .attr(
          'r',
          d.data.level === 'root' ? 9 : d.data.level === 'theme' ? 7 : 6
        )
        .attr('fill', () => self.mindMapNodeColor(d.data))
        .attr('stroke', circleStroke)
        .attr('stroke-width', 1.5);

      if (d.data.level === 'theme') {
        const [line1, line2] = self.mindMapThemeLabelLines(d.data.name);
        const labelG = nodeG
          .append('g')
          .attr('class', 'mindmap-theme-label')
          .attr('transform', `rotate(${-(d.x - 90)})`);
        const textRoot = labelG
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('font-size', 12)
          .attr('font-weight', 700)
          .attr('font-family', 'Source Serif 4, Georgia, serif')
          .attr('fill', ink);
        textRoot
          .append('tspan')
          .attr('x', 0)
          .attr('y', 14)
          .text(line1);
        if (line2) {
          textRoot.append('tspan').attr('x', 0).attr('dy', '1.12em').text(line2);
        }
      } else {
        nodeG
          .append('text')
          .attr('dy', '0.32em')
          .attr('x', () => (d.x < 180 ? 12 : -12))
          .attr('text-anchor', () => (d.x < 180 ? 'start' : 'end'))
          .attr('transform', () => (d.x >= 180 ? 'rotate(180)' : null))
          .text(() => self.mindMapNodeLabel(d.data))
          .attr('font-size', 10.5)
          .attr('font-weight', () => (d.data.level === 'subtheme' ? 500 : 700))
          .attr('fill', ink);
      }

      nodeG.append('title').text(() => self.mindMapTooltip(d.data));
    });

    // Légende
    const legend = svg
      .append('g')
      .attr('class', 'mindmap-legend')
      .attr('transform', `translate(${-width / 2 + 16}, ${-height / 2 + 16})`);

    const legendItems = [
      { color: '#c9c4b8', label: 'Non exploré (0)' },
      { color: '#5e8c73', label: 'Premiers pas (< 3)' },
      { color: '#c9a227', label: 'En progression (3 à 6)' },
      { color: '#2d6a4f', label: 'Bien travaillé (> 6)' }
    ];

    legend
      .selectAll('g')
      .data(legendItems)
      .join('g')
      .attr('transform', (_, i) => `translate(0, ${i * 20})`)
      .call((sel) => {
        sel
          .append('circle')
          .attr('r', 6)
          .attr('cx', 8)
          .attr('cy', 8)
          .attr('fill', (d) => d.color);
        sel
          .append('text')
          .attr('x', 22)
          .attr('y', 12)
          .attr('font-size', 11)
          .attr('font-family', 'Source Sans 3, sans-serif')
          .attr('fill', ink)
          .text((d) => d.label);
      });
  }

  /** Libellé affiché pour un parcours (sous-thème) sur la mindmap. */
  private mindMapNodeLabel(node: MindMapNode): string {
    const count = (node.data as SubThemeNode)?.stats?.evaluation_count ?? 0;
    return `${node.name} (${count})`;
  }

  /**
   * Libellé thème sur 2 lignes uniquement s'il y a plusieurs mots et que la longueur totale
   * du libellé est strictement inférieure à 13 caractères ; sinon une seule ligne.
   */
  private mindMapThemeLabelLines(label: string): [string, string] {
    const t = label.trim();
    if (!t) {
      return ['', ''];
    }
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length <= 1 || t.length >= 13) {
      return [t, ''];
    }
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  private mindMapNodeColor(node: MindMapNode): string {
    if (node.level === 'theme') {
      const theme = node.data as ThemeNode;
      const total = theme.subThemes.reduce(
        (acc, s) => acc + (s.stats?.evaluation_count ?? 0),
        0
      );
      return this.explorationColor(total);
    }
    const count = (node.data as SubThemeNode)?.stats?.evaluation_count ?? 0;
    return this.explorationColor(count);
  }

  private mindMapLinkColor(target: MindMapNode): string {
    return this.mindMapNodeColor(target);
  }

  private explorationColor(count: number): string {
    switch (explorationTier(count)) {
      case 'none':
        return '#c9c4b8';
      case 'early':
        return '#5e8c73';
      case 'progress':
        return '#c9a227';
      case 'full':
        return '#2d6a4f';
    }
  }

  private mindMapTooltip(node: MindMapNode): string {
    if (node.level === 'theme') {
      const theme = node.data as ThemeNode;
      const total = theme.subThemes.reduce(
        (acc, s) => acc + (s.stats?.evaluation_count ?? 0),
        0
      );
      const state = this.explorationLabel(total);
      const line2 = this.translate.instant('dashboard.mindMapTooltipThemeLine2', {
        count: total,
        state
      });
      const line3 = this.translate.instant('dashboard.mindMapTooltipThemeLine3', {
        count: theme.subThemes.length
      });
      return `${theme.label}\n${line2}\n${line3}`;
    }
    const sub = node.data as SubThemeNode;
    const count = sub.stats?.evaluation_count ?? 0;
    const avg = sub.stats?.avg_note;
    const avgTxt = avg !== null && avg !== undefined ? avg.toFixed(2) : this.translate.instant('common.dash');
    const line2 = this.translate.instant('dashboard.mindMapTooltipSubLine2', {
      count,
      state: this.explorationLabel(count)
    });
    const line3 = this.translate.instant('dashboard.mindMapTooltipSubLine3', { avg: avgTxt });
    return `${sub.label}\n${line2}\n${line3}`;
  }

  // ============================== Radar (Chart.js) ==============================

  private renderRadarChart(): void {
    const canvas = this.radarCanvas?.nativeElement;
    if (!canvas) return;

    this.radarChart?.destroy();

    const ct = this.readChartTheme();

    const source =
      this.selectedThemeIdForRadar === null
        ? this.themesForVisuals()
        : this.themesForVisuals().filter((t) => t.id === this.selectedThemeIdForRadar);

    // On construit un radar par parcours (un dataset) pour faciliter la comparaison.
    const labels = [
      this.translate.instant('dashboard.radarAxisPertinence'),
      this.translate.instant('dashboard.radarAxisPrecision'),
      this.translate.instant('dashboard.radarAxisClarte'),
      this.translate.instant('dashboard.radarAxisNote')
    ];

    const palette = [
      '#2d5a3d',
      '#9c5b3d',
      '#a67c32',
      '#3d6b7a',
      '#5c4d7a',
      '#4a7c59',
      '#8b5a2b',
      '#1f5f56'
    ];

    const datasets: RadarChartDataset[] = [];
    let colorIdx = 0;
    for (const theme of source) {
      for (const sub of theme.subThemes) {
        const s = sub.stats;
        if (!s || (s.evaluation_count ?? 0) === 0) continue;
        const color = palette[colorIdx % palette.length];
        colorIdx += 1;
        datasets.push({
          label: `${theme.label} · ${sub.label}`,
          data: [
            s.avg_pertinence ?? 0,
            s.avg_precision ?? 0,
            s.avg_clarte ?? 0,
            s.avg_note ?? 0
          ],
          borderColor: color,
          backgroundColor: color + '33',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: color,
          reviewTarget: {
            themeId: theme.id,
            subThemeId: sub.id,
            themeLabel: theme.label,
            subThemeLabel: sub.label
          }
        });
      }
    }

    this.radarChart = new Chart(canvas, {
      type: 'radar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              backdropColor: 'transparent',
              color: ct.muted
            },
            grid: { color: ct.grid },
            angleLines: { color: ct.grid },
            pointLabels: {
              font: { size: 12, weight: 600 },
              color: ct.text
            }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, color: ct.legendColor },
            onHover: (_event, legendItem, legend) => {
              legend.chart.canvas.style.cursor =
                legendItem !== null && legendItem.datasetIndex !== undefined ? 'pointer' : 'default';
            },
            onLeave: (_event, _legendItem, legend) => {
              legend.chart.canvas.style.cursor = 'default';
            },
            onClick: (_event, legendItem, legend) => {
              const idx = legendItem.datasetIndex;
              if (idx === undefined || idx < 0) return;
              const ds = legend.chart.data.datasets[idx] as RadarChartDataset;
              const t = ds.reviewTarget;
              if (!t) return;
              void this.router.navigate(['/review'], {
                queryParams: {
                  theme: t.themeId,
                  subTheme: t.subThemeId,
                  themeLabel: t.themeLabel,
                  subThemeLabel: t.subThemeLabel
                }
              });
            }
          },
          tooltip: {
            backgroundColor: ct.tooltipBg,
            titleColor: ct.text,
            bodyColor: ct.muted,
            borderColor: ct.tooltipBorder,
            borderWidth: 1,
            callbacks: {
              label: (ctx) =>
                this.translate.instant('dashboard.radarTooltipValue', {
                  label: ctx.dataset.label ?? '',
                  value: (ctx.parsed.r as number).toFixed(2)
                })
            }
          }
        }
      }
    });
  }

  // ============================== Jauges (Chart.js doughnut) ==============================

  private renderGaugeCharts(): void {
    this.gaugeCharts.forEach((c) => c.destroy());
    this.gaugeCharts = [];

    if (!this.gaugeCanvases) return;

    const t = this.readChartTheme();

    const entries = this.themeStats;
    const canvases = this.gaugeCanvases.toArray();

    entries.forEach((entry, idx) => {
      const canvas = canvases[idx]?.nativeElement;
      if (!canvas) return;
      const g = this.gaugeCardStats(entry);
      const hasData = g.evaluation_count > 0 && g.avg_note !== null;
      const value = g.avg_note ?? 0;
      const pct = Math.max(0, Math.min(100, value));
      const color = this.gaugeColor(pct);

      const chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: [
            this.translate.instant('dashboard.gaugeLegendReached'),
            this.translate.instant('dashboard.gaugeLegendRemain')
          ],
          datasets: [
            {
              data: [pct, 100 - pct],
              backgroundColor: [color, t.gaugeTrack],
              borderWidth: 0,
              circumference: 180,
              rotation: 270
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          }
        },
        plugins: [
          {
            id: 'gaugeCenterText',
            afterDatasetsDraw: (c) => {
              const { ctx, chartArea } = c;
              const cx = (chartArea.left + chartArea.right) / 2;
              // baseline "bottom" : on remonte pour laisser de la place au libellé "sur 100"
              const noteBaselineY = chartArea.bottom - 22;
              const th = this.readChartTheme();
              ctx.save();
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillStyle = th.text;
              ctx.font = '600 20px "Source Sans 3", "Segoe UI", system-ui, sans-serif';
              ctx.fillText(hasData ? pct.toFixed(1) : this.translate.instant('common.dash'), cx, noteBaselineY);
              ctx.fillStyle = th.muted;
              ctx.font = '500 11px "Source Sans 3", "Segoe UI", system-ui, sans-serif';
              ctx.fillText(this.translate.instant('common.outOf100'), cx, noteBaselineY + 14);
              ctx.restore();
            }
          }
        ]
      });
      this.gaugeCharts.push(chart);
    });
  }

  private gaugeColor(value: number): string {
    if (value < 40) return '#9c5b3d';
    if (value < 70) return '#c9a227';
    return '#2d6a4f';
  }

  /** Horodatage `date_creation` (ms depuis epoch), ou null si absent / non parsable. */
  private evaluationCreationTimeMs(e: EvaluationRecord): number | null {
    if (e.date_creation == null || String(e.date_creation).trim() === '') {
      return null;
    }
    const t = Date.parse(String(e.date_creation));
    return Number.isNaN(t) ? null : t;
  }

  /**
   * Ordre chronologique selon `date_creation` ; en cas d’égalité ou de date manquante,
   * repli sur `id` pour un ordre stable (proche de l’insertion en base).
   */
  private sortEvaluationsChronologically(rows: EvaluationRecord[]): EvaluationRecord[] {
    return [...rows].sort((a, b) => {
      const ta = this.evaluationCreationTimeMs(a);
      const tb = this.evaluationCreationTimeMs(b);
      if (ta !== null && tb !== null && ta !== tb) {
        return ta - tb;
      }
      if (ta !== null && tb === null) {
        return -1;
      }
      if (ta === null && tb !== null) {
        return 1;
      }
      return a.id - b.id;
    });
  }

  private progressionAxisLabel(e: EvaluationRecord, index: number): string {
    const t = this.evaluationCreationTimeMs(e);
    if (t === null) {
      return `#${index + 1}`;
    }
    return new Date(t).toLocaleString(this.localeForDates(), {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private localeForDates(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-GB' : 'fr-FR';
  }

  private progressionTooltipTitle(
    sorted: EvaluationRecord[],
    dataIndex: number | undefined
  ): string {
    if (
      dataIndex === undefined ||
      dataIndex < 0 ||
      dataIndex >= sorted.length
    ) {
      return '';
    }
    const ev = sorted[dataIndex];
    const t = this.evaluationCreationTimeMs(ev);
    if (t === null) {
      return this.translate.instant('dashboard.progressionTooltipEval', {
        n: dataIndex + 1,
        id: ev.id
      });
    }
    return new Date(t).toLocaleString(this.localeForDates(), {
      dateStyle: 'full',
      timeStyle: 'short'
    });
  }

  // ============================== Progression (Chart.js line) ==============================

  private renderProgressionChart(): void {
    const canvas = this.progressionCanvas?.nativeElement;
    if (!canvas) return;
    this.progressionChart?.destroy();

    const ct = this.readChartTheme();

    // Séries ordonnées par date_creation (repli sur id si date absente).
    const sorted = this.sortEvaluationsChronologically(this.allEvaluations);
    const labels = sorted.map((e, i) => this.progressionAxisLabel(e, i));
    const notes = sorted.map((e) => (typeof e.note === 'number' ? e.note : null));

    // Moyenne glissante (fenêtre 5) pour lisser la courbe.
    const windowSize = 5;
    const smoothed = notes.map((_, i) => {
      const window = notes
        .slice(Math.max(0, i - windowSize + 1), i + 1)
        .filter((n): n is number => n !== null);
      if (!window.length) return null;
      return window.reduce((a, b) => a + b, 0) / window.length;
    });

    // Une série supplémentaire par thème : moyenne glissante des notes du thème.
    const perThemeSeries: Array<{
      label: string;
      color: string;
      data: Array<number | null>;
    }> = [];

    const palette = ['#2d5a3d', '#9c5b3d', '#a67c32', '#3d6b7a', '#5c4d7a', '#4a7c59'];

    this.themesForVisuals().forEach((theme, tIdx) => {
      const themeIdNum = Number(theme.id);
      if (!Number.isFinite(themeIdNum)) return;
      const mask = sorted.map((e) => e.id_theme === themeIdNum);
      const values: Array<number | null> = [];
      let runningSum = 0;
      let runningCount = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (mask[i] && typeof sorted[i].note === 'number') {
          runningSum += sorted[i].note as number;
          runningCount += 1;
        }
        values.push(runningCount > 0 ? runningSum / runningCount : null);
      }
      perThemeSeries.push({
        label: theme.label,
        color: palette[tIdx % palette.length],
        data: values
      });
    });

    const datasets: ChartConfiguration<'line'>['data']['datasets'] = [
      {
        label: this.translate.instant('dashboard.progressionDatasetSmoothed'),
        data: smoothed,
        borderColor: ct.smoothedLine,
        backgroundColor: ct.fillAreaSmoothed,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 0,
        fill: true
      },
      {
        label: this.translate.instant('dashboard.progressionDatasetRaw'),
        data: notes,
        borderColor: ct.rawNoteLine,
        backgroundColor: ct.rawNoteFill,
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 2.5,
        pointHoverRadius: 4,
        showLine: true,
        tension: 0,
        spanGaps: true
      },
      ...perThemeSeries.map((s) => ({
        label: this.translate.instant('dashboard.progressionDatasetCumulative', { theme: s.label }),
        data: s.data,
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: 1.6,
        tension: 0.25,
        pointRadius: 0,
        fill: false,
        spanGaps: true
      }))
    ];

    this.progressionChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            beginAtZero: false,
            max: 100,
            grid: { color: ct.grid },
            ticks: { color: ct.muted },
            title: {
              display: true,
              text: this.translate.instant('dashboard.progressionYTitle'),
              color: ct.text
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              maxRotation: 45,
              minRotation: 0,
              autoSkip: true,
              maxTicksLimit: 16,
              color: ct.muted
            },
            title: {
              display: true,
              text: this.translate.instant('dashboard.progressionXTitle'),
              color: ct.text
            }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, color: ct.legendColor }
          },
          tooltip: {
            backgroundColor: ct.tooltipBg,
            titleColor: ct.text,
            bodyColor: ct.muted,
            borderColor: ct.tooltipBorder,
            borderWidth: 1,
            callbacks: {
              title: (items) =>
                this.progressionTooltipTitle(sorted, items[0]?.dataIndex)
            }
          }
        }
      }
    });
  }

  private destroyCharts(): void {
    this.radarChart?.destroy();
    this.progressionChart?.destroy();
    this.gaugeCharts.forEach((c) => c.destroy());
    this.gaugeCharts = [];
  }
}
