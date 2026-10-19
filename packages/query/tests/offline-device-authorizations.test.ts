import { BehaviorSubject, Subject } from 'rxjs';

import { observeOfflineDeviceAuthorizations } from '../src/mutations';
import { residentEngine } from './helpers/resident-engine';

it('clears absent databases and never replays old authorizations across a swap', () => {
	const { engine, databases } = residentEngine();
	const oldRows = [{ uuid: 'old', payload: { meta_data: [] } }];
	const rows = new BehaviorSubject(oldRows);
	const find = jest.fn(() => ({ $: rows }));
	const seen: unknown[] = [];
	const read = observeOfflineDeviceAuthorizations(engine);
	const sub = read.subscribe({ next: (value) => seen.push(value), error: () => {} });
	expect(seen).toEqual([[]]);
	databases.next({ collections: { orders: { find } } });
	expect(seen.at(-1)).toEqual(oldRows);
	expect(find).toHaveBeenCalledWith({
		selector: {
			'payload.meta_data': {
				$elemMatch: {
					key: '_wcpos_payments',
					'value.payments': {
						$elemMatch: { capture_mode: 'device', recorded_offline: true, status: 'authorized' },
					},
				},
			},
		},
	});
	databases.next(null);
	expect(seen.at(-1)).toEqual([]);
	expect(rows.observed).toBe(false);
	const next = new Subject<unknown[]>();
	databases.next({ collections: { orders: { find: () => ({ $: next }) } } });
	rows.next(oldRows);
	expect(seen.at(-1)).toEqual([]);
	const replay: unknown[] = [];
	const second = read.subscribe({ next: (value) => replay.push(value), error: () => {} });
	expect(replay).toEqual([[]]);
	next.next([{ uuid: 'new' }]);
	expect(seen.at(-1)).toEqual([{ uuid: 'new' }]);
	next.error(new Error('storage failed'));
	expect(sub.closed).toBe(false);
	databases.next({ collections: { orders: { find } } });
	expect(seen.at(-1)).toEqual(oldRows);
	second.unsubscribe();
	sub.unsubscribe();
	expect(next.observed).toBe(false);
});
