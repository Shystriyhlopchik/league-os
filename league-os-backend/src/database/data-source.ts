import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',

  host: process.env.POSTGRES_HOST,

  port: Number(process.env.POSTGRES_PORT),

  username: process.env.POSTGRES_USER,

  password: process.env.POSTGRES_PASSWORD,

  database: process.env.POSTGRES_DB,

  entities: [
    'src/modules/**/*.entity.ts',
  ],

  migrations: [
    'src/database/migrations/*.ts',
  ],

  synchronize: false,
});