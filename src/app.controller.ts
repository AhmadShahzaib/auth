import { ResetPasswordRequest } from './models/resetPasswordRequest.model';
import { ForgotPasswordRequest } from './models/forgotPasswordRequest.model';
import jwt_decode, { JwtPayload } from 'jwt-decode';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Query,
  Res,
  Req,
  Logger,
  Headers,
  UnauthorizedException,UseInterceptors,
  NotFoundException,
  Param,
  Inject,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ExtractJwt } from 'passport-jwt';
import {
  User,
  GetOperationId,MessagePatternResponseInterceptor,
  ErrorType,
} from '@shafiqrathore/logeld-tenantbackend-common-future';
import jwtDecode from 'jwt-decode';
// import { GetOperationId } from '../shared/utils/get-operation-id';
import { AuthService } from './app.service';
import { GrantType, LoginResponse, LoginRequest } from './models';
import { RealIP } from 'nestjs-real-ip';
import { Request, Response } from 'express';
import AccessTokenDecorators from './decorators/getAccessToken';
import LogoutDecorators from './decorators/logout';
import ForgotPasswordDecorators from './decorators/forgotPassword';
import ResetPasswordDecorators from './decorators/resetPassword';
import { FilterQuery } from 'mongoose';
import moment from 'moment';
import { LogOutRequest } from 'models/logOutRequest.model';
import verifyAccountDecorator from 'decorators/verfiyAccount';
import { ClientProxy , MessagePattern} from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
@Controller('Auth')
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject('USERS_SERVICE') private readonly usersClient: ClientProxy,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiResponse({ status: HttpStatus.OK, type: LoginResponse })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    type: ErrorType,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorType })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorType })
  @ApiOperation(GetOperationId('Users', 'Login'))
  async login(
    @RealIP() ipAddress: string,
    @Body() credentials: LoginRequest,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    Logger.log(
      `${request.method} request received from ${request.ip} for ${
        request.originalUrl
      } by: ${
        !response.locals.user ? 'Unauthorized User' : response.locals.user.id
      }`,
    );
    try {
      const loginResults = await this.authService.login(
        credentials,
        request.body.deviceToken,
        request.body.deviceType,
        ipAddress,
      );
      return response.status(HttpStatus.OK).send({
        message: 'Login Successfully',
        data: loginResults,
      });
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  }

  @Post('loginDriver')
  @HttpCode(200)
  @ApiResponse({ status: HttpStatus.OK, type: LoginResponse })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    type: ErrorType,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorType })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorType })
  @ApiOperation(GetOperationId('Users', 'Login'))
  async loginDriver(
    @RealIP() ipAddress: string,
    @Body() credentials: LoginRequest,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    Logger.log(
      `${request.method} request received from ${request.ip} for ${
        request.originalUrl
      } by: ${
        !response.locals.user ? 'Unauthorized User' : response.locals.user.id
      }`,
    );
    try {
      const loginResults = await this.authService.loginDriver(
        credentials,
        request.body.deviceToken,
        request.body.deviceType,
        ipAddress,
        response
      );
      if(loginResults["isError"]){
        return response.status(HttpStatus.OK).send( {
          message: 'Your device is already logged in on another device.',
          body:{},
          errorCode: 'DEVICE_ALREADY_LOGGED_IN',
         
            alreadyLogin: true,
  
          
        })
      }
      return response.status(HttpStatus.OK).send({
        message: 'Login Successfully',
        data: loginResults,
      });
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  }
// 
@UseInterceptors(MessagePatternResponseInterceptor)
@MessagePattern({ cmd: 'send_email_Confirmation' })
async tcp_sendEmail(data): Promise<any | Error> {
  try {
    Logger.log(`send email called`);
   
    await this.authService.sendResetPasswordUser(data);
    return true;
  } catch (err) {
    Logger.error({ message: err.message, stack: err.stack });
    return err;
  }
}
@UseInterceptors(MessagePatternResponseInterceptor)
@MessagePattern({ cmd: 'send_email_welcome' })
async tcp_sendEmailWelcome(data): Promise<any | Error> {
  try {
    Logger.log(`send email welcome called`);
   
    await this.authService.sendWelcomeUser(data);
    return true;
  } catch (err) {
    Logger.error({ message: err.message, stack: err.stack });
    return err;
  }
}
  @AccessTokenDecorators()
  async getAccessToken(
    @Req() request: Request,
    @Res() response: Response,
    @RealIP() ipAddress: string,
    @Query('grant_type') grantType?: GrantType,
    @Query('refresh_token') refreshToken?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    // For now this endpoint only issues new tokens with refresh tokens
    Logger.log(
      `${request.method} request received from ${request.ip} for ${
        request.originalUrl
      } by: ${
        !response.locals.user ? 'Unauthorized User' : response.locals.user.id
      }`,
    );
    try {
      // Get old access token
      const oldAccessToken = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
      const res: LoginResponse =
        await this.authService.getAccessTokenFromRefreshToken(
          refreshToken,
          oldAccessToken,
          tenantId,
          ipAddress,
        );
      return response
        .status(HttpStatus.OK)
        .send({ data: res, message: 'Access token create successfully' });
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  }

  @ForgotPasswordDecorators()
  async forgotPassword(
    @Res() response: Response,
    @Body() requestModel: ForgotPasswordRequest,
  ) {
    try {
      Logger.log(`find email`);
      const result = await this.authService.findUser(requestModel.email);
      if (result && Object.keys(result).length > 0) {
        await this.authService.sendEmailResetPassword(result['data']);
        return response.status(HttpStatus.OK).send({
          message: 'Email found',
          success: true,
        });
      } else {
        return response.send({
          data: {},
          message: 'Email address not found',
          statusCode: 422,
          success: false,
        });
      }
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      return response.send({
        data: {},
        message: error.message,
        statusCode: 422,
        success: false,
      });
    }
  }
  @ResetPasswordDecorators()
  async resetPassword(
    @Res() response: Response,
    @Body() requestModel: ResetPasswordRequest,
  ) {
    try {
      Logger.log(`want to update password with enter email`);
      const result = await this.authService.updatePassword(requestModel);
      if (result && Object.keys(result).length > 0) {
        Logger.log(`email update successfully`);
        return response.status(HttpStatus.OK).send({
          message: 'Password updated successfully',
          success: true,
        });
      }
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  }

  @LogoutDecorators()
  async logoutUser(
    @Body() credentials: LogOutRequest,
    @Req() request: Request,
    @Res() response: Response,
    @Headers('Authorization') accessToken: string,
    @Query('from_all') fromAll: boolean = false,
  ): Promise<any> {
    Logger.log(
      `${request.method} request received from ${request.ip} for ${
        request.originalUrl
      } by: ${
        !response.locals.user ? 'Unauthorized User' : response.locals.user.id
      }`,
    );
    const token = accessToken.split(' ')[1];
    const user = jwt_decode<JwtPayload>(token);
    const userPayload = JSON.parse(user?.sub.toString());

    try {
      // let option;
      if (userPayload?.isDriver) {
        const result = await this.authService.beforeLogoutForDriver(userPayload.id);
      }

      //   option = {
      //     actionDate: moment().unix(),
      //     actionType: 'LOGOUT',
      //     driverId: userPayload.id,
      //     tenantId: userPayload.tenantId,
      //     firstName: userPayload.firstName,
      //     lastName: userPayload.lastName,
      //     vehicleId: userPayload.vehicleId,
      //     odoMeterMillage: credentials.odoMeterMillage,
      //     odoMeterSpeed: credentials.odoMeterSpeed,
      //     engineHours: credentials.engineHours,
      //     engineRPMs: credentials.engineRPMs,
      //     sequenceNumber: credentials.sequenceNumber,
      //     deviceVersion: credentials.deviceVersion,
      //     deviceModel: credentials.deviceModel,
      //     eldType: credentials.eldType
      //   };
      
      if (!accessToken) {
        throw new BadRequestException('No access token provided');
      }
      if (fromAll) {
        // let responselogOut = await this.authService.logoutFromAll(
        //   userPayload.id,
        // );
        // if (responselogOut) {
        //   response.status(200).send({
        //     message: 'logout successfully',
        //   });
        // }
      } else {
        const result = await this.authService.logout(token);
        if (result) {
          response.status(200).send({
            message: 'logout successfully',
          });
        }
      }
    } catch (error) {
      Logger.error({ message: error.message, stack: error.stack });
      throw error;
    }
  }
  @verifyAccountDecorator()
  async verifyAccount(
    @RealIP() ipAddress: string,
    @Query('token') token: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<any> {
    console.log(ipAddress);
    console.log(token);

    const userData = this.usersClient.send({ cmd: 'get_user_by_token' }, token);
    const userResult = await firstValueFrom(userData);
    if (!userResult.hasOwnProperty('data')) {
      res.status(404).send({
        message: 'Token you provide is not valid',
      });
    }
    userResult.data.verificationToken = '';
    userResult.data.isVerified = true;
    const updateUser = await this.usersClient.send(
      { cmd: 'update_user_validation' },
      userResult.data,
    );
    const newUser = await firstValueFrom(updateUser);
    console.log('password  ' + newUser?.data?.password);
    const loginData = await this.authService.loginForValidation(
      newUser?.data,
      '',
      '',
      ipAddress,
    );

    // Send the response with the script
    res.send({
      data: loginData,
      massege: 'verification completed!',
      statusCode: 200,
    });
  }
}
