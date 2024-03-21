import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

import { INestApplication } from '@nestjs/common';

const configure = (app: INestApplication, logger: Logger) => {
  const globalPrefix = '/api';

  // Build the swagger doc only in dev mode
  if (AppModule.isDev) {
    const swaggerOptions = new DocumentBuilder()
      .setTitle('logELD APIs')
      .setDescription('Documentation for all the APIs')
      .setVersion('1.0.0.0')
      //   .addTag('logEld APIs')
      .setBasePath(globalPrefix)
      .addServer(globalPrefix)
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const swaggerDoc = SwaggerModule.createDocument(app, swaggerOptions);

    SwaggerModule.setup(`${globalPrefix}/swagger`, app, swaggerDoc, {
      // lets hide schemas for now
      swaggerOptions: { defaultModelsExpandDepth: -1 },
    });

    // Log current url of app
    let baseUrl = app.getHttpServer()?.address()?.address;
    if (baseUrl === '0.0.0.0' || baseUrl === '::') {
      baseUrl = 'localhost';
    }

    logger.log(
      `Swagger UI: http://${baseUrl}:${AppModule.port}${globalPrefix}/swagger`,
    );
  }
};

export default configure;
