import { Component, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import {
  DrawingData,
  DrawingEditorComponent,
  DrawingResult,
  DRAWING_DIALOG_INITIAL_HEIGHT,
  DRAWING_DIALOG_INITIAL_WIDTH,
  DRAWING_DIALOG_MAXIMIZED_HEIGHT,
  DRAWING_DIALOG_MAXIMIZED_PANEL_CLASS,
  DRAWING_DIALOG_MAXIMIZED_WIDTH,
} from './drawing-editor.component';

export type { DrawingData, DrawingResult };
export {
  DrawingEditorComponent,
  DRAWING_DIALOG_INITIAL_HEIGHT,
  DRAWING_DIALOG_INITIAL_WIDTH,
  DRAWING_DIALOG_MAXIMIZED_HEIGHT,
  DRAWING_DIALOG_MAXIMIZED_PANEL_CLASS,
  DRAWING_DIALOG_MAXIMIZED_WIDTH,
};

@Component({
  selector: 'app-drawing-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule,
    DrawingEditorComponent,
  ],
  templateUrl: './drawing-dialog.component.html',
  styleUrl: './drawing-dialog.component.scss',
})
export class DrawingDialogComponent {
  @ViewChild(DrawingEditorComponent)
  editor?: DrawingEditorComponent;

  dialogMaximized = false;

  constructor(
    private dialogRef: MatDialogRef<DrawingDialogComponent, DrawingResult>,
    @Inject(MAT_DIALOG_DATA) public data: DrawingData
  ) {}

  toggleDialogMaximized(): void {
    this.dialogMaximized = !this.dialogMaximized;
    if (this.dialogMaximized) {
      this.dialogRef.updateSize(
        DRAWING_DIALOG_MAXIMIZED_WIDTH,
        DRAWING_DIALOG_MAXIMIZED_HEIGHT
      );
      this.dialogRef.addPanelClass(DRAWING_DIALOG_MAXIMIZED_PANEL_CLASS);
    } else {
      this.dialogRef.updateSize(
        DRAWING_DIALOG_INITIAL_WIDTH,
        DRAWING_DIALOG_INITIAL_HEIGHT
      );
      this.dialogRef.removePanelClass(DRAWING_DIALOG_MAXIMIZED_PANEL_CLASS);
    }
    this.dialogRef.updatePosition();
    requestAnimationFrame(() => this.editor?.syncCanvasToWrapSize());
  }

  onSaved(): void {
    this.dialogRef.close('saved');
  }

  onDeleted(): void {
    this.dialogRef.close('deleted');
  }

  onCancelled(): void {
    this.dialogRef.close(undefined);
  }
}
