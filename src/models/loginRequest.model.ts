import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  MinLength,
  MaxLength,
  IsNotEmpty,
  ValidateIf,
  IsOptional,
} from 'class-validator';
import { Schema } from 'mongoose';
export class LoginRequest {
  @IsNotEmpty()
  @ApiProperty()
  userName: string;

  @IsNotEmpty()
  @ApiProperty()
  allowLogin: boolean;

  @IsNotEmpty({ message: 'Password is required' })
  @ApiProperty()
  password: string;

  @ApiPropertyOptional()
  @IsNotEmpty()
  tenantId?: Schema.Types.ObjectId;

  @ApiPropertyOptional()
  @IsOptional()
  deviceToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  deviceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  deviceVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  deviceModel?: string;

  @ApiProperty()
  @IsOptional()
  odoMeterMillage?: number;

  @ApiProperty()
  @IsOptional()
  odoMeterSpeed?: number;

  @ApiProperty()
  @IsOptional()
  engineHours?: number;

  @ApiProperty()
  @IsOptional()
  engineRPMs?: number;

  @ApiProperty()
  @IsOptional()
  sequenceNumber?: number;

  @ApiProperty()
  @IsOptional()
  eldType?: string;
}
