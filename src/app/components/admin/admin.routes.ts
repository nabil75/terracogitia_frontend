import { Routes } from '@angular/router';
import { AdminShellComponent } from './admin-shell.component';
import { AdminThemesComponent } from './sections/admin-themes.component';
import { AdminPlaceholderSectionComponent } from './sections/admin-placeholder-section.component';

/**
 * Routes enfants montées sous `path: 'admin'` dans `app.routes`.
 */
export const ADMIN_CHILD_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'themes' },
      { path: 'themes', component: AdminThemesComponent },
      {
        path: 'notation',
        component: AdminPlaceholderSectionComponent,
        data: { adminSection: 'notation' }
      },
      {
        path: 'sources',
        component: AdminPlaceholderSectionComponent,
        data: { adminSection: 'sources' }
      }
    ]
  }
];
