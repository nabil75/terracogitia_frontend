import { Component, Input } from '@angular/core';
import { MatProgressSpinner } from "@angular/material/progress-spinner";

@Component({
  selector: 'app-spinner',
  standalone: true,
  templateUrl: './spinner.component.html',
  styleUrls: ['./spinner.component.scss'],
  imports: [MatProgressSpinner]
})
export class SpinnerComponent {
  /**
   * Message affiché sous le spinner.
   * Peut être personnalisé par le composant parent :
   *   <app-spinner message="L'évaluation est en cours"></app-spinner>
   */
  @Input() message_spinner: string = 'Génération en cours...';
}
