/** Moves to WooCommerce trash the orders and products made after the seed's baseline that the seed did not make. Logs counts only. */
import { SeedSafetyError } from './apply.mjs';
import { StoreError } from './client.mjs';
import { SEED_META_KEY } from './targets.mjs';

const WC = '/wp-json/wc/v3';

/** A record younger than this is left for the next night, so a probe or a capture still running keeps its order. */
export const TIDY_GRACE_MS = 60 * 60 * 1000;
/** More rows to trash than this on a nightly run means something is wrong, not that the store was busy. */
export const TIDY_NIGHTLY_CAP = 500;
/** The first run also clears the month window, so it may move more; past this, something is wrong. */
export const TIDY_FIRST_RUN_CAP = 3000;
/** Fewer seed orders found than this means the listing is wrong, so nothing it says can be trusted. */
export const TIDY_MIN_SEED_ORDERS = 100;

/** `date_created_gmt` carries no zone; it is GMT. Anything else is a safety stop, never "not the seed's". */
function createdAt(row, kind) {
	const value = row?.date_created_gmt;
	const ms =
		typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
			? Date.parse(`${value}Z`)
			: NaN;
	if (Number.isNaN(ms) || !Number.isInteger(row.id) || row.id <= 0)
		throw new SeedSafetyError(`a ${kind} row has no usable id or date_created_gmt`);
	return ms;
}

const COUNT_NAMES = ['listed', 'inGrace', 'alreadyTrash', 'toTrash', 'trashed', 'alreadyGone'];
const emptyCounts = () => Object.fromEntries(COUNT_NAMES.map((name) => [name, 0]));

/** Sorts rows into the counts; returns the records to trash. Makes no request. */
function select(rows, kind, counts, { cutoff, graceEdge }) {
	const ids = [];
	for (const row of rows) {
		const at = createdAt(row, kind);
		counts.listed += 1;
		if (kind === 'order' && row.meta_data.some((m) => m?.key === SEED_META_KEY)) {
			counts.seed += 1;
		} else if (at < cutoff) {
			continue;
		} else if (row.status === 'trash') {
			counts.alreadyTrash += 1;
		} else if (at > graceEdge) {
			counts.inGrace += 1;
		} else {
			counts.toTrash += 1;
			ids.push({ type: kind, id: row.id });
		}
	}
	return ids;
}

export async function runTidy(client, target, { write, firstRun, now, record, log }) {
	const baseline = target.tidyBaselineGmt === null ? NaN : Date.parse(target.tidyBaselineGmt);
	if (Number.isNaN(baseline))
		throw new SeedSafetyError('this target has no tidy baseline; the seed has not been applied');
	const windowStart = Date.parse(`${target.windowStart}T00:00:00Z`);
	const listing = { dates_are_gmt: 'true', status: 'any' };
	const orders = await client.getAll(`${WC}/orders`, {
		...listing,
		after: `${target.windowStart}T00:00:00`,
		_fields: 'id,status,date_created_gmt,meta_data',
	});
	const products = await client.getAll(`${WC}/products`, {
		...listing,
		after: new Date(baseline).toISOString().slice(0, 19),
		_fields: 'id,status,date_created_gmt',
	});
	if (orders.some((row) => !Array.isArray(row?.meta_data)))
		throw new SeedSafetyError('an order row has no meta_data list');

	const counts = { orders: { ...emptyCounts(), seed: 0 }, products: emptyCounts() };
	const graceEdge = now.getTime() - TIDY_GRACE_MS;
	const orderCutoff = firstRun ? windowStart : baseline;
	const queue = [
		...select(orders, 'order', counts.orders, { cutoff: orderCutoff, graceEdge }),
		...select(products, 'product', counts.products, { cutoff: baseline, graceEdge }),
	];
	if (counts.orders.seed < TIDY_MIN_SEED_ORDERS)
		throw new SeedSafetyError(
			`found ${counts.orders.seed} seed orders, fewer than ${TIDY_MIN_SEED_ORDERS}`
		);
	const cap = firstRun ? TIDY_FIRST_RUN_CAP : TIDY_NIGHTLY_CAP;
	if (queue.length > cap)
		throw new SeedSafetyError(`${queue.length} rows to trash, more than the cap of ${cap}`);
	log(
		`tidy: ${counts.orders.toTrash} orders and ${counts.products.toTrash} products to trash` +
			` (${counts.orders.seed} seed orders, ${counts.orders.inGrace + counts.products.inGrace} in grace)`
	);
	if (!write) return { counts };

	try {
		for (const { type, id } of queue) {
			const bucket = counts[`${type}s`];
			try {
				await client.trash(`${WC}/${type}s/${id}`);
			} catch (err) {
				const gone =
					err instanceof StoreError &&
					err.status === 410 &&
					err.code === 'woocommerce_rest_already_trashed';
				if (!gone) throw err;
				bucket.alreadyGone += 1;
				continue;
			}
			bucket.trashed += 1;
			record({ type, id });
		}
	} catch (err) {
		err.counts = counts;
		throw err;
	}
	return { counts };
}
