import {
    Body,
    Controller,
    Get,
    HttpCode,
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
import { ConsultationService } from './consultation.service';
import { AcceptProposalDto } from './dto/accept-proposal.dto';
import { CancelConsultationDto } from './dto/cancel-consultation.dto';
import { CompleteConsultationDto } from './dto/complete-consultation.dto';
import { ConsultationQueryDto } from './dto/consultation-query.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { LogbookQueryDto } from './dto/logbook-query.dto';
import { MyConsultationQueryDto } from './dto/my-consultation-query.dto';
import { ProposeTimeDto } from './dto/propose-time.dto';
import { RejectConsultationDto } from './dto/reject-consultation.dto';
import { RescheduleConsultationDto } from './dto/reschedule-consultation.dto';
import { ScheduleConsultationDto } from './dto/schedule-consultation.dto';
import {
    ApiDataResponse,
    ApiErrors,
    ApiPageResponse,
} from '../../shared/http/api-docs';
import { ConsultationResponseDto } from './dto/consultation-response.dto';

const ID = new ParseUUIDPipe();

@ApiTags('Consultations')
@ApiBearerAuth()
@ApiErrors('UNAUTHORIZED')
@Controller()
export class ConsultationController {
    constructor(private readonly consultations: ConsultationService) {}

    // -- GET /consultations -> my consultation calendar
    @Get('consultations')
    @ApiPageResponse(ConsultationResponseDto)
    @ApiErrors('VALIDATION')
    listMine(
        @CurrentUser() user: AuthUser,
        @Query() q: MyConsultationQueryDto,
    ) {
        return this.consultations.listMine(user, q);
    }

    // -- GET /projects/:projectId/consultations -> consultations of a project
    @Get('projects/:projectId/consultations')
    @ApiPageResponse(ConsultationResponseDto)
    @ApiErrors('VALIDATION', 'PROJECT_NOT_FOUND')
    listForProject(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ID) projectId: string,
        @Query() q: ConsultationQueryDto,
    ) {
        return this.consultations.listForProject(projectId, user, q);
    }

    // -- POST /projects/:projectId/consultations -> student request a consultation date
    @Roles('student')
    @Post('projects/:projectId/consultations')
    @ApiDataResponse(ConsultationResponseDto, 201)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'PROJECT_NOT_FOUND',
        'DATE_NOT_AVAILABLE',
        'CONSULTATION_PENDING_EXISTS',
    )
    create(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ID) projectId: string,
        @Body() dto: CreateConsultationDto,
    ) {
        return this.consultations.create(projectId, user, dto);
    }

    // -- POST /projects/:projectId/consultations/schedule -> lecturer schedules directly
    @Roles('lecturer')
    @Post('projects/:projectId/consultations/schedule')
    @ApiDataResponse(ConsultationResponseDto, 201)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'PROJECT_NOT_FOUND',
        'STUDENT_NOT_MEMBER',
        'INVALID_TIME_RANGE',
        'OUTSIDE_BOOKING_WINDOW',
        'DATE_BLACKLISTED',
        'CONSULTATION_OVERLAP',
    )
    schedule(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ID) projectId: string,
        @Body() dto: ScheduleConsultationDto,
    ) {
        return this.consultations.schedule(projectId, user, dto);
    }

    // -- GET /consultations/:id -> consultation detail
    @Get('consultations/:id')
    @ApiDataResponse(ConsultationResponseDto)
    @ApiErrors('VALIDATION', 'CONSULTATION_NOT_FOUND')
    get(@CurrentUser() user: AuthUser, @Param('id', ID) id: string) {
        return this.consultations.get(id, user);
    }

    // -- POST /consultations/:id/propose -> propose a time
    @Post('consultations/:id/propose')
    @HttpCode(200)
    @ApiDataResponse(ConsultationResponseDto)
    @ApiErrors(
        'VALIDATION',
        'CONSULTATION_NOT_FOUND',
        'NOT_CONSULTATION_OWNER',
        'FIELD_NOT_ALLOWED',
        'INVALID_TRANSITION',
        'CONSULTATION_EXPIRED',
        'NOT_YOUR_TURN',
        'LOCATION_REQUIRED',
        'INVALID_TIME_RANGE',
        'OUTSIDE_BOOKING_WINDOW',
        'DATE_BLACKLISTED',
        'CONSULTATION_OVERLAP',
    )
    propose(
        @CurrentUser() user: AuthUser,
        @Param('id', ID) id: string,
        @Body() dto: ProposeTimeDto,
    ) {
        return this.consultations.propose(id, user, dto);
    }

    // -- POST /consultations/:id/accept -> accept the other party's time
    @Post('consultations/:id/accept')
    @HttpCode(200)
    @ApiDataResponse(ConsultationResponseDto)
    @ApiErrors(
        'VALIDATION',
        'CONSULTATION_NOT_FOUND',
        'NOT_CONSULTATION_OWNER',
        'FIELD_NOT_ALLOWED',
        'INVALID_TRANSITION',
        'CONSULTATION_EXPIRED',
        'NOT_YOUR_TURN',
        'NO_PROPOSAL',
        'PROPOSAL_EXPIRED',
        'LOCATION_REQUIRED',
        'CONSULTATION_OVERLAP',
    )
    accept(
        @CurrentUser() user: AuthUser,
        @Param('id', ID) id: string,
        @Body() dto: AcceptProposalDto,
    ) {
        return this.consultations.accept(id, user, dto);
    }

    // -- POST /consultations/:id/reject -> reject a request
    @Roles('lecturer')
    @Post('consultations/:id/reject')
    @HttpCode(200)
    @ApiDataResponse(ConsultationResponseDto)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'CONSULTATION_NOT_FOUND',
        'INVALID_TRANSITION',
        'CONSULTATION_EXPIRED',
        'NOT_YOUR_TURN',
    )
    reject(
        @CurrentUser() user: AuthUser,
        @Param('id', ID) id: string,
        @Body() dto: RejectConsultationDto,
    ) {
        return this.consultations.reject(id, user, dto);
    }

    // -- POST /consultations/:id/reschedule -> new time for an approved consultation
    @Roles('lecturer')
    @Post('consultations/:id/reschedule')
    @HttpCode(200)
    @ApiDataResponse(ConsultationResponseDto)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'CONSULTATION_NOT_FOUND',
        'INVALID_TRANSITION',
        'INVALID_TIME_RANGE',
        'OUTSIDE_BOOKING_WINDOW',
        'DATE_BLACKLISTED',
        'CONSULTATION_OVERLAP',
    )
    reschedule(
        @CurrentUser() user: AuthUser,
        @Param('id', ID) id: string,
        @Body() dto: RescheduleConsultationDto,
    ) {
        return this.consultations.reschedule(id, user, dto);
    }

    // -- POST /consultations/:id/cancel -> cancel
    @Post('consultations/:id/cancel')
    @HttpCode(200)
    @ApiDataResponse(ConsultationResponseDto)
    @ApiErrors(
        'VALIDATION',
        'CONSULTATION_NOT_FOUND',
        'NOT_CONSULTATION_OWNER',
        'INVALID_TRANSITION',
        'CONSULTATION_EXPIRED',
        'CONSULTATION_STARTED',
    )
    cancel(
        @CurrentUser() user: AuthUser,
        @Param('id', ID) id: string,
        @Body() dto: CancelConsultationDto,
    ) {
        return this.consultations.cancel(id, user, dto);
    }

    // -- POST /consultations/:id/complete -> mark completed with a logbook summary
    @Roles('lecturer')
    @Post('consultations/:id/complete')
    @HttpCode(200)
    @ApiDataResponse(ConsultationResponseDto)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'CONSULTATION_NOT_FOUND',
        'INVALID_TRANSITION',
        'CONSULTATION_NOT_STARTED',
    )
    complete(
        @CurrentUser() user: AuthUser,
        @Param('id', ID) id: string,
        @Body() dto: CompleteConsultationDto,
    ) {
        return this.consultations.complete(id, user, dto);
    }

    // -- GET /projects/:projectId/logbook -> completed consultations
    @Get('projects/:projectId/logbook')
    @ApiPageResponse(ConsultationResponseDto)
    @ApiErrors('VALIDATION', 'PROJECT_NOT_FOUND')
    logbook(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ID) projectId: string,
        @Query() q: LogbookQueryDto,
    ) {
        return this.consultations.logbook(projectId, user, q);
    }
}
