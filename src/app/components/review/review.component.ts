import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  NgZone,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import {
  CdkDragEnd,
  CdkDragMove,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import {
  ApiService,
  EvaluationRecord,
  StoreEvaluationPayload,
} from '../../api/api.service';
import { SpinnerComponent } from '../../shared/spinner/spinner.component';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';
import { TranslateModule } from '@ngx-translate/core';
import { assignQuestionNumbers } from '../../shared/utils/question-order.util';
import {
  QuestionDrawingDialogComponent,
  QuestionDrawingDialogResult,
  QUESTION_DRAWING_DIALOG_INITIAL_HEIGHT,
  QUESTION_DRAWING_DIALOG_INITIAL_WIDTH,
} from './dialogs/question-drawing-dialog.component';

interface ReviewQuestion {
  id: string;
  label: string;
  /** Numéro fixe Q1…Qn (rang par `id_question` croissant). */
  qNum: number;
  /** Fourni par l’API avec les questions (ex. champ evaluation_count). */
  evaluationCount: number;
  /** True si la colonne `question.dessin` est renseignée en base. */
  hasDessin: boolean;
}

interface QuestionAnswerHistoryEntry {
  reponse: string;
  note: number | null;
  at: number;
  /** Clé primaire en base ; absent pour une évaluation locale non enregistrée. */
  id_evaluation?: number;
}

interface ParsedEvaluation {
  pertinence: string;
  pertinence_note: number | null;
  precision: string;
  precision_note: number | null;
  clarte: string;
  clarte_note: number | null;
  synthese_points_forts: string[];
  synthese_points_faibles: string[];
  synthese_conseils_pedagogiques: string[];
  note: number | null;
  /** Présent après chargement depuis l’API ; absent pour une évaluation « en session ». */
  date_creation?: string;
}

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    FormsModule,
    TransverseRailComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    SpinnerComponent,
    TranslateModule,
  ],
  templateUrl: './review.component.html',
  styleUrls: ['./review.component.scss'],
})
export class ReviewComponent implements OnInit {
  /** Position du 1er séparateur (questions | …), en % de la largeur du layout. */
  private readonly minColumnPercent = 18;
  private readonly minDividerGapPercent = 14;

  @ViewChild('reviewLayout') reviewLayoutRef?: ElementRef<HTMLElement>;

  selectedThemeId = '';
  selectedThemeLabel = '';
  selectedSubThemeLabel = '';
  selectedSubThemeId = '';

  questions: ReviewQuestion[] = [];
  selectedQuestionIndex = 0;

  userAnswer = '';
  loadingQuestions = false;
  evaluating = false;
  loadError = '';
  evaluateError = '';
  /** Positions des séparateurs en % de la largeur totale (0–100). */
  divider1Percent = 30;
  divider2Percent = 72;
  isResizingPanels = false;
  savingEvaluation = false;
  saveError = '';
  saveSuccess = '';
  loadingHistory = false;
  historyLoadError = '';
  private historyRequestSeq = 0;

  /** Détail chargé depuis l’historique (clic sur une ligne). */
  historyDetailEvaluation: ParsedEvaluation | null = null;
  selectedHistoryEvaluationId: number | null = null;
  loadingHistoryDetail = false;
  historyDetailError = '';

  id_audio: string = '';
  mediaRecorder!: MediaRecorder;
  audioChunks: Blob[] = [];
  audioUrl?: string;
  isRecording = false;
  audioBlob?: Blob;
  audioElement?: HTMLAudioElement;
  isLoading = false;

  parsedEvaluationByQuestionId: Record<string, ParsedEvaluation> = {};
  reponseByQuestionId: Record<string, string> = {};
  evaluationHistoryByQuestionId: Record<string, QuestionAnswerHistoryEntry[]> =
    {};

