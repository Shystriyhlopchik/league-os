import {Injectable} from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class TokenStorage {
    private readonly key = 'access_token';

    getAccessToken(): string | null {
        return localStorage.getItem(this.key);
    }

    setAccessToken(token: string): void {
        localStorage.setItem(this.key, token);
    }

    clear(): void {
        localStorage.removeItem(this.key);
    }
}
