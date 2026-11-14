/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Actions } from './actions';

let mockReadOnly = false;
let mockCanEdit = true;
let mockTooltipShown = false;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
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

const drill = jest.fn();
const setRowExpanded = jest.fn();
const props = (type: string) =>
	({
		row: { id: 'row-1', original: { record: { uuid: 'one', payload: { type } } } },
		table: { options: { meta: { drill, setRowExpanded } } },
	}) as unknown as React.ComponentProps<typeof Actions>;

beforeEach(() => {
	mockReadOnly = false;
	mockCanEdit = true;
	mockPush.mockClear();
	drill.mockClear();
	setRowExpanded.mockClear();
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

// A variable product is a record like any other: its caret opens it; the variations open
// from the button under its name.
it("a variable product's caret opens the product, never its variations", () => {
	render(<Actions {...props('variable')} />);
	const caret = screen.getByTestId('product-open-button');
	expect(caret.getAttribute('data-icon')).toBe('chevronRight');
	fireEvent.click(caret);
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
		params: { productId: 'one' },
	});
	expect(drill).not.toHaveBeenCalled();
	expect(setRowExpanded).not.toHaveBeenCalled();
	expect(screen.queryByTestId('product-expand-button')).toBeNull();
});

it("a variable product's caret is disabled, with the hint, without the edit capability", () => {
	mockCanEdit = false;
	render(<Actions {...props('variable')} />);
	expect((screen.getByTestId('product-open-button') as HTMLButtonElement).disabled).toBe(true);
	expect(mockTooltipShown).toBe(true);
});
