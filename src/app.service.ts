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
      'Verify your Account',
      `<!DOCTYPE html>
  <html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
      <meta charset="utf-8"> <!-- utf-8 works for most cases -->
      <meta name="viewport" content="width=device-width"> <!-- Forcing initial-scale shouldn't be necessary -->
      <meta http-equiv="X-UA-Compatible" content="IE=edge"> <!-- Use the latest (edge) version of IE rendering engine -->
      <meta name="x-apple-disable-message-reformatting">  <!-- Disable auto-scale in iOS 10 Mail entirely -->
      <title></title> <!-- The title tag shows in email notifications, like Android 4.4. -->
  
      <link href="https://fonts.googleapis.com/css?family=Poppins:200,300,400,500,600,700" rel="stylesheet">
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
      -ms-interpolation-mode:bicubic;
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
  .btn{
    padding: 10px 15px;
    display: inline-block;
  }
  .btn.btn-primary{
    border-radius: 5px;
    background: #17bebb;
    color: #ffffff;
  }
  .hero{
    position: relative;
    z-index: 0;
  }
  .hero .text h2{
    color: #000;
    font-size: 34px;
    margin-bottom: 0;
    font-weight: 200;
    line-height: 1.4;
  }
  .hero .text h3{
    font-size: 24px;
    font-weight: 300;
      font-family: 'Poppins', sans-serif;
    color: #000000;
    
    
   
    
  }
  .hero .text h2 span{
    font-weight: 600;
    color: #000;
  }
  .text-author{
    max-width: 50%;
    margin: 0 auto;
  }
  @media screen and (max-width: 500px) {
  
  
  }
  
  
      </style>
  
  
  </head>
  
  <body width="100%" style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly;">
    <center style="width: 100%; background-color: #f1f1f1;">
      <div style="display: none; font-size: 1px;max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all; font-family: sans-serif;">
        &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
      </div>
      <div style="max-width: 500px; margin: 0 auto;" class="email-container">
          <!-- Begin Body -->
        <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: auto;">
          <tr>
            <td valign="top"  style="padding: 1em 2.5em 0 2.5em;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="logo" style="text-align: center;">
                    <?xml version="1.0" encoding="UTF-8"?>
  <svg version="1.1" viewBox="0 0 1600 320" width="150" height="70" xmlns="http://www.w3.org/2000/svg">
  <path transform="translate(133 -.114)" d="m0 0h1.95c2.13 0 4.25 0.01 6.38 0.02h4.43c3.88 0 7.76 0.01 11.6 0.02 3.96 0.02 7.92 0.02 11.9 0.02 7.77 0.02 15.5 0.03 23.3 0.05v2c0.62-0.18 1.24-0.37 1.88-0.56 2.12-0.44 2.12-0.44 4.12 0.56v2h4v2c1.11-0.31 1.11-0.31 2.25-0.62 3.24-0.44 3.94 0.13 6.75 1.62 1.72 0.65 3.45 1.27 5.19 1.88 13 4.7 25.2 10.8 36 19.6 1.97 1.64 1.97 1.64 4.9 3.29 0.64 0.39 1.28 0.78 1.94 1.18v2c0.6 0.29 1.2 0.58 1.81 0.88 2.19 1.12 2.19 1.12 5.19 3.12v2l5 2v2h2c1.54 1.75 3.01 3.55 4.44 5.38 2.45 3.12 4.25 5.42 7.56 7.62 6.89 7.21 14.2 17 16.4 26.9 0.58 2.15 1.39 3.86 2.44 5.82 2.07 4.05 3.64 8.13 5.06 12.4 0.25 0.76 0.5 1.52 0.76 2.3 4.61 14.3 8.39 29.1 8.54 44.2 0.01 0.83 0.02 1.65 0.03 2.5 0.02 2.66 0.04 5.31 0.04 7.96 0.01 0.9 0.01 1.8 0.01 2.73 0.01 16-0.96 30.2-7.32 45.1-0.39 1.74-0.75 3.5-1.06 5.25-3.98 16.6-15.7 35.7-27.4 48.1-1.63 1.8-2.98 3.68-4.34 5.68-1.08 1.49-1.08 1.49-2.19 3h-2c-0.37 0.87-0.37 0.87-0.75 1.75-1.88 3.39-4.15 5.61-7.5 7.57-2.48 1.52-4.36 3.06-6.5 5-10.9 9.68-10.9 9.68-16.2 9.68v2l-7 2v2h-4v2h-4v2c-3.62 1.32-6.09 2-10 2v2h-4v2c-0.85 0.21-1.71 0.41-2.59 0.62-1.1 0.27-2.21 0.54-3.35 0.82-1.65 0.4-1.65 0.4-3.34 0.81-2.61 0.48-2.61 0.48-3.72 1.75-2.33 0.34-4.67 0.67-7 1l-1 1c-1.62 0.21-3.25 0.37-4.87 0.5-2.98 0.25-5.28 0.55-8.13 1.5v-2c-0.72 0.33-1.44 0.66-2.19 1-2.83 1.01-4.84 1.17-7.81 1v2h-22v-2c-0.84-0.06-1.69-0.12-2.56-0.18-18-1.33-18-1.33-19.4-2.82-2.33-0.36-4.66-0.7-7-1v-2c-1.3 0.1-1.3 0.1-2.62 0.19-3.87-0.21-5.98-1.41-9.38-3.19-3.24-0.7-3.24-0.7-6-1v-2h-5v-2c-0.74-0.14-1.48-0.29-2.25-0.43-2.27-0.47-4.51-0.99-6.75-1.57v-2c-0.51-0.1-1.03-0.2-1.56-0.31-3.3-0.93-6.31-2.3-9.44-3.69v-2h-3v-2c-0.76-0.29-1.53-0.57-2.31-0.87-2.69-1.13-2.69-1.13-5.69-3.13v-2h-3v-2h-2v-2c-0.6-0.29-1.2-0.57-1.81-0.87-2.19-1.13-2.19-1.13-5.19-3.13v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2c-2.12-1.87-2.12-1.87-4-4v-2h-2c-0.54-0.68-1.07-1.36-1.62-2.06-2.02-2.49-3.89-4.32-6.32-6.37-6.47-5.6-10.8-11.2-13.1-19.6 0.5-0.99 0.5-0.99 1-2h-2c-3.71-10.4-7.29-20.8-10.7-31.2-0.28-0.86-0.56-1.71-0.85-2.6-0.38-1.14-0.38-1.14-0.76-2.3-0.63-1.94-0.63-1.94-1.66-3.89-0.12-1.97-0.17-3.95-0.19-5.92-0.03-1.87-0.03-1.87-0.05-3.78l-0.03-4.11c-0.01-0.69-0.01-1.38-0.02-2.09-0.03-3.66-0.04-7.32-0.06-11-0.01-3.01-0.04-6.03-0.08-9.04-0.05-3.66-0.08-7.31-0.08-11-0.01-1.38-0.02-2.77-0.05-4.15-0.13-8.14 0.49-14.4 4.34-21.6 1.85-3.51 2.89-7.22 4.03-11 4.32-13.5 10.8-26.8 19.2-38.3h2c0.08-0.55 0.16-1.1 0.24-1.67 1.02-3.13 2.76-5.06 4.89-7.58 0.81-0.97 1.63-1.94 2.47-2.93 0.79-0.93 1.58-1.86 2.4-2.82 0.62-0.74 1.24-1.48 1.87-2.25 10.8-12.7 24.8-22.4 39.1-30.8 0.8-0.47 1.6-0.94 2.43-1.43 11-6.29 22.7-10.5 34.6-14.8 2.35-0.86 4.68-1.8 7-2.74 3.36-1.11 5.87-1.12 9.4-1.11z" fill="#455462"/>
  <path transform="translate(300,87)" d="m0 0c1.89 0.28 1.89 0.28 4 1 1.35 2.77 2.39 5.35 3.38 8.25 0.29 0.84 0.59 1.69 0.89 2.56 2.18 6.3 4.17 12.7 6.04 19.1 0.37 1.22 0.37 1.22 0.74 2.47 3.76 13.3 4.35 26.4 4.33 40.2v2.68c-0.03 15.8-1.07 30.1-7.38 44.8-0.39 1.74-0.75 3.49-1.06 5.25-3.98 16.6-15.7 35.7-27.4 48.1-1.63 1.79-2.98 3.67-4.34 5.68-0.72 0.99-1.45 1.98-2.19 3h-2c-0.25 0.58-0.5 1.15-0.75 1.75-1.88 3.39-4.15 5.61-7.5 7.56-2.48 1.52-4.36 3.06-6.5 5-10.9 9.69-10.9 9.69-16.2 9.69v2c-3.47 0.99-3.47 0.99-7 2v2h-4v2h-4v2c-3.62 1.32-6.1 2-10 2v2h-4v2c-0.85 0.2-1.71 0.41-2.59 0.62-1.1 0.27-2.21 0.54-3.35 0.82-1.1 0.26-2.2 0.53-3.34 0.81-2.61 0.48-2.61 0.48-3.72 1.75-2.33 0.33-4.67 0.67-7 1l-1 1c-1.62 0.21-3.25 0.37-4.88 0.5-2.97 0.24-5.27 0.55-8.12 1.5v-2c-0.72 0.33-1.44 0.66-2.19 1-2.83 1.01-4.84 1.17-7.81 1v2h-22v-2c-0.85-0.06-1.69-0.12-2.56-0.18-18-1.33-18-1.33-19.4-2.82-2.33-0.37-4.66-0.7-7-1v-2c-0.87 0.06-1.73 0.12-2.62 0.19-3.87-0.22-5.98-1.42-9.38-3.19-3.24-0.71-3.24-0.71-6-1v-2h-5v-2c-0.74-0.14-1.49-0.29-2.25-0.44-2.27-0.46-4.51-0.98-6.75-1.56v-2c-0.77-0.15-0.77-0.15-1.56-0.31-3.3-0.93-6.31-2.3-9.44-3.69v-2h-3v-2c-0.76-0.29-1.53-0.58-2.31-0.88-2.69-1.12-2.69-1.12-5.69-3.12v-2h-3v-2h-2v-2c-0.6-0.29-1.2-0.58-1.81-0.88-2.19-1.12-2.19-1.12-5.19-3.12v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2c-2.12-1.88-2.12-1.88-4-4v-2h-2c-1.62-2.5-1.62-2.5-3-5 1.18-0.23 2.35-0.45 3.56-0.69 5.8-1.51 9.66-3.77 13.1-8.73 2.78-4.77 4.41-8.29 4.55-13.8 0.34-2.46 0.34-2.46 1.75-4.75 4.9-2.97 10.5-4.53 15.9-6.26 2.57-0.93 4.76-2.28 7.06-3.74 4.76-0.72 7.02 0.55 11 3.03 4.34 2.12 9.33 2.54 14 1.53 4.17-1.57 6.56-3.88 8.95-7.56 1.02-3.06 1.12-5.65 1.19-8.85 0.21-7.84 0.8-13.8 5.81-20.2 0.51-0.67 1.01-1.34 1.54-2.03 3.84-4.73 8.29-8.43 13.1-12.1 2.29-1.82 4.29-3.76 6.33-5.86 3.18-3.22 5.62-4.88 10.2-5.28 2.29 0.02 4.58 0.08 6.87 0.2 2.96 0.25 2.96 0.25 5.89-0.92 2.2-0.25 4.41-0.45 6.62-0.62 1.17-0.1 2.34-0.2 3.54-0.29 0.94-0.03 1.88-0.06 2.84-0.09l1 1c1.52 0.27 3.04 0.52 4.56 0.75 7.65 1.48 13 4.83 17.4 11.2 1.39 3.57 2.51 7.17 3.66 10.8 1.4 3.33 2.36 4.31 5.34 6.18l1 2c5.83 1.94 11.5 2.81 17.2 0.19 4.68-3.01 8.76-6.97 10.8-12.2 0.81-5.45 0.36-9.77-2.25-14.6-1.34-2.64-1.89-3.77-1.23-6.68 1.01-2.13 1.95-3.91 3.48-5.7 0.99-0.33 1.98-0.66 3-1 0.37-1.21 0.37-1.21 0.75-2.44 1.82-5.17 5.05-9.14 8.25-13.6 0.99-1.45 1.97-2.91 2.94-4.38 0.72-1.09 0.72-1.09 1.47-2.21 0.52-0.8 1.05-1.59 1.59-2.41 1.99-3.01 3.99-6.01 6.02-9 1.25-1.9 2.46-3.84 3.59-5.81 5.05-8.4 11.8-10.5 21-12.9 6.39-1.77 9.5-5.03 13.4-10.3z" fill="#B10214"/>
  <path transform="translate(83,55)" d="m0 0c0.5 0.99 0.5 0.99 1 2 0.99 0.49 0.99 0.49 2 1l-2 2h-4l8 3c0.47-0.83 0.95-1.65 1.44-2.5 0.51-0.83 1.03-1.65 1.56-2.5h1c0.99 3.47 0.99 3.47 2 7 2.39-0.58 4.67-1.22 7-2v-2h2l1-2c0.59 1.7 0.59 1.7 1.19 3.44 1.4 3.76 1.4 3.76 4.5 4.5 0.76 0.02 1.52 0.04 2.31 0.06l-2 2c1.16 2.1 1.16 2.1 3 4 2.5 0.58 2.5 0.58 5 0 2.5-1.88 2.99-2.96 4-6 0.61 0.03 1.23 0.07 1.86 0.11 1.22 0.04 1.22 0.04 2.45 0.08 0.8 0.03 1.6 0.07 2.43 0.1 2.74-0.35 3.55-1.18 5.26-3.29 0.99 0.5 0.99 0.5 2 1l1-4c3.7-0.95 6.3-0.95 10 0l1-2c1 3 1 3 0.31 4.94-0.15 1.02-0.15 1.02-0.31 2.06 1.9 2.56 3.38 3.77 6.38 4.88 3.25 0.15 5.61-0.69 8.62-1.88v-2h5v2c0.85 0.18 0.85 0.18 1.72 0.37 1.61 0.35 3.22 0.7 4.82 1.07 1.51 0.34 3.02 0.67 4.55 0.96 1.85 0.41 1.85 0.41 4.91 1.6 1.44 2.62 1.44 2.62 2 5 1.98-0.5 1.98-0.5 4-1v2h2v2c0.96 0.22 0.96 0.22 1.94 0.44 2.06 0.56 2.06 0.56 3.06 1.56 1.13-0.04 2.27-0.08 3.44-0.12 1.17 0.04 2.35 0.08 3.56 0.12 0.99 1.48 0.99 1.48 2 3 2.34 0.36 2.34 0.36 4.94 0.19 0.87-0.03 1.75-0.06 2.65-0.08 0.8-0.04 1.59-0.07 2.41-0.11 3 0 3 0 4.81 0.56 2.32 0.61 2.32 0.61 5.19-0.12 3.23-0.47 4.33-0.19 7 1.56l-1 2h-5v3h-2l-1 3-2-2c-0.45 0.47-0.91 0.95-1.38 1.44-1.62 1.56-1.62 1.56-3.62 2.56-1.02 0.98-2.02 1.98-3 3l-3-2h-2l-1 4c-0.7 0.1-1.4 0.21-2.12 0.31-3.29 0.79-5.9 2.11-8.88 3.69-1.33 0.67-2.67 1.33-4 2 0.23 0.74 0.45 1.48 0.69 2.25 0.31 2.75 0.31 2.75-1.13 4.87-0.77 0.93-0.77 0.93-1.56 1.88v3c2.92 0.17 2.92 0.17 6 0l2-2c3.58-0.84 5.48-1.17 9 0v2c2.31 0.33 4.62 0.66 7 1l1-3v2l4-2c0.99 1.48 0.99 1.48 2 3-0.99 0.5-0.99 0.5-2 1l5 4c0.25-0.62 0.5-1.24 0.75-1.88 1.92-3.25 4.44-3.81 7.87-5.12 2.51-0.88 2.51-0.88 4.38-3 1.99-0.37 3.99-0.71 6-1l2-1h-3c1.65-3.58 3.68-6.81 6-10h2l-2-2 3-2c-0.37-0.8-0.37-0.8-0.75-1.62-0.25-2.38-0.25-2.38 1.5-5.63 1.11-1.36 1.11-1.36 2.25-2.75h3c0.19-1.36 0.19-1.36 0.38-2.75 0.56-2.91 1.32-4.65 2.62-7.25 0.38-1.99 0.73-3.99 1-6l2 1c0.8-1.58 0.8-1.58 1.62-3.19 3.28-5.7 8.24-9.52 14.4-11.8 3.12-0.54 5.9-0.67 9 0 2.45 1.97 3.84 4.35 5.38 7.06 0.41 0.66 0.82 1.32 1.24 1.99 6.38 10.4 6.38 10.4 6.38 15-1.59 3.09-3.63 5.39-6 7.94h-2l-1 3c-1.68 0.81-1.68 0.81-3.88 1.44-4.69 1.41-9.25 3.07-13.8 4.79-2.29 0.77-2.29 0.77-4.29 0.77-0.25 0.54-0.51 1.09-0.77 1.65-1.46 2.8-3.16 5.35-4.92 7.97-0.71 1.07-1.43 2.14-2.17 3.24-1.83 2.69-3.69 5.36-5.58 8.02-2.85 4.04-5.57 8.15-8.25 12.3-0.55 0.85-0.55 0.85-1.11 1.73-1.87 2.91-3.63 5.85-5.28 8.88-1.92 3.2-1.92 3.2-4.92 5.2-1.66 2.53-2.6 5-3 8 0.77 2.14 1.83 3.91 2.99 5.86 1.86 3.94 1.7 7.9 1.01 12.1-2.79 5.93-8.19 11.3-14.2 14-4.73 1.33-8.21 1.05-12.7-0.78-7.35-4.42-9.28-8.38-11.6-16.3-2.14-6.49-5.39-9.07-11.2-12.6-2.67-1.07-4.5-1.51-7.31-1.81-3.81-0.44-3.81-0.44-6.81-2.44l-1 2v-2c-0.7 0.33-1.4 0.66-2.12 1-3.15 1.09-5.58 1.07-8.88 1-0.99 0.5-0.99 0.5-2 1-2.02-0.08-4.04-0.19-6.06-0.31-8.51-0.08-12.7 3.27-18.7 8.87-0.74 0.81-1.49 1.61-2.25 2.44-1.63 1.7-3.29 3.38-5 5h-2c-0.23 0.56-0.45 1.11-0.69 1.69-1.31 2.31-1.31 2.31-3.69 4.56-6.4 6.71-7.13 12.6-7.12 21.5-0.1 6.58-2.16 10.7-6.69 15.6-4.62 2.66-9.07 3.23-14.3 2.07-3.58-1.14-6.37-2.35-9.52-4.45-5.22-0.87-8.11 1.04-12.4 3.62-4.8 2.57-11.1 5.38-16.6 5.38-0.07 0.83-0.15 1.67-0.23 2.53-1.05 9.01-2.99 15.3-9.92 21.4-3.43 2.52-6.24 3.98-10.4 4.93-5.08-1.2-7.88-4.12-11.4-7.81-0.91-0.93-1.81-1.86-2.75-2.81-2.88-4.08-4.97-8.36-6.25-13.2 1.14-3.42 2.44-4.52 5-7 1.05-1.36 1.05-1.36 2.12-2.75 0.62-0.74 1.24-1.49 1.88-2.25h2v-2c7.15-2.33 12.8-2.8 20 0l-5-5c6.4-2.22 6.4-2.22 9.44-1.12 0.77 0.55 0.77 0.55 1.56 1.12v5c2.67-2.49 4.56-4.63 6-8h4c0.62-1.36 0.62-1.36 1.25-2.75 1.65-3.07 3.28-4.86 5.75-7.25l1-3h2v-2h3l3-6c-0.99 0.33-1.98 0.66-3 1l-2-3c1.48-0.93 1.48-0.93 3-1.88 0.99-0.7 1.98-1.4 3-2.12v-2c4-2.83 7.43-1.76 12-1 0.5-1.49 0.5-1.49 1-3 2.06-1.19 2.06-1.19 4-2-0.28 0.96-0.28 0.96-0.56 1.94-0.15 0.68-0.29 1.36-0.44 2.06 1.07 1.3 1.07 1.3 3.56 1.06 0.81-0.02 1.61-0.04 2.44-0.06v-2l-4-2v-3h8l2-2c-1.98-0.5-1.98-0.5-4-1l2-2c0.5-1.49 0.5-1.49 1-3 0.93-0.1 1.86-0.21 2.81-0.31 3.31-0.72 4.06-1.25 6.19-3.69h2c0.5-1.49 0.5-1.49 1-3 2.06-0.69 2.06-0.69 4-1v-3c0.99-0.33 1.98-0.66 3-1l-1-4h5c0.5-1.49 0.5-1.49 1-3 0.99-0.33 1.98-0.66 3-1l1-2h2v-2h4l1-10c-1.98 1.49-1.98 1.49-4 3-2.75-0.81-2.75-0.81-5-2 0.54-0.56 1.07-1.11 1.62-1.69 0.46-0.76 0.91-1.52 1.38-2.31-0.71-2.73-0.71-2.73-2-5 2-2 2-2 4-3-0.56-3.27-1.5-4.83-4-7l2-2c-0.35-1.07-0.7-2.15-1.06-3.25-1.08-4.3-0.84-5.94 1.06-9.75-2.93-0.22-2.93-0.22-5 1 0.17 0.6 0.33 1.2 0.5 1.81 0.5 2.19 0.5 2.19 0.5 5.19 0.04 0.8 0.08 1.61 0.12 2.44-0.13 2.72-0.74 4.24-2.12 6.56h-8c-0.63-2.31-0.63-2.31-1-5l2-3h-2c-0.08-0.78-0.17-1.57-0.25-2.38-0.48-2.77-0.48-2.77-2.81-3.93-0.64-0.23-1.28-0.46-1.94-0.69l2-4-2-1c0-3 0-3 1-5-2.03 0.64-2.03 0.64-4 2-0.81 2.56-0.81 2.56-1 5l-1-2h-5l1 2c-1.48 0.5-1.48 0.5-3 1-2.19-1.44-2.19-1.44-4-3 0 2.85 0.43 5.23 1 8v2c-1.48 0.5-1.48 0.5-3 1l-1-3c-3.12 1.31-3.12 1.31-5 4h-2c-1.12 2.12-1.12 2.12-2 5h3l2 2c0.62-0.66 1.24-1.32 1.88-2 2.12-2 2.12-2 4.12-2 0.5-0.99 0.5-0.99 1-2v2c1.48 0.5 1.48 0.5 3 1l1 3h-2c2.02 3.03 2.76 3.72 6 5h3c1.56 1.38 1.56 1.38 3 3l2 2h-2l-1 2c-2.87-0.57-3.86-0.86-6-3l-1 2c-1.48-0.5-1.48-0.5-3-1 0.99-1.48 0.99-1.48 2-3-1.63 0.23-3.25 0.48-4.88 0.75-1.35 0.21-1.35 0.21-2.74 0.42-2.54 0.61-2.54 0.61-3.7 2.91-0.22 0.63-0.45 1.27-0.68 1.92h-2c-0.41-0.47-0.83-0.95-1.25-1.44-2.41-2.15-4.6-2.21-7.75-2.56 0.82 0.82 1.69 1.61 2.56 2.38 1.95 2.19 1.44 3.8 1.44 6.62h-4c1.13 0.29 2.27 0.58 3.44 0.88 1.76 0.55 1.76 0.55 3.56 1.12l1 2c2.02 0.65 2.02 0.65 4 1v5c-3 1-3 1-6 0-2.23 1.24-2.23 1.24-4 3 0 2.16 0.45 3.92 1 6l-5 1 2 1c-0.5 1.49-0.5 1.49-1 3-2.31 0.62-2.31 0.62-5 1l-3-2v8c-1.98 0.5-1.98 0.5-4 1l-2-5-1 2-1-3 2-2c2.61-3.05 2.61-3.05 3-7-0.99 0.5-0.99 0.5-2 1l-1-1c-0.99 0.5-0.99 0.5-2 1l1-7c-0.99 0.33-1.98 0.66-3 1l-4-9 2-2c0.64-2.07 0.64-2.07 1-4-2.39 0.58-4.67 1.22-7 2v-2h-3l-2 4c-0.34-1.44-0.67-2.87-1-4.31-0.19-0.8-0.37-1.6-0.56-2.43-0.44-2.26-0.44-2.26-0.44-5.26 3.75-1.12 3.75-1.12 6 0l1-2c3 1 3 1 4 3 0.49-1.48 0.49-1.48 1-3 3-1 3-1 6 0l-2-2c-1.25-1.81-1.25-1.81-2-4 0.88-2.75 0.88-2.75 2-5l1 3h3v-4c-0.99-0.5-0.99-0.5-2-1h2c0.5-0.99 0.5-0.99 1-2l7 2c-0.99 0.33-1.98 0.66-3 1l2 4c1.56-1.31 1.56-1.31 3-3v-3c0.31-2 0.65-4 1-6-0.99-0.5-0.99-0.5-2-1-0.19-0.9-0.19-0.9-0.38-1.81-0.82-2.89-2.42-4.21-4.62-6.19l-3 3v-3l-1-3 5-1-2-2c-0.5-0.99-0.5-0.99-1-2h-2v-7c0.5 0.99 0.5 0.99 1 2l2-1c-0.5-0.99-0.5-0.99-1-2h2v-2h3l-3-3c1.75-0.03 3.5-0.05 5.25-0.06 1.46-0.02 1.46-0.02 2.95-0.04 2.46 0.09 4.46 0.39 6.8 1.1v-1l-15-1v-1h14c-0.99-1.48-0.99-1.48-2-3-3.57-0.74-3.57-0.74-7-1l-1 2-3-3 2-2c-0.99-0.33-1.98-0.66-3-1l1-3 4 1c0.5 1.98 0.5 1.98 1 4v-4c1.98-0.66 3.96-1.32 6-2z" fill="#465564"/>
  <path transform="translate(300,87)" d="m0 0c1.98 0.5 1.98 0.5 4 1l1 6c-1.49 0.5-1.49 0.5-3 1-1.84 1.95-3.49 4.01-5.18 6.09-2.44 2.57-4.59 3.71-8.07 4.29-3.86 0.87-7.47 2.4-10.8 4.62l-1 3c-0.74 0.65-0.74 0.65-1.5 1.31-2.15 2.42-2.3 4.52-2.5 7.69 2.79 2.79 5.1 2.37 8.91 2.56 2.09 0.44 2.09 0.44 4.09 3.44v1l4 2c0.25 2.31 0.25 2.31 0 5-1.3 1.05-2.63 2.05-4 3-0.94 2.52-1 4.28-1 7-1 2.33-2 4.67-3 7v3l-2 3v3c-0.63 1.35-1.3 2.68-2 4l-1 3-7-5c-2.28 2.05-2.28 2.05-4 5 0.7 3.45 0.7 3.45 2 7 0.04 2.33 0.04 4.67 0 7 0.19 0.72 0.37 1.44 0.56 2.19 0.55 2.25 0.08 3.61-0.56 5.81v3h-3c-1.7 0.95-3.37 1.94-5 3-2.06-2.25-2.06-2.25-4-5 0.19-0.64 0.37-1.28 0.56-1.94 0.71-2.13 0.71-2.13-0.77-3.98-0.57-0.61-1.14-1.21-1.73-1.83-0.56-0.61-1.13-1.23-1.71-1.86-0.67-0.69-0.67-0.69-1.35-1.39 1.81-0.62 1.81-0.62 4-1l3 2c-1.98-2.31-3.96-4.62-6-7-4.64 4.53-4.64 4.53-6.5 10.6 0.16 3.34 0.16 3.34 2.06 5 1.21 0.69 1.21 0.69 2.44 1.38 1.15 0.85 2.3 1.7 3.44 2.56 2.15 1.55 3.81 2.54 6.31 3.5 2.85 1.19 3.93 2.14 5.25 4.94-0.75 3-0.75 3-2 6-0.73 2.57-1 4.29-1 7-2 1.69-2 1.69-4 3l-3-2c-1.14 0.77-1.14 0.77-2.31 1.56-0.89 0.48-1.78 0.95-2.69 1.44-0.99-0.33-1.98-0.66-3-1-2.35 0.96-4.68 1.97-7 3-3 0-3 0-6-2-0.56 0.52-1.11 1.03-1.69 1.56-2.96 1.84-4.01 1.12-7.31 0.44-2.55 1.67-3.11 3.27-4.25 6.12-0.58 0.95-1.16 1.9-1.75 2.88-3.69 0.88-3.69 0.88-7 1l-1 3c-0.76-0.35-1.53-0.7-2.31-1.06-2.74-1.26-2.74-1.26-5.69 0.06-1.34-0.99-2.68-1.99-4-3-2.65-0.71-2.65-0.71-5-1-2.22 3.25-4.35 6.42-6 10-1.01-0.85-2.02-1.69-3.06-2.56-3.03-2.18-3.75-2.44-7.69-2.38-3.36 0.79-3.36 0.79-6.25 2.94h-3c-2.67 1.94-2.67 1.94-5 4l-1.5-1.5c-3.7-2.22-6.21-1.84-10.5-1.5-2.97 1.84-2.97 1.84-5 4l-5-2c-0.25 0.95-0.5 1.9-0.75 2.88-1.47 3.66-1.91 3.52-5.25 5.12-1.95 1.71-1.95 1.71-3.75 3.62-0.61 0.64-1.23 1.27-1.86 1.92-0.69 0.72-0.69 0.72-1.39 1.46l1 3h-3c-2.22 1.93-2.22 1.93-3 5l2 3-4 1v-2c-0.99 0.33-1.98 0.66-3 1-2.19-1.44-2.19-1.44-4-3-2.33 0.96-2.33 0.96-4 4 1.14 0.34 1.14 0.34 2.31 0.69 3.32 1.62 3.86 3.16 5.69 6.31 4.01 4.04 4.01 4.04 9.38 5.31 0.86-0.1 1.73-0.2 2.62-0.31l-2-3v-3h2c1.39 1.96 2.73 3.96 4 6l-2 4c-0.93-0.08-1.86-0.16-2.81-0.25-3.24-0.09-3.24-0.09-5.07 2.06-1.35 2.22-1.35 2.22-1.12 5.19 2.35 2.75 4.17 4.68 7.56 6 3.18 1.3 4.48 3.24 6.44 6-1.57 1.81-2.79 2.91-5 3.88-0.66 0.04-1.32 0.08-2 0.12-0.45-0.47-0.91-0.95-1.38-1.44-1.61-1.88-1.61-1.88-4.62-1.75-0.99 0.06-1.98 0.13-3 0.19h-3c-0.8 0.35-1.61 0.7-2.44 1.06-2.77 1.02-3.85 0.94-6.56-0.06l-1 2-11-1v-2c-0.74-0.14-1.49-0.29-2.25-0.44-2.27-0.46-4.51-0.98-6.75-1.56v-2c-0.77-0.15-0.77-0.15-1.56-0.31-3.3-0.93-6.31-2.3-9.44-3.69v-2h-3v-2c-0.76-0.29-1.53-0.58-2.31-0.88-2.69-1.12-2.69-1.12-5.69-3.12v-2h-3v-2h-2v-2c-0.6-0.29-1.2-0.58-1.81-0.88-2.19-1.12-2.19-1.12-5.19-3.12v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2c-2.12-1.88-2.12-1.88-4-4v-2h-2c-1.62-2.5-1.62-2.5-3-5 1.18-0.23 2.35-0.45 3.56-0.69 5.8-1.51 9.66-3.77 13.1-8.73 2.78-4.77 4.41-8.29 4.55-13.8 0.34-2.46 0.34-2.46 1.75-4.75 4.9-2.97 10.5-4.53 15.9-6.26 2.57-0.93 4.76-2.28 7.06-3.74 4.76-0.72 7.02 0.55 11 3.03 4.34 2.12 9.33 2.54 14 1.53 4.17-1.57 6.56-3.88 8.95-7.56 1.02-3.06 1.12-5.65 1.19-8.85 0.21-7.84 0.8-13.8 5.81-20.2 0.51-0.67 1.01-1.34 1.54-2.03 3.84-4.73 8.29-8.43 13.1-12.1 2.29-1.82 4.29-3.76 6.33-5.86 3.18-3.22 5.62-4.88 10.2-5.28 2.29 0.02 4.58 0.08 6.87 0.2 2.96 0.25 2.96 0.25 5.89-0.92 2.2-0.25 4.41-0.45 6.62-0.62 1.17-0.1 2.34-0.2 3.54-0.29 0.94-0.03 1.88-0.06 2.84-0.09l1 1c1.52 0.27 3.04 0.52 4.56 0.75 7.65 1.48 13 4.83 17.4 11.2 1.39 3.57 2.51 7.17 3.66 10.8 1.4 3.33 2.36 4.31 5.34 6.18l1 2c5.83 1.94 11.5 2.81 17.2 0.19 4.68-3.01 8.76-6.97 10.8-12.2 0.81-5.45 0.36-9.77-2.25-14.6-1.34-2.64-1.89-3.77-1.23-6.68 1.01-2.13 1.95-3.91 3.48-5.7 0.99-0.33 1.98-0.66 3-1 0.37-1.21 0.37-1.21 0.75-2.44 1.82-5.17 5.05-9.14 8.25-13.6 0.99-1.45 1.97-2.91 2.94-4.38 0.72-1.09 0.72-1.09 1.47-2.21 0.52-0.8 1.05-1.59 1.59-2.41 1.99-3.01 3.99-6.01 6.02-9 1.25-1.9 2.46-3.84 3.59-5.81 5.05-8.4 11.8-10.5 21-12.9 6.39-1.77 9.5-5.03 13.4-10.3z" fill="#B60715"/>
  <path transform="translate(794,82)" d="m0 0c16.7 13.5 28.6 31.1 34 52 0.18 0.67 0.35 1.34 0.53 2.03 1.81 7.77 1.87 15.5 1.85 23.5-0.01 0.71-0.01 1.42-0.01 2.15-0.09 27.1-8.7 48.8-27.6 68.2-18 17.8-44 24.3-68.8 24.7-23.5-0.19-47.5-9.19-64.6-25.2-8.41-8.55-20.4-21.7-20.4-34.4h-2v-6h-2v-7h-2c-0.06-0.99-0.12-1.97-0.18-2.99-0.09-1.28-0.17-2.56-0.26-3.89-0.12-1.91-0.12-1.91-0.24-3.86-0.11-3.14-0.11-3.14-1.32-5.26-0.1-2.35-0.13-4.71-0.12-7.06-0.01-1.27-0.01-2.54-0.01-3.85 0.13-3.09 0.13-3.09 1.13-4.09 0.23-2.18 0.41-4.37 0.56-6.56 0.09-1.2 0.17-2.4 0.26-3.63 0.06-0.93 0.12-1.86 0.18-2.81h2v-7h2v-6h2c0.1-0.69 0.21-1.38 0.31-2.09 2.53-10.7 9.39-20 16.7-27.9 0.44-0.5 0.89-1 1.35-1.51 7.31-8.12 14.8-13.7 24.6-18.5 0.96-0.48 1.93-0.96 2.92-1.46 30.3-13.9 72-11.7 99.1 8.46zm-82 16v2c-0.95 0.14-1.9 0.29-2.88 0.44-3.01 0.39-3.01 0.39-5.12 1.56v2h-4v2c-1.98 0.66-3.96 1.32-6 2v2h-2v2h-2v2h-2v3h-2v3h-2v2h-2v3h-2c-1.5 3.37-2 5.2-2 9h-2v5h-2c-0.22 1.95-0.22 1.95-0.44 3.94-0.44 3.94-0.44 3.94-1.56 5.06-0.1 1.99-0.13 3.98-0.13 5.97 0 1.21-0.01 2.42-0.01 3.67 0.01 1.27 0.01 2.55 0.02 3.86-0.01 1.27-0.01 2.55-0.02 3.86 0 1.21 0.01 2.42 0.01 3.67v3.39c-0.16 2.51-0.16 2.51 1.13 3.58 0.14 1.07 0.29 2.14 0.44 3.25 0.49 3.27 1.2 5.76 2.56 8.75h2v4h2v4h2v3h2v3h2v2h2v2h2v2h2v2h2v2h2v2h4v2c1.24 0.68 2.5 1.34 3.75 2 1.04 0.56 1.04 0.56 2.11 1.12 2.37 1.13 2.37 1.13 6.14 0.88v2c7.32 2.43 14.6 2.27 22.2 2.21 2.24-0.02 4.47-0.02 6.71-0.02 6.53 0.64 6.53 0.64 12.1-1.19 2.65-0.45 5.32-0.7 8-1v-2c0.68-0.1 1.36-0.21 2.06-0.31 3.57-0.84 6.6-2.18 9.94-3.69v-2c0.62-0.14 1.24-0.29 1.88-0.44 2.15-0.49 2.15-0.49 4.12-1.56v-2c0.56-0.23 1.11-0.45 1.69-0.69 4.69-2.66 8.16-6.99 11.3-11.3v-2h2c0.97-1.81 1.93-3.62 2.88-5.44 0.53-1.01 1.06-2.02 1.61-3.06 3.83-8.9 3.88-17.6 3.89-27.2 0.02-1.28 0.04-2.56 0.07-3.88 0.04-11.9-2.74-22-8.45-32.4h-2c-0.1-0.58-0.21-1.16-0.31-1.75-0.8-2.61-1.88-4.22-3.69-6.25h-2v-2h-2v-2h-2v-2h-2v-2c-2.82-2.28-2.82-2.28-6-2v-2h-3v-2c-3.09-1.76-4.23-2-8-2v-2c-1.13-0.14-2.27-0.29-3.44-0.44-3.56-0.56-3.56-0.56-4.56-1.56-1.66-0.21-3.33-0.37-5-0.5-4.89-0.39-4.89-0.39-6-1.5-11.3-0.89-21.2 0.79-32 4z" fill="#06203D"/>
  <path transform="translate(1479 64.7)" d="m0 0c1.43 0.08 2.86 0.15 4.29 0.23 23.6 1.2 47.7 8.13 64.9 25.1v2h2c6.93 6.91 10.9 15.3 15 24 0.53 1 1.05 2 1.6 3.02 1.45 3.09 2.27 5.97 3.02 9.29 0.59 3.65 0.59 3.65 2.38 6.69 0.21 1.64 0.37 3.29 0.5 4.93 0.25 3.67 0.25 3.67 1.5 7.07 1.46 21.2-1.68 40.4-10 60h-2c-0.16 0.8-0.16 0.8-0.31 1.62-0.87 3-2.25 5.62-3.69 8.38h-2c-0.1 0.57-0.21 1.15-0.31 1.75-0.8 2.6-1.88 4.22-3.69 6.25h-2c-0.25 0.57-0.5 1.15-0.75 1.75-1.43 2.58-3.04 4.31-5.25 6.25h-2v2c-29.6 24.9-79.6 19-113 19v-134c26 0 26 0 28 1v105h2v2c4.69-0.07 9.39-0.16 14.1-0.27 1.59-0.03 3.18-0.06 4.78-0.08 2.3-0.03 4.61-0.09 6.91-0.14 1.05-0.01 1.05-0.01 2.13-0.02 5.25-0.15 9.22-1.53 14.1-3.49 3-0.19 3-0.19 5 0v-2c2.9-1.26 4.79-2 8-2v-2c1.98-0.66 3.96-1.32 6-2v-2c1.65-1.36 3.32-2.69 5-4l1-2h2v-2h2l2-6h2c0.13-0.58 0.26-1.15 0.4-1.74 0.59-2.24 1.33-4.35 2.16-6.51 0.27-0.71 0.54-1.42 0.82-2.14 0.2-0.53 0.41-1.07 0.62-1.61h2v-7h2c-0.01-0.64-0.02-1.28-0.04-1.94-0.01-0.82-0.01-1.65-0.02-2.5-0.02-0.82-0.03-1.65-0.04-2.5 0.1-2.06 0.1-2.06 1.1-3.06 0.1-1.63 0.13-3.25 0.13-4.88 0-0.98 0-1.97 0.01-2.98-0.01-1.04-0.01-2.07-0.02-3.14 0.01-1.04 0.01-2.08 0.02-3.14-0.01-0.99-0.01-1.97-0.01-2.99v-2.76c0.1-2.1 0.1-2.1-1.13-3.11-0.32-2.58-0.51-5.16-0.72-7.75-0.04-2.22-0.04-2.22-1.28-3.25-0.04-2-0.04-4 0-6h-2c-1.5-3.37-2-5.21-2-9h-2c-2-3-2-3-2-6h-2c-1.17-1.71-2.34-3.41-3.49-5.12-1.61-2.01-3.2-3.26-5.32-4.7-1.58-1.08-1.58-1.08-3.19-2.18v-2h-3v-2h-4v-2c-1.08-0.19-1.08-0.19-2.19-0.38-2.81-0.62-2.81-0.62-5.19-1.62-3.17-1.21-6.26-1.55-9.62-2l-1-1c-1.99-0.13-3.99-0.18-5.99-0.21-1.28-0.02-2.56-0.04-3.88-0.06-1.41-0.02-2.82-0.03-4.23-0.05-1.43-0.02-2.87-0.04-4.3-0.06-3.78-0.06-7.56-0.11-11.3-0.15-3.85-0.06-7.71-0.11-11.6-0.17-7.57-0.1-15.1-0.2-22.7-0.3v-26c12.8-6.39 36-2.08 49.8-1.31z" fill="#06213F"/>
  <path transform="translate(1009,80)" d="m0 0 2 2c-0.27 4.18-1.07 6.95-4 10h-2c-0.43 1.36-0.43 1.36-0.88 2.75-0.89 2.57-1.83 4.86-3.12 7.25h-2l-2 4c-2.67-0.67-5.33-1.33-8-2v-2h-3v-2c-0.72-0.14-1.44-0.29-2.19-0.44-2.6-0.52-5.21-1.04-7.81-1.56v-2c-1.05 0.02-1.05 0.02-2.12 0.04-1.36 0.01-1.36 0.01-2.76 0.02-1.35 0.02-1.35 0.02-2.74 0.04-2.38-0.1-2.38-0.1-4.38-1.1-11.6-0.89-22 1.19-32.6 5.98-2.4 1.02-2.4 1.02-4.4 1.02v2h-4v2h-2v2h-2v2h-2v2h-2v2h-2v2h-2v2h-2v3h-2v3h-2v4h-2v5h-2v5h-2c0.01 0.64 0.02 1.28 0.04 1.93 0 0.83 0.01 1.66 0.02 2.51 0.01 0.82 0.03 1.64 0.04 2.49-0.1 2.07-0.1 2.07-1.1 3.07-0.1 1.91-0.13 3.83-0.13 5.75 0 1.17-0.01 2.33-0.01 3.53 0.01 1.84 0.01 1.84 0.02 3.72-0.01 1.23-0.01 2.45-0.02 3.72 0.01 1.75 0.01 1.75 0.01 3.53v3.27c-0.15 2.42-0.15 2.42 1.13 3.48 0.33 2.33 0.67 4.67 1 7l1 1c0.04 1.67 0.04 3.33 0 5h2v4h2v4h2l2 6h2v2h2v2h2v2h2v2h2v2h2v2c2.97 0.99 2.97 0.99 6 2v2h4v2h4v2c1.45-0.03 1.45-0.03 2.94-0.06 3.06 0.06 3.06 0.06 4.06 1.06 2.43 0.13 4.82 0.19 7.25 0.2 1.11 0.01 1.11 0.01 2.23 0.02 1.56 0.01 3.12 0.02 4.68 0.02 2.37 0.01 4.73 0.04 7.1 0.07 1.52 0.01 3.04 0.01 4.56 0.02 1.05 0.02 1.05 0.02 2.12 0.04 6.32-0.03 11.3-1.85 16.9-4.93 3.2-3.21 3.2-3.21 5.19-12.4h29c1.28 5.11 1.13 9.76 1 15 0.01 0.97 0.01 1.95 0.02 2.95-0.2 6.92-0.2 6.92-2.36 9.9-1.8 1.59-3.62 2.87-5.66 4.15-0.62 0.44-1.25 0.88-1.89 1.33-20.5 13.8-50.8 17.6-74.6 13.2-23.9-4.94-42.5-16.5-56.6-36.8-6.48-10.1-12.6-21.6-13.9-33.7l-1-1c-0.39-3.69-0.48-7.41-0.62-11.1-0.05-1.09-0.09-2.17-0.14-3.29-0.29-8.23-0.37-16.4 0.76-24.6l1-1c0.12-1.03 0.25-2.06 0.38-3.12 0.65-4.08 1.91-7.13 3.62-10.9 0.49-1.31 0.97-2.62 1.44-3.94 7.47-20 22.6-38.4 41.9-47.8 30.3-13.8 66.2-13.5 94.7 4.73z" fill="#06213E"/>
  <path transform="translate(18,84)" d="m0 0h2l-1 3c1.37 1.54 1.37 1.54 3 3h2l1 2 4-1c0.34 0.96 0.34 0.96 0.69 1.94 1.16 2.33 1.16 2.33 3.93 2.81 0.79 0.08 1.57 0.16 2.38 0.25 0.49 1.48 0.49 1.48 1 3-1.12 1.56-1.12 1.56-3 3-3.19-0.31-3.19-0.31-6-1-0.1 0.54-0.21 1.07-0.31 1.62-0.69 2.38-0.69 2.38-2.38 5.19-1.69 4.11-0.85 6.13 0.69 10.2l7-2c0.99 1.65 1.98 3.3 3 5-1.98 0.5-1.98 0.5-4 1l2 2c-0.99 0.5-0.99 0.5-2 1l-2-1 1 5-4 2c0.56 3.27 1.5 4.83 4 7l-1 3c3.42 0.25 3.42 0.25 7 0l2-3c1.99-0.37 3.99-0.7 6-1 0.49-0.99 0.49-0.99 1-2 2.56-0.62 2.56-0.62 5-1l1 3c0.99 0.5 0.99 0.5 2 1v-3h5c0.43 1.13 0.87 2.27 1.31 3.44 0.56 1.17 1.12 2.35 1.69 3.56 0.99 0.33 1.98 0.66 3 1l-1 7 1-2 5 1c-0.38 2.94-0.38 2.94-1 6-0.99 0.5-0.99 0.5-2 1l1 2h-4l1 2h3l1 3 2-1v-7c3 0 3 0 5 1 2.12-0.89 2.12-0.89 4-2l-1-2 4-2-2-5c6.94-4.2 6.94-4.2 12-3l-4-3h4v-2c-1.18 0.09-1.18 0.09-2.38 0.19-0.86-0.06-1.73-0.13-2.62-0.19l-2-3c-3.07-0.73-3.07-0.73-6-1l2-2h1l1-5c-1.98-0.5-1.98-0.5-4-1 0.5-0.99 0.5-0.99 1-2h2c0.5-0.99 0.5-0.99 1-2v3c0.99-0.33 1.98-0.66 3-1 1.48 0.99 1.48 0.99 3 2v2c1.71-1.63 2.93-2.87 4-5 3.37-0.53 6.6-1 10-1l-1 3 2 1 1-3 6 3c0.5-0.99 0.5-0.99 1-2l-5-5c-0.5 0.99-0.5 0.99-1 2l-6-4c0.5-1.48 0.5-1.48 1-3-1.31-1.56-1.31-1.56-3-3h-3c-0.5 1.48-0.5 1.48-1 3-2.06 1.69-2.06 1.69-4 3-0.5-1.98-0.5-1.98-1-4h-3c-0.5-1.48-0.5-1.48-1-3 0.78-0.25 1.57-0.5 2.38-0.75 2.94-1.4 3.52-2.26 4.62-5.25h4c0.5 0.99 0.5 0.99 1 2h2c-0.5-1.64-0.5-1.64-1-3.31-1-3.69-1-3.69-1-6.69 3 0 3 0 6 2l1-3c2.97 0.5 2.97 0.5 6 1v-5c2.97-0.5 2.97-0.5 6-1v12c1.48 0.5 1.48 0.5 3 1v5h2l-1 7h3 5c0.16-1.26 0.33-2.52 0.5-3.81 0.09-0.71 0.19-1.42 0.28-2.15 0.27-2.49 0.34-4.61-0.34-7.04-0.44-2-0.44-2 0.56-5l5 1c0 3 0 3-0.56 4.94-0.51 2.37-0.06 3.75 0.56 6.06l-1 2 2 1c-0.99 1.48-0.99 1.48-2 3l4 2c-0.31 2.37-0.31 2.37-1 5l-3 2 2 6-3 3c1.79 0.78 1.79 0.78 4 1 2.25-1.35 2.25-1.35 4-3 0.97 3.12 0.99 5.52 0.56 8.75-0.1 0.8-0.2 1.6-0.31 2.42-0.08 0.61-0.16 1.21-0.25 1.83l-1-2h-4v2h-2c-0.29 0.64-0.58 1.28-0.88 1.94-1.12 2.06-1.12 2.06-3.12 3.06-1.02 0.98-2.02 1.98-3 3l-1-2h-2c0.19 0.58 0.37 1.16 0.56 1.75 0.49 2.51 0.42 3.89-0.56 6.25-1.48 0.5-1.48 0.5-3 1l-2-1-2 6h-4c-0.27 0.64-0.54 1.28-0.81 1.94-1.19 2.06-1.19 2.06-4.19 3.06l-2-2v3l-1 1c1.48 0.5 1.48 0.5 3 1-2.19 2.06-2.19 2.06-5 4-2.81-0.25-2.81-0.25-5-1v2l5 1c-0.99 0.5-0.99 0.5-2 1l1 3c-2.88 0.19-2.88 0.19-6 0l-2-3-1 1c-3.04 0.46-6.07 0.89-9.12 1.25-2.94 1.17-4.7 3.51-6.88 5.75-1.48 0.5-1.48 0.5-3 1l2 2h2c-0.56 3.27-1.5 4.83-4 7l-2-1v2h-2c-0.1 0.6-0.21 1.2-0.31 1.81-0.81 2.57-1.8 3.3-3.69 5.19-0.64 1.2-1.26 2.41-1.88 3.62-2.12 3.38-2.12 3.38-4.74 4-0.79 0.13-1.57 0.25-2.38 0.38-1.16 2.47-1.16 2.47-2 5-0.99 0.33-1.98 0.66-3 1v-5c-4.05-1.16-6.22-0.84-10 1l5 3-1 2c-0.85-0.33-1.69-0.66-2.56-1-5.95-1.73-11.4-0.99-17.4 0v2c-1.62 1.71-3.3 3.37-5 5-1.33 1.39-1.33 1.39-2.69 2.81-2.31 2.19-2.31 2.19-4.31 2.19-3.71-10.4-7.29-20.8-10.7-31.2-0.28-0.85-0.56-1.71-0.85-2.59-0.38-1.14-0.38-1.14-0.76-2.3-0.63-1.94-0.63-1.94-1.66-3.89-0.12-1.97-0.17-3.95-0.19-5.93-0.02-1.24-0.03-2.49-0.05-3.77l-0.03-4.11c-0.01-0.69-0.01-1.38-0.02-2.09-0.03-3.66-0.05-7.33-0.06-11-0.01-3.02-0.04-6.03-0.08-9.05-0.05-3.65-0.08-7.3-0.08-11-0.01-1.39-0.03-2.77-0.05-4.16-0.13-8.13 0.49-14.4 4.33-21.6 1.9-3.59 2.98-7.4 4.17-11.3 5.63-17.6 5.63-17.6 10.1-22.1z" fill="#455562"/>
  <path transform="translate(289,61)" d="m0 0c2.45 1.97 3.84 4.35 5.38 7.06 0.41 0.66 0.82 1.32 1.24 1.99 6.38 10.4 6.38 10.4 6.38 15-1.59 3.09-3.63 5.39-6 7.94h-2l-1 3c-1.68 0.81-1.68 0.81-3.88 1.44-4.69 1.41-9.25 3.07-13.8 4.79-2.29 0.77-2.29 0.77-4.29 0.77-0.25 0.54-0.51 1.09-0.77 1.65-1.46 2.8-3.16 5.35-4.92 7.97-0.71 1.07-1.43 2.14-2.17 3.24-1.83 2.69-3.69 5.36-5.58 8.02-2.85 4.04-5.57 8.15-8.25 12.3-0.55 0.85-0.55 0.85-1.11 1.73-1.87 2.91-3.63 5.85-5.28 8.88-1.92 3.2-1.92 3.2-4.92 5.2-1.66 2.53-2.6 5-3 8 0.77 2.14 1.83 3.91 2.99 5.86 1.86 3.94 1.7 7.9 1.01 12.1-2.79 5.93-8.19 11.3-14.2 14-4.73 1.33-8.21 1.05-12.7-0.78-7.35-4.42-9.28-8.38-11.6-16.3-2.14-6.49-5.39-9.07-11.2-12.6-2.67-1.07-4.5-1.51-7.31-1.81-3.81-0.44-3.81-0.44-6.81-2.44l-1 2v-2c-0.7 0.33-1.4 0.66-2.12 1-3.15 1.09-5.58 1.07-8.88 1-0.99 0.5-0.99 0.5-2 1-2.02-0.08-4.04-0.19-6.06-0.31-8.51-0.08-12.7 3.27-18.7 8.87-0.74 0.81-1.49 1.61-2.25 2.44-1.63 1.7-3.29 3.38-5 5h-2c-0.23 0.56-0.45 1.11-0.69 1.69-1.31 2.31-1.31 2.31-3.69 4.56-6.4 6.71-7.13 12.6-7.12 21.5-0.1 6.58-2.16 10.7-6.69 15.6-4.62 2.66-9.07 3.23-14.3 2.07-3.58-1.14-6.37-2.35-9.52-4.45-5.22-0.87-8.11 1.04-12.4 3.62-4.8 2.57-11.1 5.38-16.6 5.38-0.07 0.83-0.15 1.67-0.23 2.53-1.05 9.01-2.99 15.3-9.92 21.4-3.43 2.52-6.24 3.98-10.4 4.93-5.08-1.2-7.88-4.12-11.4-7.81-0.91-0.93-1.81-1.86-2.75-2.81-2.88-4.08-4.97-8.36-6.25-13.2 1.14-3.42 2.44-4.52 5-7 1.05-1.36 1.05-1.36 2.12-2.75 0.62-0.74 1.24-1.49 1.88-2.25h2v-2c6.24-2.04 11.2-2.96 17.6-0.75 3.18 1.65 5.64 3.47 8.38 5.75 0.99 0.33 1.98 0.66 3 1l1-3c1.66-1.01 3.33-2.01 5-3v-2c1.94-0.5 3.87-1 5.81-1.5 1.62-0.42 1.62-0.42 3.27-0.84 2.92-0.66 2.92-0.66 5.92-0.66v-2l2-1c0.44-3.09 0.74-6.16 0.95-9.28 0.52-5.22 2.08-7.4 6.05-10.7 0.53-0.52 1.05-1.04 1.6-1.58 4.53-3.81 8.64-4.03 14.4-3.8 4.06 0.52 7.25 1.67 11 3.38v-3h2v-3c1.6-1.82 3.21-3.38 5-5 1.09-1.01 1.09-1.01 2.21-2.04 16.3-15 16.3-15 19.8-15 0.91-3.13 1.14-5.96 1.18-9.21 0.03-1.5 0.03-1.5 0.07-3.02 0.04-2.09 0.07-4.18 0.09-6.26 0.17-6.06 0.46-9.98 4.66-14.5 3.19-0.88 3.19-0.88 7-1 0.75-0.04 1.5-0.07 2.28-0.11 5.83-0.19 9.49 0.48 14.3 3.99 4.43 5.67 6.8 12.9 6.44 20.1 1.22 0.39 2.43 0.78 3.69 1.19 2.85 0.93 5.59 1.93 8.35 3.12 10.1 4.31 18.5 5.26 29 1.69 1.78-0.27 3.58-0.48 5.38-0.62 1.31-0.12 1.31-0.12 2.64-0.23 0.98-0.08 0.98-0.08 1.98-0.15 0.26-0.73 0.52-1.46 0.78-2.21 1.26-2.89 2.73-4.92 4.72-7.35 2.23-2.73 3.97-5.27 5.5-8.44l3-3 1.06-2.12c0.94-1.88 0.94-1.88 2.94-2.88 0.45-0.91 0.91-1.81 1.38-2.75 1.57-3.16 3.41-5.52 5.62-8.25l1-3 3-3c0.52-0.89 1.03-1.77 1.56-2.69 0.48-0.76 0.95-1.52 1.44-2.31h2c2.01-4.15 2.18-7.42 2.06-12-0.06-5.06-0.05-10.1 0.25-15.1 0.06-1.02 0.12-2.03 0.18-3.08 1.1-6.06 4.71-9.22 9.51-12.8 4.79-3.08 9.4-4.2 15-3z" fill="#F6F3F4"/>
  <path transform="translate(811,110)" d="m0 0 2 6h-2c0.5 0.99 0.5 0.99 1 2 1.66 0.35 3.33 0.68 5 1l3 2v-2c0.99 0.33 1.98 0.66 3 1 10.5 21.2 10.4 51.7 3 74-6.87 20.3-22.3 39.5-41.5 49.4-24 10.8-51.2 14.5-76.5 6.57 2.05-2.25 3.01-3 6-4l2-1c-1.2-3.08-2.48-6.06-4-9l-1-2c-2.02-0.65-2.02-0.65-4-1v-4c4.52-1.13 4.52-1.13 6.88-0.5 3.15 0.74 5.96 0.05 9.12-0.5 0.5-1.49 0.5-1.49 1-3l-4-1c0.96-0.03 1.93-0.05 2.92-0.08 3.57-0.09 7.13-0.19 10.7-0.29 1.54-0.05 3.09-0.09 4.63-0.13 2.22-0.05 4.44-0.12 6.65-0.18 0.7-0.02 1.39-0.04 2.11-0.05 3.28 0.16 3.28 0.16 5.99-1.27 2.67-0.14 5.32-0.04 8 0v-2l3.75-1.44c0.7-0.26 1.39-0.53 2.11-0.81 2.03-0.71 4.04-1.26 6.14-1.75v-2c1.98-0.66 3.96-1.32 6-2v-2c4.47-4 4.47-4 7-4 0.5-1.49 0.5-1.49 1-3 0.62 0.17 1.24 0.33 1.88 0.5 2.08 0.58 2.08 0.58 4.12 0.5h2c0.12-0.74 0.25-1.49 0.38-2.25 0.58-2.58 1.25-4.5 2.62-6.75l2-1-3-3 5-1 1-8c1.49 0.5 1.49 0.5 3 1-0.19-0.85-0.37-1.69-0.56-2.56-0.48-3.74-0.16-6.76 0.56-10.4l1-1-1-3v-4h2l-1-3 2-1 2 2c0.99-0.33 1.98-0.66 3-1 0.82-1.96 0.82-1.96 1-4l-1-1c-0.04-1.67-0.04-3.33 0-5h-2c-1.12-6.62-1.12-6.62 0-10h2v-2h-4l-2 2v-2h-2c-0.25-1.11-0.5-2.23-0.75-3.38-0.8-3.67-0.8-3.67-3.19-4.62-0.68-0.33-1.36-0.66-2.06-1-0.75-1.72-1.48-3.44-2.14-5.19-1.34-2.82-3.65-4.66-5.86-6.81v-3c0.95 0.5 1.9 0.99 2.88 1.5 2.84 1.64 2.84 1.64 5.12 1.5v-5c4.12-1.63 6.71-2.26 11-1z" fill="#06213C"/>
  <path transform="translate(18,84)" d="m0 0h2l-1 3c1.37 1.54 1.37 1.54 3 3h2l1 2 4-1c0.34 0.96 0.34 0.96 0.69 1.94 1.16 2.33 1.16 2.33 3.93 2.81 0.79 0.08 1.57 0.16 2.38 0.25 0.49 1.48 0.49 1.48 1 3-1.12 1.56-1.12 1.56-3 3-3.19-0.31-3.19-0.31-6-1-0.1 0.54-0.21 1.07-0.31 1.62-0.69 2.38-0.69 2.38-2.38 5.19-1.69 4.11-0.85 6.13 0.69 10.2l7-2c0.99 1.65 1.98 3.3 3 5-1.98 0.5-1.98 0.5-4 1l2 2c-0.99 0.5-0.99 0.5-2 1l-2-1 1 5-4 2c0.56 3.27 1.5 4.83 4 7l-1 3c3.42 0.25 3.42 0.25 7 0l2-3c1.99-0.37 3.99-0.7 6-1 0.49-0.99 0.49-0.99 1-2 2.56-0.62 2.56-0.62 5-1l1 3c0.99 0.5 0.99 0.5 2 1v-3h5c0.43 1.13 0.87 2.27 1.31 3.44 0.56 1.17 1.12 2.35 1.69 3.56 0.99 0.33 1.98 0.66 3 1l-2 5h-6c0.62 0.23 1.24 0.45 1.88 0.69 2.73 1.69 3.17 3.3 4.12 6.31l-1 1 1 2c-0.99 0.5-0.99 0.5-2 1 0.99 1.49 0.99 1.49 2 3 0 3 0 3-1 6-2.97 0.5-2.97 0.5-6 1v-3l-2 3v-3l-4 6c0.99 0.5 0.99 0.5 2 1 0 3 0 3-2 6-0.99-0.33-1.98-0.66-3-1v-5h-4v-3h-2c0.28 1.11 0.28 1.11 0.56 2.25 0.43 2.7 0.29 4.2-0.56 6.75h-4l-1-1-2 2c-2.62-0.38-2.62-0.38-5-1v-2l-3 3h7l-1 7 2-5 2 2-1 2 2 2c-0.38 2.62-0.38 2.62-1 5h-6c-1.34 0.31-2.68 0.63-4 1-0.12 3.87-0.12 3.87 0.56 7.12 0.44 2.88 0.44 2.88-0.56 4.88l8 2 1 4c-3.71 2.68-6.48 4.31-11 5-0.87 0.35-1.73 0.7-2.62 1.06-2.38 0.94-2.38 0.94-5.38 0.94l2 1v2l4 1c-3.47 5.83-3.47 5.83-6.14 6.69-0.92 0.15-0.92 0.15-1.86 0.31-3.71-10.4-7.29-20.8-10.7-31.2-0.28-0.85-0.56-1.71-0.85-2.59-0.38-1.14-0.38-1.14-0.76-2.3-0.63-1.94-0.63-1.94-1.66-3.89-0.12-1.97-0.17-3.95-0.19-5.93-0.02-1.24-0.03-2.49-0.05-3.77l-0.03-4.11c-0.01-0.69-0.01-1.38-0.02-2.09-0.03-3.66-0.05-7.33-0.06-11-0.01-3.02-0.04-6.03-0.08-9.05-0.05-3.65-0.08-7.3-0.08-11-0.01-1.39-0.03-2.77-0.05-4.16-0.13-8.13 0.49-14.4 4.33-21.6 1.9-3.59 2.98-7.4 4.17-11.3 5.63-17.6 5.63-17.6 10.1-22.1z" fill="#465564"/>
  <path transform="translate(659,107)" d="m0 0 2 1c-0.99 1.48-0.99 1.48-2 3 1.18-0.39 2.35-0.78 3.56-1.19 4.76-1.23 7.2-0.11 11.4 2.19v3h4c-1.19 5.53-2.6 8.18-7 12l2 1-1 4c0.99 0.33 1.98 0.66 3 1-0.45 0.37-0.91 0.74-1.38 1.12-2.11 2.45-2.74 4.79-3.62 7.88-0.18 0.58-0.37 1.15-0.55 1.75-0.63 3.15-0.5 6.17-0.45 9.37 0.11 6.66 0.11 6.66-1 8.88-0.15 1.79-0.22 3.58-0.25 5.38-0.03 0.95-0.05 1.91-0.08 2.89 0.38 3.13 1.34 4.35 3.33 6.73v2h-2c0.29 4.79 0.29 4.79 2.56 8.81 0.71 0.59 0.71 0.59 1.44 1.19v2c0.96 1.9 1.96 3.77 3 5.62 0.56 1.01 1.11 2.01 1.69 3.04 0.43 0.77 0.86 1.55 1.31 2.34l4-2v2h3v2h2v2h2v2h2v2h2v2h2v2h4v2c0.87 0.29 1.73 0.58 2.62 0.88 3.13 1.04 6.26 2.08 9.38 3.12v2c0.95-0.02 1.9-0.04 2.88-0.06 3.12 0.06 3.12 0.06 5.12 1.06v2h4c-0.5 1.98-0.5 1.98-1 4-1.62 0.19-3.25 0.38-4.88 0.56-1.35 0.16-1.35 0.16-2.74 0.32-2.38 0.12-2.38 0.12-4.38-0.88h-4c0.72 2.02 0.72 2.02 2 4 2.05 0.81 2.05 0.81 4 1 0.12 0.74 0.25 1.49 0.38 2.25 0.58 2.56 1.42 4.44 2.62 6.75v2l2 1h-4l-1 2-1-1-1 2c-4.61 1.72-8.21 0.23-12.6-1.5-0.71-0.28-1.42-0.55-2.14-0.84-21-8.47-37-24.5-46.5-45.2-0.84-2.46-0.84-2.46-0.84-6.46h-2v-6h-2v-7h-2c-0.06-0.99-0.12-1.97-0.18-2.99-0.09-1.28-0.17-2.56-0.26-3.89-0.12-1.91-0.12-1.91-0.24-3.86-0.11-3.14-0.11-3.14-1.32-5.26-0.1-2.35-0.13-4.71-0.12-7.06-0.01-1.27-0.01-2.54-0.01-3.85 0.13-3.09 0.13-3.09 1.13-4.09 0.23-2.18 0.41-4.37 0.56-6.56 0.09-1.2 0.17-2.4 0.26-3.63 0.06-0.93 0.12-1.86 0.18-2.81h2v-7h2v-6h2c0.11-0.7 0.21-1.39 0.32-2.11 0.78-3.33 2.04-6.08 3.56-9.14 0.51-1.06 1.02-2.11 1.55-3.2 1.57-2.55 1.57-2.55 4.57-3.55z" fill="#052341"/>
  <path transform="translate(1284 64.9)" d="m0 0h3.38c1.76 0 1.76 0 3.56 0.01 1.17-0.01 2.34-0.01 3.55-0.01h3.39 3.12c2.5 0.13 2.5 0.13 4.5 1.13 0.84 16 1.15 32 1.14 48v6.89c0 4.76 0 9.51-0.01 14.3 0 6.1 0 12.2 0.01 18.3v14.2 6.76c0 3.12 0 6.24-0.01 9.37 0.01 0.93 0.01 1.86 0.01 2.82-0.02 6.36-0.02 6.36-1.14 7.47-2 0.09-4 0.11-6 0.1-1.21 0-2.43-0.01-3.68-0.01-1.28-0.01-2.56-0.02-3.88-0.02-1.28-0.01-2.57-0.01-3.89-0.02-3.18-0.01-6.36-0.03-9.55-0.05v-2h-2c-0.02-13.6-0.04-27.2-0.05-40.9 0-6.32-0.01-12.6-0.02-19-0.01-6.12-0.02-12.2-0.02-18.4 0-2.32-0.01-4.64-0.01-6.96-0.03-11 0-21.9 0.55-32.8 0.04-0.8 0.08-1.61 0.12-2.43 0.36-6.4 0.61-6.68 6.93-6.69z" fill="#032542"/>
  <path transform="translate(496,65)" d="m0 0c27 0 27 0 29 1 0.02 16.5 0.04 33.1 0.05 49.6 0.01 7.68 0.01 15.4 0.03 23 0.01 6.7 0.01 13.4 0.01 20.1 0.01 3.54 0.01 7.09 0.02 10.6v11.9c0.01 1.18 0.01 2.37 0.01 3.59v3.24 2.83c-0.12 2.11-0.12 2.11-1.12 3.11h-28v-129z" fill="#02233E"/>
  <path transform="translate(133 -.114)" d="m0 0h1.95c2.13 0 4.25 0.01 6.38 0.02h4.43c3.88 0 7.76 0.01 11.6 0.02 3.96 0.02 7.92 0.02 11.9 0.02 7.77 0.02 15.5 0.03 23.3 0.05v2c0.93-0.31 0.93-0.31 1.88-0.62 0.7-0.13 1.4-0.25 2.12-0.38l2 2h-4v2c-1.94-0.37-1.94-0.37-4-1l-1-2h-12v2c-1.62 0.34-3.25 0.67-4.87 1-0.91 0.19-1.81 0.37-2.75 0.57-2.38 0.43-2.38 0.43-4.38 0.43v2h-2v4h-4l-1 2c-1.31 1.36-2.64 2.69-4 4 0.99 0.33 1.98 0.66 3 1-3.64 2.33-6.76 2.24-11 2l-2-1c-2.85 0.6-5.46 1.6-8 3-0.45 0.89-0.91 1.78-1.37 2.69-0.54 0.76-1.08 1.53-1.63 2.31-2.59 0.17-5.09 0-7.68-0.15-0.76 0.05-1.53 0.1-2.32 0.15-2.23 2.32-2.23 2.32-3 5-1.48-0.49-1.48-0.49-3-1-3.17 1.38-3.17 1.38-6 3-1.48-0.99-1.48-0.99-3-2h-2l-1 3c-2.07 0.73-2.07 0.73-4.56 1.19-0.83 0.16-1.65 0.32-2.51 0.48-0.63 0.11-1.27 0.22-1.93 0.33-0.99-1.32-1.98-2.64-3-4l-4 1 2 1c-0.47 0.46-0.95 0.91-1.44 1.38-1.65 1.56-1.65 1.56-2.56 3.62l-8-1-1 3c-1.11 0.09-2.23 0.17-3.37 0.25-3.69 0.33-3.69 0.33-5.07 2.82-0.28 0.96-0.28 0.96-0.56 1.93h4c0.5 1.98 0.5 1.98 1 4-0.99 0.33-1.98 0.66-3 1l-1-3h-7l-1 5c-2.47 0.5-2.47 0.5-5 1-0.29 0.87-0.58 1.74-0.87 2.63-1.05 3.12-2.09 6.25-3.13 9.37-0.99-0.49-0.99-0.49-2-1v-4l-2-1-3-3c-1.48 0.5-1.48 0.5-3 1l3 3c-1.48 0.5-1.48 0.5-3 1l3 3c-0.99 1.32-1.98 2.64-3 4l2 1v3h-2l-2 4-2-1 1 3-2 2c-3.44-0.35-5.07-1.04-8-3l1 1c0.37 1.66 0.7 3.33 1 5h3v3h-2c-0.49 0.99-0.49 0.99-1 2l-3-6h-3c-0.49-2.47-0.49-2.47-1-5l-2 4c-0.99-0.33-1.98-0.66-3-1 0.96-5.58 2.78-10.3 6-15h2c0.08-0.55 0.16-1.1 0.24-1.67 1.02-3.13 2.76-5.06 4.89-7.58 0.81-0.97 1.63-1.94 2.47-2.93 0.79-0.93 1.58-1.86 2.4-2.82 0.62-0.74 1.24-1.48 1.87-2.25 10.8-12.7 24.8-22.4 39.1-30.8 0.8-0.47 1.6-0.94 2.43-1.43 11-6.29 22.7-10.5 34.6-14.8 2.35-0.86 4.68-1.8 7-2.74 3.36-1.11 5.87-1.12 9.4-1.11z" fill="#475564"/>
  <path transform="translate(1128 63.9)" d="m0 0h2.94c1.6 0 1.6 0 3.24 0.01h3.4c3.72 0 7.44 0 11.2 0.01 2.57 0 5.15 0.01 7.72 0.01 6.1 0 12.2 0.01 18.3 0.02 6.93 0.01 13.9 0.01 20.8 0.02 14.3 0.01 28.6 0.03 42.8 0.05v28h-117v-27c2.42-1.21 3.92-1.12 6.61-1.12z" fill="#061F3D"/>
  <path transform="translate(1124 147)" d="m0 0c0.85 0.01 1.71 0.02 2.59 0.03 0.98 0 1.95 0.01 2.96 0.02 1.08 0.01 2.16 0.02 3.28 0.04 1.13 0.01 2.26 0.01 3.43 0.02 3.76 0.04 7.52 0.08 11.3 0.12 2.6 0.02 5.2 0.05 7.8 0.07 6.15 0.06 12.3 0.12 18.5 0.18 7.01 0.07 14 0.14 21 0.2 14.4 0.14 28.8 0.28 43.2 0.43v26c-2.3 1.14-3.58 1.12-6.13 1.12-0.86 0.01-1.72 0.01-2.61 0.01h-2.88-3.03c-3.31 0.01-6.63 0-9.95 0h-6.91-14.5c-6.19-0.01-12.4 0-18.6 0-4.76 0.01-9.53 0-14.3 0h-6.84c-3.2 0.01-6.4 0-9.6 0h-2.83c-16.7-0.05-16.7-0.05-18.8-2.13-0.1-1.84-0.14-3.69-0.14-5.53v-3.4c0-1.18 0.01-2.36 0.01-3.57 0-1.18-0.01-2.36-0.01-3.58v-3.39c0-1.04 0-2.07 0.01-3.14 0.18-3.34 0.18-3.34 3.06-3.5z" fill="#06213B"/>
  <path transform="translate(1281 228)" d="m0 0c1.28 0 1.28 0 2.59 0.01 0.98-0.01 1.95-0.01 2.96-0.01 1.08 0 2.16 0.01 3.27 0.02h3.43c3.75 0 7.51 0.02 11.3 0.03 2.6 0 5.2 0.01 7.8 0.01 6.14 0.01 12.3 0.02 18.4 0.04 7 0.02 14 0.04 21 0.05 14.4 0.02 28.8 0.05 43.2 0.1v25c-2.41 1.2-3.91 1.12-6.6 1.12-0.97 0.01-1.94 0.01-2.93 0.01h-3.24-3.39c-3.72 0.01-7.44 0-11.2 0h-7.72-16.2c-6.25-0.01-12.5-0.01-18.7 0h-18-7.68-10.7-3.24c-0.96 0-1.93 0-2.93-0.01h-2.55c-1.92-0.12-1.92-0.12-2.92-1.12-0.25-3.81-0.18-7.63-0.19-11.4-0.01-1.08-0.02-2.15-0.03-3.26 0-1.03-0.01-2.05-0.01-3.11 0-0.95-0.01-1.9-0.01-2.87 0.32-3.08 1.17-4.2 4.3-4.57z" fill="#03203D"/>
  <path transform="translate(1124 227)" d="m0 0c0.85 0.01 1.71 0.02 2.59 0.03 0.98 0 1.95 0.01 2.96 0.02 1.08 0.01 2.16 0.02 3.28 0.04 1.13 0.01 2.26 0.01 3.43 0.02 3.76 0.04 7.52 0.08 11.3 0.12 2.6 0.02 5.2 0.05 7.8 0.07 6.15 0.06 12.3 0.12 18.5 0.18 7.01 0.07 14 0.14 21 0.2 14.4 0.14 28.8 0.28 43.2 0.43v26h-117c0-27 0-27 2.93-27.1z" fill="#03203C"/>
  <path transform="translate(496,228)" d="m0 0h117v26c-15.1 0.02-30.2 0.04-45.3 0.05-7.02 0.01-14 0.01-21 0.03-6.77 0.01-13.5 0.01-20.3 0.01-2.59 0.01-5.18 0.01-7.76 0.02h-10.8c-1.08 0.01-2.16 0.01-3.27 0.01h-2.97-2.59c-1.93-0.12-1.93-0.12-2.93-1.12v-25z" fill="#031C35"/>
  <path transform="translate(262,75)" d="m0 0c2.22 1.75 2.94 2.63 3.39 5.46 0 1.44 0 1.44 0.01 2.91 0 1.05 0.01 2.1 0.01 3.18-0.01 1.1-0.02 2.19-0.03 3.33 0.01 1.08 0.02 2.17 0.03 3.3 0 1.05-0.01 2.1-0.01 3.19 0 0.96-0.01 1.92-0.01 2.91-0.46 3.23-1.47 5.09-3.39 7.72l-3 2c-1.06 1.97-2.07 3.97-3 6h-2c-0.11 0.59-0.23 1.18-0.35 1.78-0.69 2.37-1.59 3.77-3.09 5.72-1.8 2.42-3.34 4.73-4.56 7.5h-2c-0.27 0.97-0.54 1.94-0.81 2.94-0.59 1.51-0.59 1.51-1.19 3.06-1.49 0.5-1.49 0.5-3 1-0.34 1.33-0.67 2.67-1 4-1.25 1.71-2.57 3.38-3.94 5-2.9 3.32-2.9 3.32-4.84 7.21-1.22 1.79-1.22 1.79-4.66 2.8-1.37 0.24-2.75 0.47-4.12 0.68-4.6 0.39-4.6 0.39-8.44 2.31-8.45 0.93-15.2-0.25-23-3.69-2.9-1.36-2.9-1.36-5.66-1.93-2.84-0.76-4.25-1.31-6.36-3.38-1.53-3.44-2.45-7.04-3.24-10.7-1.14-5.11-2.46-7.94-6.76-11.3-5.88-2.32-14-1.32-20 0-1.92 1.42-1.92 1.42-3 3 0-3 0-3 1-6h2l1-2v2c0.79-0.08 1.57-0.17 2.38-0.25 9.63-0.94 9.63-0.94 13.7-0.19 0.95 0.15 1.9 0.29 2.88 0.44l2-2c2.65-0.18 5.2-0.23 7.85-0.2 0.78 0.01 1.55 0.01 2.35 0.01 2.47 0.01 4.95 0.04 7.42 0.07 1.68 0.01 3.36 0.01 5.04 0.02 4.11 0.02 8.23 0.06 12.3 0.1-0.5-1.98-0.5-1.98-1-4h5v2c2.31 0.33 4.62 0.66 7 1l1-3v2l4-2 2 3c-0.99 0.5-0.99 0.5-2 1l5 4c0.37-0.93 0.37-0.93 0.75-1.88 1.92-3.25 4.44-3.81 7.87-5.12 2.51-0.88 2.51-0.88 4.38-3 1.99-0.37 3.99-0.71 6-1l2-1h-3c1.65-3.58 3.68-6.81 6-10h2l-2-2 3-2c-0.25-0.54-0.5-1.07-0.75-1.62-0.25-2.38-0.25-2.38 1.5-5.63 0.74-0.91 1.49-1.81 2.25-2.75h3c0.19-1.36 0.19-1.36 0.38-2.75 0.56-2.91 1.32-4.65 2.62-7.25 0.38-1.99 0.73-3.99 1-6z" fill="#4A5A66"/>
  <path transform="translate(895,179)" d="m0 0c0.43 0.47 0.87 0.95 1.31 1.44 1.71 1.8 1.71 1.8 4.69 2.56v5h2v4h2v4h2l2 6h2v2h2v2h2v2h2v2h2v2h2v2c1.98 0.66 3.96 1.32 6 2v2h4v2h4v2c0.97-0.02 1.94-0.04 2.94-0.06 3.06 0.06 3.06 0.06 4.06 1.06 2.44 0.1 4.85 0.14 7.29 0.13 0.74 0 1.47 0 2.23 0.01 1.57 0 3.13-0.01 4.7-0.01 2.37 0 4.75 0 7.13 0.01 1.52 0 3.04-0.01 4.56-0.01 0.71 0 1.41 0.01 2.14 0.01 4.42-0.02 8.6-0.43 13-1.14-4.3 2.15-7 3.15-11.9 3.32-1.17 0.04-2.34 0.08-3.54 0.12-1.22 0.04-2.44 0.08-3.7 0.12-1.24 0.05-2.47 0.09-3.74 0.13-3.04 0.11-6.09 0.21-9.14 0.31 1.49 0.99 1.49 0.99 3 2-7.82 2.25-14.1 1.76-22 0-0.25 1.11-0.5 2.23-0.75 3.38-1.25 3.62-1.25 3.62-3.37 5.06-0.62 0.18-1.24 0.37-1.88 0.56h4v2h2l2 3c1.9 0.6 1.9 0.6 4 1 0.62 0.35 1.24 0.7 1.88 1.06 2.78 1.23 5.11 1.08 8.12 0.94v3c-3.42 2.28-4.2 2.16-8.12 1.69-0.89-0.1-1.78-0.2-2.7-0.3-2.18-0.39-2.18-0.39-3.18-1.39l-1 2c0.99 0.33 1.98 0.66 3 1-19.8-1.03-35.2-12.3-48.2-26.5-5.31-6.16-10.2-12.7-12.8-20.5 0.25-2.19 0.25-2.19 1-4 0.63-2.11 0.63-2.11 1-4l-1-1c-0.07-1.85-0.08-3.71-0.06-5.56 0.01-1.01 0.02-2.03 0.02-3.07 0.02-0.78 0.03-1.56 0.04-2.37 2.56-1.31 2.56-1.31 6-2 2.64 1.32 4.79 3.06 7 5v-2c1.62-1.71 3.29-3.38 5-5l1-1z" fill="#05223F"/>
  <path transform="translate(1429,120)" d="m0 0c26 0 26 0 28 1l1 107h-3c0.04-0.78 0.08-1.57 0.12-2.38 0.17-2.78 0.17-2.78-2.12-4.62-1.17-4.07-1.07-7.98-1-12.2 0.05-6.01-0.21-11.8-1-17.8h-2l2 8h-3c-0.12-0.79-0.24-1.57-0.37-2.38-0.9-5.67-1.89-11.1-3.63-16.6-0.99 0.5-0.99 0.5-2 1v5h-2c0.1 0.72 0.19 1.45 0.29 2.2 0.62 5.45 1.07 9.66-1.29 14.8-2.39-2.39-2.52-3.71-3-7v-3c-1.79 1.79-1.6 4.58-2 7-0.49 0.99-0.49 0.99-1 2l-2-1c0.48 3.46 0.98 6.89 1.69 10.3 0.15 1.33 0.15 1.33 0.31 2.69l-2 2c-0.17 3.58-0.17 3.58 0 7h2v2l-2 2c0.32 2.11 0.32 2.11 1 4h-2v15h-1v-126z" fill="#032541"/>
  <path transform="translate(958 156)" d="m0 0h2.07c2.26 0 4.51 0.02 6.77 0.05 1.56 0 3.13 0.01 4.69 0.01 4.12 0.01 8.24 0.04 12.4 0.07 4.2 0.04 8.4 0.05 12.6 0.06 8.24 0.04 16.5 0.09 24.7 0.15v26c-6.13 0.29-12.3 0.58-18.4 0.86-2.07 0.09-4.14 0.19-6.22 0.29-11.4 0.54-22.8 0.97-34.2 1.1-1.46 0.03-1.46 0.03-2.94 0.07-1.35 0-1.35 0-2.72 0.01-0.79 0.01-1.58 0.02-2.39 0.03-2.76-0.46-4.14-1.47-6.18-3.36-0.5-2.31-0.5-2.31-0.49-5v-2.94c0.02-1.01 0.04-2.02 0.06-3.06-0.01-1.01-0.02-2.02-0.03-3.06 0.07-7.36 0.07-7.36 1.57-9.56 2.85-2.07 5.17-1.74 8.66-1.72z" fill="#031D37"/>
  <path transform="translate(1442,179)" d="m0 0h3c0.14 1.13 0.29 2.27 0.44 3.44 0.17 3.37 0.17 3.37 1.56 4.56 0.4 2.01 0.74 4.04 1.06 6.06 0.18 1.11 0.36 2.21 0.54 3.35 0.2 1.28 0.2 1.28 0.4 2.59l2-2-2-1v-5h2l1-3c0.68 8.71 1.09 17.2 0.84 26 0.17 3.13 0.85 5.2 2.16 8.02 1.16 3.68 1.16 3.68 0 6l4-2v3h15c-1.26 5.03-1.26 5.03-4 7-2.02 0-2.02 0-4.25-0.44-4.54-0.7-7.45-0.11-11.8 1.44l1 2c-2.47 0.5-2.47 0.5-5 1v4l12 1v2h-5l5 1 1 4 11-1v-1h5v2l5 1-1-6c2.97-0.99 2.97-0.99 6-2v-4c3.46-0.5 3.46-0.5 7-1v-6c2.88 0.25 2.88 0.25 6 1 1.38 2.06 1.38 2.06 2 4-0.96 0.15-0.96 0.15-1.94 0.31-0.68 0.23-1.36 0.46-2.06 0.69l-1 3-8 1c0.72 2.02 0.72 2.02 2 4 2.05 0.81 2.05 0.81 4 1v-2c3.32-3.06 7.43-5 12-5v2c2.17-0.51 4-1 6-2 2.33-0.04 4.67-0.04 7 0-1.48 0.5-1.48 0.5-3 1v2c-4.28 4.52-9.01 5.17-14.9 6.19-0.87 0.16-1.74 0.33-2.64 0.5-2.49 0.46-4.98 0.9-7.48 1.31-0.98 0.18-1.96 0.36-2.97 0.55-5.76 0.8-11.6 0.57-17.4 0.55-1.28 0-2.56-0.01-3.87-0.01-3.38 0-6.75-0.01-10.1-0.02-3.45-0.01-6.9-0.02-10.4-0.02-6.76-0.01-13.5-0.03-20.3-0.05l1-29h3l-3-2c-0.39-4.88-0.31-7.69 2-12-0.36-1.93-0.36-1.93-1-4-0.04-2-0.05-4 0-6l2-1 1-3-2-1 2-2 1-3c2.29 3.44 3 4.72 3 9l1 1c0.65-3.6 1.09-6.5 0.44-10.1-0.52-3.37 0.12-4.85 1.56-7.88 0.36-1.33 0.7-2.66 1-4z" fill="#07223F"/>
  <path transform="translate(1530,210)" d="m0 0c-0.88 4.75-0.88 4.75-2 7h-3v2h4l1-3 5 3c-2 2-2 2-5 3 3.07 0.91 5.8 1.09 9 1l-1 8c4.21-2.59 6.98-5.12 10-9h2c0.1-0.78 0.21-1.57 0.31-2.38 0.69-2.62 0.69-2.62 3.69-4.62 0.99 2.47 0.99 2.47 2 5-1.28 1.71-2.62 3.37-4 5h-2c-0.37 0.87-0.37 0.87-0.75 1.75-1.43 2.58-3.03 4.31-5.25 6.25h-2v2c-7.37 6.02-15.8 10.5-25 13l-2-1 4-2v-2c-4.13 0.57-4.13 0.57-8 2-0.99-0.5-0.99-0.5-2-1v-2l-3 2h-4l1 2c-2.97 0.5-2.97 0.5-6 1v2c-2.44-0.38-2.44-0.38-5-1-1-2-1-2-1-5h8l1-5h3c-0.49-1.49-0.49-1.49-1-3-0.99 0.33-1.98 0.66-3 1l-3-2c0.49 2.97 0.49 2.97 1 6-2.76 0.6-5.16 1-8 1v4c-1.98 0.66-3.96 1.32-6 2 0.49 2.97 0.49 2.97 1 6-2.05-0.26-4.1-0.52-6.15-0.78-1.71-0.24-1.71-0.24-2.85-0.22h-12l-1-4c-0.62 0.21-1.24 0.41-1.88 0.62-0.7 0.13-1.4 0.25-2.12 0.38l-2-2c2.49-1.25 3.41-0.78 6 0v-2h-13v-5l5-2-1-2c6.02-1.47 10.9-2.33 17-1v-2c0.99-0.33 1.98-0.66 3-1l1-3h-15v-1c0.99-0.01 1.98-0.03 2.99-0.04 3.7-0.06 7.4-0.14 11.1-0.22 1.59-0.04 3.19-0.06 4.78-0.09 2.3-0.03 4.61-0.08 6.91-0.14 0.7 0 1.41-0.01 2.13-0.02 5.25-0.15 9.22-1.53 14.1-3.49 3-0.19 3-0.19 5 0v-2c2.91-1.26 4.8-2 8-2v-2c1.98-0.66 3.96-1.32 6-2v-2c3.32-3.22 5.34-4.53 10-4z" fill="#06213D"/>
  <path transform="translate(1571,146)" d="m0 0c0.12 0.64 0.25 1.28 0.38 1.94 0.2 0.68 0.41 1.36 0.62 2.06l2 1c0.39 20.1-2.09 37.4-10 56h-2c-0.1 0.54-0.21 1.07-0.31 1.62-0.87 3.01-2.25 5.62-3.69 8.38h-2l-1 2-2-3c-2.14 1.75-2.14 1.75-2.31 3.81-1.53 4.87-6.69 8.27-10.7 11.2h-2c-1.12-4.75-1.12-4.75 0-7-1.11 0.06-2.23 0.12-3.38 0.19-1.19-0.06-2.39-0.13-3.62-0.19l-2-3c2.47-0.5 2.47-0.5 5-1l-3-3-2 2h-4v-2h3l1-6c-0.99-0.33-1.98-0.66-3-1v-2h2v-2h2l2-6h2c0.13-0.57 0.27-1.14 0.4-1.73 0.59-2.25 1.33-4.36 2.16-6.52 0.27-0.71 0.54-1.41 0.82-2.14 0.2-0.53 0.41-1.06 0.62-1.61h2v-7h2c-0.01-0.64-0.02-1.28-0.04-1.93 0-0.83-0.01-1.66-0.02-2.51-0.01-0.82-0.03-1.64-0.04-2.49 0.1-2.07 0.1-2.07 1.1-3.07 0.16-1.49 0.25-2.98 0.32-4.47 0.04-0.9 0.08-1.8 0.12-2.73 0.04-0.94 0.08-1.89 0.12-2.86 0.05-0.95 0.09-1.9 0.13-2.88 0.11-2.35 0.21-4.71 0.31-7.06h1c0.49 6.93 0.49 6.93 1 14l1-6h2v2c0.99 0.33 1.98 0.66 3 1l-3 2c0.19 0.89 0.37 1.77 0.56 2.69 0.42 3.16 0.25 5.26-0.56 8.31 2.25 1.72 2.25 1.72 5 3 2.3-0.69 2.3-0.69 4-2 0.49 0.99 0.49 0.99 1 2 0.99-0.33 1.98-0.66 3-1 0.14-1.05 0.29-2.1 0.44-3.19 0.31-2.09 0.64-4.18 1.06-6.25 0.45-2.28 0.7-4.5 0.94-6.81 0.28-1.86 0.28-1.86 0.56-3.75l2-1v-3c0.31-1.67 0.64-3.34 1-5h2l1-2z" fill="#052341"/>
  <path transform="translate(260,72)" d="m0 0c2.39 2.39 2.3 3.04 2.31 6.31-0.08 4.09-0.96 6.3-3.31 9.69-0.71 2.69-0.71 2.69-1 5-1.49-0.5-1.49-0.5-3-1-2.41 3.94-2.41 3.94-2.69 8.38 0.23 0.53 0.46 1.07 0.69 1.62-0.99 0.33-1.98 0.66-3 1l2 2c-0.74 0.72-1.49 1.44-2.25 2.19-2.44 2.5-4.62 5.05-6.75 7.81 2.47-0.5 2.47-0.5 5-1-1 2-1 2-3.88 3.12-3.12 0.88-3.12 0.88-6.12 0.88l-2 2c-2.32 1.27-4.48 2.16-7 3-0.5 0.99-0.5 0.99-1 2l-1 1c-1.01 1.33-2.01 2.66-3 4-0.62-1.14-0.62-1.14-1.25-2.31-1.71-2.63-3.16-3.99-5.75-5.69 1.98-0.5 1.98-0.5 4-1-2.93-0.22-2.93-0.22-5 1-2.09 0.59-3.82 1-6 1v-2h-4l-2-2c-0.89 0.31-1.77 0.62-2.69 0.94-4.3 1.38-7.78 2.06-12.3 2.06 1.77-5.57 1.77-5.57 3.12-8.12 1.16-2.14 1.16-2.14 0.88-5.88 1.27-0.63 2.54-1.26 3.81-1.88 2.29-1.12 2.29-1.12 4.69-2.74 2.5-1.38 2.5-1.38 6.5-1.38l1-3c0.99-0.33 1.98-0.66 3-1l3 2 2-4h4c0.5-1.48 0.5-1.48 1-3l2 1c0.99-0.33 1.98-0.66 3-1v-3c1.62-0.19 3.25-0.38 4.88-0.56 0.9-0.11 1.8-0.21 2.74-0.32 2.38-0.12 2.38-0.12 4.38 0.88 2.6-0.46 2.6-0.46 5-2 1.37-3.03 1.37-3.03 2-6 2.25 2.05 3 3.01 4 6l-1 2c0.99-0.33 1.98-0.66 3-1v-3c0.64-1.68 1.31-3.34 2-5 0.17-0.74 0.33-1.48 0.5-2.25 0.17-0.58 0.33-1.16 0.5-1.75l2-1 1-3 2-1z" fill="#465562"/>
  <path transform="translate(143,131)" d="m0 0c1.98 3.96 0.88 9.04 0.69 13.4-0.06 1.58-0.06 1.58-0.11 3.19-0.06 1.52-0.06 1.52-0.13 3.08-0.04 0.93-0.08 1.86-0.12 2.82-0.44 3.38-1.33 5.66-3.92 7.92-0.95 0.64-0.95 0.64-1.91 1.3-6.27 4.5-12 9.69-17.4 15.2-1.98 1.92-3.58 3.03-6.12 4.06v3h-2v3c-5.75-0.88-5.75-0.88-8-2-6.71-0.93-11.9-0.67-17.6 3.12-4.84 3.89-6.01 6.58-6.7 12.7-0.27 2.73-0.5 5.45-0.68 8.18-0.99 0.33-1.98 0.66-3 1v2c-5.1 1.91-9.46 3.43-15 3l1 3c-1.45 0.68-1.45 0.68-2.94 1.38-3.13 1.28-3.13 1.28-4.06 3.62-3.34-0.6-5.5-1.68-8-4v-3c-0.8-0.29-1.61-0.58-2.44-0.88-2.56-1.12-2.56-1.12-3.56-3.12 6.4-2.22 6.4-2.22 9.44-1.12 0.77 0.55 0.77 0.55 1.56 1.12v5c2.67-2.49 4.56-4.63 6-8h4c0.41-0.91 0.83-1.81 1.25-2.75 1.65-3.07 3.28-4.86 5.75-7.25 0.5-1.49 0.5-1.49 1-3h2v-2h3l3-6c-0.99 0.33-1.98 0.66-3 1l-2-3c0.99-0.62 1.98-1.24 3-1.88 1.48-1.05 1.48-1.05 3-2.12v-2c4-2.83 7.43-1.76 12-1l1-3c2.06-1.19 2.06-1.19 4-2-0.28 0.96-0.28 0.96-0.56 1.94-0.15 0.68-0.29 1.36-0.44 2.06 1.07 1.3 1.07 1.3 3.56 1.06 0.81-0.02 1.61-0.04 2.44-0.06v-2l-4-2v-3h8l2-2c-1.98-0.5-1.98-0.5-4-1l2-2 1-3c1.39-0.15 1.39-0.15 2.81-0.31 3.31-0.72 4.06-1.25 6.19-3.69h2c0.5-1.49 0.5-1.49 1-3 2.06-0.69 2.06-0.69 4-1v-3c0.99-0.33 1.98-0.66 3-1-0.5-1.98-0.5-1.98-1-4h5c0.5-1.49 0.5-1.49 1-3 0.99-0.33 1.98-0.66 3-1l1-2h2v-2h4c0.19-1.92 0.19-1.92 0.38-3.88 0.37-3.87 0.37-3.87 2.62-6.12z" fill="#4A5A66"/>
  <path transform="translate(519,118)" d="m0 0h1c0.06 0.77 0.12 1.54 0.18 2.34 0.13 1.5 0.13 1.5 0.26 3.04 0.08 0.99 0.16 1.99 0.24 3.02 0.17 2.58 0.17 2.58 1.32 4.6 0.08 1.71 0.1 3.43 0.08 5.15-0.01 1.61-0.01 1.61-0.02 3.26-0.01 1.16-0.02 2.33-0.03 3.54-0.02 2.46-0.03 4.92-0.04 7.39-0.02 3.89-0.05 7.78-0.09 11.7-0.03 3.75-0.04 7.5-0.06 11.2-0.01 1.15-0.03 2.31-0.04 3.5 0 1.09-0.01 2.19-0.01 3.31-0.01 0.96-0.02 1.91-0.02 2.89 0.21 3.92 0.21 3.92 2.23 11h-28c0-9 0-9 2-13 1.16-3.49 1.33-6.57 1.56-10.2 0.09-1.28 0.17-2.57 0.26-3.89 0.12-2.55 0.17-5.1 0.14-7.66 0.04-3.2 0.04-3.2 1.04-6.2-0.25-1.49-0.25-1.49-0.5-3-0.5-3-0.5-3 0.5-6 0.04-1.83 0.04-3.67 0-5.5-0.07-3.27-0.04-5.38 1-8.5l2 1c0.62 2.56 0.62 2.56 1 5 2.76-2.76 2.58-5.21 3-9 2 2 2 2 3 4l3 2 2-2 1 1 2-14z" fill="#052442"/>
  <path transform="translate(1279,228)" d="m0 0h116v1c-1.06 0.01-2.11 0.02-3.2 0.02-9.95 0.08-19.9 0.17-29.8 0.27-5.11 0.05-10.2 0.09-15.3 0.13-4.94 0.04-9.87 0.09-14.8 0.14-1.88 0.02-3.76 0.03-5.65 0.04-2.63 0.02-5.27 0.05-7.9 0.08-1.17 0-1.17 0-2.37 0.01-3.77 0.06-6.69 0.2-9.89 2.31 1.03-0.02 2.05-0.05 3.11-0.07 20.3-0.32 20.3-0.32 27.1 4.19 0.6 0.62 1.19 1.24 1.81 1.88-0.49-1.49-0.49-1.49-1-3 1.98-0.66 3.96-1.32 6-2v2c2.47 0.5 4.95 0.99 7.43 1.46 3.88 0.76 7.71 1.53 11.5 2.66 3.01 1.02 3.01 1.02 6.06 0.88h2l2 6-2 1 8 2c-1.48 0.5-1.48 0.5-3 1l-1 2c-0.84-0.01-1.69-0.02-2.55-0.04-1.1 0-2.2-0.01-3.33-0.02-1.09-0.01-2.18-0.03-3.3-0.04-2.77-0.1-2.77-0.1-4.82 1.1-1.34-0.31-2.67-0.64-4-1-1.59-0.14-3.18-0.25-4.77-0.32-1.33-0.06-1.33-0.06-2.69-0.12-0.92-0.04-1.84-0.08-2.79-0.12-1.4-0.07-1.4-0.07-2.84-0.13-2.3-0.11-4.61-0.21-6.91-0.31-0.49-0.99-0.49-0.99-1-2-1.09 0.04-2.19 0.08-3.31 0.12-3.69-0.12-3.69-0.12-6.69-2.12h-1c-0.49 1.49-0.49 1.49-1 3l-16-2v-3l2-1c-0.49 0.16-0.99 0.33-1.5 0.5-3.53 0.71-6.9 0.56-10.5 0.5-0.62-1.81-0.62-1.81-1-4l2-3-5 1 1 2c-0.94 2.12-0.94 2.12-2 4h-5v-7l-4 2 1-4h-3c0.57 3.93 0.57 3.93 3 7v2h-3c-1.26-2.52-1.1-4.31-1.06-7.12 0.01-0.92 0.02-1.83 0.02-2.76 0.02-0.7 0.03-1.4 0.04-2.12l-2-1 1-4z" fill="#031B34"/>
  <path transform="translate(1124 227)" d="m0 0c0.85 0.01 1.71 0.02 2.59 0.03 0.98 0 1.95 0.01 2.96 0.02 1.08 0.01 2.16 0.02 3.28 0.04 1.13 0.01 2.26 0.01 3.43 0.02 3.76 0.04 7.52 0.08 11.3 0.12 2.6 0.02 5.2 0.05 7.8 0.07 6.15 0.06 12.3 0.12 18.5 0.18 7.01 0.07 14 0.14 21 0.2 14.4 0.14 28.8 0.28 43.2 0.43v1c-56.4 0.49-56.4 0.49-114 1l2 7v4c0.31 2.33 0.64 4.67 1 7l2-3c3.62-0.19 3.62-0.19 7 0l2 4c3.04 0.08 5.07-0.03 8-1l3 2 1-2c1.98 0.32 3.97 0.65 5.95 0.97 2.36 0.22 2.36 0.22 5.05-1.97 0.72-2.06 0.72-2.06 1-4h3l-3-2c3.86-1.49 6.04-2.19 10-1 2.16-0.23 2.16-0.23 4-1l1-2c1.21 0.18 2.43 0.37 3.68 0.56 3.41 0.42 5.96 0.26 9.32-0.56 6.29-1.13 10.9-0.87 17 1 3.81 1.03 7.33 1.83 11 0 2.01 0.6 4.02 1.27 6 2v3c-0.83 0.62-1.65 1.23-2.5 1.87-2.79 1.88-2.79 1.88-2.82 4.88 0.11 0.74 0.21 1.48 0.32 2.25-1.98 0.33-3.96 0.66-6 1v1h-92c0-27 0-27 2.93-27.1z" fill="#041E39"/>
  <path transform="translate(85,217)" d="m0 0c2.49 1.16 4.67 2.51 7 4v2h-2l-2 2c-1.13 0.31-2.27 0.62-3.44 0.94-3.5 0.73-3.5 0.73-5.18 2.75-0.46 0.43-0.91 0.86-1.38 1.31-0.76-0.16-1.53-0.33-2.31-0.5-3.69-0.69-5.48 0.72-8.69 2.5h-2c-0.25 0.54-0.5 1.07-0.75 1.62-1.56 2.98-3.23 5.69-5.25 8.38h-3l-2 4 1-1 3 3-2 2c0.32 3.1 0.32 3.1 1 6l7 2 1 6c0.59 0.09 1.17 0.17 1.77 0.26 2.85 0.94 3.94 2.28 5.85 4.55 0.6 0.69 1.19 1.38 1.79 2.08 1.97 2.61 3.23 5.23 4.47 8.23 1.39 2.33 2.71 2.75 5.12 3.88 0.99 1.49 0.99 1.49 2 3-2.24 2.67-3.62 3.89-7 4.88-3.24 0.13-4.25-0.33-7-1.88-1.99-0.38-3.99-0.73-6-1v-2h-3v-2h-2v-2c-0.6-0.29-1.2-0.58-1.81-0.88-2.19-1.12-2.19-1.12-5.19-3.12v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2c-2.13-1.88-2.13-1.88-4-4v-2h-2c-1.63-2.5-1.63-2.5-3-5 1.76-0.34 1.76-0.34 3.56-0.69 5.8-1.51 9.66-3.77 13.1-8.73 2.78-4.77 4.41-8.29 4.55-13.8 0.34-2.46 0.34-2.46 1.75-4.75 4.9-2.97 10.5-4.53 15.9-6.26 11.1-4.01 11.1-4.01 13.1-3.74z" fill="#BF1118"/>
  <path transform="translate(740,142)" d="m0 0c3.44 1.94 3.44 1.94 6 4v2h2v2h2v2l4 2v2h2c0.05 1.44 0.09 2.87 0.12 4.31 0.03 0.8 0.05 1.6 0.08 2.43-0.2 2.26-0.2 2.26-2.2 5.26h-2v2h-2v2c-2.01 1.91-2.01 1.91-4.69 4.06-1.3 1.07-1.3 1.07-2.63 2.16-2.73 1.82-4.43 2.56-7.68 2.78-3.31-1.44-3.31-1.44-6-3v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2v-2h-2c-1.34-7.19-1.34-7.19 0.19-10.8 1.8-2.17 3.41-3.72 5.81-5.19h2v-2h2l2-4h2v-2c3.19-1.59 5.58-0.74 9 0z" fill="#031F3B"/>
  <path transform="translate(659,107)" d="m0 0 2 1c-0.99 1.48-0.99 1.48-2 3 1.18-0.39 2.35-0.78 3.56-1.19 4.76-1.23 7.2-0.11 11.4 2.19v3h4c-1.19 5.53-2.6 8.18-7 12l2 1-1 4c0.99 0.33 1.98 0.66 3 1-0.47 0.43-0.95 0.87-1.44 1.31-1.8 1.71-1.8 1.71-2.56 4.69-1.49 0.5-1.49 0.5-3 1-1.25-2.49-0.78-3.41 0-6-2.31 0.33-4.62 0.66-7 1l2 2-2 1c1.31 3.12 1.31 3.12 4 5l-1 2h-4l-1-3c-2.02 0.72-2.02 0.72-4 2-0.81 2.05-0.81 2.05-1 4 1.49-0.5 1.49-0.5 3-1l2 1v6c-2.48 0.5-2.48 0.5-5 1-0.5 2.47-0.5 2.47-1 5 0.99 0.33 1.98 0.66 3 1-4.3 0.2-6.01 0-10-2v-14c-1.49 0.5-1.49 0.5-3 1v-8h2v-7h2v-6h2c0.11-0.7 0.21-1.39 0.32-2.11 0.78-3.33 2.04-6.08 3.56-9.14 0.51-1.06 1.02-2.11 1.55-3.2 1.57-2.55 1.57-2.55 4.57-3.55z" fill="#052342"/>
  <path transform="translate(1122,147)" d="m0 0 116 1v26h-28l-2-4c0.81-2.06 0.81-2.06 2-4 0.49-1.49 0.49-1.49 1-3 2.31 0.33 4.62 0.66 7 1 0.34-2.96 0.34-2.96-1.31-4.39-0.56-0.43-1.12-0.86-1.69-1.3-0.99-0.76-1.98-1.52-3-2.31l-3 2c-0.6-0.35-1.2-0.7-1.81-1.06-2.3-1.27-2.3-1.27-5.19 0.06-2.86-1.19-5.81-2.81-8-5-2.34 0.3-4.67 0.64-7 1h-3v-2h6v-2h-69l1-2zm92 13h2l-1 2-1-2z" fill="#051C35"/>
  <path transform="translate(1121,149)" d="m0 0h69v2l-12 1v6c-2.5 2.38-2.5 2.38-5 4l-2-2c-2.22-0.02-2.22-0.02-4.62 0.38-0.82 0.11-1.64 0.22-2.48 0.33-0.63 0.1-1.25 0.19-1.9 0.29v3c0.99 0.33 1.98 0.66 3 1l1 1c0.55-0.34 1.11-0.68 1.68-1.03 2.81-1.18 4.45-0.97 7.44-0.53 3.57 0.63 3.57 0.63 6.88-0.44 0.49 1.49 0.49 1.49 1 3l-7 2c0.49 0.99 0.49 0.99 1 2h-4v-2c-2.31 0.33-4.62 0.66-7 1v-1h-5v2c-1.11-0.53-1.11-0.53-2.25-1.06-3-1.03-3.83-0.72-6.75 0.06l-3-2v-2c-0.55 0.18-1.1 0.37-1.67 0.56-2.81 0.53-4.8 0.13-7.58-0.5-0.89-0.19-1.78-0.39-2.7-0.59-0.68-0.15-1.35-0.31-2.05-0.47v-7h-3l-2 4-2-1c-0.99 0.5-0.99 0.5-2 1l2 2h2c0.69 1.81 0.69 1.81 1 4-1.44 1.75-1.44 1.75-3 3-0.12-0.64-0.25-1.28-0.38-1.94-0.2-0.68-0.41-1.36-0.62-2.06l-2-1 1-9c7.54-3.27 13.8-4.57 22-4v-2h-18v1c-2.97-0.33-5.94-0.66-9-1v-2z" fill="#0A213D"/>
  <path transform="translate(1278,229)" d="m0 0 2 1v3c0.15 2.06 0.32 4.13 0.5 6.19 0.09 1.08 0.19 2.17 0.28 3.29 0.07 0.83 0.15 1.66 0.22 2.52l2-2-2-1v-6l4-1-1 4 1-1 2-1 2 2-2 5h5c1.01-3.05 1.01-3.05 0-6 3.75-1.12 3.75-1.12 6 0l-1 6 8 1 1-2c2.97 0.33 5.94 0.66 9 1v1c-3.96 0.5-3.96 0.5-8 1 3.4 2.03 6.32 2.37 10.2 2.62 1.08 0.08 2.16 0.15 3.27 0.23 1.23 0.08 1.23 0.08 2.48 0.15l1-4c0.49 0.5 0.99 0.99 1.5 1.5 2.72 1.63 3.57 1.63 6.62 1.5h3.88l2 3 1-2v2c1.75-0.02 1.75-0.02 3.54-0.04 1.55 0 3.1-0.01 4.65-0.02 0.77-0.01 1.54-0.02 2.33-0.03 3.99-0.02 7.56 0.24 11.5 1.09 0.49-0.5 0.49-0.5 1-1 1.9-0.02 3.79 0.01 5.69 0.06 4.59 0.05 8-0.38 12.3-2.06 2.88-0.12 2.88-0.12 5 0-0.49 1.49-0.49 1.49-1 3h3v-2c1.98-0.33 3.96-0.66 6-1v5c-15 0.02-30 0.04-44.9 0.05-6.95 0.01-13.9 0.01-20.9 0.03-6.71 0.01-13.4 0.01-20.1 0.01-2.57 0.01-5.13 0.01-7.7 0.02h-10.7c-1.07 0.01-2.14 0.01-3.25 0.01h-2.93-2.57c-1.92-0.12-1.92-0.12-2.92-1.12-0.1-1.7-0.13-3.4-0.13-5.09 0-1.55 0-1.55-0.01-3.12 0.01-1.09 0.01-2.17 0.02-3.29-0.01-1.08-0.01-2.17-0.02-3.29 0-1.03 0.01-2.06 0.01-3.12v-2.88c0.13-2.21 0.13-2.21 1.13-3.21z" fill="#051F39"/>
  <path transform="translate(1194,151)" d="m0 0c0.49 0.99 0.49 0.99 1 2 3.17 1.24 5.58 2 9 2 1.33 0.33 2.67 0.67 4 1h3 3c0.25 0.62 0.49 1.24 0.75 1.88 1.46 2.47 2.63 3.07 5.25 4.12l-2 3c-2.31-0.33-4.62-0.66-7-1v2l3 2c-3.31 1.13-6.6 2.18-10 3-0.99 0.33-1.98 0.66-3 1-2.82 0.1-5.62 0.14-8.44 0.12-0.76 0.01-1.53 0.01-2.31 0.02-0.74 0-1.48-0.01-2.25-0.01h-2.03c-2.1-0.14-3.94-0.58-5.97-1.13-2-0.35-4-0.68-6-1 2.57-2.57 4.48-2.54 8-3v-3l-1 2c-0.74-0.1-1.47-0.19-2.23-0.29-1.46-0.17-1.46-0.17-2.96-0.33-0.96-0.12-1.92-0.24-2.92-0.36-3.13-0.02-5.08 0.64-7.89 1.98-1.5-1.31-1.5-1.31-3-3v-3c1.46-0.34 2.92-0.67 4.38-1 1.21-0.28 1.21-0.28 2.46-0.56 2.16-0.44 2.16-0.44 4.16-0.44l1 2c2.5-2.94 3.47-5.18 4-9h9c2.34-0.32 4.67-0.65 7-1zm20 9 2 2v-2h-2z" fill="#03203C"/>
  <path transform="translate(732 68.9)" d="m0 0h2.53c1.3 0 1.3 0 2.62 0.01 0.87-0.01 1.74-0.01 2.64-0.01h2.52 2.31c1.9 0.13 1.9 0.13 3.9 1.13v2c-0.7-0.07-1.39-0.14-2.11-0.22-0.91-0.09-1.82-0.18-2.76-0.28-0.91-0.09-1.81-0.18-2.74-0.28-2.32-0.25-2.32-0.25-4.39-0.22l1 4c-0.99 0.5-0.99 0.5-2 1 1.19 1.61 1.19 1.61 3 3 2.5 0.25 2.5 0.25 5 0 4.74 0 8.14 2.42 12 5l-1 7c-0.64 0.13-1.28 0.25-1.93 0.38-0.68 0.2-1.37 0.41-2.07 0.62l-1 2 3 2c-6.15 0.1-6.15 0.1-8 0l-1-1c-2.65-0.1-5.28-0.14-7.93-0.12-0.75-0.01-1.49-0.01-2.25-0.01-4.04-0.08-4.04-0.08-7.82 1.13-2.18 0.1-4.37 0.13-6.56 0.13-1.76 0-1.76 0-3.57 0.01-2.87-0.14-2.87-0.14-3.87-1.14-1.66-0.04-3.33-0.04-5 0 0.99-0.33 1.98-0.66 3-1v-4c6.63-1.12 6.63-1.12 10 0l1-2h-9v-2c3.29-0.8 4.71-1.09 8 0v-2c0.99-0.33 1.98-0.66 3-1l1-3c2.07-0.73 2.07-0.73 4.57-1.18 0.82-0.16 1.65-0.32 2.5-0.49 0.64-0.1 1.28-0.21 1.93-0.33-0.52-0.93-0.52-0.93-1.06-1.87-0.46-1.05-0.46-1.05-0.94-2.13l1-2c-1.98 0.33-3.96 0.66-6 1l-1 4-5 1v-2h-2l-2 2-1-4c2.77-0.59 5.16-1 8-1l1-3c2.8-1.06 5.51-1.13 8.48-1.13z" fill="#031F3C"/>
  <path transform="translate(1153,230)" d="m0 0c7.9-0.13 7.9-0.13 12 1 2.44 0.12 4.5 0.13 6.87-0.5 2.3-0.54 4.32-0.61 6.68-0.6 0.84 0.01 1.69 0.01 2.56 0.01 1.3 0.01 1.3 0.01 2.64 0.03 1.33 0 1.33 0 2.69 0.01 2.19 0.01 4.37 0.03 6.56 0.05v3c-1.05-0.02-2.1-0.04-3.19-0.06-3.65-0.06-3.65-0.06-6.5 0.62-2.31 0.44-2.31 0.44-3.98-0.07-3.36-0.71-6.52-0.31-9.89 0.07-0.67 0.05-1.35 0.1-2.04 0.15-2.25 0.2-2.25 0.2-5.4 1.29-1.84 2.9-1.84 2.9-3 6l-3 2c1.98 0.66 3.96 1.32 6 2l-1 4c-4.06 0.85-6.98 0.95-11 0-3.76-0.13-3.76-0.13-6.44 0.5-2.65 0.52-4.87 0.79-7.56 0.5l-2-3 2-1h-7v2h-2c-0.51-1.92-1-3.83-1.5-5.75-0.28-1.07-0.56-2.13-0.84-3.23-0.66-3.02-0.66-3.02-0.66-7.02 4.6-1.53 9.19-1.18 14-1.19 1.01-0.01 2.02-0.02 3.06-0.03 0.97-0.01 1.94-0.01 2.94-0.01 0.89 0 1.77-0.01 2.69-0.01 2.31 0.24 2.31 0.24 5.31 2.24l1-3z" fill="#0A213D"/>
  <path transform="translate(1493,227)" d="m0 0c0.49 0.99 0.49 0.99 1 2l-14 1c1.48 0.5 1.48 0.5 3 1 0.49 0.99 0.49 0.99 1 2l1-1c1.67-0.04 3.33-0.04 5 0 0.49 0.99 0.49 0.99 1 2h-4v2l4 1-1 3c-0.35 1.66-0.68 3.33-1 5-1.98 0.66-3.96 1.32-6 2 0.49 2.97 0.49 2.97 1 6-2.05-0.26-4.1-0.52-6.15-0.78-1.71-0.24-1.71-0.24-2.85-0.22h-12l-1-4c-0.62 0.21-1.24 0.41-1.88 0.62-0.7 0.13-1.4 0.25-2.12 0.38l-2-2c2.49-1.25 3.41-0.78 6 0v-2h-13v-5l5-2-1-2c6.02-1.47 10.9-2.33 17-1v-2c0.99-0.33 1.98-0.66 3-1l1-3h-15v-1l34-1z" fill="#03203C"/>
  <path transform="translate(1124 227)" d="m0 0c0.85 0.01 1.71 0.02 2.59 0.03 0.98 0 1.95 0.01 2.96 0.02 1.08 0.01 2.16 0.02 3.28 0.04 1.13 0.01 2.26 0.01 3.43 0.02 3.76 0.04 7.52 0.08 11.3 0.12 2.6 0.02 5.2 0.05 7.8 0.07 6.15 0.06 12.3 0.12 18.5 0.18 7.01 0.07 14 0.14 21 0.2 14.4 0.14 28.8 0.28 43.2 0.43v1c-56.4 0.49-56.4 0.49-114 1l2 7v4c0.31 2.33 0.64 4.67 1 7l2-3c3.62-0.19 3.62-0.19 7 0l2 4c3.04 0.08 5.07-0.03 8-1l3 2 1-2c1.98 0.32 3.97 0.65 5.95 0.97 2.36 0.22 2.36 0.22 5.05-1.97 0.72-2.06 0.72-2.06 1-4 2.93 0.75 2.93 0.75 6 2 0.69 2.08 0.69 2.08 1 4 6.21 1 10.8 0.89 16.8-0.82 0.72-0.06 1.43-0.12 2.17-0.18 1.59 1.4 1.59 1.4 3 3 3.1 0.72 3.1 0.72 6 1-2 2-2 2-5.05 2.24-1.31-0.01-2.62-0.01-3.97-0.02-0.73 0-1.45 0.01-2.19 0.01-2.39-0.01-4.79-0.02-7.18-0.04-1.65 0-3.31 0-4.97-0.01-4.36 0-8.72-0.02-13.1-0.05-4.45-0.02-8.9-0.02-13.4-0.03-8.73-0.03-17.5-0.06-26.2-0.1-0.03-4.32-0.05-8.63-0.07-12.9-0.01-1.23-0.01-2.46-0.02-3.73-0.01-1.17-0.01-2.34-0.01-3.55-0.01-1.08-0.01-2.17-0.02-3.28 0.16-3.45 0.16-3.45 3.05-3.61z" fill="#05192D"/>
  <path transform="translate(151 160)" d="m0 0c2.12 0.94 2.12 0.94 3.12 2.94 1 0.33 1.98 0.66 3 1-2.95 1.97-4.55 2.57-8 3-0.99-0.33-1.97-0.66-3-1-0.99 2.97-1.97 5.94-3 9h-5c-0.14 0.87-0.14 0.87-0.28 1.76-0.87 2.72-2.11 3.96-4.09 5.99-6.4 7.09-7.64 15.6-9.02 24.9-0.94 5.75-2.34 10.2-6.61 14.4-2.81 1.44-2.81 1.44-5 2v-2h2v-5c-0.98 1.32-1.98 2.64-3 4-0.65-0.33-1.31-0.66-2-1 1.86-4.77 1.86-4.77 3.06-6.66 1.39-3.44 1.2-6.88 1.26-10.5 0.28-7.07 1.2-12.1 5.68-17.8 0.51-0.67 1.02-1.34 1.54-2.03 3.84-4.73 8.3-8.43 13.1-12.1 2.29-1.83 4.28-3.78 6.33-5.86 5.78-5.03 5.78-5.03 9.88-4.94z" fill="#BF1118"/>
  <path transform="translate(815,154)" d="m0 0 4 1c0.19 1.98 0.38 3.96 0.56 5.94 0.11 1.1 0.21 2.2 0.32 3.34 0.04 0.9 0.08 1.79 0.12 2.72l-1 1c-0.03 3.3 0.07 6.6 0.16 9.9-0.16 3.1-0.16 3.1-2.16 6.1h2l-1 3c-1.13-0.02-2.27-0.04-3.44-0.06-3.38-0.36-3.38-0.36-4.56 1.06l4 1v4h-8c1.13 1.36 1.13 1.36 4.06 1.06 0.97-0.02 1.94-0.04 2.94-0.06l-2 4c-1.39-0.09-1.39-0.09-2.81-0.19-3.17-0.12-3.17-0.12-5.07 1.69-0.37 0.5-0.74 0.99-1.12 1.5-0.99-0.33-1.98-0.66-3-1l-2 3 1 2c-0.28 2.34-0.61 4.68-1 7-1.49 0.5-1.49 0.5-3 1v-6h-2l1-3h2c0.12-0.74 0.25-1.49 0.38-2.25 0.58-2.58 1.25-4.5 2.62-6.75 0.99-0.5 0.99-0.5 2-1l-3-3c2.48-0.5 2.48-0.5 5-1l1-8c0.99 0.33 1.98 0.66 3 1-0.19-0.85-0.37-1.69-0.56-2.56-0.48-3.74-0.16-6.76 0.56-10.4l1-1-1-3v-4h2l-1-3 2-1 2 2c0.99-0.33 1.98-0.66 3-1l1-5z" fill="#0A223E"/>
  <path transform="translate(16,136)" d="m0 0h1v9c0.78 0.06 1.57 0.12 2.38 0.19 0.86 0.27 1.73 0.53 2.62 0.81 1.31 2.56 1.31 2.56 2 5l-4 3-1-2c-0.75 3.47-0.75 3.47-1 7l5-1 1 3c-3.62 1.32-6.1 2-10 2l-2 2c0.66-0.35 1.32-0.7 2-1.06 4.05-1.27 6.83-0.65 11 0.06v3l-2 1 1 4c-1.48 0.5-1.48 0.5-3 1l2 3c-3.31 1-6.3 1.1-9.75 1.06-0.98-0.01-1.97-0.02-2.98-0.02-0.75-0.02-1.5-0.03-2.27-0.04l-1-2c0.99-0.5 0.99-0.5 2-1l-3-3 5-3h-3c-1.62-1.06-1.62-1.06-3-3-0.62-3.19-0.62-3.19-1-7-0.23-1.28-0.45-2.56-0.69-3.88-0.57-4.54 0.16-8.82 1.69-13.1l2-2 2 8c0.4-1.39 0.4-1.39 0.81-2.81 1.1-2.95 1.72-4.34 4.19-6.19h2v-2z" fill="#455462"/>
  <path transform="translate(990,226)" d="m0 0c6.62-0.25 6.62-0.25 10 2l-4 4c2.65 1.46 3.89 2 7 2v3h2c0.5 1.49 0.5 1.49 1 3-1.01-0.04-2.02-0.08-3.06-0.12-4.03 0.12-7.1 0.97-10.9 2.12-1.41 0.14-2.83 0.27-4.25 0.38-3.78 0.24-3.78 0.24-5.75 2.68-0.33 0.64-0.66 1.28-1 1.94-7.62-1.75-7.62-1.75-11-4l-2 2c-3.12 0.12-3.12 0.12-6 0v-2l-4-1 1-5h2l-1-3c0.63-0.04 1.26-0.07 1.91-0.11 4.41-0.34 8.34-0.8 12.5-2.45 3.62-1.44 3.62-1.44 7.62-1.44 2.34-0.31 4.67-0.64 7-1l1-3z" fill="#0A223E"/>
  <path transform="translate(514 229)" d="m0 0c1.29-0.01 1.29-0.01 2.61-0.01 0.95 0.01 1.89 0.02 2.86 0.03h3.02c3.29 0 6.59 0.02 9.88 0.05 2.28 0 4.57 0.01 6.85 0.01 6.01 0.01 12 0.04 18 0.07 6.13 0.04 12.3 0.05 18.4 0.06 12 0.04 24.1 0.09 36.1 0.15v25c-3.22-4.29-3.43-5.61-3.69-10.8-0.07-1.17-0.13-2.34-0.2-3.55-0.06-1.33-0.06-1.33-0.11-2.7-1.15-0.43-1.15-0.43-2.32-0.87-2.68-1.13-2.68-1.13-5.68-3.13-4.15-0.29-4.15-0.29-8 1-2.79 0.13-5.53 0.19-8.32 0.19-0.76 0.01-1.52 0.02-2.3 0.04-4.25 0.01-7.5-0.27-11.4-2.23v-2c-1.98 0.33-3.96 0.66-6 1l-1 3v-2c-3.96 0.66-7.92 1.32-12 2v-2c-1.98 0.66-3.96 1.32-6 2 0.99 0.33 1.98 0.66 3 1-5.04 0.83-9.82 1.11-14.9 1.06-0.68 0-1.37-0.01-2.07-0.01-1.67-0.01-3.33-0.03-4.99-0.05l1-2h-11l1 2c-1.28-0.29-2.56-0.58-3.88-0.87-0.72-0.17-1.44-0.33-2.18-0.5-1.94-0.63-1.94-0.63-3.94-2.63 2.31-2.77 3.64-3.37 7.23-3.36z" fill="#03203D"/>
  <path transform="translate(649,194)" d="m0 0 4 4c2.99-1 3.95-1.75 6-4 1.35 6.4 1.35 6.4-0.44 9.44l-1.56 1.56h3v4h2c0.25 1.28 0.5 2.56 0.75 3.88 0.7 3.31 0.7 3.31 3.25 5.37 0.66 0.25 1.32 0.5 2 0.75 0.7 1.32 1.37 2.65 2 4l3 2 2 2c1.49 0.5 1.49 0.5 3 1h-2v2h2v2c1.55 0.43 1.55 0.43 3.12 0.88 2.45 0.68 4.79 1.45 7.19 2.31 2.63 1.13 2.63 1.13 4.69-0.19 0.68 0.78 1.36 1.57 2.06 2.38 3.38 3.01 5.5 3.86 9.94 4.62 2.34-0.32 4.67-0.65 7-1 2.44 0.94 2.44 0.94 4 2v2l2 1h-4c-0.5 0.99-0.5 0.99-1 2l-1-1c-0.5 0.99-0.5 0.99-1 2-4.61 1.72-8.21 0.23-12.6-1.5-1.06-0.41-1.06-0.41-2.14-0.84-20.9-8.42-37.3-24.6-46.4-45.3-0.93-2.61-1.01-4.64-0.85-7.39z" fill="#032542"/>
  <path transform="translate(961 71.9)" d="m0 0c1.19 0.01 2.38 0.02 3.6 0.03 0.92 0.01 1.83 0.02 2.78 0.03v2c1.48 0.5 1.48 0.5 3 1 0.33-0.66 0.65-1.32 1-2 0.99 0.33 1.98 0.66 3 1-1 1.65-1.99 3.3-3 5 0.99 0.33 1.98 0.66 3 1 0.65 0.66 1.32 1.32 2 2 2.32 0.4 4.65 0.74 7 1v3c-4.42 2.15-4.42 2.15-7.57 1.38-0.8-0.13-1.61-0.25-2.43-0.38-0.56 0.64-1.12 1.28-1.69 1.94-3.3 2.94-6 2.38-10.3 2.2-1.01-0.07-1.01-0.07-2.04-0.14-0.34-0.99-0.66-1.98-1-3l-5 1v-2c-1.22-0.14-2.44-0.29-3.69-0.44-3.14-0.39-6.22-0.88-9.31-1.56 0.33-0.66 0.65-1.32 1-2h-5c3.58-3.58 7.97-4.89 12.9-5.15 1.95 0.02 3.9 0.06 5.84 0.14 0.74 0.01 1.47 0.01 2.23 0.01 0.33-0.33 0.65-0.66 1-1h-8c2.48-5.5 4.78-5.12 10.6-5.06z" fill="#03203D"/>
  <path transform="translate(224,160)" d="m0 0c3.43 1.7 5.82 3.86 8 7 0.96 4.18 0.94 7.82 0 12-3.18 3.6-5.89 4.89-10.6 5.38-5-0.04-8.59-2.26-12.4-5.38-1.63-3.26-1.47-5.38-1-9 3.9-5.95 8.44-10.9 16-10z" fill="#C01219"/>
  <path transform="translate(958,88)" d="m0 0 1 2h2.31 5.69c0.84-0.01 1.69-0.02 2.56-0.04 0.95 0 1.9-0.01 2.88-0.02 0.94-0.01 1.89-0.03 2.87-0.04 2.41 0.09 4.39 0.41 6.69 1.1v2c1.79-0.28 1.79-0.28 3.62-0.56 2.85-0.37 4.69-0.39 7.57 0.12 3.3 0.52 4.8-0.26 7.81-1.56 0.99 0.33 1.98 0.66 3 1-0.95 3.35-1.9 6.69-3 10h-2l-2 4c-2.67-0.67-5.33-1.33-8-2v-2h-3v-2c-0.72-0.14-1.44-0.29-2.19-0.44-3.9-0.78-3.9-0.78-7.81-1.56v-2c-1.05 0.02-1.05 0.02-2.12 0.04-0.91 0-1.82 0.01-2.76 0.02-1.35 0.02-1.35 0.02-2.74 0.04-2.38-0.1-2.38-0.1-4.38-1.1-1.81-0.1-3.62-0.13-5.44-0.12-0.97-0.01-1.93-0.01-2.93-0.01-2.74 0.02-2.74 0.02-5.63 1.13-1.56 0.07-3.13 0.09-4.69 0.06-1.21-0.01-1.21-0.01-2.45-0.02-0.92-0.02-0.92-0.02-1.86-0.04 0.99-0.33 1.98-0.66 3-1 0.19-0.8 0.37-1.61 0.56-2.44 1.44-2.56 1.44-2.56 3.72-3.33 3.24-0.65 6.41-1.23 9.72-1.23z" fill="#0A223E"/>
  <path transform="translate(740,142)" d="m0 0c2.44 2.06 2.44 2.06 4 4l-3 2 1 5c-1.21 0.56-1.21 0.56-2.44 1.12-2.82 1.68-2.82 1.68-3.5 4.88-0.35 3.18-0.35 3.18 1.94 6-5.2 1.87-7.9 2.15-13 0-1.33-0.35-2.66-0.69-4-1l1 6-1-2h-2v-2h-2c-1.34-7.19-1.34-7.19 0.19-10.8 1.8-2.17 3.41-3.72 5.81-5.19h2v-2h2l2-4h2v-2c3.19-1.59 5.6-0.76 9 0z" fill="#041E38"/>
  <path transform="translate(286,100)" d="m0 0c-2.46 1.64-4.28 2.58-7 3.56-0.68 0.25-1.36 0.5-2.06 0.76-1.64 0.57-3.29 1.13-4.94 1.68-1.17 2.42-1.17 2.42-2 5l-1 2h-2c-0.14 0.58-0.29 1.16-0.44 1.75-0.52 2.08-1.04 4.17-1.56 6.25h-3c-0.31 0.8-0.62 1.61-0.94 2.44-1.06 2.56-1.06 2.56-2.06 3.56-0.1 1.03-0.21 2.06-0.31 3.12-0.8 4.52-2.26 7.04-4.69 10.9h-2c-0.1 0.72-0.21 1.44-0.31 2.19-0.75 3.07-2.04 5.13-3.69 7.81-0.12 0.57-0.24 1.14-0.37 1.73-0.9 3.26-2.56 6.08-4.19 9.02-0.33 0.6-0.66 1.2-1 1.82-0.81 1.48-1.62 2.96-2.44 4.43h-2c-4.38-7.28-4.38-7.28-3.48-11.3 1.02-2.11 1.96-3.88 3.48-5.66 1.49-0.5 1.49-0.5 3-1 0.25-0.8 0.5-1.61 0.75-2.44 1.82-5.17 5.05-9.14 8.25-13.6 0.99-1.45 1.97-2.91 2.94-4.38 0.48-0.73 0.97-1.46 1.47-2.21 0.52-0.8 1.05-1.59 1.59-2.41 1.99-3.01 3.99-6.01 6-9 1.28-1.92 2.52-3.87 3.71-5.85 3.55-5.66 6.55-8.44 12.9-10.7 2.76-0.49 4.74-0.14 7.43 0.57z" fill="#BF1118"/>
  <path transform="translate(506,80)" d="m0 0c2.97 0.99 5.94 1.98 9 3 0.84 3.55 1.02 6.6 0.56 10.2-0.99 8.22-0.64 16.5-0.56 24.8-1.33 0.33-2.67 0.67-4 1-0.74 0.19-1.49 0.37-2.25 0.56-0.58 0.15-1.15 0.29-1.75 0.44-2-3-2-3-1.94-6.5 0.33-3.46 0.33-3.46-1.62-5.19-0.71-0.65-0.71-0.65-1.44-1.31 0.29-3.04 1.26-4.39 3-7l-1-1-2 3c-0.2-1.42-0.38-2.83-0.56-4.25-0.11-0.79-0.21-1.58-0.32-2.39-0.12-2.37 0.18-4.11 0.88-6.36h2l2-9z" fill="#062342"/>
  <path transform="translate(163,131)" d="m0 0c1.25 2 1.25 2 2 4 0.99 0.33 1.98 0.66 3 1 1 5.34 0.93 9.63 0 15-1.62 1.62-3.39 1.21-5.62 1.25-4.98-0.08-8.15-0.58-12.4-3.25-2.75-4.62-3.81-8.66-3-14 4.92-5.19 9.19-5.64 16-4z" fill="#C01219"/>
  <path transform="translate(26,198)" d="m0 0c1.28 5.45 1.28 5.45 0 8l8 2 1 4c-3.71 2.68-6.48 4.31-11 5-1.3 0.53-1.3 0.53-2.62 1.06-2.38 0.94-2.38 0.94-5.38 0.94l2 1v2l4 1c-3.47 5.83-3.47 5.83-6.14 6.69-0.92 0.15-0.92 0.15-1.86 0.31-0.84-2.23-1.67-4.45-2.5-6.69-0.24-0.62-0.48-1.25-0.72-1.89-1.32-3.6-2.07-6.59-1.78-10.4 0.31 0.64 0.62 1.28 0.94 1.94 0.89 2 0.89 2 2.06 3.06 0.62-3.44 1-6.49 1-10 0.99-0.33 1.98-0.66 3-1v-5c1.29-0.53 2.58-1.05 3.88-1.56 0.71-0.29 1.43-0.58 2.17-0.88 1.95-0.56 1.95-0.56 3.95 0.44z" fill="#475865"/>
  <path transform="translate(42,225)" d="m0 0c2.93 3.24 4.25 5.81 4.44 10.1-0.45 3.97-0.67 5.17-3.44 7.88-4.6 0.96-9.78 1.11-14-1.02-2.49-2.04-4.17-4.31-5.95-6.98 0.35-3.36 1.18-6.15 3-9 5.22-2.69 10.8-4.13 16-1z" fill="#C01219"/>
  <path transform="translate(1553,120)" d="m0 0c0.99 0.33 1.98 0.66 3 1 0.99-0.33 1.98-0.66 3-1l-1 4c2.47 0.5 2.47 0.5 5 1l1 3h-2v-2h-2c1.37 3.16 1.99 3.99 5 6 1 3 1 3 0 6-1.67 1.33-3.33 2.67-5 4l-1 3c-0.99 0.33-1.98 0.66-3 1l-1 2h-2c-0.12-0.8-0.25-1.61-0.38-2.44-0.2-0.84-0.41-1.69-0.62-2.56l-2-1 1-1c-0.6-0.23-1.2-0.45-1.81-0.69-2.86-1.71-3.76-3.32-5.19-6.31-0.69-3.31-0.69-3.31-1-6h2l1-5h6l1-3z" fill="#0A223E"/>
  <path transform="translate(1123,229)" d="m0 0h115v25h-1c-1.45-4.54-2.24-8.18-2-13h2c-0.49-1.98-0.49-1.98-1-4l-5-1v-2c-1.58-0.2-3.17-0.38-4.75-0.56-0.88-0.11-1.76-0.21-2.67-0.32-2.51-0.24-2.51-0.24-4.62 0.41-2.49 0.6-4.11 0.15-6.58-0.47-4.48-0.99-8.58-1.2-13.2-1.03-2.23-0.03-2.23-0.03-4.05-0.52-2.51-0.59-4.77-0.64-7.35-0.64-0.97 0-1.95-0.01-2.95-0.01-1.01 0.01-2.03 0.01-3.07 0.02-1.02-0.01-2.04-0.01-3.1-0.02-0.97 0-1.94 0.01-2.94 0.01h-2.7c-2.06-0.1-2.06-0.1-3.07 1.13-4.49 0.18-8.59-0.22-13-1h-4l-1 2c-0.55-0.17-1.1-0.33-1.67-0.5-2.64-0.57-4.98-0.56-7.68-0.49-1.02 0.01-2.03 0.03-3.08 0.05-2.14 0.04-4.28 0.1-6.41 0.15-1.02 0.02-2.03 0.03-3.07 0.05-1.4 0.03-1.4 0.03-2.82 0.06-0.75-0.1-1.5-0.21-2.27-0.32l-2-3z" fill="#07223F"/>
  <path transform="translate(288 71.9)" d="m0 0c2.62 2.12 2.62 2.12 3.62 4.12 0.57 7.05 0.57 7.05-1.37 10.3-5.98 3.84-11.7 5.18-18.6 3.68-0.22-2.79-0.42-5.58-0.62-8.37-0.06-0.79-0.13-1.59-0.2-2.41-0.14-2.07-0.16-4.14-0.18-6.22 4.51-4.5 12.1-4.04 17.4-1.12z" fill="#C01219"/>
  <path transform="translate(811,110)" d="m0 0 2 6h-2l1 2c0.78 0.08 1.57 0.16 2.38 0.25 2.62 0.75 2.62 0.75 4.43 3.69 1.19 3.06 1.19 3.06 1.19 5.06-1.07 0.1-2.14 0.21-3.25 0.31-3.67 0.68-5 1.35-7.75 3.69h-2c0.99 1.65 1.98 3.3 3 5l-4 1c-0.25-1.11-0.5-2.23-0.75-3.38-0.8-3.67-0.8-3.67-3.19-4.62-0.68-0.33-1.36-0.66-2.06-1-0.75-1.72-1.48-3.44-2.14-5.19-1.34-2.82-3.65-4.66-5.86-6.81v-3c1.42 0.74 1.42 0.74 2.88 1.5 2.84 1.64 2.84 1.64 5.12 1.5v-5c4.12-1.63 6.71-2.26 11-1z" fill="#0A223E"/>
  <path transform="translate(1443 174)" d="m0 0c0.78 0.31 1.57 0.62 2.38 0.94l3-2 3 2c-0.67 1.32-1.32 2.64-2 4l3 3c0.32-0.66 0.66-1.32 1-2 0.19 1.46 0.19 1.46 0.4 2.95 0.17 1.28 0.35 2.55 0.53 3.86 0.18 1.26 0.35 2.53 0.53 3.83 0.44 3.34 0.44 3.34 1.54 6.36 0.08 1.99 0.1 3.98 0.09 5.98 0 1.16 0 2.32-0.01 3.52-0.01 1.22-0.01 2.43-0.02 3.68-0.01 1.23-0.01 2.46-0.02 3.72-0.01 3.03-0.02 6.07-0.04 9.1-3-2-3-2-3.69-4.18-0.37-3.36-0.37-6.62-0.31-10 0.04-6.01-0.22-11.8-1-17.8h-2c0.66 2.64 1.31 5.28 2 8h-3c-0.19-1.18-0.19-1.18-0.37-2.38-0.91-5.67-1.89-11.2-3.63-16.6-1 0.49-1 0.49-2 1v5h-2c0.09 0.72 0.19 1.45 0.28 2.19 0.63 5.46 1.08 9.67-1.28 14.8-2.37-2.37-2.59-3.75-3-7 0.32-0.33 0.66-0.66 1-1 0.48-5.62-0.76-10.2-2.45-15.6-0.55-2.45-0.55-2.45 0.45-5.45 3.1-0.89 4.57-1.17 7.62 0.06z" fill="#032542"/>
  <path transform="translate(249 192)" d="m0 0c2.78 1.56 5.07 3.45 7.56 5.44 0.87 0.33 1.74 0.66 2.63 1 2.91 1.23 4.02 2.13 5.37 5-0.81 3.12-0.81 3.12-2 6v2c-3.49-0.98-5.81-1.84-8.62-4.19-2.19-2.1-2.19-2.1-4.69-1.56-0.84 0.37-0.84 0.37-1.69 0.75-0.99-1.65-1.98-3.3-3-5-3.69 1.23-5.35 3.21-8 6-8.35-2.31-8.35-2.31-11.1-5.19-0.31-0.6-0.62-1.2-0.94-1.81 0.62 0.16 1.24 0.33 1.88 0.5 2.08 0.57 2.08 0.57 4.12 0.5v-3c2.8-2.02 5.53-3.66 9-4l3 2v-2c2.28-2.36 3.16-3.2 6.44-2.44z" fill="#B50615"/>
  <path transform="translate(1515,71)" d="m0 0c12.4 3.58 23.8 9.9 33 19v2h2c4.82 5.08 8.7 10.4 11 17-3.31 0.25-3.31 0.25-7 0-1.94-1.81-1.94-1.81-3-4v-3c-0.57-0.26-1.15-0.52-1.74-0.79-2.44-1.31-4.31-2.81-6.38-4.65-0.69-0.59-1.37-1.19-2.08-1.81-1.8-1.75-1.8-1.75-3.8-4.75-0.99-0.33-1.98-0.66-3-1l-1 3c-0.93-3.01-1.04-3.87 0-7-0.87-0.43-1.73-0.87-2.62-1.31-1.12-0.56-2.23-1.12-3.38-1.69-0.99-0.45-1.98-0.91-3-1.38-3.52-1.9-6.1-3.86-9-6.62v-3z" fill="#041F3A"/>
  <path transform="translate(101,193)" d="m0 0c3.06 1.81 3.06 1.81 5 5 0.43 6.17-0.56 10.8-4 16-10.9-0.03-10.9-0.03-14.8-3.56-1.48-4.27-1.77-7.19-0.19-11.4 3.58-5.8 7.42-7.15 14-6z" fill="#C01219"/>
  <path transform="translate(672,134)" d="m0 0 4 1v4h-2c0.02 1.3 0.04 2.6 0.06 3.94 0.02 1.35 0.01 2.71-0.06 4.06l-1 1c-0.1 1.99-0.13 3.98-0.13 5.97 0 1.21-0.01 2.42-0.01 3.67 0.01 1.27 0.01 2.55 0.02 3.86-0.01 1.27-0.01 2.55-0.02 3.86 0 1.21 0.01 2.42 0.01 3.67v3.39c-0.16 2.51-0.16 2.51 1.13 3.58 0.36 2.33 0.69 4.66 1 7 0.32 1.67 0.65 3.34 1 5h2v4h2v4h2v3h2l-1 3h-2l-2 2c-2.78-4.95-5.51-9.9-8-15-0.58-1.03-1.15-2.06-1.75-3.12-1.25-2.88-1.25-2.88-0.94-5.26 0.23-0.53 0.46-1.07 0.69-1.62h2c-0.99-1.39-0.99-1.39-2-2.81-2.79-4.81-2.55-9.78-2-15.2l1-2c0.07-3.25 0-6.49-0.06-9.74 0.05-2.92 0.42-5.43 1.06-8.26v-2h2l1-5z" fill="#03233F"/>
  <path transform="translate(879,136)" d="m0 0h2l1 4h-2c0.37 0.91 0.74 1.81 1.12 2.75 0.88 3.25 0.88 3.25-0.12 5.13-1.45 3.08-0.36 5.17 0.69 8.32 0.1 0.59 0.2 1.19 0.31 1.8l-2 2h-3c-1.88 3.87-1.88 3.87-1 8l-1 2 2 1-3 2v-2l-5 2c-0.5-1.49-0.5-1.49-1-3v7c-2-2-2-2-2.23-4.21 0.14-8.71 0.14-8.71 1.23-12.8h2c0.2-1.92 0.38-3.83 0.56-5.75 0.11-1.07 0.21-2.13 0.32-3.23 0.11-2.66-0.06-4.52-0.88-7.02h3l1 1c2.74-2.36 3.76-4.64 5-8l1-1z" fill="#032542"/>
  <path transform="translate(1194 87)" d="m0 0c0.78 0.33 1.57 0.66 2.38 1v-2c2.91-0.05 5.83-0.09 8.74-0.12 0.83-0.02 1.66-0.04 2.5-0.06 0.8 0 1.6-0.01 2.43-0.02 0.73-0.01 1.46-0.02 2.22-0.03 2.4 0.26 4.02 1.04 6.11 2.23 0.32-0.66 0.66-1.32 1-2 2 2 2 2 2 3 1.17 0.07 1.17 0.07 2.37 0.15 1.01 0.07 2.02 0.15 3.06 0.23 1.52 0.1 1.52 0.1 3.06 0.21 0.83 0.13 1.65 0.27 2.51 0.41 0.49 0.99 0.49 0.99 1 2h-77c-0.33-0.66-0.67-1.32-1-2 5.27 0.33 10.6 0.66 16 1v-4c1.11 0.02 2.22 0.04 3.37 0.06 18.3-0.31 18.3-0.31 19.2-0.06z" fill="#0A223E"/>
  <path transform="translate(784,213)" d="m0 0c0.54 0.37 1.07 0.74 1.62 1.12 3.33 1.23 5.19 0.18 8.38-1.12 0.12 0.8 0.25 1.61 0.38 2.44 0.2 0.84 0.41 1.69 0.62 2.56l2 1-2 6h4 2c-0.81 2.44-0.81 2.44-2 5-3.48 1.16-5.46 0.71-9 0l-1 3c-2.97-0.33-5.94-0.66-9-1l-1 2c-2.32 0.41-4.66 0.74-7 1v-6c0.81-0.4 0.81-0.4 1.64-0.8 0.72-0.36 1.44-0.71 2.17-1.08 0.71-0.34 1.42-0.69 2.15-1.05 2.25-1.14 2.25-1.14 5.04-3.07-0.21-1.09-0.41-2.19-0.62-3.31-0.38-3.69-0.38-3.69 1.62-6.69z" fill="#0A223E"/>
  <path transform="translate(210,109)" d="m0 0c0.43 0.5 0.87 0.99 1.31 1.5 1.69 1.83 1.69 1.83 4.69 1.5l2 1v2h2l-2-4c1.88-0.62 1.88-0.62 4-1l2 2c3.13 1.04 3.99 0.93 7 0 0.99 1.48 0.99 1.48 2 3l-1 2c0.99 0.33 1.98 0.66 3 1-1 3-1 3-3 4-0.99 0.33-1.98 0.66-3 1l-1 2-1 1c-1.01 1.33-2.01 2.66-3 4-0.41-0.76-0.82-1.53-1.25-2.31-1.71-2.63-3.16-3.99-5.75-5.69l4-1c-2.93-0.22-2.93-0.22-5 1-2.09 0.59-3.82 1-6 1v-2h-4l-2-5c3.75-3 3.75-3 6-3l-1-3 1-1z" fill="#465765"/>
  <path transform="translate(1121,149)" d="m0 0h69v2l-12 1v2c-1.16-0.05-2.32-0.09-3.51-0.14-1.54-0.04-3.08-0.07-4.61-0.11-0.77-0.03-1.53-0.07-2.31-0.1-6.64-0.12-10.1 2.02-15 6.6-0.53 0.58-1.07 1.16-1.62 1.75-0.95-0.33-1.9-0.66-2.88-1-2.89-1.1-2.89-1.1-5.12-1l-1-7h6v-2h-18v1c-2.97-0.33-5.94-0.66-9-1v-2z" fill="#06213F"/>
  <path transform="translate(1223 232)" d="m0 0c1.05 0.16 1.05 0.16 2.12 0.32 1.06 0.15 1.06 0.15 2.13 0.3 1.87 0.39 1.87 0.39 3.87 1.39v2h5c0.33 1.65 0.67 3.3 1 5h-2c0.33 1.22 0.67 2.44 1 3.69 0.87 3.2 1.04 6 1 9.31-3.91 0.06-7.83 0.1-11.7 0.13-1.12 0.01-2.23 0.03-3.37 0.05-1.61 0.01-1.61 0.01-3.24 0.02-0.99 0.01-1.97 0.02-2.99 0.03-2.71-0.23-4.34-0.84-6.66-2.23 3.97-0.49 3.97-0.49 8-1 0.38-1.45 0.38-1.45 0.76-2.94 1.24-3.06 1.24-3.06 3.12-4 2.24-0.06 3.99 0.26 6.12 0.94-0.04-4.11-0.04-4.11-1-8-2.28-1.69-4.21-2.19-7-3 2-2 2-2 3.88-2.01z" fill="#0A213D"/>
  <path transform="translate(1452,231)" d="m0 0 1 3h2l1-2c0.99 0.33 1.98 0.66 3 1v2l-5 2 1 2-5 1v4l12 1v2h-5l5 1 1 3c-0.81-0.08-1.62-0.17-2.45-0.25-1.07-0.11-2.14-0.21-3.24-0.31-1.05-0.11-2.11-0.21-3.2-0.32-2.94-0.11-5.26 0.23-8.11 0.88-3.22-0.24-4.69-0.76-7.25-2.75-2.02-2.6-2.59-3.97-2.75-7.25 0.94-3.31 0.94-3.31 2-6h2l1-2h10l1-2z" fill="#0A213D"/>
  <path transform="translate(1496,234)" d="m0 0c2.88 0.25 2.88 0.25 6 1 1.38 2.06 1.38 2.06 2 4-0.64 0.1-1.28 0.21-1.94 0.31-1.02 0.34-1.02 0.34-2.06 0.69l-1 3-8 1c0.72 2.02 0.72 2.02 2 4 2.05 0.81 2.05 0.81 4 1v-2c3.32-3.06 7.43-5 12-5v2c2.17-0.51 4-1 6-2 2.33-0.04 4.67-0.04 7 0-0.99 0.33-1.98 0.66-3 1v2c-4.28 4.52-9.01 5.17-14.9 6.19-1.3 0.24-1.3 0.24-2.64 0.5-13.3 2.47-13.3 2.47-19.4 2.37-0.77-0.01-1.54-0.02-2.34-0.02-0.57-0.02-1.13-0.03-1.72-0.04v-1h6l-1-6c1.98-0.66 3.96-1.32 6-2v-4c3.46-0.5 3.46-0.5 7-1v-6z" fill="#0A223E"/>
  <path transform="translate(878,196)" d="m0 0h1c0.46 2.02 0.91 4.04 1.37 6.05 0.53 2.16 0.53 2.16 2.63 3.95 0.31 0.97 0.62 1.94 0.94 2.94 1.03 2.98 1.8 4.01 4.06 6.06v2l2 1h-2v2c0.99-0.33 1.98-0.66 3-1 0.25 0.58 0.5 1.16 0.75 1.75 1.42 2.56 3.15 4.22 5.25 6.25l2 3c1.49 0.5 1.49 0.5 3 1v2c3.96 0.66 7.92 1.32 12 2l-1 5-5-1 2 3c-11.6-4.17-20.3-14.4-27.3-24.1-0.42-0.58-0.84-1.16-1.28-1.75-6.65-9.44-6.65-9.44-6.22-14.4 0.88-1.97 1.79-3.91 2.81-5.81z" fill="#032541"/>
  <path transform="translate(306,217)" d="m0 0h3c-3.25 17.8-18.4 36.2-29.8 49.5-1.25 1.47-1.25 1.47-2.16 3.46h-2c-0.4 0.96-0.4 0.96-0.81 1.94-1.19 2.06-1.19 2.06-4.19 3.06 0.3-0.57 0.6-1.13 0.91-1.72 1.07-2.24 1.81-4.41 2.53-6.78 1.07-3.3 2.06-6 4.56-8.5h2v2h2c0.12-0.97 0.25-1.94 0.38-2.94 0.2-1.01 0.41-2.02 0.62-3.06 0.99-0.5 0.99-0.5 2-1l1-3 3-2v-2l3-2c0.79-2.19 0.79-2.19 1.19-4.62 0.24-1.23 0.24-1.23 0.48-2.48 0.16-0.94 0.16-0.94 0.33-1.9l4-1c0.1-0.52 0.21-1.03 0.31-1.56 1.6-5.67 4.06-10.8 7.69-15.4z" fill="#B80916"/>
  <path transform="translate(497,237)" d="m0 0c1.98 0.5 1.98 0.5 4 1-0.17 1.09-0.33 2.19-0.5 3.31-0.57 3.57-0.57 3.57-0.5 6.69l8 1v2c0.99-0.33 1.98-0.66 3-1h3c1.5-0.03 1.5-0.03 3.03-0.07 1.15-0.02 2.29-0.04 3.47-0.05 1.72-0.04 1.72-0.04 3.47-0.08 3.03 0.2 3.03 0.2 6.03 2.2 1.68-0.64 3.34-1.31 5-2 1.34 0.31 2.67 0.65 4 1 1.63 0.06 3.25 0.06 4.88 0.03 0.92-0.01 1.84-0.03 2.79-0.04 1.93-0.03 3.86-0.07 5.8-0.12 1.38-0.01 1.38-0.01 2.78-0.03 0.84-0.02 1.68-0.03 2.55-0.05 2.2 0.21 2.2 0.21 5.2 2.21-7.16 1.11-14.2 1.14-21.4 1.13-1.91 0-1.91 0-3.86 0.01-2.68 0-5.36 0-8.04-0.01-3.44-0.01-6.88 0-10.3 0-3.28 0.01-6.56 0.01-9.85 0-1.23 0-2.47 0.01-3.75 0.01-1.13 0-2.27-0.01-3.44-0.01h-3.04c-2.27-0.13-2.27-0.13-3.27-1.13-0.1-1.46-0.13-2.92-0.12-4.38-0.01-1.18-0.01-1.18-0.01-2.39 0.13-2.23 0.13-2.23 1.13-5.23v-4z" fill="#051F39"/>
  <path transform="translate(786,236)" d="m0 0c0.06 3.25 0.06 3.25-1 7-8.02 5.05-21.4 9-31 9l-1-8c1.69-1.06 1.69-1.06 4-2 0.8 0.19 1.61 0.37 2.44 0.56 3.45 0.59 4.74-0.65 7.56-2.56h2l1-2 3 2 1-2h2v2c0.55-0.29 1.11-0.58 1.68-0.88 1.09-0.55 1.09-0.55 2.2-1.12 0.71-0.37 1.43-0.74 2.17-1.12 1.95-0.88 1.95-0.88 3.95-0.88z" fill="#0A223E"/>
  <path transform="translate(1200 69.9)" d="m0 0c1.03 0.01 1.03 0.01 2.07 0.01 1.01 0 1.01 0 2.03-0.01 3.72 0.01 7.09 0.39 10.7 1.14 2.58-0.05 5.13-0.19 7.7-0.36 2.3 0.36 2.3 0.36 4.11 2.37 0.59 0.98 0.59 0.98 1.19 1.99l-4 2v-2c-1.25 0.33-2.51 0.66-3.81 1-3.5 0.92-6.56 1-10.2 1l1 2c-3.67 1.17-7.17 1.07-11 1l-1-2 4-2c-2.97 0.34-2.97 0.34-6 1l-1 2h-3c-2.13-2.14-2.42-3.14-3-6 0.64-0.31 1.28-0.62 1.94-0.94 3.16-1.63 4.45-2.19 8.24-2.2z" fill="#03203D"/>
  <path transform="translate(1377 229)" d="m0 0c0.97 0 1.93 0.01 2.93 0.02 1.23 0.01 2.45 0.03 3.71 0.05 5.85 0.06 5.85 0.06 11.8 0.13v24h-2c-1.13-6.75-1.13-6.75 0-9h-3v-7c-0.77-0.13-1.53-0.25-2.32-0.38-2.68-0.62-2.68-0.62-5.68-2.62-2.12-0.13-2.12-0.13-4.38 0.06-4.05 0.11-6.34-0.52-9.62-3.06 3.4-2.27 4.56-2.24 8.54-2.2z" fill="#07213F"/>
  <path transform="translate(515 229)" d="m0 0h2.91c1.55 0.02 1.55 0.02 3.14 0.05 1.06 0 2.12 0.01 3.21 0.01 3.4 0.02 6.79 0.05 10.2 0.09 2.3 0.02 4.6 0.03 6.9 0.04 5.64 0.04 11.3 0.09 16.9 0.15v2c-5.5 1.3-10.5 0.71-16 0l2 1v2h-2l-1 2h-15l1-2h-11l1 2c-1.28-0.29-2.55-0.58-3.87-0.87-0.72-0.17-1.44-0.33-2.18-0.5-1.95-0.63-1.95-0.63-3.95-2.63 2.43-2.99 3.95-3.37 7.75-3.34z" fill="#031F3C"/>
  <path transform="translate(740,142)" d="m0 0c2.44 2.06 2.44 2.06 4 4l-3 2 1 2-10-2-2 4-2 2c-0.24 1.98-0.24 1.98-0.12 4.12 0.04 1.28 0.08 2.56 0.12 3.88-2.47-1.15-4.05-2.05-6-4l2-1h-2v-2c-2.16 2.16-3.48 4.37-5 7-0.69-1.69-0.69-1.69-1-4 1.68-3.63 3.59-5.91 7-8h2v-2h2l2-4h2v-2c3.19-1.59 5.6-0.76 9 0z" fill="#031B33"/>
  <path transform="translate(226,13)" d="m0 0c4.61 1.38 8.67 3.28 12.8 5.69 0.61 0.35 1.22 0.7 1.85 1.06 6.34 3.73 12.2 7.96 17.3 13.2-2.65 1.01-3.74 1.1-6.44 0.07-0.84-0.45-1.69-0.91-2.56-1.38-0.85-0.45-1.69-0.9-2.56-1.37-0.81-0.43-1.61-0.87-2.44-1.32-1.33-0.67-2.66-1.34-4-2v-2c-1.58-0.12-1.58-0.12-3.19-0.25-5.79-1.14-8.81-4.61-12.8-8.75l2-3z" fill="#465463"/>
  <path transform="translate(779,74)" d="m0 0c1.69 0.6 3.35 1.29 5 2 0.6 0.25 1.19 0.5 1.81 0.75 11.2 5.41 22.4 16.3 28.2 27.2-0.61-0.32-1.22-0.64-1.84-0.98-2.15-1.14-2.15-1.14-4.66-1.4-3.19-0.79-4.43-2.11-6.5-4.62l-1-3-3-2v-2h-2v-2c-0.93-0.43-0.93-0.43-1.88-0.88-2.12-1.12-2.12-1.12-4.12-3.12-0.83-0.27-1.65-0.54-2.5-0.81-2.5-1.19-2.5-1.19-3.81-3.81-0.23-0.79-0.46-1.57-0.69-2.38h-2l-1-3zm-1 2 2 2c-0.99-0.33-1.98-0.66-3-1l1-1z" fill="#041E38"/>
  <path transform="translate(508,127)" d="m0 0c2 2 2 2 3 4l3 2c0.51 2.16 0.51 2.16 0.69 4.62 0.1 1.23 0.1 1.23 0.2 2.48 0.03 0.63 0.07 1.25 0.11 1.9h-2c0.99 1.49 0.99 1.49 2 3 0.28 3.49-0.22 6.6-1 10-3 0-3 0-5.56-2.5-0.81-0.82-1.61-1.65-2.44-2.5h-2c1-3 1-3 2.19-4.75 1.24-3.43-0.03-5.9-1.19-9.25l2-2c0.4-2.32 0.74-4.66 1-7z" fill="#07233F"/>
  <path transform="translate(0,134)" d="m0 0h1l1 33c0.99-0.5 0.99-0.5 2-1v-3l2 1 1 3c1.98-0.5 1.98-0.5 4-1 0 3 0 3-1.5 4.69-0.49 0.43-0.99 0.86-1.5 1.31l2 2-2 2c2.31 0.33 4.62 0.66 7 1l1-2 1 3-2 2c-0.64-0.16-1.28-0.33-1.94-0.5-0.68-0.16-1.36-0.33-2.06-0.5l-3 2c-2.69-0.88-2.69-0.88-5-2v-7l-2 15h-1v-53z" fill="#485765"/>
  <path transform="translate(747,71)" d="m0 0 1 2-2 2c1.88 1.11 1.88 1.11 4 2l2-1c2.03 0.93 4.03 1.93 6 3l2 1 3-3c0.99 0.33 1.98 0.66 3 1l-4 3 1 2h-2l-1 2c-1.31 1.03-2.64 2.04-4 3-0.31-1.18-0.31-1.18-0.62-2.38-1.17-2.9-1.17-2.9-4.32-3.81-1.01-0.27-2.02-0.53-3.06-0.81l-3-2c-0.99 0.33-1.98 0.66-3 1-2.96-0.28-3.8-0.76-5.75-3.06-0.41-0.64-0.83-1.28-1.25-1.94h3l-1-4c3.36-1.68 6.36-0.64 10 0z" fill="#05203F"/>
  <path transform="translate(140)" d="m0 0h53v2c0.62-0.21 1.24-0.41 1.88-0.62 0.7-0.13 1.4-0.25 2.12-0.38l2 2h-4v2c-1.94-0.38-1.94-0.38-4-1-0.5-0.99-0.5-0.99-1-2h-12v2c-1.42 0.34-2.83 0.67-4.25 1-0.79 0.19-1.58 0.37-2.39 0.56-2.36 0.44-2.36 0.44-6.36 0.44l-1-3-3 3-1-3c-1.19-0.06-2.38-0.12-3.61-0.18-1.57-0.09-3.14-0.17-4.7-0.26-1.18-0.06-1.18-0.06-2.38-0.12-1.14-0.06-1.14-0.06-2.3-0.12-1.04-0.06-1.04-0.06-2.11-0.11-1.9-0.21-1.9-0.21-4.9-1.21v-1z" fill="#485765"/>
  <path transform="translate(992,206)" d="m0 0h29l-1 2h-18c1.63 3.12 1.63 3.12 4.12 3.69 0.62 0.1 1.24 0.2 1.88 0.31-1.97 2.52-2.97 2.99-6.19 3.69-1.39 0.15-1.39 0.15-2.81 0.31l-1 5h-7c0.66-0.54 1.32-1.07 2-1.62 2.31-2.28 2.31-2.28 2.25-5.63-0.08-0.91-0.16-1.81-0.25-2.75h-2v3h-2l-1 2 2-10z" fill="#02172C"/>
  <path transform="translate(1451,152)" d="m0 0h1c0.15 7.37-0.42 14.7-1 22-2.76 0.6-5.16 1-8 1-2.12-5.62-2.12-5.62-1-9 0.16-3.05 0.16-3.05-1-6l4-3 4 3c0.14-0.58 0.29-1.16 0.44-1.75 0.52-2.08 1.04-4.17 1.56-6.25z" fill="#07233E"/>
  <path transform="translate(917,237)" d="m0 0c2.5 1.38 2.5 1.38 5 3v2c0.72-0.39 1.44-0.78 2.19-1.19 2.81-0.81 2.81-0.81 5.5 0.25 2.61 2.19 3.47 3.67 4.31 6.94l-1 2c0.99 0.33 1.98 0.66 3 1-7.25-0.48-13.3-2.29-20-5v-4c-0.99-0.33-1.98-0.66-3-1l4-4z" fill="#032542"/>
  <path transform="translate(674,176)" d="m0 0c0.14 1.05 0.29 2.1 0.44 3.19 0.44 2.96 0.94 5.88 1.56 8.81h2v4h2v4h2v3h2l-1 3h-2l-2 2c-2.78-4.95-5.51-9.9-8-15-0.58-1.03-1.15-2.06-1.75-3.12-1.25-2.88-1.25-2.88-1.13-5.07 1.36-2.8 2.62-4.81 5.88-4.81z" fill="#021E36"/>
  <path transform="translate(667,132)" d="m0 0c1.06 1.81 1.06 1.81 2 4l-1 3 2 2c-0.29 1.68-0.63 3.34-1 5-0.07 2.44-0.09 4.88-0.06 7.31 0.01 1.26 0.02 2.51 0.02 3.8 0.02 0.96 0.03 1.91 0.04 2.89-0.99 0.33-1.98 0.66-3 1l-2-6h-2v-2l2-1-2-2c-0.12-2.62-0.12-2.62 0-5 0.99 0.33 1.98 0.66 3 1v-3c-0.99-0.33-1.98-0.66-3-1-0.37-1.32-0.71-2.66-1-4l-2-1v-2c4.62-2.12 4.62-2.12 8-1v-2z" fill="#052443"/>
  <path transform="translate(997,176)" d="m0 0 2 3 1-2c0.99 0.33 1.98 0.66 3 1l-1 1c2.48 0.5 2.48 0.5 5 1v1c-7.71 1.86-15.2 2.4-23.1 2.62-1.73 0.06-1.73 0.06-3.48 0.12-2.8 0.1-5.6 0.18-8.4 0.26l-1-4c3.67-2.45 5.67-2.24 10-2l2 1c0.68-0.14 1.36-0.29 2.06-0.44 3.99-0.76 7.89-0.64 11.9-0.56v-2z" fill="#051F37"/>
  <path transform="translate(300,87)" d="m0 0 4 1 1 6c-0.99 0.33-1.98 0.66-3 1-1.84 1.95-3.49 4.01-5.18 6.09-1.88 1.97-3.29 2.95-5.82 3.91h-3l-1-5 2-1v-2c0.58-0.24 1.17-0.49 1.77-0.74 2.59-1.46 4.07-3.11 5.98-5.38 0.61-0.73 1.23-1.45 1.86-2.2 0.69-0.83 0.69-0.83 1.39-1.68z" fill="#B70816"/>
  <path transform="translate(504,102)" d="m0 0c0.99 0.33 1.98 0.66 3 1l1 6 1-4h2l1-3h1c1.19 5.38 2.29 10.4 2 16-2.67 0.67-5.33 1.33-8 2-2-3-2-3-1.94-6.5 0.33-3.46 0.33-3.46-1.62-5.19-0.48-0.43-0.95-0.86-1.44-1.31 0.25-2.14 0.46-3.46 2-5z" fill="#052443"/>
  <path transform="translate(826,149)" d="m0 0c0.81 3.03 1.28 5.06 0.38 8.12-0.43 3.26 0.33 5.58 1.2 8.7 1.18 6.12-0.73 12.4-2.58 18.2-1.88 0.62-1.88 0.62-4 1l-2-2c0.38-2.62 0.38-2.62 1-5h2l-1-3c0.51-2.04 1.02-4.08 1.53-6.11 0.79-4.89 0.45-9.8 0.25-14.7 0.07-1.04 0.14-2.09 0.22-3.16l3-2z" fill="#0A223E"/>
  <path transform="translate(646,170)" d="m0 0 1 2c0.99 0.33 1.98 0.66 3 1v4l1 2h-2c1.25 3.65 1.67 4.78 5 7 0.31 3 0.31 3 0 6l-2 2 2 1v2l2 1c-4 0-4 0-5.62-1.5-0.46-0.5-0.91-0.99-1.38-1.5h-2v-6h-2v-5h2c-0.16-0.59-0.31-1.18-0.47-1.79-1.94-7.85-1.94-7.85-0.53-12.2z" fill="#06233E"/>
  <path transform="translate(508,89)" d="m0 0c1.71 1.28 3.37 2.62 5 4v2l2 1v16c-1.64-3.29-2.41-5.48-3-9-0.99 2.31-1.98 4.62-3 7l-2-1c-0.56-1.81-0.56-1.81-1-4-0.23-0.6-0.45-1.2-0.69-1.81-0.47-3.34 0.69-6.01 1.69-9.19 0.35-1.66 0.7-3.33 1-5z" fill="#06233E"/>
  <path transform="translate(958,88)" d="m0 0 1 2h5l2 4c0.87-0.34 0.87-0.34 1.75-0.69 2.25-0.31 2.25-0.31 4.5 1.13 0.58 0.51 1.15 1.03 1.75 1.56-7.75 0.12-7.75 0.12-10-1-1.81-0.1-3.62-0.13-5.44-0.12-0.97-0.01-1.93-0.01-2.93-0.01-2.74 0.02-2.74 0.02-5.63 1.13-1.56 0.07-3.13 0.09-4.69 0.06-1.21-0.01-1.21-0.01-2.45-0.02-0.92-0.02-0.92-0.02-1.86-0.04 0.99-0.33 1.98-0.66 3-1 0.19-0.8 0.37-1.61 0.56-2.44 1.44-2.56 1.44-2.56 3.72-3.33 3.24-0.65 6.41-1.23 9.72-1.23z" fill="#08203A"/>
  <path transform="translate(239,194)" d="m0 0 4 4c-0.82 3.08-1.63 5.51-3.56 8.06-3.56 1.37-5.9 0.29-9.38-1.02-2.48-1.25-3.78-2.57-5.06-5.04 0.62 0.16 1.24 0.33 1.88 0.5 2.08 0.58 2.08 0.58 4.12 0.5v-3c2.63-1.85 4.95-2.98 8-4z" fill="#B10214"/>
  <path transform="translate(944,90)" d="m0 0 2 2c-0.99 1.48-0.99 1.48-2 3h-3v2c-1.96 0.84-3.92 1.67-5.88 2.5-1.09 0.46-2.18 0.93-3.3 1.41-2.82 1.09-2.82 1.09-4.82 1.09v2h-3c-0.93-3.01-1.04-3.87 0-7 1.93-0.7 1.93-0.7 4.31-1.12 1.17-0.23 1.17-0.23 2.37-0.45 1.51-0.28 3.03-0.55 4.55-0.8 0.58-0.21 1.17-0.41 1.77-0.63l1-3c1.21 0.03 1.21 0.03 2.44 0.06 2.49 0.24 2.49 0.24 3.56-1.06z" fill="#09223E"/>
  <path transform="translate(9,211)" d="m0 0c0.31 0.64 0.62 1.28 0.94 1.94 0.89 2 0.89 2 2.06 3.06l1-5 3 2v2c0.99 0.33 1.98 0.66 3 1v3h-3l2 1v2l4 1c-3.47 5.83-3.47 5.83-6.14 6.69-0.61 0.1-1.23 0.21-1.86 0.31-0.84-2.23-1.67-4.45-2.5-6.69-0.36-0.94-0.36-0.94-0.72-1.89-1.32-3.6-2.07-6.59-1.78-10.4z" fill="#4E5D69"/>
  <path transform="translate(808,158)" d="m0 0 3 2c3.13 0.17 3.13 0.17 6 0-0.64 0.52-1.29 1.04-1.95 1.58-2.65 3.13-2.64 5.12-2.8 9.17-0.06 1.17-0.11 2.34-0.17 3.55-0.03 0.89-0.05 1.78-0.08 2.7h5l-1 8c-2.78-1.02-3.81-1.63-5.19-4.31-1.41-4.69-1.92-8.78-1.81-13.7h-2l-1-5h2l-1-3 1-1z" fill="#07223E"/>
  <path transform="translate(869,157)" d="m0 0 1 4c0.99-0.33 1.98-0.66 3-1 1 3 1 3 1 6h2l-1 4 2 1-3 2v-2l-5 2-1-3v7c-2-2-2-2-2.23-4.21 0.14-8.71 0.14-8.71 1.23-12.8h2v-3z" fill="#062341"/>
  <path transform="translate(1160,153)" d="m0 0v2c-1.66 1.01-3.33 2.01-5 3-1.37 1.3-2.72 2.62-4 4-0.95-0.33-1.9-0.66-2.88-1-2.89-1.1-2.89-1.1-5.12-1l-1-7c6.04-1.51 11.9-0.64 18 0z" fill="#08223E"/>
  <path transform="translate(1219,169)" d="m0 0 2-1v3c1.01-0.13 1.01-0.13 2.05-0.25 0.89-0.11 1.78-0.21 2.7-0.31 0.88-0.11 1.76-0.21 2.67-0.32 2.46-0.11 4.25 0.14 6.58 0.88l1-3 1 3c-5.95 3.11-10.8 3.37-17.4 3.19-0.92-0.02-1.84-0.03-2.79-0.04-2.26-0.04-4.51-0.09-6.77-0.15l-2-4c3.86-3.86 6.27-2.99 11-1z" fill="#08223E"/>
  <path transform="translate(1452,180)" d="m0 0h1c0.13 0.98 0.27 1.95 0.4 2.96 0.18 1.27 0.36 2.54 0.54 3.85 0.17 1.27 0.35 2.53 0.52 3.83 0.44 3.34 0.44 3.34 1.54 6.36 0.08 1.99 0.11 3.99 0.1 5.98-0.01 1.75-0.01 1.75-0.01 3.53-0.01 1.21-0.02 2.43-0.03 3.68 0 1.22-0.01 2.45-0.01 3.71-0.01 3.04-0.03 6.07-0.05 9.1-3-2-3-2-3.69-4.21-0.35-3.17-0.37-6.22-0.31-9.41 0.06-7.1-0.25-14.1-0.73-21.2-0.37-5.96-0.37-5.96 0.73-8.17z" fill="#062341"/>
  <path transform="translate(1294,166)" d="m0 0 2 2-1 2c3.63 0.15 3.63 0.15 7-1v6c-0.99 0.5-0.99 0.5-2 1 0.52 0.41 1.03 0.82 1.56 1.25 0.48 0.58 0.95 1.16 1.44 1.75-0.31 2.19-0.31 2.19-1 4-3.11 0-5.94-0.46-9-1v-2h3c-0.19-2.44-0.19-2.44-1-5-1.32-0.7-2.65-1.37-4-2-0.75-2.12-0.75-2.12-1-4h3l1-3z" fill="#052443"/>
  <path transform="translate(981,95)" d="m0 0c3.69 0.69 3.69 0.69 5 2h4v2c1.67-0.28 1.67-0.28 3.38-0.56 3.62-0.44 3.62-0.44 5.62 0.56v2l2 1h-2l-2 4c-2.67-0.67-5.33-1.33-8-2v-2h-3v-2c-0.72-0.14-1.44-0.29-2.19-0.44-2.6-0.52-5.21-1.04-7.81-1.56 0.64-0.31 1.28-0.62 1.94-0.94 2-0.89 2-0.89 3.06-2.06z" fill="#061E37"/>
  <path transform="translate(164,116)" d="m0 0 1 4h-3c1.31 3.12 1.31 3.12 4 5h-18v-7c3.9 0 6.38 0.68 10 2l1-3c3-1 3-1 5-1z" fill="#465562"/>
  <path transform="translate(186 92.2)" d="m0 0c0.9 1.3 1.77 2.61 2.62 3.94 2.07 2.38 3.56 2.54 6.63 2.87l-2 4h-2c-0.06 0.62-0.12 1.24-0.19 1.88-0.81 2.12-0.81 2.12-3.37 3.37-0.81 0.25-1.61 0.5-2.44 0.75l-2-3 1-3-1-2 2-2c-1.16-2.54-1.16-2.54-3-5-2.59-0.88-2.59-0.88-5-1v-1c6.49-1.34 6.49-1.34 8.75 0.19z" fill="#455462"/>
  <path transform="translate(659,164)" d="m0 0c1.1 3.29 1.1 5.74 1.06 9.19-0.01 1.08-0.02 2.17-0.02 3.29-0.02 0.83-0.03 1.66-0.04 2.52h-3c-3-4.22-3-4.22-3-7h-4l-2-5c1.11-0.31 2.23-0.62 3.38-0.94 7.03-2.06 7.03-2.06 7.62-2.06z" fill="#042443"/>
  <path transform="translate(316,180)" d="m0 0 2 1c-0.49 11.8-3.55 23.1-8 34l-2-1c0.75-6.51 0.75-6.51 1.98-8.93 1.15-2.33 1.57-4.39 2.02-6.95 0.72-3.85 1.76-7.4 3-11.1 0.38-2.33 0.72-4.66 1-7z" fill="#B90A16"/>
  <path transform="translate(1433,165)" d="m0 0c2 2 2 2 2 5 0.99 0.33 1.98 0.66 3 1l2 1v2c-0.99 0.33-1.98 0.66-3 1l-2-1c0.55 5.24 1.43 9.97 3 15l-4 1c-2.31-4.58-2.27-8.63-2.19-13.6v-2.32c0.03-3.26 0.15-5.94 1.19-9.06z" fill="#06233E"/>
  <path transform="translate(1e3 214)" d="m0 0c2.44 0.5 2.44 0.5 4.25 2.5 0.39 0.66 0.78 1.32 1.19 2-0.99 0.5-0.99 0.5-2 1-0.38 1.66-0.72 3.32-1 5l-1 2c-2-1-2-1-3-2l-2 4v-2h-2c0.87-4.75 0.87-4.75 2-7h-2l-1 2c0-3 0-3 1.68-5.19 2.32-1.81 2.32-1.81 4.88-2.31z" fill="#0A223E"/>
  <path transform="translate(99,126)" d="m0 0c2.88 1.29 5.01 2.53 7 5 0.37 1.32 0.7 2.66 1 4-1.44 0.08-2.87 0.14-4.31 0.19-1.2 0.05-1.2 0.05-2.43 0.1-2.74-0.35-3.55-1.18-5.26-3.29l-1 2c-3-3.75-3-3.75-3-6 3.29-0.8 4.71-1.1 8 0v-2z" fill="#465664"/>
  <path transform="translate(126,10)" d="m0 0 1 2 1-2h3v2c0.99-0.33 1.98-0.66 3-1v2h-2v2h-2v3c-0.64 0.27-1.28 0.54-1.94 0.81-2.39 1.08-2.39 1.08-3.06 4.19l-2-1v-4l-2-1-1-3c3.75-4 3.75-4 6-4z" fill="#465665"/>
  <path transform="translate(1571,146)" d="m0 0c0.12 0.64 0.25 1.28 0.38 1.94 0.3 1.02 0.3 1.02 0.62 2.06l2 1v10h-4l-1-1h-2l-1 3-2-1c0.38-2.44 0.38-2.44 1-5l2-1v-3c0.31-1.67 0.64-3.34 1-5h2l1-2z" fill="#052442"/>
  <path transform="translate(866,142)" d="m0 0h3c2.22 6.65 1.79 11.3 0 18h-2v5l-2-1 1-22z" fill="#052039"/>
  <path transform="translate(1386,243)" d="m0 0c2.31 0.33 4.62 0.66 7 1l-1 7-5-1v2h-3l-1-2c-2.53-0.66-2.53-0.66-5-1l1-4h7v-2z" fill="#0A213D"/>
  <path transform="translate(1493,227)" d="m0 0c0.49 0.99 0.49 0.99 1 2l-14 1c0.99 0.33 1.98 0.66 3 1l1 5c-4.56-0.44-7.58-0.85-11-4l1-3h-15v-1l34-1zm-9 6 2 1z" fill="#031223"/>
  <path transform="translate(965 179)" d="m0 0c1.62 1.62 1.62 1.62 2.62 3.62-13.9 2.38-13.9 2.38-19-1v-2c11.2-3.64 11.2-3.64 16.4-0.62z" fill="#05203B"/>
  <path transform="translate(138,89)" d="m0 0c0.99 0.33 1.98 0.66 3 1 0.72 1.65 1.38 3.31 2 5l2 2v3l2 2h-2v2h-3l-2-3c-2.06-0.72-2.06-0.72-4-1l2-4c-0.74-0.68-0.74-0.68-1.5-1.38-1.5-1.62-1.5-1.62-1.5-3.62h2l1-2z" fill="#455562"/>
  <path transform="translate(612,229)" d="m0 0v25c-3.4-4.53-3.32-5.69-3.12-11.1 0.35-4.61 0.35-4.61-0.88-8.88-0.66-0.14-1.32-0.29-2-0.44-0.66-0.18-1.32-0.37-2-0.56l-1-3c3.27-0.97 5.39-1 9-1z" fill="#05233F"/>
  <path transform="translate(797,188)" d="m0 0c0.1 0.62 0.21 1.24 0.31 1.88 0.57 2.49 0.57 2.49 3.69 4.12-0.99 0.33-1.98 0.66-3 1l-1 6h-2v3c-2 1.69-2 1.69-4 3l-1-3-2-2c1.27-2.04 2.61-4.04 4-6h2c0.12-0.58 0.25-1.16 0.38-1.75 0.63-2.27 1.51-4.18 2.62-6.25z" fill="#051C34"/>
  <path transform="translate(868,170)" d="m0 0 2 1-1 2 5-2c0.76 2.73 1.21 4.42 0.25 7.12-1.25 1.88-1.25 1.88-2.81 3.26-2.06 2.32-2.1 4.6-2.44 7.62h-1c-0.14-1.13-0.29-2.27-0.44-3.44-0.17-3.37-0.17-3.37-1.56-4.56-0.04-2-0.04-4 0-6h1l1-5z" fill="#06203A"/>
  <path transform="translate(242,22)" d="m0 0c6.27 1.96 11.5 6.32 16 11-2.65 1.01-3.74 1.1-6.44 0.07-1.27-0.68-1.27-0.68-2.56-1.38-0.85-0.45-1.69-0.9-2.56-1.37-0.81-0.43-1.61-0.87-2.44-1.32-1.33-0.67-2.66-1.34-4-2l2-1v-4z" fill="#485564"/>
  <path transform="translate(720,163)" d="m0 0h2l2 2 2 1v2h2v3c0.62 0.27 1.24 0.54 1.88 0.81 2.12 1.19 2.12 1.19 4.12 4.19v3l-5-1v-2h-2v-2h-2v-2h-2c-3-6.75-3-6.75-3-9z" fill="#07213B"/>
  <path transform="translate(1e3 92)" d="m0 0c-1.88 6.75-1.88 6.75-3 9l-4-1v-2c-2.31 0.33-4.62 0.66-7 1l1-3h2l1-3c6.16-2.28 6.16-2.28 10-1z" fill="#09213C"/>
  <path transform="translate(815 141)" d="m0 0c1.21 0.03 1.21 0.03 2.44 0.06v2l2 2c0.27 2.69 0.08 5.29 0 8l-5 1v-5h-2c-0.38-2.32-0.72-4.66-1-7 1-1 1-1 3.56-1.06z" fill="#0A223E"/>
  <path transform="translate(1229,229)" d="m0 0h9v25h-1c-1.45-4.54-2.24-8.18-2-13h2l-2-8c-2.31-0.33-4.62-0.66-7-1l1-3z" fill="#052441"/>
  <path transform="translate(731,172)" d="m0 0c6.62-0.12 6.62-0.12 10 1v2c0.99 0.33 1.98 0.66 3 1-2.09 2.4-3.52 3.84-6.56 4.88-2.44 0.12-2.44 0.12-5.44-1.88 0.21-0.6 0.41-1.2 0.62-1.81 0.69-2.47 0.69-2.47-1.62-5.19z" fill="#041E37"/>
  <path transform="translate(765,229)" d="m0 0c0.99 0.33 1.98 0.66 3 1l-2 5-4-1-1 2c-2.56 0.62-2.56 0.62-5 1v2h-5l1-6c6.57-1.9 6.57-1.9 9.31-2.56 1.79-0.4 1.79-0.4 3.69-1.44z" fill="#0A223E"/>
  <path transform="translate(1497,86)" d="m0 0c0.76 0.31 1.53 0.62 2.31 0.94 1.88 0.74 3.78 1.42 5.69 2.06l-3 2 2 5c-9.17-1.17-9.17-1.17-12.6-4.62-0.69-1.18-0.69-1.18-1.38-2.38 0.78-0.12 1.57-0.25 2.38-0.38 2.76-0.41 2.76-0.41 4.62-2.62z" fill="#091F3A"/>
  <path transform="translate(1233,246)" d="m0 0 1 2c0.99 0.33 1.98 0.66 3 1v5h-22v-1c5.44-0.5 5.44-0.5 11-1v-3h6l1-3z" fill="#041F39"/>
  <path transform="translate(1011,157)" d="m0 0h10v15l-2-1c-0.39-2.32-0.72-4.66-1-7l-1-3-4 1-2-5z" fill="#07213F"/>
  <path transform="translate(1188,87)" d="m0 0h2v2c9.98 1.05 20 1.51 30 2v1h-44v-1c1.05-0.06 1.05-0.06 2.12-0.11 0.91-0.07 1.82-0.13 2.76-0.2 0.9-0.06 1.8-0.12 2.74-0.18 2.74-0.3 2.74-0.3 4.38-3.51z" fill="#07223F"/>
  <path transform="translate(934,242)" d="m0 0c2.22 0.38 3.91 0.95 5.88 2.06 2.78 1.23 5.11 1.08 8.12 0.94v3c-3.45 2.3-4.23 2.14-8.19 1.62-0.9-0.11-1.8-0.22-2.73-0.33-1.03-0.14-1.03-0.14-2.08-0.29l-2-6 1-1z" fill="#032542"/>
  <path transform="translate(894,185)" d="m0 0 4 1c0.29 1.09 0.58 2.19 0.88 3.31 0.94 3.73 0.94 3.73 3.12 6.69-0.38 2.19-0.38 2.19-1 4-1.54-1.54-3.06-3.06-4.5-4.69-1.54-1.64-1.54-1.64-4.5-1.31-0.2-3.63 0.14-5.87 2-9z" fill="#07223F"/>
  <path transform="translate(1569,133)" d="m0 0c3 2 3 2 3.48 4.17 0.05 0.85 0.09 1.7 0.14 2.58 0.28 3.81 0.69 7.49 1.38 11.2-3.48-1.16-3.48-1.16-5.05-3.71-1.16-2.8-1.18-4.96-1.14-7.98 0.01-0.97 0.02-1.94 0.02-2.95 0.17-2.36 0.17-2.36 1.17-3.36z" fill="#042542"/>
  <path transform="translate(667,132)" d="m0 0c1.12 1.56 1.12 1.56 2 4-1.3 6.3-1.3 6.3-4 9v-2c-0.99-0.33-1.98-0.66-3-1-0.37-1.32-0.71-2.66-1-4l-2-1v-2c4.62-2.12 4.62-2.12 8-1v-2z" fill="#032543"/>
  <path transform="translate(929 241)" d="m0 0c3.2 1.45 3.83 3.77 5.06 6.94l-1 2c0.99 0.33 1.98 0.66 3 1-1.44-0.12-2.87-0.24-4.31-0.38-1.2-0.1-1.2-0.1-2.43-0.21-2.26-0.41-2.26-0.41-5.26-2.41h2l-1-6c2-1 2-1 3.94-0.94z" fill="#032542"/>
  <path transform="translate(1283,229)" d="m0 0c19-0.18 19-0.18 27 1v1c-3.91 0.39-7.83 0.76-11.8 1.12-1.11 0.12-2.22 0.23-3.37 0.34-1.6 0.15-1.6 0.15-3.24 0.3-0.98 0.09-1.97 0.19-2.98 0.28-2.82-0.04-4.29-0.58-6.66-2.04l1-2z" fill="#041F3B"/>
  <path transform="translate(795,231)" d="m0 0c0.5 2.69 0.5 2.69 0 6-2.8 2.48-6.17 5-10 5l-1-4h2c0.21-0.6 0.41-1.2 0.62-1.81 1.73-2.75 4.94-5.19 8.38-5.19z" fill="#09203C"/>
  <path transform="translate(208,197)" d="m0 0h15l2 5c-3.78 1.26-6.12 0.82-10 0-2.25-1.44-2.25-1.44-4-3l-3-2z" fill="#B10214"/>
  <path transform="translate(1e3 77)" d="m0 0c5.75 2.75 5.75 2.75 8 5-0.25 3.06-0.25 3.06-1 6-0.99 0.5-0.99 0.5-2 1l-1-3c-1.96-1.4-3.95-2.74-6-4l2-5z" fill="#051F39"/>
  <path transform="translate(1229,149)" d="m0 0h9v18h-1v-13c-1.11-0.12-2.23-0.25-3.38-0.38-3.62-0.62-3.62-0.62-5.62-2.62l1-2z" fill="#042442"/>
  <path transform="translate(933,95)" d="m0 0 1 4c-2.62 1.75-4.04 2.39-7 3v2h-3c-0.93-3.01-1.04-3.87 0-7 2.07-0.73 2.07-0.73 4.56-1.19 0.83-0.16 1.66-0.31 2.51-0.48 0.63-0.11 1.27-0.22 1.93-0.33z" fill="#09203A"/>
  <path transform="translate(954,90)" d="m0 0-1 5c-2.88 0.96-4.7 1.11-7.69 1.06-1.21-0.01-1.21-0.01-2.45-0.02-0.92-0.02-0.92-0.02-1.86-0.04 0.99-0.33 1.98-0.66 3-1 0.33-0.83 0.66-1.65 1-2.5 0.33-0.83 0.66-1.65 1-2.5 3.29-1.1 4.71-0.8 8 0z" fill="#041F3B"/>
  <path transform="translate(1009,207)" d="m0 0c1.79-0.08 3.58-0.14 5.38-0.19 1.49-0.05 1.49-0.05 3.02-0.1 0.86 0.09 1.72 0.19 2.6 0.29 2.28 3.42 2.22 4.68 2.12 8.69-0.01 0.99-0.03 1.99-0.05 3.01-0.03 1.14-0.03 1.14-0.07 2.3l-1-3c-0.99-0.33-1.98-0.66-3-1l-1-8-8-1v-1z" fill="#05203A"/>
  <path transform="translate(761,93)" d="m0 0h5l1 3 3 2 1 2c-3.05 0.98-4.95 0.98-8 0v-2h-7c0.64-0.45 1.28-0.91 1.94-1.38 2.16-1.46 2.16-1.46 3.06-3.62z" fill="#081D36"/>
  <path transform="translate(897,87)" d="m0 0c0.7 1.74 0.7 1.74 1 4-2.47 4.07-5.71 7.34-9.94 9.5-0.68 0.16-1.36 0.33-2.06 0.5 1.39-4.3 3.38-6.71 6.62-9.81 0.82-0.79 1.64-1.58 2.48-2.4 0.94-0.88 0.94-0.88 1.9-1.79z" fill="#051A32"/>
  <path transform="translate(497,186)" d="m0 0c2.02 1.93 3.42 3.63 5 6 2.22 0.51 2.22 0.51 4.79 0.51 0.94 0.04 1.88 0.07 2.85 0.11 0.99 0.02 1.97 0.04 2.98 0.07 1.49 0.05 1.49 0.05 3.01 0.1 2.46 0.08 4.91 0.15 7.37 0.21v1h-27c0-7 0-7 1-8z" fill="#05213D"/>
  <path transform="translate(498,183)" d="m0 0h1v5c0.61-0.06 1.23-0.12 1.86-0.18 2.47-0.13 4.7-0.19 7.14 0.18 2.06 2.5 2.06 2.5 3 5h-11v-3l-3-2 1-5z" fill="#032543"/>
  <path transform="translate(257,109)" d="m0 0 1 3c-0.78 0.76-1.57 1.53-2.38 2.31-2.69 2.6-2.69 2.6-4.62 5.69h-3c0.63-2.93 1.59-5.36 3-8l-4-1c0.96-0.09 0.96-0.09 1.93-0.18 1.24-0.13 1.24-0.13 2.51-0.26 0.82-0.08 1.64-0.16 2.49-0.24 2.06-0.11 2.06-0.11 3.07-1.32z" fill="#465663"/>
  <path transform="translate(783,243)" d="m0 0c-3.44 3.03-6.86 4.01-11.2 5.19-1.89 0.51-1.89 0.51-3.83 1.04-1.44 0.38-1.44 0.38-2.92 0.77l-1-4c3.88-1.19 6.92-2 11-2 2.93-0.98 4.96-1.08 8-1z" fill="#06223E"/>
  <path transform="translate(1452,202)" d="m0 0h2c1.86 4.7 2.25 8.88 2.12 13.9 0 0.68-0.01 1.37-0.02 2.08-0.03 1.68-0.06 3.36-0.1 5.04-3-2-3-2-3.68-4.17-0.38-3.4-0.41-6.72-0.38-10.1 0.01-1.26 0.02-2.51 0.02-3.8 0.02-1.43 0.02-1.43 0.04-2.89z" fill="#052443"/>
  <path transform="translate(216,131)" d="m0 0c3.05 1.53 3.66 3.95 5 7v3h-10c0.64-0.91 1.28-1.81 1.94-2.75 1.67-2.64 2.6-4.24 3.06-7.25z" fill="#475765"/>
  <path transform="translate(899,182)" d="m0 0 2 1v5h2v4h2v3c-5.88-1.88-5.88-1.88-7-3-0.24-7.52-0.24-7.52 1-10z" fill="#041C33"/>
  <path transform="translate(1569,175)" d="m0 0h1c-0.02 0.8-0.04 1.61-0.06 2.44-0.24 2.49-0.24 2.49 1.06 3.56-0.09 1.86-0.25 3.71-0.44 5.56-0.1 1.01-0.2 2.03-0.31 3.07-0.08 0.78-0.16 1.56-0.25 2.37-3 0-3 0-5-1 0.43-1.45 0.43-1.45 0.88-2.94 1.23-4.31 2.19-8.67 3.12-13.1z" fill="#032541"/>
  <path transform="translate(1169 251)" d="m0 0c5.17 0.65 10.4 0.95 15.6 1.32v1c-7.65 1.25-15.3 1.09-23 1v-3c2.65-1.32 4.58-0.73 7.43-0.32z" fill="#07233E"/>
  <path transform="translate(510 174)" d="m0 0c0.6 0.35 1.2 0.7 1.81 1.06l-1 2c0.4 2.1 0.4 2.1 1 4-3.23 2.15-4.28 2.2-8 2v-3h2l-1-6c3-1 3-1 5.19-0.06z" fill="#07223F"/>
  <path transform="translate(286,100)" d="m0 0c-2.46 1.64-4.09 2.46-6.81 3.38-3.81 1.37-6.89 3.26-10.2 5.62-0.99 0.5-0.99 0.5-2 1 2.13-4.97 4.97-7.75 9.94-9.81 3.35-1.17 5.62-1.37 9.06-0.19z" fill="#B7111B"/>
  <path transform="translate(746,150)" d="m0 0 1 2h4v2h-2c0.21 0.58 0.41 1.16 0.62 1.75 0.47 2.8-0.18 3.86-1.62 6.25l-1 2h-2c0.19-1.09 0.37-2.19 0.56-3.31 0.7-3.63 0.7-3.63-0.56-6.69l-2-1 3-3z" fill="#08223E"/>
  <path transform="translate(111,100)" d="m0 0v2c0.99-0.33 1.98-0.66 3-1l1 4c-6.75 3-6.75 3-9 3l-1-5c3.75-3 3.75-3 6-3z" fill="#475564"/>
  <path transform="translate(184,160)" d="m0 0c10.5 4.02 10.5 4.02 12 7-3.89 1.02-5.61 1.17-9.38-0.44-0.86-0.51-1.73-1.03-2.62-1.56l2-2-3-2 1-1z" fill="#BF1118"/>
  <path transform="translate(1452,231)" d="m0 0 1 3h2l1-2c0.99 0.33 1.98 0.66 3 1v2l-5 2 1 2-8 1 1-3c0.99-0.33 1.98-0.66 3-1v-3l1-2z" fill="#0B223E"/>
  <path transform="translate(1307,190)" d="m0 0-1 4h-27v-1c0.57-0.02 1.15-0.04 1.74-0.06 2.63-0.1 5.26-0.21 7.88-0.32 0.91-0.03 1.81-0.06 2.74-0.09 5.35-0.23 10.6-2.53 15.6-2.53z" fill="#051E38"/>
  <path transform="translate(1502,90)" d="m0 0c2.31 0.33 4.62 0.66 7 1l1 5c-1.69 0.75-1.69 0.75-4 1-2.75-1.94-2.75-1.94-5-4l1-3z" fill="#09223E"/>
  <path transform="translate(1540,195)" d="m0 0 2 2c-0.17 2.06-0.17 2.06-0.75 4.44-0.27 1.17-0.27 1.17-0.55 2.37-0.7 2.19-0.7 2.19-2.7 5.19-0.99-0.33-1.98-0.66-3-1-0.81-1.94-0.81-1.94-1-4 2-2 2-2 5-4 0.73-2.56 0.73-2.56 1-5z" fill="#07223F"/>
  <path transform="translate(801,227)" d="m0 0 2 2-7 7-2-4-4 1v-3c3.01-0.93 3.87-1.04 7 0 2.19-1.37 2.19-1.37 4-3z" fill="#07233F"/>
  <path transform="translate(688,204)" d="m0 0v2h2v2h2v3c-4.53 0.37-4.53 0.37-6.69-1.31-1.17-1.51-2.25-3.1-3.31-4.69 3-1 3-1 6-1z" fill="#021B30"/>
  <path transform="translate(1387,229)" d="m0 0h8v15h-1v-10c-1.45-0.4-1.45-0.4-2.94-0.81-1.01-0.39-2.02-0.79-3.06-1.19l-1-3z" fill="#042443"/>
  <path transform="translate(1011,178)" d="m0 0 1 2h8v1c-4.66 0.92-9.15 1.12-13.9 1.06-1.03 0-1.03 0-2.08-0.01-1.68-0.01-3.36-0.03-5.04-0.05 4.03-3.39 6.86-3.57 12-4z" fill="#04203C"/>
  <path transform="translate(754,156)" d="m0 0h2c0.05 1.44 0.09 2.87 0.12 4.31 0.03 0.8 0.05 1.6 0.08 2.43-0.2 2.26-0.2 2.26-2.2 5.26h-2l-1 2-1-3h3c-0.31-1.33-0.31-1.33-0.62-2.69-0.41-3.54 0.05-5.18 1.62-8.31z" fill="#051B31"/>
  <path transform="translate(1,130)" d="m0 0h2c0.2 1.73 0.38 3.46 0.56 5.19 0.11 0.96 0.21 1.92 0.32 2.92 0.12 2.83-0.2 5.14-0.88 7.89l-2-1c-0.45-2.62-0.45-2.62-0.69-5.88-0.08-1.06-0.17-2.13-0.26-3.24-0.05-2.88-0.05-2.88 0.95-5.88z" fill="#465662"/>
  <path transform="translate(647,125)" d="m0 0c0.99 0.33 1.98 0.66 3 1 1.19 3.56 1.19 3.56 2 7-2.33 1.21-4.5 2.17-7 3v-5h2v-6z" fill="#051D37"/>
  <path transform="translate(150,110)" d="m0 0c1.88 0.25 1.88 0.25 4 1 1.13 2.05 1.13 2.05 2 4-8.04 1.61-8.04 1.61-12.1-0.94-0.64-0.68-1.28-1.36-1.94-2.06h8v-2z" fill="#475565"/>
  <path transform="translate(1123,229)" d="m0 0h17v1h-5v2c-1.62 0.08-3.25 0.14-4.88 0.19-1.35 0.05-1.35 0.05-2.74 0.1-1.18-0.14-1.18-0.14-2.38-0.29l-2-3z" fill="#052443"/>
  <path transform="translate(870,162)" d="m0 0h1v7c-0.99 0.33-1.98 0.66-3 1v7c-2-2-2-2-2.2-4.38 0.03-0.91 0.05-1.81 0.08-2.74 0.01-0.92 0.03-1.83 0.05-2.76 0.02-0.7 0.05-1.4 0.07-2.12h3l1-3z" fill="#032542"/>
  <path transform="translate(1124,86)" d="m0 0c1.48 0.99 1.48 0.99 3 2 1.99 0.17 1.99 0.17 4.06 0h3.94c2 2 2 2 2 4h-12l-1-6z" fill="#032543"/>
  <path transform="translate(963,85)" d="m0 0 5 5c-3.7 0.95-6.3 0.95-10 0l-1-3h3l3-2z" fill="#06213F"/>
  <path transform="translate(496,229)" d="m0 0h13l-3 2-1 2h-8l-1-4z" fill="#03203D"/>
  <path transform="translate(950,164)" d="m0 0h2c1.26 4.29 0.73 6.9-1 11l-2 2c-0.03-1.98-0.05-3.96-0.06-5.94-0.01-1.1-0.03-2.2-0.04-3.34 0.1-2.72 0.1-2.72 1.1-3.72z" fill="#08223E"/>
  <path transform="translate(174,158)" d="m0 0c0.99 2.31 1.98 4.62 3 7h-5l-1-3-2-1v-2c2-1 2-1 5-1zm1 0c0.99 0.33 1.98 0.66 3 1v2c-0.99-0.33-1.98-0.66-3-1v-2z" fill="#BD0F18"/>
  <path transform="translate(751,152)" d="m0 0 3 2-1 7h-5l-1-2 2-1-1-2 1-2h2v-2z" fill="#051F3A"/>
  <path transform="translate(887,151)" d="m0 0 3 2c0.29 2.16 0.29 2.16 0.19 4.62-0.03 0.82-0.06 1.64-0.08 2.48-0.04 0.63-0.07 1.25-0.11 1.9h-3l-2-3h2v-3l-2-1 2-4z" fill="#032543"/>
  <path transform="translate(317,135)" d="m0 0h1c1.51 7.03 0.64 13.9 0 21-2.37-3.56-2.24-5.16-2.19-9.38 0.01-1.12 0.02-2.24 0.02-3.39 0.15-2.86 0.52-5.45 1.17-8.23z" fill="#B60715"/>
  <path transform="translate(902,120)" d="m0 0 2 1c-1.33 2.67-2.67 5.33-4 8h-2v3h-2l1-7c0.99-0.33 1.98-0.66 3-1 1.21-2 1.21-2 2-4z" fill="#0B223E"/>
  <path transform="translate(656,108)" d="m0 0c0.1 0.64 0.21 1.28 0.31 1.94 0.23 0.68 0.46 1.36 0.69 2.06 0.99 0.33 1.98 0.66 3 1v4c-2.97-0.5-2.97-0.5-6-1 0-3.77 0.24-4.91 2-8z" fill="#061F3B"/>
  <path transform="translate(999,99)" d="m0 0v2l2 1h-2l-2 4h-3c0.02-0.78 0.04-1.57 0.06-2.38 0.13-2.6 0.13-2.6-1.06-4.62 2.49-1.25 3.41-0.78 6 0z" fill="#031D37"/>
  <path transform="translate(99,68)" d="m0 0v3h-4v2c-0.99 0.33-1.98 0.66-3 1l-2-2c0.38-2.12 0.38-2.12 1-4 3.29-0.8 4.71-1.1 8 0z" fill="#455462"/>
  <path transform="translate(761,246)" d="m0 0v2c0.99 0.33 1.98 0.66 3 1-6.62 3-6.62 3-10 3v-4c2.65-1.46 3.89-2 7-2z" fill="#07223E"/>
  <path transform="translate(1490,88)" d="m0 0c1.44 2.06 1.44 2.06 2 4h-7l-1-3c-2.02-0.73-2.02-0.73-4-1 3.78-1.26 6.14-0.91 10 0z" fill="#08223F"/>
  <path transform="translate(226,13)" d="m0 0c5.75 1.75 5.75 1.75 8 4-3.47 1.48-3.47 1.48-7 3-0.99-1.32-1.98-2.64-3-4l2-3z" fill="#475664"/>
  <path transform="translate(1212,245)" d="m0 0h7v5c-2.31 0.69-2.31 0.69-5 1-1.81-1.44-1.81-1.44-3-3l1-3z" fill="#03203D"/>
  <path transform="translate(1300,185)" d="m0 0c1.71 1.28 3.37 2.62 5 4v2h-11l1-3h5v-3z" fill="#052443"/>
  <path transform="translate(58,135)" d="m0 0c2.15 2.62 3.4 4.64 4 8h-3l-1 3-3-2 1-5h2v-4z" fill="#455462"/>
  <path transform="translate(1563,113)" d="m0 0c2.64 3.13 3.84 6.09 5 10h-3l-1 2c-2.09-3.4-2.26-6.04-2-10l1-2z" fill="#031D34"/>
  <path transform="translate(611,229)" d="m0 0-1 7c-2.49-1.2-4.68-2.45-7-4v-2c2.89-0.83 4.89-1 8-1z" fill="#09223E"/>
  <path transform="translate(93,173)" d="m0 0 2 1-2 5c-2.31 0.33-4.62 0.66-7 1l-1-3c1.98-0.73 3.98-1.39 6-2l2 1v-3z" fill="#465764"/>
  <path transform="translate(1571,170)" d="m0 0c2.03 3.31 2.13 5.43 1.62 9.25-0.11 0.89-0.22 1.78-0.33 2.7-0.1 0.68-0.19 1.35-0.29 2.05l-1-3-2-1c0.02-0.74 0.04-1.49 0.06-2.25-0.05-2.45-0.37-4.41-1.06-6.75 0.99-0.33 1.98-0.66 3-1z" fill="#062039"/>
  <path transform="translate(1547,159)" d="m0 0h2v2c0.99 0.33 1.98 0.66 3 1l-3 2 1 6-5 2c0-3.27 0.26-5.63 1-8.75 0.19-0.8 0.37-1.6 0.56-2.42 0.15-0.61 0.29-1.21 0.44-1.83z" fill="#042543"/>
  <path transform="translate(1572,151)" d="m0 0h2v10h-4c0.14-1.48 0.29-2.96 0.44-4.44 0.08-0.82 0.16-1.64 0.24-2.49 0.32-2.07 0.32-2.07 1.32-3.07z" fill="#032542"/>
  <path transform="translate(1121,149)" d="m0 0h17v1l-8 1v1c-2.97-0.33-5.94-0.66-9-1v-2z" fill="#052342"/>
  <path transform="translate(753,74)" d="m0 0c5.54 0.62 5.54 0.62 7.88 2.56 0.55 0.71 0.55 0.71 1.12 1.44l-3 3c-0.78-0.47-1.57-0.95-2.38-1.44-1.51-0.9-3.04-1.77-4.62-2.56l1-3z" fill="#03203D"/>
  <path transform="translate(927,244)" d="m0 0-1 4-8-1 1-3c3.29-1.1 4.71-0.8 8 0z" fill="#06213C"/>
  <path transform="translate(1566,196)" d="m0 0 2 1-4 10h-2l-1 3v-6l2-1v-3l1-3 2-1z" fill="#032039"/>
  <path transform="translate(1219,169)" d="m0 0 1 2c-5.94 0.5-5.94 0.5-12 1 2-4 2-4 3.81-4.88 2.87-0.16 4.66 0.58 7.19 1.88z" fill="#0B223E"/>
  <path transform="translate(950,157)" d="m0 0c1.96-0.05 3.92-0.09 5.88-0.12 1.63-0.04 1.63-0.04 3.3-0.08 2.82 0.2 2.82 0.2 4.82 2.2-1.62 0.19-3.25 0.38-4.88 0.56-0.9 0.11-1.8 0.21-2.74 0.32-2.38 0.12-2.38 0.12-4.38-0.88l-1 3-1-5z" fill="#06213F"/>
  <path transform="translate(1571,135)" d="m0 0h1c0.06 0.65 0.12 1.3 0.18 1.98 0.46 4.71 0.96 9.36 1.82 14-0.99-0.33-1.98-0.66-3-1l1-4h-2l-1-7h2v-4z" fill="#041D34"/>
  <path transform="translate(82,19)" d="m0 0 4 3c-1.75 1.56-1.75 1.56-4 3-2.25-0.31-2.25-0.31-4-1v-3l4-2zm-5 5 1 3-2-1 1-2z" fill="#465665"/>
  <path transform="translate(275,55)" d="m0 0c0.6 0.47 1.2 0.95 1.81 1.44 2.19 1.72 2.19 1.72 5.19 2.56v2c-1.98 0.66-3.96 1.32-6 2-0.73-1.98-1.39-3.98-2-6l1-2z" fill="#465662"/>
  <path transform="translate(1355,229)" d="m0 0c1.62-0.05 3.25-0.09 4.88-0.12 0.9-0.03 1.8-0.05 2.74-0.08 2.38 0.2 2.38 0.2 4.38 2.2-3.54 1.18-6.28 1.27-10 1l-2-3z" fill="#07213F"/>
  <path transform="translate(993,211)" d="m0 0h2c1.12 6.75 1.12 6.75 0 9-3-1-3-1-5-4l1-2h2v-3z" fill="#0A223E"/>
  <path transform="translate(1201,172)" d="m0 0-1 2h-14l-1-2c5.69-0.91 10.3-0.91 16 0z" fill="#07233E"/>
  <path transform="translate(112,110)" d="m0 0h4l2 2c-0.38 2.12-0.38 2.12-1 4-2.84 0-5.24-0.4-8-1v-2h4l-1-3z" fill="#465664"/>
  <path transform="translate(198,73)" d="m0 0 2 1c-0.19 1.88-0.19 1.88-1 4-2.56 1.25-2.56 1.25-5 2l-3-3c2.65-1.46 3.89-2 7-2v-2z" fill="#475564"/>
  <path transform="translate(1462,249)" d="m0 0c2.97 0.5 2.97 0.5 6 1v-1h7v3h-12l-1-3z" fill="#051F39"/>
  <path transform="translate(819,172)" d="m0 0h3c0.35 4.88-0.58 7.77-3 12h-2l2-12z" fill="#07223E"/>
  <path transform="translate(35,130)" d="m0 0c0.29 0.6 0.58 1.2 0.88 1.81 1.17 2.38 1.17 2.38 3.12 5.19-1.18 0.46-1.18 0.46-2.38 0.94-2.54 0.99-2.54 0.99-4.62 2.06-0.37-5.42-0.37-5.42 1.5-8.38 0.49-0.53 0.99-1.07 1.5-1.62z" fill="#465563"/>
  <path transform="translate(30,64)" d="m0 0c2.44 0.81 2.44 0.81 5 2l1 3c-2.48 1.48-2.48 1.48-5 3-1.43-2.35-2.09-3.48-1.62-6.25 0.2-0.58 0.41-1.16 0.62-1.75z" fill="#455462"/>
  <path transform="translate(1437,65)" d="m0 0h3v2h5l1 2c-1.66 0.38-3.32 0.71-5 1l-1-1c-2.67-0.14-5.32-0.04-8 0v-1l5-1v-2z" fill="#062443"/>
  <path transform="translate(698,244)" d="m0 0h2l1 1 2-1c2.62 0.94 2.62 0.94 5 2l-2 2c-2.16-0.02-2.16-0.02-4.62-0.38-0.82-0.11-1.64-0.22-2.48-0.33-0.63-0.1-1.25-0.19-1.9-0.29l1-3z" fill="#06223E"/>
  <path transform="translate(907,238)" d="m0 0c6.75 1.75 6.75 1.75 9 4v3c-2.96-0.61-4.38-1.25-7-3-1.19-2.12-1.19-2.12-2-4z" fill="#06213C"/>
  <path transform="translate(1561,178)" d="m0 0c2.47 0.99 2.47 0.99 5 2v3h-2l-1 2-4-3 2-4z" fill="#032643"/>
  <path transform="translate(23,125)" d="m0 0c2.06 0.44 2.06 0.44 4 1l-2 4h-2l-1 4-2-2c1.88-5.88 1.88-5.88 3-7z" fill="#455462"/>
  <path transform="translate(809,100)" d="m0 0c3.83 3.42 5.72 6.01 7 11-0.99 0.5-0.99 0.5-2 1-0.43-0.74-0.87-1.48-1.31-2.25-1.59-2.73-1.59-2.73-3.44-4.87-0.62-0.93-0.62-0.93-1.25-1.88l1-3z" fill="#052442"/>
  <path transform="translate(18,84)" d="m0 0h2l-1 3 3 3-4 2c-2-3-2-3-1.69-5.12 0.69-1.88 0.69-1.88 1.69-2.88z" fill="#475764"/>
  <path transform="translate(1487,248)" d="m0 0c2.94 0.81 2.94 0.81 6 2l1 3-8 1 1-6z" fill="#07223E"/>
  <path transform="translate(108,225)" d="m0 0v3c-3.31 0.69-3.31 0.69-7 1-1.94-1.44-1.94-1.44-3-3 6.62-1 6.62-1 10-1z" fill="#C01219"/>
  <path transform="translate(4,197)" d="M0 0 C3 1 3 1 4.25 3.31 C5.03 6.1 4.99 7.33 4 10 C1.2 7.93 0.97 6.86 0.31 3.31 C0.21 2.22 0.11 1.13 0 0 Z " fill="#475764"/>
  <path transform="translate(26,155)" d="m0 0h5l1 7h-6l1-3h2v-2c-0.99 0.33-1.98 0.66-3 1v-3z" fill="#455462"/>
  <path transform="translate(4,136)" d="m0 0 3 3c-0.42 1.32-0.86 2.63-1.31 3.94-0.25 0.73-0.49 1.46-0.74 2.21-0.95 1.85-0.95 1.85-3.95 2.85l1-3c0.37-1.56 0.72-3.12 1.06-4.69 0.18-0.81 0.36-1.61 0.54-2.45 0.13-0.61 0.26-1.23 0.4-1.86zm3 0 2 2h-2v-2z" fill="#485565"/>
  <path transform="translate(228,112)" d="m0 0c2 0.31 2 0.31 4 1l1 2-1 2c0.99 0.33 1.98 0.66 3 1l-1 3c-2.65-2.58-4.94-4.92-7-8l1-1z" fill="#485865"/>
  <path transform="translate(1235,84)" d="m0 0 1 2h2v6h-5l2-3-2-1c1-3 1-3 2-4z" fill="#031F3C"/>
  </svg>
  
                  </td>
                </tr>
              </table>
            </td>
          </tr>
            <tr>
              <td valign="middle" class="hero bg_white" style="padding: 1em 0 0 0; background-color: #f1f1f1;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: white;border-radius: 12px; border-top: 4px solid #2B5F8C; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                      <tr>
                          <td style="padding: 0 2.5em;">
                              <h3 style="margin-top: 40px;text-align: center; font-family: Helvetica, Arial, sans-serif; font-size: 20px; font-weight:700; line-height: 20px; color: rgb(23, 43, 77);"> Email Address Confirmation</h3>
                              <h3 style="margin-top: 40px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight:700; line-height: 20px; color: rgb(23, 43, 77);">Dear Ronald Tuff,</h3>
                              <div class="text">
                                  <h4 style="margin-top: 25px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight:400; line-height: 20px; color: rgb(23, 43, 77);">To complete your sign Up and account activation please click on the below link</h4>
                              </div>
                          </td>
                      </tr>
                      <tr>
                          <td style="text-align: center;">
                              <div class="text-author">
                                  <p><a href="http://${serviceBaseUrl}/reset-password?token=${userVerificaionToken}" class="btn btn-primary" style="background-color: #2B5F8C; color: #fff;">VERIFY EMAIL</a></p>
                              </div>
                          </td>
                      </tr>
                      <tr>
                          <td style="padding: 0 2.5em; padding-bottom: 3em;">
                             
                              <h3 style="margin-top: 10px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight:700; line-height: 20px; color: rgb(23, 43, 77);">Thanks,</h3>
                              <h3 style="margin-top: 10px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight:700; line-height: 20px; color: rgb(23, 43, 77);">LogELD Team</h3>
                             
                          </td>
                      </tr>
                  </table>
              </td>
              
          </tr>  
        </table>
      
  
      </div>
    </center>
  </body>
  </html>`,
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
