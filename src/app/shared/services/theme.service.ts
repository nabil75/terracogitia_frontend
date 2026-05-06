import { Injectable, computed, effect, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  private readonly THEME_KEY = 'activeTheme';
  activeTheme = signal<string>(this.getSavedTheme());

  /** Chemin du logo selon le thème actif (pour les templates).
   *  Fichiers : variant « light » = logo clair sur fond sombre ; « dark » = logo foncé sur fond clair. */
  readonly logoSrc = computed(() =>
    this.activeTheme() === 'dark'
      ? 'assets/images/logo_terra-cogitia_light.png'
      : 'assets/images/logo_terra-cogitia_dark.png'
  );

  constructor() {
    // Effet : sauvegarde le thème et applique la classe à chaque changement
    effect(() => {
      const theme = this.activeTheme();

      // Sauvegarde dans le localStorage
      localStorage.setItem(this.THEME_KEY, theme);

      // Applique la classe CSS correspondante (thème sombre et clair définis explicitement)
      if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
      }
    });
  }

  private getSavedTheme(): string {
    return localStorage.getItem(this.THEME_KEY) || 'dark';
  }

  changeTheme(theme: string) {
    this.activeTheme.set(theme);
  }
}