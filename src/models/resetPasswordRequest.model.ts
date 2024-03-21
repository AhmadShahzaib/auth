import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsEmail,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordRequest {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsNotEmpty()
  @MinLength(8)
  @IsString()
  @MaxLength(20)
  password: string;
}
