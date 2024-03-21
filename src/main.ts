import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as helmet from 'helmet';
import { AppModule } from './app.module';
// import { HttpExceptionFilter } from './shared/filters/http-exception.filter';

import {
  ConfigurationService,
  HttpExceptionFilter,
  MongoExceptionFilter,
  SnakeCaseInterceptor,
} from '@shafiqrathore/logeld-tenantbackend-common-future';

import configureSwagger from './swaggerConfigurations';

// import { SnakeCaseInterceptor } from './shared/interceptors/snake-case.interceptor';
import * as requestIp from 'request-ip';
import { Transport } from '@nestjs/microservices';
import { CustomInterceptor } from 'utils/customInterceptor';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get<ConfigurationService>(ConfigurationService);

  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      port: configService.get('MICROSERVICE_PORT'),
    },
  });
  await app.startAllMicroservices();
  const logger = new Logger('Main');
  const globalPrefix = '/api';

  app.enableCors();
  app.use(helmet.referrerPolicy({ policy: 'same-origin' }));
  app.use(requestIp.mw());

  // Build the swagger doc only in dev mode
  configureSwagger(app, logger);

  app.setGlobalPrefix(globalPrefix);

  // Validate query params and body
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Convert exceptions to JSON readable format
  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalFilters(new MongoExceptionFilter());

  // Convert all JSON object keys to snake_case
  app.useGlobalInterceptors(new SnakeCaseInterceptor());
  app.use(CustomInterceptor);
  await app.listen(AppModule.port);

  // Log current url of app
  let baseUrl = app.getHttpServer().address().address;
  if (baseUrl === '0.0.0.0' || baseUrl === '::') {
    baseUrl = 'localhost';
  }

  logger.log(`Listening to http://${baseUrl}:${AppModule.port}${globalPrefix}`);
}
bootstrap();
