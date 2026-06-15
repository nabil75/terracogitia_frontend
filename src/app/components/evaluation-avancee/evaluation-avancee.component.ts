import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  inject
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

import {
  AdvancedEvaluationInsights,
  AdvancedEvaluationOverview,
  ApiService
} from '../../api/api.service';
import { DisciplineService } from '../../shared/services/discipline.service';
import { ThemeService } from '../../shared/services/theme.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';

interface ChartThemeColors {
  text: string;
  muted: string;
  grid: string;
  legendColor: string;
  tooltipBg: string;
  tooltipBorder: string;
}

Chart.register(...registerables);

const PYRAMID_ORDER = [
  'faits_observables',
  'lois_relations',
  'schemes_operatoires',
  'principes_generateurs',
  'structures_abstraites',
  'metacadres_theoriques'
];

@Component({
  selector: 'app-evaluation-avancee',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TransverseRailComponent,
    TranslateModule
  ],
  templateUrl: './evaluation-avancee.component.html',
  styleUrl: './evaluation-avancee.component.scss'
})
export class EvaluationAvanceeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly themeService = inject(ThemeService);
  private readonly translate = inject(TranslateService);

  /** Re-dessine les graphiques au changement clair / sombre. */
  private readonly rechartOnTheme = effect(() => {
    this.themeService.activeTheme();
    if (!this.loading && this.overview) {
      setTimeout(() => this.renderCharts());
    }
  });

  loading = true;
  loadError = '';
  insightsLoading = false;
  overview: AdvancedEvaluationOverview | null = null;
  insights: AdvancedEvaluationInsights | null = null;

  @ViewChild('pyramidChartCanvas') pyramidChartCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('cognitiveChartCanvas') cognitiveChartCanvas?: ElementRef<HTMLCanvasElement>;
  private pyramidChart: Chart | null = null;
  private cognitiveChart: Chart | null = null;

  ngOnInit(): void {
    this.loadOverview();
  }

  ngAfterViewInit(): void {
    if (this.overview) {
      this.renderCharts();
    }
  }

  ngOnDestroy(): void {
    this.pyramidChart?.destroy();
    this.cognitiveChart?.destroy();
  }

  reload(): void {
    this.insights = null;
    this.loadOverview();
  }

  generateInsights(): void {
    this.insightsLoading = true;
    const idDiscipline = this.disciplineService.selectedDisciplineId();
    this.api.postAdvancedEvaluationInsights(idDiscipline).subscribe({
      next: (res) => {
        this.overview = res.overview;
        this.insights = res.insights;
        this.insightsLoading = false;
        setTimeout(() => this.renderCharts());
      },
      error: () => {
        this.insightsLoading = false;
      }
    });
  }

  pyramidLabel(level: string): string {
    return `advancedEvaluation.pyramid.${level}`;
  }

  operationLabel(operation: string): string {
    const key = `advancedEvaluation.operations.${operation}`;
    const translated = this.translate.instant(key);
    return translated !== key ? translated : operation.replace(/_/g, ' ');
  }

  familyLabel(family: string): string {
    const key = `advancedEvaluation.families.${family}`;
    const translated = this.translate.instant(key);
    return translated !== key ? translated : family;
  }

  profileSequenceHint(): string | null {
    const summary = this.overview?.cognitive_discovery?.profile_summary;
    if (!summary) return null;
    if (summary.observation_before_comprehension === true) {
      return 'advancedEvaluation.profileObserveFirst';
    }
    if (summary.observation_before_comprehension === false) {
      return 'advancedEvaluation.profileComprehendFirst';
    }
    if (summary.comprehension_explored && !summary.observation_explored) {
      return 'advancedEvaluation.profileComprehensionOnly';
    }
    if (summary.observation_explored && !summary.comprehension_explored) {
      return 'advancedEvaluation.profileObservationOnly';
    }
    return null;
  }

  cognitiveOperationsWithActivity() {
    return (
      this.overview?.cognitive_discovery?.operations.filter(
        (op) =>
          op.propositions_requested +
            op.propositions_saved +
            op.propositions_discarded +
            op.exercises_in_propositions >
          0
      ) ?? []
    );
  }

  objectKeys(record: Record<string, number>): string[] {
    return Object.keys(record ?? {});
  }

  objectEntries(record: Record<string, number>): [string, number][] {
    return Object.entries(record ?? {});
  }

  formatDuration(seconds: number | null | undefined): string {
    const s = Math.max(0, Number(seconds) || 0);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r ? `${m} min ${r}s` : `${m} min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h} h ${rm} min` : `${h} h`;
  }

  formatDate(raw: string | null | undefined): string {
    if (!raw?.trim()) return '—';
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return raw;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(parsed));
  }

  private loadOverview(): void {
    this.loading = true;
    this.loadError = '';
    const idDiscipline = this.disciplineService.selectedDisciplineId();
    this.api.getAdvancedEvaluationOverview(idDiscipline).subscribe({
      next: (data) => {
        this.overview = data;
        this.loading = false;
        setTimeout(() => this.renderCharts());
      },
      error: () => {
        this.loading = false;
        this.loadError = 'advancedEvaluation.loadError';
      }
    });
  }

  private renderCharts(): void {
    this.renderPyramidChart();
    this.renderCognitiveChart();
  }

  /** Couleurs Chart.js alignées sur les variables CSS du thème actif. */
  private readChartTheme(): ChartThemeColors {
    const cs = getComputedStyle(document.body);
    const text = (cs.getPropertyValue('--app-text') || '#2c2825').trim();
    const muted = (cs.getPropertyValue('--app-text-muted') || '#6b635a').trim();
    const dark = document.body.classList.contains('dark-theme');
    const grid = dark ? 'rgba(232, 228, 220, 0.16)' : '#e8e4dc';
    const tooltipBg = (cs.getPropertyValue('--app-surface-strong') || (dark ? '#282d3a' : '#fffdf8')).trim();
    const tooltipBorder = dark ? 'rgba(232, 228, 220, 0.2)' : 'rgba(61, 51, 41, 0.12)';
    return {
      text,
      muted,
      grid,
      legendColor: text,
      tooltipBg,
      tooltipBorder
    };
  }

  private chartPlugins(ct: ChartThemeColors) {
    return {
      legend: {
        position: 'bottom' as const,
        labels: { boxWidth: 12, color: ct.legendColor }
      },
      tooltip: {
        backgroundColor: ct.tooltipBg,
        titleColor: ct.text,
        bodyColor: ct.muted,
        borderColor: ct.tooltipBorder,
        borderWidth: 1
      }
    };
  }

  private renderPyramidChart(): void {
    const canvas = this.pyramidChartCanvas?.nativeElement;
    if (!canvas || !this.overview) return;

    this.pyramidChart?.destroy();
    const byLevel = new Map(
      this.overview.pyramid.map((p) => [p.niveau_pyramide, p])
    );
    const labels = PYRAMID_ORDER.map((k) => k.replace(/_/g, ' '));
    const notes = PYRAMID_ORDER.map((k) => byLevel.get(k)?.avg_note ?? 0);
    const counts = PYRAMID_ORDER.map((k) => byLevel.get(k)?.evaluation_count ?? 0);
    const ct = this.readChartTheme();

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Note moyenne',
            data: notes,
            backgroundColor: 'rgba(45, 90, 61, 0.75)',
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            label: 'Évaluations',
            data: counts,
            backgroundColor: 'rgba(143, 163, 184, 0.55)',
            borderRadius: 6,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: this.chartPlugins(ct),
        scales: {
          x: {
            grid: { color: ct.grid },
            ticks: { color: ct.muted }
          },
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: ct.grid },
            ticks: { color: ct.muted },
            title: { display: true, text: 'Note', color: ct.text }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: ct.muted },
            title: { display: true, text: 'Nb éval.', color: ct.text }
          }
        }
      }
    };
    this.pyramidChart = new Chart(canvas, config);
  }

  private renderCognitiveChart(): void {
    const canvas = this.cognitiveChartCanvas?.nativeElement;
    const ops = this.cognitiveOperationsWithActivity();
    if (!canvas || ops.length === 0) {
      this.cognitiveChart?.destroy();
      this.cognitiveChart = null;
      return;
    }

    this.cognitiveChart?.destroy();
    const labels = ops.map((op) => this.operationLabel(op.operation));
    const requested = ops.map((op) => op.propositions_requested);
    const saved = ops.map((op) => op.propositions_saved);
    const ct = this.readChartTheme();

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: this.translate.instant('advancedEvaluation.chartRequested'),
            data: requested,
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderRadius: 6
          },
          {
            label: this.translate.instant('advancedEvaluation.chartSaved'),
            data: saved,
            backgroundColor: 'rgba(45, 90, 61, 0.75)',
            borderRadius: 6
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: this.chartPlugins(ct),
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: ct.grid },
            ticks: { stepSize: 1, color: ct.muted }
          },
          y: {
            grid: { display: false },
            ticks: { color: ct.text, font: { size: 11, weight: 500 } }
          }
        }
      }
    };
    this.cognitiveChart = new Chart(canvas, config);
  }
}
