import { env } from '@/config/env';
import type { UserPlan } from '@/types';
import { listConfiguredProviders } from '@/common/integrations/ai/provider-registry';

export const DEFAULT_AI_QUOTAS = {
  FREE: {
    dailyRequests: env.aiFreeDailyRequests,
    monthlyRequests: 300,
    dailyTokens: 50_000,
    monthlyTokens: 500_000,
    maxContextTokens: 4_000,
    maxOutputTokens: 800,
  },
  ULTIMATE: {
    dailyRequests: env.aiUltimateDailyRequests,
    monthlyRequests: 50_000,
    dailyTokens: 10_000_000,
    monthlyTokens: 200_000_000,
    maxContextTokens: 128_000,
    maxOutputTokens: 8_000,
  },
} as const;

export type QuotaSnapshot = {
  plan: UserPlan;
  dailyRequests: number;
  dailyRequestsLimit: number;
  monthlyRequests: number;
  monthlyRequestsLimit: number;
  dailyTokens: number;
  dailyTokensLimit: number;
  monthlyTokens: number;
  monthlyTokensLimit: number;
};

export class AIQuotaExceededError extends Error {
  constructor() {
    super('AI_QUOTA_EXCEEDED');
  }
}

export class QuotaService {
  async assertAllowed(args: { plan: UserPlan; usage: QuotaSnapshot }) {
    const quota = DEFAULT_AI_QUOTAS[args.plan];
    if (!listConfiguredProviders().length) {
      throw new Error('AI_PROVIDER_NOT_CONFIGURED');
    }
    if (
      args.usage.dailyRequests >= quota.dailyRequests ||
      args.usage.monthlyRequests >= quota.monthlyRequests ||
      args.usage.dailyTokens >= quota.dailyTokens ||
      args.usage.monthlyTokens >= quota.monthlyTokens
    ) {
      throw new AIQuotaExceededError();
    }
  }

  limitsFor(plan: UserPlan) {
    return DEFAULT_AI_QUOTAS[plan];
  }
}
