import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';

import { ThemeService } from '../services/theme.service';
import { LanguageService } from '../services/language.service';
import { DisciplineService } from '../services/discipline.service';
import {
  DisciplineSelectDialogComponent,
  DisciplineSelectionResult
} from '../dialogs/discipline-select-dialog/discipline-select-dialog.component';

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
  private readonly dialog = inject(MatDialog);

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

  /** Ouvre la popup de sélection de discipline et persiste le choix validé. */
  openDisciplineSelector(): void {
    const ref = this.dialog.open<
      DisciplineSelectDialogComponent,
      void,
      DisciplineSelectionResult | undefined
    >(DisciplineSelectDialogComponent, {
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: 'app-discipline-dialog'
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.disciplineService.setSelectedDiscipline(result.id, result.label);
    });
  }
}
