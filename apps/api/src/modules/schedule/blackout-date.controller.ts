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

@ApiTags('Schedule')
@ApiBearerAuth()
@Roles('lecturer')
@Controller('me/blackout-dates')
export class BlackoutDateController {
    constructor(private readonly blackouts: BlackoutDateService) {}

    // -- GET /me/blackout-dates -> my blacklisted dates
    @Get()
    list(@CurrentUser() user: AuthUser, @Query() q: BlackoutQueryDto) {
        return this.blackouts.list(user.id, q);
    }

    // -- POST /me/blackout-dates -> blacklist a date range
    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateBlackoutDateDto) {
        return this.blackouts.create(user.id, dto);
    }

    // -- DELETE /me/blackout-dates?from&to -> remove a range of blacklisted dates
    @Delete()
    removeRange(
        @CurrentUser() user: AuthUser,
        @Query() q: BlackoutRangeQueryDto,
    ) {
        return this.blackouts.removeRange(user.id, q);
    }

    // -- DELETE /me/blackout-dates/:id -> remove a blacklisted date --
    @Delete(':id')
    remove(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.blackouts.remove(user.id, id);
    }
}
