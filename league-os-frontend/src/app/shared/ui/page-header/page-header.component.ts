import {Component, input, output} from '@angular/core';

@Component({
  selector: 'app-page-header',
  imports: [],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss'
})
export class PageHeaderComponent {
    readonly title = input.required<string>();
    readonly description = input<string>();
    readonly back = output<void>();

    onBackClick(): void {
        this.back.emit();
    }
}
