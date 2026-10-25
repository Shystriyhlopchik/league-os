import { Component, computed, input, signal } from '@angular/core';
import { NewsCardVm } from '../../model/news-card.vm';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

@Component({
    selector: 'app-news-card',
    imports: [RouterLink, DatePipe],
    templateUrl: './news-card.component.html',
    styleUrl: './news-card.component.scss',
})
export class NewsCardComponent {
    readonly news = input.required<NewsCardVm>();
    readonly variant = input<'large' | 'small'>('small');
    readonly failedImage = signal<string | null>(null);
    readonly hasImage = computed(
        () =>
            !!this.news().imageUrl &&
            this.failedImage() !== this.news().imageUrl,
    );
}
