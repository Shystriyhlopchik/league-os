import { Component } from '@angular/core';
import { MatchesSliderComponent } from '../../widgets/matches-slide/matches-slider/matches-slider.component';
import {TeamsShowcaseComponent} from '../../widgets/teams-showcase/teams-showcase.component';

@Component({
    selector: 'app-home',
    imports: [MatchesSliderComponent, TeamsShowcaseComponent],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {}
