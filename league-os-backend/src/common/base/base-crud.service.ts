import { NotFoundException } from '@nestjs/common';
import {
    DeepPartial,
    FindManyOptions,
    FindOneOptions,
    FindOptionsWhere,
    ObjectLiteral,
    Repository,
} from 'typeorm';

export abstract class BaseCrudService<Entity extends ObjectLiteral> {
    protected constructor(
        protected readonly repository: Repository<Entity>,
        protected readonly entityName: string,
    ) {}

    create(dto: DeepPartial<Entity>): Promise<Entity> {
        const entity = this.repository.create(dto);
        return this.repository.save(entity);
    }

    findMany(query: FindManyOptions<Entity> = {}): Promise<Entity[]> {
        return this.repository.find(query);
    }

    async findOne(query: FindOneOptions<Entity>): Promise<Entity> {
        const entity = await this.repository.findOne(query);

        if (!entity) {
            throw new NotFoundException(`${this.entityName} не найден`);
        }

        return entity;
    }

    async updateOne(
        query: FindOptionsWhere<Entity>,
        dto: DeepPartial<Entity>,
    ): Promise<Entity> {
        const entity = await this.findOne({ where: query });

        const updatedEntity = this.repository.merge(entity, dto);

        return this.repository.save(updatedEntity);
    }

    async removeOne(query: FindOptionsWhere<Entity>): Promise<void> {
        const entity = await this.findOne({ where: query });

        await this.repository.remove(entity);
    }
}