import { Routes } from '@angular/router';

export const editQuestionnaireRoutes: Routes = [
    { 
      path: 'edit-questionnaire/:id', 
      loadComponent: () => import('./edit-questionnaire.component').then(module => module.EditQuestionnaireComponent)
    },
]