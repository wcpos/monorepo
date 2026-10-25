/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ProductName } from './name';
import { DataTableRow } from '../../components/data-table/rows';

let mockCanEdit = true;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
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
	EditableField: () => <span data-testid="editable-name" />,
}));
jest.mock('../../components/product/attributes', () => ({
	PlainAttributes: () => null,
	ProductAttributes: () => <span data-testid="attribute-chips" />,
}));
jest.mock('../../components/product/grouped-names', () => ({ GroupedNames: () => null }));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'fine' }));
jest.mock('@wcpos/components/tooltip', () => ({
	TooltipPassiveTriggers: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/table', () => ({
	TableCell: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

// The real row (its press guard) around the real name cell.
function Row({ type, onToggle }: { type: string; onToggle: () => void }) {
	const record = { uuid: 'p1', payload: { name: 'Hoodie', type } };
	const context = {
		row: { original: { record } },
		column: { columnDef: { meta: {} } },
		table: { options: { meta: {} } },
	};
	const cell = {
		id: 'name',
		column: { id: 'name', columnDef: { cell: ProductName, meta: {} } },
		getContext: () => context,
	};
	const item = {
		id: 'p1',
		original: { record },
		getVisibleCells: () => [cell],
		getAllCells: () => [cell],
	} as unknown as React.ComponentProps<typeof DataTableRow>['item'];
	return <DataTableRow item={item} testID="row" onPress={onToggle} />;
}

beforeEach(() => {
	mockCanEdit = true;
	mockPush.mockClear();
});

it("a variable product's name opens its modal, and the row does not toggle", () => {
	const onToggle = jest.fn();
	render(<Row type="variable" onToggle={onToggle} />);
	const name = screen.getByTestId('product-open-button');
	expect(name.textContent).toBe('Hoodie');
	expect(name.getAttribute('aria-label')).toBe('products.open_product');
	expect(screen.getByTestId('attribute-chips')).toBeTruthy();
	fireEvent.click(name);
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
		params: { productId: 'p1' },
	});
	expect(onToggle).not.toHaveBeenCalled();
});

it('without the edit capability the name is disabled and opens nothing', () => {
	mockCanEdit = false;
	render(<Row type="variable" onToggle={jest.fn()} />);
	const name = screen.getByTestId('product-open-button');
	expect(name.getAttribute('aria-disabled')).toBe('true');
	fireEvent.click(name);
	expect(mockPush).not.toHaveBeenCalled();
});

it("a simple product's name stays the inline editable field", () => {
	render(<Row type="simple" onToggle={jest.fn()} />);
	expect(screen.getByTestId('editable-name')).toBeTruthy();
	expect(screen.queryByTestId('product-open-button')).toBeNull();
});
