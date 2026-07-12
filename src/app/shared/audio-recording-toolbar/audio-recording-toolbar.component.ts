import {
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService, AudioTranscriptionResponse } from '../../api/api.service';

export interface AudioTranscriptionResult {
  id: string;
  text: string;
}

@Component({
  selector: 'app-audio-recording-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './audio-recording-toolbar.component.html',
  styleUrl: './audio-recording-toolbar.component.scss',
})
export class AudioRecordingToolbarComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly zone = inject(NgZone);

  /** Identifiant du fichier audio enregistré côté serveur. */
  @Input() audioId = '';
  @Output() audioIdChange = new EventEmitter<string>();

  /** Texte transcrit (émet aussi `transcriptionChange` à chaque transcription). */
  @Input() transcription = '';
  @Output() transcriptionChange = new EventEmitter<string>();

  /** Émis une fois la transcription terminée (id + texte). */
  @Output() transcribed = new EventEmitter<AudioTranscriptionResult>();

  @Input() disabled = false;

  isRecording = false;
  isLoading = false;

  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private audioBlob: Blob | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;

  ngOnDestroy(): void {
    this.stopMediaStream();
    this.revokeObjectUrl();
    this.audioElement = null;
  }

  startRecording(): void {
    if (this.disabled || this.isRecording || this.isLoading) {
      return;
    }

    this.isRecording = true;
    this.audioChunks = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.mediaStream = stream;
        this.mediaRecorder = new MediaRecorder(stream);

        this.mediaRecorder.ondataavailable = (event) => {
          this.audioChunks.push(event.data);
        };

        this.mediaRecorder.onstop = () => {
          this.audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          this.revokeObjectUrl();
          this.objectUrl = URL.createObjectURL(this.audioBlob);
          this.audioElement = new Audio(this.objectUrl);
          this.stopMediaStream();
          this.sendAudioToBackend();
        };

        this.mediaRecorder.start();
      })
      .catch((err) => {
        console.error('Erreur accès micro :', err);
        this.isRecording = false;
      });
  }

  stopRecording(): void {
    if (!this.isRecording) {
      return;
    }
    this.isRecording = false;
    this.mediaRecorder?.stop();
    this.mediaRecorder = null;
  }

  playAudio(): void {
    if (!this.audioId || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.api.getAudioFile(this.audioId).subscribe({
      next: (blob) => {
        this.revokeObjectUrl();
        this.objectUrl = URL.createObjectURL(blob);
        this.audioElement = new Audio(this.objectUrl);
        this.audioElement.currentTime = 0;
        void this.audioElement.play();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Erreur lecture audio :', err);
        this.isLoading = false;
      },
    });
  }

  private sendAudioToBackend(): void {
    if (!this.audioBlob) {
      return;
    }

    this.isLoading = true;
    this.api.transcribeAudio(this.audioBlob).subscribe({
      next: (data: AudioTranscriptionResponse) => {
        this.zone.run(() => {
          const id = data.id || '';
          const text = data.text || '';
          this.audioId = id;
          this.transcription = text;
          this.audioIdChange.emit(id);
          this.transcriptionChange.emit(text);
          this.transcribed.emit({ id, text });
          this.isLoading = false;
        });
      },
      error: (err) => {
        console.error('Erreur transcription backend :', err);
        this.isLoading = false;
      },
    });
  }

  private stopMediaStream(): void {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
