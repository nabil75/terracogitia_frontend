import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { finalize } from 'rxjs';

import { ApiService, DisciplineDto } from '../../../api/api.service';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Choix obligatoire d'une discipline avant création de thème lorsque la vue globale
 * « Toutes les disciplines » est active (`selectedDisciplineId === null`).
 */
@Component({
  selector: 'app-theme-discipline-pick-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    TranslateModule
  ],
  templateUrl: './theme-discipline-pick-dialog.component.html',
  styleUrl: './theme-discipline-pick-dialog.component.scss'
})
export class ThemeDisciplinePickDialogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialogRef = inject(
    MatDialogRef<ThemeDisciplinePickDialogComponent, number | undefined>
  );

  loading = true;
  loadError = false;
  disciplines: DisciplineDto[] = [];
  /** Identifiant sélectionné (`mat-radio-group`). */
  selectedId: number | null = null;
  selectionTouched = false;

  ngOnInit(): void {
    this.api
      .getAllDisciplines()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (rows) => {
          this.disciplines = Array.isArray(rows) ? rows : [];
          this.loadError = false;
        },
        error: () => {
          this.disciplines = [];
          this.loadError = true;
        }
      });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  confirm(): void {
    this.selectionTouched = true;
    if (this.selectedId == null) return;
    this.dialogRef.close(this.selectedId);
  }
}
