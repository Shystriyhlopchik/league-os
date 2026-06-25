import { Component, input } from '@angular/core';
import { MatchScoreboardVm } from '../../model/match-scoreboard.vm';
import {DatePipe} from '@angular/common';

@Component({
    selector: 'app-match-scoreboard',
    imports: [DatePipe],
    templateUrl: './match-scoreboard.component.html',
    styleUrl: './match-scoreboard.component.scss',
})
export class MatchScoreboardComponent {
    readonly match = input.required<MatchScoreboardVm>();

    getTeamName(teamName: string, shortName?: string | null): string {
        return shortName || teamName;
    }

    getScoreText(): string {
        const match = this.match();

        if (
            match.homeScore === null ||
            match.homeScore === undefined ||
            match.awayScore === null ||
            match.awayScore === undefined
        ) {
            return '-:-';
        }

        return `${match.homeScore}:${match.awayScore}`;
    }

    getHeaderText(): string {
        const match = this.match();

        return [match.seasonName, match.round].filter(Boolean).join(', ');
    }
}
