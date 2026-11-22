import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { StudentQueryDto } from './dto/student-query.dto';
import { StudentService } from './student.service';

@ApiTags('Users')
@ApiBearerAuth()
@Roles('lecturer')
@Controller('students')
export class StudentController {
    constructor(private readonly students: StudentService) {}

    @Get()
    search(@CurrentUser() user: AuthUser, @Query() q: StudentQueryDto) {
        return this.students.search(q, user.id);
    }
}
