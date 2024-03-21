import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordResponse {
  @ApiProperty()
  isDriver: boolean;
  @ApiProperty()
  success: boolean;
}
