import { UserRole } from "@core/database/common/enums";
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class CreateAuthDto{

    @IsNotEmpty()
    @IsEmail()
    @MaxLength(255)
    email!: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsNotEmpty()
    @IsString()
    @Length(8, 255)
    password!: string;

    @IsNotEmpty()
    @IsString()
    @Length(8, 255)
    confirm_password!: string;

}