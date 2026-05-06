import {
  ApplicationConfig,
  APP_INITIALIZER,
  inject,
  provideZoneChangeDetection,
  importProvidersFrom
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient } from '@angular/common/http';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { ThemeService } from './shared/services/theme.service';
import { LanguageService } from './shared/services/language.service';

/** Instancie le service tôt pour que l’effet applique les classes `body` avant le premier rendu. */
function provideThemeInitializer() {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      inject(ThemeService);
      return () => void 0;
    }
  };
}

/** Applique la langue persistée / navigateur avant le premier rendu utile. */
function provideLanguageInitializer() {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      inject(LanguageService);
      return () => void 0;
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimations(),
    provideRouter(routes),
    provideHttpClient(),
    importProvidersFrom(
      TranslateModule.forRoot({
        fallbackLang: 'fr',
        lang: 'fr'
      })
    ),
    ...provideTranslateHttpLoader({
      prefix: '/assets/i18n/',
      suffix: '.json'
    }),
    provideThemeInitializer(),
    provideLanguageInitializer()
  ]
};
