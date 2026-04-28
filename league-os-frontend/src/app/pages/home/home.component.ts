import { Component } from '@angular/core';
import { MatchesSliderComponent } from '../../widgets/matches-slide/matches-slider/matches-slider.component';

@Component({
    selector: 'app-home',
    imports: [MatchesSliderComponent],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {}
