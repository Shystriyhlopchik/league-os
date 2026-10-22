import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type CommunityRole = 'owner' | 'admin' | 'member';
export interface Community {
    id: number;
    name: string;
    slug: string;
    role: CommunityRole | null;
    canManageMembers: boolean;
    canManageTournaments: boolean;
}
export interface CommunityUser {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    isActive: boolean;
    role?: CommunityRole;
}
export interface CommunityAudit {
    id: number;
    createdAt: string;
    actorUserId: number | null;
    targetUserId: number;
    previousRole: string | null;
    newRole: string | null;
    source: string;
}
export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
}
export interface CommunityContext {
    community: { id: number; name: string };
    competitions: {
        id: number;
        name: string;
        seasons: { id: number; name: string; year?: number }[];
    }[];
    tournaments: {
        id: number;
        name: string;
        seasonId: number;
        lifecycleStatus?: string;
    }[];
}

@Injectable({ providedIn: 'root' })
export class CommunityApi {
    private readonly http = inject(HttpClient);
    private readonly base = `${environment.apiUrl}/communities`;
    list() {
        return this.http.get<Community[]>(this.base);
    }
    create(payload: { name: string; slug: string; ownerUserId: number }) {
        return this.http.post<{ id: number }>(this.base, payload);
    }
    members(id: number, search = '', page = 1, role = '') {
        return this.http.get<Page<CommunityUser>>(
            `${this.base}/${id}/members`,
            { params: { search, page, ...(role ? { role } : {}) } },
        );
    }
    candidates(id: number, search: string) {
        return this.http.get<CommunityUser[]>(
            `${this.base}/${id}/user-search`,
            { params: { search } },
        );
    }
    setRole(id: number, userId: number, role: CommunityRole) {
        return this.http.patch(`${this.base}/${id}/members/${userId}`, {
            role,
        });
    }
    remove(id: number, userId: number) {
        return this.http.delete(`${this.base}/${id}/members/${userId}`);
    }
    history(id: number, page = 1) {
        return this.http.get<Page<CommunityAudit>>(`${this.base}/${id}/audit`, {
            params: { page },
        });
    }
    context(id: number) {
        return this.http.get<CommunityContext>(`${this.base}/${id}/context`);
    }
    competition(id: number, payload: { name: string; slug: string }) {
        return this.http.post(`${this.base}/${id}/competitions`, payload);
    }
    season(
        id: number,
        payload: {
            competitionId: number;
            name: string;
            slug: string;
            year: number;
        },
    ) {
        return this.http.post(`${this.base}/${id}/seasons`, payload);
    }
}
