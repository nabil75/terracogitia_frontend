import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { ReviewComponent } from './components/review/review.component';
import { DiscoverComponent } from './components/discover/discover.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LoginComponent } from './components/login/login.component';
import { ADMIN_CHILD_ROUTES } from './components/admin/admin.routes';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'review', component: ReviewComponent },
  { path: 'discover', component: DiscoverComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'admin', children: ADMIN_CHILD_ROUTES }
];
