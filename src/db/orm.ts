import { MikroORM } from '@mikro-orm/postgresql';
import { env } from '../config/env';
import mikroOrmConfig from './mikro-orm.config';

let orm: any = null;

export async function initOrm() {
  if (!orm) {
    orm = await MikroORM.init(mikroOrmConfig);

    if (env.aiEnableSemanticCache) {
      await orm.em.getConnection().execute('CREATE EXTENSION IF NOT EXISTS vector');
    }

    await orm.getMigrator().up();
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
