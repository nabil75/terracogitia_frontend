import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  ApiService,
  AuthErrorCode,
  AuthErrorDetail
} from '../../api/api.service';
import { TransverseRailComponent } from '../../shared/transverse-rail/transverse-rail.component';
import { ThemeService } from '../../shared/services/theme.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

type ViewMode = 'login' | 'register' | 'reset';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TransverseRailComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslateModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private translate = inject(TranslateService);
  readonly themeService = inject(ThemeService);

  mode: ViewMode = 'login';
  loading = false;
  hidePassword = true;
  hideNewPassword = true;
  hideRegisterPassword = true;

  /** Message d'erreur global (sous le formulaire). */
  errorMessage: string | null = null;
  /** Message de succès global (ex. mot de passe modifié). */
  successMessage: string | null = null;
  /** Champ incriminé pour mettre en évidence l'erreur (email / password). */
  errorField: 'email' | 'password' | null = null;

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(1)]]
  });

  resetForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  });

  registerForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  });

  ngOnInit(): void {
    // Retour d'un flux OAuth Microsoft en échec : ?auth_error=<raison>.
    const authError = this.route.snapshot.queryParamMap.get('auth_error');
    if (authError) {
      this.errorField = null;
      this.errorMessage = this.translate.instant('login.oauthError');
    }
  }

  /** Redirige (pleine page) vers le point d'entrée OAuth Microsoft du backend. */
  loginWithMicrosoft(): void {
    window.location.href = this.apiService.microsoftLoginUrl();
  }

  subtitleKey(): string {
    switch (this.mode) {
      case 'register':
        return 'login.subtitleRegister';
      case 'reset':
        return 'login.subtitleReset';
      default:
        return 'login.subtitleLogin';
    }
  }

  switchMode(next: ViewMode): void {
    this.mode = next;
    this.errorMessage = null;
    this.successMessage = null;
    this.errorField = null;
  }

  submitLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.clearFeedback();
    this.loading = true;

    const { email, password } = this.loginForm.value;
    this.apiService.login(email!, password!).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = this.translate.instant('login.loginSuccess');
        void this.router.navigate(['/home']);
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.handleAuthError(err);
      }
    });
  }

  submitReset(): void {
    const { newPassword, confirmPassword } = this.resetForm.value;
    if (newPassword !== confirmPassword) {
      this.resetForm.get('confirmPassword')?.setErrors({ mismatch: true });
    }
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.clearFeedback();
    this.loading = true;

    const email = this.resetForm.value.email!;
    this.apiService.resetPassword(email, newPassword!).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = this.translate.instant('login.resetSuccess');
        this.resetForm.reset();
        this.loginForm.patchValue({ email });
        this.mode = 'login';
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.handleAuthError(err);
      }
    });
  }

  submitRegister(): void {
    const { password, confirmPassword } = this.registerForm.value;
    if (password !== confirmPassword) {
      this.registerForm.get('confirmPassword')?.setErrors({ mismatch: true });
    }
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.clearFeedback();
    this.loading = true;

    const email = this.registerForm.value.email!;
    this.apiService.register(email, password!).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = this.translate.instant('login.registerSuccess');
        this.registerForm.reset();
        this.loginForm.patchValue({ email });
        this.mode = 'login';
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.handleAuthError(err);
      }
    });
  }

  private handleAuthError(err: HttpErrorResponse): void {
    const detail = this.extractDetail(err);
    const code: AuthErrorCode | null = detail?.code ?? null;

    switch (code) {
      case 'email_not_found':
        this.errorField = 'email';
        this.errorMessage =
          detail?.message ?? "Aucun compte n'est associé à cet email.";
        break;
      case 'invalid_password':
        this.errorField = 'password';
        this.errorMessage = detail?.message ?? 'Mot de passe incorrect.';
        break;
      case 'email_already_exists':
        this.errorField = 'email';
        this.errorMessage =
          detail?.message ?? 'Un compte existe déjà avec cet email.';
        break;
      default:
        this.errorField = null;
        this.errorMessage =
          detail?.message ??
          "Service indisponible. Vérifiez la connexion au serveur et réessayez.";
        break;
    }
  }

  private extractDetail(err: HttpErrorResponse): AuthErrorDetail | null {
    const raw = err?.error?.detail;
    if (raw && typeof raw === 'object' && 'code' in raw) {
      return raw as AuthErrorDetail;
    }
    return null;
  }

  private clearFeedback(): void {
    this.errorMessage = null;
    this.successMessage = null;
    this.errorField = null;
  }
}
