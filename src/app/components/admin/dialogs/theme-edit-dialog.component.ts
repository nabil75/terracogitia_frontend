import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ThemeAdminDto, ThemeUpsertPayload } from '../../../api/api.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

export interface ThemeEditDialogData {
  mode: 'create' | 'edit';
  theme?: ThemeAdminDto;
}

@Component({
  selector: 'app-theme-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslateModule
  ],
  templateUrl: './theme-edit-dialog.component.html',
  styleUrl: './theme-edit-dialog.component.scss'
})
export class ThemeEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly translate = inject(TranslateService);
  readonly form = this.fb.group({
    label: ['', [Validators.required, Validators.maxLength(200)]],
    tagline: ['', [Validators.maxLength(300)]],
    description: ['', [Validators.maxLength(4000)]]
  });

  constructor(
    private dialogRef: MatDialogRef<ThemeEditDialogComponent, ThemeUpsertPayload | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: ThemeEditDialogData
  ) {
    if (data.mode === 'edit' && data.theme) {
      this.form.patchValue({
        label: data.theme.label,
        tagline: data.theme.tagline ?? '',
        description: data.theme.description ?? ''
      });
    }
  }

  get title(): string {
    return this.data.mode === 'create'
      ? this.translate.instant('themeEditDialog.titleCreate')
      : this.translate.instant('themeEditDialog.titleEdit');
  }

  cancel() {
    this.dialogRef.close(undefined);
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.dialogRef.close({
      label: v.label!.trim(),
      tagline: v.tagline?.trim() || undefined,
      description: v.description?.trim() || undefined
    });
  }
}
