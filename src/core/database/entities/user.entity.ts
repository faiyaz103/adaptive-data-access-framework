import { Column, Entity, Index, Unique } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { UserRole } from "../common/enums";

@Entity('users')
export class User extends BaseEntity {
    @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
    @Index()
    email!: string;

    @Column({ name: 'role', type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.CUSTOMER })
    role!: UserRole;

    @Column({type: 'varchar', length: 255, select: false})
    password!: string;

    @Column({type: 'text', nullable: true, select: false})
    refresh_token?: string | null;
}