  private readonly dialog = inject(MatDialog);

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService,
    private zone: NgZone,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.selectedThemeId = params.get('theme') || '';
      this.selectedThemeLabel = params.get('themeLabel') || '';
      this.selectedSubThemeLabel = params.get('subThemeLabel') || '';
      this.selectedSubThemeId = params.get('subTheme') || '';
      this.loadQuestionsForSubTheme();
    });
  }

  startRecording() {
    this.isRecording = true;
    this.audioChunks = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // 🎙️ MediaRecorder
        this.mediaRecorder = new MediaRecorder(stream);

        this.mediaRecorder.ondataavailable = (event) => {
          this.audioChunks.push(event.data);
        };

        this.mediaRecorder.onstop = () => {
          // Crée le blob audio
          this.audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          this.audioUrl = URL.createObjectURL(this.audioBlob);
          this.audioElement = new Audio(this.audioUrl);
          // Stoppe le micro pour libérer la ressource
          stream.getTracks().forEach((track) => track.stop());

          // Envoie au backend pour transcription
          this.sendAudioToBackend();
        };

        this.mediaRecorder.start();
      })
      .catch((err) => {
        console.error('Erreur accès micro :', err);
        this.isRecording = false;
      });
  }
  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.mediaRecorder?.stop();
  }

  async playAudio() {
    if (!this.id_audio) return;

    this.zone.run(() => {
      this.isLoading = true;
    });

    try {
      this.http
        .get(`http://localhost:8002/themes/get_audio_file/${this.id_audio}`, {
          responseType: 'blob',
        })
        .subscribe((blob: Blob | MediaSource) => {
          this.audioUrl = URL.createObjectURL(blob);
          this.audioElement = new Audio(this.audioUrl);
          this.audioElement.currentTime = 0;
          this.audioElement.play();
        });
    } catch (err) {
      console.error('Erreur getting audio file :', err);
    } finally {
      this.zone.run(() => {
        this.isLoading = false;
      });
    }
  }

  async sendAudioToBackend() {
    if (!this.audioBlob) return;

    this.zone.run(() => {
      this.isLoading = true;
    });

    const formData = new FormData();
    formData.append('audio', this.audioBlob, 'reponse.webm');

    try {
      const response = await fetch(
        'http://localhost:8002/themes/get_transcribe_audio',
        {
          method: 'POST',
          body: formData,
        },
      );

      const data = await response.json();
      this.zone.run(() => {
        this.userAnswer = data.text || '';
        this.id_audio = data.id || '';
      });
    } catch (err) {
      console.error('Erreur transcription backend :', err);
    } finally {
      this.zone.run(() => {
        this.isLoading = false;
      });
    }
  }

  get selectedQuestion(): ReviewQuestion | null {
    if (!this.questions.length) {
      return null;
    }
    return this.questions[this.selectedQuestionIndex] || null;
  }

  get latestParsedEvaluation(): ParsedEvaluation | null {
    const question = this.selectedQuestion;
    if (!question) {
      return null;
    }
    return Object.prototype.hasOwnProperty.call(
      this.parsedEvaluationByQuestionId,
      question.id,
    )
      ? (this.parsedEvaluationByQuestionId[question.id] ?? null)
      : null;
  }

  /** Détail affiché : session en cours ou ligne d’historique sélectionnée. */
  get displayedEvaluation(): ParsedEvaluation | null {
    if (
      this.selectedHistoryEvaluationId !== null &&
      this.loadingHistoryDetail
    ) {
      return null;
    }
    if (this.historyDetailEvaluation) {
      return this.historyDetailEvaluation;
    }
    return this.latestParsedEvaluation;
  }

  get currentQuestionHistory(): QuestionAnswerHistoryEntry[] {
    const question = this.selectedQuestion;
    if (!question) {
      return [];
    }
    return this.evaluationHistoryByQuestionId[question.id] ?? [];
  }

  /**
   * Libellé 1…n pour l’historique : la plus ancienne (bas de liste) = 1, la plus récente (haut) = n.
   */
  historyEvaluationDisplayIndex(listIndex: number): number {
    const n = this.currentQuestionHistory.length;
    return n - listIndex;
  }

  /** Indice affiché pour la ligne d’historique actuellement ouverte en détail (même règle que ci-dessus). */
  get selectedHistoryDisplayIndex(): number | null {
    if (this.selectedHistoryEvaluationId === null) {
      return null;
    }
    const list = this.currentQuestionHistory;
    const idx = list.findIndex(
      (e) => e.id_evaluation === this.selectedHistoryEvaluationId,
    );
    if (idx < 0) {
      return null;
    }
    return this.historyEvaluationDisplayIndex(idx);
  }

  get canSaveEvaluation(): boolean {
    if (this.selectedHistoryEvaluationId !== null) {
      return false;
    }
    const question = this.selectedQuestion;
    const parsed = this.latestParsedEvaluation;
    if (!question || !parsed) {
      return false;
    }
    if (!this.reponseByQuestionId[question.id]?.trim()) {
      return false;
    }
    if (
      this.parseIntegerId(this.selectedThemeId) === null ||
      this.parseIntegerId(this.selectedSubThemeId) === null ||
      this.parseIntegerId(question.id) === null
    ) {
      return false;
    }
    return true;
  }

  selectQuestion(index: number): void {
    this.selectedQuestionIndex = index;
    this.userAnswer = '';
    this.evaluateError = '';
    this.saveError = '';
    this.saveSuccess = '';
    this.clearHistoryDetailSelection();
    const q = this.questions[index];
    if (q) {
      this.loadEvaluationHistoryForQuestion(q.id);
    }
  }

  openDrawingDialog(): void {
    const question = this.selectedQuestion;
    if (!question) {
      return;
    }
    const ref = this.dialog.open(QuestionDrawingDialogComponent, {
      width: QUESTION_DRAWING_DIALOG_INITIAL_WIDTH,
      maxWidth: QUESTION_DRAWING_DIALOG_INITIAL_WIDTH,
      height: QUESTION_DRAWING_DIALOG_INITIAL_HEIGHT,
      maxHeight: '100vh',
      panelClass: 'app-question-drawing-dialog',
      data: {
        questionId: question.id,
        questionLabel: question.label,
      },
    });
    ref.afterClosed().subscribe((result: QuestionDrawingDialogResult) => {
      if (result === 'saved') {
        question.hasDessin = true;
      } else if (result === 'deleted') {
        question.hasDessin = false;
      }
    });
  }

  onHistoryRowClick(entry: QuestionAnswerHistoryEntry): void {
    if (entry.id_evaluation === undefined) {
      return;
    }
    this.selectedHistoryEvaluationId = entry.id_evaluation;
    this.historyDetailEvaluation = null;
    this.historyDetailError = '';
    this.loadingHistoryDetail = true;

    this.apiService.getEvaluationById(entry.id_evaluation).subscribe({
      next: (row) => {
        this.historyDetailEvaluation = this.recordToParsedEvaluation(row);
        this.userAnswer = row.reponse ?? '';
        this.loadingHistoryDetail = false;
      },
      error: (err: HttpErrorResponse) => {
        this.loadingHistoryDetail = false;
        this.historyDetailEvaluation = null;
        this.selectedHistoryEvaluationId = null;
        this.historyDetailError =
          err.status === 404
            ? 'Cette évaluation est introuvable en base.'
            : "Impossible de charger le détail de l'évaluation.";
      },
    });
  }

  private clearHistoryDetailSelection(): void {
    this.historyDetailEvaluation = null;
    this.selectedHistoryEvaluationId = null;
    this.historyDetailError = '';
    this.loadingHistoryDetail = false;
  }

  submitEvaluation(): void {
    const content = this.userAnswer.trim();
    const question = this.selectedQuestion;
    if (!question || !content || this.evaluating) {
      return;
    }

    this.evaluateError = '';
    this.evaluating = true;

    this.apiService
      .evaluateResponse(this.selectedSubThemeLabel, question.label, content)
      .subscribe({
        next: (response: unknown) => {
          try {
            const payload =
              typeof response === 'string'
                ? (JSON.parse(response) as unknown)
                : response;
            const parsed = this.parseToParsedEvaluation(payload);
            this.clearHistoryDetailSelection();
            this.parsedEvaluationByQuestionId[question.id] = parsed;
            this.reponseByQuestionId[question.id] = content;
          } catch {
            this.evaluateError = "Réponse d'évaluation invalide ou illisible.";
          }
        },
        error: () => {
          this.evaluateError =
            "Impossible d'évaluer la réponse pour le moment.";
        },
        complete: () => {
          this.evaluating = false;
        },
      });
  }

  saveEvaluation(): void {
    const question = this.selectedQuestion;
    const parsed = this.latestParsedEvaluation;
    if (
      !question ||
      !parsed ||
      !this.canSaveEvaluation ||
      this.savingEvaluation
    ) {
      return;
    }

    const idTheme = this.parseIntegerId(this.selectedThemeId);
    const idSubtheme = this.parseIntegerId(this.selectedSubThemeId);
    const idQuestion = this.parseIntegerId(question.id);
    const reponse = this.reponseByQuestionId[question.id]?.trim() ?? '';

    if (
      idTheme === null ||
      idSubtheme === null ||
      idQuestion === null ||
      !reponse
    ) {
      this.saveError =
        'Données manquantes pour enregistrer (identifiants ou réponse).';
      return;
    }

    const payload: StoreEvaluationPayload = {
      id_theme: idTheme,
      id_subtheme: idSubtheme,
      id_question: idQuestion,
      reponse,
      pertinence: parsed.pertinence,
      pertinence_note: parsed.pertinence_note,
      precision: parsed.precision,
      precision_note: parsed.precision_note,
      clarte: parsed.clarte,
      clarte_note: parsed.clarte_note,
      synthese_points_forts: parsed.synthese_points_forts,
      synthese_points_faibles: parsed.synthese_points_faibles,
      synthese_conseils_pedagogiques: parsed.synthese_conseils_pedagogiques,
      note: parsed.note,
    };

    this.savingEvaluation = true;
    this.saveError = '';
    this.saveSuccess = '';

    this.apiService.storeEvaluation(payload).subscribe({
      next: () => {
        this.saveSuccess = 'Évaluation enregistrée.';
        question.evaluationCount += 1;
        this.loadEvaluationHistoryForQuestion(question.id);
      },
      error: () => {
        this.saveError = "Impossible d'enregistrer l'évaluation.";
      },
      complete: () => {
        this.savingEvaluation = false;
      },
    });
  }

  onDividerDragStart(): void {
    this.isResizingPanels = true;
  }

  onFirstDividerDragMoved(event: CdkDragMove): void {
    const layout = this.reviewLayoutRef?.nativeElement;
    if (!layout) {
      return;
    }

    const rect = layout.getBoundingClientRect();
    const relativeX = event.pointerPosition.x - rect.left;
    const percentage = (relativeX / rect.width) * 100;
    const maxP1 = this.divider2Percent - this.minDividerGapPercent;
    this.divider1Percent = this.clampPercent(
      percentage,
      this.minColumnPercent,
      maxP1,
    );
    event.source.reset();
  }

  onSecondDividerDragMoved(event: CdkDragMove): void {
    const layout = this.reviewLayoutRef?.nativeElement;
    if (!layout) {
      return;
    }

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

  private loadEvaluationHistoryForQuestion(questionId: string): void {
    const numericId = this.parseIntegerId(questionId);
    if (numericId === null) {
      this.evaluationHistoryByQuestionId[questionId] = [];
      return;
    }

    const seq = ++this.historyRequestSeq;
    this.loadingHistory = true;
    this.historyLoadError = '';

    this.apiService.getEvaluationsByQuestion(numericId).subscribe({
      next: (rows) => {
        if (seq !== this.historyRequestSeq) {
          return;
        }
        this.evaluationHistoryByQuestionId[questionId] =
          this.mapServerRowsToHistory(rows);
      },
      error: () => {
        if (seq !== this.historyRequestSeq) {
          return;
        }
        this.historyLoadError =
          "Impossible de charger l'historique des évaluations.";
        this.evaluationHistoryByQuestionId[questionId] = [];
      },
      complete: () => {
        if (seq !== this.historyRequestSeq) {
          return;
        }
        this.loadingHistory = false;
      },
    });
  }

  private mapServerRowsToHistory(
    rows: EvaluationRecord[],
  ): QuestionAnswerHistoryEntry[] {
    return rows.map((r) => ({
      reponse: r.reponse ?? '',
      note: r.note ?? null,
      at: r.id,
      id_evaluation: r.id,
    }));
  }

  private recordToParsedEvaluation(row: EvaluationRecord): ParsedEvaluation {
    return {
      pertinence: row.pertinence ?? '',
      pertinence_note: row.pertinence_note ?? null,
      precision: row.precision ?? '',
      precision_note: row.precision_note ?? null,
      clarte: row.clarte ?? '',
      clarte_note: row.clarte_note ?? null,
      synthese_points_forts: this.coerceToStringArray(
        row.synthese_points_forts,
      ),
      synthese_points_faibles: this.coerceToStringArray(
        row.synthese_points_faibles,
      ),
      synthese_conseils_pedagogiques: this.coerceToStringArray(
        row.synthese_conseils_pedagogiques,
      ),
      note: row.note ?? null,
      date_creation: row.date_creation,
    };
  }

  private loadQuestionsForSubTheme(): void {
    this.questions = [];
    this.selectedQuestionIndex = 0;
    this.parsedEvaluationByQuestionId = {};
    this.reponseByQuestionId = {};
    this.evaluationHistoryByQuestionId = {};
    this.clearHistoryDetailSelection();
    this.loadError = '';
    this.saveError = '';
    this.saveSuccess = '';

    if (!this.selectedSubThemeId) {
      this.loadError = 'Aucun parcours sélectionné.';
      return;
    }

    this.loadingQuestions = true;

    this.apiService.getQuestionsBySubTheme(this.selectedSubThemeId).subscribe({
      next: (response: any) => {
        this.questions = assignQuestionNumbers(this.normalizeQuestions(response));
        if (this.questions.length) {
          this.loadEvaluationHistoryForQuestion(
            this.questions[this.selectedQuestionIndex].id,
          );
        }
      },
      error: () => {
        this.loadError =
          'Impossible de récupérer les questions de ce parcours.';
      },
      complete: () => {
        this.loadingQuestions = false;
      },
    });
  }

  private normalizeQuestions(response: any): Omit<ReviewQuestion, 'qNum'>[] {
    const records = Array.isArray(response)
      ? response
      : response?.questions || response?.data || [];

    return records
      .map((record: any, index: number) => {
        const rawLabel = record?.libelle || '';
        const label = this.decodeQuestionText(rawLabel);
        const id = String(record?.id ?? record?.id_question ?? index);
        const evaluationCount = this.parseEvaluationCountFromRecord(record);
        const hasDessin = this.parseHasDessinFromRecord(record);
        return { id, label, evaluationCount, hasDessin };
      })
      .filter((q: Omit<ReviewQuestion, 'qNum'>) => !!q.label);
  }

  private parseEvaluationCountFromRecord(record: any): number {
    const raw =
      record?.evaluation_count ??
      record?.evaluationCount ??
      record?.nb_evaluations ??
      record?.nombre_evaluations;
    if (raw === null || raw === undefined || raw === '') {
      return 0;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  private parseHasDessinFromRecord(record: any): boolean {
    if (record?.has_dessin === true || record?.hasDessin === true) {
      return true;
    }
    const raw = record?.dessin;
    if (raw == null || raw === '') {
      return false;
    }
    if (typeof raw === 'object') {
      return Object.keys(raw).length > 0;
    }
    return true;
  }

  private decodeQuestionText(value: string): string {
    if (!value) {
      return '';
    }
    try {
      return decodeURIComponent(value).replace(/''/g, "'");
    } catch {
      return value.replace(/''/g, "'");
    }
  }

  private parseToParsedEvaluation(raw: unknown): ParsedEvaluation {
    if (raw === null || raw === undefined || typeof raw !== 'object') {
      throw new Error('Payload attendu : objet JSON.');
    }
    const o = raw as Record<string, unknown>;

    const pointsForts = this.coerceToStringArray(
      o['synthese_points_forts'] ?? o['points_forts'],
    );
    const pointsFaibles = this.coerceToStringArray(
      o['synthese_points_faibles'] ?? o['points_faibles'],
    );
    const conseils = this.coerceToStringArray(
      o['synthese_conseils_pedagogiques'] ?? o['conseils_pedagogiques'],
    );

    const dc = o['date_creation'];
    return {
      pertinence: this.normalizeTrimmedString(o['pertinence']),
      pertinence_note: this.normalizeOptionalNumber(o['pertinence_note']),
      precision: this.normalizeTrimmedString(o['precision']),
      precision_note: this.normalizeOptionalNumber(o['precision_note']),
      clarte: this.normalizeTrimmedString(o['clarte']),
      clarte_note: this.normalizeOptionalNumber(o['clarte_note']),
      synthese_points_forts: pointsForts,
      synthese_points_faibles: pointsFaibles,
      synthese_conseils_pedagogiques: conseils,
      note: this.normalizeOptionalNumber(o['note']),
      ...(dc != null && String(dc).trim() !== ''
        ? { date_creation: String(dc).trim() }
        : {}),
    };
  }

  private normalizeTrimmedString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  private normalizeOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const asString = String(value).trim().replace(',', '.');
    if (!asString) {
      return null;
    }
    const n = Number(asString);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Normalise toute valeur (tableau, chaîne JSON de tableau, texte multiligne) en liste de chaînes pour affichage en puces.
   */
  private coerceToStringArray(value: unknown): string[] {
    if (value === null || value === undefined) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter((item) => !!item);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return [];
      }
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (Array.isArray(parsed)) {
            return this.coerceToStringArray(parsed);
          }
        } catch {
          // texte libre : découper par lignes
        }
      }
      return trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => !!line);
    }
    return [String(value).trim()].filter((s) => !!s);
  }

  private clampPercent(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private parseIntegerId(value: string): number | null {
    const trimmed = String(value).trim();
    if (!trimmed) {
      return null;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return null;
    }
    return n;
  }
}
