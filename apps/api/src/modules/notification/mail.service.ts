import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.schema';

export interface Mail {
    to: string;
    subject: string;
    html: string;
    icalEvent?: {
        method: 'REQUEST' | 'CANCEL';
        filename: string;
        content: string;
    };
}

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly from: string;
    private readonly transport?: Transporter;

    constructor(config: ConfigService<Env, true>) {
        const user = config.get('SMTP_USER', { infer: true });
        this.from =
            config.get('MAIL_FROM', { infer: true }) ?? `Konsulin <${user}>`;
        // without SMTP credentials (development, tests) mail is only logged
        if (user) {
            const port = config.get('SMTP_PORT', { infer: true });
            this.transport = createTransport({
                host: config.get('SMTP_HOST', { infer: true }),
                port,
                secure: port === 465,
                auth: { user, pass: config.get('SMTP_PASS', { infer: true }) },
            });
        }
    }

    // never throws: a failed email must not fail the request
    async send(mail: Mail) {
        if (!this.transport) {
            this.logger.debug(`not sent (no SMTP): ${mail.to} ${mail.subject}`);
            return;
        }
        try {
            await this.transport.sendMail({ from: this.from, ...mail });
        } catch (e) {
            this.logger.error(
                `failed to send "${mail.subject}" to ${mail.to}`,
                e instanceof Error ? e.stack : String(e),
            );
        }
    }
}
