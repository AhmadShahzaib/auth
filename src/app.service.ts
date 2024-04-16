import { ForgotPasswordResponse } from './models/forgotPasswordResponse .model';
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtPayload, sign, SignOptions, verify } from 'jsonwebtoken';
import { Model, Schema, trusted, FilterQuery } from 'mongoose';
import { LoginRequest, LoginResponse } from './models';
import {
  ConfigurationService,
  mapMessagePatternResponseToException,
  MessagePatternResponseType,
} from '@shafiqrathore/logeld-tenantbackend-common-future';
import { v4 as uuidv4 } from 'uuid';

import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import moment from 'moment';
import { ClientProxy } from '@nestjs/microservices';
import * as nodemailer from 'nodemailer';

import { ConfigService } from '@nestjs/config';

import { firstValueFrom } from 'rxjs';
import { ResetPasswordRequest } from 'models/resetPasswordRequest.model';
import { RefreshTokenDocument } from '@shafiqrathore/logeld-tenantbackend-common-future';
import { emailCheck } from './shared/emailCheck';

@Injectable()
export class AuthService {
  private readonly jwtOptions: SignOptions;
  private readonly jwtKey: string;
  private refreshTokenTtl: string | number;

  private expiresInDefault: string | number;

  constructor(
    @InjectModel('RefreshTokens')
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @Inject('USERS_SERVICE') private readonly usersClient: ClientProxy,
    @Inject('DRIVER_SERVICE') private readonly driverClient: ClientProxy,
    @Inject('HOS_SERVICE') private readonly hosClient: ClientProxy,
    @Inject('COMPANY_SERVICE') private readonly companyClient: ClientProxy,
    @Inject('VEHICLE_SERVICE') private readonly vehicleClient: ClientProxy,
    @Inject('UNIT_SERVICE') private readonly unitClient: ClientProxy,
    @Inject('DEVICE_SERVICE') private readonly deviceClient: ClientProxy,
    private readonly configService: ConfigService,

    private readonly configurationService: ConfigurationService,
  ) {
    this.expiresInDefault = this.configurationService.JWT.AccessTokenTtl;
    this.jwtOptions = { expiresIn: this.expiresInDefault };
    this.jwtKey = this.configurationService.JWT.Key;
    this.refreshTokenTtl = this.configurationService.JWT.RefreshTokenTtl;
  }

  getDriverForLogin = async (credentials: any, deviceToken: String) => {
    try {
      let driverLoginResult = {} as any;
      Logger.log('call driver service for driver login');
      credentials['deviceToken'] = deviceToken;
      let driverLoginResponse = this.driverClient.send(
        { cmd: 'get_driver_for_login' },
        credentials,
      );
      driverLoginResult = await firstValueFrom(driverLoginResponse);
      Logger.log(
        driverLoginResult.isError ? 'Driver did not find' : 'Driver data found',
        credentials,
      );
      return driverLoginResult;
    } catch (err) {
      throw err;
    }
  };
  //get driver or co driver for this driver

  GetDriverFromId = async (driverId: any) => {
    try {
      let driverResult = {} as any;
      Logger.log('get driver by driver Id');

      let driverResponse = this.driverClient.send(
        { cmd: 'get_driver_by_id' },
        driverId,
      );
      driverResult = await firstValueFrom(driverResponse);
      Logger.log(
        driverResult.isError ? 'Driver did not find' : 'Driver data found',
      );
      return driverResult;
    } catch (err) {
      throw err;
    }
  };

  getUserForLogin = async (credentials: LoginRequest) => {
    try {
      let loginResults = {} as any;
      Logger.log('call driver service for User login');
      let userLoginResponse = this.usersClient.send(
        { cmd: 'get_user_for_login' },
        credentials,
      );
      loginResults = await firstValueFrom(userLoginResponse);
      Logger.log(
        loginResults.isError
          ? 'Web portal user not found'
          : 'Web portal user found',
        credentials,
      );
      return loginResults;
    } catch (err) {
      err.message =
        'unable to connect to the User service through mesaage pattern';
      throw err;
    }
  };
  getUserForValidation = async (credentials: LoginRequest) => {
    try {
      let loginResults = {} as any;
      Logger.log('call driver service for User login');
      let userLoginResponse = this.usersClient.send(
        { cmd: 'get_user_for_login_validation' },
        credentials,
      );
      loginResults = await firstValueFrom(userLoginResponse);
      Logger.log(
        loginResults.isError
          ? 'Web portal user not found'
          : 'Web portal user found',
        credentials,
      );
      return loginResults;
    } catch (err) {
      err.message =
        'unable to connect to the User service through mesaage pattern';
      throw err;
    }
  };

