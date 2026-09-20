// Format report values for display without modifying recorded data.
import type { SuiteSummary, ViewerSuite } from '../../shared/types.js'
export const json = (value: unknown) =>
  value === undefined ? 'Not recorded' : JSON.stringify(value, null, 2)
export const duration = (ms: number) => `${(ms / 1000).toFixed(1)}s`
export const formatDate = (value?: string) =>
  value && !isNaN(Date.parse(value))
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Date not recorded'
export const policyLabel = (suite: Pick<ViewerSuite, 'policy'>) =>
  suite.policy === 'baseline'
    ? 'Offline · baseline'
    : suite.policy === 'reference'
      ? 'Offline · reference routes'
      : suite.policy === 'jev'
        ? 'Jev policy'
        : 'Policy not recorded'
export const usageLabel = (suite: ViewerSuite | SuiteSummary) =>
  suite.usage
    ? `${suite.usage.requests} API requests · ${(suite.usage.inputTokens + suite.usage.outputTokens).toLocaleString()} reported tokens · ${suite.usage.chargedTokens.toLocaleString()} budget-charged`
    : 'API usage not recorded'
