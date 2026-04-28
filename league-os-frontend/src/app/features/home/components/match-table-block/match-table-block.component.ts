import { Component } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { DatePipe, NgStyle } from '@angular/common';
import { MatDivider } from '@angular/material/divider';
import {
    MatCell,
    MatCellDef,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatRow,
    MatRowDef,
    MatTable,
} from '@angular/material/table';

export interface TeamStanding {
    team: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    goalsForAgainst: string; // формат «З-П»
    points: number;
}

@Component({
    selector: 'app-match-table-block',
    imports: [
        MatCard,
        MatCardContent,
        DatePipe,
        NgStyle,
        MatDivider,
        MatTable,
        MatHeaderCell,
        MatCell,
        MatRow,
        MatHeaderRow,
        MatHeaderCellDef,
        MatCellDef,
        MatHeaderRowDef,
        MatRowDef,
        MatColumnDef,
    ],
    templateUrl: './match-table-block.component.html',
    styleUrl: './match-table-block.component.scss',
})
export class MatchTableBlockComponent {
    upcoming = {
        homeTeam: 'Шоркино',
        awayTeam: 'Сятра',
        homeColor: '#118C4E', // зелёный (пример)
        awayColor: '#00C6D5', // бирюзовый (пример)
        matchDate: new Date(2025, 5, 14, 20, 0), // 14 июня 2025, 20:00
        stadium: 'трёхэтажка',
        expectedTemp: 20, // °C
    };

    // Данные для турнирной таблицы (пример)
    displayedColumns: string[] = [
        'team',
        'games',
        'wins',
        'losses',
        'draws',
        'goalsForAgainst',
        'points',
    ];
    dataSource: TeamStanding[] = [
        {
            team: 'Сятра',
            games: 12,
            wins: 8,
            losses: 2,
            draws: 2,
            goalsForAgainst: '24-10',
            points: 26,
        },
        {
            team: 'Шоркино',
            games: 12,
            wins: 7,
            losses: 3,
            draws: 2,
            goalsForAgainst: '20-11',
            points: 23,
        },
        {
            team: 'Побои',
            games: 12,
            wins: 6,
            losses: 4,
            draws: 2,
            goalsForAgainst: '18-15',
            points: 20,
        },
        {
            team: 'Сарбакы',
            games: 12,
            wins: 4,
            losses: 5,
            draws: 3,
            goalsForAgainst: '15-17',
            points: 15,
        },
    ];
}
