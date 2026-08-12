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
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
	it('links a coded error row to its docs page', () => {
		const codedRow: LogRow = { ...row, code: 'SYNC101', level: 'error' };
		render(<RowDetail row={codedRow} kind="error" title="Local save failed" />);

		fireEvent.click(screen.getByTestId('logs-learn-more-SYNC101'));

		expect(mockOpenURL).toHaveBeenCalledWith('https://docs.wcpos.com/error-codes/SYNC101');
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

	it('warns SYNC101 users not to clear or reload without suggesting repair or retry', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC101' }} kind="error" />);

		expect(
			screen.getAllByText(
				'Data on this device may be affected — follow the recovery guidance before clearing or reloading.'
			)
		).toHaveLength(2);
		expect(
			screen.getByText(
				'Do not clear or reload local data. Export diagnostics and contact support before retrying or repairing anything.'
			)
		).not.toBeNull();
		expect(screen.getAllByText('Contact support and include this code.')).toHaveLength(2);
		expect(screen.queryByText('Repair from Store health → Database.')).toBeNull();
	});

	it('directs SYNC311 users to support without telling them to reset the collection', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC311' }} kind="error" />);

		expect(
			screen.getByText(
				'Do not reset the affected local collection when this device may hold changes that never reached your store — resetting deletes the only local copy. Export diagnostics to help support investigate, then contact support for recovery guidance.'
			)
		).not.toBeNull();
		expect(screen.getAllByText('Contact support and include this code.')).toHaveLength(2);
		expect(screen.queryByText('Repair from Store health → Database.')).toBeNull();
	});
});
