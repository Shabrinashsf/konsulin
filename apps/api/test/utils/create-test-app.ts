import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { setupApp, setupSwagger } from '../../src/setup-app';

/** Built a test application with the same global configuration as main.ts. */
export async function createTestApp(
    extraControllers: Type[] = [],
): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
        controllers: extraControllers,
    }).compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>();
    setupApp(app);
    setupSwagger(app);
    await app.init();
    return app;
}
