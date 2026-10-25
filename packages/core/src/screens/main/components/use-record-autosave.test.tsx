/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useRecordAutosave } from './use-record-autosave';

import type { UseFormReturn } from 'react-hook-form';

const mockMarkSaved = jest.fn();
const mockFlush = jest.fn(async () => true);
let change: (changes: Record<string, unknown>) => Promise<boolean>;
jest.mock('@wcpos/components/form', () => ({
	useMarkSaved: () => mockMarkSaved,
	useFormChangeHandler: (options: { onChange: typeof change }) => {
		change = options.onChange;
		return { flush: mockFlush };
	},
}));

type Values = Record<string, unknown>;
type Payload = { meta_data?: { id?: number; key?: string; value?: unknown }[] } & Values;
const values: Values = {};
const form = {
	getValues: jest.fn((root: string) => values[root]),
	trigger: jest.fn(async () => true),
} as unknown as UseFormReturn<Values>;
const save = jest.fn<Promise<boolean | undefined>, [Partial<Payload>]>();
let payload: Payload;
function mount(options: Partial<Parameters<typeof useRecordAutosave<Values, Payload>>[0]> = {}) {
	return renderHook(() => useRecordAutosave({ form, stored: () => payload, save, ...options }));
}
beforeEach(() => {
	jest.clearAllMocks();
	for (const key of Object.keys(values)) delete values[key];
	payload = { meta_data: [] };
	save.mockResolvedValue(true);
});

it('readOnly refuses before reading values and marks nothing', async () => {
	const before = jest.fn();
	mount({ readOnly: true, before });
	expect(await change({ name: 'Ada' })).toBe(false);
	expect(before).not.toHaveBeenCalled();
	expect(form.getValues).not.toHaveBeenCalled();
	expect(save).not.toHaveBeenCalled();
	expect(mockMarkSaved).not.toHaveBeenCalled();
});
it('before false refuses before reading values', async () => {
	const before = jest.fn(async () => false);
	mount({ before });
	expect(await change({ 'billing.city': 'London' })).toBe(false);
	expect(before).toHaveBeenCalledWith('billing');
	expect(form.trigger).not.toHaveBeenCalled();
	expect(form.getValues).not.toHaveBeenCalled();
	expect(save).not.toHaveBeenCalled();
	expect(mockMarkSaved).not.toHaveBeenCalled();
});
it.each(['billing', 'shipping'])('refuses an invalid whole %s root', async (root) => {
	jest.mocked(form.trigger).mockResolvedValueOnce(false);
	mount();
	expect(await change({ [`${root}.city`]: 'London' })).toBe(false);
	expect(form.trigger).toHaveBeenCalledWith(root);
	expect(form.getValues).not.toHaveBeenCalled();
	expect(save).not.toHaveBeenCalled();
});
it('drops blank tax ID rows before custom wiring', async () => {
	values.tax_ids = [{ value: '' }, {}, { value: 'DE123' }, { value: 0 }];
	const wire = jest.fn();
	mount({ wire });
	await change({ 'tax_ids.2.value': 'DE123' });
	expect(save).toHaveBeenCalledWith({ tax_ids: [{ value: 'DE123' }, { value: 0 }] });
	expect(wire).not.toHaveBeenCalled();
});
it('reconciles current stored meta and tombstones a removed written key', async () => {
	values.meta_data = [
		{ key: 'colour', value: 'red' },
		{ key: '', value: '' },
	];
	mount();
	await change({ 'meta_data.0.value': 'red' });
	expect(save).toHaveBeenLastCalledWith({ meta_data: [{ key: 'colour', value: 'red' }] });
	payload = { meta_data: [{ id: 9, key: 'colour', value: 'red' }] };
	values.meta_data = [];
	await change({ meta_data: [] });
	expect(save).toHaveBeenLastCalledWith({ meta_data: [{ id: 9, key: 'colour', value: null }] });
});
it('filters the meta draft before reconciliation rather than through custom wiring', async () => {
	values.meta_data = [
		{ key: 'protected', value: 'bad' },
		{ key: 'colour', value: 'red' },
	];
	payload.meta_data = [{ id: 9, key: 'colour', value: 'blue' }];
	const wire = jest.fn();
	mount({ metaDraft: (rows) => rows.filter((row) => row.key !== 'protected'), wire });
	await change({ meta_data: values.meta_data });
	expect(save).toHaveBeenCalledWith({ meta_data: [{ id: 9, key: 'colour', value: 'red' }] });
	expect(wire).not.toHaveBeenCalled();
});
it('patch replaces the default patch and receives the custom wire value', async () => {
	values.name = 'Ada';
	mount({
		wire: (_root, value) => String(value).toUpperCase(),
		patch: (_root, value) => ({ alias: value }),
	});
	await change({ name: 'Ada' });
	expect(save).toHaveBeenCalledWith({ alias: 'ADA' });
});
it('awaits an async patch (the customer mirror validates the billing root first)', async () => {
	values.first_name = 'Ada';
	mount({ patch: async (root, value) => ({ [root]: value, billing: { first_name: value } }) });
	await change({ first_name: 'Ada' });
	expect(save).toHaveBeenCalledWith({ first_name: 'Ada', billing: { first_name: 'Ada' } });
});
it.each([true, false, undefined])(
	'after sees written=%s; only a truthy save marks the root',
	async (written) => {
		save.mockResolvedValue(written);
		values.name = 'Ada';
		const after = jest.fn();
		const { result } = mount({ patch: (root, value) => ({ data: { [root]: value }, after }) });
		expect(result.current.flush).toBe(mockFlush);
		expect(await change({ name: 'Ada' })).toBe(Boolean(written));
		expect(save).toHaveBeenCalledWith({ name: 'Ada' });
		expect(after).toHaveBeenCalledWith(Boolean(written));
		if (written) expect(mockMarkSaved).toHaveBeenCalledWith(['name']);
		else expect(mockMarkSaved).not.toHaveBeenCalled();
	}
);
