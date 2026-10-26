import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PublicVideo {
    id: number;
    title: string;
    coverUrl: string | null;
    embedUrl: string;
    publishedAt: string | null;
    tournamentId: number | null;
    matchId: number | null;
}
export interface Video extends PublicVideo {
    communityId: number;
    status: 'draft' | 'published';
    showOnHome: boolean;
    sortOrder: number;
}
export interface VideoPayload {
    title: string;
    source: string;
    coverUrl: string | null;
    status: 'draft' | 'published';
    showOnHome: boolean;
    sortOrder: number;
    tournamentId: number | null;
    matchId: number | null;
}
export interface PublicVideoPage {
    items: PublicVideo[];
    total: number;
    page: number;
    limit: number;
}
export interface VideoPage extends PublicVideoPage {
    items: Video[];
    homeCount: number;
}
export interface VideoOptions {
    tournaments: { id: number; name: string }[];
    matches: { id: number; label: string }[];
}

@Injectable({ providedIn: 'root' })
export class VideoApi {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiUrl;
    featured() {
        return this.http.get<PublicVideo[]>(`${this.base}/videos`);
    }
    catalog(page = 1) {
        return this.http.get<PublicVideoPage>(`${this.base}/videos/catalog`, {
            params: { page, limit: 12 },
        });
    }
    list(communityId: number, page = 1) {
        return this.http.get<VideoPage>(this.admin(communityId), {
            params: { page, limit: 20 },
        });
    }
    options(communityId: number, tournamentId?: number | null) {
        return this.http.get<VideoOptions>(
            `${this.admin(communityId)}/options`,
            {
                params: tournamentId ? { tournamentId } : {},
            },
        );
    }
    save(communityId: number, id: number | null, payload: VideoPayload) {
        return id
            ? this.http.put<Video>(`${this.admin(communityId)}/${id}`, payload)
            : this.http.post<Video>(this.admin(communityId), payload);
    }
    archive(communityId: number, id: number) {
        return this.http.delete(`${this.admin(communityId)}/${id}`);
    }
    upload(communityId: number, file: File) {
        const body = new FormData();
        body.append('cover', file);
        return this.http.post<{ url: string }>(
            `${this.admin(communityId)}/cover`,
            body,
        );
    }
    private admin(id: number) {
        return `${this.base}/communities/${id}/videos`;
    }
}
