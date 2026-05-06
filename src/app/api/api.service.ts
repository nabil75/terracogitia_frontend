import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';

/** Ligne renvoyée par GET /disciplines/all_disciplines (nouveau niveau au-dessus du thème). */
export interface DisciplineDto {
  id_discipline: number;
  label: string;
  description?: string;
}

/**
 * Corps attendu par `POST /disciplines/create_discipline`.
 * `description` est optionnelle côté UI (sera omise du JSON si vide).
 */
export interface DisciplineUpsertPayload {
  label: string;
  description?: string;
}

export interface DisciplineAiAssistPayload {
  label: string;
  description?: string;
}

export interface DisciplineAiAssistResult {
  label?: string;
  description?: string;
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
}

export interface ThemeUpsertPayload {
  label: string;
  tagline?: string;
  description?: string;
}

export interface SubThemeUpsertPayload {
  label: string;
  description?: string;
}

/**
 * Génération IA des **parcours et questions** à partir d’un thème déjà présent pour la discipline.
 * À aligner avec la route backend (prompt / persistance).
 */
export interface GenerateParcoursQuestionsFromThemePayload {
  id_theme: string | number;
  label: string;
  /** Omise ou vide si le thème n’a pas de description. */
  description?: string;
}

@Injectable({
  providedIn: 'root'
})

export class ApiService {

  constructor(private http: HttpClient) {}

  baseurl = "http://localhost:8002";
  httpHeaders_json = new HttpHeaders({'Content-Type':'application/json'});
  httpHeaders_text = new HttpHeaders({'Content-Type':'text/plain'});

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
    return this.http.get(`${this.baseurl}/themes/all_themes`, {
      headers: this.httpHeaders_json,
      params: this.themesParams(idDiscipline)
    });
  }

  /** Liste typée (même endpoint que getAllThemes). */
  getAllThemesAdmin(idDiscipline?: number | null) {
    return this.http.get<ThemeAdminDto[]>(
      `${this.baseurl}/themes/all_themes`,
      {
        headers: this.httpHeaders_json,
        params: this.themesParams(idDiscipline)
      }
    );
  }

  /** Liste des disciplines (niveau au-dessus du thème). */
  getAllDisciplines() {
    return this.http.get<DisciplineDto[]>(
      `${this.baseurl}/disciplines/all_disciplines`,
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * Crée une discipline (insert dans la table `discipline`).
   * Backend : `POST /disciplines/create_discipline` (à implémenter dans `discipline.py`).
   * Réponse attendue : la nouvelle ligne `DisciplineDto` (avec son `id_discipline` généré).
   */
  createDiscipline(payload: DisciplineUpsertPayload) {
    return this.http.post<DisciplineDto>(
      `${this.baseurl}/disciplines/create_discipline`,
      payload,
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

  /**
   * Aide IA pour proposer un libellé / description de discipline.
   * Si la route n'est pas disponible, l'UI affiche un message d'erreur explicite.
   */
  assistDisciplineDraft(payload: DisciplineAiAssistPayload) {
    return this.http.post<DisciplineAiAssistResult>(
      `${this.baseurl}/disciplines/assist-draft`,
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * CRUD thèmes / sous-thèmes — conventions REST à implémenter côté API.
   * Chemins attendus : POST/PUT/DELETE /themes, /themes/:id, POST /themes/:id/subthemes, PUT/DELETE /subthemes/:id
   */
  createTheme(payload: ThemeUpsertPayload) {
    return this.http.post<ThemeAdminDto>(
      `${this.baseurl}/themes/create_theme`,
      payload,
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
      payload,
      { headers: this.httpHeaders_json }
    );
  }

  getQuestionsBySubTheme(idSubTheme: string){
    return this.http.get(this.baseurl+"/themes/getQuestionsBySubTheme/"+idSubTheme, {headers: this.httpHeaders_json});
  }

  evaluateResponse(subtheme: string, question: string, response: string){
    return this.http.post(
      this.baseurl+"/evaluations/evaluate_response",
      { subtheme, question, response },
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

  /** Création d'un compte (utile pour alimenter la base en phase dev). */
  register(email: string, password: string) {
    return this.http.post<AuthResponse>(
      this.baseurl + '/auth/register',
      { email, password },
      { headers: this.httpHeaders_json }
    );
  }

  /**
   * Proposition de réponse générée / résolue côté serveur.
   * Les libellés sont passés en segments de chemin : ils doivent être encodés
   * (sinon « / », espaces, accents, etc. cassent la route → souvent 404).
   */
  getPropositionForQuestion(question: string, subtheme: string) {
    const q = encodeURIComponent(question ?? '');
    const s = encodeURIComponent(subtheme ?? '');
    return this.http.get<unknown>(
      `${this.baseurl}/discovering/get_proposition_for_question/${q}/${s}`,
      { headers: this.httpHeaders_json }
    );
  }
}