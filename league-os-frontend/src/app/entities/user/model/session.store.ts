import { computed, inject, Injectable, signal } from '@angular/core';
import { TokenStorage } from '../../../shared/lib/storage/token-storage';
import { User } from './user.types';
import { AuthResponse } from './auth.types';
import { AuthApi } from '../api/auth.api';
import {finalize} from 'rxjs';

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
                    this.user.set(user);
                },
                error: () => {
                    this.logout();
                },
            });
    }

    setAuth(response: AuthResponse): void {
        this.tokenStorage.setAccessToken(response.accessToken);
        this.user.set(response.user);
        this.isInitialized.set(true);
    }

    logout(): void {
        this.tokenStorage.clear();
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
