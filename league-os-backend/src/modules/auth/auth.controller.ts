import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ConfirmPlayerLinkDto } from './dto/confirm-player-link.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    me(@Req() req: any) {
        return this.authService.me(req.user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Post('player-link/confirm')
    confirmPlayerLink(
        @Req() req: any,
        @Body() dto: ConfirmPlayerLinkDto,
    ) {
        return this.authService.confirmPlayerLink(req.user.id, dto);
    }
}
