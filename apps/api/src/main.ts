import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(app.get(ConfigService).get('PORT') || 3000);
}
bootstrap();