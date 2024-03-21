import { Post,HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation,ApiResponse } from '@nestjs/swagger';
import { CombineDecorators, CombineDecoratorType, GetOperationId } from '@shafiqrathore/logeld-tenantbackend-common-future';

export default function LogoutDecorators() {
    const LogoutDecorators: Array<CombineDecoratorType> = [
        Post('logout'),
        ApiBearerAuth("access-token"),
        ApiResponse({ status: HttpStatus.OK }),
        ApiOperation(GetOperationId('Users', 'Logout')),
    ];
    return CombineDecorators(LogoutDecorators);
  }
