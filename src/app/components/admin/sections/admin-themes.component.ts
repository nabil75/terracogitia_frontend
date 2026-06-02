import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter, finalize, of } from 'rxjs';

import {
  ApiService,
  GenerateParcoursQuestionsFromThemePayload,
  SubThemeAdminDto,
  ThemeAdminDto
} from '../../../api/api.service';
import { ThemeEditDialogComponent } from '../dialogs/theme-edit-dialog.component';
import { ThemeDisciplinePickDialogComponent } from '../dialogs/theme-discipline-pick-dialog.component';
import { SubThemeEditDialogComponent } from '../dialogs/subtheme-edit-dialog.component';
import {
  ConfirmDeleteDialogComponent,
  ConfirmDeleteDialogData
} from '../dialogs/confirm-delete-dialog.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SpinnerComponent } from "../../../shared/spinner/spinner.component";
import { DisciplineService } from '../../../shared/services/discipline.service';
import { InactiveThemeVisibilityService } from '../../../shared/services/inactive-theme-visibility.service';

function httpErrorMessage(err: unknown, translate: TranslateService): string {
  if (err instanceof HttpErrorResponse) {
    const d = err.error as
      | { detail?: unknown; message?: string }
      | undefined;
    if (typeof d?.detail === 'string') return d.detail;
    /* FastAPI — erreurs de validation 422 : `detail` est souvent un tableau `{loc, msg, type}[]` */
    if (Array.isArray(d?.detail)) {
      const msgs = (d.detail as { msg?: string }[])
        .map((x) => (typeof x?.msg === 'string' ? x.msg : null))
        .filter((m): m is string => m != null && m.length > 0);
      if (msgs.length) return msgs.join(' · ');
    }
    if (d?.detail && typeof d.detail === 'object' && 'message' in d.detail) {
      return String((d.detail as { message?: string }).message ?? err.statusText);
    }
    if (typeof d?.message === 'string') return d.message;
    return err.message || translate.instant('common.errorHttp', { status: err.status });
  }
  return translate.instant('common.errorUnexpected');
}

