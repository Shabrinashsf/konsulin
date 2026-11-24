import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { MailService } from './mail.service';

const config = (env: Partial<Env>) =>
    ({ get: (key: keyof Env) => env[key] }) as unknown as ConfigService<
        Env,
        true
    >;
const mail = { to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' };

describe('MailService', () => {
    afterEach(() => jest.restoreAllMocks());

    it('only logs without SMTP credentials', async () => {
        const debug = jest
            .spyOn(Logger.prototype, 'debug')
            .mockImplementation(() => undefined);
        await new MailService(config({})).send(mail);
        expect(debug).toHaveBeenCalledWith(
            'not sent (no SMTP): a@example.com Hi',
        );
    });

    it('sends from MAIL_FROM and swallows SMTP failures', async () => {
        const service = new MailService(
            config({
                SMTP_HOST: 'smtp.example.com',
                SMTP_PORT: 465,
                SMTP_USER: 'bot@example.com',
                SMTP_PASS: 'secret',
                MAIL_FROM: 'Konsulin <bot@example.com>',
            }),
        );
        const transport = Reflect.get(service, 'transport') as {
            sendMail: (m: object) => Promise<unknown>;
        };
        const sendMail = jest
            .spyOn(transport, 'sendMail')
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce(new Error('smtp down'));
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);

        await service.send(mail);
        expect(sendMail).toHaveBeenCalledWith({
            from: 'Konsulin <bot@example.com>',
            ...mail,
        });
        await expect(service.send(mail)).resolves.toBeUndefined();
        expect(error).toHaveBeenCalled();
    });
});
