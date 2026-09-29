import {
	browserOrderSchedulerDescriptorLimit,
	normalizeOrderBrowseWindowLimit,
	ORDER_BROWSE_RANGED_COMPLETE_MAX_RECORDS,
} from './order-browser-scheduler-descriptor';

import type { BrowseWindowGrammar } from './browse-window-grammar';
import type { RefundBrowseDimensions } from '../require-plane';

export type RefundBrowserSchedulerDescriptor = {
	queryKey: string;
	afterSeconds: number;
	beforeSeconds: number;
	limit: number;
	complete: boolean;
};

export function refundBrowserQueryKey(dims: RefundBrowseDimensions): string {
	if (
		![dims.after, dims.before].every((bound) => Number.isSafeInteger(bound) && bound >= 0) ||
		dims.after > dims.before
	) {
		throw new TypeError('Refund browse requires valid date bounds');
	}
	const limit = dims.limit === 'all' ? 'all' : normalizeOrderBrowseWindowLimit(dims.limit ?? 10);
	return `refunds:browser:after=${dims.after}:before=${dims.before}:limit=${limit}`;
}

export function parseRefundBrowserSchedulerDescriptor(
	queryKey: string
): RefundBrowserSchedulerDescriptor | null {
	const match = /^refunds:browser:after=(\d+):before=(\d+):limit=(\d+|all)$/.exec(queryKey);
	if (!match) return null;
	const [, after, before, limitText] = match;
	const afterSeconds = Number(after),
		beforeSeconds = Number(before);
	const complete = limitText === 'all';
	const limit = complete
		? ORDER_BROWSE_RANGED_COMPLETE_MAX_RECORDS
		: browserOrderSchedulerDescriptorLimit(limitText);
	if (
		limit === null ||
		!Number.isSafeInteger(afterSeconds) ||
		!Number.isSafeInteger(beforeSeconds) ||
		afterSeconds > beforeSeconds
	)
		return null;
	return {
		queryKey,
		afterSeconds,
		beforeSeconds,
		limit,
		complete,
	};
}

export const REFUND_BROWSE_WINDOW_GRAMMAR: BrowseWindowGrammar<RefundBrowserSchedulerDescriptor> = {
	collection: 'refunds',
	encode: (fields) => fields.queryKey,
	parse: parseRefundBrowserSchedulerDescriptor,
	limitOf: (fields) => (fields.complete ? 'all' : fields.limit),
	requirementId: (fields) => fields.queryKey.replaceAll(':', '.'),
	viewKey: (fields) => fields.queryKey.replace(/:limit=[^:]+$/, ':limit='),
	schemaCeilingLabel: 'Browser refund scheduler descriptor',
	measureTaskIdAgainstCeiling: false,
};
