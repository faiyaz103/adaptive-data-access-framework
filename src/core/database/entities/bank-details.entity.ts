import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { User } from './user.entity';
import { BankAccountType, BankInfoStatus } from '../common/enums';
import { EncryptionTransformer } from '@core/security/ale/transformers/encryption.transformer';

@Entity('bank_details')
export class BankInfoEntity extends BaseEntity {

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(()=>User, {onDelete:'CASCADE'})
  @JoinColumn({name:'user_id', referencedColumnName:'id'})
  user!: User;

  @Column({ name: 'branch_name', type: 'varchar', length: 120, transformer: new EncryptionTransformer()})
  branchName!: string;

  @Column({
    name: 'account_type',
    type: 'enum',
    enum: BankAccountType,
    default: BankAccountType.SAVINGS,
  })
  accountType!: BankAccountType;

  @Column({ name: 'account_holder_name_enc', type: 'text', transformer: new EncryptionTransformer() })
  accountHolderNameEnc!: string;

  @Column({ name: 'account_number_enc', type: 'text', transformer: new EncryptionTransformer() })
  accountNumberEnc!: string;

  @Column({ name: 'account_last_four', type:'string', length: 4 })
  accountLastFour!: string;

  @Column({ name: 'routing_number_enc', type: 'text', nullable: true, transformer: new EncryptionTransformer() })
  routingNumberEnc?: string | null;

  @Column({ name: 'swift_code_enc', type: 'text', nullable: true, transformer: new EncryptionTransformer() })
  swiftCodeEnc?: string | null;

  @Column({ name: 'iban_enc', type: 'text', nullable: true, transformer: new EncryptionTransformer() })
  ibanEnc?: string | null;

  @Column({ name: 'identity_number_enc', type: 'text', transformer: new EncryptionTransformer()})
  identityNumberEnc!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: BankInfoStatus,
    default: BankInfoStatus.ACTIVE,
  })
  status!: BankInfoStatus;

}