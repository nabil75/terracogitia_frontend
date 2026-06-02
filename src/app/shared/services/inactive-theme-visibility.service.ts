import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class InactiveThemeVisibilityService {
  /** `true` => affiche aussi les thèmes sans parcours. */
  readonly showInactiveThemes = signal(true);

  /** Nombre de thèmes sans parcours pour la page courante. */
  readonly inactiveThemesCount = signal(0);

  readonly hasInactiveThemes = computed(() => this.inactiveThemesCount() > 0);

  setShowInactiveThemes(show: boolean): void {
    this.showInactiveThemes.set(show);
  }

  toggleShowInactiveThemes(): void {
    this.showInactiveThemes.update((v) => !v);
  }

  setInactiveThemesCount(count: number): void {
    this.inactiveThemesCount.set(Math.max(0, Math.floor(count)));
  }
}
