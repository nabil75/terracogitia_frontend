import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../api/api.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {

  private apiService = inject(ApiService);
  themes: any;

  constructor(private router: Router) {}
  
  ngOnInit(): void {
    this.apiService.getAllThemes().subscribe((data:any) => {
      this.themes = data;
    });
  }

  expandedThemeId: string | null = null;
  
  toggleTheme(themeId: string) {
    this.expandedThemeId = this.expandedThemeId === themeId ? null : themeId;
  }

  selectSubTheme(theme: any, subTheme: any) {
    // Navigation vers la page de training avec la sous-catégorie choisie
    this.router.navigate(['/training'], {
      queryParams: {
        theme: theme.id,
        subTheme: subTheme.id,
        themeLabel: theme.label,
        subThemeLabel: subTheme.label
      }
    });
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
}


