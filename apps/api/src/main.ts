import 'dotenv/config';
import 'reflect-metadata';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

function assertEnv() {
  const missing = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')}. Copy apps/api/.env.example to apps/api/.env.`,
    );
  }
}

async function bootstrap() {
  assertEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useStaticAssets(path.join(__dirname, '..', 'public'));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API listening on ${port}`, 'Bootstrap');
}

void bootstrap();
