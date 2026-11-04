import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface PlayerIdentity {
    firstName: string;
    lastName: string;
    middleName: string | null;
    birthDate: string | null;
}
export interface EditablePlayer extends PlayerIdentity {
    id: number;
    identityVersion: number;
    photoUrl?: string | null;
}
export interface PlayerCorrection {
    id: number;
    playerId: number;
    communityId: number;
    teamId: number | null;
    requestedByUserId: number;
    createdAt: string;
    before: PlayerIdentity;
    after: PlayerIdentity;
    reason: string;
    status: 'submitted' | 'approved' | 'changes_requested';
    reviewedByUserId: number | null;
    reviewedAt: string | null;
    comment: string | null;
}
export interface PlayerProfile {
    player: EditablePlayer;
    pending: boolean;
    changes: PlayerCorrection[];
    audit: {
        id: number;
        createdAt: string;
        actorUserId: number;
        action: string;
        reason: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
    }[];
}
interface Page<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
}

@Injectable({ providedIn: 'root' })
export class PlayerProfilesApi {
    private readonly http = inject(HttpClient);
    private base(c: number) {
        return `${environment.apiUrl}/communities/${c}/player-profiles`;
    }
    profile(c: number, p: number, teamId?: number) {
        return this.http.get<PlayerProfile>(`${this.base(c)}/${p}`, {
            params: teamId ? { teamId } : {},
        });
    }
    submit(
        c: number,
        p: number,
        body: PlayerIdentity & {
            teamId?: number;
            expectedVersion: number;
            reason: string;
        },
    ) {
        return this.http.post<PlayerCorrection>(
            `${this.base(c)}/${p}/corrections`,
            body,
        );
    }
    photo(
        c: number,
        p: number,
        file: File,
        expectedPhotoUrl: string,
        teamId?: number,
    ) {
        const data = new FormData();
        data.append('photo', file);
        data.append('expectedPhotoUrl', expectedPhotoUrl);
        if (teamId) data.append('teamId', String(teamId));
        return this.http.post<{ photoUrl: string }>(
            `${this.base(c)}/${p}/photo`,
            data,
        );
    }
    requests(c: number, page = 1) {
        return this.http.get<Page<PlayerCorrection>>(
            `${this.base(c)}/corrections`,
            { params: { page } },
        );
    }
    review(
        c: number,
        id: number,
        body: {
            decision: 'approve' | 'return';
            comment?: string;
            eligibilityComment?: string;
            duplicateComment?: string;
        },
    ) {
        return this.http.post<PlayerCorrection>(
            `${this.base(c)}/corrections/${id}/review`,
            body,
        );
    }
    search(c: number, search = '', page = 1) {
        return this.http.get<Page<EditablePlayer>>(this.base(c), {
            params: { search, page },
        });
    }
}
