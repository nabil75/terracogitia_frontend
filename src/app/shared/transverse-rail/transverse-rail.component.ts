import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';

import { ThemeService } from '../services/theme.service';
import { LanguageService } from '../services/language.service';
import { DisciplineService } from '../services/discipline.service';
import { InactiveThemeVisibilityService } from '../services/inactive-theme-visibility.service';
/**
 * Barre latérale fixe (sticker) pour les fonctions transverses.
 * Icônes en SVG inline (`currentColor`) pour suivre le thème comme le bouton clair/sombre.
 */
@Component({
  selector: 'app-transverse-rail',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatTooltipModule, MatIconModule, TranslateModule],
  templateUrl: './transverse-rail.component.html',
  styleUrl: './transverse-rail.component.scss'
})
export class TransverseRailComponent {
  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);
  readonly disciplineService = inject(DisciplineService);
  readonly inactiveThemeVisibility = inject(InactiveThemeVisibilityService);
  private readonly router = inject(Router);

  /** Bascule clair ↔ sombre (persisté dans localStorage par ThemeService). */
  toggleTheme(): void {
    const next = this.themeService.activeTheme() === 'dark' ? 'light' : 'dark';
    this.themeService.changeTheme(next);
  }

  themeTooltipKey(): string {
    return this.themeService.activeTheme() === 'dark'
      ? 'transverseRail.tooltipThemeLight'
      : 'transverseRail.tooltipThemeDark';
  }

  showInactiveThemesButton(): boolean {
    if (!this.inactiveThemeVisibility.hasInactiveThemes()) return false;
    const url = this.router.url;
    return url === '/home' || url.startsWith('/admin');
  }

  inactiveThemesTooltipKey(): string {
    const onHome = this.router.url === '/home' || this.router.url === '/';
    if (this.inactiveThemeVisibility.showInactiveThemes()) {
      return onHome
        ? 'transverseRail.tooltipInactiveHomeHide'
        : 'transverseRail.tooltipInactiveGenericHide';
    }
    return onHome
      ? 'transverseRail.tooltipInactiveHomeShowAll'
      : 'transverseRail.tooltipInactiveGenericShowAllPaths';
  }

  toggleInactiveThemes(): void {
    this.inactiveThemeVisibility.toggleShowInactiveThemes();
  }
}
