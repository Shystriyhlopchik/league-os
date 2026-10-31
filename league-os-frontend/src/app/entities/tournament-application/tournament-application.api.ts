import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
    CalendarImportPreview,
    CalendarImportRequest,
} from './calendar-import.types';

export interface RegistrationPolicy {
    version: 1;
    maxPlayers: number;
    minPlayers: number;
    maxRepresentatives: number;
    minMatchPlayers: number;
    maxMatchPlayers: number;
    allowAmendments: boolean;
    deadline: string | null;
}
export interface ManagedTeam {
    profileStatus?: string;
    communityId: number;
    communityName: string;
    teamId: number;
    name: string;
}
export interface RegistrationTournament {
    id: number;
    name: string;
    communityId: number;
    registrationStatus: string;
    canReview: boolean;
}
export interface ApplicationPlayer {
    playerId: number;
    teamPlayerId: number;
    name: string;
    shirtNumber?: number;
    isCaptain: boolean;
}
export interface ApplicationRevision {
    id: number;
    version: number;
    snapshot: {
        players: ApplicationPlayer[];
        representatives: { name: string }[];
    };
}
export interface TournamentApplication {
    id: number;
    teamId: number;
    status: string;
    currentRevisionId: number | null;
    approvedRevisionId: number | null;
    team: { name: string };
}
export interface ApplicationDetail {
    tournament: {
        id: number;
        name: string;
        registrationStatus: string;
        lifecycleStatus: string;
        registrationOpenedAt: string | null;
    };
    policy: RegistrationPolicy;
    application: TournamentApplication | null;
    revisions: ApplicationRevision[];
    events: {
        id: number;
        action: string;
        comment: string | null;
        createdAt: string;
        revisionId: number;
    }[];
    canReview: boolean;
    editing: {
        locked: boolean;
        locksAt: string | null;
        serverNow: string;
        canEdit: boolean;
        reason: string | null;
    };
}
export interface TournamentRegistrationSettings {
    tournament: ApplicationDetail['tournament'];
    policy: RegistrationPolicy;
    communityId: number;
    canReview: boolean;
    canManageMembers: boolean;
}
export interface SquadPlayer {
    id: number;
    playerId: number;
    shirtNumber?: number;
    isCaptain: boolean;
    player: {
        firstName: string;
        lastName: string;
        middleName?: string;
        birthDate?: string;
        position?: string;
    };
}
export interface PlayerCandidate {
    id: number;
    name: string;
    birthYear?: string;
    teamId: number | null;
    teamName: string | null;
}
export interface TransferRequest {
    id: number;
    shirtNumber: number;
    numberConflict?: { playerId: number; name: string } | null;
    player: SquadPlayer['player'];
    fromTeam?: { name: string };
    toTeam: { name: string };
}
export interface ManagedCalendar {
    stages: {
        id: number;
        type: string;
        name: string;
        configuration?: { legs?: number };
    }[];
    venues: { id: number; name: string }[];
    matches: {
        id: number;
        stageId?: number;
        groupId?: number;
        roundNumber?: number;
        homeTeamId?: number;
        awayTeamId?: number;
        home: string;
        away: string;
        round?: string;
        status: string;
        matchDatetime: string | null;
        venueId?: number;
    }[];
}

export interface ManualScheduleMatch {
    groupId: number;
    roundNumber: number;
    homeTeamId: number;
    awayTeamId: number;
}

