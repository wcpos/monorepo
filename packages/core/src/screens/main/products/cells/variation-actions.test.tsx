/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { VariationActions } from './variation-actions';

let mockReadOnly = false;
let mockCanEdit = true;
let mockTooltip: { show: boolean; hint: string } | undefined;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../contexts/pro-access', () => ({
	useProAccess: () => ({ readOnly: mockReadOnly }),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditVariations: mockCanEdit } }),
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltip: ({
		children,
		show,
		hint,
	}: {
		children: React.ReactNode;
		show: boolean;
		hint: string;
	}) => {
		mockTooltip = { show, hint };
		return <>{children}</>;
	},
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		testID,
		onPress,
		disabled,
		accessibilityLabel,
	}: {
		testID: string;
		onPress: () => void;
		disabled?: boolean;
		accessibilityLabel: string;
	}) => (
		<button
			data-testid={testID}
			aria-label={accessibilityLabel}
			disabled={disabled}
			onClick={onPress}
		/>
	),
}));

const props = {
	row: { original: { record: { uuid: 'var-1' } } },
} as unknown as React.ComponentProps<typeof VariationActions>;

beforeEach(() => {
	mockReadOnly = false;
	mockCanEdit = true;
	mockPush.mockClear();
});

it('the caret opens the variation edit route', () => {
	render(<VariationActions {...props} />);
	const caret = screen.getByTestId('variation-open-button');
	expect(caret.getAttribute('aria-label')).toBe('products.open_variation');
	fireEvent.click(caret);
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/products/(modals)/edit/variation/[variationId]',
		params: { variationId: 'var-1' },
	});
	expect(mockTooltip?.show).toBe(false);
});

it('is disabled, with the variations hint, without the edit capability', () => {
	mockCanEdit = false;
	render(<VariationActions {...props} />);
	expect((screen.getByTestId('variation-open-button') as HTMLButtonElement).disabled).toBe(true);
	expect(mockTooltip).toEqual({ show: true, hint: 'editVariations' });
});

it('is disabled when read-only', () => {
	mockReadOnly = true;
	render(<VariationActions {...props} />);
	expect((screen.getByTestId('variation-open-button') as HTMLButtonElement).disabled).toBe(true);
});
