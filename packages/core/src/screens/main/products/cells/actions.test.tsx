/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { Actions } from './actions';

let mockReadOnly = false;
let mockCanEdit = true;
let mockTooltipShown = false;
const mockPush = jest.fn();
const mockSetSearch = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../query', () => ({
	useQueryStateActions: () => ({ setSearch: mockSetSearch, clearFilter: jest.fn() }),
}));
jest.mock('../../contexts/pro-access', () => ({
	useProAccess: () => ({ readOnly: mockReadOnly }),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditProducts: mockCanEdit } }),
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltip: ({ children, show }: { children: React.ReactNode; show: boolean }) => {
		mockTooltipShown = show;
		return <>{children}</>;
	},
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		testID,
		name,
		onPress,
		disabled,
		accessibilityLabel,
	}: {
		testID: string;
		name: string;
		onPress: () => void;
		disabled?: boolean;
		accessibilityLabel: string;
	}) => (
		<button
			data-testid={testID}
			data-icon={name}
			aria-label={accessibilityLabel}
			disabled={disabled}
			onClick={onPress}
		/>
	),
}));

const setRowExpanded = jest.fn();
const expanded$ = new BehaviorSubject<Record<string, boolean>>({});
const props = (type: string, original: object = {}) =>
	({
		row: { id: 'row-1', original: { record: { uuid: 'one', payload: { type } }, ...original } },
		table: { options: { meta: { expanded$, setRowExpanded } } },
	}) as unknown as React.ComponentProps<typeof Actions>;

beforeEach(() => {
	mockReadOnly = false;
	mockCanEdit = true;
	mockPush.mockClear();
	mockSetSearch.mockClear();
	setRowExpanded.mockClear();
	expanded$.next({});
});

it('the caret opens the product edit route', () => {
	render(<Actions {...props('simple')} />);
	const caret = screen.getByTestId('product-open-button');
	expect(caret.getAttribute('aria-label')).toBe('products.open_product');
	fireEvent.click(caret);
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
		params: { productId: 'one' },
	});
	expect(mockTooltipShown).toBe(false);
});

it('is disabled, with the capability hint, without the edit capability', () => {
	mockCanEdit = false;
	render(<Actions {...props('simple')} />);
	expect((screen.getByTestId('product-open-button') as HTMLButtonElement).disabled).toBe(true);
	expect(mockTooltipShown).toBe(true);
});

it('is disabled when read-only', () => {
	mockReadOnly = true;
	render(<Actions {...props('simple')} />);
	expect((screen.getByTestId('product-open-button') as HTMLButtonElement).disabled).toBe(true);
});

it("a variable product's caret toggles its variations and never opens the modal", () => {
	mockCanEdit = false;
	render(<Actions {...props('variable')} />);
	const caret = screen.getByTestId('product-expand-button');
	expect(caret.getAttribute('aria-label')).toBe('products.show_variations');
	expect((caret as HTMLButtonElement).disabled).toBe(false);
	expect(caret.getAttribute('data-icon')).toBe('chevronRight');
	fireEvent.click(caret);
	expect(setRowExpanded).toHaveBeenCalledWith('row-1', true);
	expect(mockPush).not.toHaveBeenCalled();
});

it('an open variable row shows the down caret and collapses', () => {
	expanded$.next({ 'row-1': true });
	render(<Actions {...props('variable')} />);
	const caret = screen.getByTestId('product-expand-button');
	expect(caret.getAttribute('data-icon')).toBe('chevronDown');
	fireEvent.click(caret);
	expect(setRowExpanded).toHaveBeenCalledWith('row-1', false);
});

it('opening a row whose variations matched the search seeds the variations search', () => {
	render(<Actions {...props('variable', { childrenSearchCount: 2, parentSearchTerm: 'blue' })} />);
	fireEvent.click(screen.getByTestId('product-expand-button'));
	expect(mockSetSearch).toHaveBeenCalledWith('blue');
	expect(setRowExpanded).toHaveBeenCalledWith('row-1', true);
});
