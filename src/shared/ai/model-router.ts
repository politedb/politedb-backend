import { env } from '@/config/env';
import { AIIntent } from './intent-classifier';
import type { ModelRouteInput, ModelRouteResult } from '@/types';
import {
  findProviderByModel,
  getAIProviderCatalog,
  listConfiguredProviders,
  resolveModelOption,
} from '@/common/integrations/ai/provider-registry';

const CONTEXT_BY_PLAN = {
  FREE: 4_000,
  ULTIMATE: 128_000,
} as const;

const OUTPUT_BY_PLAN = {
  FREE: 800,
  ULTIMATE: 8_000,
} as const;

export class ModelRouterService {
  route(input: ModelRouteInput): ModelRouteResult {
    const catalog = getAIProviderCatalog();
    const configuredProviders = listConfiguredProviders();
    if (!configuredProviders.length) {
      throw new Error('AI_PROVIDER_NOT_CONFIGURED');
    }

    if (input.requestedProvider || input.requestedModel) {
      const providerName =
        input.requestedProvider ??
        (input.requestedModel ? findProviderByModel(input.requestedModel)?.name : null);
      if (!providerName) {
        throw new Error('AI_MODEL_NOT_SUPPORTED');
      }

      const provider = catalog[providerName];
      if (!provider.configured) {
        throw new Error('AI_PROVIDER_NOT_CONFIGURED');
      }

      const selectedOption = input.requestedModel
        ? resolveModelOption(input.requestedModel)
        : (provider.modelOptions[0] ?? null);
      if (!selectedOption || selectedOption.provider !== provider.name) {
        throw new Error('AI_MODEL_NOT_SUPPORTED');
      }

      return {
        provider: provider.name,
        model: selectedOption.apiModel,
        maxContextTokens: CONTEXT_BY_PLAN[input.userPlan],
        maxOutputTokens: OUTPUT_BY_PLAN[input.userPlan],
      };
    }

    const preferredModel =
      input.userPlan === 'ULTIMATE' ? env.aiDefaultUltimateModel : env.aiDefaultFreeModel;
    const preferredProvider = preferredModel ? findProviderByModel(preferredModel) : null;
    const configuredDefaultProvider = configuredProviders.find(
      (provider) => provider.name === env.aiDefaultProvider,
    );
    const resolvedProvider = preferredProvider?.configured
      ? preferredProvider
      : (configuredDefaultProvider ?? configuredProviders[0]);
    const resolvedOption =
      preferredProvider?.configured &&
      preferredModel &&
      preferredProvider.modelOptions.some(
        (option) => option.id === preferredModel || option.apiModel === preferredModel,
      )
        ? resolveModelOption(preferredModel)
        : (resolvedProvider.modelOptions[0] ?? null);

    if (!resolvedOption) {
      throw new Error('AI_MODEL_NOT_SUPPORTED');
    }

    return {
      provider: resolvedProvider.name,
      model: this.adjustForIntent(resolvedOption.apiModel, input.intent),
      maxContextTokens: CONTEXT_BY_PLAN[input.userPlan],
      maxOutputTokens: OUTPUT_BY_PLAN[input.userPlan],
    };
  }

  private adjustForIntent(model: string, _intent: AIIntent) {
    return model;
  }
}
