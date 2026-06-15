import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { ResumeComponent } from './components/accueil/resume/resume.component';
import { ReviewComponent } from './components/review/review.component';
import { DiscoverComponent } from './components/discover/discover.component';
import { DisciplineComponent } from './components/discipline/discipline.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { EvaluationAvanceeComponent } from './components/evaluation-avancee/evaluation-avancee.component';
import { LoginComponent } from './components/login/login.component';
import { ADMIN_CHILD_ROUTES } from './components/admin/admin.routes';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'resume', component: ResumeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'review', component: ReviewComponent },
  { path: 'discover', component: DiscoverComponent },
  { path: 'discipline', component: DisciplineComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'evaluation-avancee', component: EvaluationAvanceeComponent },
  { path: 'admin', children: ADMIN_CHILD_ROUTES }
];
