/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ProductName } from './name';

let mockCanEdit = true;
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: { payload: unknown }, select: (value: unknown) => unknown) =>
		select(record),
}));
jest.mock('../../contexts/pro-access', () => ({ useProAccess: () => ({ readOnly: false }) }));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditProducts: mockCanEdit } }),
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltip: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('../../components/editable-field', () => ({
	EditableField: ({
		value,
		editable,
		onChangeText,
	}: {
		value: string;
		editable: boolean;
		onChangeText?: (value: string) => void;
	}) => (
		<input
			data-testid="editable-name"
			defaultValue={value}
			readOnly={!editable}
			onChange={(event) => onChangeText?.(event.currentTarget.value)}
		/>
	),
}));
jest.mock('../../components/product/attributes', () => ({
	PlainAttributes: () => null,
	ProductAttributes: () => <span data-testid="attribute-chips" />,
}));
jest.mock('../../components/product/grouped-names', () => ({ GroupedNames: () => null }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const onChange = jest.fn();
function Name({ type }: { type: string }) {
	const record = { uuid: 'p1', payload: { name: 'Hoodie', type } };
	const context = {
		row: { original: { record } },
		column: { columnDef: { meta: {} } },
		table: { options: { meta: { commit: onChange } } },
	} as unknown as React.ComponentProps<typeof ProductName>;
	return <ProductName {...context} />;
}

beforeEach(() => {
	mockCanEdit = true;
	onChange.mockClear();
});

// The row and caret open a variable product like any other, so its name is the rename field
// again, as a simple product's is; the variations open from the button under it.
it.each(['variable', 'simple'])("a %s product's name is the inline rename field", (type) => {
	render(<Name type={type} />);
	const name = screen.getByTestId('editable-name') as HTMLInputElement;
	expect(name.value).toBe('Hoodie');
	expect(screen.queryByTestId('product-open-button')).toBeNull();
	fireEvent.change(name, { target: { value: 'Hooded top' } });
	expect(onChange).toHaveBeenCalledWith({
		document: expect.objectContaining({ uuid: 'p1' }),
		changes: { name: 'Hooded top' },
	});
});

it('renders the attributes block (chips, variations button) under a variable name only', () => {
	const { unmount } = render(<Name type="variable" />);
	expect(screen.getByTestId('attribute-chips')).toBeTruthy();
	unmount();
	render(<Name type="simple" />);
	expect(screen.queryByTestId('attribute-chips')).toBeNull();
});

it('without the edit capability the name renames nothing', () => {
	mockCanEdit = false;
	render(<Name type="variable" />);
	const name = screen.getByTestId('editable-name') as HTMLInputElement;
	expect(name.readOnly).toBe(true);
	fireEvent.change(name, { target: { value: 'Hooded top' } });
	expect(onChange).not.toHaveBeenCalled();
});
