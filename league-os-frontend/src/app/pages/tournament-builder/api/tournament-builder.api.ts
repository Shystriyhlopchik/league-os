import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
    TournamentRulesConfigV1,
    TournamentValidationResult,
} from '../model/tournament-builder.types';

export interface SavedTournament {
    id: number;
    lifecycleStatus: 'draft' | 'published' | 'in_progress' | 'completed';
    activeRuleVersionId?: number;
}

export interface SavedStage {
    id: number;
}

export interface SavedGroup {
    id: number;
}

export interface SavedRuleVersion {
    id: number;
    version: number;
    status: 'draft' | 'published' | 'superseded';
}

export interface TournamentBuilderSnapshot {
    tournament: {
        id: number;
        seasonId: number;
        name: string;
        slug: string;
        description?: string;
        type?: 'league' | 'cup' | 'friendly' | 'superCup';
        format?: 'round_robin' | 'knockout' | 'mixed' | 'final';
        startDate?: string;
        endDate?: string;
        colorPrimary?: string;
        colorSecondary?: string;
        logoUrl?: string;
        lifecycleStatus?: 'draft' | 'published' | 'in_progress' | 'completed';
        activeRuleVersionId?: number;
    };
    stages: Array<{
        id: number;
        key: string;
        name: string;
        type: 'round_robin' | 'group_stage' | 'knockout';
        order: number;
        startDate?: string;
        endDate?: string;
        configuration?: Record<string, unknown>;
        groups: Array<{
            id: number;
            key: string;
            name: string;
            order: number;
            capacity?: number;
        }>;
        participants: Array<{
            id: number;
            tournamentTeamId: number;
            groupId?: number;
            seedNumber?: number;
            tournamentTeam: {
                id: number;
                teamId: number;
                team?: {
                    id: number;
                    name: string;
                    shortName?: string | null;
                    logoUrl?: string | null;
                };
            };
        }>;
    }>;
    tournamentTeams: Array<{
        id: number;
        teamId: number;
        team?: {
            id: number;
            name: string;
            shortName?: string | null;
            logoUrl?: string | null;
        };
    }>;
    ruleVersions: Array<{
        id: number;
        version: number;
        status: 'draft' | 'published' | 'superseded';
        config: TournamentRulesConfigV1;
    }>;
}

@Injectable({ providedIn: 'root' })
export class TournamentBuilderApi {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = `${environment.apiUrl}/tournaments`;

    createTournament(payload: Record<string, unknown>): Observable<SavedTournament> {
        return this.http.post<SavedTournament>(this.baseUrl, payload);
    }

    loadBuilder(tournamentId: number): Observable<TournamentBuilderSnapshot> {
        return this.http.get<TournamentBuilderSnapshot>(
            `${this.baseUrl}/${tournamentId}/builder`,
        );
    }

    ensureTournamentTeam(
        tournamentId: number,
        teamId: number,
    ): Observable<{ id: number; teamId: number }> {
        return this.http.post<{ id: number; teamId: number }>(
            `${this.baseUrl}/${tournamentId}/teams`,
            { teamId },
        );
    }

    updateTournament(
        tournamentId: number,
        payload: Record<string, unknown>,
    ): Observable<SavedTournament> {
        return this.http.patch<SavedTournament>(
            `${this.baseUrl}/${tournamentId}`,
            payload,
        );
    }

    createStage(
        tournamentId: number,
        payload: Record<string, unknown>,
    ): Observable<SavedStage> {
        return this.http.post<SavedStage>(
            `${this.baseUrl}/${tournamentId}/stages`,
            payload,
        );
    }

    updateStage(
        tournamentId: number,
        stageId: number,
        payload: Record<string, unknown>,
    ): Observable<SavedStage> {
        return this.http.patch<SavedStage>(
            `${this.baseUrl}/${tournamentId}/stages/${stageId}`,
            payload,
        );
    }

    createGroup(
        tournamentId: number,
        stageId: number,
        payload: Record<string, unknown>,
    ): Observable<SavedGroup> {
        return this.http.post<SavedGroup>(
            `${this.baseUrl}/${tournamentId}/stages/${stageId}/groups`,
            payload,
        );
    }

    updateGroup(
        tournamentId: number,
        stageId: number,
        groupId: number,
        payload: Record<string, unknown>,
    ): Observable<SavedGroup> {
        return this.http.patch<SavedGroup>(
            `${this.baseUrl}/${tournamentId}/stages/${stageId}/groups/${groupId}`,
            payload,
        );
    }

    addStageParticipant(
        tournamentId: number,
        stageId: number,
        payload: Record<string, unknown>,
    ): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(
            `${this.baseUrl}/${tournamentId}/stages/${stageId}/participants`,
            payload,
        );
    }

    updateStageParticipant(
        tournamentId: number,
        stageId: number,
        participantId: number,
        payload: Record<string, unknown>,
    ): Observable<{ id: number }> {
        return this.http.patch<{ id: number }>(
            `${this.baseUrl}/${tournamentId}/stages/${stageId}/participants/${participantId}`,
            payload,
        );
    }

    removeStageParticipant(
        tournamentId: number,
        stageId: number,
        participantId: number,
    ): Observable<void> {
        return this.http.delete<void>(
            `${this.baseUrl}/${tournamentId}/stages/${stageId}/participants/${participantId}`,
        );
    }

    createRuleVersion(
        tournamentId: number,
        config: TournamentRulesConfigV1,
        changeSummary?: string,
    ): Observable<SavedRuleVersion> {
        return this.http.post<SavedRuleVersion>(
            `${this.baseUrl}/${tournamentId}/rule-versions`,
            {
                schemaVersion: 1,
                config,
                ...(changeSummary ? { changeSummary } : {}),
            },
        );
    }

    updateRuleVersion(
        tournamentId: number,
        ruleVersionId: number,
        config: TournamentRulesConfigV1,
        changeSummary?: string,
    ): Observable<SavedRuleVersion> {
        return this.http.patch<SavedRuleVersion>(
            `${this.baseUrl}/${tournamentId}/rule-versions/${ruleVersionId}`,
            {
                schemaVersion: 1,
                config,
                ...(changeSummary ? { changeSummary } : {}),
            },
        );
    }

    validate(
        tournamentId: number,
        config: TournamentRulesConfigV1,
    ): Observable<TournamentValidationResult> {
        return this.http.post<TournamentValidationResult>(
            `${this.baseUrl}/${tournamentId}/validate`,
            { config },
        );
    }

    publish(
        tournamentId: number,
        ruleVersionId: number,
    ): Observable<SavedTournament> {
        return this.http.post<SavedTournament>(
            `${this.baseUrl}/${tournamentId}/publish`,
            { ruleVersionId },
        );
    }

    previewGroupAssignments(
        tournamentId: number,
        stageId: number,
        payload: Record<string, unknown>,
    ): Observable<unknown> {
        return this.http.post(
            `${this.baseUrl}/${tournamentId}/stages/${stageId}/group-assignments/preview`,
            payload,
        );
    }

    previewSchedule(
        tournamentId: number,
        stageId: number,
        legs: number,
    ): Observable<unknown> {
        return this.http.post(
            `${this.baseUrl}/${tournamentId}/stages/${stageId}/schedule/preview`,
            { legs },
        );
    }
}
