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

const ID = new ParseUUIDPipe();

@ApiTags('Consultations')
@ApiBearerAuth()
@Controller()
export class ConsultationController {
    constructor(private readonly consultations: ConsultationService) {}

    // -- GET /consultations -> my consultation calendar
    @Get('consultations')
    listMine(
        @CurrentUser() user: AuthUser,
        @Query() q: MyConsultationQueryDto,
    ) {
        return this.consultations.listMine(user, q);
    }

    // -- GET /projects/:projectId/consultations -> consultations of a project
    @Get('projects/:projectId/consultations')
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
    schedule(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ID) projectId: string,
        @Body() dto: ScheduleConsultationDto,
    ) {
        return this.consultations.schedule(projectId, user, dto);
    }

    // -- GET /consultations/:id -> consultation detail
    @Get('consultations/:id')
    get(@CurrentUser() user: AuthUser, @Param('id', ID) id: string) {
        return this.consultations.get(id, user);
    }

    // -- POST /consultations/:id/propose -> propose a time
    @Post('consultations/:id/propose')
    @HttpCode(200)
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
    complete(
        @CurrentUser() user: AuthUser,
        @Param('id', ID) id: string,
        @Body() dto: CompleteConsultationDto,
    ) {
        return this.consultations.complete(id, user, dto);
    }

    // -- GET /projects/:projectId/logbook -> completed consultations
    @Get('projects/:projectId/logbook')
    logbook(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ID) projectId: string,
        @Query() q: LogbookQueryDto,
    ) {
        return this.consultations.logbook(projectId, user, q);
    }
}
