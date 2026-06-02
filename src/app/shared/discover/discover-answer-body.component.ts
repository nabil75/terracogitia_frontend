import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { DiscoverImageLink, isSafeDiscoverImageUrl, sanitizeDiscoverImageLinks } from './discover-image-links.util';

@Component({
  selector: 'app-discover-answer-body',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './discover-answer-body.component.html',
  styleUrl: './discover-answer-body.component.scss'
})
export class DiscoverAnswerBodyComponent {
  @Input() text = '';
  @Input() imageLinks: DiscoverImageLink[] = [];

  get safeImageLinks(): DiscoverImageLink[] {
    return sanitizeDiscoverImageLinks(this.imageLinks);
  }

  openImageLink(event: Event, link: DiscoverImageLink): void {
    event.preventDefault();
    event.stopPropagation();
    if (isSafeDiscoverImageUrl(link.url)) {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    }
  }
}
