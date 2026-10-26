import { ChangeDetectionStrategy, Component } from '@angular/core';
import { VideosComponent } from '../../widgets/videos/videos.component';

@Component({
    selector: 'app-videos-page',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [VideosComponent],
    template: '<div class="videos-page"><app-videos [archive]="true" /></div>',
    styles: `
        :host {
            display: block;
        }
        .videos-page {
            max-width: 1440px;
            margin: 0 auto;
            padding: 48px 32px 0;
        }
        @media (max-width: 599px) {
            .videos-page {
                padding: 32px 20px 0;
            }
        }
    `,
})
export class VideosPageComponent {}
