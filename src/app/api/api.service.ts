import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { AppLang, LanguageService } from '../shared/services/language.service';
import {
  humanizeAdvancedEvaluationOverview,
  humanizeDisciplineDetail,
  humanizeKnowledgeOverview,
  humanizeThemesPayload
} from '../shared/utils/label-display.util';

export type DisciplineNiveauEstime = 'debutant' | 'intermediaire' | 'avance';

/** Ligne renvoyée par GET /disciplines/all_disciplines (nouveau niveau au-dessus du thème). */
export interface DisciplineDto {
  id_discipline: number;
  label: string;
  description?: string;
  niveau_estime?: DisciplineNiveauEstime | null;
  projection?: string | null;
}

/** GET /disciplines/knowledge_overview — arborescence pour la page Résumé. */
export interface KnowledgeOverviewPropositionDto {
  id_proposition: number;
  date_creation?: string | null;
}

export interface KnowledgeOverviewEvaluationDto {
  id_evaluation: number;
  date_creation?: string | null;
}

export interface KnowledgeOverviewQuestionDto {
  id_question: number;
  label: string;
  propositions: KnowledgeOverviewPropositionDto[];
  evaluations: KnowledgeOverviewEvaluationDto[];
}

export interface KnowledgeOverviewSubThemeDto {
  id_subtheme: number;
  label: string;
  questions: KnowledgeOverviewQuestionDto[];
}

export interface KnowledgeOverviewThemeDto {
  id_theme: number;
  label: string;
  subthemes: KnowledgeOverviewSubThemeDto[];
}

export interface KnowledgeOverviewDisciplineDto {
  id_discipline: number;
  label: string;
  themes: KnowledgeOverviewThemeDto[];
}

export interface DisciplineThemeSummaryDto {
  id_theme: number;
  label: string;
  tagline?: string | null;
  description?: string | null;
  role_cognitif?: string | null;
  niveau_pyramide?: string | null;
  transformation_cognitive?: string | null;
}

export interface DisciplineLinkedLabelDto {
  id: number;
  label: string;
}

/** GET /disciplines/:id/detail — fiche complète pour la page Discipline. */
export interface DisciplineDetailDto extends DisciplineDto {
  themes: DisciplineThemeSummaryDto[];
  competences: DisciplineLinkedLabelDto[];
  prerequis: DisciplineLinkedLabelDto[];
}

/**
 * Corps attendu par `POST /disciplines/create_discipline`.
 * `description` est optionnelle côté UI (sera omise du JSON si vide).
 */
export interface DisciplineUpsertPayload {
  label: string;
  description?: string;
  competences?: string[];
  prerequis?: string[];
  niveau_estime?: DisciplineNiveauEstime | null;
  projection?: string;
  lang?: AppLang;
}

/** Souhait utilisateur pour proposer intitulé + description (création discipline). */
export interface DisciplineProposeFromWishPayload {
  wish: string;
  lang?: AppLang;
}

export interface DisciplineProposeFromWishResult {
  label: string;
  description: string;
  competences?: string[];
  prerequis?: string[];
  niveau_estime?: DisciplineNiveauEstime | null;
  projection?: string | null;
}

/** Ligne renvoyée par GET /evaluations/by_question/:id (aligné sur le backend). */
export interface EvaluationRecord {
  id: number;
  id_theme: number;
  id_subtheme: number;
  id_question: number;
  reponse: string;
  pertinence: string;
  pertinence_note: number | null;
  precision: string;
  precision_note: number | null;
  clarte: string;
  clarte_note: number | null;
  /** Tableau ou chaîne (JSON ou lignes) selon la source. */
  synthese_points_forts: string[] | string | null;
  synthese_points_faibles: string[] | string | null;
  synthese_conseils_pedagogiques: string[] | string | null;
  note: number | null;
  /** Renseigné par le serveur / la base à la lecture (pas envoyé à l’enregistrement). */
  date_creation?: string;
}

/** Agrégat par parcours renvoyé par GET /evaluations/stats_by_subtheme. */
export interface SubThemeStats {
  id_theme: number;
  id_subtheme: number;
  evaluation_count: number;
  avg_note: number | null;
  avg_pertinence: number | null;
  avg_precision: number | null;
  avg_clarte: number | null;
  min_note: number | null;
  max_note: number | null;
}

