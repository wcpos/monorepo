/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { EditCouponForm } from './form';

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
};
const mockUseForm = jest.fn(() => form);
jest.mock('react-hook-form', () => ({ useForm: () => mockUseForm() }));
jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => undefined }));
jest.mock('@wcpos/components/form', () => ({
	SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useMarkSaved: () => mockMarkSaved,
	useFormChangeHandler: (options: { onChange: typeof capturedChange }) => {
		capturedChange = options.onChange;
		return { flush: mockFlush };
	},
}));
jest.mock('@wcpos/components/dialog', () => ({ useDialog: () => ({ close: jest.fn() }) }));
jest.mock('@wcpos/components/button', () => ({ Button: () => null, ButtonText: () => null }));
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
