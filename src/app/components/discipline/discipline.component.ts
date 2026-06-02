import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, catchError, finalize, forkJoin, map, of } from 'rxjs';

import {
  ApiService,
  DisciplineDetailDto,
  DisciplineDto,
  DisciplineNiveauEstime,
  DisciplineUpsertPayload,
  ThemeAdminDto
} from '../../api/api.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';
import { DisciplineService } from '../../shared/services/discipline.service';
@Component({
  selector: 'app-discipline',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslateModule,
    TransverseRailComponent
  ],
  templateUrl: './discipline.component.html',
  styleUrl: './discipline.component.scss'
})
export class DisciplineComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  readonly niveauOptions: { value: DisciplineNiveauEstime; labelKey: string }[] = [
    { value: 'debutant', labelKey: 'disciplinePage.levelBeginner' },
    { value: 'intermediaire', labelKey: 'disciplinePage.levelIntermediate' },
    { value: 'avance', labelKey: 'disciplinePage.levelAdvanced' }
  ];

  disciplines: DisciplineDto[] = [];
  loading = true;
  loadError = false;

  selectedKey = 'all';
  detail: DisciplineDetailDto | null = null;
  detailLoading = false;
  detailError = false;

  editLabel = '';
  editDescription = '';
  editNiveau: DisciplineNiveauEstime | null = null;
  editProjection = '';
  savingDetail = false;
  saveErrorKey: string | null = null;

  showAddForm = false;
  newDisciplineWish = '';
  newDisciplineLabel = '';
  newDisciplineDescription = '';
  newCompetencesText = '';
  newPrerequisText = '';
  newNiveau: DisciplineNiveauEstime | null = null;
  newProjection = '';
  addProposalReady = false;
  addProposalValidated = false;
  proposingDiscipline = false;
  addingDiscipline = false;
  addErrorKey: string | null = null;

  deletingDiscipline = false;
  deleteErrorKey: string | null = null;
  deleteErrorParams: { count?: number } = {};
  loadingParcoursCounts = false;
  parcoursCountByDiscipline: Record<number, number> = {};

  private detailSub?: Subscription;

  ngOnInit(): void {
    const current = this.disciplineService.selectedDisciplineId();
    this.selectedKey = current == null ? 'all' : String(current);

    this.api.getAllDisciplines().subscribe({
      next: (data) => {
        this.disciplines = Array.isArray(data) ? data : [];
        this.loading = false;
        this.refreshParcoursCounts();
        if (this.selectedKey !== 'all') {
          this.loadDetail(Number(this.selectedKey));
        }
      },
      error: () => {
        this.disciplines = [];
        this.loadError = true;
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.detailSub?.unsubscribe();
  }

  onSelectedKeyChange(): void {
    this.deleteErrorKey = null;
    this.deleteErrorParams = {};
    this.saveErrorKey = null;
    this.syncActiveDisciplineFromSelection();
    if (this.selectedKey === 'all') {
      this.detailSub?.unsubscribe();
      this.detail = null;
      this.resetEditFields();
      return;
    }
    const id = Number(this.selectedKey);
    if (!Number.isFinite(id)) return;
    this.loadDetail(id);
  }

  /** Applique immédiatement le choix radio à la discipline active (reste de l'app). */
  private syncActiveDisciplineFromSelection(): void {
    if (this.selectedKey === 'all') {
      if (this.disciplineService.selectedDisciplineId() !== null) {
        this.disciplineService.setSelectedDiscipline(null, null);
        this.snackBar.open(
          this.translate.instant('disciplinePage.applyAllSuccess'),
          this.translate.instant('common.close'),
          { duration: 2500 }
        );
      }
      return;
    }
    const id = Number(this.selectedKey);
    if (!Number.isFinite(id)) return;
    const d = this.disciplines.find((x) => x.id_discipline === id);
    if (!d) return;
    if (this.disciplineService.selectedDisciplineId() !== d.id_discipline) {
      this.disciplineService.setSelectedDiscipline(d.id_discipline, d.label);
      this.snackBar.open(
        this.translate.instant('disciplinePage.applySuccess', { label: d.label }),
        this.translate.instant('common.close'),
        { duration: 2500 }
      );
    }
  }

  toggleAddForm(): void {
    this.showAddForm = !this.showAddForm;
    if (!this.showAddForm) {
      this.resetAddForm();
    }
  }

  onAddWishInput(): void {
    this.addProposalValidated = false;
    if (!this.newDisciplineWish.trim()) {
      this.addProposalReady = false;
      this.newDisciplineLabel = '';
      this.newDisciplineDescription = '';
      this.newCompetencesText = '';
      this.newPrerequisText = '';
      this.newNiveau = null;
      this.newProjection = '';
    }
  }

  onAddProposalFieldEdit(): void {
    this.addProposalValidated = false;
  }

  proposeDisciplineFromWish(): void {
    if (this.proposingDiscipline) return;
    const wish = this.newDisciplineWish.trim();
    if (wish.length < 3) {
      this.addErrorKey = 'disciplineDialog.addWishTooShort';
      return;
    }
    this.proposingDiscipline = true;
    this.addErrorKey = null;
    this.addProposalValidated = false;
    this.api
      .proposeDisciplineFromWish({ wish })
      .pipe(finalize(() => (this.proposingDiscipline = false)))
      .subscribe({
        next: (res) => {
          this.newDisciplineLabel = (res.label ?? '').trim();
          this.newDisciplineDescription = (res.description ?? '').trim();
          this.newCompetencesText = (res.competences ?? []).join('\n');
          this.newPrerequisText = (res.prerequis ?? []).join('\n');
          this.newNiveau = res.niveau_estime ?? null;
          this.newProjection = (res.projection ?? '').trim();
          this.addProposalReady = !!this.newDisciplineLabel;
          if (!this.addProposalReady) {
            this.addErrorKey = 'disciplineDialog.addProposeEmpty';
          }
        },
        error: (err: HttpErrorResponse) => {
          this.addErrorKey =
            err.status === 502
              ? 'disciplineDialog.addProposeMistralError'
              : 'disciplineDialog.addProposeError';
        }
      });
  }

  validateDisciplineProposal(): void {
    const label = this.newDisciplineLabel.trim();
    if (!label) {
      this.addErrorKey = 'disciplineDialog.addLabelRequired';
      return;
    }
    this.addProposalValidated = true;
    this.addErrorKey = null;
  }

  validateNewDiscipline(): void {
    if (this.addingDiscipline || !this.addProposalValidated) return;
    const label = this.newDisciplineLabel.trim();
    const description = this.newDisciplineDescription.trim();
    if (!label) {
      this.addErrorKey = 'disciplineDialog.addLabelRequired';
      return;
    }
    const competences = this.linesToLabels(this.newCompetencesText);
    const prerequis = this.linesToLabels(this.newPrerequisText);
    const projection = this.newProjection.trim();
    const payload: DisciplineUpsertPayload = {
      label,
      ...(description ? { description } : {}),
      ...(competences.length ? { competences } : {}),
      ...(prerequis.length ? { prerequis } : {}),
      ...(this.newNiveau ? { niveau_estime: this.newNiveau } : {}),
      ...(projection ? { projection } : {})
    };
    this.addingDiscipline = true;
    this.addErrorKey = null;
    this.api.createDiscipline(payload).subscribe({
      next: (created) => {
        this.disciplines = [...this.disciplines, created];
        this.selectedKey = String(created.id_discipline);
        this.resetAddForm();
        this.showAddForm = false;
        this.addingDiscipline = false;
        this.refreshParcoursCounts();
        this.syncActiveDisciplineFromSelection();
        this.loadDetail(created.id_discipline);
      },
      error: (err: HttpErrorResponse) => {
        this.addingDiscipline = false;
        this.addErrorKey =
          err.status === 409
            ? 'disciplineDialog.addErrorDuplicate'
            : 'disciplineDialog.addError';
      }
    });
  }

  saveDetail(): void {
    if (this.savingDetail || this.selectedDiscipline == null) return;
    const label = this.editLabel.trim();
    if (!label) {
      this.saveErrorKey = 'disciplineDialog.addLabelRequired';
      return;
    }
    const payload: DisciplineUpsertPayload = {
      label,
      description: this.editDescription.trim() || undefined,
      niveau_estime: this.editNiveau,
      projection: this.editProjection.trim() || undefined
    };
    this.savingDetail = true;
    this.saveErrorKey = null;
    this.api
      .updateDiscipline(this.selectedDiscipline.id_discipline, payload)
      .pipe(finalize(() => (this.savingDetail = false)))
      .subscribe({
        next: (updated) => {
          this.disciplines = this.disciplines.map((d) =>
            d.id_discipline === updated.id_discipline ? { ...d, ...updated } : d
          );
          if (this.disciplineService.selectedDisciplineId() === updated.id_discipline) {
            this.disciplineService.setSelectedDiscipline(updated.id_discipline, updated.label);
          }
          this.loadDetail(updated.id_discipline);
          this.snackBar.open(
            this.translate.instant('disciplinePage.saveSuccess'),
            this.translate.instant('common.close'),
            { duration: 3000 }
          );
        },
        error: () => {
          this.saveErrorKey = 'disciplineDialog.editError';
        }
      });
  }

  requestDeleteDiscipline(discipline: DisciplineDto, event?: Event): void {
    event?.stopPropagation();
    this.selectedKey = String(discipline.id_discipline);
    this.deleteSelectedDiscipline();
  }

  deleteSelectedDiscipline(): void {
    if (!this.canDeleteSelectedDiscipline || this.selectedDiscipline == null) return;
    const ok = window.confirm(
      this.translate.instant('disciplineDialog.deleteConfirm', {
        label: this.selectedDiscipline.label
      })
    );
    if (!ok) return;
    const deletedId = this.selectedDiscipline.id_discipline;
    this.deletingDiscipline = true;
    this.deleteErrorKey = null;
    this.deleteErrorParams = {};
    this.api
      .deleteDiscipline(deletedId)
      .pipe(finalize(() => (this.deletingDiscipline = false)))
      .subscribe({
        next: () => {
          this.disciplines = this.disciplines.filter((d) => d.id_discipline !== deletedId);
          delete this.parcoursCountByDiscipline[deletedId];
          if (this.disciplineService.selectedDisciplineId() === deletedId) {
            this.disciplineService.setSelectedDiscipline(null, null);
          }
          this.selectedKey = 'all';
          this.onSelectedKeyChange();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 409) {
            this.deleteErrorKey = 'disciplineDialog.deleteBlockedByParcours';
            this.deleteErrorParams = {
              count: this.parcoursCountByDiscipline[deletedId] ?? 0
            };
          } else {
            this.deleteErrorKey = 'disciplineDialog.deleteError';
            this.deleteErrorParams = {};
          }
        }
      });
  }

  private loadDetail(id: number): void {
    this.detailSub?.unsubscribe();
    this.detailLoading = true;
    this.detailError = false;
    this.detail = null;
    this.detailSub = this.api.getDisciplineDetail(id).subscribe({
      next: (data) => {
        this.detail = data;
        this.detailLoading = false;
        this.syncEditFieldsFromDetail(data);
      },
      error: () => {
        this.detailLoading = false;
        this.detailError = true;
        this.resetEditFields();
      }
    });
  }

  private syncEditFieldsFromDetail(d: DisciplineDetailDto): void {
    this.editLabel = d.label ?? '';
    this.editDescription = d.description ?? '';
    this.editNiveau = d.niveau_estime ?? null;
    this.editProjection = d.projection ?? '';
    this.saveErrorKey = null;
  }

  private resetEditFields(): void {
    this.editLabel = '';
    this.editDescription = '';
    this.editNiveau = null;
    this.editProjection = '';
    this.saveErrorKey = null;
  }

  private linesToLabels(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const lbl = line.trim();
      if (!lbl) continue;
      const key = lbl.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(lbl);
    }
    return out;
  }

  private resetAddForm(): void {
    this.newDisciplineWish = '';
    this.newDisciplineLabel = '';
    this.newDisciplineDescription = '';
    this.newCompetencesText = '';
    this.newPrerequisText = '';
    this.newNiveau = null;
    this.newProjection = '';
    this.addProposalReady = false;
    this.addProposalValidated = false;
    this.proposingDiscipline = false;
    this.addErrorKey = null;
  }

  private refreshParcoursCounts(): void {
    if (!this.disciplines.length) {
      this.parcoursCountByDiscipline = {};
      return;
    }
    this.loadingParcoursCounts = true;
    forkJoin(
      this.disciplines.map((d) =>
        this.api.getAllThemesAdmin(d.id_discipline).pipe(
          map(
            (themes) =>
              [d.id_discipline, this.countParcoursInThemes(themes)] as const
          ),
          catchError(() => of([d.id_discipline, -1] as const))
        )
      )
    )
      .pipe(finalize(() => (this.loadingParcoursCounts = false)))
      .subscribe((entries) => {
        this.parcoursCountByDiscipline = Object.fromEntries(entries);
      });
  }

  /** Nombre de parcours (sous-thèmes) sur les thèmes d'une discipline. */
  private countParcoursInThemes(themes: ThemeAdminDto[] | null | undefined): number {
    if (!Array.isArray(themes)) return 0;
    return themes.reduce((sum, theme) => {
      const subs =
        theme.subThemes ??
        (theme as { sub_themes?: unknown }).sub_themes ??
        (theme as { parcours?: unknown }).parcours ??
        [];
      return sum + (Array.isArray(subs) ? subs.length : 0);
    }, 0);
  }

  get selectedDiscipline(): DisciplineDto | null {
    if (this.selectedKey === 'all') return null;
    const id = Number(this.selectedKey);
    if (!Number.isFinite(id)) return null;
    return this.disciplines.find((d) => d.id_discipline === id) ?? null;
  }

  get selectedDisciplineParcoursCount(): number | null {
    const id = this.selectedDiscipline?.id_discipline;
    if (id == null) return null;
    const count = this.parcoursCountByDiscipline[id];
    return typeof count === 'number' && count >= 0 ? count : null;
  }

  canDeleteDisciplineRow(discipline: DisciplineDto): boolean {
    const count = this.parcoursCountByDiscipline[discipline.id_discipline];
    if (this.deletingDiscipline || this.savingDetail || this.addingDiscipline) return false;
    if (count == null || count < 0) return true;
    return count === 0;
  }

  /** Infobulle si la suppression est bloquée par des parcours existants. */
  deleteBlockedByParcoursKey(discipline: DisciplineDto): string | null {
    if (this.canDeleteDisciplineRow(discipline)) return null;
    if (this.deletingDiscipline || this.savingDetail || this.addingDiscipline) return null;
    const count = this.parcoursCountByDiscipline[discipline.id_discipline];
    if (typeof count === 'number' && count > 0) {
      return 'disciplineDialog.deleteBlockedByParcours';
    }
    return null;
  }

  deleteBlockedByParcoursParams(discipline: DisciplineDto): { count: number } {
    return { count: this.parcoursCountByDiscipline[discipline.id_discipline] ?? 0 };
  }

  get canDeleteSelectedDiscipline(): boolean {
    if (this.selectedDiscipline == null) return false;
    const count = this.selectedDisciplineParcoursCount;
    if (this.deletingDiscipline || this.savingDetail || this.addingDiscipline) return false;
    if (count == null) return true;
    return count === 0;
  }
}
