import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SubThemeAdminDto, SubThemeUpsertPayload } from '../../../api/api.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

export interface SubThemeEditDialogData {
  mode: 'create' | 'edit';
  themeLabel: string;
  subTheme?: SubThemeAdminDto;
}

@Component({
  selector: 'app-subtheme-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslateModule
  ],
  templateUrl: './subtheme-edit-dialog.component.html',
  styleUrl: './subtheme-edit-dialog.component.scss'
})
export class SubThemeEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly translate = inject(TranslateService);
  readonly form = this.fb.group({
    label: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.maxLength(4000)]]
  });

  constructor(
    private dialogRef: MatDialogRef<SubThemeEditDialogComponent, SubThemeUpsertPayload | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: SubThemeEditDialogData
  ) {
    if (data.mode === 'edit' && data.subTheme) {
      this.form.patchValue({
        label: data.subTheme.label,
        description: data.subTheme.description ?? ''
      });
    }
  }

  get title(): string {
    const ctx = this.data.themeLabel;
    return this.data.mode === 'create'
      ? this.translate.instant('subthemeEditDialog.titleCreate', { theme: ctx })
      : this.translate.instant('subthemeEditDialog.titleEdit', { theme: ctx });
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
      description: v.description?.trim() || undefined
    });
  }
}
