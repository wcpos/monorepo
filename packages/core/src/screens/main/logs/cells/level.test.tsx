/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../../query';
import { Level } from './level';

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
		<button onClick={onPress}>{children}</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

function Harness() {
	const actions = useQueryStateActions<'logs'>();
	const level = useQueryState<'logs', string[] | undefined>((state) => state.filters.level);
	const props = {
		row: { original: { document: { level: 'audit' } } },
		table: { options: { meta: { actions: { setFilter: actions.setFilter } } } },
	};
	const StoreLevel = Level as unknown as React.ComponentType<Record<string, unknown>>;
	return (
		<>
			<StoreLevel {...props} />
			<div data-testid="selected-levels">{level?.join(',') ?? 'all'}</div>
		</>
	);
}

describe('logs level cell', () => {
	it('filters the table through the narrow setFilter meta action', () => {
		render(
			<QueryStateProvider
				collection="logs"
				initialPageSize={10}
				initialSort={{ field: 'timestamp', direction: 'desc' }}
			>
				<Harness />
			</QueryStateProvider>
		);

		fireEvent.click(screen.getByRole('button'));

		expect(screen.getByTestId('selected-levels').textContent).toBe('audit');
	});
});
