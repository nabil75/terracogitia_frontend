import { Component, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../api/api.service';
import { ThemeService } from '../../shared/services/theme.service';
import { DisciplineService } from '../../shared/services/discipline.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TransverseRailComponent,
    TranslateModule
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {

  private apiService = inject(ApiService);
  readonly themeService = inject(ThemeService);
  readonly disciplineService = inject(DisciplineService);
  /** Toujours un tableau pour que `@for` ne reçoive jamais `undefined` (erreur fatale au premier rendu). */
  themes: any[] = [];

  constructor(private router: Router) {
    /* Recharge la liste des thèmes au premier rendu et à chaque changement de discipline.
     * (Un `effect()` lit le signal et se re-déclenche quand il change.) */
    effect(() => {
      const idDiscipline = this.disciplineService.selectedDisciplineId();
      this.loadThemes(idDiscipline);
    });
  }

  private loadThemes(idDiscipline: number | null): void {
    this.apiService.getAllThemes(idDiscipline).subscribe({
      next: (data: unknown) => {
        if (Array.isArray(data)) {
          this.themes = data;
          this.expandedThemeId = null;
          return;
        }
        const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
        const nested = d?.['themes'] ?? d?.['data'];
        this.themes = Array.isArray(nested) ? nested : [];
        this.expandedThemeId = null;
      },
      error: () => {
        this.themes = [];
        this.expandedThemeId = null;
      }
    });
  }

  expandedThemeId: string | null = null;
  
  toggleTheme(themeId: string) {
    this.expandedThemeId = this.expandedThemeId === themeId ? null : themeId;
  }

  reviewSubTheme(theme: any, subTheme: any) {
    this.router.navigate(['/review'], {
      queryParams: {
        theme: theme.id,
        subTheme: subTheme.id,
        themeLabel: theme.label,
        subThemeLabel: subTheme.label
      }
    });
  }

  discoverSubTheme(theme: any, subTheme: any) {
    this.router.navigate(['/discover'], {
      queryParams: {
        theme: theme.id,
        subTheme: subTheme.id,
        themeLabel: theme.label,
        subThemeLabel: subTheme.label
      }
    });
  }
}


