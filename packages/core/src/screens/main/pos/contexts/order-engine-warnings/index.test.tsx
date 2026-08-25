/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { calculateCartLine, createCartConfig } from '@wcpos/order-math';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { EngineWarning } from '@wcpos/order-math';

import {
	OrderEngineWarningsProvider,
	type ReportEngineWarnings,
	useOrderEngineWarnings,
	useReportEngineWarnings,
} from './index';
import { TotalsChangedBanner } from '../../cart/totals-changed-banner';

const warn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: (...args: unknown[]) => warn(...args),
		error: jest.fn(),
		success: jest.fn(),
	}),
}));

jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('@wcpos/components/vstack', () => {
	const { View } = jest.requireActual('react-native');
	return { VStack: View };
});
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ href, children, testID }: Record<string, unknown>) => (
		<a data-testid={testID as string} href={href as string}>
			{children as string}
		</a>
	),
}));

// The banner reaches expo-router through the current-order context; only its
// `CartTotalsChangedBanner` mount needs it, and this suite renders the explicit
// one.
jest.mock('../current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-a' } }),
}));

// The banner's other half. This suite is about the engine-warning half, so the
// order is never diverged — which also proves the two are independent: a warning
// raises the banner on an order the server has said nothing about.
jest.mock('../order-money-divergence', () => ({
	STORE_LEVEL_DIVERGENCE_THRESHOLD: 3,
	useOrderMoneyDivergence: () => ({
		divergence: null,
		serverOwnsMoney: false,
		divergedOrderCount: 0,
	}),
}));

