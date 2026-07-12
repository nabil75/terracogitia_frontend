import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { ResumeComponent } from './components/accueil/resume/resume.component';
import { DiscoverComponent } from './components/discover/discover.component';
import { DisciplineComponent } from './components/discipline/discipline.component';
import { LoginComponent } from './components/login/login.component';
import { DrawingTestComponent } from './components/review/drawing-test.component';
import { ADMIN_CHILD_ROUTES } from './components/admin/admin.routes';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'resume', component: ResumeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'discover', component: DiscoverComponent },
  { path: 'discipline', component: DisciplineComponent },
  { path: 'dev/drawing-test', component: DrawingTestComponent },
  { path: 'admin', children: ADMIN_CHILD_ROUTES }
];