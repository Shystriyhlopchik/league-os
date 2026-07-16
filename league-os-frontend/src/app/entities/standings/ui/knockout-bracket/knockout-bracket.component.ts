import { Component, computed, input } from '@angular/core';
import { PublicBracketMatch } from '../../model/public-tournament-view.model';

interface BracketRound {
    key: string;
    title: string;
    matches: PublicBracketMatch[];
}

@Component({
    selector: 'app-knockout-bracket',
    imports: [],
    templateUrl: './knockout-bracket.component.html',
    styleUrl: './knockout-bracket.component.scss',
})
export class KnockoutBracketComponent {
    readonly matches = input.required<PublicBracketMatch[]>();

    readonly rounds = computed<BracketRound[]>(() => {
        const order: PublicBracketMatch['roundType'][] = [
            'round_of_32',
            'round_of_16',
            'quarter_final',
            'semi_final',
            'third_place',
            'final',
        ];
        return order
            .map((roundType) => ({
                key: roundType,
                title: this.roundLabel(roundType),
                matches: this.matches()
                    .filter((match) => match.roundType === roundType)
                    .sort(
                        (left, right) =>
                            left.roundNumber - right.roundNumber ||
                            left.position.localeCompare(right.position),
                    ),
            }))
            .filter((round) => round.matches.length > 0);
    });

    teamName(match: PublicBracketMatch, side: 'home' | 'away'): string {
        return side === 'home'
            ? (match.homeTeam?.name ?? match.homeSourceLabel)
            : (match.awayTeam?.name ?? match.awaySourceLabel);
    }

    score(match: PublicBracketMatch, side: 'home' | 'away'): string {
        if (!match.regularTime) return '—';
        const regular =
            side === 'home' ? match.regularTime.home : match.regularTime.away;
        const extra =
            side === 'home' ? match.extraTime?.home : match.extraTime?.away;
        return String(extra == null ? regular : regular + extra);
    }

    isWinner(match: PublicBracketMatch, side: 'home' | 'away'): boolean {
        const team = side === 'home' ? match.homeTeam : match.awayTeam;
        return Boolean(team && match.winnerTeamId === team.id);
    }

    private roundLabel(roundType: PublicBracketMatch['roundType']): string {
        const labels: Partial<
            Record<PublicBracketMatch['roundType'], string>
        > = {
            round_of_32: '1/16 финала',
            round_of_16: '1/8 финала',
            quarter_final: 'Четвертьфинал',
            semi_final: 'Полуфинал',
            third_place: 'Матч за 3-е место',
            final: 'Финал',
        };
        return labels[roundType] ?? 'Раунд';
    }
}
