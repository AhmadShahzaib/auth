import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
export class LogOutRequest {
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
  deviceVersion?: string;

  @ApiProperty()
  @IsOptional()
  deviceModel?: string;
  
  @ApiProperty()
  @IsOptional()
  eldType?: string;
}
