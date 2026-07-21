import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import {
  ApiService,
  ChallengeAttemptResultDto,
  ChallengeExerciseDto,
} from '../../api/api.service';
import { LanguageService } from '../../shared/services/language.service';

/** Palette stable par paire (même couleur pour les 2 cartes d'une paire). */
const MEMORY_PAIR_COLORS = [
  '#4f46e5',
  '#b45309',
  '#0d9488',
  '#c026d3',
  '#2563eb',
  '#ca8a04',
  '#dc2626',
  '#059669',
];

const MEMORY_SOLO_HIDE_MS = 2000;
const MEMORY_MISMATCH_HIDE_MS = 2000;
const MEMORY_MATCH_HIDE_MS = 450;

interface MemoryCardState {
  id: string;
  pair_id: string;
  face: string;
  kind: 'prompt' | 'answer';
  /** Couleur partagée par les deux cartes de la paire. */
  color: string;
  revealed: boolean;
  matched: boolean;
}

interface InvestigationStatementState {
  id: string;
  text_fr: string;
  text_en: string;
}

type ComparatorStep =
  | 'observe'
  | 'pick_criterion'
  | 'relation'
  | 'justify'
  | 'matrix'
  | 'synthesis';

type ComparatorRelation = 'similar' | 'different' | 'partial';

interface ComparatorElement {
  id: string;
  label_fr: string;
  label_en: string;
  traits: Record<string, { fr: string; en: string } | string>;
}

interface ComparatorCriterion {
  key: string;
  label_fr: string;
  label_en: string;
  justification_options: ComparatorJustificationOption[];
}

interface ComparatorJustificationOption {
  id: string;
  text_fr: string;
  text_en: string;
}

interface ComparatorMatrixRow {
  key: string;
  label: string;
  relation: ComparatorRelation;
  justificationId: string;
  justificationText: string;
}

interface SortingLabItem {
  id: string;
  label_fr: string;
  label_en: string;
  hint_fr: string;
  hint_en: string;
}

interface SortingLabCategory {
  id: string;
  label_fr: string;
  label_en: string;
  hidden_label_fr: string;
  hidden_label_en: string;
}

interface KnowledgeBridgeItem {
  id: string;
  label_fr: string;
  label_en: string;
  hint_fr?: string;
  hint_en?: string;
}

interface SequenceFriezeItem {
  id: string;
  label_fr: string;
  label_en: string;
  hint_fr: string;
  hint_en: string;
}

interface MissingFragmentItem {
  id: string;
  label_fr: string;
  label_en: string;
  hint_fr: string;
  hint_en: string;
}

interface MissingFragmentSegment {
  type: 'text' | 'gap';
  id?: string;
  text_fr?: string;
  text_en?: string;
}

interface TransformAtelierTool {
  id: string;
  label_fr: string;
  label_en: string;
  result_fr: string;
  result_en: string;
  preserves_invariant: boolean;
  hint_fr: string;
  hint_en: string;
}

@Component({
  selector: 'app-challenge-exercise-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './challenge-exercise-panel.component.html',
  styleUrl: './challenge-exercise-panel.component.scss',
})
export class ChallengeExercisePanelComponent implements OnChanges, OnDestroy {
  private readonly api = inject(ApiService);
  readonly lang = inject(LanguageService);

  @Input({ required: true }) exercise!: ChallengeExerciseDto;
  @Input() idUser = 1;
  @Input() showSubmit = true;
  @Input() showMeta = true;

  matchingAnswers: Record<string, string> = {};
  matchingPrompts: string[] = [];
  matchingChoices: string[] = [];
  sortingOrder: string[] = [];
  selectedOption = '';
  dragDropPool: string[] = [];
  dragDropZones: string[] = [];
  dragDropByZone: Record<string, string[]> = {};
  memoryCards: MemoryCardState[] = [];
  memoryMatchedPairIds: string[] = [];
  memoryPendingIds: string[] = [];
  memoryMoves = 0;
  memoryInputLocked = false;
  memoryPairCount = 0;
  investigationStatements: InvestigationStatementState[] = [];
  investigationAnswers: Record<string, boolean | null> = {};

  comparatorStep: ComparatorStep = 'observe';
  comparatorElements: ComparatorElement[] = [];
  comparatorCriteria: ComparatorCriterion[] = [];
  comparatorRequiredCount = 0;
  comparatorSelectedCriterionKey: string | null = null;
  comparatorSelectedRelation: ComparatorRelation | null = null;
  comparatorSelectedJustificationId: string | null = null;
  comparatorMatrix: ComparatorMatrixRow[] = [];
  comparatorSynthesisId: string | null = null;
  comparatorJustificationOptions: ComparatorJustificationOption[] = [];
  comparatorSynthesisOptions: ComparatorJustificationOption[] = [];

  sortingLabMode: 'visible' | 'hidden' = 'visible';
  sortingLabFeedbackMode: 'learning' | 'strict' = 'learning';
  sortingLabItemsById: Record<string, SortingLabItem> = {};
  sortingLabCategories: SortingLabCategory[] = [];
  sortingLabPool: string[] = [];
  sortingLabByCategory: Record<string, string[]> = {};
  sortingLabSelectedItemId: string | null = null;
  sortingLabLocked: Record<string, boolean> = {};
  sortingLabHint = '';
  sortingLabIncorrectAttempts = 0;
  sortingLabMoves = 0;
  sortingLabChecking = false;
  sortingLabFlashCategoryId: string | null = null;
  sortingLabBounceItemId: string | null = null;

  bridgesFeedbackMode: 'learning' | 'evaluation' = 'learning';
  bridgesSources: KnowledgeBridgeItem[] = [];
  bridgesTargets: KnowledgeBridgeItem[] = [];
  bridgesLinks: Record<string, string> = {};
  bridgesLocked: Record<string, boolean> = {};
  bridgesSelectedSourceId: string | null = null;
  bridgesHint = '';
  bridgesIncorrectAttempts = 0;
  bridgesChecking = false;
  bridgesFlashSourceId: string | null = null;
  bridgesErrorSourceId: string | null = null;
  bridgesExclusive = true;
  bridgesStarted = false;

  friezeItemsById: Record<string, SequenceFriezeItem> = {};
  friezePool: string[] = [];
  /** Chaque slot contient 0 ou 1 id de carte. */
  friezeSlots: string[][] = [];
  friezeLocked: boolean[] = [];
  friezeSelectedPoolId: string | null = null;
  friezeSelectedSlotIndex: number | null = null;
  friezeAxis = '';

  mfFeedbackMode: 'learning' | 'evaluation' = 'learning';
  mfSegments: MissingFragmentSegment[] = [];
  mfFragmentsById: Record<string, MissingFragmentItem> = {};
  mfPool: string[] = [];
  mfGapIds: string[] = [];
  mfByGap: Record<string, string[]> = {};
  mfLocked: Record<string, boolean> = {};
  mfSelectedId: string | null = null;
  mfHint = '';
  mfIncorrectAttempts = 0;
  mfChecking = false;
  mfFlashGapId: string | null = null;
  mfBounceId: string | null = null;

  taFeedbackMode: 'learning' | 'evaluation' = 'learning';
  taMode: 'single' | 'chain' = 'single';
  taSource = '';
  taTargetForm = '';
  taInvariant = '';
  taTools: TransformAtelierTool[] = [];
  taSelectedTools: string[] = [];
  taCurrentResult = '';
  taStepIndex = 0;
  taComplete = false;
  taHint = '';
  taIncorrectAttempts = 0;
  taChecking = false;
  taIntegrity = 1;
  taErrorToolId: string | null = null;
  taUsedToolIds: Record<string, boolean> = {};

  submitting = false;
  result: ChallengeAttemptResultDto | null = null;

