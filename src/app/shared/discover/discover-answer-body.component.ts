import { Component, Input, OnChanges, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { formatDiscoverProseHtml } from './discover-prose-format.util';

@Component({
  selector: 'app-discover-answer-body',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './discover-answer-body.component.html',
  styleUrl: './discover-answer-body.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DiscoverAnswerBodyComponent implements OnChanges {
  private readonly sanitizer = inject(DomSanitizer);

  @Input() text = '';

  formattedHtml: SafeHtml | null = null;

  ngOnChanges(): void {
    const html = formatDiscoverProseHtml(this.text);
    this.formattedHtml = html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  }
}
