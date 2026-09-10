import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import {
	buildTenderTiles,
	initialReaderId,
	legacyPaymentMethods,
	selectableReaders,
} from './tiles';

type MethodPartial = Omit<Partial<PaymentMethodDescriptor>, 'capture' | 'capabilities'> & {
	capture?: Partial<PaymentMethodDescriptor['capture']>;
	capabilities?: Partial<PaymentMethodDescriptor['capabilities']>;
};

function makeMethod(partial: MethodPartial = {}): PaymentMethodDescriptor {
	const base = {
		schema: 1,
		id: 'cash',
		title: 'Cash',
		kind: 'cash',
		pos_enabled: true,
		order: 1,
		capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
		capabilities: {
			amount: { partial: true },
			change: true,
			refunds: { via: 'manual', partial: true },
			tips: 'none',
			offline: 'record',
			void: false,
		},
		defaults: { order_status: 'completed', rounding: null, open_drawer: true },
		provider_data: {},
	} satisfies PaymentMethodDescriptor;

	return {
		...base,
		...partial,
		capture: { ...base.capture, ...partial.capture },
		capabilities: { ...base.capabilities, ...partial.capabilities },
	};
}

describe('buildTenderTiles', () => {
	it('drops disabled and webview methods from the payment grid', () => {
		const methods = [
			makeMethod({ id: 'cash' }),
			makeMethod({ id: 'disabled', pos_enabled: false }),
			makeMethod({ id: 'legacy', capture: { mode: 'webview' } }),
		];

		expect(buildTenderTiles(methods, { online: true }).map((tile) => tile.method.id)).toEqual([
			'cash',
		]);
	});

	it('sorts by order and breaks ties by title without mutating the input', () => {
		const methods = [
			makeMethod({ id: 'zulu', title: 'Zulu', order: 2 }),
			makeMethod({ id: 'beta', title: 'Beta', order: 1 }),
			makeMethod({ id: 'alpha', title: 'Alpha', order: 1 }),
		];

		expect(buildTenderTiles(methods, { online: true }).map((tile) => tile.method.id)).toEqual([
			'alpha',
			'beta',
			'zulu',
		]);
		expect(methods.map((method) => method.id)).toEqual(['zulu', 'beta', 'alpha']);
	});

	it('reports unsupported mode before offline when both apply', () => {
		const [tile] = buildTenderTiles(
			[
				makeMethod({
					capture: { mode: 'future_mode' },
					capabilities: { offline: 'none' },
				}),
			],
			{ online: false }
		);

		expect(tile).toMatchObject({ disabled: true, reason: 'unsupported_mode' });
	});

	it.each(['device', 'stored_value'] as const)(
		'disables the known %s mode because its driver has not shipped',
		(mode) => {
			const [tile] = buildTenderTiles(
				[makeMethod({ capture: { mode }, capabilities: { offline: 'none' } })],
				{ online: false }
			);

			expect(tile).toMatchObject({ disabled: true, reason: 'no_driver' });
		}
	);

	it('disables a manual online-only method while the till is offline', () => {
		const [tile] = buildTenderTiles([makeMethod({ capabilities: { offline: 'none' } })], {
			online: false,
		});

		expect(tile).toMatchObject({ disabled: true, reason: 'offline', worksOffline: false });
	});

	it('enables a manual method online and flags recordable offline methods', () => {
		const [onlineOnly] = buildTenderTiles([makeMethod({ capabilities: { offline: 'none' } })], {
			online: true,
		});
		const [recordable] = buildTenderTiles([makeMethod()], { online: false });

		expect(onlineOnly).toMatchObject({ disabled: false, reason: null, worksOffline: false });
		expect(recordable).toMatchObject({ disabled: false, reason: null, worksOffline: true });
	});
});

describe('legacyPaymentMethods', () => {
	it('returns enabled webview modes and methods with a webview fallback in tile sort order', () => {
		const methods = [
			makeMethod({ id: 'hidden', pos_enabled: false, capture: { mode: 'webview' } }),
			makeMethod({ id: 'plain', title: 'Plain', order: 1 }),
			makeMethod({
				id: 'fallback-zulu',
				title: 'Zulu',
				order: 2,
				capture: { mode: 'manual', webview_available: true },
			}),
			makeMethod({ id: 'webview', title: 'Alpha', order: 2, capture: { mode: 'webview' } }),
		];

		expect(legacyPaymentMethods(methods).map((method) => method.id)).toEqual([
			'webview',
			'fallback-zulu',
		]);
	});
});

const server = makeMethod({
	capture: {
		mode: 'server',
		hardware: {
			discovery: 'server',
			readers: [
				{ id: 'a', label: 'Front', status: 'online', default: true },
				{ id: 'b', label: 'Back', status: 'offline', default: false },
			],
			default_reader: 'a',
			lock_to_default: false,
		},
	},
});
const held = new Map([['a', { orderUuid: 'other', orderNumber: '123' }]]);
it.each([
	[false, new Map(), 'offline'],
	[true, held, { type: 'reader_in_use', number: '123' }],
	[true, new Map(), null],
])('server availability (%s)', (online, readersInUse, reason) => {
	expect(
		buildTenderTiles([server], { online, readersInUse, currentOrderUuid: 'mine' })[0].reason
	).toEqual(reason);
});
it('has no readers when the locked default is offline', () => {
	const method = makeMethod({
		capture: {
			mode: 'server',
			hardware: {
				discovery: 'server',
				readers: [{ id: 'a', label: 'Front', status: 'online', default: false }],
				default_reader: 'b',
				lock_to_default: true,
			},
		},
	});
	expect(buildTenderTiles([method], { online: true })[0].reason).toBe('no_readers');
	expect(selectableReaders(method)).toEqual({ readers: [], lockToDefault: true });
});
it('drops offline readers and marks only other orders as busy', () => {
	expect(selectableReaders(server, held, 'mine')).toEqual({
		lockToDefault: false,
		readers: [{ id: 'a', label: 'Front', isDefault: true, inUseBy: '123' }],
	});
	expect(selectableReaders(server, held, 'other').readers[0].inUseBy).toBeNull();
	expect(
		buildTenderTiles([server], { online: true, readersInUse: held, currentOrderUuid: 'other' })[0]
			.disabled
	).toBe(false);
	expect(selectableReaders(makeMethod()).readers).toEqual([]);
});

describe('initialReaderId', () => {
	const a = { id: 'a', label: 'Front', isDefault: true, inUseBy: null };
	const b = { id: 'b', label: 'Back', isDefault: false, inUseBy: null };
	it.each([
		['lock wins', [a, b], true, 'b', 'a'],
		['remembered beats default', [a, b], false, 'b', 'b'],
		['absent remembered', [a, b], false, 'gone', 'a'],
		['busy remembered', [a, { ...b, inUseBy: '42' }], false, 'b', 'a'],
		['default only', [a, b], false, null, 'a'],
		['no default', [b], false, null, null],
		['busy default', [{ ...a, inUseBy: '42' }, b], false, null, null],
		['no readers', [], false, 'b', null],
	] as const)('%s', (_label, readers, locked, remembered, expected) => {
		expect(initialReaderId(readers, locked, remembered)).toBe(expected);
	});
});
