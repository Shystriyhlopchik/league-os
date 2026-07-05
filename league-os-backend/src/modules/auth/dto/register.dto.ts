import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
    @IsOptional()
    @IsEmail()
    email?: string;

    @IsString()
    @MinLength(3)
    username: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsString()
    @IsNotEmpty()
    firstName: string;

    @IsString()
    @IsNotEmpty()
    lastName: string;

    @IsOptional()
    @IsString()
    middleName?: string;
}
