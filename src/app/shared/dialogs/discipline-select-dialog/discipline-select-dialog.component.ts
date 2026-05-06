import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { HttpErrorResponse } from '@angular/common/http';
import { catchError, finalize, forkJoin, map, of } from 'rxjs';

import {
  ApiService,
  DisciplineDto,
  DisciplineUpsertPayload
} from '../../../api/api.service';
import { DisciplineService } from '../../services/discipline.service';

/**
 * Résultat retourné à la fermeture du dialogue.
 * `id === null` ⇒ « Toutes les disciplines ».
 */
export interface DisciplineSelectionResult {
  id: number | null;
  label: string | null;
}

@Component({
  selector: 'app-discipline-select-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    TranslateModule
  ],
  templateUrl: './discipline-select-dialog.component.html',
  styleUrl: './discipline-select-dialog.component.scss'
})
export class DisciplineSelectDialogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly translate = inject(TranslateService);
  private readonly dialogRef = inject(
    MatDialogRef<DisciplineSelectDialogComponent, DisciplineSelectionResult | undefined>
  );

  disciplines: DisciplineDto[] = [];
  loading = true;
  loadError = false;

  /** `null` ⇒ « Toutes les disciplines ». Stocké en chaîne pour éviter les pièges du `mat-radio` avec `null`. */
  selectedKey: string = 'all';

  /** État du formulaire « Ajouter une discipline » (replié par défaut). */
  showAddForm = false;
  newDisciplineLabel = '';
  newDisciplineDescription = '';
  /** Vrai pendant la requête `POST /disciplines/create_discipline`. */
  addingDiscipline = false;
  /** Clé i18n du message d'erreur affiché dans la section d'ajout (`null` ⇒ aucune erreur). */
  addErrorKey: string | null = null;

  showEditForm = false;
  editDisciplineLabel = '';
  editDisciplineDescription = '';
  editingDiscipline = false;
  editErrorKey: string | null = null;
  assistingWithAi = false;

  deletingDiscipline = false;
  deleteErrorKey: string | null = null;
  loadingThemeCounts = false;
  themeCountByDiscipline: Record<number, number> = {};

  ngOnInit(): void {
    const current = this.disciplineService.selectedDisciplineId();
    this.selectedKey = current == null ? 'all' : String(current);

    this.api.getAllDisciplines().subscribe({
      next: (data) => {
        this.disciplines = Array.isArray(data) ? data : [];
        this.loading = false;
        this.refreshThemeCounts();
      },
      error: () => {
        this.disciplines = [];
        this.loadError = true;
        this.loading = false;
      }
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  confirm(): void {
    if (this.selectedKey === 'all') {
      this.dialogRef.close({ id: null, label: null });
      return;
    }
    const id = Number(this.selectedKey);
    if (!Number.isFinite(id)) {
      this.dialogRef.close(undefined);
      return;
    }
    const found = this.disciplines.find((d) => d.id_discipline === id);
    this.dialogRef.close({ id, label: found?.label ?? null });
  }

  /** Ouvre / ferme la zone d'ajout d'une discipline. Les champs sont remis à zéro à chaque fermeture. */
  toggleAddForm(): void {
    this.showAddForm = !this.showAddForm;
    if (!this.showAddForm) {
      this.resetAddForm();
    }
    if (this.showAddForm) {
      this.showEditForm = false;
      this.resetEditForm();
    }
  }

  toggleEditForm(): void {
    if (!this.selectedDiscipline) return;
    this.showEditForm = !this.showEditForm;
    this.deleteErrorKey = null;
    if (!this.showEditForm) {
      this.resetEditForm();
      return;
    }
    this.showAddForm = false;
    this.resetAddForm();
    this.prefillEditForm();
  }

  assistEditWithAi(): void {
    if (!this.showEditForm || this.assistingWithAi || this.selectedDiscipline == null) return;
    const label = this.editDisciplineLabel.trim();
    const description = this.editDisciplineDescription.trim();
    if (!label && !description) {
      this.editErrorKey = 'disciplineDialog.addLabelRequired';
      return;
    }

    this.assistingWithAi = true;
    this.editErrorKey = null;
    this.api
      .assistDisciplineDraft({ label, ...(description ? { description } : {}) })
      .pipe(finalize(() => (this.assistingWithAi = false)))
      .subscribe({
        next: (res) => {
          const aiLabel = (res?.label ?? '').trim();
          const aiDesc = (res?.description ?? '').trim();
          if (aiLabel) this.editDisciplineLabel = aiLabel;
          this.editDisciplineDescription = aiDesc;
        },
        error: () => {
          this.editErrorKey = 'disciplineDialog.assistError';
        }
      });
  }

  validateEditDiscipline(): void {
    if (this.editingDiscipline || this.selectedDiscipline == null) return;
    const label = this.editDisciplineLabel.trim();
    const description = this.editDisciplineDescription.trim();
    if (!label) {
      this.editErrorKey = 'disciplineDialog.addLabelRequired';
      return;
    }

    const payload: DisciplineUpsertPayload = description ? { label, description } : { label };
    this.editingDiscipline = true;
    this.editErrorKey = null;

    this.api
      .updateDiscipline(this.selectedDiscipline.id_discipline, payload)
      .pipe(finalize(() => (this.editingDiscipline = false)))
      .subscribe({
        next: (updated) => {
          this.disciplines = this.disciplines.map((d) =>
            d.id_discipline === updated.id_discipline ? updated : d
          );
          this.showEditForm = false;
          this.resetEditForm();
        },
        error: () => {
          this.editErrorKey = 'disciplineDialog.editError';
        }
      });
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
    this.api
      .deleteDiscipline(deletedId)
      .pipe(finalize(() => (this.deletingDiscipline = false)))
      .subscribe({
        next: () => {
          this.disciplines = this.disciplines.filter((d) => d.id_discipline !== deletedId);
          delete this.themeCountByDiscipline[deletedId];
          this.selectedKey = 'all';
          this.showEditForm = false;
          this.resetEditForm();
        },
        error: () => {
          this.deleteErrorKey = 'disciplineDialog.deleteError';
        }
      });
  }

  /**
   * Crée la discipline saisie dans la section « Nouvelle discipline ».
   * Appelle `POST /disciplines/create_discipline` (cf. `ApiService.createDiscipline`).
   * En cas de succès : ajoute la ligne à la liste, la pré-sélectionne et referme la zone.
   * En cas d'échec : conserve la saisie et affiche un message d'erreur i18n.
   */
  validateNewDiscipline(): void {
    if (this.addingDiscipline) return;

    const label = this.newDisciplineLabel.trim();
    const description = this.newDisciplineDescription.trim();

    if (!label) {
      this.addErrorKey = 'disciplineDialog.addLabelRequired';
      return;
    }

    const payload: DisciplineUpsertPayload = description
      ? { label, description }
      : { label };

    this.addingDiscipline = true;
    this.addErrorKey = null;

    this.api.createDiscipline(payload).subscribe({
      next: (created) => {
        this.disciplines = [...this.disciplines, created];
        this.selectedKey = String(created.id_discipline);
        this.resetAddForm();
        this.showAddForm = false;
        this.addingDiscipline = false;
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

  private resetAddForm(): void {
    this.newDisciplineLabel = '';
    this.newDisciplineDescription = '';
    this.addErrorKey = null;
  }

  private resetEditForm(): void {
    this.editDisciplineLabel = '';
    this.editDisciplineDescription = '';
    this.editErrorKey = null;
    this.assistingWithAi = false;
  }

  private prefillEditForm(): void {
    if (!this.selectedDiscipline) return;
    this.editDisciplineLabel = this.selectedDiscipline.label ?? '';
    this.editDisciplineDescription = this.selectedDiscipline.description ?? '';
    this.editErrorKey = null;
  }

  private refreshThemeCounts(): void {
    if (!this.disciplines.length) {
      this.themeCountByDiscipline = {};
      return;
    }
    this.loadingThemeCounts = true;
    forkJoin(
      this.disciplines.map((d) =>
        this.api.getAllThemesAdmin(d.id_discipline).pipe(
          map((themes) => [d.id_discipline, (Array.isArray(themes) ? themes.length : 0)] as const),
          catchError(() => of([d.id_discipline, -1] as const))
        )
      )
    )
      .pipe(finalize(() => (this.loadingThemeCounts = false)))
      .subscribe((entries) => {
        this.themeCountByDiscipline = Object.fromEntries(entries);
      });
  }

  get selectedDiscipline(): DisciplineDto | null {
    if (this.selectedKey === 'all') return null;
    const id = Number(this.selectedKey);
    if (!Number.isFinite(id)) return null;
    return this.disciplines.find((d) => d.id_discipline === id) ?? null;
  }

  get selectedDisciplineThemeCount(): number | null {
    const id = this.selectedDiscipline?.id_discipline;
    if (id == null) return null;
    const count = this.themeCountByDiscipline[id];
    return typeof count === 'number' && count >= 0 ? count : null;
  }

  get canDeleteSelectedDiscipline(): boolean {
    if (this.selectedDiscipline == null) return false;
    const count = this.selectedDisciplineThemeCount;
    return count === 0 && !this.deletingDiscipline && !this.editingDiscipline && !this.addingDiscipline;
  }
}
