/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { EditCouponForm } from './form';

const mockLocalPatch = jest.fn();
const mockMarkSaved = jest.fn();
const mockFlush = jest.fn(async () => true);
const mockPushDocument = jest.fn();
let capturedChange: (changes: Record<string, unknown>) => boolean | Promise<boolean>;
let mockIsPro = true;
let mockSavedName = '';
let mockBeforeSync: (() => Promise<boolean>) | undefined;
let mockOnSynced: (() => void) | undefined;
const formValues: Record<string, unknown> = {};
const form = {
	control: {},
	getValues: jest.fn((name?: string) =>
		name
			? name
					.split('.')
					.reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], formValues)
			: formValues
	),
	setValue: jest.fn(),
	reset: jest.fn(),
};
const mockUseForm = jest.fn(() => form);
jest.mock('react-hook-form', () => ({ useForm: () => mockUseForm(), useWatch: () => formValues }));
jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => undefined }));
jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormField: ({
		name,
		render: renderField,
	}: {
		name: string;
		render: (props: {
			field: { name: string; value: string; onChange: () => void };
		}) => React.ReactNode;
	}) => renderField({ field: { name, value: '', onChange: jest.fn() } }),
	FormItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormLabel: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SavedMark: ({ name }: { name: string }) => <div data-testid={`saved-${name}`} />,
	FormInput: () => null,
	FormMessage: () => null,
	FormSegmentedControl: () => null,
	FormSelect: () => null,
	FormSwitch: () => null,
	SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useMarkSaved: () => mockMarkSaved,
	useSavedName: () => mockSavedName,
	useFormChangeHandler: (options: { onChange: typeof capturedChange }) => {
		capturedChange = options.onChange;
		return { flush: mockFlush };
	},
}));
jest.mock('@wcpos/components/dialog', () => ({
	useDialog: () => ({ close: jest.fn() }),
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: jest.requireActual('@wcpos/components/dialog').DialogFooter,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		variant,
	}: React.PropsWithChildren<{ testID?: string; variant?: string }>) => (
		<button data-testid={testID} data-variant={variant}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/lib/overlay', () => ({
	useOverlay: () => ({ presentation: 'right' }),
}));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => false }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@rn-primitives/dialog', () => ({
	Close: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../../components/coupon/coupon-form', () => ({
	CouponForm: () => null,
	couponFormSchema: {},
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: mockIsPro } }),
}));
jest.mock('../../hooks/mutations/use-mutation', () => ({
	useMutation: () => ({ create: jest.fn() }),
}));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('../../contexts/use-push-document', () => ({ usePushDocument: () => mockPushDocument }));
jest.mock('../coupon-actions', () => ({
	useCouponActions: (
		_record: unknown,
		callbacks: { beforeSync?: () => Promise<boolean>; onSynced?: () => void }
	) => {
		mockBeforeSync = callbacks.beforeSync;
		mockOnSynced = callbacks.onSynced;
		return { canDelete: false, canSync: true };
	},
	DeleteCouponDialog: () => null,
}));

const payload = { id: 42, meta_data: [] as { id?: number; key?: string; value?: unknown }[] };
const record = {
	uuid: 'coupon-42',
	payload,
	toMutableJSON: () => ({ payload }),
	getLatest: () => record,
} as unknown as EngineRecord<'coupons'>;
const renderForm = () => render(<EditCouponForm coupon={record} />);
beforeEach(() => {
	jest.clearAllMocks();
	for (const key of Object.keys(formValues)) delete formValues[key];
	Object.assign(formValues, {
		code: 'SAVE20',
		usage_limit: 3,
		date_expires_gmt: '2026-12-31T23:59:59',
		meta_data: [],
	});
	payload.meta_data = [];
	mockIsPro = true;
	mockBeforeSync = undefined;
	mockLocalPatch.mockResolvedValue({ document: record, changes: {} });
});

