/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CountingElsewhereCard, OpenRegisterCard } from './open-register-card';

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ site: {}, store: { id: 1 } }),
}));

let defaultFloat: string | undefined = '200';
let lastCount: string | undefined = '570.10';
let hasClosure = true;
let blind = false;
const open = jest.fn(async () => undefined);
const print = jest.fn(async () => undefined);
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		closedElsewhere: mockClosedElsewhere,
		countingBy: mockCountingBy,
		binding: {
			registerName: 'Front',
			registerId: 'r',
			registers: [{ id: 'r', default_float: defaultFloat }],
		},
		lastClosed: { counted: { cash: lastCount } },
		lastClosure: hasClosure
			? { number: 3, server_number: 8, closed_at: '2026-09-28T10:00:00Z', counted: { cash: '480' } }
			: null,
		actions: { openSession: open },
		expected: { cash: '155' },
		blind,
	}),
}));
// The movement sheet reaches the receipt document hook (REST client, expo-crypto); not this test's concern.
jest.mock('../../receipt/use-receipt-document', () => ({
	useReceiptDocument: () => ({ print, resolvedPrinter: { autoOpenDrawer: true } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (v: string) => `£${v}` }),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/input', () => {
	function Field({
		onChangeText,
		testID,
		inputClassName: _inputClassName,
		className: _className,
		type: _type,
		...props
	}: {
		onChangeText: (v: string) => void;
		testID: string;
		inputClassName?: string;
		className?: string;
		type?: string;
	}) {
		return <input {...props} data-testid={testID} onChange={(e) => onChangeText(e.target.value)} />;
	}
	function Wrap({ children }: { children?: React.ReactNode }) {
		return <div>{children}</div>;
	}
	// The card's amount is the `box` variant: Input.Root / Left / InputField / Right.
	return {
		Input: Object.assign(Field, { Root: Wrap, Left: Wrap, Right: Wrap, InputField: Field }),
	};
});
jest.mock('@wcpos/components/text', () => ({
	// The real context: a real Chip below provides its ink through it.
	TextClassContext: jest.requireActual('@wcpos/components/text').TextClassContext,
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
it('prefills default, selects last count, shows only differing variance, and opens', async () => {
	render(<OpenRegisterCard />);
	expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('200');
	expect(screen.queryByTestId('opening-variance')).toBeNull();
	fireEvent.click(screen.getByTestId('open-register-chip-last'));
	expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('570.10');
	expect(screen.getByTestId('opening-variance')).toBeTruthy();
	fireEvent.click(screen.getByTestId('open-register-button'));
	await waitFor(() =>
		expect(open).toHaveBeenCalledWith({ expectedFloat: '200', countedFloat: '570.10' })
	);
});

jest.mock('@wcpos/components/dialog', () => ({
	Dialog: () => null,
	DialogContent: () => null,
	DialogTitle: () => null,
}));
jest.mock('@wcpos/printer', () => ({ usePrint: () => ({ print }) }));
jest.mock('../../receipt/hooks/use-resolved-printer', () => ({
	useResolvedPrinter: () => ({ resolvedPrinter: null }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));

beforeEach(() => {
	hasClosure = true;
	defaultFloat = '200';
	lastCount = '570.10';
});
it('uses a last count that arrives after the local query, without replacing typed input', () => {
	defaultFloat = undefined;
	lastCount = undefined;
	const view = render(<OpenRegisterCard />);
	lastCount = '570.10';
	view.rerender(<OpenRegisterCard />);
	expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('570.10');
	fireEvent.change(screen.getByTestId('open-register-amount'), { target: { value: '600' } });
	defaultFloat = '200';
	view.rerender(<OpenRegisterCard />);
	expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('600');
});

it('opens the last closure panel from the fold and omits it without a closure', () => {
	const onLastClosure = jest.fn();
	const view = render(<OpenRegisterCard onLastClosure={onLastClosure} />);
	fireEvent.click(screen.getByTestId('open-register-last-closure'));
	expect(onLastClosure).toHaveBeenCalledTimes(1);
	expect(screen.getByTestId('open-register-last-closure').textContent).toContain('£480');
	hasClosure = false;
	view.rerender(<OpenRegisterCard onLastClosure={onLastClosure} />);
	expect(screen.queryByTestId('open-register-last-closure')).toBeNull();
});

it('hides the previous cash figures from a blind-count cashier', () => {
	blind = true;
	try {
		render(<OpenRegisterCard onLastClosure={() => {}} />);
		// The fold keeps its label and navigation; the last-count chip goes with the amount.
		expect(screen.getByTestId('open-register-last-closure').textContent).not.toContain('£480');
		expect(screen.queryByTestId('open-register-chip-last')).toBeNull();
		expect(screen.getByTestId('open-register-chip-default')).toBeTruthy();
	} finally {
		blind = false;
	}
});

let mockClosedElsewhere: { by: number | null; at: string } | null = null;
let mockCountingBy: { id: number; name: string | null; at: string | null } | null = null;
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: () => [{ id: 7, display_name: 'Alex' }],
}));
jest.mock('../../../../hooks/user-db-list-resources', () => ({
	credentialsListResource: () => null,
}));
jest.mock('../../../../hooks/use-store-day-label', () => ({
	useStoreDayLabel: () => ({ time: (at: string) => at.slice(11, 16) }),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
it.each([
	null,
	{ id: 7, name: 'Alex', at: '2026-10-29T17:41:00Z' },
	{ id: 8, name: null, at: null },
])('names the counter only when the plugin supplies one (%s)', (counter) => {
	const previous = mockCountingBy;
	mockCountingBy = counter;
	try {
		render(<CountingElsewhereCard />);
		expect(screen.getByText('Front')).toBeTruthy();
		expect(screen.getByText('Counting on another till')).toBeTruthy();
		expect(screen.queryAllByRole('button')).toHaveLength(0);
		if (counter)
			expect(screen.getByTestId('counting-elsewhere-by').textContent).toContain(
				counter.name ?? 'Cashier'
			);
		else expect(screen.queryByTestId('counting-elsewhere-by')).toBeNull();
	} finally {
		mockCountingBy = previous;
	}
});
it('says who closed on another till and when, but not after a close here', () => {
	const previous = mockClosedElsewhere;
	mockClosedElsewhere = { by: 7, at: '2026-10-29T17:41:00Z' };
	try {
		const view = render(<OpenRegisterCard />);
		expect(screen.getByTestId('open-register-closed-elsewhere').textContent).toContain(
			'Front was closed on another till at 17:41 by Alex'
		);
		mockClosedElsewhere = null;
		view.rerender(<OpenRegisterCard />);
		expect(screen.queryByTestId('open-register-closed-elsewhere')).toBeNull();
	} finally {
		mockClosedElsewhere = previous;
	}
});
