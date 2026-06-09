import { User } from './user.types';

export interface LoginDto {
    login: string;
    password: string;
}

export interface AuthResponse {
    accessToken: string;
    user: User;
}
