import { Component, Inject, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';

import {
  ApiService,
  ChallengeExerciseDto,
  GameMechanicCatalogItem,
} from '../../api/api.service';
import { LanguageService } from '../../shared/services/language.service';
import { ChallengeExercisePanelComponent } from '../challenges/challenge-exercise-panel.component';

export interface DiscoverChallengeDialogData {
  exercise: ChallengeExerciseDto;
  questionLabel?: string;
  idUser?: number;
}

/** Mécaniques réellement jouables dans le panneau d'exercice. */
const PLAYABLE_MECHANICS = new Set([
  'matching',
  'sorting',
  'drag_drop',
  'memory',
  'investigation',
  'comparator',
  'sorting_lab',
  'knowledge_bridges',
  'sequence_frieze',
  'missing_fragment',
  'transform_atelier',
]);

interface MechanicOption {
  key: string;
  label_fr: string;
  label_en: string;
  score: number;
  playable: boolean;
}

@Component({
  selector: 'app-discover-challenge-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    TranslateModule,
    ChallengeExercisePanelComponent,
  ],
  templateUrl: './discover-challenge-dialog.component.html',
  styleUrl: './discover-challenge-dialog.component.scss',
})
export class DiscoverChallengeDialogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly dialogRef = inject(MatDialogRef<DiscoverChallengeDialogComponent>);

  @ViewChild(ChallengeExercisePanelComponent)
  exercisePanel?: ChallengeExercisePanelComponent;

  @ViewChild('mechanicMenuTrigger')
  mechanicMenuTrigger?: MatMenuTrigger;

  exercise: ChallengeExerciseDto;
  saving = false;
  saved = false;
  mechanicOptions: MechanicOption[] = [];
  selectedMechanic = '';
  regenerating = false;
  readonly idUser: number;

  constructor(@Inject(MAT_DIALOG_DATA) data: DiscoverChallengeDialogData) {
    this.exercise = data.exercise;
    this.idUser = data.idUser ?? 1;
    this.saved = Boolean(data.exercise.id_challenge);
    this.selectedMechanic = data.exercise.game_mechanic || '';
  }

  ngOnInit(): void {
    this.loadMechanicOptions();
  }

  get isFirstChallenge(): boolean {
    const withFlag = this.exercise as ChallengeExerciseDto & { is_first_for_question?: boolean };
    return Boolean(withFlag.is_first_for_question);
  }

  activeChallengeMetaSuffix(): string {
    const ex = this.exercise;
    if (!ex) return '';
    const parts = [ex.cognitive_operation, ex.game_mechanic, ex.pyramid_level].filter(Boolean);
    const compat = this.compatibilityScore(ex);
    if (compat != null) {
      parts.push(
        `${this.translate.instant('discover.challengeDialog.compatScore')}: ${compat}/3`
      );
    }
    return parts.join(' · ');
  }

  saveChallenge(): void {
    if (this.saving || this.saved) return;
    this.saving = true;
    this.api.saveChallengeExercise(this.exercise.id_exercise).subscribe({
      next: (challenge) => {
        this.exercise = { ...this.exercise, id_challenge: challenge.id_challenge };
        this.saved = true;
        this.saving = false;
        this.snackBar.open(
          this.translate.instant('discover.challengeDialog.saveSuccess'),
          this.translate.instant('common.close'),
          { duration: 4000 }
        );
      },
      error: () => {
        this.saving = false;
        this.snackBar.open(
          this.translate.instant('discover.challengeDialog.saveError'),
          this.translate.instant('common.close'),
          { duration: 5000 }
        );
      },
    });
  }

  mechanicOptionLabel(option: MechanicOption): string {
    return this.language.getCurrentLang() === 'en'
      ? option.label_en || option.label_fr || option.key
      : option.label_fr || option.label_en || option.key;
  }

  mechanicOptionTitle(option: MechanicOption): string {
    if (!option.playable) {
      return this.translate.instant('discover.challengeDialog.mechanicNotPlayable');
    }
    const compat = this.translate.instant('discover.challengeDialog.compatScore');
    return `${this.mechanicOptionLabel(option)} — ${compat}: ${option.score}/3`;
  }

  isMechanicDisabled(option: MechanicOption): boolean {
    return this.regenerating || !option.playable;
  }

  selectMechanic(mechanic: string): void {
    const option = this.mechanicOptions.find((o) => o.key === mechanic);
    if (
      this.regenerating ||
      !mechanic ||
      !option?.playable ||
      mechanic === this.exercise.game_mechanic
    ) {
      return;
    }
    this.selectedMechanic = mechanic;
    this.mechanicMenuTrigger?.closeMenu();
    this.forceMechanic(mechanic);
  }

  canReplayChallenge(): boolean {
    return !!this.exercisePanel?.canReplay();
  }

  canSubmitChallenge(): boolean {
    const panel = this.exercisePanel;
    if (!panel || this.regenerating) return false;
    if (panel.mechanicKey() === 'memory') return false;
    return panel.canSubmit();
  }

  showSubmitChallenge(): boolean {
    const panel = this.exercisePanel;
    if (!panel || this.regenerating) return false;
    return panel.mechanicKey() !== 'memory';
  }

  isChallengeSubmitting(): boolean {
    return !!this.exercisePanel?.submitting;
  }

  replayChallenge(): void {
    this.exercisePanel?.replay();
  }

  submitChallenge(): void {
    this.exercisePanel?.submit();
  }

  close(): void {
    this.dialogRef.close({
      saved: this.saved,
      exercise: this.exercise,
    });
  }

  private forceMechanic(mechanic: string): void {
    if (!mechanic || this.regenerating) return;
    this.regenerating = true;
    this.api
      .generateChallengeExercise({
        knowledge_object_type:
          (this.exercise.knowledge_object_type as 'question') || 'question',
        knowledge_object_id: this.exercise.knowledge_object_id,
        pyramid_level: this.exercise.pyramid_level,
        cognitive_operation: this.exercise.cognitive_operation,
        game_mechanic: mechanic,
        auto_select_mechanic: false,
        difficulty: this.exercise.difficulty || 2,
        use_ai: true,
        lang: this.language.getCurrentLang(),
        id_user: this.idUser || undefined,
        variant: `forced-${mechanic}-${Date.now()}`,
      })
      .subscribe({
        next: (ex) => {
          this.exercise = ex;
          this.selectedMechanic = ex.game_mechanic;
          this.saved = Boolean(ex.id_challenge);
          this.regenerating = false;
          this.loadMechanicOptions();
          this.snackBar.open(
            this.translate.instant('discover.challengeDialog.forceMechanicSuccess'),
            this.translate.instant('common.close'),
            { duration: 3500 }
          );
        },
        error: (err) => {
          this.regenerating = false;
          this.selectedMechanic = this.exercise.game_mechanic;
          const detail =
            err?.error?.detail ||
            this.translate.instant('discover.challengeDialog.forceMechanicError');
          this.snackBar.open(String(detail), this.translate.instant('common.close'), {
            duration: 6000,
          });
        },
      });
  }

  private loadMechanicOptions(): void {
    forkJoin({
      mechanics: this.api.getGameMechanicsCatalog(),
      matrix: this.api.getChallengeCompatibilityMatrix(),
    }).subscribe({
      next: ({ mechanics, matrix }) => {
        const operation = (this.exercise.cognitive_operation || '').toLowerCase();
        const scoreByMechanic = new Map<string, number>();
        for (const entry of matrix || []) {
          if ((entry.operation || '').toLowerCase() !== operation) continue;
          scoreByMechanic.set(entry.mechanic, entry.score ?? 0);
        }

        const options: MechanicOption[] = (mechanics || []).map(
          (m: GameMechanicCatalogItem) => ({
            key: m.key,
            label_fr: m.label_fr || m.key,
            label_en: m.label_en || m.key,
            score: scoreByMechanic.get(m.key) ?? 0,
            playable: PLAYABLE_MECHANICS.has(m.key),
          })
        );

        if (
          this.exercise.game_mechanic &&
          !options.some((o) => o.key === this.exercise.game_mechanic)
        ) {
          options.push({
            key: this.exercise.game_mechanic,
            label_fr: this.exercise.game_mechanic,
            label_en: this.exercise.game_mechanic,
            score: this.compatibilityScore(this.exercise) ?? 0,
            playable: PLAYABLE_MECHANICS.has(this.exercise.game_mechanic),
          });
        }

        // Jouables d'abord (score desc), puis le reste du catalogue.
        options.sort((a, b) => {
          if (a.playable !== b.playable) return a.playable ? -1 : 1;
          return b.score - a.score || a.key.localeCompare(b.key);
        });
        this.mechanicOptions = options;
        if (!this.selectedMechanic && options.length) {
          this.selectedMechanic = this.exercise.game_mechanic || options[0].key;
        }
      },
      error: () => {
        this.mechanicOptions = [...PLAYABLE_MECHANICS].map((key) => ({
          key,
          label_fr: key,
          label_en: key,
          score:
            key === this.exercise.game_mechanic
              ? this.compatibilityScore(this.exercise) ?? 0
              : 0,
          playable: true,
        }));
      },
    });
  }

  private compatibilityScore(ex: ChallengeExerciseDto): number | null {
    if (typeof ex.compatibility_score === 'number') return ex.compatibility_score;
    const fromCriteria = ex.success_criteria?.['compatibility_score'];
    return typeof fromCriteria === 'number' ? fromCriteria : null;
  }
}
