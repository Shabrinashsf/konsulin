import { Transform } from 'class-transformer';
import {
    IsEmail,
    IsInt,
    IsString,
    IsUUID,
    Length,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateBy,
} from 'class-validator';
import { normalizeEmail, trim } from './transforms';
import { toJakartaDate } from '../../../shared/time/time';

export class RegisterDto {
    @Transform(trim) @IsString() @Length(3, 100) name: string;

    @Matches(/^\d{10}$/, { message: 'nrp harus 10 digit angka' })
    nrp: string;

    @Transform(normalizeEmail)
    @IsEmail()
    @MaxLength(255)
    email: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message:
            'password harus mengandung huruf besar, huruf kecil, dan angka',
    })
    password: string;

    @IsUUID()
    studyProgramId: string;

    @IsInt()
    @Min(2000)
    @ValidateBy({
        name: 'notAfterCurrentYear',
        validator: {
            validate: (v) =>
                typeof v === 'number' &&
                v <= Number(toJakartaDate(new Date()).slice(0, 4)),
            defaultMessage: () =>
                'cohortYear tidak boleh melebihi tahun berjalan',
        },
    })
    cohortYear: number;
}
