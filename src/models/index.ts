export * from './loginResponse.model';
export * from './loginRequest.model';

export enum GrantType {
    RefreshToken = 'refresh_token',
    Password = 'password',
    AuthorizationCode = 'authorization-code',
    Implicit = 'implicit',
    ClientCredentials = 'client-credentials',
  }
