import {
  Get,
  HttpStatus,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import {
  CombineDecorators,
  CombineDecoratorType,
  EnumToArray,
} from '@shafiqrathore/logeld-tenantbackend-common-future';
import { GrantType, LoginResponse } from '../models';

export default function AccessTokenDecorators() {
  const AccessTokenDecorators: Array<CombineDecoratorType> = [
    Get('access_token'),
    ApiBearerAuth("access-token"),
    ApiResponse({ status: HttpStatus.OK, type: LoginResponse }),
    ApiQuery({ name: 'grant_type', enum: EnumToArray(GrantType) }),
    ApiQuery({ name: 'refresh_token', required: false }),
    ApiQuery({ name: 'tenant_id', required: false }),
    ApiOperation({ summary: 'AccessToken', description: 'Get a refresh token' }),
    
  ];
  return CombineDecorators(AccessTokenDecorators);
}