/** GET /advanced-evaluation/overview — croisement pyramide + effort découverte. */
export interface AdvancedEvaluationPyramidLevel {
  niveau_pyramide: string;
  evaluation_count: number;
  avg_note: number | null;
  avg_pertinence: number | null;
  avg_precision: number | null;
  avg_clarte: number | null;
}

export interface AdvancedEvaluationSubthemeSession {
  id_session: number;
  id_theme?: number | null;
  id_subtheme?: number | null;
  theme_label?: string | null;
  subtheme_label?: string | null;
  entered_at?: string | null;
  exited_at?: string | null;
  duration_seconds?: number | null;
  source?: string | null;
}

export interface AdvancedEvaluationDiscoverEffort {
  subtheme_sessions: AdvancedEvaluationSubthemeSession[];
  subthemes_explored_count: number;
  total_duration_seconds: number;
  propositions_requested: number;
  propositions_saved: number;
  propositions_discarded: number;
  exercises_in_propositions: number;
}

export interface AdvancedEvaluationCognitiveOperation {
  operation: string;
  family: string;
  propositions_requested: number;
  propositions_saved: number;
  propositions_discarded: number;
  exercises_in_propositions: number;
  first_activity_at?: string | null;
  available_in_discipline: boolean;
}

export interface AdvancedEvaluationDiscoverySequenceStep {
  rank: number;
  operation: string;
  family: string;
  first_at?: string | null;
}

export interface AdvancedEvaluationPyramidOperationMatrix {
  niveau_pyramide: string;
  discover_requested_by_operation: Record<string, number>;
  available_operations: string[];
}

export interface AdvancedEvaluationCognitiveProfileSummary {
  dominant_family?: string | null;
  observation_before_comprehension?: boolean | null;
  comprehension_explored: boolean;
  observation_explored: boolean;
  operations_available_count: number;
  operations_explored_count: number;
}

export interface AdvancedEvaluationCognitiveDiscovery {
  operations: AdvancedEvaluationCognitiveOperation[];
  discovery_sequence: AdvancedEvaluationDiscoverySequenceStep[];
  unexplored_operations: string[];
  pyramid_operation_matrix: AdvancedEvaluationPyramidOperationMatrix[];
  profile_summary: AdvancedEvaluationCognitiveProfileSummary;
}

export interface AdvancedEvaluationOverview {
  pyramid: AdvancedEvaluationPyramidLevel[];
  acquis: string[];
  points_a_travailler: string[];
  conseils_pedagogiques: string[];
  discover_effort: AdvancedEvaluationDiscoverEffort;
  cognitive_discovery?: AdvancedEvaluationCognitiveDiscovery;
  evaluation_total: number;
}

export interface AdvancedEvaluationInsights {
  transformations_mentales?: string;
  acquis?: string[];
  points_a_travailler?: string[];
  effort_decouverte?: string;
  conduite_decouverte?: string;
  recommandations?: string[];
  commentaire_global?: string;
}

export interface SubthemeSessionStartPayload {
  id_theme?: number | null;
  id_subtheme: number;
  source?: string;
}

export interface DiscoverActivityPayload {
  id_theme?: number | null;
  id_subtheme?: number | null;
  id_question?: number | null;
  event_type:
    | 'proposition_requested'
    | 'proposition_saved'
    | 'proposition_discarded'
    | 'exercise_in_proposition';
  id_proposition?: number | null;
  meta?: Record<string, unknown> | null;
}

/** Réponse standard d'un appel d'authentification réussi. */
export interface AuthResponse {
  ok: boolean;
  id?: number;
  email: string;
}

/** Codes d'erreur renvoyés par le backend (champ `detail.code`). */
export type AuthErrorCode =
  | 'email_not_found'
  | 'invalid_password'
  | 'email_already_exists';

export interface AuthErrorDetail {
  code: AuthErrorCode;
  message: string;
}

export interface StoreEvaluationPayload {
  id_theme: number;
  id_subtheme: number;
  id_question: number;
  reponse: string;
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
}

/** Ligne renvoyée par GET /discovering/get_saved_propositions_by_question/:id_question. */
export interface SavedDiscoverPropositionRecord {
  id_proposition: number;
  id_question: number;
  proposition: unknown;
  statut_current?: boolean;
  notes?: string;
  date_creation?: string;
}

