import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../shared/auth/auth.decorators';
import { StudyProgramQueryDto } from './dto/study-program-query.dto';
import { StudyProgramService } from './study-program.service';
import { ApiDataResponse, ApiErrors } from '../../shared/http/api-docs';
import { StudyProgramDto } from '../../shared/http/common-response.dto';

@ApiTags('Master Data')
@Public()
@Controller('study-programs')
export class StudyProgramController {
    constructor(private readonly studyPrograms: StudyProgramService) {}

    // -- GET /study-programs -> list of available study program
    @Get()
    @ApiDataResponse([StudyProgramDto])
    @ApiErrors('VALIDATION')
    list(@Query() q: StudyProgramQueryDto) {
        return this.studyPrograms.list(q);
    }
}
