/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';

import type { ClosureRow } from '@wcpos/query/register-session';

import { createTestT } from '../../../../../jest/translate';
import {
	type Correction,
	deriveSettled,
} from '../../../../services/register-session/settled-figures';
import { ClosureBody, ClosureHeading } from './closure-body';
import { ClosurePanel } from './closure-panel';

jest.mock('@wcpos/components/text', () => ({
	...jest.requireActual('@wcpos/components/text'),
	Text: ({
		children,
		testID,
		className,
	}: {
		children: React.ReactNode;
		testID?: string;
		className?: string;
	}) => (
		<span data-testid={testID} className={className}>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	useViewedStore: () => ({ name: 'Shop' }),
}));
jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({ r: 'Front till' }),
}));
jest.mock('../../../../services/register-session/use-closure-document-context', () => ({
	useClosureDocumentContext: () => context,
}));
jest.mock('@wcpos/components/dialog', () => ({
	// The pane's Print closure door mounts a closed PrintSheet: a controlled Dialog that renders nothing while shut.
	Dialog: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) =>
		open ? children : null,
	DialogContent: jest.requireActual('react-native').View,
	DialogBody: jest.requireActual('react-native').View,
	DialogHeader: jest.requireActual('react-native').View,
	DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
	DismissIsClose: jest.requireActual('../../../../../jest/footer.test-utils').DismissIsClose,
	DialogTitle: jest.requireActual('react-native').Text,
	DialogDescription: jest.requireActual('react-native').Text,
}));
jest.mock('../../receipt/receipt-body', () => ({ ReceiptBody: () => null }));
jest.mock('../../receipt/template-switcher', () => ({ TemplateSwitcher: () => null }));
jest.mock('../../receipt/printer-switcher', () => ({ PrinterSwitcher: () => null }));

jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({ storeDB: {} }) }));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({}) }));
jest.mock('../../receipt/use-receipt-document', () => ({ useReceiptDocument: () => doc }));
jest.mock('./recount-sheet', () => ({ RecountSheet: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => false,
}));

const context = {
	store: { name: 'Shop' },
	currency: 'USD',
	timezone: 'Asia/Tokyo',
	locale: 'en-US',
	printedAt: '2026-09-11T18:00:00Z',
	i18n: {},
	formatMoney: (value: string) => `$${Number(value).toFixed(2)}`,
};
const row: ClosureRow = {
	id: 'c',
	session_id: 's',
	register_id: 'r',
	number: 4,
	printed_number: 8,
	server_number: 7,
	opened_at: '2026-09-11T00:00:00Z',
	closed_at: '2026-09-11T08:00:00Z',
	till_expected: { cash: '100' },
	expected: { cash: '100', card: '50', empty: '0' },
	counted: { cash: '99' },
	variance: { cash: '-1' },
	period_sales_total: '60',
	period_refunds_total: '0',
	perpetual_sales_total: '60',
	perpetual_refunds_total: '0',
	unsynced_count: 0,
	unsynced_total: '0',
	software_version: '',
	breakdowns: {
		opened_by_name: 'Opener',
		closed_by_name: 'Closer',
		opening_float: { counted: '80', expected: '70' },
		payment_methods: { cash: { sales: '30', refunds: '10' }, card: { name: 'Visa', sales: '50' } },
		movements: [
			{ id: 'in', type: 'paid_in', amount: '5', reason: 'Change' },
			{ id: 'out', type: 'paid_out', amount: '5', reason: 'Bank' },
			{ id: 'voided', type: 'paid_in', amount: '900', voided_by: 'v' },
			{ id: 'v', type: 'void', amount: '0' },
			{ id: 'ns', type: 'no_sale' },
		],
		transaction_count: 3,
		cashiers: [{ name: 'Opener' }, { name: 'Closer' }],
	},
	order_ids: [],
	movement_ids: [],
	print_count: 0,
	sync_status: 'synced',
	sync_attempts: 0,
};
const correction: Correction = {
	id: 1,
	type: 'recount',
	actor: { id: 1, name: 'Pat' },
	approver: null,
	created_at: '2026-09-11T18:00:00Z',
	reason: 'Found notes',
	figures: { counted: { cash: '105' } },
};
const doc = { receiptData: { closure: row } } as unknown as React.ComponentProps<
	typeof ClosureBody
>['doc'];

// Reading the frozen row rather than deriveSettled would show 99 / 100 / short in every case.
it.each([
	['103', '−$1.00 short', 'text-bad'],
	['104', 'Exact', 'text-ok'],
	['105', '+$1.00 over', 'text-ok'],
])('shows settled cash and result tone for count %s', (counted, result, tone) => {
	const corrections: Correction[] = [
		{ ...correction, figures: { counted: { cash: counted } } },
		{ ...correction, id: 2, type: 'late_movement', figures: { cash_delta: '4' } },
	];
	render(
		<ClosureBody
			row={row}
			doc={doc}
			{...deriveSettled(row, corrections)}
			corrections={corrections}
			blind={false}
			context={context}
		/>
	);
	expect(screen.getByTestId('closure-figure-counted').textContent).toBe(`$${counted}.00`);
	expect(screen.getByTestId('closure-figure-expected').textContent).toBe('$104.00');
	expect(screen.getByTestId('closure-figure-result').textContent).toBe(result);
	expect(screen.getByTestId('closure-figure-result').className).toContain(tone);
	expect(screen.getByTestId('closure-drawer').textContent).toContain('$104.00');
});

