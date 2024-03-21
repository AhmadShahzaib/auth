import { Post ,HttpStatus,NotFoundException} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation,ApiResponse } from '@nestjs/swagger';
import { CombineDecorators, CombineDecoratorType, GetOperationId } from '@shafiqrathore/logeld-tenantbackend-common-future';
import { ForgotPasswordResponse } from '../models/forgotPasswordResponse .model';
export default function ForgotPasswordDecorators() {
    const ForgotPasswordDecorators: Array<CombineDecoratorType> = [
        Post('forgot_password'),
        ApiBearerAuth("access-token"),
        ApiResponse({ status: HttpStatus.OK, type: ForgotPasswordResponse }),
        ApiOperation(GetOperationId('Users', 'ForgotPassword')),
    ];
    return CombineDecorators(ForgotPasswordDecorators);
  }