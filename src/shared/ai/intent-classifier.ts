export enum AIIntent {
  GENERAL_CHAT = 'general_chat',
  CLASSIFY_ONLY = 'classify_only',
  GENERATE_SQL = 'generate_sql',
  CONFIRM_BEFORE_RUN = 'confirm_before_run',
  EXPLAIN_SQL_ERROR = 'explain_sql_error',
  ASK_SCHEMA = 'ask_schema',
  OPTIMIZE_SQL = 'optimize_sql',
  EXPLAIN_QUERY_RESULT = 'explain_query_result',
  SAVE_SQL_SUGGESTION = 'save_sql_suggestion',
  RETRIEVE_DOCS = 'retrieve_docs',
  SEARCH_QUERY_HISTORY = 'search_query_history',
  USE_MEMORY = 'use_memory',
  TOOL_OPEN_TABLE = 'tool_open_table',
  TOOL_CREATE_TAB = 'tool_create_tab',
  TOOL_EXPORT_CSV = 'tool_export_csv',
  TOOL_EXPLAIN_INDEX = 'tool_explain_index',
  TOOL_GENERATE_MIGRATION = 'tool_generate_migration',
}

export type IntentDetectionResult = {
  primaryIntent: AIIntent;
  secondaryIntents: AIIntent[];
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function secondaryIntentsFor(intent: AIIntent) {
  switch (intent) {
    case AIIntent.GENERATE_SQL:
    case AIIntent.TOOL_GENERATE_MIGRATION:
    case AIIntent.TOOL_OPEN_TABLE:
    case AIIntent.TOOL_CREATE_TAB:
    case AIIntent.TOOL_EXPORT_CSV:
    case AIIntent.TOOL_EXPLAIN_INDEX:
      return [AIIntent.CONFIRM_BEFORE_RUN];
    case AIIntent.EXPLAIN_SQL_ERROR:
      return [AIIntent.GENERATE_SQL];
    case AIIntent.RETRIEVE_DOCS:
      return [AIIntent.USE_MEMORY];
    default:
      return [];
  }
}

export function detectIntent(message: string, explicitIntent?: AIIntent): IntentDetectionResult {
  if (explicitIntent) {
    return {
      primaryIntent: explicitIntent,
      secondaryIntents: secondaryIntentsFor(explicitIntent),
    };
  }

  const text = normalize(message);
  const orderedRules: Array<{ intent: AIIntent; patterns: RegExp[] }> = [
    {
      intent: AIIntent.TOOL_OPEN_TABLE,
      patterns: [/open table/, /show .* table/, /go to .* table/, /navigate to .* table/],
    },
    {
      intent: AIIntent.TOOL_CREATE_TAB,
      patterns: [/create tab/, /new tab/, /open new tab/],
    },
    {
      intent: AIIntent.TOOL_EXPORT_CSV,
      patterns: [/export .*csv/, /download .*csv/, /save .*csv/],
    },
    {
      intent: AIIntent.TOOL_GENERATE_MIGRATION,
      patterns: [
        /generate migration/,
        /write migration/,
        /create migration/,
        /alter table/,
        /create table/,
      ],
    },
    {
      intent: AIIntent.TOOL_EXPLAIN_INDEX,
      patterns: [/explain index/, /which index/, /index usage/, /index plan/],
    },
    {
      intent: AIIntent.EXPLAIN_SQL_ERROR,
      patterns: [
        /sql error/,
        /query failed/,
        /syntax error/,
        /does not exist/,
        /fix .*sql/,
        /repair .*sql/,
      ],
    },
    {
      intent: AIIntent.EXPLAIN_QUERY_RESULT,
      patterns: [/explain .*result/, /why .*result/, /what does this result/, /result means/],
    },
    {
      intent: AIIntent.SEARCH_QUERY_HISTORY,
      patterns: [/query history/, /recent query/, /find .*query/, /search .*history/],
    },
    {
      intent: AIIntent.SAVE_SQL_SUGGESTION,
      patterns: [/save .*sql/, /save suggestion/, /save this query/, /bookmark .*sql/],
    },
    {
      intent: AIIntent.OPTIMIZE_SQL,
      patterns: [
        /optimi[sz]e/,
        /slow query/,
        /performance/,
        /query plan/,
        /make this query faster/,
      ],
    },
    {
      intent: AIIntent.ASK_SCHEMA,
      patterns: [/schema/, /table/, /column/, /foreign key/, /relationship/, /what tables/],
    },
    {
      intent: AIIntent.RETRIEVE_DOCS,
      patterns: [/docs/, /documentation/, /politedb docs/, /how does politedb/],
    },
    {
      intent: AIIntent.GENERATE_SQL,
      patterns: [
        /generate sql/,
        /write sql/,
        /query to/,
        /\bselect\b/,
        /\binsert\b/,
        /\bupdate\b/,
        /\bdelete\b/,
      ],
    },
    {
      intent: AIIntent.CLASSIFY_ONLY,
      patterns: [/classify intent/, /what is this intent/],
    },
    {
      intent: AIIntent.USE_MEMORY,
      patterns: [/remember that/, /for this connection/, /my usual/, /as before/],
    },
  ];

  for (const rule of orderedRules) {
    if (includesAny(text, rule.patterns)) {
      return {
        primaryIntent: rule.intent,
        secondaryIntents: secondaryIntentsFor(rule.intent),
      };
    }
  }

  return {
    primaryIntent: AIIntent.GENERAL_CHAT,
    secondaryIntents: [],
  };
}
