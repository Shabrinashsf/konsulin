import { IsIn } from 'class-validator';
import { REVIEW_DECISIONS, type ReviewDecision } from '../revision-state';

export class ReviewItemDto {
    @IsIn(REVIEW_DECISIONS)
    decision: ReviewDecision;
}
