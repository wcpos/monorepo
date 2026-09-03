import { getLogger } from '@wcpos/utils/logger';

const logger = getLogger(['wcpos', 'customer-display', 'snapshot']);
// The display contract caps each UTF-8 JSON message at 200 KiB.
export const MAX_SNAPSHOT_BYTES = 200 * 1024;
// Notes are useful but bounded first so totals and payment data are never displaced.
const MAX_CUSTOMER_NOTE_BYTES = 1024;
// Eight metadata entries preserve common modifiers without letting extensions dominate a frame.
const MAX_LINE_META_ENTRIES = 8;

type SnapshotContainer = {
	payload?: {
		i18n?: unknown;
		presentation_hints?: unknown;
		order?: {
			order?: { customer_note?: unknown };
			lines?: unknown[];
			lines_truncated?: boolean;
		};
	};
};

const byteLength = (text: string): number => new TextEncoder().encode(text).byteLength;

function truncateUtf8(text: string, limit: number): string {
	if (byteLength(text) <= limit) return text;
	let result = '';
	for (const character of text) {
		if (byteLength(result + character) > limit) break;
		result += character;
	}
	return result;
}

export function serialiseSnapshot(value: object): string {
	let serialised = JSON.stringify(value);
	if (byteLength(serialised) <= MAX_SNAPSHOT_BYTES) return serialised;

	const copy = JSON.parse(serialised) as SnapshotContainer;
	const payload = copy.payload;
	const order = copy.payload?.order;
	if (!order) {
		if (!payload) return serialised;
		payload.i18n = {};
		serialised = JSON.stringify(copy);
		if (byteLength(serialised) <= MAX_SNAPSHOT_BYTES) return serialised;
		payload.presentation_hints = {};
		serialised = JSON.stringify(copy);
		if (byteLength(serialised) > MAX_SNAPSHOT_BYTES) {
			logger.warn('Customer display message exceeds the 200 KiB cap after truncation', {
				context: { bytes: byteLength(serialised) },
			});
		}
		return serialised;
	}
	if (typeof order.order?.customer_note === 'string') {
		order.order.customer_note = truncateUtf8(order.order.customer_note, MAX_CUSTOMER_NOTE_BYTES);
	}
	serialised = JSON.stringify(copy);
	if (byteLength(serialised) <= MAX_SNAPSHOT_BYTES) return serialised;
	for (const line of order.lines ?? []) {
		if (line && typeof line === 'object' && Array.isArray((line as { meta?: unknown }).meta)) {
			(line as { meta: unknown[] }).meta = (line as { meta: unknown[] }).meta.slice(
				0,
				MAX_LINE_META_ENTRIES
			);
		}
	}
	serialised = JSON.stringify(copy);
	while (byteLength(serialised) > MAX_SNAPSHOT_BYTES && order.lines?.length) {
		order.lines.shift();
		order.lines_truncated = true;
		serialised = JSON.stringify(copy);
	}
	if (byteLength(serialised) > MAX_SNAPSHOT_BYTES) {
		order.lines = [];
		order.lines_truncated = true;
		serialised = JSON.stringify(copy);
	}
	if (byteLength(serialised) > MAX_SNAPSHOT_BYTES) {
		logger.warn('Customer display message exceeds the 200 KiB cap after truncation', {
			context: { bytes: byteLength(serialised) },
		});
	}
	return serialised;
}
