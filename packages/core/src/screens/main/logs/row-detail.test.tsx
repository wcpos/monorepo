/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createTestT } from '../../../../jest/translate';
import { RowDetail } from './row-detail';

import type { LogRow } from './logs-logic';

const mockT = createTestT();
const mockWriteText = jest.fn().mockResolvedValue(undefined);

const mockOpenURL = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	Share: { share: jest.fn() },
	Linking: { openURL: (url: string) => mockOpenURL(url) },
	View: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		size,
	}: React.PropsWithChildren<{ testID?: string; onPress?: () => void; size?: string }>) => (
		<button data-testid={testID} data-size={size} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('@wcpos/components/tree', () => ({ Tree: () => null }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('../health/components', () => ({
	Callout: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	KVGrid: ({ entries }: { entries: { label: string; value: string }[] }) => (
		<div>
			{entries.map(({ label, value }) => (
				<div key={label}>
					<span>{label}</span>
					<span>{value}</span>
				</div>
			))}
		</div>
	),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => mockT }));
jest.mock('../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: () => '10:00' }),
}));

const description = 'Updates made in your store were saved to this device.';
const row: LogRow = {
	logId: 'log-1',
	timestamp: 1_000,
	message: 'Applied one update',
	context: { type: 'apply.pull' },
};

beforeEach(() => {
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText: mockWriteText },
	});
	mockWriteText.mockClear();
});

describe('RowDetail', () => {
	it('links a coded error row straight to its docs page', () => {
		const codedRow: LogRow = { ...row, code: 'SYNC101', level: 'error' };
		render(<RowDetail row={codedRow} kind="error" title="Local save failed" />);

		const helpButton = screen.getByTestId('logs-help-SYNC101');
		expect(helpButton.getAttribute('data-size')).toBe('compact');
		fireEvent.click(helpButton);

		expect(mockOpenURL).toHaveBeenCalledWith('https://docs.wcpos.com/error-codes/SYNC101');
	});

	it('renders no guidance line on a low-stakes code — summary and help link only', () => {
		const codedRow: LogRow = { ...row, code: 'PRODUCT301', level: 'warn' };
		render(<RowDetail row={codedRow} kind="warn" title="Barcode scan did not match a product" />);

		expect(screen.getByText('No products matched the current search and filters.')).not.toBeNull();
		// no-impact + verify-first maps to no guidance — the docs page carries it
		expect(screen.queryByText(/retry/i)).toBeNull();
		expect(screen.queryByText(/affected/i)).toBeNull();
		expect(screen.getByTestId('logs-help-PRODUCT301')).not.toBeNull();
	});

	it('leads a quiet row with its translated event description', () => {
		render(<RowDetail row={row} kind="sync" title="Saved updates from your store" />);

		expect(screen.getByText(description)).not.toBeNull();
	});

	it('does not show the event description as the lead line for an error row', () => {
		render(<RowDetail row={row} kind="error" title="Saved updates from your store" />);

		expect(screen.queryByText(description)).toBeNull();
	});

	it('shows the labelled event code with a copy button', async () => {
		render(<RowDetail row={row} kind="sync" title="Saved updates from your store" />);

		expect(screen.getByText('Event code')).not.toBeNull();
		expect(screen.getByText('apply.pull')).not.toBeNull();
		fireEvent.click(screen.getByTestId('logs-copy-event-log-1'));
		await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith('apply.pull'));
	});

	it('hides the copy button when the Clipboard API is unavailable', () => {
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

		render(<RowDetail row={row} kind="sync" title="Saved updates from your store" />);

		expect(screen.queryByTestId('logs-copy-event-log-1')).toBeNull();
	});

	it('merges risk and next step into one guidance line on a data-at-risk code', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC101' }} kind="error" />);

		expect(
			screen.getByText(
				"Don't clear or reload this device's data. Contact support and include this code."
			)
		).not.toBeNull();
		// The registry docs body renders on the linked docs page, not in the app.
		expect(
			screen.queryByText(
				'Do not clear or reload local data. Export diagnostics and contact support before retrying or repairing anything.'
			)
		).toBeNull();
		expect(screen.queryByText(/Repair from Store health/)).toBeNull();
	});

	it('pairs the data-at-risk warning with the local repair step on a repair-local code', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC111' }} kind="error" />);

		expect(
			screen.getByText(
				"Don't clear or reload this device's data. Repair from Store health → Database."
			)
		).not.toBeNull();
		expect(screen.queryByText(/Contact support/)).toBeNull();
	});

	it.each(['PAYMENT201', 'PRINT201'] as const)(
		'keeps outcome verification domain-neutral for %s',
		(code) => {
			render(<RowDetail row={{ ...row, code }} kind="error" />);

			expect(
				screen.getByText("The final result couldn't be confirmed — verify before retrying.")
			).not.toBeNull();
			expect(screen.queryByText(/check your store/i)).toBeNull();
		}
	);

	it('directs SYNC311 users to support without telling them to reset the collection', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC311' }} kind="error" />);

		expect(
			screen.getByText(
				"Don't clear or reload this device's data. Contact support and include this code."
			)
		).not.toBeNull();
		expect(
			screen.queryByText(
				'Do not reset the affected local collection when this device may hold changes that never reached your store — resetting deletes the only local copy. Export diagnostics to help support investigate, then contact support for recovery guidance.'
			)
		).toBeNull();
		expect(screen.queryByText(/Repair from Store health/)).toBeNull();
	});
});
