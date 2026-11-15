import { computed, inject, Injectable, signal } from '@angular/core';
import { TokenStorage } from '../../../shared/lib/storage/token-storage';
import { User } from './user.types';
import { AuthResponse } from './auth.types';
import { AuthApi } from '../api/auth.api';
import { finalize } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class SessionStore {
    private readonly tokenStorage = inject(TokenStorage);
    private readonly authApi = inject(AuthApi);

    readonly user = signal<User | null>(null);
    readonly isLoading = signal(false);
    readonly isInitialized = signal(false);

    readonly isAuthenticated = computed(() => {
        return Boolean(this.user());
    });

    readonly roles = computed(() => {
        return this.user()?.roles ?? [];
    });

    readonly canManageCommunityTournaments = computed(
        () =>
            this.hasRole('super_admin') ||
            (this.user()?.communities ?? []).some(
                (c) => c.role === 'owner' || c.role === 'admin',
            ),
    );

    readonly canManageCommunityVideos = computed(() =>
        this.hasRole('super_admin') ||
        (this.user()?.communities ?? []).some(c => c.role === 'owner' || c.role === 'admin'),
    );

    readonly canManageCommunityNews = computed(() => this.canManageCommunityTournaments());

    updateUser(user: User): void {
        this.user.set(user);
        try {
            localStorage.setItem('offline_match_identity', JSON.stringify({ token: this.tokenStorage.getAccessToken(), user }));
        } catch { /* The protocol journal reports persistent storage failures separately. */ }
    }

    init(): void {
        const token = this.tokenStorage.getAccessToken();

        if (!token) {
            this.isInitialized.set(true);
            return;
        }

        this.isLoading.set(true);

        this.authApi
            .me()
            .pipe(
                finalize(() => {
                    this.isLoading.set(false);
                    this.isInitialized.set(true);
                }),
            )
            .subscribe({
                next: (user) => {
                    this.updateUser(user);
                },
                error: (error) => {
                    if ([0, 502, 503, 504].includes(error?.status)) {
                        try {
                            const cached = JSON.parse(localStorage.getItem('offline_match_identity') ?? 'null');
                            if (cached?.token === token && cached.user?.id) {
                                this.user.set(cached.user);
                                return; // Only a local identity; the API still checks JWT and current permissions.
                            }
                        } catch { /* Missing/corrupt cache must never invent a user. */ }
                    }
                    this.logout();
                },
            });
    }

    setAuth(response: AuthResponse): void {
        this.tokenStorage.setAccessToken(response.accessToken);
        this.updateUser(response.user);
        this.isInitialized.set(true);
    }

    logout(): void {
        this.tokenStorage.clear();
        localStorage.removeItem('offline_match_identity');
        this.user.set(null);
        this.isInitialized.set(true);
    }

    hasRole(role: string): boolean {
        return this.roles().includes(role as never);
    }

    hasAnyRole(...roles: string[]): boolean {
        return roles.some((role) => this.hasRole(role));
    }
}
