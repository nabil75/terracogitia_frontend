import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

const STORAGE_KEY = 'lang';
const SUPPORTED = ['fr', 'en'] as const;
export type AppLang = (typeof SUPPORTED)[number];

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly translate = inject(TranslateService);

  constructor() {
    this.translate.addLangs([...SUPPORTED]);
    this.translate.setDefaultLang('fr');

    const saved = localStorage.getItem(STORAGE_KEY) as AppLang | null;
    const fromStorage = saved && SUPPORTED.includes(saved as AppLang) ? saved : null;
    const browser = this.translate.getBrowserLang();
    const fromBrowser =
      browser && browser.toLowerCase().startsWith('en')
        ? 'en'
        : browser && browser.toLowerCase().startsWith('fr')
          ? 'fr'
          : null;

    this.translate.use(fromStorage ?? fromBrowser ?? 'fr');
  }

  switchLanguage(lang: AppLang): void {
    this.translate.use(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }

  toggleLanguage(): void {
    this.switchLanguage(this.getCurrentLang() === 'fr' ? 'en' : 'fr');
  }

  getCurrentLang(): AppLang {
    const c = this.translate.getCurrentLang();
    return c === 'en' || c === 'fr' ? c : 'fr';
  }

  languageSwitchTooltipKey(): string {
    return this.getCurrentLang() === 'fr'
      ? 'transverseRail.tooltipLangEn'
      : 'transverseRail.tooltipLangFr';
  }
}
