import { Component, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../api/api.service';
import { ThemeService } from '../../shared/services/theme.service';
import { DisciplineService } from '../../shared/services/discipline.service';
import { InactiveThemeVisibilityService } from '../../shared/services/inactive-theme-visibility.service';
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
export class HomeComponent implements OnDestroy {

  private apiService = inject(ApiService);
  readonly themeService = inject(ThemeService);
  readonly disciplineService = inject(DisciplineService);
  readonly inactiveThemeVisibility = inject(InactiveThemeVisibilityService);
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

  ngOnDestroy(): void {
    this.inactiveThemeVisibility.setInactiveThemesCount(0);
  }

  private loadThemes(idDiscipline: number | null): void {
    this.apiService.getAllThemes(idDiscipline).subscribe({
      next: (data: unknown) => {
        if (Array.isArray(data)) {
          this.themes = data;
          this.expandedThemeId = null;
          this.updateInactiveThemesCount();
          return;
        }
        const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
        const nested = d?.['themes'] ?? d?.['data'];
        this.themes = Array.isArray(nested) ? nested : [];
        this.expandedThemeId = null;
        this.updateInactiveThemesCount();
      },
      error: () => {
        this.themes = [];
        this.expandedThemeId = null;
        this.inactiveThemeVisibility.setInactiveThemesCount(0);
      }
    });
  }

  expandedThemeId: string | null = null;
  
  private getThemeSubThemes(theme: any): any[] {
    const candidates = [
      theme?.subThemes,
      theme?.sub_themes,
      theme?.parcours,
      theme?.subthemes,
      theme?.paths
    ];
    // Priorité : un tableau non vide.
    for (const v of candidates) {
      if (Array.isArray(v) && v.length > 0) return v;
    }
    // Sinon, on retombe sur le premier tableau présent (même vide) pour
    // que l'UI puisse quand même afficher/adapter le layout.
    for (const v of candidates) {
      if (Array.isArray(v)) return v;
    }
    return [];
  }

  themeHasPaths(theme: any): boolean {
    return this.getThemeSubThemes(theme).length > 0;
  }

  visibleThemes(): any[] {
    if (this.inactiveThemeVisibility.showInactiveThemes()) return this.themes;
    return this.themes.filter((theme) => this.themeHasPaths(theme));
  }

  toggleTheme(theme: any): void {
    if (!this.themeHasPaths(theme)) return;
    const themeId = String(theme?.id ?? theme?.id_theme ?? '');
    if (!themeId) return;
    this.expandedThemeId = this.expandedThemeId === themeId ? null : themeId;
  }

  private updateInactiveThemesCount(): void {
    const count = this.themes.reduce(
      (acc, theme) => acc + (this.themeHasPaths(theme) ? 0 : 1),
      0
    );
    this.inactiveThemeVisibility.setInactiveThemesCount(count);
    if (!this.inactiveThemeVisibility.showInactiveThemes()) {
      const expanded = this.themes.find(
        (theme) => String(theme?.id ?? theme?.id_theme ?? '') === this.expandedThemeId
      );
      if (expanded && !this.themeHasPaths(expanded)) {
        this.expandedThemeId = null;
      }
    }
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