export interface StoreSavedDiscoverPropositionPayload {
  id_theme: number;
  id_subtheme: number;
  id_question: number;
  proposition_payload: unknown;
  notes?: string;
}

/** Prérequis pour une question (réponse `ordre_logique_questions`). */
export interface OrdreLogiquePreRequisItem {
  /** Identifiant question prérequis si fourni par l’API enrichie. */
  id?: string | number;
  label: string;
  justification: string;
}

/** Valeur sous chaque clé « Qn - … ». */
export interface OrdreLogiqueQuestionDepsEntry {
  'pre-requis'?: OrdreLogiquePreRequisItem[];
  pre_requis?: OrdreLogiquePreRequisItem[];
  prerequis?: OrdreLogiquePreRequisItem[];
}

/**
 * Graphe de dépendances : pour chaque question (clé = libellé type « Q1 - … »),
 * liste des questions à traiter avant.
 */
export type OrdreLogiqueQuestionsResponse = Record<string, OrdreLogiqueQuestionDepsEntry>;

export interface OrdreLogiqueQuestionInputDto {
  id: string | number;
  /** Libellé envoyé au modèle, ex. « Q1 - Texte de la question ». */
  label: string;
}

export interface OrdreLogiqueQuestionsPayload {
  id_subtheme: string;
  questions: OrdreLogiqueQuestionInputDto[];
  lang?: AppLang;
}

/**
 * Ligne de `liens_plats` : prérequis → question dépendante + justification.
 * D’autres clés synonymes peuvent exister ; le composant Discover normalise au chargement.
 */
export interface OrdreLogiqueLienPlatRow {
  justification?: string;
  libelle_prerequis?: string;
  libelle_question?: string;
  libelle_question_cible?: string;
  question_cible?: string;
  [key: string]: unknown;
}

/**
 * Entrée de `liste_par_parcours` : question courante + liste structurée des prérequis.
 */
export interface OrdreLogiqueListeParcoursItem {
  libelle_question?: string;
  label_question?: string;
  label?: string;
  libelle?: string;
  id_question?: string | number;
  question_id?: string | number;
  id?: string | number;
  prerequis?: OrdreLogiquePreRequisItem[];
  'pre-requis'?: OrdreLogiquePreRequisItem[];
  pre_requis?: OrdreLogiquePreRequisItem[];
  [key: string]: unknown;
}

/**
 * Réponse enrichie `POST /discovering/ordre_logique_questions?legacy=false`
 * (voir backend `build_ordre_logique_vues_lecture`).
 */
/** Étape de la séquence d’apprentissage (timeline persistée ou calculée). */
export interface LearningTimelineStepDto {
  step: number;
  id: string | number;
  label: string;
}

export interface OrdreLogiqueQuestionsResponseEnriched {
  /** Copie brute du JSON LLM (clés « Qn - … »), utile debug / graphe. */
  relations_par_libelle?: OrdreLogiqueQuestionsResponse;
  /** Une entrée par question dans l’ordre du parcours. */
  liste_par_parcours?: OrdreLogiqueListeParcoursItem[];
  /** Une ligne par lien prérequis → question cible. */
  liens_plats?: OrdreLogiqueLienPlatRow[];
  /** Rappel UI renvoyé par l’API. */
  conseil_ui?: string;
  id_subtheme?: string | number;
  /** True si la réponse provient de `subtheme.timeline` (pas d’appel Mistral). */
  from_cache?: boolean;
  /** Ordre linéaire des questions pour la timeline. */
  sequence?: LearningTimelineStepDto[];
  /** Séquence partielle (cycle / ambiguïté dans les prérequis). */
  partial?: boolean;
}

/** Aligné sur GET /themes/all_themes — identifiants souvent string ou number selon le backend. */
export interface ThemeAdminDto {
  id: string | number;
  label: string;
  tagline?: string;
  description?: string;
  subThemes?: SubThemeAdminDto[];
}

export interface SubThemeAdminDto {
  id: string | number;
  label: string;
  description?: string;
  /** Famille de la grille pyramide (ex. « Entités », « Causalité »), renseignée par la génération IA. */
  famille?: string | null;
}

export interface ThemeUpsertPayload {
  label: string;
  tagline?: string;
  description?: string;
}

/** Corps `POST /themes/create_theme` — le backend exige `id_discipline`. */
export interface ThemeCreatePayload extends ThemeUpsertPayload {
  id_discipline: number;
  subThemes?: SubThemeUpsertPayload[];
}

