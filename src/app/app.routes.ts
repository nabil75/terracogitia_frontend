import { Routes } from '@angular/router';
import { TrainingComponent } from './components/training/training.component';
import { HomeComponent } from './components/home/home.component';
import { ReviewComponent } from './components/review/review.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'training', component: TrainingComponent },
  { path: 'review', component: ReviewComponent }
];