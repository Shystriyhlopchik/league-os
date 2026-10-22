import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ManagedTeam } from '../../tournament-application/tournament-application.api';

export interface TeamProfile {
    id: number;
    name: string;
    shortName?: string | null;
    description?: string | null;
    city?: string | null;
    village?: string | null;
    foundedYear?: number | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    logoUrl?: string | null;
    profileStatus: 'draft' | 'published';
    profileVersion: number;
}
export interface TeamProfileView {
    team: TeamProfile;
    communityId: number;
    canManageAccess: boolean;
}
export interface TeamProfileForm {
    name: string;
    shortName: string;
    description: string;
    city: string;
    village: string;
    foundedYear: number | null;
    primaryColor: string;
    secondaryColor: string;
}
export interface TeamWorkspace {
    teams: ManagedTeam[];
    defaultCommunity: { id: number; name: string };
    reviewCommunities: { id: number; name: string }[];
    requests: {
        id: number;
        teamId: number;
        teamName: string;
        status: string;
        comment?: string;
        reason: string;
    }[];
}
export interface TeamManager {
    userId: number;
    username: string;
    name: string;
    role: 'owner' | 'manager';
    isActive: boolean;
}
export interface TeamManagement {
    managers: TeamManager[];
    audit: {
        id: number;
        action: string;
        actorUserId: number | null;
        targetUserId: number | null;
        comment: string | null;
        createdAt: string;
    }[];
}
export interface TeamAccessRequest {
    id: number;
    teamId: number;
    teamName: string;
    userId: number;
    username: string;
    name: string;
    reason: string;
}

@Injectable({ providedIn: 'root' })
export class TeamWorkspaceApi {
    private readonly http = inject(HttpClient);
    private readonly base = `${environment.apiUrl}/team-workspace`;
    private teamUrl(c: number, t: number) {
        return `${this.base}/communities/${c}/teams/${t}`;
    }
    workspace() {
        return this.http.get<TeamWorkspace>(this.base);
    }
    create(profile: TeamProfileForm) {
        return this.http.post<TeamProfileView>(`${this.base}/teams`, profile);
    }
    profile(c: number, t: number) {
        return this.http.get<TeamProfileView>(this.teamUrl(c, t));
    }
    update(
        c: number,
        t: number,
        profile: TeamProfileForm,
        expectedVersion: number,
    ) {
        return this.http.patch<TeamProfileView>(this.teamUrl(c, t), {
            ...profile,
            expectedVersion,
        });
    }
    publish(c: number, t: number, expectedVersion: number) {
        return this.http.post<TeamProfileView>(
            `${this.teamUrl(c, t)}/publish`,
            { expectedVersion },
        );
    }
    logo(c: number, t: number, file: File, expectedVersion: number) {
        const data = new FormData();
        data.append('logo', file);
        data.append('expectedVersion', String(expectedVersion));
        return this.http.post<TeamProfileView>(
            `${this.teamUrl(c, t)}/logo`,
            data,
        );
    }
    search(q: string) {
        return this.http.get<
            { id: number; name: string; city?: string; village?: string }[]
        >(`${this.base}/search`, { params: { q } });
    }
    requestAccess(teamId: number, reason: string) {
        return this.http.post(`${this.base}/access-requests`, {
            teamId,
            reason,
        });
    }
    requests(c: number) {
        return this.http.get<TeamAccessRequest[]>(
            `${this.base}/communities/${c}/access-requests`,
        );
    }
    review(
        c: number,
        id: number,
        decision: 'approve' | 'reject',
        comment: string,
    ) {
        return this.http.post(
            `${this.base}/communities/${c}/access-requests/${id}/review`,
            { decision, comment },
        );
    }
    managers(c: number, t: number) {
        return this.http.get<TeamManagement>(`${this.teamUrl(c, t)}/managers`);
    }
    setManager(
        c: number,
        t: number,
        username: string,
        role: 'owner' | 'manager',
    ) {
        return this.http.post(`${this.teamUrl(c, t)}/managers`, {
            username,
            role,
        });
    }
    removeManager(c: number, t: number, userId: number) {
        return this.http.delete(`${this.teamUrl(c, t)}/managers/${userId}`);
    }
}
