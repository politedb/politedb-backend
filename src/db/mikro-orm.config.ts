import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator, TSMigrationGenerator } from '@mikro-orm/migrations';
import { env } from '@/config/env';
import { entities } from './entities';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export default defineConfig({
  entities,
  clientUrl: env.databaseUrl,
  extensions: [Migrator],
  migrations: {
    tableName: 'mikro_orm_migrations',
    path: 'dist/db/migrations',
    pathTs: 'src/db/migrations',
    glob: '!(*.d).{js,ts,cjs}',
    transactional: true,
    allOrNothing: true,
    emit: 'ts',
    generator: TSMigrationGenerator,
  },
});
