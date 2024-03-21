import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginResponse {

  @ApiProperty()
  accessToken: string;

  @ApiProperty({ default: 'bearer' })
  tokenType?: string = 'bearer';

  @ApiProperty()
  expiresIn?: string | number;

  @ApiPropertyOptional()
  refreshToken?: string;

  // TODO: Replace below any type with user response type when common package is published with interfaces 
  @ApiProperty()
  user?: any
}
