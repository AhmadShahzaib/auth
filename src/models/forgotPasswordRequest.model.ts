import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  email: string;
}
