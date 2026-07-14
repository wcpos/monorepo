/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState } from '../../../query';
import { DEFAULT_LOG_LEVELS, FilterBar } from './filter-bar';

jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) => (
		<div>
			{children}
			<button data-testid="clear-level-filter" onClick={onRemove} />
		</div>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/select', () => ({
	Select: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (options: { value: string; label: string }[]) => void;
	}) => (
		<div>
			<button
				data-testid="select-audit-level"
				onClick={() => onValueChange([{ value: 'audit', label: 'logs.audit' }])}
			/>
			{children}
		</div>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: () => null,
	SelectTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

function StateProbe() {
	const level = useQueryState<'logs', string[] | undefined>((state) => state.filters.level);
	return <div data-testid="selected-levels">{level?.join(',') ?? 'all'}</div>;
}

describe('logs FilterBar', () => {
	it('sets and clears the level filter through query-state actions', () => {
		const StoreFilterBar = FilterBar as unknown as React.ComponentType;
		render(
			<QueryStateProvider
				collection="logs"
				initialPageSize={10}
				initialSort={{ field: 'timestamp', direction: 'desc' }}
				initialFilters={{ level: DEFAULT_LOG_LEVELS }}
			>
				<StoreFilterBar />
				<StateProbe />
			</QueryStateProvider>
		);

		fireEvent.click(screen.getByTestId('select-audit-level'));
		expect(screen.getByTestId('selected-levels').textContent).toBe('audit');

		fireEvent.click(screen.getByTestId('clear-level-filter'));
		expect(screen.getByTestId('selected-levels').textContent).toBe('all');
	});
});
