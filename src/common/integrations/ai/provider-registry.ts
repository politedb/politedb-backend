import { env } from '@/config/env';
import type { AIModelOption, AIProviderCatalogEntry, AIProviderName } from '@/types';

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseModelOptions(provider: AIProviderName, values: string[]): AIModelOption[] {
  return unique(values).map((value) => {
    const [rawLabel, rawApiModel] = value.includes('=') ? value.split(/=(.+)/, 2) : [value, value];
    const label = rawLabel.trim();
    const apiModel = (rawApiModel ?? rawLabel).trim();

    return {
      id: label,
      label,
      apiModel,
      provider,
    };
  });
}

function buildCatalog(): Record<AIProviderName, AIProviderCatalogEntry> {
  const openAiModels = parseModelOptions('openai', env.openAiModels);
  const deepSeekModels = parseModelOptions('deepseek', env.deepSeekModels);
  const anthropicModels = parseModelOptions('anthropic', env.anthropicModels);
  const googleModels = parseModelOptions('google', env.googleModels);
  const xaiModels = parseModelOptions('xai', env.xaiModels);
  const moonshotModels = parseModelOptions('moonshot', env.moonshotModels);
  const zhipuModels = parseModelOptions('zhipu', env.zhipuModels);

  return {
    openai: {
      name: 'openai',
      label: 'ChatGPT',
      configured: Boolean(env.openAiApiKey && env.openAiBaseUrl && openAiModels.length),
      models: openAiModels.map((item) => item.id),
      modelOptions: openAiModels,
      defaultModel: openAiModels[0]?.id ?? null,
    },
    deepseek: {
      name: 'deepseek',
      label: 'DeepSeek',
      configured: Boolean(env.deepSeekApiKey && env.deepSeekBaseUrl && deepSeekModels.length),
      models: deepSeekModels.map((item) => item.id),
      modelOptions: deepSeekModels,
      defaultModel: deepSeekModels[0]?.id ?? null,
    },
    anthropic: {
      name: 'anthropic',
      label: 'Anthropic',
      configured: Boolean(
        env.anthropicApiKey &&
        env.anthropicBaseUrl &&
        env.anthropicVersion &&
        anthropicModels.length,
      ),
      models: anthropicModels.map((item) => item.id),
      modelOptions: anthropicModels,
      defaultModel: anthropicModels[0]?.id ?? null,
    },
    google: {
      name: 'google',
      label: 'Google',
      configured: Boolean(env.googleApiKey && env.googleBaseUrl && googleModels.length),
      models: googleModels.map((item) => item.id),
      modelOptions: googleModels,
      defaultModel: googleModels[0]?.id ?? null,
    },
    xai: {
      name: 'xai',
      label: 'xAI',
      configured: Boolean(env.xaiApiKey && env.xaiBaseUrl && xaiModels.length),
      models: xaiModels.map((item) => item.id),
      modelOptions: xaiModels,
      defaultModel: xaiModels[0]?.id ?? null,
    },
    moonshot: {
      name: 'moonshot',
      label: 'Moonshot',
      configured: Boolean(env.moonshotApiKey && env.moonshotBaseUrl && moonshotModels.length),
      models: moonshotModels.map((item) => item.id),
      modelOptions: moonshotModels,
      defaultModel: moonshotModels[0]?.id ?? null,
    },
    zhipu: {
      name: 'zhipu',
      label: 'Zhipu',
      configured: Boolean(env.zhipuApiKey && env.zhipuBaseUrl && zhipuModels.length),
      models: zhipuModels.map((item) => item.id),
      modelOptions: zhipuModels,
      defaultModel: zhipuModels[0]?.id ?? null,
    },
  };
}

export function getAIProviderCatalog() {
  return buildCatalog();
}

export function listConfiguredProviders() {
  return Object.values(buildCatalog()).filter((provider) => provider.configured);
}

export function findProviderByModel(model: string) {
  const normalizedModel = model.trim();
  return (
    Object.values(buildCatalog()).find((provider) =>
      provider.modelOptions.some(
        (option) => option.id === normalizedModel || option.apiModel === normalizedModel,
      ),
    ) ?? null
  );
}

export function resolveModelOption(model: string) {
  const normalizedModel = model.trim();
  return (
    Object.values(buildCatalog())
      .flatMap((provider) => provider.modelOptions)
      .find((option) => option.id === normalizedModel || option.apiModel === normalizedModel) ??
    null
  );
}
