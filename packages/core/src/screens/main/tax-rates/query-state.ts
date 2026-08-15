import type { QueryStateOf } from '../../../query';

/** Tax rates are a complete Tier-0 resident set, not a paginated browse window. */
export const TAX_RATES_ALL_RESULTS_LIMIT = Number.MAX_SAFE_INTEGER;

export const TAX_RATES_INITIAL_SORT = {
	field: 'id',
	direction: 'asc',
} as const satisfies QueryStateOf<'tax-rates'>['sort'];
