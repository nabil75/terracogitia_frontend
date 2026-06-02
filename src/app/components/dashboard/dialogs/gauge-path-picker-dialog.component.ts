import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

export interface GaugePathPickerOption {
  id: string;
  label: string;
}

export interface GaugePathPickerDialogData {
  themeLabel: string;
  selectedId: string;
  options: GaugePathPickerOption[];
}

@Component({
  selector: 'app-gauge-path-picker-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './gauge-path-picker-dialog.component.html',
  styleUrl: './gauge-path-picker-dialog.component.scss'
})
export class GaugePathPickerDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: GaugePathPickerDialogData,
    private readonly dialogRef: MatDialogRef<GaugePathPickerDialogComponent, string | undefined>
  ) {}

  choose(pathId: string): void {
    this.dialogRef.close(pathId);
  }
}
