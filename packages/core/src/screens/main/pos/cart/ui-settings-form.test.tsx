/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { UISettingsForm } from './ui-settings-form';

function MockLabelled({ label, children }: React.PropsWithChildren<{ label?: string }>) {
	return (
		<>
			{label ? <span>{label}</span> : null}
			{children}
		</>
	);
}
function MockPassThrough({ children }: React.PropsWithChildren) {
	return <>{children}</>;
}
function MockSwitch({ label, description }: { label?: string; description?: string }) {
	return (
		<>
			{label ? <span>{label}</span> : null}
			{description ? <span>{description}</span> : null}
		</>
	);
}
// The stored settings: each field's value, and the doc the form reads.
let mockFormData: Record<string, unknown> = {};

jest.mock('react-native', () => ({ View: MockPassThrough }));
jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => undefined }));
jest.mock('react-hook-form', () => ({ useForm: () => ({ control: {} }) }));
jest.mock('@wcpos/components/form', () => ({
	Form: MockPassThrough,
	FormField: ({
		name,
		render: renderField,
	}: {
		name: string;
		render: (input: { field: Record<string, unknown> }) => React.ReactNode;
	}) => renderField({ field: { name, value: mockFormData[name], onChange: () => {} } }),
	FormSegmentedControl: MockLabelled,
	FormSelect: MockLabelled,
	FormSwitch: MockSwitch,
	useFormChangeHandler: () => ({ flush: async () => true }),
}));
jest.mock('@wcpos/components/select', () => ({
	SelectContent: MockPassThrough,
	SelectItem: () => null,
	SelectTrigger: MockPassThrough,
	SelectValue: () => null,
}));
jest.mock('@wcpos/components/text', () => ({ Text: MockPassThrough }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: MockPassThrough }));
jest.mock('@wcpos/query', () => ({ useDocField: () => mockFormData }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./quick-discount-keys', () => ({ QuickDiscountKeys: MockLabelled }));
jest.mock('../../components/ui-settings', () => ({
	columnsFormSchema: { shape: {} },
	UISettingsColumnsForm: () => null,
	useDialogContext: () => ({ setButtonPressHandler: () => {} }),
}));
// The real label table: what the form renders is what the table resolves.
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: (): Record<string, unknown> => {
		const { useUILabel } = jest.requireActual('../../contexts/ui-settings/use-ui-label');
		const { getLabel } = useUILabel();
		return {
			uiSettings: {},
			getUILabel: (key: string) => getLabel('pos-cart', key),
			patchUI: async () => {},
			resetUI: async () => {},
		};
	},
}));

/**
 * The cart's label table once carried "Receipt Output Type" and "Open Cash Drawer on
 * Print" with no control behind them. Every label the form renders resolves, and those two
 * are not among them.
 */
it('renders only cart-setting labels the table resolves', () => {
	const { container } = render(<UISettingsForm />);

	expect(container.textContent).not.toContain('common.label_not_found');
	expect(screen.getByText('common.automatically_print_receipt_after_checkout')).toBeTruthy();
	expect(screen.getByText('common.quick_discounts')).toBeTruthy();
	expect(screen.getByText('common.panel_position')).toBeTruthy();
	expect(container.textContent).not.toMatch(/output_type|open_cash_drawer/);
});

// Print on with show off is the one setting that prints with nothing on screen: it says so.
it.each([
	[true, false, true],
	[false, false, false],
	[true, true, false],
])('print %s, show %s: the print-without-receipt hint shows: %s', (print, show, shown) => {
	mockFormData = { autoPrintReceipt: print, autoShowReceipt: show };
	try {
		render(<UISettingsForm />);
		expect(screen.queryByText('pos_cart.auto_print_without_receipt_hint') !== null).toBe(shown);
	} finally {
		mockFormData = {};
	}
});
