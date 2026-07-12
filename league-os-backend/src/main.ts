import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  if (process.env.NODE_ENV !== 'production') {
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
    });
  }

  app.enableCors({
    origin: [
      'http://localhost:4200',
      'http://localhost:8081',
      'https://arman-liga.ru',
      'https://www.arman-liga.ru',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
