import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trim } from '../../../shared/http/transforms';

// trimmed, non-empty text up to `max` characters
export const Text = (max: number) =>
    applyDecorators(Transform(trim), IsString(), IsNotEmpty(), MaxLength(max));