@Component({
  selector: 'app-admin-themes',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslateModule,
    SpinnerComponent
],
  templateUrl: './admin-themes.component.html',
  styleUrl: './admin-themes.component.scss'
})
export class AdminThemesComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly translate = inject(TranslateService);
  private readonly disciplineService = inject(DisciplineService);
  readonly inactiveThemeVisibility = inject(InactiveThemeVisibilityService);

  /** Thème choisi pour la génération bulk parcours + questions (id en string, aligné sur `mat-option`). */
  bulkAiSelectedThemeId: string | null = null;

  /** Sous-titre tronqué (ellipsis) : clé = id thème → infobulle activée. */
  protected taglineTruncated: Record<string, boolean> = {};

  /** Accordéon thèmes : panneaux actuellement ouverts (clé id). */
  private readonly expandedThemeKeys = new Set<string>();
  /** Dernier thème développé (pour le titre « … : Les parcours »). */
  private lastOpenedThemeKey: string | null = null;
  /** Incrémenté pour forcer la réévaluation du titre quand les panneaux s’ouvrent/ferment. */
  private readonly expansionRevision = signal(0);

  /** Libellé à afficher dans le titre de section quand au moins un thème est déplié. */
  themesSectionTitleThemeLabel = computed(() => {
    this.expansionRevision();
    if (this.expandedThemeKeys.size === 0) return null;
    const prefer =
      this.lastOpenedThemeKey && this.expandedThemeKeys.has(this.lastOpenedThemeKey)
        ? this.lastOpenedThemeKey
        : [...this.expandedThemeKeys][0];
    const row = this.themes.find((t) => String(t.id) === prefer);
    const label = row?.label?.trim();
    return label && label.length > 0 ? label : null;
  });

  themes: ThemeAdminDto[] = [];
  loading = true;
  loadError = '';
  saving = false;
  isGenerating = false;

  /** Génération IA parcours + questions pour le thème sélectionné (panneau de droite). */
  public generatingBulkParcoursQuestions = false;

  constructor() {
    /* Suivre les changements de discipline pour rafraîchir la liste si la sélection
     * change depuis la barre transverse pendant que l'admin est ouvert.
     * Le `ngOnInit()` initial déclenche déjà un premier `refresh()` ; on ignore donc
     * le tout premier appel de l'effet pour éviter un double chargement. */
    let firstRun = true;
    effect(() => {
      this.disciplineService.selectedDisciplineId();
      if (firstRun) {
        firstRun = false;
        return;
      }
      this.refresh();
    });
  }

  ngOnInit() {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.inactiveThemeVisibility.setInactiveThemesCount(0);
  }

  /** Recharge la liste des thèmes. */
  refresh(): void {
    this.loading = true;
    this.loadError = '';
    this.api
      .getAllThemesAdmin(this.disciplineService.selectedDisciplineId())
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (data) => {
          this.taglineTruncated = {};
          const list = Array.isArray(data) ? data : [];
          this.themes = list;
          this.updateInactiveThemesCount();
          this.pruneBulkAiSelection(list);
        },
        error: (err) => {
          this.loadError = httpErrorMessage(err, this.translate);
          this.themes = [];
          this.bulkAiSelectedThemeId = null;
          this.inactiveThemeVisibility.setInactiveThemesCount(0);
          this.expandedThemeKeys.clear();
          this.lastOpenedThemeKey = null;
          this.expansionRevision.update((n) => n + 1);
        }
      });
  }

  private pruneBulkAiSelection(list: ThemeAdminDto[]): void {
    if (this.bulkAiSelectedThemeId == null) return;
    if (!list.some((t) => String(t.id) === this.bulkAiSelectedThemeId)) {
      this.bulkAiSelectedThemeId = null;
    }
  }

  /** Valeur stable pour `mat-option` / suivi dans les listes. */
  trackThemeId(theme: ThemeAdminDto): string {
    return String(theme.id);
  }

  bulkAiSelectedTheme(): ThemeAdminDto | null {
    if (this.bulkAiSelectedThemeId == null) return null;
    return this.themes.find((t) => String(t.id) === this.bulkAiSelectedThemeId) ?? null;
  }

  subThemesOf(theme: ThemeAdminDto): SubThemeAdminDto[] {
    return theme.subThemes ?? [];
  }

  visibleThemes(): ThemeAdminDto[] {
    if (this.inactiveThemeVisibility.showInactiveThemes()) return this.themes;
    return this.themes.filter((theme) => this.subThemesOf(theme).length > 0);
  }

  private updateInactiveThemesCount(): void {
    const count = this.themes.reduce(
      (acc, theme) => acc + (this.subThemesOf(theme).length === 0 ? 1 : 0),
      0
    );
    this.inactiveThemeVisibility.setInactiveThemesCount(count);
  }

  onThemePanelOpened(theme: ThemeAdminDto): void {
    const key = String(theme.id);
    this.expandedThemeKeys.add(key);
    this.lastOpenedThemeKey = key;
    this.expansionRevision.update((n) => n + 1);
  }

  onThemePanelClosed(theme: ThemeAdminDto): void {
    const key = String(theme.id);
    this.expandedThemeKeys.delete(key);
    if (this.lastOpenedThemeKey === key) {
      const remaining = [...this.expandedThemeKeys];
      this.lastOpenedThemeKey = remaining.length ? remaining[remaining.length - 1] : null;
    }
    this.expansionRevision.update((n) => n + 1);
  }

  themeKey(theme: ThemeAdminDto): string {
    return String(theme.id);
  }

  /** Infobulle du sous-titre uniquement si le texte est réellement tronqué (ellipsis). */
  isTaglineTooltipEnabled(theme: ThemeAdminDto): boolean {
    if (!theme.tagline) return false;
    return this.taglineTruncated[this.themeKey(theme)] === true;
  }

  onTaglineSubtitleMouseEnter(event: Event, theme: ThemeAdminDto): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || !theme.tagline) return;
    const key = this.themeKey(theme);
    const truncated = el.scrollWidth > el.clientWidth + 1;
    this.taglineTruncated = { ...this.taglineTruncated, [key]: truncated };
    this.cdr.markForCheck();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.taglineTruncated = {};
    this.cdr.markForCheck();
  }

  openCreateTheme() {
    const disciplineId$ =
      this.disciplineService.selectedDisciplineId() != null
        ? of(this.disciplineService.selectedDisciplineId()!)
        : this.dialog
            .open(ThemeDisciplinePickDialogComponent, {
              width: '440px',
              maxWidth: '92vw',
              panelClass: 'app-theme-discipline-pick-dialog'
            })
            .afterClosed()
            .pipe(filter((id): id is number => typeof id === 'number'));

    disciplineId$.subscribe((idDiscipline) => {
      const ref = this.dialog.open(ThemeEditDialogComponent, {
        data: { mode: 'create' as const }
      });
      ref.afterClosed().subscribe((payload) => {
        if (!payload) return;
        this.saving = true;
        this.api
          .createTheme({
            ...payload,
            id_discipline: idDiscipline
          })
          .pipe(finalize(() => (this.saving = false)))
          .subscribe({
            next: () => {
              this.snack.open(this.translate.instant('adminThemes.snackThemeCreated'), this.translate.instant('common.ok'), {
                duration: 3500
              });
              this.refresh();
            },
            error: (err) =>
              this.snack.open(httpErrorMessage(err, this.translate), this.translate.instant('common.close'), {
                duration: 6000
              })
          });
      });
    });
  }

  openEditTheme(theme: ThemeAdminDto) {
    const ref = this.dialog.open(ThemeEditDialogComponent, {
      data: { mode: 'edit' as const, theme }
    });
    ref.afterClosed().subscribe((payload) => {
      if (!payload) return;
      this.saving = true;
      this.api
        .updateTheme(theme.id, payload)
        .pipe(finalize(() => (this.saving = false)))
        .subscribe({
          next: () => {
            this.snack.open(this.translate.instant('adminThemes.snackThemeUpdated'), this.translate.instant('common.ok'), {
              duration: 3500
            });
            this.refresh();
          },
          error: (err) =>
            this.snack.open(httpErrorMessage(err, this.translate), this.translate.instant('common.close'), {
              duration: 6000
            })
        });
    });
  }

  confirmDeleteTheme(theme: ThemeAdminDto) {
    const subs = this.subThemesOf(theme).length;
    const data: ConfirmDeleteDialogData = {
      title: this.translate.instant('adminThemes.confirmDeleteThemeTitle'),
      message:
        subs > 0
          ? this.translate.instant('adminThemes.confirmDeleteThemeMsgSubs', {
              label: theme.label,
              subs
            })
          : this.translate.instant('adminThemes.confirmDeleteThemeMsgSimple', { label: theme.label })
    };
    this.dialog
      .open(ConfirmDeleteDialogComponent, { data })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.saving = true;
        this.api
          .deleteTheme(theme.id)
          .pipe(finalize(() => (this.saving = false)))
          .subscribe({
            next: () => {
              this.snack.open(this.translate.instant('adminThemes.snackThemeDeleted'), this.translate.instant('common.ok'), {
                duration: 3500
              });
              this.refresh();
            },
            error: (err) =>
              this.snack.open(httpErrorMessage(err, this.translate), this.translate.instant('common.close'), {
                duration: 6000
              })
          });
      });
  }

  openCreateSubTheme(theme: ThemeAdminDto) {
    const ref = this.dialog.open(SubThemeEditDialogComponent, {
      data: { mode: 'create' as const, themeLabel: theme.label }
    });
    ref.afterClosed().subscribe((payload) => {
      if (!payload) return;
      this.saving = true;
      this.api
        .createSubTheme(theme.id, payload)
        .pipe(finalize(() => (this.saving = false)))
        .subscribe({
          next: () => {
            this.snack.open(this.translate.instant('adminThemes.snackPathCreated'), this.translate.instant('common.ok'), {
              duration: 3500
            });
            this.refresh();
          },
          error: (err) =>
            this.snack.open(httpErrorMessage(err, this.translate), this.translate.instant('common.close'), {
              duration: 6000
            })
        });
    });
  }

  openEditSubTheme(theme: ThemeAdminDto, sub: SubThemeAdminDto) {
    const ref = this.dialog.open(SubThemeEditDialogComponent, {
      data: { mode: 'edit' as const, themeLabel: theme.label, subTheme: sub }
    });
    ref.afterClosed().subscribe((payload) => {
      if (!payload) return;
      this.saving = true;
      this.api
        .updateSubTheme(sub.id, payload)
        .pipe(finalize(() => (this.saving = false)))
        .subscribe({
          next: () => {
            this.snack.open(this.translate.instant('adminThemes.snackPathUpdated'), this.translate.instant('common.ok'), {
              duration: 3500
            });
            this.refresh();
          },
          error: (err) =>
            this.snack.open(httpErrorMessage(err, this.translate), this.translate.instant('common.close'), {
              duration: 6000
            })
        });
    });
  }

  generateParcoursAndQuestionsFromBulkTheme(): void {
    const theme = this.bulkAiSelectedTheme();
    if (!theme) {
      this.snack.open(
        this.translate.instant('adminThemes.snackBulkAiNoTheme'),
        this.translate.instant('common.ok'),
        { duration: 4500 }
      );
      return;
    }
    const label = (theme.label ?? '').trim();
    if (!label) {
      this.snack.open(
        this.translate.instant('adminThemes.snackBulkAiEmptyLabel'),
        this.translate.instant('common.ok'),
        { duration: 4500 }
      );
      return;
    }
    const description = (theme.description ?? '').trim();
    const existing_domaines = this.subThemesOf(theme).map((sub) => ({
      label: (sub.label ?? '').trim(),
      ...(sub.description?.trim() ? { description: sub.description.trim() } : {})
    })).filter((d) => d.label.length > 0);
    const payload: GenerateParcoursQuestionsFromThemePayload = {
      id_theme: theme.id,
      label,
      ...(description.length > 0 ? { description } : {}),
      ...(existing_domaines.length > 0 ? { existing_domaines } : {})
    };

    this.isGenerating = true;
    this.api
      .generateParcoursAndQuestionsFromTheme(payload)
      .pipe(
        finalize(() => {
          this.isGenerating = false;
          this.refresh();
        })
      )
      .subscribe({
        next: () =>
          this.snack.open(
            this.translate.instant('adminThemes.snackBulkAiSent'),
            this.translate.instant('common.ok'),
            { duration: 4000 }
          ),
        error: (err) =>
          this.snack.open(httpErrorMessage(err, this.translate), this.translate.instant('common.close'), {
            duration: 6000
          })
      });
  }

  confirmDeleteSubTheme(theme: ThemeAdminDto, sub: SubThemeAdminDto) {
    const data: ConfirmDeleteDialogData = {
      title: this.translate.instant('adminThemes.confirmDeletePathTitle'),
      message: this.translate.instant('adminThemes.confirmDeletePathMsg', {
        sub: sub.label,
        theme: theme.label
      })
    };
    this.dialog
      .open(ConfirmDeleteDialogComponent, { data })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.saving = true;
        this.api
          .deleteSubTheme(sub.id)
          .pipe(finalize(() => (this.saving = false)))
          .subscribe({
            next: () => {
              this.snack.open(this.translate.instant('adminThemes.snackPathDeleted'), this.translate.instant('common.ok'), {
                duration: 3500
              });
              this.refresh();
            },
            error: (err) =>
              this.snack.open(httpErrorMessage(err, this.translate), this.translate.instant('common.close'), {
                duration: 6000
              })
          });
      });
  }
}
