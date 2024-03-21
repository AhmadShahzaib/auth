import { Patch ,HttpStatus,NotFoundException, Post} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation,ApiResponse } from '@nestjs/swagger';
import { CombineDecorators, CombineDecoratorType, GetOperationId } from '@shafiqrathore/logeld-tenantbackend-common-future';
import { ForgotPasswordResponse } from '../models/forgotPasswordResponse .model';
export default function verifyAccountDecorator() {
    const verifyAccountDecorator: Array<CombineDecoratorType> = [
        Post('verify'),
        ApiBearerAuth("access-token"),
        ApiResponse({ status: HttpStatus.OK, type: ForgotPasswordResponse}),
        ApiOperation(GetOperationId('Users', 'ResetPassword')),
        ];
    return CombineDecorators(verifyAccountDecorator);
  }