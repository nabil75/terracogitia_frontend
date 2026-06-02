import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

export interface RadarThemePickerOption {
  id: string;
  label: string;
}

export interface RadarThemePickerDialogData {
  selectedId: string;
  options: RadarThemePickerOption[];
}

@Component({
  selector: 'app-radar-theme-picker-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './radar-theme-picker-dialog.component.html',
  styleUrl: './radar-theme-picker-dialog.component.scss'
})
export class RadarThemePickerDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: RadarThemePickerDialogData,
    private readonly dialogRef: MatDialogRef<RadarThemePickerDialogComponent, string | undefined>
  ) {}

  choose(themeId: string): void {
    this.dialogRef.close(themeId);
  }
}
