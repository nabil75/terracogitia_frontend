import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ApiService,
  ChallengeCompatibilityEntry,
  CognitiveOperationCatalogItem,
  GameMechanicCatalogItem,
} from '../../api/api.service';
import { LanguageService } from '../../shared/services/language.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';

/** Ordre d'affichage de la légende des familles cognitives. */
const OPERATION_FAMILIES = [
  'perception',
  'organisation',
  'transformation',
  'construction',
  'diagnostic',
  'simulation',
  'optimisation',
  'discours',
  'meta',
] as const;

/** Catégories ludiques pour présenter les mécaniques de jeu. */
const MECHANIC_CATEGORIES = ['manipulation', 'creation', 'adventure', 'pressure'] as const;

type MechanicCategory = (typeof MECHANIC_CATEGORIES)[number];

const MECHANIC_VISUAL: Record<string, { icon: string; category: MechanicCategory }> = {
  drag_drop: { icon: 'open_with', category: 'manipulation' },
  sorting_lab: { icon: 'category', category: 'manipulation' },
  knowledge_bridges: { icon: 'hub', category: 'manipulation' },
  sequence_frieze: { icon: 'view_timeline', category: 'manipulation' },
  missing_fragment: { icon: 'auto_fix', category: 'manipulation' },
  transform_atelier: { icon: 'transform', category: 'manipulation' },
  matching: { icon: 'link', category: 'manipulation' },
  comparator: { icon: 'compare', category: 'manipulation' },
  memory: { icon: 'grid_view', category: 'manipulation' },
  puzzle: { icon: 'extension', category: 'manipulation' },
  sorting: { icon: 'sort', category: 'manipulation' },
  construction: { icon: 'architecture', category: 'creation' },
  sandbox: { icon: 'science', category: 'creation' },
  investigation: { icon: 'manage_search', category: 'adventure' },
  simulation: { icon: 'precision_manufacturing', category: 'adventure' },
  strategy: { icon: 'flag', category: 'adventure' },
  timed: { icon: 'timer', category: 'pressure' },
  resource_management: { icon: 'savings', category: 'pressure' },
};

@Component({
  selector: 'app-challenges-shell',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TranslateModule,
    TransverseRailComponent,
  ],
  templateUrl: './challenges-shell.component.html',
  styleUrl: './challenges-shell.component.scss',
})
export class ChallengesShellComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);
  readonly lang = inject(LanguageService);

  loading = true;
  operations: CognitiveOperationCatalogItem[] = [];
  mechanics: GameMechanicCatalogItem[] = [];
  matrix: ChallengeCompatibilityEntry[] = [];

  readonly operationFamilies = OPERATION_FAMILIES;
  readonly mechanicCategories = MECHANIC_CATEGORIES;
  readonly matrixLegendScores = [3, 2, 1, 0];

  ngOnInit(): void {
    this.api.getCognitiveOperationsCatalog().subscribe({
      next: (ops) => {
        this.operations = ops.map((op) => ({
          ...op,
          pyramid_levels: this.asStringArray(op.pyramid_levels),
          examples: Array.isArray(op.examples) ? op.examples : [],
        }));
      },
    });
    this.api.getGameMechanicsCatalog().subscribe({
      next: (m) => {
        this.mechanics = m.map((mech) => ({
          ...mech,
          compatible_operations: this.asStringArray(mech.compatible_operations),
          compatible_pyramid_levels: this.asStringArray(mech.compatible_pyramid_levels),
        }));
      },
    });
    this.api.getChallengeCompatibilityMatrix().subscribe({
      next: (matrix) => {
        this.matrix = matrix;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  matrixScore(operation: string, mechanic: string): number {
    return this.matrix.find((e) => e.operation === operation && e.mechanic === mechanic)?.score ?? 0;
  }

  matrixLegendLabel(score: number): string {
    const k = `challenges.matrixLegend.score.${score}`;
    const t = this.translate.instant(k);
    return t !== k ? t : String(score);
  }

  opLabel(op: CognitiveOperationCatalogItem): string {
    return this.lang.getCurrentLang() === 'en' ? op.label_en : op.label_fr;
  }

  operationDescription(op: CognitiveOperationCatalogItem): string {
    const definition =
      this.lang.getCurrentLang() === 'en' ? op.definition_en : op.definition_fr;
    const evaluates =
      this.lang.getCurrentLang() === 'en' ? op.evaluates_en : op.evaluates_fr;
    const def = (definition || '').trim();
    const ev = (evaluates || '').trim();
    if (!def) return ev;
    if (!ev) return def;
    const defEnds = /[.!?…]$/.test(def);
    return defEnds ? `${def} ${ev}` : `${def}. ${ev}`;
  }

  mechLabel(m: GameMechanicCatalogItem): string {
    return this.lang.getCurrentLang() === 'en' ? m.label_en : m.label_fr;
  }

  mechDescription(m: GameMechanicCatalogItem): string {
    return this.lang.getCurrentLang() === 'en' ? m.description_en : m.description_fr;
  }

  mechAdvantages(m: GameMechanicCatalogItem): string {
    return m.advantages_fr;
  }

  mechLimitations(m: GameMechanicCatalogItem): string {
    return m.limitations_fr;
  }

  mechTagline(key: string): string {
    const k = `challenges.mechanicCard.tagline.${key}`;
    const t = this.translate.instant(k);
    return t !== k ? t : '';
  }

  mechIcon(key: string): string {
    return MECHANIC_VISUAL[key]?.icon ?? 'sports_esports';
  }

  mechCategory(key: string): MechanicCategory {
    return MECHANIC_VISUAL[key]?.category ?? 'manipulation';
  }

  mechanicCategoryLabel(category: MechanicCategory): string {
    const k = `challenges.mechanicCategory.${category}`;
    const t = this.translate.instant(k);
    return t !== k ? t : category;
  }

  mechanicsInCategory(category: MechanicCategory): GameMechanicCatalogItem[] {
    return this.mechanics.filter((m) => this.mechCategory(m.key) === category);
  }

  mechanicCompatibleOps(m: GameMechanicCatalogItem): string[] {
    return this.asStringArray(m.compatible_operations).map((opKey) => {
      const op = this.operations.find((o) => o.key === opKey);
      return op ? this.opLabel(op) : opKey.replaceAll('_', ' ');
    });
  }

  operationPyramidLevels(op: CognitiveOperationCatalogItem): string[] {
    return this.asStringArray(op.pyramid_levels);
  }

  familyLabel(family: string): string {
    const key = `challenges.family.${family}`;
    const translated = this.translate.instant(key);
    return translated !== key ? translated : family;
  }

  familyHint(family: string): string {
    const labels = this.operationsForFamily(family);
    return labels.join(' · ');
  }

  operationsForFamily(family: string): string[] {
    return this.operations.filter((o) => o.family === family).map((o) => this.opLabel(o));
  }

  operationsInFamily(family: string): CognitiveOperationCatalogItem[] {
    return this.operations.filter((o) => o.family === family);
  }

  pyramidLevelLabel(level: string): string {
    const key = `resume.pyramid.${level}`;
    const translated = this.translate.instant(key);
    return translated !== key ? translated : level.replaceAll('_', ' ');
  }

  private asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((v) => String(v));
    }
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
      } catch {
        return value.trim() ? [value] : [];
      }
    }
    return [];
  }
}
