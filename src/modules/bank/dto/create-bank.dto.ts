import { BankAccountType, BankInfoStatus } from '@core/database/common/enums';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBankDto {

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  branchName!: string;

  @IsEnum(BankAccountType)
  @IsOptional()
  accountType?: BankAccountType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  accountHolderNameEnc!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  accountNumberEnc!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  routingNumberEnc?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  swiftCodeEnc?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  ibanEnc?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  identityNumberEnc!: string;

  @IsEnum(BankInfoStatus)
  @IsOptional()
  status?: BankInfoStatus;
}
