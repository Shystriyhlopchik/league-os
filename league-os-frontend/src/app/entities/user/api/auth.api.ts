import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import { AuthResponse, LoginDto } from '../model/auth.types';
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

    me(): Observable<User> {
        return this.http.get<User>(`${this.apiUrl}/auth/me`);
    }
}