jest.mock('../../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../../jest/translate')>(
		'../../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

/**
 * The REAL engine, over a fee line whose `_woocommerce_pos_data` cannot be
 * parsed — the condition the warning exists to report. Built here rather than
 * hand-written as a literal so the test breaks if the engine stops emitting it:
 * a pinned literal would keep passing over an engine that had gone silent, which
 * is the failure this whole issue is about.
 */
function malformedPosDataWarnings(): readonly EngineWarning[] {
	const config = createCartConfig({
		allRates: [],
		rates: [
			{ id: 1, rate: '20.0000', compound: false, order: 1, class: 'standard', shipping: true },
		],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		taxClassSlugs: ['standard'],
		calcDiscountsSequentially: false,
	});
	const { warnings } = calculateCartLine(
		{
			kind: 'fee',
			line: {
				name: 'Fee',
				tax_class: 'standard',
				tax_status: 'taxable' as const,
				total: '10',
				meta_data: [{ key: '_woocommerce_pos_data', value: 'not-json' }],
			},
			cartLineItems: [],
		},
		config
	);
	return warnings;
}

let report: ReportEngineWarnings = () => undefined;

const captureReport = (next: ReportEngineWarnings) => {
	report = next;
};

function Harness({ orderId }: { orderId: string | undefined }) {
	const reportEngineWarnings = useReportEngineWarnings();
	// Captured from an EFFECT, not during render: the react-compiler rule that
	// bans writing to an outer binding mid-render applies to test components too.
	React.useEffect(() => captureReport(reportEngineWarnings), [reportEngineWarnings]);
	const held = useOrderEngineWarnings(orderId);
	return <div data-testid="held">{held.join(',')}</div>;
}

function renderSink(orderId: string | undefined) {
	return render(
		<OrderEngineWarningsProvider>
			<Harness orderId={orderId} />
			<TotalsChangedBanner orderId={orderId} />
		</OrderEngineWarningsProvider>
	);
}

const send = (warnings: readonly EngineWarning[], orderId: string | undefined) =>
	act(() => report(warnings, { orderId, site: 'test' }));

beforeEach(() => {
	warn.mockClear();
});

describe('the engine-warning sink', () => {
	it('turns a real malformed pos_data warning into a coded log AND a cart banner', () => {
		renderSink('order-a');
		const warnings = malformedPosDataWarnings();
		// Guard the instrument: if the engine stopped reporting, everything below
		// would pass vacuously.
		expect(warnings).toEqual([
			{ code: 'malformed_pos_data', where: { lineType: 'fee_line', index: -1 } },
		]);

		send(warnings, 'order-a');

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][1]).toMatchObject({
			code: ERROR_CODES.CART_LINE_PRICE_BASIS_UNREADABLE,
			context: { site: 'test', orderId: 'order-a', lineType: 'fee_line' },
		});
		expect(
			screen.getByTestId('order-totals-changed-banner-engine-warning-malformed_pos_data')
		).toBeTruthy();
	});

	it('gives an unknown tax rate its own code — the merchant does something different about it', () => {
		renderSink('order-a');
		send([{ code: 'unknown_tax_rate_id', rateId: 42 }], 'order-a');

		expect(warn.mock.calls[0][1]).toMatchObject({
			code: ERROR_CODES.ORDER_TAX_RATE_UNKNOWN,
			context: { rateId: 42 },
		});
		expect(
			screen.getByTestId('order-totals-changed-banner-engine-warning-unknown_tax_rate_id')
		).toBeTruthy();
	});

	it('logs one line per distinct warning, not one per settle', () => {
		renderSink('order-a');
		const warning: EngineWarning = { code: 'unknown_tax_rate_id', rateId: 42 };

		// The settle pass runs on EVERY cart change, so an unrepairable order would
		// otherwise bury the log under its own repetitions.
		send([warning], 'order-a');
		send([warning], 'order-a');
		send([warning], 'order-a');
		expect(warn).toHaveBeenCalledTimes(1);

		// A DIFFERENT rate is a different fact, and must not be swallowed by the
		// first one's dedupe.
		send([{ code: 'unknown_tax_rate_id', rateId: 43 }], 'order-a');
		expect(warn).toHaveBeenCalledTimes(2);
	});

	it('holds the warning for the order once raised', () => {
		renderSink('order-a');
		send([{ code: 'unknown_tax_rate_id', rateId: 42 }], 'order-a');
		expect(screen.getByTestId('held').textContent).toBe('unknown_tax_rate_id');

		// A later pass that reports nothing does NOT retire it. Nothing re-scans a
		// whole cart for every warning kind — a set that cleared on the next quiet
		// settle would blink out from under the cashier mid-sale.
		send([], 'order-a');
		expect(screen.getByTestId('held').textContent).toBe('unknown_tax_rate_id');
	});

	it('accumulates the kinds rather than replacing them, in a stable order', () => {
		renderSink('order-a');
		send([{ code: 'unknown_tax_rate_id', rateId: 42 }], 'order-a');
		send(malformedPosDataWarnings(), 'order-a');

		expect(screen.getByTestId('held').textContent).toBe('malformed_pos_data,unknown_tax_rate_id');
	});

	it('keeps each order to its own warnings — open tabs are first-class', () => {
		renderSink('order-b');
		send([{ code: 'unknown_tax_rate_id', rateId: 42 }], 'order-a');

		expect(screen.getByTestId('held').textContent).toBe('');
		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});

	it('still logs a warning for an order with no uuid yet, and holds nothing', () => {
		renderSink(undefined);
		send([{ code: 'unknown_tax_rate_id', rateId: 42 }], undefined);

		// An unsaved new order has no key to hold it under; the edit that gives the
		// order its uuid reports again.
		expect(warn).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId('order-totals-changed-banner')).toBeNull();
	});

	/**
	 * The cap must never be able to retire the notice on the sale in front of the
	 * cashier. Key order is FIRST-report order — reassigning an object key leaves
	 * it where it was — so an `Object.keys().slice(-MAX)` cap targets the order
	 * that has held a warning longest, which on a busy till is a perfectly likely
	 * description of the open cart.
	 */
	it('evicts the least recently reported order, never the one being worked on', () => {
		const rate = (rateId: number): EngineWarning => ({ code: 'unknown_tax_rate_id', rateId });
		renderSink('order-live');

		// The cashier's order warns FIRST, so it is the oldest KEY from here on.
		send([rate(1)], 'order-live');
		// A shift's worth of other orders, filling the map to its bound.
		for (let i = 0; i < 49; i++) send([rate(1)], `order-${i}`);
		// It re-reports on every cart change — the same kind, so the held set does
		// not change and no re-render happens, but it is the most RECENT report.
		send([rate(1)], 'order-live');
		// One more distinct order takes the map past the bound.
		send([rate(1)], 'order-49');

		expect(screen.getByTestId('held').textContent).toBe('unknown_tax_rate_id');
		expect(screen.getByTestId('order-totals-changed-banner')).toBeTruthy();
	});

	it('is inert without a provider rather than taking the cart down', () => {
		render(<Harness orderId="order-a" />);
		act(() =>
			report([{ code: 'unknown_tax_rate_id', rateId: 42 }], {
				orderId: 'order-a',
				site: 'test',
			})
		);
		expect(screen.getByTestId('held').textContent).toBe('');
	});
});
