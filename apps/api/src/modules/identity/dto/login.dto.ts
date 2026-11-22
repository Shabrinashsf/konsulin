import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normalizeEmail } from '../../../shared/http/transforms';

export class LoginDto {
    @Transform(normalizeEmail)
    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}
