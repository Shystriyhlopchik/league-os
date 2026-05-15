import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) {}

    async register(dto: RegisterDto) {
        const existingUser = await this.usersService.findByEmail(dto.email);

        if (existingUser) {
            throw new ConflictException('Пользователь с таким email уже существует');
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);

        const user = await this.usersService.create({
            email: dto.email,
            username: dto.username,
            firstName: dto.firstName,
            lastName: dto.lastName,
            middleName: dto.middleName,
            passwordHash,
        });

        return this.buildAuthResponse(user);
    }

    async login(dto: LoginDto) {
        const user = await this.usersService.findByEmail(dto.email);

        if (!user) {
            throw new UnauthorizedException('Неверный email или пароль');
        }

        const isPasswordValid = await bcrypt.compare(
            dto.password,
            user.passwordHash,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException('Неверный email или пароль');
        }

        return this.buildAuthResponse(user);
    }

    private buildAuthResponse(user: any) {
        const payload = {
            sub: user.id,
            email: user.email,
            roles: user.roles?.map((role) => role.code) ?? [],
        };

        return {
            accessToken: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                middleName: user.middleName,
                roles: payload.roles,
            },
        };
    }
}