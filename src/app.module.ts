import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './app.service';
import {
  ConfigurationService,
  SharedModule,
} from '@shafiqrathore/logeld-tenantbackend-common-future';
// import { RefreshTokenSchema } from './mongoDb/schema/refreshToken.schema';
import { AuthController } from './app.controller';

import { ConfigService } from '@nestjs/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import {
  RefreshTokenModule,
  RefreshTokenSchema,
} from '@shafiqrathore/logeld-tenantbackend-common-future';

export const getMongoModule = () => {
  return MongooseModule.forRootAsync({
    useFactory: async (configService: ConfigurationService) => ({
      uri: configService.mongoUri,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }),
    inject: [ConfigurationService],
  });
};
@Module({
  imports: [SharedModule, getMongoModule(), RefreshTokenModule],
  controllers: [AuthController],
  providers: [
 
ConfigurationService,ConfigService,
    AuthService,
    {
      provide: 'USERS_SERVICE',
      useFactory: (config: ConfigurationService) => {
        const port: number = Number(config.get('USERS_MICROSERVICE_PORT'));
        const host = config.get('USERS_MICROSERVICE_HOST');

        return ClientProxyFactory.create({
          transport: Transport.TCP,
          options: {
            port,
            host,
          },
        });
      },
      inject: [ConfigurationService],
    },
    {
      provide: 'HOS_SERVICE',
      useFactory: (config: ConfigurationService) => {
        const port: number = Number(config.get('HOS_MICROSERVICE_PORT'));
        const host = config.get('HOS_MICROSERVICE_HOST');

        return ClientProxyFactory.create({
          transport: Transport.TCP,
          options: {
            port,
            host,
          },
        });
      },
      inject: [ConfigurationService],
    },
    {
      provide: 'DRIVER_SERVICE',
      useFactory: (config: ConfigurationService) => {
        const port: number = Number(config.get('DRIVER_MICROSERVICE_PORT'));
        const host = config.get('DRIVER_MICROSERVICE_HOST');

        return ClientProxyFactory.create({
          transport: Transport.TCP,
          options: {
            port,
            host,
          },
        });
      },
      inject: [ConfigurationService],
    },
    {
      provide: 'COMPANY_SERVICE',
      useFactory: (config: ConfigurationService) => {
        const port: number = Number(config.get('COMPANY_MICROSERVICE_PORT'));
        const host = config.get('COMPANY_MICROSERVICE_HOST');

        return ClientProxyFactory.create({
          transport: Transport.TCP,
          options: {
            port,
            host,
          },
        });
      },
      inject: [ConfigurationService],
    },
    {
      provide: 'VEHICLE_SERVICE',
      useFactory: (config: ConfigurationService) => {
        const port: number = Number(config.get('VEHICLE_MICROSERVICE_PORT'));
        const host = config.get('VEHICLE_MICROSERVICE_HOST');

        return ClientProxyFactory.create({
          transport: Transport.TCP,
          options: {
            port,
            host,
          },
        });
      },
      inject: [ConfigurationService],
    },
    {
      provide: 'UNIT_SERVICE',
      useFactory: (config: ConfigurationService) => {
        const port: number = Number(config.get('UNIT_MICROSERVICE_PORT'));
        const host = config.get('UNIT_MICROSERVICE_HOST');

        return ClientProxyFactory.create({
          transport: Transport.TCP,
          options: {
            port,
            host,
          },
        });
      },
      inject: [ConfigurationService],
    },
    {
      provide: 'DEVICE_SERVICE',
      useFactory: (config: ConfigurationService) => {
        const port: number = Number(config.get('DEVICE_MICROSERVICE_PORT'));
        const host = config.get('DEVICE_MICROSERVICE_HOST');

        return ClientProxyFactory.create({
          transport: Transport.TCP,
          options: {
            port,
            host,
          },
        });
      },
      inject: [ConfigurationService],
    },
  ],
})
export class AppModule {
  static port: number | string;
  static isDev: boolean;

  constructor(private readonly _configurationService: ConfigurationService) {
    AppModule.port = AppModule.normalizePort(_configurationService.port);
    AppModule.isDev = _configurationService.isDevelopment;
  }

  /**
   * Normalize port or return an error if port is not valid
   * @param val The port to normalize
   */
  private static normalizePort(val: number | string): number | string {
    const port: number = typeof val === 'string' ? parseInt(val, 10) : val;

    if (Number.isNaN(port)) {
      return val;
    }

    if (port >= 0) {
      return port;
    }

    throw new Error(`Port "${val}" is invalid.`);
  }
}
