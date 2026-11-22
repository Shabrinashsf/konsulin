import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { StudyProgramController } from './study-program.controller';
import { StudyProgramRepository } from './study-program.repository';
import { StudyProgramService } from './study-program.service';
import { UserRepository } from './user.repository';

@Module({
    imports: [ProjectModule],
    controllers: [AuthController, StudyProgramController, StudentController],
    providers: [
        UserRepository,
        RefreshTokenRepository,
        StudyProgramRepository,
        AuthService,
        StudyProgramService,
        StudentService,
    ],
})
export class IdentityModule {}
