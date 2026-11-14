/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { FormPortField } from './port-field';

jest.mock('@wcpos/components/form', () => ({
	FormInput: ({ value, onChange }: { value: string; onChange: (text: string) => void }) => (
		<input aria-label="port" value={value} onChange={(event) => onChange(event.target.value)} />
	),
}));

it.each([
	['9100', 9100],
	['91a00', 9100],
	['-9100', 9100],
	['', 0],
])('typed %p holds the port %p', (typed, port) => {
	const onChange = jest.fn();
	render(<FormPortField name="port" onBlur={jest.fn()} value={80} onChange={onChange} />);
	fireEvent.change(screen.getByRole('textbox', { name: 'port' }), { target: { value: typed } });
	expect(onChange).toHaveBeenCalledWith(port);
});
it('shows the stored port as its digits', () => {
	render(<FormPortField name="port" onBlur={jest.fn()} value={9100} onChange={jest.fn()} />);
	expect(screen.getByRole('textbox', { name: 'port' })).toHaveProperty('value', '9100');
});
