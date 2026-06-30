import { MikroORM } from '@mikro-orm/postgresql';
import { env } from '../config/env';
import { entities } from './entities';

let orm: any = null;

function getClientUrl() {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return env.databaseUrl;
}

export async function initOrm() {
  if (!orm) {
    orm = await MikroORM.init({
      entities,
      clientUrl: getClientUrl(),
    });

    await orm.em.getConnection().execute('CREATE EXTENSION IF NOT EXISTS vector');
    await orm.getSchemaGenerator().updateSchema();
  }

  return orm;
}

export function getOrm() {
  if (!orm) {
    throw new Error('ORM_NOT_INITIALIZED');
  }

  return orm;
}

export function getEm() {
  return getOrm().em.fork();
}
