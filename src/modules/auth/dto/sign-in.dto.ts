import { UserRole } from "@core/database/common/enums";
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class SignInDto{

    @IsNotEmpty()
    @IsEmail()
    @MaxLength(255)
    email!: string;

    @IsNotEmpty()
    @IsString()
    @Length(8, 255)
    password!: string;

}