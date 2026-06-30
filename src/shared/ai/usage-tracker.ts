import { AiUsageLog } from '@/db/entities';
import { getEm } from '@/db/orm';
import { createId } from '@/utils/license-key';
import type { AIIntent } from './intent-classifier';
import type { UserPlan } from '@/types';
import type { QuotaSnapshot } from './quota';

type UsageStatus = 'success' | 'error' | 'quota_exceeded' | 'provider_error' | 'cache_hit';

function startOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export class UsageTrackerService {
  async log(input: {
    userId: string;
    workspaceId?: string | null;
    connectionId?: string | null;
    provider?: string | null;
    model?: string | null;
    intent?: AIIntent | null;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
    latencyMs?: number;
    cacheHit?: boolean;
    status: UsageStatus;
    errorMessage?: string | null;
  }) {
    const em = getEm();
    const log = em.create(AiUsageLog, {
      id: createId(),
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      connectionId: input.connectionId ?? null,
      provider: input.provider ?? null,
      modelName: input.model ?? null,
      intent: input.intent ?? null,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      totalTokens: (input.inputTokens ?? 0) + (input.outputTokens ?? 0),
      estimatedCost: String(input.estimatedCost ?? 0),
      latencyMs: input.latencyMs ?? 0,
      cacheHit: input.cacheHit ?? false,
      status: input.status,
      errorMessage: input.errorMessage?.slice(0, 2_000) ?? null,
      createdAt: new Date(),
    });
    em.persist(log);
    await em.flush();
  }

  async snapshot(userId: string, plan: UserPlan): Promise<QuotaSnapshot> {
    const em = getEm();
    const [dailyRows, monthlyRows] = await Promise.all([
      em.find(AiUsageLog, { userId, createdAt: { $gte: startOfDay() } }),
      em.find(AiUsageLog, { userId, createdAt: { $gte: startOfMonth() } }),
    ]);

    const dailyTokens = (dailyRows as AiUsageLog[]).reduce(
      (sum: number, row: AiUsageLog) => sum + Number(row.totalTokens ?? 0),
      0,
    );
    const monthlyTokens = (monthlyRows as AiUsageLog[]).reduce(
      (sum: number, row: AiUsageLog) => sum + Number(row.totalTokens ?? 0),
      0,
    );

    return {
      plan,
      dailyRequests: dailyRows.length,
      dailyRequestsLimit: 0,
      monthlyRequests: monthlyRows.length,
      monthlyRequestsLimit: 0,
      dailyTokens,
      dailyTokensLimit: 0,
      monthlyTokens,
      monthlyTokensLimit: 0,
    };
  }

  async totalCost(userId: string) {
    const em = getEm();
    const rows = await em.find(AiUsageLog, { userId, createdAt: { $gte: startOfMonth() } });
    return (rows as AiUsageLog[]).reduce(
      (sum: number, row: AiUsageLog) => sum + Number(row.estimatedCost ?? 0),
      0,
    );
  }
}
