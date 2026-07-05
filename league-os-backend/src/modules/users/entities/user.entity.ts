import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { RoleEntity } from "../../roles/entities/role.entity";
import { UserAuthAccountEntity } from '../../auth/entities/user-auth-account.entity';

@Entity('users')
export class UserEntity extends BaseEntity {
  @Column({
    unique: true,
    nullable: true,
  })
  email?: string;

  @Column({
    unique: true,
  })
  username: string;

  @Column({
    nullable: true,
  })
  passwordHash?: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({
    nullable: true,
  })
  middleName?: string;

  @Column({
    nullable: true,
  })
  avatarUrl?: string;

  @Column({
    nullable: true,
  })
  phone?: string;

  @Column({
    default: true,
  })
  isActive: boolean;

  @ManyToMany(() => RoleEntity)
  @JoinTable({
    name: 'user_roles',
  })
  roles: RoleEntity[];

  @OneToMany(() => UserAuthAccountEntity, (authAccount) => authAccount.user)
  authAccounts: UserAuthAccountEntity[];
}
