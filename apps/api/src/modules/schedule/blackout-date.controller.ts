import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { BlackoutDateService } from './blackout-date.service';
import { BlackoutQueryDto } from './dto/blackout-query.dto';
import { BlackoutRangeQueryDto } from './dto/blackout-range-query.dto';
import { CreateBlackoutDateDto } from './dto/create-blackout-date.dto';
import {
    ApiDataResponse,
    ApiErrors,
    ApiPageResponse,
} from '../../shared/http/api-docs';
import {
    BlackoutCreatedResponseDto,
    BlackoutDeletedResponseDto,
    BlackoutResponseDto,
} from './dto/schedule-response.dto';

@ApiTags('Schedule')
@ApiBearerAuth()
@ApiErrors('UNAUTHORIZED')
@Roles('lecturer')
@Controller('me/blackout-dates')
export class BlackoutDateController {
    constructor(private readonly blackouts: BlackoutDateService) {}

    // -- GET /me/blackout-dates -> my blacklisted dates
    @Get()
    @ApiPageResponse(BlackoutResponseDto)
    @ApiErrors('VALIDATION', 'ROLE')
    list(@CurrentUser() user: AuthUser, @Query() q: BlackoutQueryDto) {
        return this.blackouts.list(user.id, q);
    }

    // -- POST /me/blackout-dates -> blacklist a date range
    @Post()
    @ApiDataResponse(BlackoutCreatedResponseDto, 201)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        [
            'INVALID_DATE_RANGE',
            'Rentang tanggal tidak valid (from ≤ to, maksimal 90 hari)',
        ],
        'DATE_IN_PAST',
        'BLACKOUT_HAS_CONSULTATION',
    )
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateBlackoutDateDto) {
        return this.blackouts.create(user.id, dto);
    }

    // -- DELETE /me/blackout-dates?from&to -> remove a range of blacklisted dates
    @Delete()
    @ApiDataResponse(BlackoutDeletedResponseDto)
    @ApiErrors('VALIDATION', 'ROLE', [
        'INVALID_DATE_RANGE',
        'Rentang tanggal tidak valid (from ≤ to, maksimal 90 hari)',
    ])
    removeRange(
        @CurrentUser() user: AuthUser,
        @Query() q: BlackoutRangeQueryDto,
    ) {
        return this.blackouts.removeRange(user.id, q);
    }

    // -- DELETE /me/blackout-dates/:id -> remove a blacklisted date --
    @Delete(':id')
    @ApiDataResponse(BlackoutResponseDto)
    @ApiErrors('VALIDATION', 'ROLE', 'BLACKOUT_NOT_FOUND')
    remove(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.blackouts.remove(user.id, id);
    }
}
