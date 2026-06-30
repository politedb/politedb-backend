import type { AIToolName } from '@/types';

export type AIToolDefinition = {
  name: AIToolName;
  kind: 'frontend_action' | 'backend_reasoning';
  confirmationRequired: true;
  description: string;
};

const TOOL_DEFINITIONS: Record<AIToolName, AIToolDefinition> = {
  open_table: {
    name: 'open_table',
    kind: 'frontend_action',
    confirmationRequired: true,
    description: 'Open a table in the UI.',
  },
  create_tab: {
    name: 'create_tab',
    kind: 'frontend_action',
    confirmationRequired: true,
    description: 'Create a new query tab in the UI.',
  },
  export_csv: {
    name: 'export_csv',
    kind: 'frontend_action',
    confirmationRequired: true,
    description: 'Export the current result set to CSV.',
  },
  explain_index: {
    name: 'explain_index',
    kind: 'backend_reasoning',
    confirmationRequired: true,
    description: 'Explain which indexes are relevant for the current query or table.',
  },
  generate_migration: {
    name: 'generate_migration',
    kind: 'backend_reasoning',
    confirmationRequired: true,
    description: 'Generate a migration SQL draft from the requested schema change.',
  },
};

export class ToolRegistryService {
  get(name: AIToolName) {
    return TOOL_DEFINITIONS[name];
  }

  list() {
    return Object.values(TOOL_DEFINITIONS);
  }
}
