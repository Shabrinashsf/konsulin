import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StudyProgramQueryDto } from './dto/study-program-query.dto';
import { StudyProgramService } from './study-program.service';

@ApiTags('Master Data')
@Controller('study-programs')
export class StudyProgramController {
    constructor(private readonly studyPrograms: StudyProgramService) {}

    @Get()
    list(@Query() q: StudyProgramQueryDto) {
        return this.studyPrograms.list(q);
    }
}
