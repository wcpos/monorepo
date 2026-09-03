import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { buildTenderTiles, legacyPaymentMethods } from './tiles';

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

	it.each(['device', 'server', 'stored_value'] as const)(
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