export interface SubThemeUpsertPayload {
  label: string;
  description?: string;
}

/**
 * Génération IA des **parcours et questions** à partir d’un thème déjà présent pour la discipline.
 * À aligner avec la route backend (prompt / persistance).
 */
/** Parcours (domaine) déjà généré — transmis à Mistral pour éviter les doublons. */
export interface ExistingDomainePayload {
  label: string;
  description?: string;
  niveau_pyramide?: string;
  role_cognitif?: string;
}

export interface GenerateParcoursQuestionsFromThemePayload {
  id_theme: string | number;
  label: string;
  /** Omise ou vide si le thème n’a pas de description. */
  description?: string;
  /** Parcours déjà présents sur le thème (complément au chargement côté API). */
  existing_domaines?: ExistingDomainePayload[];
  lang?: AppLang;
}

/** Réponse `GET/PUT/DELETE /questions/:id/dessin`. */
export interface QuestionDessinResponse {
  id_question: number;
  dessin?: Record<string, unknown> | null;
  has_dessin: boolean;
}

/**
 * Corps `POST /themes/regroupement_questions_parcours`.
 * Le backend charge les questions du parcours, appelle Mistral, puis met à jour chaque ligne `question` :
 * pour chaque entrée de `familles[]`, chaque `id` dans `id_questions` doit recevoir `groupe` = index de la famille (1…n, n ≤ 6)
 * et `libelle_groupe` = exactement la chaîne `libelle` de cette même entrée (pas un libellé dérivé d’un autre champ JSON ni l’index seul).
 * Le nombre de familles est déterminé côté API (homogénéité, plafond 6).
 */
export interface RegroupementQuestionsParcoursPayload {
  id_subtheme: string;
  lang?: AppLang;
}

/** Une famille dans la réponse JSON du modèle (persistée en base par le backend). */
export interface RegroupementQuestionFamilleDto {
  libelle: string;
  id_questions: (string | number)[];
}

export interface RegroupementQuestionsParcoursResponse {
  familles: RegroupementQuestionFamilleDto[];
  message?: string;
}

@Injectable({
  providedIn: 'root'
})

