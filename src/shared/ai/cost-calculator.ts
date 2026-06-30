const MODEL_PRICES: Record<string, { inputPricePer1M: number; outputPricePer1M: number }> = {
  'gpt-4.1-nano': { inputPricePer1M: 0.1, outputPricePer1M: 0.4 },
  'gpt-4.1-mini': { inputPricePer1M: 0.4, outputPricePer1M: 1.6 },
  'gpt-4.1': { inputPricePer1M: 2, outputPricePer1M: 8 },
  'gpt-5.2': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'gpt-5.4': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'gpt-5.5': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'deepseek-v4-pro': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'claude-sonnet-4-6': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'claude-opus-4-7': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'claude-opus-4-8': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'gemini-3.1-pro': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'grok-4.3': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'grok-build-0.1': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'kimi-k2.6': { inputPricePer1M: 0, outputPricePer1M: 0 },
  'glm-5.2': { inputPricePer1M: 0, outputPricePer1M: 0 },
};

export function calculateCost(args: { model: string; inputTokens: number; outputTokens: number }) {
  const price = MODEL_PRICES[args.model] ?? { inputPricePer1M: 0, outputPricePer1M: 0 };
  return (
    (args.inputTokens / 1_000_000) * price.inputPricePer1M +
    (args.outputTokens / 1_000_000) * price.outputPricePer1M
  );
}
