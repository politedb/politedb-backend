import { Collection, EntitySchema } from '@mikro-orm/core';

export class License {
  id!: string;
  product!: string;
  licenseKey!: string;
  planName!: string;
  customerEmail!: string;
  instanceName!: string | null;
  seatsAllowed!: number;
  expiresAt!: Date | null;
  status!: string;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  activations = new Collection<Activation>(this);
  polarTransactions = new Collection<PolarTransaction>(this);
}

export class Activation {
  id!: string;
  license!: License;
  activationToken!: string;
  deviceId!: string;
  deviceName!: string;
  platform!: string;
  arch!: string;
  status!: string;
  activatedAt!: Date;
  lastValidatedAt!: Date;
  deactivatedAt!: Date | null;
}

export class PolarTransaction {
  id!: string;
  polarOrderId!: string;
  polarCheckoutId!: string | null;
  polarSubscriptionId!: string | null;
  polarCustomerId!: string;
  polarProductId!: string | null;
  externalCustomerId!: string | null;
  license!: License;
  eventType!: string;
  status!: string;
  licenseEmailSentAt!: Date | null;
  licenseEmailError!: string | null;
  metadataJson!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class PolarLicenseDelivery {
  grantId!: string;
  polarOrderId!: string | null;
  polarBenefitId!: string | null;
  polarLicenseKeyId!: string | null;
  customerEmail!: string;
  emailSentAt!: Date | null;
  emailError!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AiUsageLog {
  id!: string;
  userId!: string;
  workspaceId!: string | null;
  connectionId!: string | null;
  provider!: string | null;
  modelName!: string | null;
  intent!: string | null;
  inputTokens!: number;
  outputTokens!: number;
  totalTokens!: number;
  estimatedCost!: string;
  latencyMs!: number;
  cacheHit!: boolean;
  status!: string;
  errorMessage!: string | null;
  createdAt!: Date;
}

export class AiThread {
  id!: string;
  workspaceId!: string;
  connectionId!: string;
  title!: string | null;
  provider!: string | null;
  modelName!: string | null;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AiMessage {
  id!: string;
  threadId!: string;
  role!: string;
  intent!: string | null;
  content!: string;
  artifactsJson!: string | null;
  toolProposalsJson!: string | null;
  citationsJson!: string | null;
  createdAt!: Date;
}

export class AiScopedMemory {
  id!: string;
  workspaceId!: string;
  connectionId!: string;
  summary!: string;
  factsJson!: string;
  lastRefreshedAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AiSavedSnippet {
  id!: string;
  workspaceId!: string;
  connectionId!: string;
  threadId!: string | null;
  title!: string;
  sql!: string;
  dialect!: string | null;
  sourceIntent!: string | null;
  provenanceMessageId!: string | null;
  createdByUserId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AiToolProposal {
  id!: string;
  threadId!: string;
  messageId!: string;
  toolName!: string;
  status!: string;
  argumentsJson!: string;
  resultJson!: string | null;
  confirmationText!: string;
  expiresAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AiConnectionIndex {
  id!: string;
  workspaceId!: string;
  connectionId!: string;
  databaseName!: string | null;
  schemaName!: string | null;
  engine!: string | null;
  enabled!: boolean;
  status!: string;
  lastIndexedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AiSchemaObject {
  id!: string;
  workspaceId!: string;
  connectionId!: string;
  databaseName!: string | null;
  schemaName!: string | null;
  objectType!: string;
  objectName!: string;
  comment!: string | null;
  metadataJson!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AiSchemaColumn {
  id!: string;
  objectId!: string;
  workspaceId!: string;
  connectionId!: string;
  schemaName!: string | null;
  tableName!: string;
  columnName!: string;
  dataType!: string | null;
  nullable!: boolean | null;
  isPrimaryKey!: boolean;
  defaultValue!: string | null;
  comment!: string | null;
  ordinalPosition!: number | null;
}

export class AiSchemaRelationship {
  id!: string;
  workspaceId!: string;
  connectionId!: string;
  schemaName!: string | null;
  tableName!: string;
  columnsJson!: string;
  referencedSchema!: string | null;
  referencedTable!: string;
  referencedColumnsJson!: string;
}

export class AiSchemaIndex {
  id!: string;
  workspaceId!: string;
  connectionId!: string;
  schemaName!: string | null;
  tableName!: string;
  indexName!: string;
  columnsJson!: string;
  unique!: boolean;
  comment!: string | null;
}

export class AiRagDocument {
  id!: string;
  workspaceId!: string;
  connectionId!: string;
  databaseName!: string | null;
  schemaName!: string | null;
  sourceType!: string;
  sourceId!: string;
  title!: string | null;
  content!: string;
  contentHash!: string;
  metadataJson!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AiRagEmbedding {
  id!: string;
  documentId!: string;
  workspaceId!: string;
  connectionId!: string;
  databaseName!: string | null;
  schemaName!: string | null;
  sourceType!: string;
  contentHash!: string;
  model!: string;
  dimensions!: number;
  embeddingVector!: string;
  createdAt!: Date;
}

export const LicenseSchema = new EntitySchema<License>({
  class: License,
  tableName: 'licenses',
  properties: {
    id: { type: 'string', primary: true },
    product: { type: 'string' },
    licenseKey: { type: 'string', unique: true, fieldName: 'license_key' },
    planName: { type: 'string', fieldName: 'plan_name' },
    customerEmail: { type: 'string', fieldName: 'customer_email' },
    instanceName: { type: 'string', nullable: true, fieldName: 'instance_name' },
    seatsAllowed: { type: 'number', fieldName: 'seats_allowed', default: 1 },
    expiresAt: { type: 'datetime', nullable: true, fieldName: 'expires_at' },
    status: { type: 'string', default: 'active' },
    notes: { type: 'string', nullable: true },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
    activations: {
      kind: '1:m',
      entity: () => Activation,
      mappedBy: 'license',
    },
    polarTransactions: {
      kind: '1:m',
      entity: () => PolarTransaction,
      mappedBy: 'license',
    },
  },
});

export const ActivationSchema = new EntitySchema<Activation>({
  class: Activation,
  tableName: 'activations',
  indexes: [{ properties: ['activationToken'], name: 'idx_activations_token' }],
  uniques: [{ properties: ['license', 'deviceId'], name: 'idx_activations_license_device' }],
  properties: {
    id: { type: 'string', primary: true },
    license: {
      kind: 'm:1',
      entity: () => License,
      fieldName: 'license_id',
      deleteRule: 'cascade',
    },
    activationToken: { type: 'string', unique: true, fieldName: 'activation_token' },
    deviceId: { type: 'string', fieldName: 'device_id' },
    deviceName: { type: 'string', fieldName: 'device_name' },
    platform: { type: 'string' },
    arch: { type: 'string' },
    status: { type: 'string', default: 'active' },
    activatedAt: { type: 'datetime', fieldName: 'activated_at' },
    lastValidatedAt: { type: 'datetime', fieldName: 'last_validated_at' },
    deactivatedAt: { type: 'datetime', nullable: true, fieldName: 'deactivated_at' },
  },
});

export const PolarTransactionSchema = new EntitySchema<PolarTransaction>({
  class: PolarTransaction,
  tableName: 'polar_transactions',
  indexes: [
    { properties: ['polarSubscriptionId'], name: 'idx_polar_transactions_subscription' },
    { properties: ['license'], name: 'idx_polar_transactions_license' },
  ],
  properties: {
    id: { type: 'string', primary: true },
    polarOrderId: { type: 'string', unique: true, fieldName: 'polar_order_id' },
    polarCheckoutId: { type: 'string', nullable: true, fieldName: 'polar_checkout_id' },
    polarSubscriptionId: { type: 'string', nullable: true, fieldName: 'polar_subscription_id' },
    polarCustomerId: { type: 'string', fieldName: 'polar_customer_id' },
    polarProductId: { type: 'string', nullable: true, fieldName: 'polar_product_id' },
    externalCustomerId: { type: 'string', nullable: true, fieldName: 'external_customer_id' },
    license: {
      kind: 'm:1',
      entity: () => License,
      fieldName: 'license_id',
      deleteRule: 'cascade',
    },
    eventType: { type: 'string', fieldName: 'event_type' },
    status: { type: 'string', default: 'paid' },
    licenseEmailSentAt: {
      type: 'datetime',
      nullable: true,
      fieldName: 'license_email_sent_at',
    },
    licenseEmailError: { type: 'string', nullable: true, fieldName: 'license_email_error' },
    metadataJson: { type: 'text', nullable: true, fieldName: 'metadata_json' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const PolarLicenseDeliverySchema = new EntitySchema<PolarLicenseDelivery>({
  class: PolarLicenseDelivery,
  tableName: 'polar_license_key_deliveries',
  indexes: [{ properties: ['polarOrderId'], name: 'idx_polar_license_key_deliveries_order' }],
  properties: {
    grantId: { type: 'string', primary: true, fieldName: 'grant_id' },
    polarOrderId: { type: 'string', nullable: true, fieldName: 'polar_order_id' },
    polarBenefitId: { type: 'string', nullable: true, fieldName: 'polar_benefit_id' },
    polarLicenseKeyId: { type: 'string', nullable: true, fieldName: 'polar_license_key_id' },
    customerEmail: { type: 'string', fieldName: 'customer_email' },
    emailSentAt: { type: 'datetime', nullable: true, fieldName: 'email_sent_at' },
    emailError: { type: 'string', nullable: true, fieldName: 'email_error' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const AiUsageLogSchema = new EntitySchema<AiUsageLog>({
  class: AiUsageLog,
  tableName: 'ai_usage_logs',
  indexes: [
    { properties: ['userId', 'createdAt'], name: 'idx_ai_usage_logs_user_created_at' },
    { properties: ['workspaceId', 'createdAt'], name: 'idx_ai_usage_logs_workspace_created_at' },
  ],
  properties: {
    id: { type: 'string', primary: true },
    userId: { type: 'string', fieldName: 'user_id' },
    workspaceId: { type: 'string', nullable: true, fieldName: 'workspace_id' },
    connectionId: { type: 'string', nullable: true, fieldName: 'connection_id' },
    provider: { type: 'string', nullable: true },
    modelName: { type: 'string', nullable: true, fieldName: 'model_name' },
    intent: { type: 'string', nullable: true },
    inputTokens: { type: 'number', fieldName: 'input_tokens', default: 0 },
    outputTokens: { type: 'number', fieldName: 'output_tokens', default: 0 },
    totalTokens: { type: 'number', fieldName: 'total_tokens', default: 0 },
    estimatedCost: {
      type: 'decimal',
      fieldName: 'estimated_cost',
      default: '0',
      precision: 12,
      scale: 8,
    },
    latencyMs: { type: 'number', fieldName: 'latency_ms', default: 0 },
    cacheHit: { type: 'boolean', fieldName: 'cache_hit', default: false },
    status: { type: 'string', default: 'success' },
    errorMessage: { type: 'text', nullable: true, fieldName: 'error_message' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
  },
});

export const AiThreadSchema = new EntitySchema<AiThread>({
  class: AiThread,
  tableName: 'ai_threads',
  indexes: [
    {
      properties: ['workspaceId', 'connectionId', 'updatedAt'],
      name: 'idx_ai_threads_scope_updated_at',
    },
  ],
  properties: {
    id: { type: 'string', primary: true },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    title: { type: 'string', nullable: true },
    provider: { type: 'string', nullable: true },
    modelName: { type: 'string', nullable: true, fieldName: 'model_name' },
    status: { type: 'string', default: 'active' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const AiMessageSchema = new EntitySchema<AiMessage>({
  class: AiMessage,
  tableName: 'ai_messages',
  indexes: [{ properties: ['threadId', 'createdAt'], name: 'idx_ai_messages_thread_created_at' }],
  properties: {
    id: { type: 'string', primary: true },
    threadId: { type: 'string', fieldName: 'thread_id' },
    role: { type: 'string' },
    intent: { type: 'string', nullable: true },
    content: { type: 'text' },
    artifactsJson: { type: 'text', nullable: true, fieldName: 'artifacts_json' },
    toolProposalsJson: { type: 'text', nullable: true, fieldName: 'tool_proposals_json' },
    citationsJson: { type: 'text', nullable: true, fieldName: 'citations_json' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
  },
});

export const AiScopedMemorySchema = new EntitySchema<AiScopedMemory>({
  class: AiScopedMemory,
  tableName: 'ai_scoped_memories',
  indexes: [{ properties: ['workspaceId', 'connectionId'], name: 'idx_ai_scoped_memories_scope' }],
  uniques: [{ properties: ['workspaceId', 'connectionId'], name: 'uq_ai_scoped_memories_scope' }],
  properties: {
    id: { type: 'string', primary: true },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    summary: { type: 'text', default: '' },
    factsJson: { type: 'text', fieldName: 'facts_json' },
    lastRefreshedAt: { type: 'datetime', fieldName: 'last_refreshed_at' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const AiSavedSnippetSchema = new EntitySchema<AiSavedSnippet>({
  class: AiSavedSnippet,
  tableName: 'ai_saved_snippets',
  indexes: [
    {
      properties: ['workspaceId', 'connectionId', 'updatedAt'],
      name: 'idx_ai_saved_snippets_scope_updated_at',
    },
    { properties: ['threadId'], name: 'idx_ai_saved_snippets_thread' },
  ],
  properties: {
    id: { type: 'string', primary: true },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    threadId: { type: 'string', nullable: true, fieldName: 'thread_id' },
    title: { type: 'string' },
    sql: { type: 'text' },
    dialect: { type: 'string', nullable: true },
    sourceIntent: { type: 'string', nullable: true, fieldName: 'source_intent' },
    provenanceMessageId: { type: 'string', nullable: true, fieldName: 'provenance_message_id' },
    createdByUserId: { type: 'string', nullable: true, fieldName: 'created_by_user_id' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const AiToolProposalSchema = new EntitySchema<AiToolProposal>({
  class: AiToolProposal,
  tableName: 'ai_tool_proposals',
  indexes: [
    { properties: ['threadId', 'createdAt'], name: 'idx_ai_tool_proposals_thread_created_at' },
    { properties: ['status', 'expiresAt'], name: 'idx_ai_tool_proposals_status_expires_at' },
  ],
  properties: {
    id: { type: 'string', primary: true },
    threadId: { type: 'string', fieldName: 'thread_id' },
    messageId: { type: 'string', fieldName: 'message_id' },
    toolName: { type: 'string', fieldName: 'tool_name' },
    status: { type: 'string', default: 'proposed' },
    argumentsJson: { type: 'text', fieldName: 'arguments_json' },
    resultJson: { type: 'text', nullable: true, fieldName: 'result_json' },
    confirmationText: { type: 'text', fieldName: 'confirmation_text' },
    expiresAt: { type: 'datetime', fieldName: 'expires_at' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const AiConnectionIndexSchema = new EntitySchema<AiConnectionIndex>({
  class: AiConnectionIndex,
  tableName: 'ai_connection_indexes',
  indexes: [
    { properties: ['workspaceId', 'connectionId'], name: 'idx_ai_connection_indexes_scope' },
  ],
  uniques: [
    {
      properties: ['workspaceId', 'connectionId', 'databaseName', 'schemaName'],
      name: 'uniq_ai_connection_indexes_scope',
    },
  ],
  properties: {
    id: { type: 'string', primary: true },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    databaseName: { type: 'string', nullable: true, fieldName: 'database_name' },
    schemaName: { type: 'string', nullable: true, fieldName: 'schema_name' },
    engine: { type: 'string', nullable: true },
    enabled: { type: 'boolean', default: false },
    status: { type: 'string', default: 'disabled' },
    lastIndexedAt: { type: 'datetime', nullable: true, fieldName: 'last_indexed_at' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const AiSchemaObjectSchema = new EntitySchema<AiSchemaObject>({
  class: AiSchemaObject,
  tableName: 'ai_schema_objects',
  indexes: [
    {
      properties: ['workspaceId', 'connectionId', 'schemaName'],
      name: 'idx_ai_schema_objects_scope',
    },
  ],
  uniques: [
    {
      properties: [
        'workspaceId',
        'connectionId',
        'databaseName',
        'schemaName',
        'objectType',
        'objectName',
      ],
      name: 'uniq_ai_schema_objects_name',
    },
  ],
  properties: {
    id: { type: 'string', primary: true },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    databaseName: { type: 'string', nullable: true, fieldName: 'database_name' },
    schemaName: { type: 'string', nullable: true, fieldName: 'schema_name' },
    objectType: { type: 'string', fieldName: 'object_type' },
    objectName: { type: 'string', fieldName: 'object_name' },
    comment: { type: 'text', nullable: true },
    metadataJson: { type: 'text', nullable: true, fieldName: 'metadata_json' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const AiSchemaColumnSchema = new EntitySchema<AiSchemaColumn>({
  class: AiSchemaColumn,
  tableName: 'ai_schema_columns',
  indexes: [
    {
      properties: ['workspaceId', 'connectionId', 'schemaName', 'tableName'],
      name: 'idx_ai_schema_columns_table',
    },
  ],
  properties: {
    id: { type: 'string', primary: true },
    objectId: { type: 'string', fieldName: 'object_id' },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    schemaName: { type: 'string', nullable: true, fieldName: 'schema_name' },
    tableName: { type: 'string', fieldName: 'table_name' },
    columnName: { type: 'string', fieldName: 'column_name' },
    dataType: { type: 'string', nullable: true, fieldName: 'data_type' },
    nullable: { type: 'boolean', nullable: true },
    isPrimaryKey: { type: 'boolean', default: false, fieldName: 'is_primary_key' },
    defaultValue: { type: 'text', nullable: true, fieldName: 'default_value' },
    comment: { type: 'text', nullable: true },
    ordinalPosition: { type: 'number', nullable: true, fieldName: 'ordinal_position' },
  },
});

export const AiSchemaRelationshipSchema = new EntitySchema<AiSchemaRelationship>({
  class: AiSchemaRelationship,
  tableName: 'ai_schema_relationships',
  indexes: [
    {
      properties: ['workspaceId', 'connectionId', 'schemaName', 'tableName'],
      name: 'idx_ai_schema_relationships_table',
    },
  ],
  properties: {
    id: { type: 'string', primary: true },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    schemaName: { type: 'string', nullable: true, fieldName: 'schema_name' },
    tableName: { type: 'string', fieldName: 'table_name' },
    columnsJson: { type: 'text', fieldName: 'columns_json' },
    referencedSchema: { type: 'string', nullable: true, fieldName: 'referenced_schema' },
    referencedTable: { type: 'string', fieldName: 'referenced_table' },
    referencedColumnsJson: { type: 'text', fieldName: 'referenced_columns_json' },
  },
});

export const AiSchemaIndexSchema = new EntitySchema<AiSchemaIndex>({
  class: AiSchemaIndex,
  tableName: 'ai_schema_indexes',
  indexes: [
    {
      properties: ['workspaceId', 'connectionId', 'schemaName', 'tableName'],
      name: 'idx_ai_schema_indexes_table',
    },
  ],
  properties: {
    id: { type: 'string', primary: true },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    schemaName: { type: 'string', nullable: true, fieldName: 'schema_name' },
    tableName: { type: 'string', fieldName: 'table_name' },
    indexName: { type: 'string', fieldName: 'index_name' },
    columnsJson: { type: 'text', fieldName: 'columns_json' },
    unique: { type: 'boolean', default: false },
    comment: { type: 'text', nullable: true },
  },
});

export const AiRagDocumentSchema = new EntitySchema<AiRagDocument>({
  class: AiRagDocument,
  tableName: 'ai_rag_documents',
  indexes: [
    {
      properties: ['workspaceId', 'connectionId', 'schemaName'],
      name: 'idx_ai_rag_documents_scope',
    },
    { properties: ['contentHash'], name: 'idx_ai_rag_documents_hash' },
  ],
  properties: {
    id: { type: 'string', primary: true },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    databaseName: { type: 'string', nullable: true, fieldName: 'database_name' },
    schemaName: { type: 'string', nullable: true, fieldName: 'schema_name' },
    sourceType: { type: 'string', fieldName: 'source_type' },
    sourceId: { type: 'string', fieldName: 'source_id' },
    title: { type: 'string', nullable: true },
    content: { type: 'text' },
    contentHash: { type: 'string', fieldName: 'content_hash' },
    metadataJson: { type: 'text', nullable: true, fieldName: 'metadata_json' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', fieldName: 'updated_at' },
  },
});

export const AiRagEmbeddingSchema = new EntitySchema<AiRagEmbedding>({
  class: AiRagEmbedding,
  tableName: 'ai_rag_embeddings',
  indexes: [
    {
      properties: ['workspaceId', 'connectionId', 'schemaName'],
      name: 'idx_ai_rag_embeddings_scope',
    },
    { properties: ['contentHash'], name: 'idx_ai_rag_embeddings_hash' },
  ],
  properties: {
    id: { type: 'string', primary: true },
    documentId: { type: 'string', fieldName: 'document_id' },
    workspaceId: { type: 'string', fieldName: 'workspace_id' },
    connectionId: { type: 'string', fieldName: 'connection_id' },
    databaseName: { type: 'string', nullable: true, fieldName: 'database_name' },
    schemaName: { type: 'string', nullable: true, fieldName: 'schema_name' },
    sourceType: { type: 'string', fieldName: 'source_type' },
    contentHash: { type: 'string', fieldName: 'content_hash' },
    model: { type: 'string' },
    dimensions: { type: 'number' },
    embeddingVector: { type: 'vector(1536)', fieldName: 'embedding_vector' },
    createdAt: { type: 'datetime', fieldName: 'created_at' },
  },
});

export const entities = [
  LicenseSchema,
  ActivationSchema,
  PolarTransactionSchema,
  PolarLicenseDeliverySchema,
  AiUsageLogSchema,
  AiThreadSchema,
  AiMessageSchema,
  AiScopedMemorySchema,
  AiSavedSnippetSchema,
  AiToolProposalSchema,
  AiConnectionIndexSchema,
  AiSchemaObjectSchema,
  AiSchemaColumnSchema,
  AiSchemaRelationshipSchema,
  AiSchemaIndexSchema,
  AiRagDocumentSchema,
  AiRagEmbeddingSchema,
];
