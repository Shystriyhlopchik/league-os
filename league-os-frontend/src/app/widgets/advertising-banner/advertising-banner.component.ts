import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-advertising-banner',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './advertising-banner.component.html',
    styleUrl: './advertising-banner.component.scss',
})
export class AdvertisingBannerComponent {}
