/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Register } from './register';

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
		<button data-testid="register-cell" onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({ 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': 'Front desk' }),
}));
const setFilter = jest.fn();
function props(id?: string) {
	return {
		row: {
			original: {
				record: { payload: { meta_data: id ? [{ key: '_wcpos_register', value: id }] : [] } },
			},
		},
		table: { options: { meta: { actions: { setFilter } } } },
	} as unknown as React.ComponentProps<typeof Register>;
}
it('renders the resolved name and applies the register filter on click', () => {
	const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
	render(<Register {...props(id)} />);
	expect(screen.getByTestId('register-cell').textContent).toBe('Front desk');
	fireEvent.click(screen.getByTestId('register-cell'));
	expect(setFilter).toHaveBeenCalledWith('register', id);
});
it('falls back to the first eight characters and follows row replacements', () => {
	const { rerender } = render(<Register {...props('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')} />);
	expect(screen.getByTestId('register-cell').textContent).toBe('bbbbbbbb');
	rerender(<Register {...props()} />);
	expect(screen.queryByTestId('register-cell')).toBeNull();
});
