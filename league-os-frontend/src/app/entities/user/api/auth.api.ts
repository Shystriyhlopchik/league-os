import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import {
    AuthMessageResponse,
    AuthResponse,
    ConfirmPlayerLinkDto,
    ForgotPasswordDto,
    LoginDto,
    RegisterDto,
    ResetPasswordDto,
} from '../model/auth.types';
import { User } from '../model/user.types';

@Injectable({
    providedIn: 'root',
})
export class AuthApi {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = environment.apiUrl;

    login(dto: LoginDto): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, dto);
    }

    register(dto: RegisterDto): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(
            `${this.apiUrl}/auth/register`,
            dto,
        );
    }

    forgotPassword(dto: ForgotPasswordDto): Observable<AuthMessageResponse> {
        return this.http.post<AuthMessageResponse>(
            `${this.apiUrl}/auth/password/forgot`,
            dto,
        );
    }

    resetPassword(dto: ResetPasswordDto): Observable<AuthMessageResponse> {
        return this.http.post<AuthMessageResponse>(
            `${this.apiUrl}/auth/password/reset`,
            dto,
        );
    }

    confirmPlayerLink(dto: ConfirmPlayerLinkDto): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(
            `${this.apiUrl}/auth/player-link/confirm`,
            dto,
        );
    }

    me(): Observable<User> {
        return this.http.get<User>(`${this.apiUrl}/auth/me`);
    }
}
