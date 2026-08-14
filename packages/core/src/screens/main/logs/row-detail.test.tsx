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
	}: React.PropsWithChildren<{ testID?: string; onPress?: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
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

		fireEvent.click(screen.getByTestId('logs-help-SYNC101'));

		expect(mockOpenURL).toHaveBeenCalledWith('https://docs.wcpos.com/error-codes/SYNC101');
	});

	it('hides the benign safety and next-step boilerplate on a low-stakes code', () => {
		const codedRow: LogRow = { ...row, code: 'PRODUCT301', level: 'warn' };
		render(<RowDetail row={codedRow} kind="warn" title="Barcode scan did not match a product" />);

		expect(screen.getByText('No products matched the current search and filters.')).not.toBeNull();
		expect(screen.queryByText('No sales or data are affected.')).toBeNull();
		expect(screen.queryByText('Verify what happened before you retry.')).toBeNull();
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

	it('keeps the risk and support lines on a data-at-risk code, docs body stays in docs', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC101' }} kind="error" />);

		expect(
			screen.getByText(
				'Data on this device may be affected — follow the recovery guidance before clearing or reloading.'
			)
		).not.toBeNull();
		expect(screen.getByText('Contact support and include this code.')).not.toBeNull();
		// The registry docs body renders on the linked docs page, not in the app.
		expect(
			screen.queryByText(
				'Do not clear or reload local data. Export diagnostics and contact support before retrying or repairing anything.'
			)
		).toBeNull();
		expect(screen.queryByText('Repair from Store health → Database.')).toBeNull();
	});

	it('directs SYNC311 users to support without telling them to reset the collection', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC311' }} kind="error" />);

		expect(screen.getByText('Contact support and include this code.')).not.toBeNull();
		expect(
			screen.queryByText(
				'Do not reset the affected local collection when this device may hold changes that never reached your store — resetting deletes the only local copy. Export diagnostics to help support investigate, then contact support for recovery guidance.'
			)
		).toBeNull();
		expect(screen.queryByText('Repair from Store health → Database.')).toBeNull();
	});
});