it('a code edit writes only the code and marks it', async () => {
	renderForm();
	await expect(capturedChange({ code: 'SAVE20' })).resolves.toBe(true);
	expect(mockLocalPatch).toHaveBeenCalledWith({ document: record, data: { code: 'SAVE20' } });
	expect(mockMarkSaved).toHaveBeenCalledWith(['code']);
});
it('writes a usage limit as a number', async () => {
	renderForm();
	await capturedChange({ usage_limit: 3 });
	expect(mockLocalPatch).toHaveBeenCalledWith({ document: record, data: { usage_limit: 3 } });
});
it('a cleared usage limit writes the 0 sentinel, never null (WooCommerce ignores null on write)', async () => {
	formValues.usage_limit = 0;
	renderForm();
	await capturedChange({ usage_limit: 0 });
	expect(mockLocalPatch).toHaveBeenCalledWith({ document: record, data: { usage_limit: 0 } });
});
it('Never expires writes date_expires_gmt as null, as the old Save did', async () => {
	formValues.date_expires_gmt = null;
	renderForm();
	await capturedChange({ date_expires_gmt: null });
	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: record,
		data: { date_expires_gmt: null },
	});
	expect(mockMarkSaved).toHaveBeenCalledWith(['date_expires_gmt']);
});
it('a failed write returns false and marks nothing', async () => {
	mockLocalPatch.mockResolvedValue(undefined);
	renderForm();
	await expect(capturedChange({ code: 'changed' })).resolves.toBe(false);
	expect(mockMarkSaved).not.toHaveBeenCalled();
});
it('read-only refuses the write', async () => {
	mockIsPro = false;
	renderForm();
	await expect(capturedChange({ code: 'changed' })).resolves.toBe(false);
	expect(mockLocalPatch).not.toHaveBeenCalled();
	expect(mockMarkSaved).not.toHaveBeenCalled();
});
it('gives Sync the autosave flush and resets from the store copy', () => {
	renderForm();
	expect(mockBeforeSync).toBe(mockFlush);
	mockOnSynced!();
	expect(form.reset).toHaveBeenCalledWith(payload);
});
it('queues the local edit without pushing the document again', async () => {
	renderForm();
	await capturedChange({ code: 'changed' });
	expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	expect(mockPushDocument).not.toHaveBeenCalled();
});
it('writes the meta root without blank rows and tombstones a removed earlier write', async () => {
	formValues.meta_data = [
		{ key: 'colour', value: 'red' },
		{ key: '', value: '' },
	];
	renderForm();
	await capturedChange({ 'meta_data.0.value': 'red' });
	expect(mockLocalPatch).toHaveBeenLastCalledWith({
		document: record,
		data: { meta_data: [{ key: 'colour', value: 'red' }] },
	});
	payload.meta_data = [{ id: 9, key: 'colour', value: 'red' }];
	formValues.meta_data = [];
	await capturedChange({ meta_data: [] });
	expect(mockLocalPatch).toHaveBeenLastCalledWith({
		document: record,
		data: { meta_data: [{ id: 9, key: 'colour', value: null }] },
	});
});

// Render the real shared form only in the placement case; existing writer tests stay isolated.
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: React.PropsWithChildren) => <>{children}</>,
	CollapsibleContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	CollapsibleTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../components/meta-data-form', () => ({
	MetaDataForm: () => null,
	metaDataSchema: {},
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../components/currency-input', () => ({ CurrencyInput: () => null }));
jest.mock('../../components/coupon/discount-amount-input', () => ({
	DiscountAmountInput: () => null,
}));
jest.mock('../../components/coupon/expiry-preset-chips', () => ({ ExpiryPresetChips: () => null }));
jest.mock('../../components/coupon/status-select', () => ({ StatusSelect: () => null }));
// Each mark sits in its row's trailing slot (the custom field rows' mark is MetaDataForm's own).
it('renders the newly covered Saved roots after their matching writes', async () => {
	const { CouponForm } = jest.requireActual('../../components/coupon/coupon-form');
	const roots = {
		discount_type: 'percent',
		usage_limit: 1,
		individual_use: true,
		free_shipping: true,
		status: 'draft',
	};
	Object.assign(formValues, roots);
	renderForm();
	const view = render(<CouponForm form={form} footer={{}} />);
	for (const [root, value] of Object.entries(roots)) {
		await capturedChange({ [root]: value });
		expect(mockLocalPatch).toHaveBeenLastCalledWith({ document: record, data: { [root]: value } });
		expect(mockMarkSaved).toHaveBeenLastCalledWith([root]);
		mockSavedName = root;
		view.rerender(<CouponForm form={form} footer={{}} />);
		// One-time use is a total of one: Total uses is withdrawn, so its mark shows once.
		expect(screen.getAllByTestId(`saved-${root}`)).toHaveLength(1);
	}
	mockSavedName = '';
});

// A shared form must hand roles to the real footer, not render the descriptor as a child.
it('renders add intent with Cancel, and edit Delete/Sync apart from Close', () => {
	const { CouponForm } = jest.requireActual('../../components/coupon/coupon-form');
	const view = render(
		<CouponForm
			form={form}
			footer={{
				intent: { label: 'Add coupon', testID: 'coupon-form-add' },
				close: { testID: 'coupon-form-close' },
			}}
		/>
	);
	expect(screen.getByTestId('coupon-form-close').textContent).toBe('Cancel');
	expect(screen.getByTestId('coupon-form-add').dataset.variant).toBe('default');
	view.rerender(
		<CouponForm
			form={form}
			footer={{
				destructive: { label: 'Delete', testID: 'coupon-modal-delete' },
				record: { label: 'Sync', testID: 'coupon-modal-sync' },
				close: { testID: 'coupon-form-close' },
			}}
		/>
	);
	expect(screen.getByTestId('coupon-form-close').textContent).toBe('Close');
	const remove = screen.getByTestId('coupon-modal-delete');
	const sync = screen.getByTestId('coupon-modal-sync');
	expect(remove.dataset.variant).toBe('outline-destructive');
	expect(sync.dataset.variant).toBe('outline');
	expect(remove.parentElement).toBe(sync.parentElement);
	expect(sync.parentElement).not.toBe(screen.getByTestId('coupon-form-close').parentElement);
	expect(Array.from(sync.parentElement!.children).map((el) => el.textContent)).toEqual([
		'Delete',
		'Sync',
	]);
});
