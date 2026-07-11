// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { schedulerScenarios } from './scheduler-scenarios';

describe('schedulerScenarios', () => {
  it('defines a constrained POS startup scenario with greedy, targeted, initial, and background requirements', () => {
    const scenario = schedulerScenarios.find((item) => item.id === 'pos-startup-constrained-host');

    expect(scenario).toBeDefined();
    // Order-free membership: the canonical POS startup scenario must keep all
    // of its load-bearing requirements; additions and reorders stay free.
    expect(scenario?.requirements.map((requirement) => requirement.id)).toEqual(expect.arrayContaining([
      'taxRates.all',
      'customers.default',
      'orders.deepLink',
      'products.initialAlphabetical',
      'orders.openRecent',
      'products.backgroundPoll',
    ]));
    expect(scenario?.requirements.find((requirement) => requirement.id === 'taxRates.all')?.policy.mode).toBe('greedy');
    expect(scenario?.requirements.find((requirement) => requirement.id === 'products.backgroundPoll')?.policy.priority).toBeLessThan(
      scenario?.requirements.find((requirement) => requirement.id === 'orders.deepLink')?.policy.priority ?? 0,
    );
  });
});
