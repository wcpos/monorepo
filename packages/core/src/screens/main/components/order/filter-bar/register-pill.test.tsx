/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { RegisterPill } from './register-pill';
import { QueryStateProvider, useQueryState } from '../../../../../query';

jest.mock('../../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({ 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': 'Front desk' }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/button', () => ({
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
	ButtonPill: ({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) => (
		<div data-testid="pill">
			{children}
			<button data-testid="remove" onClick={onRemove} />
		</div>
	),
}));
const Selection = React.createContext<(option: { value: string; label: string }) => void>(
	() => undefined
);
jest.mock('@wcpos/components/select', () => ({
	Select: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (option: { value: string; label: string }) => void;
	}) => <Selection.Provider value={onValueChange}>{children}</Selection.Provider>,
	SelectPrimitiveTrigger: ({ children }: { children: React.ReactNode }) => children,
	SelectContent: ({ children }: { children: React.ReactNode }) => children,
	SelectItem: ({ value, label }: { value: string; label: string }) => {
		const select = React.useContext(Selection);
		return (
			<button data-testid="option" onClick={() => select({ value, label })}>
				{label}
			</button>
		);
	},
}));
function FilterValue() {
	const id = useQueryState<'orders', string | undefined>((state) => state.filters.register);
	return <span data-testid="filter">{id}</span>;
}
it('selects a register by name and clears the filter', () => {
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<RegisterPill />
			<FilterValue />
		</QueryStateProvider>
	);
	expect(screen.getByTestId('pill').textContent).toBe('common.select_register');
	fireEvent.click(screen.getByTestId('option'));
	expect(screen.getByTestId('filter').textContent).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
	expect(screen.getByTestId('pill').textContent).toBe('Front desk');
	fireEvent.click(screen.getByTestId('remove'));
	expect(screen.getByTestId('filter').textContent).toBe('');
});
