import type { AISchemaContext } from '@/types';

export class SchemaContextService {
  normalize(input?: AISchemaContext) {
    return {
      tables: (input?.tables ?? []).map((table) => ({
        ...table,
        schema: table.schema ?? null,
        columns: table.columns ?? [],
        indexes: table.indexes ?? [],
        foreignKeys: table.foreignKeys ?? [],
        comment: table.comment ?? null,
      })),
    };
  }

  buildVisibleSchemaContext(input: AISchemaContext) {
    if (!input.tables.length) {
      return 'Visible schema: none provided.';
    }

    return [
      'Visible schema:',
      ...input.tables.map((table) => {
        const schemaPrefix = table.schema ? `${table.schema}.` : '';
        const columns = (table.columns ?? [])
          .map((column) => `${column.name}${column.type ? ` ${column.type}` : ''}`)
          .join(', ');
        const indexes = (table.indexes ?? [])
          .map(
            (index) => `${index.name}(${index.columns.join(', ')})${index.unique ? ' unique' : ''}`,
          )
          .join('; ');
        const foreignKeys = (table.foreignKeys ?? [])
          .map(
            (foreignKey) =>
              `${foreignKey.columns.join(', ')} -> ${foreignKey.referencedSchema ? `${foreignKey.referencedSchema}.` : ''}${foreignKey.referencedTable}(${foreignKey.referencedColumns.join(', ')})`,
          )
          .join('; ');

        return [
          `- ${schemaPrefix}${table.name}`,
          columns ? `  columns: ${columns}` : '',
          indexes ? `  indexes: ${indexes}` : '',
          foreignKeys ? `  foreign keys: ${foreignKeys}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }),
    ].join('\n');
  }
}
