// TEST-HARNESS surface only — imported from '@wcpos/sync-core/testing', never the engine
// index, so the harness (a fake write server, etc.) is not pulled into a production bundle.
export * from './fakeWriteServer';
export * from './fakePullServer';
export * from './orderMoneyOracle';
export { InMemoryRecordMutationStorage } from './recordMutationQueue';
export { createFakeMutationCollection } from './fakeMutationCollection';
