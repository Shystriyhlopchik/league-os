import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('password_reset_tokens')
@Index('IDX_password_reset_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_password_reset_tokens_user_id', ['userId'])
export class PasswordResetTokenEntity extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'token_hash', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'used_at', nullable: true })
  usedAt?: Date;
}