// Blind mode must not reveal the expected drawer balance or variance in its ladder.
it('shows only the Counted tile and keeps blind ladder labels and counts without money', () => {
	render(
		<ClosureBody
			row={row}
			doc={doc}
			{...deriveSettled(row, [])}
			corrections={[]}
			blind
			context={context}
		/>
	);
	expect(screen.getByTestId('closure-figure-counted').textContent).toBe('$99.00');
	expect(screen.queryByTestId('closure-figure-expected')).toBeNull();
	expect(screen.queryByTestId('closure-figure-result')).toBeNull();
	const ladder = screen.getByTestId('closure-drawer');
	expect(ladder.textContent).not.toContain('$');
	expect(ladder.textContent).toContain('Cash sales');
	expect(within(ladder).getByText('1')).toBeTruthy();
});

// Confusing the signature with the opener, local time with store time, or numbering precedence is visible here.
it('names the closer in bold and the opener beside Float in the store zone', () => {
	const settled = deriveSettled(row, []);
	render(
		<>
			<ClosureHeading row={row} settled={settled.settled} blind={false} testID="heading" />
			<ClosureBody
				row={row}
				doc={doc}
				{...settled}
				corrections={[]}
				blind={false}
				context={context}
			/>
		</>
	);
	expect(screen.getByText('Closure 8')).toBeTruthy();
	expect(screen.getByText('Closer', { exact: true }).className).toContain('font-semibold');
	expect(screen.getByTestId('heading').textContent).toContain(
		'Shop · Front till · Fri 11 Sep 09:00–17:00 · Closer'
	);
	expect(screen.getByTestId('closure-drawer').textContent).toContain('opened 09:00 by Opener');
	expect(screen.getByTestId('closure-drawer').textContent).toContain('−$10.00');
	expect(screen.getByTestId('closure-drawer').textContent).not.toContain('$900.00');
	expect(screen.getByText('Visa')).toBeTruthy();
});

it('keeps both dates when the session crosses midnight in the store zone', () => {
	render(
		<ClosureHeading
			row={{ ...row, closed_at: '2026-09-11T16:00:00Z' }}
			settled={row}
			blind
			testID="heading"
		/>
	);
	expect(screen.getByTestId('heading').textContent).toContain(
		'Sep 11, 2026 09:00 → Sep 12, 2026 01:00'
	);
	expect(screen.getByTestId('heading').textContent).toContain('Closer');
});

// A pushed closure must return within its host instead of creating a second modal.
it('returns through onBack without a Reports host or footer Close', () => {
	const back = jest.fn(),
		close = jest.fn();
	render(<ClosurePanel row={row} onClose={close} onBack={back} />);
	fireEvent.click(screen.getByTestId('closure-back'));
	expect(back).toHaveBeenCalledTimes(1);
	expect(close).not.toHaveBeenCalled();
	expect(screen.queryByTestId('closure-panel-close')).toBeNull();
	expect(screen.getByTestId('closure-panel-footer').textContent).not.toContain('Close');
});

// A correction can introduce a tender absent from the frozen baseline.
it('lists a newly settled non-cash tender with its document label', () => {
	const corrections: Correction[] = [
		{ ...correction, type: 'late_sale', figures: { expected_delta: { voucher: '12' } } },
	];
	const withVoucher = {
		...row,
		breakdowns: { ...row.breakdowns, payment_methods: { voucher: { name: 'Gift voucher' } } },
	};
	render(
		<ClosureBody
			row={withVoucher}
			doc={doc}
			{...deriveSettled(row, corrections)}
			corrections={corrections}
			blind={false}
			context={context}
		/>
	);
	expect(screen.getByText('Gift voucher').parentElement?.textContent).toContain('$12.00');
});

it.each([true, false])(
	'shows the settled notice, which names the recorded result, only to a sighted cashier (blind=%s)',
	(blind) => {
		const corrections: Correction[] = [
			{
				id: 1,
				type: 'recount',
				created_at: '2026-09-11 18:00:00',
				actor: { id: 1, name: 'Pat' },
				approver: null,
				reason: 'Second count',
				figures: { counted: { cash: '111' } },
			},
		];
		render(
			<ClosureBody
				row={row}
				doc={doc}
				{...deriveSettled(row, corrections)}
				corrections={corrections}
				blind={blind}
				context={context}
			/>
		);
		if (blind) expect(screen.queryByTestId('closure-settled')).toBeNull();
		else expect(screen.getByTestId('closure-settled').textContent).toContain('Recorded $99.00');
	}
);

it.each([true, false])(
	'shows counted card variance only to a sighted cashier (blind=%s)',
	(blind) => {
		const counted = { ...row, counted: { ...row.counted, card: '48' } };
		render(
			<ClosureBody
				row={counted}
				doc={doc}
				{...deriveSettled(counted, [])}
				corrections={[]}
				blind={blind}
				context={context}
			/>
		);
		const tender = screen.getByTestId('closure-tender-counted-card');
		expect(tender.textContent).toContain('Visa · Counted');
		if (blind) expect(tender.textContent).not.toMatch(/short|over|Exact|−\$2\.00/);
		else expect(tender.textContent).toContain('−$2.00 short');
	}
);

// Omitting the reason check labels ordinary closes as carries; missing labels must not show undefined.
it.each([
	['Market', 'Carried to Market'],
	[undefined, 'Carried'],
])('names a carried destination in the heading: %s', (destination, label) => {
	const carried = {
		...row,
		reason: 'store_switch',
		breakdowns: { labels: { carried_to_store_name: destination } },
	};
	const view = render(<ClosureHeading row={carried} {...deriveSettled(carried, [])} blind />);
	expect(screen.getByTestId('closure-carried-badge').textContent).toBe(label);
	view.rerender(<ClosureHeading row={row} {...deriveSettled(row, [])} blind />);
	expect(screen.queryByTestId('closure-carried-badge')).toBeNull();
});
