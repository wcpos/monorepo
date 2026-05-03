/**
 * Re-exports the canonical {@link TaxId} types from `@wcpos/database` so
 * client-side modules can import the structured tax-id contract from a single
 * place that does not depend on RxDB internals.
 */

export { TAX_ID_TYPES } from '@wcpos/database';
export type { TaxId, TaxIdType, TaxIdVerified } from '@wcpos/database';
