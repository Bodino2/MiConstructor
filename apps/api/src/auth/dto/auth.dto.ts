import { IsEmail, IsString, MinLength, IsEnum } from 'class-validator';
import { Role } from '@miconstructor/shared';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(Role)
  role: Role;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
