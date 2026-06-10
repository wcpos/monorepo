/**
 * WORKSPACE-INTERNAL. Not public API, no semver guarantees.
 * Consumers: packages/core re-export shims + parity bisecting tests.
 * Do NOT add new consumers — use the public index instead.
 */
export * from './money/precision';
export * from './money/calculate-taxes';
export * from './money/sum-taxes';
export * from './lines/pos-data';
