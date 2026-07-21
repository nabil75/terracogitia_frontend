import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { AppLang, LanguageService } from '../shared/services/language.service';
import {
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

export interface KnowledgeOverviewQuestionDto {
  id_question: number;
  label: string;
  propositions: KnowledgeOverviewPropositionDto[];
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

/** Réponse `GET/PUT/DELETE /questions/:id_objet/dessin`. */
export interface ObjectDessinResponse {
  id_objet: number;
  dessin?: Record<string, unknown> | null;
  has_dessin: boolean;
}

/** Réponse `POST /themes/get_transcribe_audio`. */
export interface AudioTranscriptionResponse {
  id: string;
  text: string;
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

/** Réponse standard d'un appel d'authentification réussi. */
export interface AuthResponse {
  ok: boolean;
  id?: number;
  email: string;
}

/** GET /auth/session — utilisateur courant si une session (cookie) est active. */
export interface SessionUser {
  id: number;
  email: string;
  auth_provider: string;
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
   * Crée un compte utilisateur (email + mot de passe ≥ 6 caractères).
   * Renvoie une erreur `email_already_exists` si l'email est déjà utilisé.
   */
  register(email: string, password: string) {
    return this.http.post<AuthResponse>(
      this.baseurl + '/auth/register',
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
   * URL backend d'entrée du flux OAuth Microsoft. Utilisée en redirection
   * pleine page (le flux OAuth ne peut pas passer par un XHR).
   */
  microsoftLoginUrl(): string {
    return this.baseurl + '/auth/microsoft/login';
  }

  /**
   * Lit la session applicative établie après une connexion Microsoft.
   * `withCredentials` est requis pour transmettre le cookie de session httpOnly.
   */
  getSession() {
    return this.http.get<SessionUser>(this.baseurl + '/auth/session', {
      withCredentials: true
    });
  }

  /** Invalide la session applicative (efface le cookie httpOnly). */
  logout() {
    return this.http.post<{ ok: boolean }>(
      this.baseurl + '/auth/logout',
      {},
      { withCredentials: true }
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

  getObjectDessin(idObjet: string | number) {
    return this.http.get<ObjectDessinResponse>(
      `${this.baseurl}/questions/${idObjet}/dessin`,
      { headers: this.httpHeaders_json }
    );
  }

  saveObjectDessin(idObjet: string | number, dessin: Record<string, unknown>) {
    return this.http.put<ObjectDessinResponse>(
      `${this.baseurl}/questions/${idObjet}/dessin`,
      { dessin },
      { headers: this.httpHeaders_json }
    );
  }

  deleteObjectDessin(idObjet: string | number) {
    return this.http.delete<ObjectDessinResponse>(
      `${this.baseurl}/questions/${idObjet}/dessin`,
      { headers: this.httpHeaders_json }
    );
  }

  transcribeAudio(audioBlob: Blob, filename = 'reponse.webm') {
    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    return this.http.post<AudioTranscriptionResponse>(
      `${this.baseurl}/themes/get_transcribe_audio`,
      formData
    );
  }

  getAudioFile(idAudio: string) {
    return this.http.get(`${this.baseurl}/themes/get_audio_file/${idAudio}`, {
      responseType: 'blob',
    });
  }

  // --- Défis cognitifs (challenge-evaluation) ---

  getCognitiveOperationsCatalog() {
    return this.http.get<CognitiveOperationCatalogItem[]>(
      `${this.baseurl}/challenges/catalog/cognitive-operations`,
      { headers: this.httpHeaders_json }
    );
  }

  getGameMechanicsCatalog() {
    return this.http.get<GameMechanicCatalogItem[]>(
      `${this.baseurl}/challenges/catalog/game-mechanics`,
      { headers: this.httpHeaders_json }
    );
  }

  getChallengeCompatibilityMatrix() {
    return this.http.get<ChallengeCompatibilityEntry[]>(
      `${this.baseurl}/challenges/catalog/compatibility-matrix`,
      { headers: this.httpHeaders_json }
    );
  }

  getPyramidChallengeGuidance(level: string) {
    return this.http.get<PyramidChallengeGuidance>(
      `${this.baseurl}/challenges/catalog/pyramid-guidance/${level}`,
      { headers: this.httpHeaders_json }
    );
  }

  generateChallengeExercise(payload: GenerateChallengeExercisePayload) {
    return this.http.post<ChallengeExerciseDto>(
      `${this.baseurl}/challenges/generate`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  getChallengeExercise(idExercise: number) {
    return this.http.get<ChallengeExerciseDto>(
      `${this.baseurl}/challenges/exercises/${idExercise}`,
      { headers: this.httpHeaders_json }
    );
  }

  submitChallengeAttempt(payload: SubmitChallengeAttemptPayload) {
    return this.http.post<ChallengeAttemptResultDto>(
      `${this.baseurl}/challenges/attempts`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  checkSortingLabPlacement(idExercise: number, itemId: string, categoryId: string) {
    return this.http.post<SortingLabPlacementCheckDto>(
      `${this.baseurl}/challenges/exercises/${idExercise}/check-placement`,
      { item_id: itemId, category_id: categoryId },
      { headers: this.httpHeaders_json }
    );
  }

  checkKnowledgeBridgesLink(idExercise: number, sourceId: string, targetId: string) {
    return this.http.post<KnowledgeBridgesLinkCheckDto>(
      `${this.baseurl}/challenges/exercises/${idExercise}/check-link`,
      { source_id: sourceId, target_id: targetId },
      { headers: this.httpHeaders_json }
    );
  }

  checkMissingFragmentPlacement(idExercise: number, gapId: string, fragmentId: string) {
    return this.http.post<MissingFragmentCheckDto>(
      `${this.baseurl}/challenges/exercises/${idExercise}/check-fragment`,
      { gap_id: gapId, fragment_id: fragmentId },
      { headers: this.httpHeaders_json }
    );
  }

  checkTransformAtelierStep(idExercise: number, toolId: string, stepIndex: number) {
    return this.http.post<TransformAtelierCheckDto>(
      `${this.baseurl}/challenges/exercises/${idExercise}/check-transform`,
      { tool_id: toolId, step_index: stepIndex },
      { headers: this.httpHeaders_json }
    );
  }

  getChallengeGamificationProfile(idUser?: number) {
    const params = idUser != null ? new HttpParams().set('id_user', String(idUser)) : undefined;
    return this.http.get<ChallengeGamificationProfile>(
      `${this.baseurl}/challenges/gamification/profile`,
      { headers: this.httpHeaders_json, params }
    );
  }

  getSavedChallengeExercisesByQuestion(idQuestion: number) {
    return this.http.get<SavedChallengeExerciseSummary[]>(
      `${this.baseurl}/challenges/exercises/by-question/${idQuestion}/saved`
    );
  }

  saveChallengeExercise(idExercise: number, title?: string) {
    return this.http.post<SavedChallengeDto>(
      `${this.baseurl}/challenges/exercises/${idExercise}/save`,
      { title, status: 'published' },
      { headers: this.httpHeaders_json }
    );
  }

  deleteSavedChallengeExercise(idExercise: number) {
    return this.http.delete<void>(
      `${this.baseurl}/challenges/exercises/${idExercise}/saved`,
      { headers: this.httpHeaders_json }
    );
  }

  getMemoryReinforcementAvailable(idExercise: number) {
    return this.http.get<{ available: boolean; pair_count: number }>(
      `${this.baseurl}/challenges/exercises/${idExercise}/memory-reinforcement/available`
    );
  }

  createMemoryReinforcementExercise(idExercise: number, lang?: string) {
    let params = new HttpParams();
    if (lang) params = params.set('lang', lang);
    return this.http.post<ChallengeExerciseDto>(
      `${this.baseurl}/challenges/exercises/${idExercise}/memory-reinforcement`,
      {},
      { headers: this.httpHeaders_json, params }
    );
  }

  getInvestigationReinforcementAvailable(idExercise: number) {
    return this.http.get<{ available: boolean; pair_count: number; explanation_question: boolean }>(
      `${this.baseurl}/challenges/exercises/${idExercise}/investigation-reinforcement/available`
    );
  }

  createInvestigationReinforcementExercise(idExercise: number, lang?: string) {
    let params = new HttpParams();
    if (lang) params = params.set('lang', lang);
    return this.http.post<ChallengeExerciseDto>(
      `${this.baseurl}/challenges/exercises/${idExercise}/investigation-reinforcement`,
      {},
      { headers: this.httpHeaders_json, params }
    );
  }

  getEvaluationReservoir(params?: {
    id_user?: number;
    knowledge_object_type?: string;
    knowledge_object_id?: number;
    limit?: number;
  }) {
    let httpParams = new HttpParams();
    if (params?.id_user != null) httpParams = httpParams.set('id_user', String(params.id_user));
    if (params?.knowledge_object_type) {
      httpParams = httpParams.set('knowledge_object_type', params.knowledge_object_type);
    }
    if (params?.knowledge_object_id != null) {
      httpParams = httpParams.set('knowledge_object_id', String(params.knowledge_object_id));
    }
    if (params?.limit != null) httpParams = httpParams.set('limit', String(params.limit));
    return this.http.get<EvaluationReservoirRecord[]>(
      `${this.baseurl}/challenges/evaluation-reservoir`,
      { headers: this.httpHeaders_json, params: httpParams }
    );
  }
}

export interface CognitiveOperationCatalogItem {
  key: string;
  family: string;
  label_fr: string;
  label_en: string;
  definition_fr: string;
  definition_en: string;
  evaluates_fr: string;
  evaluates_en: string;
  pyramid_levels: string[];
  examples: Record<string, string>[];
}

export interface GameMechanicCatalogItem {
  key: string;
  label_fr: string;
  label_en: string;
  description_fr: string;
  description_en: string;
  advantages_fr: string;
  limitations_fr: string;
  compatible_operations: string[];
  compatible_pyramid_levels: string[];
}

export interface ChallengeCompatibilityEntry {
  operation: string;
  mechanic: string;
  score: number;
}

export interface PyramidChallengeGuidance {
  pyramid_level: string;
  operations: string[];
  mechanics: string[];
  challenge_types: string[];
  indicators: string[];
}

export interface GenerateChallengeExercisePayload {
  knowledge_object_type?: 'question' | 'subtheme' | 'concept' | 'theme';
  knowledge_object_id: number;
  pyramid_level: string;
  cognitive_operation: string;
  game_mechanic?: string;
  auto_select_mechanic?: boolean;
  difficulty?: number;
  id_user?: number;
  variant?: string;
  use_ai?: boolean | null;
  lang?: string;
}

export interface ChallengeExerciseDto {
  id_exercise: number;
  id_challenge?: number | null;
  id_user?: number | null;
  knowledge_object_type: string;
  knowledge_object_id: number;
  pyramid_level: string;
  cognitive_operation: string;
  game_mechanic: string;
  difficulty: number;
  content: Record<string, unknown>;
  success_criteria: Record<string, unknown>;
  status: string;
  compatibility_score?: number | null;
  is_first_for_question?: boolean;
}

export interface SavedChallengeExerciseSummary {
  id_exercise: number;
  id_challenge: number;
  title: string;
  game_mechanic: string;
  cognitive_operation: string;
  compatibility_score?: number | null;
  is_first_for_question?: boolean;
  saved_at?: string | null;
}

export interface SavedChallengeDto {
  id_challenge: number;
  title: string;
  pyramid_level: string;
  cognitive_operation: string;
  game_mechanic: string;
  knowledge_object_type: string;
  knowledge_object_id: number;
  difficulty: number;
  status: string;
}

export interface EvaluationReservoirRecord {
  id_record: number;
  id_user?: number | null;
  knowledge_object_type: string;
  knowledge_object_id: number;
  pyramid_level: string;
  cognitive_operation: string;
  game_mechanic: string;
  compatibility_score: number;
  is_first_challenge: boolean;
  score: number;
  passed: boolean;
  xp_gained: number;
  created_at?: string | null;
}

export interface SubmitChallengeAttemptPayload {
  id_exercise: number;
  learner_actions: Record<string, unknown>;
  duration_ms?: number;
  id_user?: number;
}

export interface ChallengeAttemptResultDto {
  id_attempt: number;
  id_evaluation: number;
  score: number;
  passed: boolean;
  mastery_delta: number;
  xp_gained: number;
  feedback: Record<string, string>;
  criteria_results: Record<string, unknown>;
}

export interface SortingLabPlacementCheckDto {
  correct: boolean;
  hint_fr: string;
  hint_en: string;
  feedback_mode: string;
  mode: string;
}

export interface KnowledgeBridgesLinkCheckDto {
  correct: boolean;
  hint_fr: string;
  hint_en: string;
  feedback_mode: string;
}

export interface MissingFragmentCheckDto {
  correct: boolean;
  hint_fr: string;
  hint_en: string;
  feedback_mode: string;
}

export interface TransformAtelierCheckDto {
  correct: boolean;
  preserves_invariant: boolean;
  result_fr: string;
  result_en: string;
  hint_fr: string;
  hint_en: string;
  feedback_mode: string;
  next_step_index: number;
  complete: boolean;
}

export interface ChallengeGamificationProfile {
  xp_total: number;
  level: number;
  streak_days: number;
  achievements?: {
    achievement_key: string;
    unlocked_at: string;
    title_fr: string;
    title_en: string;
  }[];
}