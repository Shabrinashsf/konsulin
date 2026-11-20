import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StudentQueryDto } from './dto/student-query.dto';
import { StudentService } from './student.service';

// TODO(auth): @Roles('lecturer') saat JwtAuthGuard & RolesGuard sudah ada.
// TODO(project): query `eligibleForProjectId` (BR-17 + belum anggota).
@ApiTags('Users')
@Controller('students')
export class StudentController {
    constructor(private readonly students: StudentService) {}

    @Get()
    search(@Query() q: StudentQueryDto) {
        return this.students.search(q);
    }
}
