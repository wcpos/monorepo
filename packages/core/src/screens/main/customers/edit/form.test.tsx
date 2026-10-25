/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { ReadonlyEngineRecord } from '@wcpos/query';

import { EditCustomerForm } from './form';

const mockLocalPatch = jest.fn();
const mockMarkSaved = jest.fn();
const mockFlush = jest.fn(async () => true);
const mockPushDocument = jest.fn();
let capturedChange: (changes: Record<string, unknown>) => boolean | Promise<boolean>;
let mockIsPro = true;
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
	trigger: jest.fn(async () => true),
};
const mockUseForm = jest.fn(() => form);
jest.mock('react-hook-form', () => ({ useForm: () => mockUseForm() }));
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
	useFormChangeHandler: (options: { onChange: typeof capturedChange }) => {
		capturedChange = options.onChange;
		return { flush: mockFlush };
	},
}));
jest.mock('@wcpos/components/dialog', () => ({
	useDialog: () => ({ close: jest.fn() }),
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/button', () => ({ Button: () => null, ButtonText: () => null }));
jest.mock('../../components/customer/customer-form', () => ({
	CustomerForm: () => null,
	customerFormSchema: {},
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
jest.mock('../customer-actions', () => ({
	useCustomerActions: (
		_record: unknown,
		callbacks: { beforeSync?: () => Promise<boolean>; onSynced?: () => void }
	) => {
		mockBeforeSync = callbacks.beforeSync;
		mockOnSynced = callbacks.onSynced;
		return { canDelete: false, canSync: true };
	},
	DeleteCustomerDialog: () => null,
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: jest.fn() }),
}));
const payload = { id: 42, meta_data: [] as { id?: number; key?: string; value?: unknown }[] };
const record = {
	uuid: 'customer-42',
	payload,
	toMutableJSON: () => ({ payload }),
	getLatest: () => record,
} as unknown as ReadonlyEngineRecord<'customers'>;
const renderForm = () => render(<EditCustomerForm customer={record} />);
beforeEach(() => {
	jest.clearAllMocks();
	for (const key of Object.keys(formValues)) delete formValues[key];
	Object.assign(formValues, {
		first_name: 'Ada',
		billing: { first_name: '', city: 'London' },
		meta_data: [],
	});
	delete (payload as { first_name?: string }).first_name;
	payload.meta_data = [];
	mockIsPro = true;
	mockBeforeSync = undefined;
	mockLocalPatch.mockResolvedValue({ document: record, changes: {} });
});

it('a first-name edit fills an empty billing identity in the SAME patch, then levels the draft', async () => {
	renderForm();
	await expect(capturedChange({ first_name: 'Ada' })).resolves.toBe(true);
	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: record,
		data: { first_name: 'Ada', billing: { first_name: 'Ada', city: 'London' } },
	});
	expect(mockMarkSaved).toHaveBeenCalledWith(['first_name']);
	expect(form.setValue).toHaveBeenCalledWith('billing.first_name', 'Ada');
});
it('billing keeps following while it still equals the value the record held: a pause mid-word does not pin "Jo"', async () => {
	(payload as { first_name?: string }).first_name = 'Jo';
	formValues.first_name = 'John';
	formValues.billing = { first_name: 'Jo', city: 'London' };
	renderForm();
	await capturedChange({ first_name: 'John' });
	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: record,
		data: { first_name: 'John', billing: { first_name: 'John', city: 'London' } },
	});
	expect(form.setValue).toHaveBeenCalledWith('billing.first_name', 'John');
});
it('an invalid billing draft does not ride along with the mirror: the stored billing carries it', async () => {
	(payload as { billing?: unknown }).billing = { first_name: '', city: 'Paris', email: 'ok@x.io' };
	formValues.billing = { first_name: '', city: 'Paris', email: 'not-an-email' };
	form.trigger.mockResolvedValueOnce(false);
	renderForm();
	await expect(capturedChange({ first_name: 'Ada' })).resolves.toBe(true);
	expect(form.trigger).toHaveBeenCalledWith('billing');
	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: record,
		data: { first_name: 'Ada', billing: { first_name: 'Ada', city: 'Paris', email: 'ok@x.io' } },
	});
	expect(form.setValue).toHaveBeenCalledWith('billing.first_name', 'Ada');
	delete (payload as { billing?: unknown }).billing;
});
it('a billing identity typed while the write was in flight is not levelled away', async () => {
	mockLocalPatch.mockImplementationOnce(async () => {
		(formValues.billing as Record<string, unknown>).first_name = 'Grace';
		return { document: record, changes: {} };
	});
	renderForm();
	await expect(capturedChange({ first_name: 'Ada' })).resolves.toBe(true);
	expect(form.setValue).not.toHaveBeenCalled();
});
it('a password write overlapping a first-name write does not evict the name mirror', async () => {
	(payload as { first_name?: string }).first_name = 'Jo';
	formValues.first_name = 'John';
	formValues.password = 'secret';
	formValues.billing = { first_name: 'Jo', city: 'London' };
	let release: (value: { document: unknown; changes: object }) => void = () => {};
	mockLocalPatch.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
	renderForm();
	const nameWrite = capturedChange({ first_name: 'John' });
	await Promise.resolve();
	await expect(capturedChange({ password: 'secret' })).resolves.toBe(true);
	release({ document: record, changes: {} });
	await expect(nameWrite).resolves.toBe(true);
	expect(form.setValue).toHaveBeenCalledWith('billing.first_name', 'John');
});
it('does not overwrite a billing identity the cashier set apart', async () => {
	formValues.billing = { first_name: 'Grace' };
	renderForm();
	await capturedChange({ first_name: 'Ada' });
	expect(mockLocalPatch).toHaveBeenCalledWith({ document: record, data: { first_name: 'Ada' } });
	expect(form.setValue).not.toHaveBeenCalled();
});
it('a failed write does not level the draft', async () => {
	mockLocalPatch.mockResolvedValue(undefined);
	renderForm();
	await capturedChange({ first_name: 'Ada' });
	expect(form.setValue).not.toHaveBeenCalled();
});
it('a nested billing path validates and writes the whole address root', async () => {
	renderForm();
	await capturedChange({ 'billing.city': 'London' });
	expect(form.trigger).toHaveBeenCalledWith('billing');
	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: record,
		data: { billing: { first_name: '', city: 'London' } },
	});
	expect(mockMarkSaved).toHaveBeenCalledWith(['billing']);
});
it('an address with an invalid field elsewhere in it is not written for a sibling edit', async () => {
	form.trigger.mockResolvedValueOnce(false);
	renderForm();
	await expect(capturedChange({ 'billing.city': 'London' })).resolves.toBe(false);
	expect(mockLocalPatch).not.toHaveBeenCalled();
	expect(mockMarkSaved).not.toHaveBeenCalled();
});
it('drops a tax id row with an empty value', async () => {
	formValues.tax_ids = [
		{ type: 'eu_vat', value: '' },
		{ type: 'eu_vat', value: 'DE123456789' },
	];
	renderForm();
	await capturedChange({ 'tax_ids.1.value': 'DE123456789' });
	expect(mockLocalPatch).toHaveBeenCalledWith({
		document: record,
		data: { tax_ids: [{ type: 'eu_vat', value: 'DE123456789' }] },
	});
});
it('a failed write returns false and marks nothing', async () => {
	mockLocalPatch.mockResolvedValue(undefined);
	renderForm();
	await expect(capturedChange({ first_name: 'changed' })).resolves.toBe(false);
	expect(mockMarkSaved).not.toHaveBeenCalled();
});
it('read-only refuses the write', async () => {
	mockIsPro = false;
	renderForm();
	await expect(capturedChange({ first_name: 'changed' })).resolves.toBe(false);
	expect(mockLocalPatch).not.toHaveBeenCalled();
	expect(mockMarkSaved).not.toHaveBeenCalled();
	expect(form.setValue).not.toHaveBeenCalled();
});
it('gives Sync the autosave flush and resets from the store copy', () => {
	renderForm();
	expect(mockBeforeSync).toBe(mockFlush);
	mockOnSynced!();
	expect(form.reset).toHaveBeenCalledWith(payload);
});
it('queues the local edit without pushing the document again', async () => {
	renderForm();
	await capturedChange({ first_name: 'changed' });
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
jest.mock('../../components/billing-address-form', () => ({
	BillingAddressForm: () => null,
	billingAddressSchema: { shape: {} },
}));
jest.mock('../../components/shipping-address-form', () => ({
	ShippingAddressForm: () => null,
	shippingAddressSchema: { shape: {} },
}));
jest.mock('../../components/customer/tax-ids-form', () => ({
	TaxIdsForm: () => null,
	taxIdsFormSchema: {},
}));
it('renders the meta_data Saved root after its matching write, but none for read-only role', async () => {
	const { CustomerForm } = jest.requireActual('../../components/customer/customer-form');
	renderForm();
	render(<CustomerForm form={form} footer={null} />);
	formValues.meta_data = [{ key: 'colour', value: 'red' }];
	await capturedChange({ 'meta_data.0.value': 'red' });
	expect(mockLocalPatch).toHaveBeenLastCalledWith({
		document: record,
		data: { meta_data: [{ key: 'colour', value: 'red' }] },
	});
	expect(mockMarkSaved).toHaveBeenLastCalledWith(['meta_data']);
	expect(screen.getByTestId('saved-meta_data')).toBeTruthy();
	expect(screen.queryByTestId('saved-role')).toBeNull();
});
