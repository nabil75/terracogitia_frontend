import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService, ChallengeExerciseDto } from '../../api/api.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';
import { ChallengeExercisePanelComponent } from './challenge-exercise-panel.component';

@Component({
  selector: 'app-challenge-play',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    TranslateModule,
    TransverseRailComponent,
    ChallengeExercisePanelComponent,
  ],
  templateUrl: './challenge-play.component.html',
  styleUrl: './challenge-play.component.scss',
})
export class ChallengePlayComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  loading = true;
  exercise: ChallengeExerciseDto | null = null;
  loadError = '';
  idUser = 1;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('exerciseId'));
    if (!id) {
      this.loadError = 'ID exercice invalide';
      this.loading = false;
      return;
    }
    this.api.getChallengeExercise(id).subscribe({
      next: (ex) => {
        this.exercise = ex;
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Exercice introuvable';
        this.loading = false;
      },
    });
  }
}