@Injectable({ providedIn: 'root' })
export class TournamentApplicationApi {
    private readonly http = inject(HttpClient);
    private readonly base = `${environment.apiUrl}/registrations`;
    calendar(id: number) {
        return this.http.get<ManagedCalendar>(
            `${environment.apiUrl}/tournaments/${id}/calendar-management`,
        );
    }
    generateSchedule(id: number, stage: number, legs: number) {
        return this.http.post(
            `${environment.apiUrl}/tournaments/${id}/stages/${stage}/schedule/generate`,
            { legs },
        );
    }
    resetCalendar(id: number, stage: number) {
        return this.http.post(
            `${environment.apiUrl}/tournaments/${id}/stages/${stage}/schedule/reset`,
            { confirmation: 'RESET_GROUP_STAGE_SCHEDULE' },
        );
    }
    saveManualMatch(
        id: number,
        stage: number,
        body: ManualScheduleMatch,
        matchId?: number,
    ) {
        const url = `${environment.apiUrl}/tournaments/${id}/stages/${stage}/schedule/matches`;
        return matchId === undefined
            ? this.http.post(url, body)
            : this.http.patch(`${url}/${matchId}`, body);
    }
    removeManualMatch(id: number, stage: number, matchId: number) {
        return this.http.delete(
            `${environment.apiUrl}/tournaments/${id}/stages/${stage}/schedule/matches/${matchId}`,
        );
    }
    calendarTemplate(id: number, stage: number) {
        return this.http.get(
            `${environment.apiUrl}/tournaments/${id}/stages/${stage}/schedule/import/template`,
            { responseType: 'blob' },
        );
    }
    readCalendarImport(id: number, stage: number, file: File) {
        const body = new FormData();
        body.append('file', file);
        return this.http.post<CalendarImportPreview>(
            `${environment.apiUrl}/tournaments/${id}/stages/${stage}/schedule/import/read`,
            body,
        );
    }
    previewCalendarImport(
        id: number,
        stage: number,
        body: CalendarImportRequest,
    ) {
        return this.http.post<CalendarImportPreview>(
            `${environment.apiUrl}/tournaments/${id}/stages/${stage}/schedule/import/preview`,
            body,
        );
    }
    confirmCalendarImport(
        id: number,
        stage: number,
        body: CalendarImportRequest & {
            expectedVersion: string;
            confirmation?: string;
        },
    ) {
        return this.http.post<{
            createdMatches: number;
            skippedMatches: number;
            cancelledMatches: number;
        }>(
            `${environment.apiUrl}/tournaments/${id}/stages/${stage}/schedule/import/confirm`,
            body,
        );
    }
    schedule(
        id: number,
        matchId: number,
        matchDatetime: string,
        venueId: number,
    ) {
        return this.http.patch(
            `${environment.apiUrl}/tournaments/${id}/calendar-management/${matchId}`,
            { matchDatetime, venueId },
        );
    }
    workspace() {
        return this.http.get<{
            teams: ManagedTeam[];
            tournaments: RegistrationTournament[];
        }>(`${this.base}/workspace`);
    }
    settings(id: number) {
        return this.http.get<TournamentRegistrationSettings>(
            `${this.base}/tournaments/${id}`,
        );
    }
    detail(id: number, team: number) {
        return this.http.get<ApplicationDetail>(
            `${this.base}/tournaments/${id}/teams/${team}`,
        );
    }
    list(id: number) {
        return this.http.get<TournamentApplication[]>(
            `${this.base}/tournaments/${id}/applications`,
        );
    }
    policy(id: number, policy: RegistrationPolicy) {
        const { version: _, ...body } = policy;
        body.deadline = body.deadline?.trim() || null;
        return this.http.put(`${this.base}/tournaments/${id}/policy`, body);
    }
    registration(id: number, action: 'open' | 'close') {
        return this.http.post(`${this.base}/tournaments/${id}/${action}`, {});
    }
    save(
        id: number,
        team: number,
        playerIds: number[],
        representatives: { name: string }[],
        expectedRevisionId?: number,
    ) {
        return this.http.put<TournamentApplication>(
            `${this.base}/tournaments/${id}/teams/${team}`,
            {
                playerIds,
                representatives,
                ...(expectedRevisionId ? { expectedRevisionId } : {}),
            },
        );
    }
    submit(id: number, team: number, revisionId: number) {
        return this.http.post(
            `${this.base}/tournaments/${id}/teams/${team}/submit`,
            { revisionId },
        );
    }
    review(
        id: number,
        app: number,
        revisionId: number,
        decision: 'approve' | 'return',
        comment: string,
    ) {
        return this.http.post(
            `${this.base}/tournaments/${id}/applications/${app}/review`,
            { revisionId, decision, comment },
        );
    }
    roster(community: number, team: number) {
        return this.http.get<SquadPlayer[]>(
            `${this.base}/communities/${community}/teams/${team}/players`,
        );
    }
    search(community: number, team: number, q: string) {
        return this.http.get<PlayerCandidate[]>(
            `${this.base}/communities/${community}/teams/${team}/player-search`,
            { params: { q } },
        );
    }
    add(
        community: number,
        team: number,
        playerId: number,
        shirtNumber: number,
    ) {
        return this.http.post<{ transferRequested: boolean }>(
            `${this.base}/communities/${community}/teams/${team}/players`,
            { playerId, shirtNumber },
        );
    }
    remove(community: number, team: number, linkId: number) {
        return this.http.delete(
            `${this.base}/communities/${community}/teams/${team}/players/${linkId}`,
        );
    }
    transfers(community: number) {
        return this.http.get<TransferRequest[]>(
            `${this.base}/communities/${community}/transfers`,
        );
    }
    reviewTransfer(
        community: number,
        id: number,
        decision: 'approve' | 'reject',
        comment: string,
    ) {
        return this.http.post(
            `${this.base}/communities/${community}/transfers/${id}/review`,
            { decision, comment },
        );
    }
    setAdmin(id: number, userId: number) {
        return this.http.post(
            `${environment.apiUrl}/tournaments/${id}/members`,
            { userId, role: 'admin' },
        );
    }
    removeAdmin(id: number, userId: number) {
        return this.http.delete(
            `${environment.apiUrl}/tournaments/${id}/members/${userId}`,
        );
    }
    members(id: number) {
        return this.http.get<
            {
                userId: number;
                role: string;
                user: { username: string; firstName: string; lastName: string };
            }[]
        >(`${this.base}/tournaments/${id}/members`);
    }
    createPlayer(
        team: number,
        body: {
            firstName: string;
            lastName: string;
            middleName: string;
            birthDate: string;
            shirtNumber: number;
            isCaptain: boolean;
        },
    ) {
        return this.http.post(
            `${environment.apiUrl}/teams/${team}/players`,
            body,
        );
    }
    updatePlayer(
        team: number,
        link: number,
        body: { shirtNumber?: number; isCaptain?: boolean },
    ) {
        return this.http.patch(
            `${environment.apiUrl}/teams/${team}/players/${link}`,
            body,
        );
    }
}
