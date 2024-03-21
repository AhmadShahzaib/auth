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
import { firstValueFrom } from 'rxjs';
import { ResetPasswordRequest } from 'models/resetPasswordRequest.model';
import { emailCheck } from './shared/emailCheck';
import { RefreshTokenDocument } from '@shafiqrathore/logeld-tenantbackend-common-future';

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
      err.message = "unable to connect to the User service through mesaage pattern"
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
      err.message = "unable to connect to the User service through mesaage pattern"
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
        console.log("Device id is : " +deviceId)
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
        if(!loginData.isVerified){
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
        console.log("Device id is : " +deviceId)
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
}