export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);

  baseurl = "http://localhost:8002";
  httpHeaders_json = new HttpHeaders({'Content-Type':'application/json'});

  /** Langue UI courante — transmise aux endpoints de génération IA. */
  private currentLang(): AppLang {
    return this.language.getCurrentLang();
  }

  private withLangBody<T extends object>(body: T): T & { lang: AppLang } {
    return { ...body, lang: this.currentLang() };
  }

  private withLangParams(params?: HttpParams): HttpParams {
    let p = params ?? new HttpParams();
    return p.set('lang', this.currentLang());
  }

  /**
   * Construit `?id_discipline=<id>` quand un id de discipline est fourni.
   * Lorsqu'aucun id n'est fourni (ou `null`), l'API renvoie tous les thèmes (compat. arrière).
   */
  private themesParams(idDiscipline?: number | null): HttpParams {
    let params = new HttpParams();
    if (idDiscipline != null) {
      params = params.set('id_discipline', String(idDiscipline));
    }
    return params;
  }

  getAllThemes(idDiscipline?: number | null) {
    return this.http
      .get(`${this.baseurl}/themes/all_themes`, {
        headers: this.httpHeaders_json,
        params: this.themesParams(idDiscipline)
      })
      .pipe(map((raw) => humanizeThemesPayload(raw)));
  }

  /** Liste typée (même endpoint que getAllThemes). */
  getAllThemesAdmin(idDiscipline?: number | null) {
    return this.http
      .get<ThemeAdminDto[]>(`${this.baseurl}/themes/all_themes`, {
        headers: this.httpHeaders_json,
        params: this.themesParams(idDiscipline)
      })
      .pipe(map((raw) => humanizeThemesPayload(raw) as ThemeAdminDto[]));
  }

  /** Liste des disciplines (niveau au-dessus du thème). */
  getAllDisciplines() {
    return this.http.get<DisciplineDto[]>(
      `${this.baseurl}/disciplines/all_disciplines`,
      { headers: this.httpHeaders_json }
    );
  }

  /** Arborescence complète des savoirs (page Résumé). */
  getKnowledgeOverview() {
    return this.http
      .get<KnowledgeOverviewDisciplineDto[]>(
        `${this.baseurl}/disciplines/knowledge_overview`,
        { headers: this.httpHeaders_json }
      )
      .pipe(map((data) => humanizeKnowledgeOverview(data)));
  }

  /**
   * Crée une discipline (insert dans la table `discipline`).
   * Backend : `POST /disciplines/create_discipline` (à implémenter dans `discipline.py`).
   * Réponse attendue : la nouvelle ligne `DisciplineDto` (avec son `id_discipline` généré).
   */
  createDiscipline(payload: DisciplineUpsertPayload) {
    return this.http.post<DisciplineDto>(
      `${this.baseurl}/disciplines/create_discipline`,
      this.withLangBody(payload),
      { headers: this.httpHeaders_json }
    );
  }

  /** Mise à jour d'une discipline existante (route REST attendue côté backend). */
  updateDiscipline(disciplineId: number, payload: DisciplineUpsertPayload) {
    return this.http.put<DisciplineDto>(
      `${this.baseurl}/disciplines/${disciplineId}`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  /** Suppression d'une discipline (route REST attendue côté backend). */
  deleteDiscipline(disciplineId: number) {
    return this.http.delete<void>(`${this.baseurl}/disciplines/${disciplineId}`, {
      headers: this.httpHeaders_json
    });
  }

  /** Fiche discipline (thèmes, compétences, prérequis). */
  getDisciplineDetail(disciplineId: number) {
    return this.http
      .get<DisciplineDetailDto>(
        `${this.baseurl}/disciplines/${disciplineId}/detail`,
        { headers: this.httpHeaders_json }
      )
      .pipe(map((detail) => humanizeDisciplineDetail(detail)));
  }

  /**
   * Propose intitulé + description à partir du souhait utilisateur (Mistral).
   * Backend : `POST /disciplines/propose_from_wish`.
   */
  proposeDisciplineFromWish(payload: DisciplineProposeFromWishPayload) {
    return this.http.post<DisciplineProposeFromWishResult>(
      `${this.baseurl}/disciplines/propose_from_wish`,
      this.withLangBody(payload),
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * CRUD thèmes / sous-thèmes — conventions REST à implémenter côté API.
   * Chemins attendus : POST/PUT/DELETE /themes, /themes/:id, POST /themes/:id/subthemes, PUT/DELETE /subthemes/:id
   */
  createTheme(payload: ThemeCreatePayload) {
    const body = {
      label: payload.label,
      tagline: payload.tagline ?? '',
      description: payload.description ?? '',
      id_discipline: payload.id_discipline,
      subThemes: payload.subThemes ?? []
    };
    return this.http.post<ThemeAdminDto>(
      `${this.baseurl}/themes/create_theme`,
      body,
      { headers: this.httpHeaders_json }
    );
  }

  updateTheme(themeId: string | number, payload: ThemeUpsertPayload) {
    return this.http.put<ThemeAdminDto>(
      `${this.baseurl}/themes/${themeId}`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  deleteTheme(themeId: string | number) {
    return this.http.delete<void>(`${this.baseurl}/themes/${themeId}`, {
      headers: this.httpHeaders_json
    });
  }

  createSubTheme(themeId: string | number, payload: SubThemeUpsertPayload) {
    return this.http.post<SubThemeAdminDto>(
      `${this.baseurl}/themes/${themeId}/subthemes`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  updateSubTheme(subThemeId: string | number, payload: SubThemeUpsertPayload) {
    return this.http.put<SubThemeAdminDto>(
      `${this.baseurl}/subthemes/${subThemeId}`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  deleteSubTheme(subThemeId: string | number) {
    return this.http.delete<void>(`${this.baseurl}/themes/subthemes/${subThemeId}`, {
      headers: this.httpHeaders_json
    });
  }

  /**
   * Génération assistée des **parcours et questions** pour un thème existant.
   * `POST /themes/generate-parcours-and-questions` — le corps inclut `themeId` (alias) côté API FastAPI.
   */
  generateParcoursAndQuestionsFromTheme(payload: GenerateParcoursQuestionsFromThemePayload) {
    return this.http.post<unknown>(
      `${this.baseurl}/themes/generate-parcours-and-questions`,
      this.withLangBody(payload),
      { headers: this.httpHeaders_json }
    );
  }

  getQuestionsBySubTheme(idSubTheme: string){
    return this.http.get(this.baseurl+"/themes/getQuestionsBySubTheme/"+idSubTheme, {headers: this.httpHeaders_json});
  }

  getQuestionDessin(idQuestion: string | number) {
    return this.http.get<QuestionDessinResponse>(
      `${this.baseurl}/questions/${idQuestion}/dessin`,
      { headers: this.httpHeaders_json }
    );
  }

  saveQuestionDessin(idQuestion: string | number, dessin: Record<string, unknown>) {
    return this.http.put<QuestionDessinResponse>(
      `${this.baseurl}/questions/${idQuestion}/dessin`,
      { dessin },
      { headers: this.httpHeaders_json }
    );
  }

  deleteQuestionDessin(idQuestion: string | number) {
    return this.http.delete<QuestionDessinResponse>(
      `${this.baseurl}/questions/${idQuestion}/dessin`,
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * Regroupe les questions d’un parcours (`id_subtheme`) en `nombre_familles` familles homogènes via Mistral,
   * puis enregistre l’indice de famille dans la colonne `groupe` de chaque question.
   * Route backend attendue : `POST /themes/regroupement_questions_parcours`.
   */
  regroupementQuestionsParcours(payload: RegroupementQuestionsParcoursPayload) {
    return this.http.post<RegroupementQuestionsParcoursResponse>(
      `${this.baseurl}/themes/regroupement_questions_parcours`,
      this.withLangBody(payload),
      { headers: this.httpHeaders_json }
    );
  }

  evaluateResponse(subtheme: string, question: string, response: string){
    return this.http.post(
      this.baseurl+"/evaluations/evaluate_response",
      this.withLangBody({ subtheme, question, response }),
      {headers: this.httpHeaders_json, responseType: 'text'}
    );
  }

  storeEvaluation(payload: StoreEvaluationPayload) {
    return this.http.post(
      this.baseurl + '/evaluations/store_evaluation',
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  getEvaluationsByQuestion(idQuestion: number) {
    return this.http.get<EvaluationRecord[]>(
      `${this.baseurl}/evaluations/get_evaluations_by_question/${idQuestion}`,
      { headers: this.httpHeaders_json }
    );
  }

  /** Toutes les évaluations pour le tableau de bord (le tri affiché utilise `date_creation` côté UI). */
  getAllEvaluations() {
    return this.http.get<EvaluationRecord[]>(
      `${this.baseurl}/evaluations/all`,
      { headers: this.httpHeaders_json }
    );
  }

  /** Agrégats par parcours pour le tableau de bord. */
  getStatsBySubTheme() {
    return this.http.get<SubThemeStats[]>(
      `${this.baseurl}/evaluations/stats_by_subtheme`,
      { headers: this.httpHeaders_json }
    );
  }

  /** Vue d'ensemble évaluation avancée (pyramide + effort découverte). */
  getAdvancedEvaluationOverview(idDiscipline?: number | null) {
    let params = new HttpParams();
    if (idDiscipline != null) {
      params = params.set('id_discipline', String(idDiscipline));
    }
    return this.http
      .get<AdvancedEvaluationOverview>(
        `${this.baseurl}/advanced-evaluation/overview`,
        { headers: this.httpHeaders_json, params }
      )
      .pipe(map((overview) => humanizeAdvancedEvaluationOverview(overview)));
  }

  /** Synthèse IA à partir de l'overview évaluation avancée. */
  postAdvancedEvaluationInsights(idDiscipline?: number | null) {
    return this.http
      .post<{ overview: AdvancedEvaluationOverview; insights: AdvancedEvaluationInsights }>(
        `${this.baseurl}/advanced-evaluation/insights`,
        this.withLangBody({ id_discipline: idDiscipline ?? null }),
        { headers: this.httpHeaders_json }
      )
      .pipe(
        map((res) => ({
          ...res,
          overview: humanizeAdvancedEvaluationOverview(res.overview)
        }))
      );
  }

  startSubthemeSession(payload: SubthemeSessionStartPayload) {
    return this.http.post<{ id_session: number }>(
      `${this.baseurl}/advanced-evaluation/subtheme-session/start`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  endSubthemeSession(idSession: number) {
    return this.http.post(
      `${this.baseurl}/advanced-evaluation/subtheme-session/end`,
      { id_session: idSession },
      { headers: this.httpHeaders_json }
    );
  }

  logDiscoverActivity(payload: DiscoverActivityPayload) {
    return this.http.post(
      `${this.baseurl}/advanced-evaluation/discover-activity`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  /** Détail d'une évaluation par id (clé primaire en base). */
  getEvaluationById(idEvaluation: number) {
    return this.http.get<EvaluationRecord>(
      `${this.baseurl}/evaluations/${idEvaluation}`,
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * Vérifie un couple email / mot de passe auprès du backend.
   * En cas d'erreur, `HttpErrorResponse.error.detail` contient un `AuthErrorDetail`
   * ({code: 'email_not_found' | 'invalid_password', message: string}).
   */
  login(email: string, password: string) {
    return this.http.post<AuthResponse>(
      this.baseurl + '/auth/login',
      { email, password },
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * Réinitialise le mot de passe d'un compte existant.
   * Renvoie une erreur `email_not_found` si l'email n'existe pas en base.
   */
  resetPassword(email: string, newPassword: string) {
    return this.http.post<AuthResponse>(
      this.baseurl + '/auth/reset_password',
      { email, new_password: newPassword },
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * Proposition de réponse générée / résolue côté serveur.
   * Les libellés sont passés en segments de chemin : ils doivent être encodés
   * (sinon « / », espaces, accents, etc. cassent la route → souvent 404).
   */
  getPropositionForQuestion(question: string, subthemeLabel: string) {
    const q = encodeURIComponent(question ?? '');
    const s = encodeURIComponent(subthemeLabel ?? '');
    return this.http.get<unknown>(
      `${this.baseurl}/discovering/get_proposition_for_question/${q}/${s}`,
      { headers: this.httpHeaders_json, params: this.withLangParams() }
    );
  }

  storeSavedDiscoverProposition(payload: StoreSavedDiscoverPropositionPayload) {
    return this.http.post<SavedDiscoverPropositionRecord>(
      `${this.baseurl}/discovering/store_saved_proposition`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  getSavedDiscoverPropositionsByQuestion(idQuestion: number) {
    return this.http.get<SavedDiscoverPropositionRecord[]>(
      `${this.baseurl}/discovering/get_saved_propositions_by_question/${idQuestion}`,
      { headers: this.httpHeaders_json }
    );
  }

  deleteSavedDiscoverProposition(idSavedProposition: number) {
    return this.http.delete<void>(
      `${this.baseurl}/discovering/delete_saved_proposition/${idSavedProposition}`,
      { headers: this.httpHeaders_json }
    );
  }

  setCurrentDiscoverProposition(idProposition: number) {
    return this.http.patch<{ id_proposition: number; id_question: number; statut_current: boolean }>(
      `${this.baseurl}/discovering/set_current_proposition/${idProposition}`,
      {},
      { headers: this.httpHeaders_json }
    );
  }

  /** Notes sur la proposition courante (crée une ligne minimale si besoin). */
  upsertQuestionPropositionNotes(idQuestion: number, notes: string) {
    return this.http.put<{
      id_proposition: number | null;
      id_question: number;
      notes: string;
    }>(`${this.baseurl}/discovering/question_proposition_notes/${idQuestion}`, { notes }, {
      headers: this.httpHeaders_json
    });
  }

  /** Timeline persistée en base pour un parcours (`subtheme.timeline`). */
  getSubthemeTimeline(subthemeId: string | number) {
    return this.http.get<OrdreLogiqueQuestionsResponseEnriched>(
      `${this.baseurl}/discovering/subtheme_timeline/${subthemeId}`,
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * Ordre logique d’apprentissage (Mistral). Par défaut le front consomme le format enrichi (`legacy=false`).
   * Le backend renvoie la timeline en base si elle est à jour ; sinon appelle Mistral et persiste.
   */
  ordreLogiqueQuestions(
    payload: OrdreLogiqueQuestionsPayload,
    options?: { legacy?: boolean; forceRefresh?: boolean }
  ) {
    const legacy = options?.legacy === true;
    let params = new HttpParams().set('legacy', legacy ? 'true' : 'false');
    if (options?.forceRefresh) {
      params = params.set('force_refresh', 'true');
    }
    return this.http.post<OrdreLogiqueQuestionsResponseEnriched>(
      `${this.baseurl}/discovering/ordre_logique_questions`,
      this.withLangBody(payload),
      { headers: this.httpHeaders_json, params }
    );
  }
}