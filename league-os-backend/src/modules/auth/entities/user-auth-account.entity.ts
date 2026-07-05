import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { AuthProvider } from '../enums/auth-provider.enum';

@Entity('user_auth_accounts')
@Index('IDX_user_auth_accounts_provider_login', ['provider', 'login'], {
  unique: true,
  where: '"login" IS NOT NULL',
})
@Index(
  'IDX_user_auth_accounts_provider_external_id',
  ['provider', 'providerUserId'],
  {
    unique: true,
    where: '"providerUserId" IS NOT NULL',
  },
)
export class UserAuthAccountEntity extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => UserEntity, (user) => user.authAccounts, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({
    type: 'enum',
    enum: AuthProvider,
  })
  provider: AuthProvider;

  @Column({ nullable: true })
  providerUserId?: string;

  @Column({ nullable: true })
  login?: string;

  @Column({ nullable: true })
  passwordHash?: string;
}