  private startTime = Date.now();
  private memoryFlipTimeout: ReturnType<typeof setTimeout> | null = null;
  private sortingLabFlashTimeout: ReturnType<typeof setTimeout> | null = null;
  private sortingLabBounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private bridgesFlashTimeout: ReturnType<typeof setTimeout> | null = null;
  private bridgesErrorTimeout: ReturnType<typeof setTimeout> | null = null;
  private mfFlashTimeout: ReturnType<typeof setTimeout> | null = null;
  private mfBounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private taErrorTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    this.clearMemoryTimers();
    this.clearSortingLabTimers();
    this.clearBridgesTimers();
    this.clearMfTimers();
    this.clearTaTimers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['exercise'] && this.exercise) {
      this.resetInteraction();
    }
  }

  instruction(): string {
    const c = this.exercise?.content;
    if (!c) return '';
    return this.lang.getCurrentLang() === 'en'
      ? String(c['instruction_en'] || c['instruction_fr'] || '')
      : String(c['instruction_fr'] || c['instruction_en'] || '');
  }

  canReplay(): boolean {
    return !!this.result && this.result.score < 1;
  }

  replay(): void {
    if (!this.canReplay()) return;
    this.resetInteraction();
  }

  submit(): void {
    if (!this.exercise || this.submitting || this.result) return;
    this.submitting = true;
    const mechanic = String(this.exercise.content['mechanic'] || this.exercise.game_mechanic || '');
    let learner_actions: Record<string, unknown> = {};

    if (mechanic === 'matching') {
      learner_actions = { pairs: { ...this.matchingAnswers } };
    } else if (mechanic === 'sorting') {
      learner_actions = { order: [...this.sortingOrder] };
    } else if (mechanic === 'drag_drop') {
      learner_actions = { placements: this.buildDragDropPlacements() };
    } else if (mechanic === 'memory') {
      learner_actions = {
        matched_pair_ids: [...this.memoryMatchedPairIds],
        moves: this.memoryMoves,
      };
    } else if (mechanic === 'investigation') {
      const answers: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(this.investigationAnswers)) {
        if (value === true || value === false) {
          answers[key] = value;
        }
      }
      learner_actions = { answers };
    } else if (mechanic === 'comparator') {
      const relations: Record<string, string> = {};
      const justifications: Record<string, string> = {};
      for (const row of this.comparatorMatrix) {
        relations[row.key] = row.relation;
        justifications[row.key] = row.justificationId;
      }
      learner_actions = {
        relations,
        justifications,
        synthesis_id: this.comparatorSynthesisId || '',
      };
    } else if (mechanic === 'sorting_lab') {
      learner_actions = {
        placements: this.buildSortingLabPlacements(),
        incorrect_attempts: this.sortingLabIncorrectAttempts,
        moves: this.sortingLabMoves,
      };
    } else if (mechanic === 'knowledge_bridges') {
      learner_actions = {
        links: { ...this.bridgesLinks },
        incorrect_attempts: this.bridgesIncorrectAttempts,
      };
    } else if (mechanic === 'sequence_frieze') {
      learner_actions = { order: this.buildFriezeOrder() };
    } else if (mechanic === 'missing_fragment') {
      learner_actions = {
        placements: this.buildMfPlacements(),
        incorrect_attempts: this.mfIncorrectAttempts,
      };
    } else if (mechanic === 'transform_atelier') {
      learner_actions = {
        selected_tools: [...this.taSelectedTools],
        incorrect_attempts: this.taIncorrectAttempts,
      };
    } else {
      learner_actions = { selected: this.selectedOption };
    }

    this.api
      .submitChallengeAttempt({
        id_exercise: this.exercise.id_exercise,
        learner_actions,
        duration_ms: Date.now() - this.startTime,
        id_user: this.idUser || undefined,
      })
      .subscribe({
        next: (res) => {
          this.result = res;
          this.submitting = false;
          if (this.mechanicKey() === 'transform_atelier') {
            const integrity = res.criteria_results?.['integrity'];
            if (typeof integrity === 'number') {
              this.taIntegrity = integrity;
            }
          }
        },
        error: () => {
          this.submitting = false;
        },
      });
  }

  moveSortItem(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.sortingOrder.length) return;
    const copy = [...this.sortingOrder];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    this.sortingOrder = copy;
  }

  selectMatchingChoice(prompt: string, choice: string): void {
    if (this.result) return;
    const current = this.matchingAnswers[prompt];
    if (current === choice) {
      this.matchingAnswers = { ...this.matchingAnswers, [prompt]: '' };
      return;
    }
    const next = { ...this.matchingAnswers };
    for (const key of this.matchingPrompts) {
      if (key !== prompt && next[key] === choice) {
        next[key] = '';
      }
    }
    next[prompt] = choice;
    this.matchingAnswers = next;
  }

  isMatchingChoiceSelected(prompt: string, choice: string): boolean {
    return this.matchingAnswers[prompt] === choice;
  }

  isMatchingChoiceDisabled(prompt: string, choice: string): boolean {
    if (this.result) return true;
    if (this.matchingAnswers[prompt] === choice) return false;
    return this.matchingPrompts.some(
      (key) => key !== prompt && this.matchingAnswers[key] === choice
    );
  }

  dragDropListIds(): string[] {
    return ['drag-drop-pool', ...this.dragDropZones.map((_, index) => this.dragDropZoneListId(index))];
  }

  dragDropZoneListId(index: number): string {
    return `drag-drop-zone-${index}`;
  }

  onDragDrop(event: CdkDragDrop<string[]>): void {
    if (this.result) return;
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }
    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );
  }

  private buildDragDropPlacements(): Record<string, string> {
    const placements: Record<string, string> = {};
    for (const zone of this.dragDropZones) {
      for (const item of this.dragDropByZone[zone] ?? []) {
        placements[item] = zone;
      }
    }
    return placements;
  }

  feedbackText(): string {
    if (!this.result?.feedback) return '';
    return this.lang.getCurrentLang() === 'en'
      ? this.result.feedback['en'] || this.result.feedback['fr'] || ''
      : this.result.feedback['fr'] || this.result.feedback['en'] || '';
  }

  mechanicKey(): string {
    return String(this.exercise?.content['mechanic'] || this.exercise?.game_mechanic || '');
  }

  isMemoryComplete(): boolean {
    return this.memoryPairCount > 0 && this.memoryMatchedPairIds.length >= this.memoryPairCount;
  }

  canSubmit(): boolean {
    if (this.result || this.submitting) return false;
    if (this.mechanicKey() === 'memory') {
      return this.isMemoryComplete();
    }
    if (this.mechanicKey() === 'investigation') {
      return this.investigationStatements.every(
        (stmt) =>
          this.investigationAnswers[stmt.id] === true ||
          this.investigationAnswers[stmt.id] === false
      );
    }
    if (this.mechanicKey() === 'comparator') {
      return (
        this.comparatorStep === 'synthesis' &&
        !!this.comparatorSynthesisId &&
        this.comparatorMatrix.length >= this.comparatorRequiredCount
      );
    }
    if (this.mechanicKey() === 'sorting_lab') {
      return (
        !this.sortingLabChecking &&
        this.sortingLabPool.length === 0 &&
        Object.keys(this.sortingLabItemsById).length > 0
      );
    }
    if (this.mechanicKey() === 'knowledge_bridges') {
      return (
        this.bridgesStarted &&
        !this.bridgesChecking &&
        this.bridgesSources.length > 0 &&
        this.bridgesSources.every((src) => !!this.bridgesLinks[src.id])
      );
    }
    if (this.mechanicKey() === 'sequence_frieze') {
      return (
        this.friezeSlots.length > 0 &&
        this.friezeSlots.every((slot) => slot.length === 1) &&
        this.friezePool.length === 0
      );
    }
    if (this.mechanicKey() === 'missing_fragment') {
      return (
        !this.mfChecking &&
        this.mfGapIds.length > 0 &&
        this.mfGapIds.every((gapId) => (this.mfByGap[gapId] ?? []).length === 1)
      );
    }
    if (this.mechanicKey() === 'transform_atelier') {
      if (this.taChecking) return false;
      if (this.taFeedbackMode === 'learning') {
        return this.taComplete && this.taSelectedTools.length > 0;
      }
      return this.taSelectedTools.length > 0;
    }
    return true;
  }

  friezeItemLabel(itemId: string): string {
    const item = this.friezeItemsById[itemId];
    if (!item) return itemId;
    return this.lang.getCurrentLang() === 'en'
      ? item.label_en || item.label_fr
      : item.label_fr || item.label_en;
  }

  friezeListIds(): string[] {
    return ['frieze-pool', ...this.friezeSlots.map((_, i) => this.friezeSlotListId(i))];
  }

  friezeSlotListId(index: number): string {
    return `frieze-slot-${index}`;
  }

  friezePositionState(index: number): 'correct' | 'incorrect' | null {
    if (!this.result) return null;
    const per = this.result.criteria_results?.['per_position'];
    if (!per || typeof per !== 'object') return null;
    const entry = (per as Record<string, { correct?: boolean }>)[String(index)];
    if (!entry) return null;
    return entry.correct ? 'correct' : 'incorrect';
  }

  onFriezeDrop(event: CdkDragDrop<string[]>): void {
    if (this.result) return;

    const targetSlotIndex = this.friezeSlots.findIndex((slot) => slot === event.container.data);
    const sourceSlotIndex = this.friezeSlots.findIndex((slot) => slot === event.previousContainer.data);
    if (targetSlotIndex >= 0 && this.friezeLocked[targetSlotIndex]) return;
    if (sourceSlotIndex >= 0 && this.friezeLocked[sourceSlotIndex]) return;

    if (event.previousContainer === event.container) {
      if (event.container.data === this.friezePool) {
        moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      }
      this.clearFriezeSelection();
      return;
    }

    const targetData = event.container.data;
    const sourceData = event.previousContainer.data;
    const dragged = sourceData[event.previousIndex];
    if (!dragged) return;

    if (targetSlotIndex >= 0 && targetData.length >= 1) {
      const existing = targetData[0];
      targetData[0] = dragged;
      sourceData[event.previousIndex] = existing;
    } else {
      transferArrayItem(sourceData, targetData, event.previousIndex, event.currentIndex);
      if (targetSlotIndex >= 0 && targetData.length > 1) {
        const overflow = targetData.splice(1);
        this.friezePool.push(...overflow);
      }
    }
    this.clearFriezeSelection();
  }

  selectFriezePoolItem(itemId: string): void {
    if (this.result) return;
    if (this.friezeSelectedPoolId === itemId) {
      this.clearFriezeSelection();
      return;
    }
    this.friezeSelectedPoolId = itemId;
    this.friezeSelectedSlotIndex = null;
  }

  selectFriezeSlot(index: number): void {
    if (this.result || this.friezeLocked[index]) return;
    const slot = this.friezeSlots[index] ?? [];

    if (this.friezeSelectedPoolId) {
      const itemId = this.friezeSelectedPoolId;
      const poolIndex = this.friezePool.indexOf(itemId);
      if (poolIndex < 0) {
        this.clearFriezeSelection();
        return;
      }
      this.friezePool.splice(poolIndex, 1);
      if (slot.length === 1) {
        this.friezePool.push(slot[0]);
      }
      slot.length = 0;
      slot.push(itemId);
      this.clearFriezeSelection();
      return;
    }

    if (this.friezeSelectedSlotIndex !== null) {
      const from = this.friezeSelectedSlotIndex;
      if (from === index) {
        this.clearFriezeSelection();
        return;
      }
      if (this.friezeLocked[from]) {
        this.clearFriezeSelection();
        return;
      }
      const a = this.friezeSlots[from] ?? [];
      const b = this.friezeSlots[index] ?? [];
      const aItem = a[0];
      const bItem = b[0];
      a.length = 0;
      b.length = 0;
      if (bItem) a.push(bItem);
      if (aItem) b.push(aItem);
      this.clearFriezeSelection();
      return;
    }

    if (slot.length === 1) {
      this.friezeSelectedSlotIndex = index;
      this.friezeSelectedPoolId = null;
    }
  }

  returnFriezeSlotToPool(index: number, event?: Event): void {
    event?.stopPropagation();
    if (this.result || this.friezeLocked[index]) return;
    const slot = this.friezeSlots[index] ?? [];
    if (slot.length !== 1) return;
    this.friezePool.push(slot[0]);
    slot.length = 0;
    this.clearFriezeSelection();
  }

  private clearFriezeSelection(): void {
    this.friezeSelectedPoolId = null;
    this.friezeSelectedSlotIndex = null;
  }

  private buildFriezeOrder(): string[] {
    return this.friezeSlots.map((slot) => (slot.length === 1 ? slot[0] : ''));
  }

  mfFragmentLabel(itemId: string): string {
    const item = this.mfFragmentsById[itemId];
    if (!item) return itemId;
    return this.lang.getCurrentLang() === 'en'
      ? item.label_en || item.label_fr
      : item.label_fr || item.label_en;
  }

  mfSegmentText(segment: MissingFragmentSegment): string {
    return this.lang.getCurrentLang() === 'en'
      ? segment.text_en || segment.text_fr || ''
      : segment.text_fr || segment.text_en || '';
  }

  mfListIds(): string[] {
    return ['mf-pool', ...this.mfGapIds.map((id) => this.mfGapListId(id))];
  }

  mfGapListId(gapId: string): string {
    return `mf-gap-${gapId}`;
  }

  mfGapState(gapId: string): 'correct' | 'incorrect' | null {
    if (!this.result) return null;
    const per = this.result.criteria_results?.['per_gap'];
    if (!per || typeof per !== 'object') return null;
    const entry = (per as Record<string, { correct?: boolean }>)[gapId];
    if (!entry) return null;
    return entry.correct ? 'correct' : 'incorrect';
  }

  isMfLocked(fragmentId: string): boolean {
    for (const [gapId, items] of Object.entries(this.mfByGap)) {
      if (items.includes(fragmentId) && this.mfLocked[gapId]) return true;
    }
    return false;
  }

  selectMfFragment(fragmentId: string): void {
    if (this.result || this.mfChecking || this.isMfLocked(fragmentId)) return;
    this.mfSelectedId = this.mfSelectedId === fragmentId ? null : fragmentId;
    this.mfHint = '';
  }

  assignMfToGap(gapId: string): void {
    if (this.result || this.mfChecking || !this.mfSelectedId) return;
    if (this.mfLocked[gapId]) return;
    const fragmentId = this.mfSelectedId;
    this.moveMfToGap(fragmentId, gapId);
    if (this.mfFeedbackMode === 'learning') {
      this.verifyMfPlacement(gapId, fragmentId);
    } else {
      this.mfSelectedId = null;
    }
  }

  onMfDrop(event: CdkDragDrop<string[]>): void {
    if (this.result || this.mfChecking) return;
    const fragmentId = String(
      event.item.data || event.previousContainer.data[event.previousIndex] || ''
    );
    if (!fragmentId || this.isMfLocked(fragmentId)) return;

    const targetGapId = this.mfGapIdFromListData(event.container.data);
    const sourceGapId = this.mfGapIdFromListData(event.previousContainer.data);
    if (targetGapId && this.mfLocked[targetGapId]) return;
    if (sourceGapId && this.mfLocked[sourceGapId]) return;

    if (event.previousContainer === event.container) {
      if (event.container.data === this.mfPool) {
        moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      }
      return;
    }

    const targetData = event.container.data;
    const sourceData = event.previousContainer.data;
    if (targetGapId && targetData.length >= 1) {
      const existing = targetData[0];
      targetData[0] = fragmentId;
      sourceData[event.previousIndex] = existing;
    } else {
      transferArrayItem(sourceData, targetData, event.previousIndex, event.currentIndex);
      if (targetGapId && targetData.length > 1) {
        const overflow = targetData.splice(1);
        this.mfPool.push(...overflow);
      }
    }
    this.mfSelectedId = null;
    if (targetGapId && this.mfFeedbackMode === 'learning') {
      this.verifyMfPlacement(targetGapId, fragmentId);
    }
  }

  clearMfGap(gapId: string, event?: Event): void {
    event?.stopPropagation();
    if (this.result || this.mfChecking || this.mfLocked[gapId]) return;
    const slot = this.mfByGap[gapId] ?? [];
    if (slot.length !== 1) return;
    this.mfPool.push(slot[0]);
    slot.length = 0;
    this.mfSelectedId = null;
  }

  private mfGapIdFromListData(data: string[]): string | null {
    for (const [gapId, items] of Object.entries(this.mfByGap)) {
      if (items === data) return gapId;
    }
    return null;
  }

  private moveMfToGap(fragmentId: string, gapId: string): void {
    for (const items of Object.values(this.mfByGap)) {
      const idx = items.indexOf(fragmentId);
      if (idx >= 0) items.splice(idx, 1);
    }
    const poolIdx = this.mfPool.indexOf(fragmentId);
    if (poolIdx >= 0) this.mfPool.splice(poolIdx, 1);

    const slot = this.mfByGap[gapId] ?? [];
    if (slot.length === 1 && slot[0] !== fragmentId) {
      this.mfPool.push(slot[0]);
      slot.length = 0;
    }
    if (!slot.includes(fragmentId)) {
      slot.length = 0;
      slot.push(fragmentId);
    }
    this.mfByGap[gapId] = slot;
  }

  private verifyMfPlacement(gapId: string, fragmentId: string): void {
    if (!this.exercise) return;
    this.mfChecking = true;
    this.api.checkMissingFragmentPlacement(this.exercise.id_exercise, gapId, fragmentId).subscribe({
      next: (res) => {
        this.mfChecking = false;
        if (res.correct) {
          this.mfLocked = { ...this.mfLocked, [gapId]: true };
          this.mfSelectedId = null;
          this.mfHint = '';
          this.mfFlashGapId = gapId;
          if (this.mfFlashTimeout) clearTimeout(this.mfFlashTimeout);
          this.mfFlashTimeout = setTimeout(() => {
            this.mfFlashGapId = null;
          }, 450);
        } else {
          this.mfIncorrectAttempts += 1;
          this.mfHint =
            this.lang.getCurrentLang() === 'en'
              ? res.hint_en || res.hint_fr || ''
              : res.hint_fr || res.hint_en || '';
          this.mfBounceId = fragmentId;
          if (this.mfBounceTimeout) clearTimeout(this.mfBounceTimeout);
          this.mfBounceTimeout = setTimeout(() => {
            this.mfBounceId = null;
          }, 450);
          // Remettre le fragment dans le pool (mode validation immédiate).
          const slot = this.mfByGap[gapId] ?? [];
          if (slot[0] === fragmentId) {
            slot.length = 0;
            this.mfPool.push(fragmentId);
          }
          this.mfSelectedId = null;
        }
      },
      error: () => {
        this.mfChecking = false;
      },
    });
  }

  private buildMfPlacements(): Record<string, string> {
    const placements: Record<string, string> = {};
    for (const gapId of this.mfGapIds) {
      const slot = this.mfByGap[gapId] ?? [];
      if (slot.length === 1) placements[gapId] = slot[0];
    }
    return placements;
  }

  private clearMfTimers(): void {
    if (this.mfFlashTimeout) {
      clearTimeout(this.mfFlashTimeout);
      this.mfFlashTimeout = null;
    }
    if (this.mfBounceTimeout) {
      clearTimeout(this.mfBounceTimeout);
      this.mfBounceTimeout = null;
    }
  }

  taToolLabel(tool: TransformAtelierTool): string {
    return this.lang.getCurrentLang() === 'en'
      ? tool.label_en || tool.label_fr
      : tool.label_fr || tool.label_en;
  }

  taIntegrityPercent(): number {
    return Math.round(Math.max(0, Math.min(1, this.taIntegrity)) * 100);
  }

  taIntegrityLevel(): 'ok' | 'warn' | 'bad' {
    if (this.taIntegrity >= 0.85) return 'ok';
    if (this.taIntegrity >= 0.5) return 'warn';
    return 'bad';
  }

  selectTransformTool(toolId: string): void {
    if (this.result || this.taChecking || this.taComplete) return;
    if (this.taFeedbackMode === 'learning' && this.taUsedToolIds[toolId]) return;

    if (this.taFeedbackMode === 'learning') {
      this.verifyTransformStep(toolId);
      return;
    }

    // Mode évaluation : construire la séquence (single = un seul choix).
    if (this.taMode === 'single') {
      this.taSelectedTools = [toolId];
      const tool = this.taTools.find((t) => t.id === toolId);
      this.taCurrentResult = tool
        ? this.lang.getCurrentLang() === 'en'
          ? tool.result_en || tool.result_fr
          : tool.result_fr || tool.result_en
        : this.taCurrentResult;
      this.taIntegrity = tool?.preserves_invariant ? 1 : 0.35;
      return;
    }

    if (this.taSelectedTools.includes(toolId)) return;
    this.taSelectedTools = [...this.taSelectedTools, toolId];
    const tool = this.taTools.find((t) => t.id === toolId);
    if (tool) {
      this.taCurrentResult =
        this.lang.getCurrentLang() === 'en'
          ? tool.result_en || tool.result_fr || this.taCurrentResult
          : tool.result_fr || tool.result_en || this.taCurrentResult;
      const preserved = this.taSelectedTools.filter((id) => {
        const t = this.taTools.find((x) => x.id === id);
        return !!t?.preserves_invariant;
      }).length;
      this.taIntegrity = preserved / this.taSelectedTools.length;
    }
  }

  undoLastTransformTool(): void {
    if (this.result || this.taChecking || this.taFeedbackMode === 'learning') return;
    if (this.taSelectedTools.length === 0) return;
    this.taSelectedTools = this.taSelectedTools.slice(0, -1);
    if (this.taSelectedTools.length === 0) {
      this.taCurrentResult = this.taSource;
      this.taIntegrity = 1;
      return;
    }
    const lastId = this.taSelectedTools[this.taSelectedTools.length - 1];
    const tool = this.taTools.find((t) => t.id === lastId);
    this.taCurrentResult = tool
      ? this.lang.getCurrentLang() === 'en'
        ? tool.result_en || tool.result_fr
        : tool.result_fr || tool.result_en
      : this.taSource;
    const preserved = this.taSelectedTools.filter((id) => {
      const t = this.taTools.find((x) => x.id === id);
      return !!t?.preserves_invariant;
    }).length;
    this.taIntegrity = preserved / this.taSelectedTools.length;
  }

  private verifyTransformStep(toolId: string): void {
    if (!this.exercise) return;
    this.taChecking = true;
    this.api
      .checkTransformAtelierStep(this.exercise.id_exercise, toolId, this.taStepIndex)
      .subscribe({
        next: (res) => {
          this.taChecking = false;
          if (res.correct) {
            this.taSelectedTools = [...this.taSelectedTools, toolId];
            this.taUsedToolIds = { ...this.taUsedToolIds, [toolId]: true };
            this.taStepIndex = res.next_step_index;
            this.taComplete = res.complete;
            this.taHint = '';
            this.taCurrentResult =
              this.lang.getCurrentLang() === 'en'
                ? res.result_en || res.result_fr || this.taCurrentResult
                : res.result_fr || res.result_en || this.taCurrentResult;
            this.taIntegrity = 1;
          } else {
            this.taIncorrectAttempts += 1;
            this.taHint =
              this.lang.getCurrentLang() === 'en'
                ? res.hint_en || res.hint_fr || ''
                : res.hint_fr || res.hint_en || '';
            this.taIntegrity = Math.max(0.2, this.taIntegrity - 0.25);
            this.taErrorToolId = toolId;
            if (this.taErrorTimeout) clearTimeout(this.taErrorTimeout);
            this.taErrorTimeout = setTimeout(() => {
              this.taErrorToolId = null;
            }, 450);
          }
        },
        error: () => {
          this.taChecking = false;
        },
      });
  }

  private clearTaTimers(): void {
    if (this.taErrorTimeout) {
      clearTimeout(this.taErrorTimeout);
      this.taErrorTimeout = null;
    }
  }

  sortingLabItemLabel(itemId: string): string {
    const item = this.sortingLabItemsById[itemId];
    if (!item) return itemId;
    return this.lang.getCurrentLang() === 'en'
      ? item.label_en || item.label_fr
      : item.label_fr || item.label_en;
  }

  sortingLabCategoryLabel(category: SortingLabCategory): string {
    const en = this.lang.getCurrentLang() === 'en';
    if (this.sortingLabMode === 'hidden') {
      return en
        ? category.hidden_label_en || category.hidden_label_fr
        : category.hidden_label_fr || category.hidden_label_en;
    }
    return en ? category.label_en || category.label_fr : category.label_fr || category.label_en;
  }

  sortingLabListIds(): string[] {
    return [
      'sorting-lab-pool',
      ...this.sortingLabCategories.map((cat) => this.sortingLabCategoryListId(cat.id)),
    ];
  }

  sortingLabCategoryListId(categoryId: string): string {
    return `sorting-lab-cat-${categoryId}`;
  }

  isSortingLabLocked(itemId: string): boolean {
    return !!this.sortingLabLocked[itemId];
  }

  selectSortingLabItem(itemId: string): void {
    if (this.result || this.sortingLabChecking || this.isSortingLabLocked(itemId)) return;
    this.sortingLabSelectedItemId =
      this.sortingLabSelectedItemId === itemId ? null : itemId;
  }

  assignSortingLabToCategory(categoryId: string): void {
    if (this.result || this.sortingLabChecking || !this.sortingLabSelectedItemId) return;
    const itemId = this.sortingLabSelectedItemId;
    if (this.isSortingLabLocked(itemId)) return;
    this.moveSortingLabItemToCategory(itemId, categoryId);
    this.sortingLabMoves += 1;
    if (this.sortingLabFeedbackMode === 'learning') {
      this.verifySortingLabPlacement(itemId, categoryId);
    } else {
      this.sortingLabSelectedItemId = null;
    }
  }

  onSortingLabDrop(event: CdkDragDrop<string[]>): void {
    if (this.result || this.sortingLabChecking) return;
    const itemId = String(
      event.item.data || event.previousContainer.data[event.previousIndex] || ''
    );
    if (!itemId || this.isSortingLabLocked(itemId)) return;

    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );
    this.sortingLabMoves += 1;
    this.sortingLabSelectedItemId = null;

    const categoryId = this.sortingLabCategoryIdFromListId(event.container.id);
    if (!categoryId) return;
    if (this.sortingLabFeedbackMode === 'learning') {
      this.verifySortingLabPlacement(itemId, categoryId);
    }
  }

  startKnowledgeBridges(): void {
    if (this.result) return;
    this.bridgesStarted = true;
  }

  bridgesItemLabel(item: KnowledgeBridgeItem): string {
    return this.lang.getCurrentLang() === 'en'
      ? item.label_en || item.label_fr
      : item.label_fr || item.label_en;
  }

  bridgesLinkedTargetId(sourceId: string): string | null {
    return this.bridgesLinks[sourceId] || null;
  }

  bridgesTargetLinked(targetId: string): boolean {
    return Object.values(this.bridgesLinks).includes(targetId);
  }

  bridgesSourceColorIndex(sourceId: string): number {
    const index = this.bridgesSources.findIndex((src) => src.id === sourceId);
    return index >= 0 ? index % 8 : 0;
  }

  selectBridgesSource(sourceId: string): void {
    if (this.result || this.bridgesChecking || !this.bridgesStarted) return;
    if (this.bridgesLocked[sourceId]) return;
    this.bridgesSelectedSourceId =
      this.bridgesSelectedSourceId === sourceId ? null : sourceId;
    this.bridgesHint = '';
  }

  selectBridgesTarget(targetId: string): void {
    if (this.result || this.bridgesChecking || !this.bridgesStarted) return;
    if (!this.bridgesSelectedSourceId) return;
    const sourceId = this.bridgesSelectedSourceId;
    if (this.bridgesLocked[sourceId]) return;

    if (this.bridgesExclusive) {
      const nextLinks = { ...this.bridgesLinks };
      for (const [src, tgt] of Object.entries(nextLinks)) {
        if (tgt === targetId && src !== sourceId) {
          delete nextLinks[src];
        }
      }
      nextLinks[sourceId] = targetId;
      this.bridgesLinks = nextLinks;
    } else {
      this.bridgesLinks = { ...this.bridgesLinks, [sourceId]: targetId };
    }

    if (this.bridgesFeedbackMode === 'learning') {
      this.verifyBridgesLink(sourceId, targetId);
    } else {
      this.bridgesSelectedSourceId = null;
    }
  }

  clearBridgesLink(sourceId: string): void {
    if (this.result || this.bridgesChecking || this.bridgesLocked[sourceId]) return;
    const next = { ...this.bridgesLinks };
    delete next[sourceId];
    this.bridgesLinks = next;
  }

  investigationStatementText(stmt: InvestigationStatementState): string {
    return this.lang.getCurrentLang() === 'en'
      ? stmt.text_en || stmt.text_fr
      : stmt.text_fr || stmt.text_en;
  }

  selectInvestigationAnswer(statementId: string, value: boolean): void {
    if (this.result) return;
    const current = this.investigationAnswers[statementId];
    this.investigationAnswers = {
      ...this.investigationAnswers,
      [statementId]: current === value ? null : value,
    };
  }

  isInvestigationAnswerSelected(statementId: string, value: boolean): boolean {
    return this.investigationAnswers[statementId] === value;
  }

  comparatorElementLabel(el: ComparatorElement): string {
    return this.lang.getCurrentLang() === 'en'
      ? el.label_en || el.label_fr
      : el.label_fr || el.label_en;
  }

  comparatorCriterionLabel(criterion: ComparatorCriterion): string {
    return this.lang.getCurrentLang() === 'en'
      ? criterion.label_en || criterion.label_fr
      : criterion.label_fr || criterion.label_en;
  }

  comparatorOptionText(option: ComparatorJustificationOption): string {
    return this.lang.getCurrentLang() === 'en'
      ? option.text_en || option.text_fr
      : option.text_fr || option.text_en;
  }

  comparatorTraitText(element: ComparatorElement, criterionKey: string): string {
    const raw = element.traits?.[criterionKey];
    if (!raw) return '—';
    if (typeof raw === 'string') return raw;
    return this.lang.getCurrentLang() === 'en'
      ? String(raw.en || raw.fr || '')
      : String(raw.fr || raw.en || '');
  }

  comparatorAvailableCriteria(): ComparatorCriterion[] {
    const used = new Set(this.comparatorMatrix.map((row) => row.key));
    return this.comparatorCriteria.filter((c) => !used.has(c.key));
  }

  comparatorActiveCriterion(): ComparatorCriterion | null {
    return (
      this.comparatorCriteria.find((c) => c.key === this.comparatorSelectedCriterionKey) || null
    );
  }

  comparatorRelationI18nKey(relation: ComparatorRelation): string {
    if (relation === 'similar') return 'challenges.comparator.relationSimilar';
    if (relation === 'different') return 'challenges.comparator.relationDifferent';
    return 'challenges.comparator.relationPartial';
  }

  startComparator(): void {
    if (this.result) return;
    this.comparatorStep = 'pick_criterion';
    this.comparatorSelectedCriterionKey = null;
    this.comparatorSelectedRelation = null;
    this.comparatorSelectedJustificationId = null;
  }

  selectComparatorCriterion(key: string): void {
    if (this.result || this.comparatorStep !== 'pick_criterion') return;
    this.comparatorSelectedCriterionKey = key;
    this.comparatorSelectedRelation = null;
    this.comparatorSelectedJustificationId = null;
    this.comparatorStep = 'relation';
  }

  selectComparatorRelation(relation: ComparatorRelation): void {
    if (
      this.result ||
      (this.comparatorStep !== 'relation' && this.comparatorStep !== 'justify') ||
      !this.comparatorSelectedCriterionKey
    ) {
      return;
    }
    this.comparatorSelectedRelation = relation;
    const criterion = this.comparatorActiveCriterion();
    this.comparatorJustificationOptions = criterion?.justification_options
      ? [...criterion.justification_options]
      : [];
    this.comparatorSelectedJustificationId = null;
    this.comparatorStep = 'justify';
  }

  selectComparatorJustification(optionId: string): void {
    if (this.result || this.comparatorStep !== 'justify' || !this.comparatorSelectedCriterionKey) {
      return;
    }
    if (!this.comparatorSelectedRelation) return;
    this.comparatorSelectedJustificationId = optionId;
    const criterion = this.comparatorActiveCriterion();
    if (!criterion) return;
    const selectedOption = criterion.justification_options.find((opt) => opt.id === optionId);
    this.comparatorMatrix = [
      ...this.comparatorMatrix.filter((row) => row.key !== criterion.key),
      {
        key: criterion.key,
        label: this.comparatorCriterionLabel(criterion),
        relation: this.comparatorSelectedRelation,
        justificationId: optionId,
        justificationText: selectedOption ? this.comparatorOptionText(selectedOption) : '',
      },
    ];
    this.comparatorSelectedCriterionKey = null;
    this.comparatorSelectedRelation = null;
    this.comparatorSelectedJustificationId = null;
    this.comparatorJustificationOptions = [];
    if (this.comparatorMatrix.length >= this.comparatorRequiredCount) {
      this.comparatorStep = 'matrix';
    } else {
      this.comparatorStep = 'pick_criterion';
    }
  }

  confirmComparatorMatrix(): void {
    if (this.result || this.comparatorStep !== 'matrix') return;
    this.comparatorStep = 'synthesis';
  }

  selectComparatorSynthesis(optionId: string): void {
    if (this.result || this.comparatorStep !== 'synthesis') return;
    this.comparatorSynthesisId = optionId;
  }

  comparatorJustificationText(row: ComparatorMatrixRow): string {
    if (row.justificationText?.trim()) return row.justificationText;
    const criterion = this.comparatorCriteria.find((c) => c.key === row.key);
    const option = criterion?.justification_options.find((opt) => opt.id === row.justificationId);
    return option ? this.comparatorOptionText(option) : '—';
  }

  isComparatorRelationIncorrect(criterionKey: string): boolean {
    if (!this.result) return false;
    const detail = this.comparatorCriterionResult(criterionKey);
    return detail != null && detail.relation_ok === false;
  }

  isComparatorJustificationIncorrect(criterionKey: string): boolean {
    if (!this.result) return false;
    const detail = this.comparatorCriterionResult(criterionKey);
    return detail != null && detail.justification_ok === false;
  }

  isComparatorSynthesisIncorrect(): boolean {
    if (!this.result || !this.comparatorSynthesisId) return false;
    return this.result.criteria_results?.['synthesis_ok'] === false;
  }

  private comparatorCriterionResult(
    criterionKey: string
  ): { relation_ok?: boolean; justification_ok?: boolean } | null {
    const per = this.result?.criteria_results?.['per_criterion'];
    if (!per || typeof per !== 'object') return null;
    const detail = (per as Record<string, unknown>)[criterionKey];
    if (!detail || typeof detail !== 'object') return null;
    return detail as { relation_ok?: boolean; justification_ok?: boolean };
  }

  flipMemoryCard(cardId: string): void {
    if (this.result || this.memoryInputLocked || this.mechanicKey() !== 'memory') return;
    const card = this.memoryCards.find((entry) => entry.id === cardId);
    if (!card || card.matched || card.revealed) return;
    if (this.memoryPendingIds.length >= 2) return;

    this.clearMemoryTimers();

    card.revealed = true;
    this.memoryPendingIds = [...this.memoryPendingIds, cardId];
    this.touchMemoryCards();

    if (this.memoryPendingIds.length === 1) {
      // Carte seule : se recache après 2 s, ou dès qu'une seconde carte est retournée.
      this.memoryFlipTimeout = setTimeout(() => {
        if (this.memoryPendingIds.length === 1 && this.memoryPendingIds[0] === cardId) {
          card.revealed = false;
          this.memoryPendingIds = [];
          this.touchMemoryCards();
        }
        this.memoryFlipTimeout = null;
      }, MEMORY_SOLO_HIDE_MS);
      return;
    }

    this.memoryMoves += 1;
    const [firstId, secondId] = this.memoryPendingIds;
    const first = this.memoryCards.find((entry) => entry.id === firstId);
    const second = this.memoryCards.find((entry) => entry.id === secondId);
    if (!first || !second) {
      this.memoryPendingIds = [];
      return;
    }

    const isMatch =
      first.pair_id === second.pair_id &&
      first.pair_id.length > 0 &&
      first.kind !== second.kind;

    if (isMatch) {
      this.memoryInputLocked = true;
      if (!this.memoryMatchedPairIds.includes(first.pair_id)) {
        this.memoryMatchedPairIds = [...this.memoryMatchedPairIds, first.pair_id];
      }
      this.memoryFlipTimeout = setTimeout(() => {
        first.matched = true;
        second.matched = true;
        first.revealed = false;
        second.revealed = false;
        this.memoryPendingIds = [];
        this.memoryInputLocked = false;
        this.memoryFlipTimeout = null;
        this.touchMemoryCards();
        if (this.isMemoryComplete()) {
          this.submit();
        }
      }, MEMORY_MATCH_HIDE_MS);
      return;
    }

    this.memoryInputLocked = true;
    this.memoryFlipTimeout = setTimeout(() => {
      first.revealed = false;
      second.revealed = false;
      this.memoryPendingIds = [];
      this.memoryInputLocked = false;
      this.memoryFlipTimeout = null;
      this.touchMemoryCards();
    }, MEMORY_MISMATCH_HIDE_MS);
  }

  private clearMemoryTimers(): void {
    if (this.memoryFlipTimeout) {
      clearTimeout(this.memoryFlipTimeout);
      this.memoryFlipTimeout = null;
    }
  }

  private touchMemoryCards(): void {
    this.memoryCards = [...this.memoryCards];
  }

  compatibilityScore(): number | null {
    const ex = this.exercise;
    if (!ex) return null;
    const withCompat = ex as ChallengeExerciseDto & { compatibility_score?: number | null };
    if (typeof withCompat.compatibility_score === 'number') {
      return withCompat.compatibility_score;
    }
    const fromCriteria = ex.success_criteria?.['compatibility_score'];
    return typeof fromCriteria === 'number' ? fromCriteria : null;
  }

  private resetInteraction(): void {
    this.matchingAnswers = {};
    this.matchingPrompts = [];
    this.matchingChoices = [];
    this.sortingOrder = [];
    this.selectedOption = '';
    this.dragDropPool = [];
    this.dragDropZones = [];
    this.dragDropByZone = {};
    this.memoryCards = [];
    this.memoryMatchedPairIds = [];
    this.memoryPendingIds = [];
    this.memoryMoves = 0;
    this.memoryInputLocked = false;
    this.memoryPairCount = 0;
    this.investigationStatements = [];
    this.investigationAnswers = {};
    this.resetComparatorState();
    this.resetSortingLabState();
    this.resetBridgesState();
    this.resetFriezeState();
    this.resetMfState();
    this.resetTaState();
    this.clearMemoryTimers();
    this.clearSortingLabTimers();
    this.clearBridgesTimers();
    this.clearMfTimers();
    this.clearTaTimers();
    this.submitting = false;
    this.result = null;
    this.startTime = Date.now();
    this.initInteractionState(this.exercise);
  }

  private initInteractionState(ex: ChallengeExerciseDto): void {
    const c = ex.content;
    const mechanic = String(c['mechanic'] || ex.game_mechanic || '');
    if (mechanic === 'matching') {
      this.initMatchingState(c);
    } else if (mechanic === 'sorting') {
      this.sortingOrder = [...((c['items'] as string[]) || [])];
    } else if (mechanic === 'drag_drop') {
      const items = [...((c['items'] as string[]) || [])];
      const zones = [...((c['zones'] as string[]) || [])];
      this.dragDropPool = items;
      this.dragDropZones = zones;
      this.dragDropByZone = Object.fromEntries(zones.map((zone) => [zone, []]));
    } else if (mechanic === 'memory') {
      this.initMemoryState(c);
    } else if (mechanic === 'investigation') {
      this.initInvestigationState(c);
    } else if (mechanic === 'comparator') {
      this.initComparatorState(c);
    } else if (mechanic === 'sorting_lab') {
      this.initSortingLabState(c);
    } else if (mechanic === 'knowledge_bridges') {
      this.initBridgesState(c);
    } else if (mechanic === 'sequence_frieze') {
      this.initFriezeState(c);
    } else if (mechanic === 'missing_fragment') {
      this.initMfState(c);
    } else if (mechanic === 'transform_atelier') {
      this.initTaState(c);
    }
  }

  private resetTaState(): void {
    this.taFeedbackMode = 'learning';
    this.taMode = 'single';
    this.taSource = '';
    this.taTargetForm = '';
    this.taInvariant = '';
    this.taTools = [];
    this.taSelectedTools = [];
    this.taCurrentResult = '';
    this.taStepIndex = 0;
    this.taComplete = false;
    this.taHint = '';
    this.taIncorrectAttempts = 0;
    this.taChecking = false;
    this.taIntegrity = 1;
    this.taErrorToolId = null;
    this.taUsedToolIds = {};
  }

  private initTaState(c: Record<string, unknown>): void {
    this.taFeedbackMode = c['feedback_mode'] === 'evaluation' ? 'evaluation' : 'learning';
    this.taMode = c['mode'] === 'chain' ? 'chain' : 'single';
    const en = this.lang.getCurrentLang() === 'en';
    this.taSource = en
      ? String(c['source_en'] || c['source_fr'] || '')
      : String(c['source_fr'] || c['source_en'] || '');
    this.taTargetForm = en
      ? String(c['target_form_en'] || c['target_form_fr'] || '')
      : String(c['target_form_fr'] || c['target_form_en'] || '');
    this.taInvariant = en
      ? String(c['invariant_en'] || c['invariant_fr'] || '')
      : String(c['invariant_fr'] || c['invariant_en'] || '');
    this.taCurrentResult = this.taSource;
    const rawTools = (c['tools'] as Array<Record<string, unknown>>) || [];
    this.taTools = rawTools
      .map((tool) => ({
        id: String(tool['id'] || '').trim(),
        label_fr: String(tool['label_fr'] || tool['label'] || ''),
        label_en: String(tool['label_en'] || tool['label'] || ''),
        result_fr: String(tool['result_fr'] || ''),
        result_en: String(tool['result_en'] || ''),
        preserves_invariant: !!tool['preserves_invariant'],
        hint_fr: String(tool['hint_fr'] || ''),
        hint_en: String(tool['hint_en'] || ''),
      }))
      .filter((tool) => tool.id);
  }

  private resetMfState(): void {
    this.mfFeedbackMode = 'learning';
    this.mfSegments = [];
    this.mfFragmentsById = {};
    this.mfPool = [];
    this.mfGapIds = [];
    this.mfByGap = {};
    this.mfLocked = {};
    this.mfSelectedId = null;
    this.mfHint = '';
    this.mfIncorrectAttempts = 0;
    this.mfChecking = false;
    this.mfFlashGapId = null;
    this.mfBounceId = null;
  }

  private initMfState(c: Record<string, unknown>): void {
    this.mfFeedbackMode = c['feedback_mode'] === 'evaluation' ? 'evaluation' : 'learning';
    const rawSegments = (c['segments'] as Array<Record<string, unknown>>) || [];
    this.mfSegments = rawSegments
      .map((seg) => {
        const type = String(seg['type'] || '') === 'gap' ? 'gap' : 'text';
        if (type === 'gap') {
          return { type: 'gap' as const, id: String(seg['id'] || '').trim() };
        }
        return {
          type: 'text' as const,
          text_fr: String(seg['text_fr'] || seg['text'] || ''),
          text_en: String(seg['text_en'] || seg['text'] || ''),
        };
      })
      .filter((seg) => (seg.type === 'gap' ? !!seg.id : true));

    this.mfGapIds = this.mfSegments
      .filter((seg) => seg.type === 'gap' && seg.id)
      .map((seg) => String(seg.id));
    this.mfByGap = Object.fromEntries(this.mfGapIds.map((id) => [id, [] as string[]]));
    this.mfLocked = {};

    const rawFragments = (c['fragments'] as Array<Record<string, unknown>>) || [];
    const byId: Record<string, MissingFragmentItem> = {};
    for (const raw of rawFragments) {
      const id = String(raw['id'] || '').trim();
      if (!id) continue;
      byId[id] = {
        id,
        label_fr: String(raw['label_fr'] || raw['label'] || ''),
        label_en: String(raw['label_en'] || raw['label'] || ''),
        hint_fr: String(raw['hint_fr'] || ''),
        hint_en: String(raw['hint_en'] || ''),
      };
    }
    this.mfFragmentsById = byId;

    const poolFromContent = ((c['pool'] as string[]) || [])
      .map((id) => String(id || '').trim())
      .filter((id) => !!byId[id]);
    const remaining = Object.keys(byId).filter((id) => !poolFromContent.includes(id));
    this.mfPool = [...poolFromContent, ...remaining];
  }

  private resetFriezeState(): void {
    this.friezeItemsById = {};
    this.friezePool = [];
    this.friezeSlots = [];
    this.friezeLocked = [];
    this.friezeSelectedPoolId = null;
    this.friezeSelectedSlotIndex = null;
    this.friezeAxis = '';
  }

  private initFriezeState(c: Record<string, unknown>): void {
    const rawItems = (c['items'] as Array<Record<string, unknown>>) || [];
    const itemsById: Record<string, SequenceFriezeItem> = {};
    for (const raw of rawItems) {
      const id = String(raw['id'] || '').trim();
      if (!id) continue;
      itemsById[id] = {
        id,
        label_fr: String(raw['label_fr'] || raw['label'] || ''),
        label_en: String(raw['label_en'] || raw['label'] || ''),
        hint_fr: String(raw['hint_fr'] || ''),
        hint_en: String(raw['hint_en'] || ''),
      };
    }
    this.friezeItemsById = itemsById;

    const itemIds = Object.keys(itemsById);
    const slotCount = itemIds.length;
    this.friezeSlots = Array.from({ length: slotCount }, () => []);
    this.friezeLocked = Array.from({ length: slotCount }, () => false);

    const prefilled = (c['prefilled'] as Record<string, string>) || {};
    const used = new Set<string>();
    for (const [pos, itemId] of Object.entries(prefilled)) {
      const index = Number(pos);
      const id = String(itemId || '').trim();
      if (!Number.isInteger(index) || index < 0 || index >= slotCount || !itemsById[id]) {
        continue;
      }
      this.friezeSlots[index].length = 0;
      this.friezeSlots[index].push(id);
      this.friezeLocked[index] = true;
      used.add(id);
    }

    const poolFromContent = ((c['pool'] as string[]) || [])
      .map((id) => String(id || '').trim())
      .filter((id) => itemsById[id] && !used.has(id));
    const remaining = itemIds.filter((id) => !used.has(id) && !poolFromContent.includes(id));
    this.friezePool = [...poolFromContent, ...remaining];

    this.friezeAxis =
      this.lang.getCurrentLang() === 'en'
        ? String(c['axis_en'] || c['axis_fr'] || '')
        : String(c['axis_fr'] || c['axis_en'] || '');
  }

  private resetBridgesState(): void {
    this.bridgesFeedbackMode = 'learning';
    this.bridgesSources = [];
    this.bridgesTargets = [];
    this.bridgesLinks = {};
    this.bridgesLocked = {};
    this.bridgesSelectedSourceId = null;
    this.bridgesHint = '';
    this.bridgesIncorrectAttempts = 0;
    this.bridgesChecking = false;
    this.bridgesFlashSourceId = null;
    this.bridgesErrorSourceId = null;
    this.bridgesExclusive = true;
    this.bridgesStarted = false;
  }

  private initBridgesState(c: Record<string, unknown>): void {
    this.bridgesFeedbackMode =
      c['feedback_mode'] === 'evaluation' ? 'evaluation' : 'learning';
    this.bridgesExclusive = c['exclusive_targets'] !== false;
    const rawSources = (c['sources'] as Array<Record<string, unknown>>) || [];
    const rawTargets = (c['targets'] as Array<Record<string, unknown>>) || [];
    this.bridgesSources = rawSources
      .map((item) => ({
        id: String(item['id'] || '').trim(),
        label_fr: String(item['label_fr'] || item['label'] || ''),
        label_en: String(item['label_en'] || item['label'] || ''),
        hint_fr: String(item['hint_fr'] || ''),
        hint_en: String(item['hint_en'] || ''),
      }))
      .filter((item) => item.id);
    this.bridgesTargets = rawTargets
      .map((item) => ({
        id: String(item['id'] || '').trim(),
        label_fr: String(item['label_fr'] || item['label'] || ''),
        label_en: String(item['label_en'] || item['label'] || ''),
      }))
      .filter((item) => item.id);
    this.bridgesStarted = false;
  }

  private verifyBridgesLink(sourceId: string, targetId: string): void {
    if (!this.exercise) return;
    this.bridgesChecking = true;
    this.api.checkKnowledgeBridgesLink(this.exercise.id_exercise, sourceId, targetId).subscribe({
      next: (res) => {
        this.bridgesChecking = false;
        if (res.correct) {
          this.bridgesLocked = { ...this.bridgesLocked, [sourceId]: true };
          this.bridgesFlashSourceId = sourceId;
          this.bridgesHint = '';
          if (this.bridgesFlashTimeout) clearTimeout(this.bridgesFlashTimeout);
          this.bridgesFlashTimeout = setTimeout(() => {
            this.bridgesFlashSourceId = null;
            this.bridgesFlashTimeout = null;
          }, 700);
        } else {
          this.bridgesIncorrectAttempts += 1;
          const next = { ...this.bridgesLinks };
          delete next[sourceId];
          this.bridgesLinks = next;
          this.bridgesErrorSourceId = sourceId;
          this.bridgesHint =
            this.lang.getCurrentLang() === 'en'
              ? res.hint_en || res.hint_fr || ''
              : res.hint_fr || res.hint_en || '';
          if (this.bridgesErrorTimeout) clearTimeout(this.bridgesErrorTimeout);
          this.bridgesErrorTimeout = setTimeout(() => {
            this.bridgesErrorSourceId = null;
            this.bridgesErrorTimeout = null;
          }, 450);
        }
        this.bridgesSelectedSourceId = null;
      },
      error: () => {
        this.bridgesChecking = false;
        const next = { ...this.bridgesLinks };
        delete next[sourceId];
        this.bridgesLinks = next;
        this.bridgesSelectedSourceId = null;
      },
    });
  }

  private clearBridgesTimers(): void {
    if (this.bridgesFlashTimeout) {
      clearTimeout(this.bridgesFlashTimeout);
      this.bridgesFlashTimeout = null;
    }
    if (this.bridgesErrorTimeout) {
      clearTimeout(this.bridgesErrorTimeout);
      this.bridgesErrorTimeout = null;
    }
  }

  private resetSortingLabState(): void {
    this.sortingLabMode = 'visible';
    this.sortingLabFeedbackMode = 'learning';
    this.sortingLabItemsById = {};
    this.sortingLabCategories = [];
    this.sortingLabPool = [];
    this.sortingLabByCategory = {};
    this.sortingLabSelectedItemId = null;
    this.sortingLabLocked = {};
    this.sortingLabHint = '';
    this.sortingLabIncorrectAttempts = 0;
    this.sortingLabMoves = 0;
    this.sortingLabChecking = false;
    this.sortingLabFlashCategoryId = null;
    this.sortingLabBounceItemId = null;
  }

  private initSortingLabState(c: Record<string, unknown>): void {
    this.sortingLabMode = c['mode'] === 'hidden' ? 'hidden' : 'visible';
    this.sortingLabFeedbackMode = c['feedback_mode'] === 'strict' ? 'strict' : 'learning';

    const rawItems = (c['items'] as Array<Record<string, unknown>>) || [];
    const items: SortingLabItem[] = rawItems
      .map((item) => ({
        id: String(item['id'] || '').trim(),
        label_fr: String(item['label_fr'] || item['label'] || ''),
        label_en: String(item['label_en'] || item['label'] || ''),
        hint_fr: String(item['hint_fr'] || ''),
        hint_en: String(item['hint_en'] || ''),
      }))
      .filter((item) => item.id);

    this.sortingLabItemsById = Object.fromEntries(items.map((item) => [item.id, item]));
    this.sortingLabPool = items.map((item) => item.id);

    const rawCategories = (c['categories'] as Array<Record<string, unknown>>) || [];
    this.sortingLabCategories = rawCategories
      .map((cat, index) => ({
        id: String(cat['id'] || `c${index}`),
        label_fr: String(cat['label_fr'] || cat['label'] || ''),
        label_en: String(cat['label_en'] || cat['label'] || ''),
        hidden_label_fr: String(cat['hidden_label_fr'] || `Groupe ${index + 1}`),
        hidden_label_en: String(cat['hidden_label_en'] || `Group ${index + 1}`),
      }))
      .filter((cat) => cat.id);

    this.sortingLabByCategory = Object.fromEntries(
      this.sortingLabCategories.map((cat) => [cat.id, [] as string[]])
    );
  }

  private buildSortingLabPlacements(): Record<string, string> {
    const placements: Record<string, string> = {};
    for (const category of this.sortingLabCategories) {
      for (const itemId of this.sortingLabByCategory[category.id] ?? []) {
        placements[itemId] = category.id;
      }
    }
    return placements;
  }

  private sortingLabCategoryIdFromListId(listId: string): string | null {
    const prefix = 'sorting-lab-cat-';
    if (!listId.startsWith(prefix)) return null;
    return listId.slice(prefix.length) || null;
  }

  private moveSortingLabItemToCategory(itemId: string, categoryId: string): void {
    this.sortingLabPool = this.sortingLabPool.filter((id) => id !== itemId);
    for (const cat of this.sortingLabCategories) {
      this.sortingLabByCategory[cat.id] = (this.sortingLabByCategory[cat.id] ?? []).filter(
        (id) => id !== itemId
      );
    }
    this.sortingLabByCategory[categoryId] = [
      ...(this.sortingLabByCategory[categoryId] ?? []),
      itemId,
    ];
  }

  private bounceSortingLabItemToPool(itemId: string): void {
    for (const cat of this.sortingLabCategories) {
      this.sortingLabByCategory[cat.id] = (this.sortingLabByCategory[cat.id] ?? []).filter(
        (id) => id !== itemId
      );
    }
    if (!this.sortingLabPool.includes(itemId)) {
      this.sortingLabPool = [...this.sortingLabPool, itemId];
    }
    this.sortingLabBounceItemId = itemId;
    if (this.sortingLabBounceTimeout) clearTimeout(this.sortingLabBounceTimeout);
    this.sortingLabBounceTimeout = setTimeout(() => {
      this.sortingLabBounceItemId = null;
      this.sortingLabBounceTimeout = null;
    }, 450);
  }

  private verifySortingLabPlacement(itemId: string, categoryId: string): void {
    if (!this.exercise) return;
    this.sortingLabChecking = true;
    this.api.checkSortingLabPlacement(this.exercise.id_exercise, itemId, categoryId).subscribe({
      next: (res) => {
        this.sortingLabChecking = false;
        if (res.correct) {
          this.sortingLabLocked = { ...this.sortingLabLocked, [itemId]: true };
          this.sortingLabFlashCategoryId = categoryId;
          this.sortingLabHint = '';
          if (this.sortingLabFlashTimeout) clearTimeout(this.sortingLabFlashTimeout);
          this.sortingLabFlashTimeout = setTimeout(() => {
            this.sortingLabFlashCategoryId = null;
            this.sortingLabFlashTimeout = null;
          }, 700);
        } else {
          this.sortingLabIncorrectAttempts += 1;
          this.bounceSortingLabItemToPool(itemId);
          if (this.sortingLabFeedbackMode === 'learning') {
            this.sortingLabHint =
              this.lang.getCurrentLang() === 'en'
                ? res.hint_en || res.hint_fr || ''
                : res.hint_fr || res.hint_en || '';
          } else {
            this.sortingLabHint = '';
          }
        }
        this.sortingLabSelectedItemId = null;
      },
      error: () => {
        this.sortingLabChecking = false;
        this.bounceSortingLabItemToPool(itemId);
        this.sortingLabSelectedItemId = null;
      },
    });
  }

  private clearSortingLabTimers(): void {
    if (this.sortingLabFlashTimeout) {
      clearTimeout(this.sortingLabFlashTimeout);
      this.sortingLabFlashTimeout = null;
    }
    if (this.sortingLabBounceTimeout) {
      clearTimeout(this.sortingLabBounceTimeout);
      this.sortingLabBounceTimeout = null;
    }
  }

  private resetComparatorState(): void {
    this.comparatorStep = 'observe';
    this.comparatorElements = [];
    this.comparatorCriteria = [];
    this.comparatorRequiredCount = 0;
    this.comparatorSelectedCriterionKey = null;
    this.comparatorSelectedRelation = null;
    this.comparatorSelectedJustificationId = null;
    this.comparatorMatrix = [];
    this.comparatorSynthesisId = null;
    this.comparatorJustificationOptions = [];
    this.comparatorSynthesisOptions = [];
  }

  private initComparatorState(c: Record<string, unknown>): void {
    const rawElements = (c['elements'] as Array<Record<string, unknown>>) || [];
    this.comparatorElements = rawElements.map((el) => ({
      id: String(el['id'] || ''),
      label_fr: String(el['label_fr'] || el['label'] || ''),
      label_en: String(el['label_en'] || el['label'] || ''),
      traits: (el['traits'] as ComparatorElement['traits']) || {},
    }));

    const rawCriteria = (c['criteria'] as Array<Record<string, unknown>>) || [];
    this.comparatorCriteria = rawCriteria.map((criterion) => {
      const optionsRaw =
        (criterion['justification_options'] as Array<Record<string, unknown>>) || [];
      return {
        key: String(criterion['key'] || ''),
        label_fr: String(criterion['label_fr'] || criterion['key'] || ''),
        label_en: String(criterion['label_en'] || criterion['key'] || ''),
        justification_options: optionsRaw.map((opt) => ({
          id: String(opt['id'] || ''),
          text_fr: String(opt['text_fr'] || ''),
          text_en: String(opt['text_en'] || ''),
        })),
      };
    });

    this.comparatorRequiredCount = Number(
      c['required_criteria_count'] || this.comparatorCriteria.length || 0
    );

    // Options de synthèse : champ public (ou legacy dans solution.synthesis.options).
    const publicSynth = (c['synthesis_options'] as Array<Record<string, unknown>>) || [];
    const solution = (c['solution'] as Record<string, unknown>) || {};
    const legacySynth = (solution['synthesis'] as Record<string, unknown>) || {};
    const synthOptions =
      publicSynth.length > 0
        ? publicSynth
        : ((legacySynth['options'] as Array<Record<string, unknown>>) || []);
    this.comparatorSynthesisOptions = synthOptions.map((opt) => ({
      id: String(opt['id'] || ''),
      text_fr: String(opt['text_fr'] || ''),
      text_en: String(opt['text_en'] || ''),
    }));

    // Compatibilité anciens défis : options encore dans solution.justifications.
    const legacyJustifs = (solution['justifications'] as Record<string, unknown>) || {};
    for (const criterion of this.comparatorCriteria) {
      if (criterion.justification_options.length > 0) continue;
      const meta = legacyJustifs[criterion.key];
      if (!meta || typeof meta !== 'object') continue;
      const optionsRaw = ((meta as Record<string, unknown>)['options'] as Array<Record<string, unknown>>) || [];
      criterion.justification_options = optionsRaw.map((opt) => ({
        id: String(opt['id'] || ''),
        text_fr: String(opt['text_fr'] || ''),
        text_en: String(opt['text_en'] || ''),
      }));
    }

    this.comparatorStep = 'observe';
    this.comparatorSelectedCriterionKey = null;
    this.comparatorSelectedRelation = null;
    this.comparatorSelectedJustificationId = null;
    this.comparatorMatrix = [];
    this.comparatorSynthesisId = null;
    this.comparatorJustificationOptions = [];
  }

  private initInvestigationState(c: Record<string, unknown>): void {
    const raw = (c['statements'] as Array<Record<string, unknown>>) || [];
    this.investigationStatements = raw
      .map((stmt) => ({
        id: String(stmt['id'] || '').trim(),
        text_fr: String(stmt['text_fr'] || '').trim(),
        text_en: String(stmt['text_en'] || '').trim(),
      }))
      .filter((stmt) => stmt.id && (stmt.text_fr || stmt.text_en));
    this.investigationAnswers = Object.fromEntries(
      this.investigationStatements.map((stmt) => [stmt.id, null])
    );
  }

  private initMemoryState(c: Record<string, unknown>): void {
    const rawCards = (c['cards'] as Array<Record<string, unknown>>) || [];
    const pairOrder: string[] = [];
    for (const card of rawCards) {
      const pairId = String(card['pair_id'] || '').trim();
      if (pairId && !pairOrder.includes(pairId)) {
        pairOrder.push(pairId);
      }
    }
    const colorByPair = Object.fromEntries(
      pairOrder.map((pairId, index) => [
        pairId,
        MEMORY_PAIR_COLORS[index % MEMORY_PAIR_COLORS.length],
      ])
    );

    this.memoryCards = rawCards.map((card) => {
      const pairId = String(card['pair_id'] || '');
      return {
        id: String(card['id'] || ''),
        pair_id: pairId,
        face: String(card['face'] || ''),
        kind: card['kind'] === 'answer' ? 'answer' : 'prompt',
        color: colorByPair[pairId] || MEMORY_PAIR_COLORS[0],
        revealed: false,
        matched: false,
      };
    });
    this.memoryPairCount = Number(c['pair_count'] || 0);
    if (!this.memoryPairCount) {
      const solution = c['solution'];
      if (solution && typeof solution === 'object') {
        this.memoryPairCount = Object.keys(solution as object).length;
      } else {
        this.memoryPairCount = pairOrder.length;
      }
    }
    this.memoryMatchedPairIds = [];
    this.memoryPendingIds = [];
    this.memoryMoves = 0;
    this.memoryInputLocked = false;
  }

  private initMatchingState(c: Record<string, unknown>): void {
    const solutionFromContent = (c['solution'] as Record<string, string>) || {};
    const solution: Record<string, string> = { ...solutionFromContent };
    const pairs = (c['pairs'] as { left: string; right?: string }[]) || [];

    if (!Object.keys(solution).length) {
      for (const pair of pairs) {
        const left = String(pair.left || '').trim();
        const right = String(pair.right || '').trim();
        if (left && right) solution[left] = right;
      }
    }

    let prompts = Array.isArray(c['prompts'])
      ? (c['prompts'] as string[]).map((p) => String(p).trim()).filter(Boolean)
      : pairs.map((p) => String(p.left || '').trim()).filter(Boolean);

    let choices = Array.isArray(c['choices'])
      ? (c['choices'] as string[]).map((v) => String(v).trim()).filter(Boolean)
      : [];

    if (!choices.length) {
      choices = [...new Set(Object.values(solution).map((v) => String(v).trim()).filter(Boolean))];
    }

    if (!Array.isArray(c['choices']) || !Array.isArray(c['prompts'])) {
      const seed = this.exercise.id_exercise;
      choices = this.shuffleStable(choices, seed);
      prompts = this.shuffleStable(prompts, seed + 1);
    }

    this.matchingPrompts = prompts;
    this.matchingChoices = choices;
    this.matchingAnswers = Object.fromEntries(prompts.map((prompt) => [prompt, '']));
  }

  private shuffleStable<T>(items: T[], seed: number): T[] {
    const copy = [...items];
    let state = seed >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
