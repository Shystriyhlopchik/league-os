import { Component } from '@angular/core';
import {NewsPreviewComponent} from '../../widgets/news-preview/ui/news-preview/news-preview.component';

@Component({
    selector: 'app-news-page',
    imports: [NewsPreviewComponent],
    templateUrl: './news-page.component.html',
    styleUrl: './news-page.component.scss',
})
export class NewsPageComponent {}
