import {
    Column,
    Entity,
    ManyToMany,
} from 'typeorm';

import { UserEntity } from '../../users/entities/user.entity';
import {BaseEntity} from "../../../common/base/base.entity";

@Entity('roles')
export class RoleEntity extends BaseEntity {
    @Column({
        unique: true,
    })
    code: string;

    @Column()
    name: string;

    @ManyToMany(() => UserEntity, (user) => user.roles)
    users: UserEntity[];
}