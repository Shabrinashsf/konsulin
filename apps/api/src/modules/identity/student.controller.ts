import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { StudentQueryDto } from './dto/student-query.dto';
import { StudentService } from './student.service';
import { ApiErrors, ApiPageResponse } from '../../shared/http/api-docs';
import { StudentResponseDto } from './dto/identity-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Roles('lecturer')
@Controller('students')
export class StudentController {
    constructor(private readonly students: StudentService) {}

    // -- GET /students -> list student on system
    @Get()
    @ApiPageResponse(StudentResponseDto)
    @ApiErrors('VALIDATION', 'UNAUTHORIZED', 'ROLE', 'PROJECT_NOT_FOUND')
    search(@CurrentUser() user: AuthUser, @Query() q: StudentQueryDto) {
        return this.students.search(q, user.id);
    }
}
