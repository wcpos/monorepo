/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { DataTableFooter } from './footer';

const mockClearAndSync = jest.fn(async () => undefined);
const mockSync = jest.fn(async () => undefined);
const mockUseCollectionReset = jest.fn((_collectionName: string) => ({
	clearAndSync: mockClearAndSync,
}));

jest.mock('@wcpos/query', () => ({
	useReplicationState: () => {
		throw new Error('legacy replication projection reached');
	},
}));
jest.mock('../../hooks/use-collection-reset', () => ({
	useCollectionReset: (collectionName: string) => mockUseCollectionReset(collectionName),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('../sync-button', () => ({
	SyncButton: ({
		sync,
		clearAndSync,
	}: {
		sync: () => Promise<void>;
		clearAndSync: () => Promise<void>;
	}) => (
		<>
			<button data-testid="sync" onClick={() => void sync()} />
			<button data-testid="clear-and-sync" onClick={() => void clearAndSync()} />
		</>
	),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}:${values.shown}/${values.total}` : key,
}));

function renderBindingFooter(source: 'coverage' | 'local') {
	const BindingFooter = DataTableFooter as unknown as React.ComponentType<Record<string, unknown>>;
	return render(
		<BindingFooter
			collectionName="coupons"
			count={10}
			total$={of(27)}
			totalSource$={of(source)}
			active$={of(false)}
			sync={mockSync}
		/>
	);
}

describe('DataTableFooter binding projections', () => {
	beforeEach(() => jest.clearAllMocks());

	it('shows a coverage total without the local-items affordance', () => {
		renderBindingFooter('coverage');

		expect(screen.getByTestId('data-table-count').textContent).toBe('common.showing_of:10/27');
		expect(screen.queryByText('common.showing_local_items')).toBeNull();
		expect(mockUseCollectionReset).toHaveBeenCalledWith('coupons');
	});

	it('shows the local-items affordance and retains sync/reset actions', () => {
		renderBindingFooter('local');

		expect(screen.getByText('common.showing_local_items')).toBeTruthy();
		fireEvent.click(screen.getByTestId('sync'));
		fireEvent.click(screen.getByTestId('clear-and-sync'));
		expect(mockSync).toHaveBeenCalledTimes(1);
		expect(mockClearAndSync).toHaveBeenCalledTimes(1);
	});
});
