// MIGRATION SHIM: moved to @wcpos/order-math; re-exported here until the PR 2 cutover.
export {
	roundHalfUp,
	roundHalfDown,
	getRoundingPrecision,
	addNumberPrecision,
	removeNumberPrecision,
	roundTaxTotal,
	roundDiscount,
} from '@wcpos/order-math/internal';
