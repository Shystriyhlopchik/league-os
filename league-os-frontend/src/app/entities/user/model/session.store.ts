import { computed, inject, Injectable, signal } from '@angular/core';
import { TokenStorage } from '../../../shared/lib/storage/token-storage';
import { User } from './user.types';
import { AuthResponse } from './auth.types';

@Injectable({
    providedIn: 'root',
})
export class SessionStore {
    private readonly tokenStorage = inject(TokenStorage);

    readonly user = signal<User | null>(null);

    readonly isAuthenticated = computed(() => {
        return Boolean(this.user());
    });

    setAuth(response: AuthResponse): void {
        this.tokenStorage.setAccessToken(response.accessToken);
        this.user.set(response.user);
    }

    logout(): void {
        this.tokenStorage.clear();
        this.user.set(null);
    }
}
