import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { AudioRecordingToolbarComponent } from '../../shared/audio-recording-toolbar/audio-recording-toolbar.component';
import { DrawingEditorComponent } from '../../shared/drawing-editor/drawing-editor.component';
import {
  DrawingDialogComponent,
  DrawingResult,
  DRAWING_DIALOG_INITIAL_HEIGHT,
  DRAWING_DIALOG_INITIAL_WIDTH,
} from '../../shared/drawing-editor/drawing-dialog.component';

@Component({
  selector: 'app-drawing-test',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    TranslateModule,
    AudioRecordingToolbarComponent,
    DrawingEditorComponent,
  ],
  templateUrl: './drawing-test.component.html',
  styleUrl: './drawing-test.component.scss',
})
export class DrawingTestComponent {
  private readonly dialog = inject(MatDialog);

  /** Identifiant objet existant en base (modifiable pour les tests). */
  idObjet = '1';
  objectLabel = 'Objet de test — dessin graphique';
  lastDrawingResult: DrawingResult | 'cancelled' | null = null;
  lastEmbeddedDrawingResult: 'saved' | 'deleted' | 'cancelled' | null = null;

  transcription = '';
  audioId = '';

  openDrawingDialog(): void {
    const id = this.idObjet.trim();
    if (!id) {
      return;
    }

    const ref = this.dialog.open(DrawingDialogComponent, {
      width: DRAWING_DIALOG_INITIAL_WIDTH,
      maxWidth: DRAWING_DIALOG_INITIAL_WIDTH,
      height: DRAWING_DIALOG_INITIAL_HEIGHT,
      maxHeight: '100vh',
      panelClass: 'app-drawing-dialog',
      data: {
        idObjet: id,
        objectLabel: this.objectLabel.trim() || `Objet #${id}`,
      },
    });

    ref.afterClosed().subscribe((result: DrawingResult) => {
      this.lastDrawingResult = result ?? 'cancelled';
    });
  }

  onEmbeddedDrawingSaved(): void {
    this.lastEmbeddedDrawingResult = 'saved';
  }

  onEmbeddedDrawingDeleted(): void {
    this.lastEmbeddedDrawingResult = 'deleted';
  }

  onEmbeddedDrawingCancelled(): void {
    this.lastEmbeddedDrawingResult = 'cancelled';
  }
}
