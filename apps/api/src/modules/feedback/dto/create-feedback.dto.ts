import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import { Text } from '../../../shared/http/validators';

export class RevisionItemInput {
    @Text(1000)
    description: string;
}

export class CreateFeedbackDto {
    @Text(10000)
    content: string;

    // checklist
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => RevisionItemInput)
    revisionItems?: RevisionItemInput[];
}
