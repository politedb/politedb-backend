import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

function parseList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseModelSpecs(value: string | undefined, fallback: string[]) {
  return parseList(value).length ? parseList(value) : fallback;
}

const portValue = Number(process.env.PORT ?? 4000);
const polarMode = (process.env.POLAR_SERVER ?? 'sandbox').trim();
const aiProvider = (process.env.AI_DEFAULT_PROVIDER ?? 'openai').trim();
const polarProductIds = parseList(process.env.POLAR_PRODUCT_IDS);
const openAiModels = Array.from(
  new Set(
    [
      process.env.AI_DEFAULT_FREE_MODEL ?? 'gpt-4.1-nano',
      process.env.AI_DEFAULT_ULTIMATE_MODEL ?? 'gpt-4.1',
      ...parseList(process.env.AI_OPENAI_MODELS),
    ].filter(Boolean),
  ),
);
const deepSeekModels = Array.from(
  new Set(
    parseList(process.env.AI_DEEPSEEK_MODELS).length
      ? parseList(process.env.AI_DEEPSEEK_MODELS)
      : process.env.DEEPSEEK_API_KEY
        ? ['deepseek-v4-pro']
        : [],
  ),
);
const anthropicModels = Array.from(
  new Set(
    parseModelSpecs(process.env.AI_ANTHROPIC_MODELS, [
      'Sonnet 4.6=claude-sonnet-4-6',
      'Opus 4.7=claude-opus-4-7',
      'Opus 4.8=claude-opus-4-8',
    ]),
  ),
);
const googleModels = Array.from(
  new Set(parseModelSpecs(process.env.AI_GOOGLE_MODELS, ['Gemini 3.1 Pro=gemini-3.1-pro'])),
);
const xaiModels = Array.from(
  new Set(
    parseModelSpecs(process.env.AI_XAI_MODELS, [
      'Grok 4.3=grok-4.3',
      'Grok Build 0.1=grok-build-0.1',
    ]),
  ),
);
const moonshotModels = Array.from(
  new Set(parseModelSpecs(process.env.AI_MOONSHOT_MODELS, ['Kimi K2.6=kimi-k2.6'])),
);
const zhipuModels = Array.from(
  new Set(parseModelSpecs(process.env.AI_ZHIPU_MODELS, ['GLM 5.2=glm-5.2'])),
);

export const env = {
  port: Number.isFinite(portValue) ? portValue : 4000,
  adminApiKey: (process.env.LICENSE_API_KEY ?? 'change-me').trim(),
  defaultProduct: (process.env.DEFAULT_PRODUCT ?? 'politedb').trim(),
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/license-key.db'),
  databaseUrl: (process.env.DATABASE_URL ?? '').trim(),
  polarAccessToken: (process.env.POLAR_ACCESS_TOKEN ?? '').trim(),
  polarOrganizationId: (process.env.POLAR_ORGANIZATION_ID ?? '').trim(),
  polarWebhookSecret: (process.env.POLAR_WEBHOOK_SECRET ?? '').trim(),
  polarServer: (polarMode === 'production' ? 'production' : 'sandbox') as 'production' | 'sandbox',
  polarSuccessUrl: (process.env.POLAR_SUCCESS_URL ?? '').trim() || null,
  polarReturnUrl: (process.env.POLAR_RETURN_URL ?? '').trim() || null,
  polarProductIds,
  smtpHost: (process.env.SMTP_HOST ?? '').trim() || null,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: (process.env.SMTP_SECURE ?? 'false').trim() === 'true',
  smtpUser: (process.env.SMTP_USER ?? '').trim() || null,
  smtpPass: (process.env.SMTP_PASS ?? '').trim() || null,
  smtpFrom: (process.env.SMTP_FROM ?? '').trim() || null,
  openAiApiKey: (process.env.OPENAI_API_KEY ?? '').trim(),
  openAiBaseUrl: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1')
    .trim()
    .replace(/\/+$/, ''),
  openAiModels,
  deepSeekApiKey: (process.env.DEEPSEEK_API_KEY ?? '').trim(),
  deepSeekBaseUrl: (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com')
    .trim()
    .replace(/\/+$/, ''),
  deepSeekModels,
  anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? '').trim(),
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com')
    .trim()
    .replace(/\/+$/, ''),
  anthropicVersion: (process.env.ANTHROPIC_VERSION ?? '2023-06-01').trim(),
  anthropicModels,
  googleApiKey: (process.env.GOOGLE_API_KEY ?? '').trim(),
  googleBaseUrl: (
    process.env.GOOGLE_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai'
  )
    .trim()
    .replace(/\/+$/, ''),
  googleModels,
  xaiApiKey: (process.env.XAI_API_KEY ?? '').trim(),
  xaiBaseUrl: (process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1').trim().replace(/\/+$/, ''),
  xaiModels,
  moonshotApiKey: (process.env.MOONSHOT_API_KEY ?? '').trim(),
  moonshotBaseUrl: (process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1')
    .trim()
    .replace(/\/+$/, ''),
  moonshotModels,
  zhipuApiKey: (process.env.ZHIPU_API_KEY ?? '').trim(),
  zhipuBaseUrl: (process.env.ZHIPU_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4')
    .trim()
    .replace(/\/+$/, ''),
  zhipuModels,
  aiDefaultProvider: (aiProvider === 'deepseek'
    ? 'deepseek'
    : aiProvider === 'anthropic'
      ? 'anthropic'
      : aiProvider === 'google'
        ? 'google'
        : aiProvider === 'xai'
          ? 'xai'
          : aiProvider === 'moonshot'
            ? 'moonshot'
            : aiProvider === 'zhipu'
              ? 'zhipu'
              : 'openai') as
    'openai' | 'deepseek' | 'anthropic' | 'google' | 'xai' | 'moonshot' | 'zhipu',
  aiDefaultFreeModel: (process.env.AI_DEFAULT_FREE_MODEL ?? 'gpt-4.1-nano').trim(),
  aiDefaultUltimateModel: (process.env.AI_DEFAULT_ULTIMATE_MODEL ?? 'gpt-4.1').trim(),
  aiEmbeddingModel: (process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small').trim(),
  aiEmbeddingDimensions: Number(process.env.AI_EMBEDDING_DIMENSIONS ?? 1536),
  aiEnableCache: (process.env.AI_ENABLE_CACHE ?? 'true').trim() === 'true',
  aiEnableSemanticCache: (process.env.AI_ENABLE_SEMANTIC_CACHE ?? 'false').trim() === 'true',
  aiFreeDailyRequests: Number(process.env.AI_FREE_DAILY_REQUESTS ?? 20),
  aiUltimateDailyRequests: Number(process.env.AI_ULTIMATE_DAILY_REQUESTS ?? 2000),
};

if (!env.adminApiKey) {
  throw new Error('LICENSE_API_KEY is required');
}
