import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { trim } from '../../../shared/http/transforms';

export class AddressItemDto {
    // the version that fixes the item
    @IsUUID()
    versionId: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    note?: string;
}
