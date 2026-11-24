import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { NotificationListener } from './notification.listener';
import { NotificationRepository } from './notification.repository';

@Module({
    providers: [MailService, NotificationRepository, NotificationListener],
})
export class NotificationModule {}
