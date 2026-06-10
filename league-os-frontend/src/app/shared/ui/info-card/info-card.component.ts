import {Component, input} from '@angular/core';

@Component({
  selector: 'app-info-card',
  imports: [],
  templateUrl: './info-card.component.html',
  styleUrl: './info-card.component.scss'
})
export class InfoCardComponent {
    readonly label = input<string>();
    readonly title = input.required<string>();
    readonly description = input<string>();
}
