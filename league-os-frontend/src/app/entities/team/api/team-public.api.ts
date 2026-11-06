import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Team } from '../model/team.types';
import { PublicVideo } from '../../video/video.api';

export interface TeamRosterPlayer {
    playerId: number;
    name: string;
    photoUrl: string | null;
    position: string | null;
    shirtNumber: number | null;
    isCaptain: boolean;
}
export interface TeamTournament {
    id: number;
    name: string;
    seasonId: number;
    seasonName: string;
    year: number | null;
    status: string;
    completed: boolean;
    place: number | null;
    result: string;
}
export interface ClubMatch {
    id: number;
    tournamentId: number;
    tournamentName: string;
    matchDatetime: string | null;
    round: string | null;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    winnerTeamId: number | null;
    venue: string | null;
    homeTeam: { id: number; name: string; logoUrl: string | null } | null;
    awayTeam: { id: number; name: string; logoUrl: string | null } | null;
}
export interface TeamOverview {
    team: Team;
    communityId: number;
    communities: { id: number; name: string }[];
    roster: TeamRosterPlayer[];
    tournaments: TeamTournament[];
    matches: ClubMatch[];
    videos: PublicVideo[];
}
export interface ClubPlayerStats {
    playerId: number;
    name: string;
    photoUrl: string | null;
    matches: number;
    goals: number;
    assists: number;
    yellowCards: number;
    secondYellowCards: number;
    redCards: number;
}
export interface ClubStatistics {
    communityId: number;
    totals: {
        matches: number;
        wins: number;
        draws: number;
        losses: number;
        goalsFor: number;
        goalsAgainst: number;
    };
    players: ClubPlayerStats[];
}
export interface ClubStatisticsFilters {
    seasonId?: number;
    year?: number;
    tournamentId?: number;
}
export interface ClubPlayerProfile {
    team: { id: number; name: string };
    communityId: number;
    player: {
        playerId: number;
        name: string;
        photoUrl: string | null;
        position: string | null;
        shirtNumber: number | null;
        isCurrent: boolean;
    };
    totals: Pick<
        ClubPlayerStats,
        | 'matches'
        | 'goals'
        | 'assists'
        | 'yellowCards'
        | 'secondYellowCards'
        | 'redCards'
    >;
    seasons: (ClubPlayerStats & {
        tournamentId: number;
        tournamentName: string;
        seasonName: string;
    })[];
}
export const playerPosition = (position: string | null): string =>
    ({
        goalkeeper: 'Вратарь',
        defender: 'Защитник',
        midfielder: 'Полузащитник',
        winger: 'Крайний игрок',
        forward: 'Нападающий',
    })[position || ''] || 'Позиция не указана';
export const clubImage = (url?: string | null, player = false): string =>
    url
        ? /^(https?:)?\/\//i.test(url) || url.startsWith('/')
            ? url
            : `/${url}`
        : player
          ? '/images/organization-team/not-photo.png'
          : '/images/teams/default-team-logo.png';

@Injectable({ providedIn: 'root' })
export class TeamPublicApi {
    private readonly http = inject(HttpClient);
    private readonly base = `${environment.apiUrl}/teams`;
    overview(teamId: number, communityId?: number) {
        return this.http.get<TeamOverview>(`${this.base}/${teamId}/overview`, {
            params: communityId ? { communityId } : {},
        });
    }
    statistics(
        teamId: number,
        communityId: number,
        filters: ClubStatisticsFilters,
    ) {
        return this.http.get<ClubStatistics>(
            `${this.base}/${teamId}/statistics`,
            { params: { communityId, ...filters } },
        );
    }
    player(teamId: number, playerId: number, communityId?: number) {
        return this.http.get<ClubPlayerProfile>(
            `${this.base}/${teamId}/players/${playerId}/profile`,
            { params: communityId ? { communityId } : {} },
        );
    }
}