  login = async (
    credentials: LoginRequest,
    deviceToken: String,
    deviceT: String,
    ipAddress: string,
  ): Promise<LoginResponse> => {
    try {
      let loginData = null;
      let deviceType;
      if (deviceT) {
        deviceType = deviceT.toUpperCase();
        console.log(`deviceTye ============ `, deviceType);
      }

      // let loginResults = {} as any;
      // let driverLoginResult = {} as any;

      // try {
      // let userLoginResponse = this.usersClient.send(
      //   { cmd: 'get_user_for_login' },
      //   credentials,
      // );

      // let driverLoginResponse = this.driverClient.send(
      //   { cmd: 'get_driver_for_login' },
      //   credentials,
      // );

      //   loginResults = await firstValueFrom(userLoginResponse);
      //   driverLoginResult = await firstValueFrom(driverLoginResponse);
      // } catch (err) {}
      const { deviceVersion, deviceModel } = credentials;
      if (!deviceModel) {
        credentials.deviceModel = '';
      }
      if (!deviceVersion) {
        credentials.deviceVersion = '';
      }
      const loginResults = await this.getUserForLogin(credentials);

      const driverLoginResult = await this.getDriverForLogin(
        credentials,
        deviceToken,
      );

      // console.log(`loginResults --------------------- `, loginResults);
      // console.log(
      //   `driverLoginResult --------------------- `,
      //   driverLoginResult,
      // );

      const driverId = driverLoginResult?.data?.id;
      console.log(`driverId --------------------- `, driverId);
      console.log(`userid --------------------- `, loginResults?.data?.id);

      if (driverId) {
        const messagePatternUnit =
          await firstValueFrom<MessagePatternResponseType>(
            this.unitClient.send({ cmd: 'get_unit_by_driverId' }, driverId),
          );
        if (messagePatternUnit.isError) {
          mapMessagePatternResponseToException(messagePatternUnit);
        }

        console.log(
          `messagePatternUnit --------------------- `,
          messagePatternUnit,
        );

        const deviceId = messagePatternUnit?.data?.deviceId;
        console.log('Device id is : ' + deviceId);
        const messagePatternDevice =
          await firstValueFrom<MessagePatternResponseType>(
            this.deviceClient.send({ cmd: 'get_device_by_id' }, deviceId),
          );
        if (messagePatternDevice.isError) {
          mapMessagePatternResponseToException(messagePatternDevice);
        }

        console.log(
          `messagePatternDevice --------------------- `,
          messagePatternDevice,
        );

        const eldUpdateData = {
          eldId: messagePatternDevice?.data?.id,
          deviceType: deviceType,
          deviceToken: deviceToken,
        };

        const messagePatternDeviceUpdate =
          await firstValueFrom<MessagePatternResponseType>(
            this.deviceClient.send(
              { cmd: 'update_device_token_and_type' },
              eldUpdateData,
            ),
          );
        if (messagePatternDeviceUpdate.isError) {
          mapMessagePatternResponseToException(messagePatternDeviceUpdate);
        }

        console.log(
          `messagePatternDeviceUpdate --------------------- `,
          messagePatternDeviceUpdate,
        );
      }

      if (loginResults.isError && driverLoginResult.isError) {
        Logger.log(`user not found or credentials not correct`);
        throw new NotFoundException(`Your user name or password is incorrect`);
      } else if (loginResults?.data) {
        Logger.log(`user Login with credentials ${credentials}`);
        loginResults.data.isDriver = false;
        loginData = loginResults.data;
        if (!loginData.isVerified) {
          throw new NotFoundException(`please Verify your account first`);
        }
      } else if (driverLoginResult?.data) {
        Logger.log(`driver Login with credentials ${credentials}`);
        driverLoginResult.data.isDriver = true;
        loginData = driverLoginResult.data;
        // await firstValueFrom(
        //   this.hosClient.emit(
        //     { cmd: 'login_logout_log' },
        //     {
        //       actionDate: moment().unix(),
        //       actionType: 'LOGIN',
        //       driverId: loginData.id,
        //       tenantId: loginData.tenantId,
        //       firstName: loginData.firstName,
        //       lastName: loginData.lastName,
        //       vehicleId: loginData.vehicleId,
        //       odoMeterMillage: credentials.odoMeterMillage,
        //       odoMeterSpeed: credentials.odoMeterSpeed,
        //       engineHours: credentials.engineHours,
        //       engineRPMs: credentials.engineRPMs,
        //       sequenceNumber: credentials.sequenceNumber,
        //       deviceVersion: credentials.deviceVersion,
        //       deviceModel: credentials.deviceModel,
        //       eldType: credentials.eldType,
        //     },
        //   ),
        // );
      }
      // GET COMPANY DETAILS
      const messagePatternCompany =
        await firstValueFrom<MessagePatternResponseType>(
          this.companyClient.send(
            { cmd: 'get_company_by_id' },
            loginData.tenantId,
          ),
        );
      if (messagePatternCompany.isError) {
        mapMessagePatternResponseToException(messagePatternCompany);
      }
      const {
        timeZone: { tzCode: companyTimeZone },
        usdot,
        name,
      } = messagePatternCompany.data;
      loginData.companyTimeZone = companyTimeZone;
      loginData.usdot = usdot;
      if (!loginData.trailerNumber) {
        loginData.trailerNumber = '';
      }
      loginData.carrierName = name;
      //get co Driver
      let coDriverResult;
      if (loginData.isDriver && loginData.coDriver) {
        coDriverResult = await this.GetDriverFromId(loginData.coDriver);
      }
      // GET VEHICLE DETAILS
      if (loginData.isDriver) {
        const messagePatternVehicle =
          await firstValueFrom<MessagePatternResponseType>(
            this.vehicleClient.send(
              { cmd: 'get_vehicle_by_id' },
              loginData.vehicleId,
            ),
          );
        if (messagePatternVehicle.isError) {
          mapMessagePatternResponseToException(messagePatternVehicle);
        }
        const { licensePlateNo } = messagePatternVehicle.data;
        loginData.vehicleData = messagePatternVehicle.data;
      }
      if (loginData) {
        let loginAccessTokenData = JSON.parse(JSON.stringify(loginData));
        if (loginAccessTokenData.driverProfile) {
          loginAccessTokenData.driverProfile = {};
        }

        const payload: JwtPayload = {
          sub: JSON.stringify(loginAccessTokenData),
        };

        const loginResponse: LoginResponse = await this.createAccessToken(
          payload,
        );

        // We save the user's refresh token
        const tokenContent = {
          userId: loginData.id,
          tenantId: loginData.tenantId,
          ipAddress,
          accessToken: loginResponse.accessToken,
        };

        const refresh = await this.createRefreshToken(tokenContent);
        delete loginData['phoneNumber'];
        loginResponse.refreshToken = refresh;
        loginResponse.user = loginData;
        loginResponse.user.hourPeriodStartingTime = '000000';
        loginResponse.user.co_driver_last_name = coDriverResult?.data.lastName;
        loginResponse.user.co_driver_first_name =
          coDriverResult?.data.firstName;
        loginResponse.user.eld_username_for_co_driver =
          coDriverResult?.data.userName;

        return loginResponse;
      } else {
        throw new UnauthorizedException('Invalid Credentials');
      }
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  };

  loginForValidation = async (
    credentials: LoginRequest,
    deviceToken: String,
    deviceT: String,
    ipAddress: string,
  ): Promise<LoginResponse> => {
    try {
      let loginData = null;
      let deviceType;
      if (deviceT) {
        deviceType = deviceT.toUpperCase();
        console.log(`deviceTye ============ `, deviceType);
      }

      // let loginResults = {} as any;
      // let driverLoginResult = {} as any;

      // try {
      // let userLoginResponse = this.usersClient.send(
      //   { cmd: 'get_user_for_login' },
      //   credentials,
      // );

      // let driverLoginResponse = this.driverClient.send(
      //   { cmd: 'get_driver_for_login' },
      //   credentials,
      // );

      //   loginResults = await firstValueFrom(userLoginResponse);
      //   driverLoginResult = await firstValueFrom(driverLoginResponse);
      // } catch (err) {}
      const { deviceVersion, deviceModel } = credentials;
      if (!deviceModel) {
        credentials.deviceModel = '';
      }
      if (!deviceVersion) {
        credentials.deviceVersion = '';
      }
      const loginResults = await this.getUserForValidation(credentials);

      const driverLoginResult = await this.getDriverForLogin(
        credentials,
        deviceToken,
      );

      // console.log(`loginResults --------------------- `, loginResults);
      // console.log(
      //   `driverLoginResult --------------------- `,
      //   driverLoginResult,
      // );

      const driverId = driverLoginResult?.data?.id;
      console.log(`driverId --------------------- `, driverId);
      console.log(`userid --------------------- `, loginResults?.data?.id);

      if (driverId) {
        const messagePatternUnit =
          await firstValueFrom<MessagePatternResponseType>(
            this.unitClient.send({ cmd: 'get_unit_by_driverId' }, driverId),
          );
        if (messagePatternUnit.isError) {
          mapMessagePatternResponseToException(messagePatternUnit);
        }

        console.log(
          `messagePatternUnit --------------------- `,
          messagePatternUnit,
        );

        const deviceId = messagePatternUnit?.data?.deviceId;
        console.log('Device id is : ' + deviceId);
        const messagePatternDevice =
          await firstValueFrom<MessagePatternResponseType>(
            this.deviceClient.send({ cmd: 'get_device_by_id' }, deviceId),
          );
        if (messagePatternDevice.isError) {
          mapMessagePatternResponseToException(messagePatternDevice);
        }

        console.log(
          `messagePatternDevice --------------------- `,
          messagePatternDevice,
        );

        const eldUpdateData = {
          eldId: messagePatternDevice?.data?.id,
          deviceType: deviceType,
          deviceToken: deviceToken,
        };

        const messagePatternDeviceUpdate =
          await firstValueFrom<MessagePatternResponseType>(
            this.deviceClient.send(
              { cmd: 'update_device_token_and_type' },
              eldUpdateData,
            ),
          );
        if (messagePatternDeviceUpdate.isError) {
          mapMessagePatternResponseToException(messagePatternDeviceUpdate);
        }

        console.log(
          `messagePatternDeviceUpdate --------------------- `,
          messagePatternDeviceUpdate,
        );
      }

      if (loginResults.isError && driverLoginResult.isError) {
        Logger.log(`user not found or credentials not correct`);
        throw new NotFoundException(`Your user name or password is incorrect`);
      } else if (loginResults?.data) {
        Logger.log(`user Login with credentials ${credentials}`);
        loginResults.data.isDriver = false;
        loginData = loginResults.data;
        // if(!loginData.isVerified){
        //   throw new NotFoundException(`please Verify your account first`);
        // }
      } else if (driverLoginResult?.data) {
        Logger.log(`driver Login with credentials ${credentials}`);
        driverLoginResult.data.isDriver = true;
        loginData = driverLoginResult.data;
        // await firstValueFrom(
        //   this.hosClient.emit(
        //     { cmd: 'login_logout_log' },
        //     {
        //       actionDate: moment().unix(),
        //       actionType: 'LOGIN',
        //       driverId: loginData.id,
        //       tenantId: loginData.tenantId,
        //       firstName: loginData.firstName,
        //       lastName: loginData.lastName,
        //       vehicleId: loginData.vehicleId,
        //       odoMeterMillage: credentials.odoMeterMillage,
        //       odoMeterSpeed: credentials.odoMeterSpeed,
        //       engineHours: credentials.engineHours,
        //       engineRPMs: credentials.engineRPMs,
        //       sequenceNumber: credentials.sequenceNumber,
        //       deviceVersion: credentials.deviceVersion,
        //       deviceModel: credentials.deviceModel,
        //       eldType: credentials.eldType,
        //     },
        //   ),
        // );
      }
      // GET COMPANY DETAILS
      const messagePatternCompany =
        await firstValueFrom<MessagePatternResponseType>(
          this.companyClient.send(
            { cmd: 'get_company_by_id' },
            loginData.tenantId,
          ),
        );
      if (messagePatternCompany.isError) {
        mapMessagePatternResponseToException(messagePatternCompany);
      }
      const {
        timeZone: { tzCode: companyTimeZone },
        usdot,
        name,
      } = messagePatternCompany.data;
      loginData.companyTimeZone = companyTimeZone;
      loginData.usdot = usdot;
      if (!loginData.trailerNumber) {
        loginData.trailerNumber = '';
      }
      loginData.carrierName = name;
      //get co Driver
      let coDriverResult;
      if (loginData.isDriver && loginData.coDriver) {
        coDriverResult = await this.GetDriverFromId(loginData.coDriver);
      }
      // GET VEHICLE DETAILS
      if (loginData.isDriver) {
        const messagePatternVehicle =
          await firstValueFrom<MessagePatternResponseType>(
            this.vehicleClient.send(
              { cmd: 'get_vehicle_by_id' },
              loginData.vehicleId,
            ),
          );
        if (messagePatternVehicle.isError) {
          mapMessagePatternResponseToException(messagePatternVehicle);
        }
        const { licensePlateNo } = messagePatternVehicle.data;
        loginData.vehicleData = messagePatternVehicle.data;
      }
      if (loginData) {
        let loginAccessTokenData = JSON.parse(JSON.stringify(loginData));
        if (loginAccessTokenData.driverProfile) {
          loginAccessTokenData.driverProfile = {};
        }

        const payload: JwtPayload = {
          sub: JSON.stringify(loginAccessTokenData),
        };

        const loginResponse: LoginResponse = await this.createAccessToken(
          payload,
        );

        // We save the user's refresh token
        const tokenContent = {
          userId: loginData.id,
          tenantId: loginData.tenantId,
          ipAddress,
          accessToken: loginResponse.accessToken,
        };

        const refresh = await this.createRefreshToken(tokenContent);
        delete loginData['phoneNumber'];
        loginResponse.refreshToken = refresh;
        loginResponse.user = loginData;
        loginResponse.user.hourPeriodStartingTime = '000000';
        loginResponse.user.co_driver_last_name = coDriverResult?.data.lastName;
        loginResponse.user.co_driver_first_name =
          coDriverResult?.data.firstName;
        loginResponse.user.eld_username_for_co_driver =
          coDriverResult?.data.userName;

        return loginResponse;
      } else {
        throw new UnauthorizedException('Invalid Credentials');
      }
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  };
  logout = async (accessToken: string): Promise<any> => {
    try {
      // if (option && Object.keys(option).length > 0) {
      //   await firstValueFrom(
      //     this.hosClient.emit({ cmd: 'login_logout_log' }, option),
      //   );
      // }
      return await this.deleteAccessToken(accessToken);
    } catch (error) {
      Logger.log('Error logged in logout of auth service');
      Logger.error({ message: error.message, stack: error.stack });
      Logger.log({ accessToken });
      throw error;
    }
  };

  /**
   * Logout the user from all the devices by invalidating all his refresh tokens
   * @param userId The user id to logout
   */
  // logoutFromAll = async (userId: string, option: any = {}): Promise<any> => {
  //   try {
  //     if (option && Object.keys(option).length > 0) {
  //       await firstValueFrom(
  //         this.hosClient.emit({ cmd: 'login_logout_log' }, option),
  //       );
  //     }
  //     return await this.deleteAccessTokenForUser(userId);
  //   } catch (error) {
  //     Logger.log('Error logged in logoutFromAll of auth service');
  //     Logger.error({ message: error.message, stack: error.stack });
  //     Logger.log({ userId });
  //     throw error;
  //   }
  // };

  getAccessTokenFromRefreshToken = async (
    refreshToken: string,
    oldAccessToken: string,
    tenantId: string,
    ipAddress: string,
  ): Promise<LoginResponse> => {
    try {
      // check if refresh token exist in database
      const result = await this.refreshTokenModel.findOne({
        value: refreshToken,
      });
      const token = result;
      const currentDate = new Date();
      if (!token) {
        throw new NotFoundException('Refresh token not found');
      }
      if (token.expiresAt < currentDate) {
        throw new BadRequestException('Refresh token expired');
      }

      // Refresh token is still valid
      // Generate new access token
      const oldPayload = await this.validateToken(oldAccessToken, true);
      let userData = JSON.parse(oldPayload.sub);
      // let userPayload = null;
      const newPayload = await emailCheck(
        userData.email,
        this.usersClient,
        this.driverClient,
      );

      const payload: JwtPayload = {
        sub: JSON.stringify(userData),
      };

      const accessToken: LoginResponse = await this.createAccessToken(payload);
      // Remove old refresh token and generate a new one
      await this.refreshTokenModel.findByIdAndDelete(token.id);
      const payloadResult = JSON.parse(oldPayload.sub);

      accessToken.refreshToken = await this.createRefreshToken({
        userId: payloadResult.id,
        tenantId,
        ipAddress,
        accessToken: accessToken.accessToken,
      });

      return accessToken;
    } catch (error) {
      Logger.log(
        'Error logged in getAccessTokenFromRefreshToken of auth service',
      );
      Logger.error({ message: error.message, stack: error.stack });
      Logger.log({ refreshToken, oldAccessToken, tenantId, ipAddress });
      throw error;
    }
  };

  findUser = async (email: string): Promise<ForgotPasswordResponse> => {
    try {
      Logger.log(`check email exist or not`);
      const result = await emailCheck(
        email,
        this.usersClient,
        this.driverClient,
      );
      if (result.data && Object.keys(result.data).length > 0) {
        return result;
      }
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  };
  sendEmailResetPassword = async (user) => {
    const options = this.jwtOptions;
    options.jwtid = uuidv4();
    const userVerificaionToken = sign(user, this.jwtKey, options);

    const serviceBaseUrl = this.configService.get<string>('SERVICE_BASE_URL');
    // const serviceBaseUrl = "192.168.1.54"

    const port = this.configService.get<string>('PORT');
    const email = await this.sendMail(
      // user.email,
      ' ahmad.shahzaib@tekhqs.com',
      'Reset your password',
      `<!DOCTYPE html>
      <html
        lang="en"
        xmlns="http://www.w3.org/1999/xhtml"
        xmlns:v="urn:schemas-microsoft-com:vml"
        xmlns:o="urn:schemas-microsoft-com:office:office"
      >
        <head>
          <meta charset="utf-8" />
          <!-- utf-8 works for most cases -->
          <meta name="viewport" content="width=device-width" />
          <!-- Forcing initial-scale shouldn't be necessary -->
          <meta http-equiv="X-UA-Compatible" content="IE=edge" />
          <!-- Use the latest (edge) version of IE rendering engine -->
          <meta name="x-apple-disable-message-reformatting" />
          <!-- Disable auto-scale in iOS 10 Mail entirely -->
          <title></title>
          <!-- The title tag shows in email notifications, like Android 4.4. -->
      
          <link
            href="https://fonts.googleapis.com/css?family=Poppins:200,300,400,500,600,700"
            rel="stylesheet"
          />
          <style>
            html,
            body {
              margin: 0 auto !important;
              padding: 0 !important;
              height: 100% !important;
              width: 100% !important;
              background: #f1f1f1;
            }
            * {
              -ms-text-size-adjust: 100%;
              -webkit-text-size-adjust: 100%;
            }
            div[style*="margin: 16px 0"] {
              margin: 0 !important;
            }
            table,
            td {
              mso-table-lspace: 0pt !important;
              mso-table-rspace: 0pt !important;
            }
      
            /* What it does: Fixes webkit padding issue. */
            table {
              border-spacing: 0 !important;
              border-collapse: collapse !important;
              table-layout: fixed !important;
              margin: 0 auto !important;
            }
            img {
              -ms-interpolation-mode: bicubic;
            }
            a {
              text-decoration: none;
            }
            *[x-apple-data-detectors],
            .unstyle-auto-detected-links *,
            .aBn {
              border-bottom: 0 !important;
              cursor: default !important;
              color: inherit !important;
              text-decoration: none !important;
              font-size: inherit !important;
              font-family: inherit !important;
              font-weight: inherit !important;
              line-height: inherit !important;
            }
            .a6S {
              display: none !important;
              opacity: 0.01 !important;
            }
            .im {
              color: inherit !important;
            }
            img.g-img + div {
              display: none !important;
            }
            @media only screen and (min-device-width: 320px) and (max-device-width: 374px) {
              u ~ div .email-container {
                min-width: 320px !important;
              }
            }
            /* iPhone 6, 6S, 7, 8, and X */
            @media only screen and (min-device-width: 375px) and (max-device-width: 413px) {
              u ~ div .email-container {
                min-width: 375px !important;
              }
            }
            /* iPhone 6+, 7+, and 8+ */
            @media only screen and (min-device-width: 414px) {
              u ~ div .email-container {
                min-width: 414px !important;
              }
            }
          </style>
      
          <style>
            /*BUTTON*/
            .btn {
              padding: 10px 15px;
              display: inline-block;
            }
            .btn.btn-primary {
              border-radius: 5px;
              background: #17bebb;
              color: #ffffff;
            }
            .hero {
              position: relative;
              z-index: 0;
            }
            .hero .text h2 {
              color: #000;
              font-size: 34px;
              margin-bottom: 0;
              font-weight: 200;
              line-height: 1.4;
            }
            .hero .text h3 {
              font-size: 24px;
              font-weight: 300;
              font-family: "Poppins", sans-serif;
              color: #000000;
            }
            .hero .text h2 span {
              font-weight: 600;
              color: #000;
            }
            .text-author {
              max-width: 50%;
              margin: 0 auto;
            }
            @media screen and (max-width: 500px) {
            }
          </style>
        </head>
      
        <body
          width="100%"
          style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly"
        >
          <center style="width: 100%; background-color: #f1f1f1">
            <div
              style="
                display: none;
                font-size: 1px;
                max-height: 0px;
                max-width: 0px;
                opacity: 0;
                overflow: hidden;
                mso-hide: all;
                font-family: sans-serif;
              "
            >
              &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
            </div>
            <div style="max-width: 500px; margin: 0 auto" class="email-container">
              <!-- Begin Body -->
              <table
                align="center"
                role="presentation"
                cellspacing="0"
                cellpadding="0"
                border="0"
                width="100%"
                style="margin: auto"
              >
                <tr>
                  <td valign="top" style="padding: 1em 2.5em 0 2.5em">
                    <table
                      role="presentation"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      width="100%"
                    >
                      <tr>
                        <td class="logo" style="text-align: center">
                          <?xml version="1.0" encoding="UTF-8"?>
                          <svg
                            width="329"
                            height="48"
                            viewBox="0 0 329 48"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M258.643 44.831C258.645 44.2754 258.811 43.733 259.122 43.272C259.432 42.8111 259.871 42.4523 260.385 42.2411C260.899 42.0299 261.464 41.9756 262.009 42.0852C262.553 42.1948 263.053 42.4633 263.445 42.8568C263.837 43.2504 264.104 43.7512 264.212 44.2962C264.319 44.8413 264.263 45.4059 264.05 45.919C263.837 46.4321 263.477 46.8705 263.015 47.1789C262.553 47.4874 262.01 47.652 261.454 47.652C261.084 47.6515 260.718 47.5781 260.377 47.436C260.035 47.2939 259.725 47.0859 259.464 46.8239C259.203 46.562 258.996 46.2511 258.855 45.9091C258.714 45.5672 258.642 45.2008 258.643 44.831ZM113.089 47.031L115.589 42.331H255.831V47.031H113.089ZM282.2 44.669L280.765 41.358L279.792 44.935H278.917L280.226 40.147C280.24 40.0417 280.293 39.9456 280.375 39.8781C280.457 39.8105 280.561 39.7765 280.667 39.783C280.763 39.7824 280.857 39.8107 280.937 39.8642C281.016 39.9177 281.078 39.9939 281.114 40.083L282.683 43.683L284.251 40.083C284.283 39.995 284.341 39.919 284.417 39.8653C284.493 39.8116 284.585 39.7828 284.678 39.783C284.781 39.7814 284.882 39.8175 284.96 39.8845C285.039 39.9515 285.09 40.0448 285.105 40.147L286.405 44.935H285.523L284.55 41.358L283.108 44.669C283.078 44.7663 283.018 44.8515 282.936 44.912C282.854 44.9725 282.755 45.0051 282.653 45.0051C282.551 45.0051 282.452 44.9725 282.37 44.912C282.288 44.8515 282.228 44.7663 282.198 44.669H282.2ZM275.018 44.934C274.683 44.9339 274.351 44.8656 274.042 44.7332C273.734 44.6008 273.456 44.4072 273.225 44.164C272.994 43.9208 272.814 43.6332 272.698 43.3186C272.581 43.004 272.53 42.669 272.547 42.334C272.531 42.0042 272.583 41.6746 272.701 41.3662C272.819 41.0578 273 40.7775 273.233 40.543C273.465 40.3085 273.744 40.1251 274.052 40.0044C274.359 39.8837 274.688 39.8284 275.018 39.842H276.257C276.589 39.8256 276.92 39.8789 277.229 39.9984C277.539 40.1179 277.82 40.3009 278.055 40.5356C278.29 40.7704 278.473 41.0517 278.592 41.3614C278.711 41.6712 278.764 42.0025 278.748 42.334C278.765 42.6707 278.713 43.0075 278.596 43.3235C278.478 43.6395 278.297 43.9281 278.064 44.1716C277.83 44.4151 277.55 44.6083 277.239 44.7394C276.928 44.8705 276.594 44.9367 276.257 44.934H275.018ZM273.436 42.379C273.424 42.594 273.455 42.8092 273.529 43.0115C273.603 43.2137 273.718 43.3987 273.866 43.5549C274.014 43.7111 274.193 43.8353 274.391 43.9197C274.589 44.0042 274.803 44.0472 275.018 44.046H276.257C276.474 44.0489 276.689 44.0073 276.888 43.9236C277.088 43.84 277.269 43.7162 277.419 43.5599C277.569 43.4036 277.685 43.2181 277.761 43.0149C277.836 42.8118 277.869 42.5953 277.857 42.379C277.868 42.1638 277.835 41.9486 277.759 41.747C277.684 41.5453 277.567 41.3614 277.417 41.207C277.266 41.0526 277.086 40.931 276.886 40.8498C276.687 40.7685 276.472 40.7294 276.257 40.735H275.018C274.804 40.7315 274.592 40.7721 274.394 40.8543C274.197 40.9365 274.018 41.0586 273.87 41.2128C273.721 41.3671 273.606 41.5502 273.532 41.7509C273.457 41.9515 273.425 42.1653 273.437 42.379H273.436ZM269.215 44.934C268.88 44.9337 268.548 44.8653 268.24 44.7329C267.931 44.6005 267.653 44.4068 267.422 44.1636C267.191 43.9205 267.012 43.6329 266.896 43.3184C266.779 43.0039 266.728 42.6689 266.745 42.334C266.728 42.0042 266.781 41.6746 266.899 41.3663C267.017 41.0579 267.198 40.7775 267.43 40.543C267.663 40.3085 267.941 40.1251 268.249 40.0044C268.556 39.8837 268.885 39.8284 269.215 39.842H271.974V40.731H269.215C269.001 40.7273 268.788 40.7679 268.591 40.85C268.393 40.9322 268.214 41.0542 268.066 41.2085C267.918 41.3627 267.802 41.5459 267.728 41.7466C267.653 41.9473 267.621 42.1612 267.633 42.375C267.621 42.59 267.652 42.8052 267.726 43.0075C267.8 43.2097 267.915 43.3947 268.063 43.5509C268.211 43.7071 268.39 43.8313 268.588 43.9157C268.786 44.0002 269 44.0432 269.215 44.042H271.974V44.93L269.215 44.934ZM93.757 36.824L82.646 19.801H88.746L96.394 31.453L113.584 0.000976562H119.33L98.6 36.824C98.3829 37.285 98.0452 37.6788 97.6228 37.9637C97.2003 38.2487 96.7088 38.4143 96.2 38.443C95.6827 38.4262 95.1803 38.2658 94.7489 37.9799C94.3175 37.694 93.9741 37.2938 93.757 36.824ZM321.22 37.308L305.2 24.668C304.86 24.4402 304.587 24.1267 304.407 23.7591C304.227 23.3916 304.148 22.9831 304.177 22.575C304.164 22.1156 304.274 21.661 304.495 21.2583C304.716 20.8555 305.041 20.5192 305.436 20.284L320.592 8.59198H328.266L309.533 22.614L328.857 37.307L321.22 37.308ZM297.646 37.308V8.59198H302.646V37.308H297.646ZM272.616 37.308C264.627 37.308 258.724 30.988 258.724 22.654C258.724 14.201 264.624 8.59198 272.616 8.59198H279.582C287.847 8.59198 293.592 14.319 293.592 22.654C293.592 30.989 287.728 37.308 279.582 37.308H272.616ZM263.723 22.891C263.723 28.303 267.462 32.291 272.618 32.291H279.584C284.857 32.291 288.596 28.302 288.596 22.891C288.596 17.48 284.857 13.609 279.584 13.609H272.618C267.5 13.609 263.723 17.44 263.723 22.891ZM234.523 37.308C226.535 37.308 220.631 30.988 220.631 22.654C220.631 14.201 226.531 8.59198 234.523 8.59198H241.489C249.754 8.59198 255.5 14.319 255.5 22.654C255.5 30.989 249.636 37.308 241.489 37.308H234.523ZM225.626 22.891C225.626 28.303 229.365 32.291 234.52 32.291H241.486C246.76 32.291 250.499 28.302 250.499 22.891C250.499 17.48 246.76 13.609 241.486 13.609H234.52C229.4 13.609 225.626 17.44 225.626 22.891ZM186.35 37.308V8.59198H207.287C212.876 8.59198 216.575 11.12 216.575 16.018C216.575 19.651 214.725 21.468 212.601 22.14C213.96 22.5716 215.137 23.4416 215.949 24.6137C216.761 25.7859 217.161 27.1941 217.087 28.618C217.087 33.871 213.466 37.308 207.877 37.308H186.35ZM191.35 32.331H205.83C209.412 32.331 212.009 31.344 212.009 28.539C212.009 26.169 210.474 24.826 207.68 24.826H194.968V20.601H207.326C210.159 20.601 211.497 19.613 211.497 17.124C211.497 14.083 209.097 13.61 205.397 13.61H191.347L191.35 32.331ZM176.71 37.308L169.469 29.329H158.769V24.901H170.694C174.275 24.901 176.164 22.847 176.164 19.135C176.164 15.423 174.117 13.605 170.694 13.605H155.1V37.305H150.141V8.59198H170.685C177.218 8.59198 181.075 12.66 181.075 19.059C181.075 23.798 178.875 27.159 175.175 28.578L183.793 37.307L176.71 37.308ZM120.274 37.308V8.59198H145.816V13.609H125.23V32.291H145.853V37.308H120.274ZM71.119 37.308V8.59198H76.119V37.308H71.119ZM61.162 37.308L53.921 29.329H43.221V24.901H55.138C58.719 24.901 60.608 22.847 60.608 19.135C60.608 15.423 58.561 13.605 55.138 13.605H39.552V37.305H34.593V8.59198H55.138C61.671 8.59198 65.528 12.66 65.528 19.059C65.528 23.798 63.328 27.159 59.628 28.578L68.246 37.307L61.162 37.308ZM0 37.308V8.59198H16.569C24.637 8.59198 30.501 14.319 30.501 22.654C30.501 30.989 24.637 37.308 16.569 37.308H0ZM4.959 32.291H16.569C21.724 32.291 25.502 28.302 25.502 22.891C25.502 17.48 21.724 13.609 16.569 13.609H4.959V32.291ZM232.565 26.023C232.288 26.0025 232.029 25.878 231.84 25.6745C231.651 25.4711 231.546 25.2037 231.546 24.926C231.546 24.6483 231.651 24.3809 231.84 24.1774C232.029 23.9739 232.288 23.8495 232.565 23.829H243.177C243.454 23.8495 243.713 23.9739 243.902 24.1774C244.091 24.3809 244.196 24.6483 244.196 24.926C244.196 25.2037 244.091 25.4711 243.902 25.6745C243.713 25.878 243.454 26.0025 243.177 26.023H232.565ZM128.89 24.823V20.601H144.751V24.827L128.89 24.823ZM232.565 21.944C232.273 21.944 231.993 21.8281 231.787 21.6218C231.581 21.4155 231.465 21.1357 231.465 20.844C231.465 20.5522 231.581 20.2724 231.787 20.0662C231.993 19.8599 232.273 19.744 232.565 19.744H243.177C243.469 19.744 243.749 19.8599 243.955 20.0662C244.161 20.2724 244.277 20.5522 244.277 20.844C244.277 21.1357 244.161 21.4155 243.955 21.6218C243.749 21.8281 243.469 21.944 243.177 21.944H232.565ZM81.464 8.20898C81.546 7.05541 82.062 5.97578 82.9083 5.18754C83.7545 4.39931 84.868 3.96105 86.0245 3.96105C87.181 3.96105 88.2945 4.39931 89.1407 5.18754C89.9869 5.97578 90.503 7.05541 90.585 8.20898C90.585 11.509 86.025 17.181 86.025 17.181C86.025 17.181 81.464 11.514 81.464 8.20898ZM84.539 8.53598C84.54 8.82947 84.6279 9.11608 84.7917 9.35963C84.9555 9.60318 85.1877 9.79274 85.4592 9.90437C85.7306 10.016 86.029 10.0447 86.3168 9.98683C86.6045 9.92897 86.8686 9.78714 87.0758 9.57926C87.283 9.37138 87.4239 9.10678 87.4808 8.81885C87.5377 8.53093 87.508 8.2326 87.3955 7.96154C87.2829 7.69049 87.0926 7.45886 86.8485 7.2959C86.6044 7.13295 86.3175 7.04598 86.024 7.04598C85.6295 7.04677 85.2515 7.20417 84.9731 7.48357C84.6946 7.76297 84.5385 8.14151 84.539 8.53598Z"
                              fill="#113D4E"
                            />
                          </svg>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td
                    valign="middle"
                    class="hero bg_white"
                    style="padding: 1em 0 0 0; background-color: #f1f1f1"
                  >
                    <table
                      role="presentation"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      width="100%"
                      style="
                        background-color: white;
                        border-radius: 12px;
                        border-top: 4px solid #113d4e;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                      "
                    >
                      <tr>
                        <td style="padding: 0 2.5em">
                          <h3
                            style="
                              margin-top: 40px;
                              text-align: center;
                              font-family: Helvetica, Arial, sans-serif;
                              font-size: 20px;
                              font-weight: 700;
                              line-height: 20px;
                              color: rgb(23, 43, 77);
                            "
                          >
                            Verify Your Email Address
                          </h3>
                          <h3
                            style="
                              margin-top: 40px;
                              font-family: Helvetica, Arial, sans-serif;
                              font-size: 14px;
                              font-weight: 700;
                              line-height: 20px;
                              color: rgb(23, 43, 77);
                            "
                          >
                            Dear ${user.name},
                          </h3>
                          <div class="text">
                            <h4
                              style="
                                margin-top: 25px;
                                font-family: Helvetica, Arial, sans-serif;
                                font-size: 14px;
                                font-weight: 400;
                                line-height: 20px;
                                color: rgb(23, 43, 77);
                              "
                            >
                               Your have requested password change. To ensure the
                              security of your account, please verify your email
                              address by clicking the link below:
                            </h4>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="text-align: center">
                          <div class="text-author">
                            <p>
                              <a
                                href="http://${serviceBaseUrl}/reset-password?token=${userVerificaionToken}"
                                class="btn btn-primary"
                                style="background-color: #113d4e; color: #fff"
                                >Verify Email Address</a
                              >
                            </p>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0 2.5em">
                          <div class="text">
                            <h4
                              style="
                                margin-top: 25px;
                                font-family: Helvetica, Arial, sans-serif;
                                font-size: 14px;
                                font-weight: 400;
                                line-height: 20px;
                                color: rgb(23, 43, 77);
                              "
                            >
                              This link is time-sensitive and will expire after 24
                              hours.
                            </h4>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0 2.5em">
                          <div class="text">
                            <h4
                              style="
                                font-family: Helvetica, Arial, sans-serif;
                                font-size: 14px;
                                font-weight: 400;
                                line-height: 20px;
                                color: rgb(23, 43, 77);
                              "
                            >
                              If you did not register on DriverBook or have any
                              concerns, please contact our support team at
                              support@mydriverbook.com.
                            </h4>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0 2.5em; padding-bottom: 3em">
                          <h3
                            style="
                              margin-top: 10px;
                              font-family: Helvetica, Arial, sans-serif;
                              font-size: 14px;
                              font-weight: 700;
                              line-height: 20px;
                              color: rgb(23, 43, 77);
                            "
                          >
                            Best regards,
                          </h3>
                          <h3
                            style="
                              margin-top: 10px;
                              font-family: Helvetica, Arial, sans-serif;
                              font-size: 14px;
                              font-weight: 700;
                              line-height: 20px;
                              color: rgb(23, 43, 77);
                            "
                          >
                            The DriverBook Team
                          </h3>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </div>
          </center>
        </body>
      </html>
      `,
    );
    return 1;
  };
  updatePassword = async (data: ResetPasswordRequest) => {
    try {
      Logger.log('check email exist or not');
      const result = await emailCheck(
        data.email,
        this.usersClient,
        this.driverClient,
      );
      if (
        result.data &&
        Object.keys(result.data).length > 0 &&
        result?.isDriver
      ) {
        Logger.log(`Driver email exist`);
        let driverResponse = this.driverClient.send(
          { cmd: 'update_driver_password' },
          data,
        );
        return await firstValueFrom(driverResponse);
      } else {
        Logger.log(`User email exist`);
        let userResponse = this.usersClient.send(
          { cmd: 'update_user_password' },
          data,
        );
        return await firstValueFrom(userResponse);
      }
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  };

  createAccessToken = async (
    payload: JwtPayload,
    expires = this.expiresInDefault,
  ): Promise<LoginResponse> => {
    try {
      // If expires is negative it means that token should not expire
      const options = this.jwtOptions;
      if (!Number.isNaN(Number(expires))) {
        Number(expires) > 0
          ? (options.expiresIn = expires)
          : delete options.expiresIn;
      } else {
        (expires as string).charAt(0) == '-'
          ? delete options.expiresIn
          : (options.expiresIn = expires);
      }
      // Generate unique id for this token
      options.jwtid = uuidv4();
      const signedPayload = sign(payload, this.jwtKey, options);
      const token: LoginResponse = {
        accessToken: signedPayload,
        expiresIn: options.expiresIn,
      };

      return token;
    } catch (error) {
      Logger.log('Error logged in createAccessToken of auth service');
      Logger.error({ message: error.message, stack: error.stack });
      Logger.log({ payload, expires });
      throw error;
    }
  };

  createRefreshToken = async (tokenContent: {
    userId: string;
    tenantId: any;
    ipAddress: string;
    accessToken: string;
  }): Promise<string> => {
    try {
      const { userId, tenantId, ipAddress, accessToken } = tokenContent;

      const refreshToken = randomBytes(64).toString('hex');

      await this.refreshTokenModel.create({
        userId,
        value: refreshToken,
        tenantId,
        ipAddress,
        expiresAt: moment().add(this.refreshTokenTtl, 'd').toDate(),
        accessToken,
      });

      return refreshToken;
    } catch (error) {
      Logger.log('Error logged in createRefreshToken of auth service');
      Logger.error({ message: error.message, stack: error.stack });
      Logger.log({ tokenContent });
      throw error;
    }
  };

  /**
   * Remove all the refresh tokens associated to a user
   * @param userId id of the user
   */
  deleteAccessTokenForUser = async (userId: string) => {
    try {
      return await this.refreshTokenModel.deleteMany({
        userId: userId,
      });
    } catch (error) {
      Logger.log('Error logged in deleteAccessTokenForUser of auth service');
      Logger.error({ message: error.message, stack: error.stack });
      Logger.log({ userId });
      throw error;
    }
  };

  /**
   * Removes a refresh token, and invalidated all access tokens for the user
   * @param value the value of the token to remove
   */
  deleteAccessToken = async (value: string) => {
    try {
      return await this.refreshTokenModel.deleteOne({ accessToken: value });
    } catch (error) {
      Logger.log('Error logged in AccessToken of auth service');
      Logger.error({ message: error.message, stack: error.stack });
      Logger.log({ value });
      throw error;
    }
  };

  private validateToken = async (
    token: string,
    ignoreExpiration: boolean = false,
  ): Promise<JwtPayload> => {
    try {
      const result = verify(token, this.configurationService.JWT.Key, {
        ignoreExpiration,
      }) as JwtPayload;
      return result;
    } catch (error) {
      Logger.log('Error logged in validateToken of auth service');
      Logger.error({ message: error.message, stack: error.stack });
      Logger.log({ token, ignoreExpiration });
      throw error;
    }
  };
  private readonly transporter = nodemailer.createTransport({
    service: 'gmail',
    host: '127.0.0.1',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: 'tekdev@tekhqs.com',
      pass: 'Abacus@123',
    },
  });

  async sendMail(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    const mailOptions = {
      from: 'tekdev@tekhqs.com',
      to,
      subject,
      html: htmlContent,
    };
    await this.transporter.sendMail(mailOptions);
  }
}
