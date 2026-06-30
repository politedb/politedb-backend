import { Migration } from '@mikro-orm/migrations';

export class Migration20260630045715_init_schema extends Migration {
  override async up(): Promise<void> {
    const embeddingVectorType =
      process.env.AI_ENABLE_SEMANTIC_CACHE === 'true' ? 'vector(1536)' : 'text';

    if (process.env.AI_ENABLE_SEMANTIC_CACHE === 'true') {
      this.addSql(`create extension if not exists vector;`);
    }

    this.addSql(
      `create table "ai_connection_indexes" ("id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "database_name" varchar(255) null, "schema_name" varchar(255) null, "engine" varchar(255) null, "enabled" boolean not null default false, "status" varchar(255) not null default 'disabled', "last_indexed_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "ai_connection_indexes_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_connection_indexes_scope" on "ai_connection_indexes" ("workspace_id", "connection_id");`,
    );
    this.addSql(
      `alter table "ai_connection_indexes" add constraint "uniq_ai_connection_indexes_scope" unique ("workspace_id", "connection_id", "database_name", "schema_name");`,
    );

    this.addSql(
      `create table "ai_messages" ("id" varchar(255) not null, "thread_id" varchar(255) not null, "role" varchar(255) not null, "intent" varchar(255) null, "content" text not null, "artifacts_json" text null, "tool_proposals_json" text null, "citations_json" text null, "created_at" timestamptz not null, constraint "ai_messages_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_messages_thread_created_at" on "ai_messages" ("thread_id", "created_at");`,
    );

    this.addSql(
      `create table "ai_rag_documents" ("id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "database_name" varchar(255) null, "schema_name" varchar(255) null, "source_type" varchar(255) not null, "source_id" varchar(255) not null, "title" varchar(255) null, "content" text not null, "content_hash" varchar(255) not null, "metadata_json" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "ai_rag_documents_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_rag_documents_scope" on "ai_rag_documents" ("workspace_id", "connection_id", "schema_name");`,
    );
    this.addSql(`create index "idx_ai_rag_documents_hash" on "ai_rag_documents" ("content_hash");`);

    this.addSql(
      `create table "ai_rag_embeddings" ("id" varchar(255) not null, "document_id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "database_name" varchar(255) null, "schema_name" varchar(255) null, "source_type" varchar(255) not null, "content_hash" varchar(255) not null, "model" varchar(255) not null, "dimensions" int not null, "embedding_vector" ${embeddingVectorType} not null, "created_at" timestamptz not null, constraint "ai_rag_embeddings_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_rag_embeddings_scope" on "ai_rag_embeddings" ("workspace_id", "connection_id", "schema_name");`,
    );
    this.addSql(
      `create index "idx_ai_rag_embeddings_hash" on "ai_rag_embeddings" ("content_hash");`,
    );

    this.addSql(
      `create table "ai_saved_snippets" ("id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "thread_id" varchar(255) null, "title" varchar(255) not null, "sql" text not null, "dialect" varchar(255) null, "source_intent" varchar(255) null, "provenance_message_id" varchar(255) null, "created_by_user_id" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "ai_saved_snippets_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_saved_snippets_scope_updated_at" on "ai_saved_snippets" ("workspace_id", "connection_id", "updated_at");`,
    );
    this.addSql(
      `create index "idx_ai_saved_snippets_thread" on "ai_saved_snippets" ("thread_id");`,
    );

    this.addSql(
      `create table "ai_schema_columns" ("id" varchar(255) not null, "object_id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "schema_name" varchar(255) null, "table_name" varchar(255) not null, "column_name" varchar(255) not null, "data_type" varchar(255) null, "nullable" boolean null, "is_primary_key" boolean not null default false, "default_value" text null, "comment" text null, "ordinal_position" int null, constraint "ai_schema_columns_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_schema_columns_table" on "ai_schema_columns" ("workspace_id", "connection_id", "schema_name", "table_name");`,
    );

    this.addSql(
      `create table "ai_schema_indexes" ("id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "schema_name" varchar(255) null, "table_name" varchar(255) not null, "index_name" varchar(255) not null, "columns_json" text not null, "unique" boolean not null default false, "comment" text null, constraint "ai_schema_indexes_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_schema_indexes_table" on "ai_schema_indexes" ("workspace_id", "connection_id", "schema_name", "table_name");`,
    );

    this.addSql(
      `create table "ai_schema_objects" ("id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "database_name" varchar(255) null, "schema_name" varchar(255) null, "object_type" varchar(255) not null, "object_name" varchar(255) not null, "comment" text null, "metadata_json" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "ai_schema_objects_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_schema_objects_scope" on "ai_schema_objects" ("workspace_id", "connection_id", "schema_name");`,
    );
    this.addSql(
      `alter table "ai_schema_objects" add constraint "uniq_ai_schema_objects_name" unique ("workspace_id", "connection_id", "database_name", "schema_name", "object_type", "object_name");`,
    );

    this.addSql(
      `create table "ai_schema_relationships" ("id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "schema_name" varchar(255) null, "table_name" varchar(255) not null, "columns_json" text not null, "referenced_schema" varchar(255) null, "referenced_table" varchar(255) not null, "referenced_columns_json" text not null, constraint "ai_schema_relationships_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_schema_relationships_table" on "ai_schema_relationships" ("workspace_id", "connection_id", "schema_name", "table_name");`,
    );

    this.addSql(
      `create table "ai_scoped_memories" ("id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "summary" text not null default '', "facts_json" text not null, "last_refreshed_at" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "ai_scoped_memories_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_scoped_memories_scope" on "ai_scoped_memories" ("workspace_id", "connection_id");`,
    );
    this.addSql(
      `alter table "ai_scoped_memories" add constraint "uq_ai_scoped_memories_scope" unique ("workspace_id", "connection_id");`,
    );

    this.addSql(
      `create table "ai_threads" ("id" varchar(255) not null, "workspace_id" varchar(255) not null, "connection_id" varchar(255) not null, "title" varchar(255) null, "provider" varchar(255) null, "model_name" varchar(255) null, "status" varchar(255) not null default 'active', "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "ai_threads_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_threads_scope_updated_at" on "ai_threads" ("workspace_id", "connection_id", "updated_at");`,
    );

    this.addSql(
      `create table "ai_tool_proposals" ("id" varchar(255) not null, "thread_id" varchar(255) not null, "message_id" varchar(255) not null, "tool_name" varchar(255) not null, "status" varchar(255) not null default 'proposed', "arguments_json" text not null, "result_json" text null, "confirmation_text" text not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "ai_tool_proposals_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_tool_proposals_thread_created_at" on "ai_tool_proposals" ("thread_id", "created_at");`,
    );
    this.addSql(
      `create index "idx_ai_tool_proposals_status_expires_at" on "ai_tool_proposals" ("status", "expires_at");`,
    );

    this.addSql(
      `create table "ai_usage_logs" ("id" varchar(255) not null, "user_id" varchar(255) not null, "workspace_id" varchar(255) null, "connection_id" varchar(255) null, "provider" varchar(255) null, "model_name" varchar(255) null, "intent" varchar(255) null, "input_tokens" int not null default 0, "output_tokens" int not null default 0, "total_tokens" int not null default 0, "estimated_cost" numeric(12,8) not null default '0', "latency_ms" int not null default 0, "cache_hit" boolean not null default false, "status" varchar(255) not null default 'success', "error_message" text null, "created_at" timestamptz not null, constraint "ai_usage_logs_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index "idx_ai_usage_logs_user_created_at" on "ai_usage_logs" ("user_id", "created_at");`,
    );
    this.addSql(
      `create index "idx_ai_usage_logs_workspace_created_at" on "ai_usage_logs" ("workspace_id", "created_at");`,
    );

    this.addSql(
      `create table "licenses" ("id" varchar(255) not null, "product" varchar(255) not null, "license_key" varchar(255) not null, "plan_name" varchar(255) not null, "customer_email" varchar(255) not null, "instance_name" varchar(255) null, "seats_allowed" int not null default 1, "expires_at" timestamptz null, "status" varchar(255) not null default 'active', "notes" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "licenses_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "licenses" add constraint "licenses_license_key_unique" unique ("license_key");`,
    );

    this.addSql(
      `create table "activations" ("id" varchar(255) not null, "license_id" varchar(255) not null, "activation_token" varchar(255) not null, "device_id" varchar(255) not null, "device_name" varchar(255) not null, "platform" varchar(255) not null, "arch" varchar(255) not null, "status" varchar(255) not null default 'active', "activated_at" timestamptz not null, "last_validated_at" timestamptz not null, "deactivated_at" timestamptz null, constraint "activations_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "activations" add constraint "activations_activation_token_unique" unique ("activation_token");`,
    );
    this.addSql(`create index "idx_activations_token" on "activations" ("activation_token");`);
    this.addSql(
      `alter table "activations" add constraint "idx_activations_license_device" unique ("license_id", "device_id");`,
    );

    this.addSql(
      `create table "polar_license_key_deliveries" ("grant_id" varchar(255) not null, "polar_order_id" varchar(255) null, "polar_benefit_id" varchar(255) null, "polar_license_key_id" varchar(255) null, "customer_email" varchar(255) not null, "email_sent_at" timestamptz null, "email_error" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "polar_license_key_deliveries_pkey" primary key ("grant_id"));`,
    );
    this.addSql(
      `create index "idx_polar_license_key_deliveries_order" on "polar_license_key_deliveries" ("polar_order_id");`,
    );

    this.addSql(
      `create table "polar_transactions" ("id" varchar(255) not null, "polar_order_id" varchar(255) not null, "polar_checkout_id" varchar(255) null, "polar_subscription_id" varchar(255) null, "polar_customer_id" varchar(255) not null, "polar_product_id" varchar(255) null, "external_customer_id" varchar(255) null, "license_id" varchar(255) not null, "event_type" varchar(255) not null, "status" varchar(255) not null default 'paid', "license_email_sent_at" timestamptz null, "license_email_error" varchar(255) null, "metadata_json" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "polar_transactions_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "polar_transactions" add constraint "polar_transactions_polar_order_id_unique" unique ("polar_order_id");`,
    );
    this.addSql(
      `create index "idx_polar_transactions_subscription" on "polar_transactions" ("polar_subscription_id");`,
    );
    this.addSql(
      `create index "idx_polar_transactions_license" on "polar_transactions" ("license_id");`,
    );

    this.addSql(
      `alter table "activations" add constraint "activations_license_id_foreign" foreign key ("license_id") references "licenses" ("id") on update cascade on delete cascade;`,
    );

    this.addSql(
      `alter table "polar_transactions" add constraint "polar_transactions_license_id_foreign" foreign key ("license_id") references "licenses" ("id") on update cascade on delete cascade;`,
    );
  }
}
