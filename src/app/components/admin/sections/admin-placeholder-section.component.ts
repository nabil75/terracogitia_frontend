import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { TranslateModule } from '@ngx-translate/core';

export type AdminPlaceholderKey = 'notation' | 'sources';

@Component({
  selector: 'app-admin-placeholder-section',
  standalone: true,
  imports: [CommonModule, MatCardModule, TranslateModule],
  templateUrl: './admin-placeholder-section.component.html',
  styleUrl: './admin-placeholder-section.component.scss'
})
export class AdminPlaceholderSectionComponent {
  private readonly route = inject(ActivatedRoute);

  get section(): AdminPlaceholderKey {
    const s = this.route.snapshot.data['adminSection'];
    return s === 'sources' ? 'sources' : 'notation';
  }
}
