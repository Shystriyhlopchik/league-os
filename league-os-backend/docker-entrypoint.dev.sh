#!/bin/sh

set -e

echo "Waiting for PostgreSQL..."

until node -e "
const { Client } = require('pg');

const client = new Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

client
  .connect()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
"; do
  sleep 2
done

echo "PostgreSQL is ready"

npm run migration:run

echo "Starting NestJS..."

exec npm run start:dev