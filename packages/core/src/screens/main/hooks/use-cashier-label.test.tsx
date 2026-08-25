/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { parseRemoteId, useCashierLabel } from './use-cashier-label';

import type { RxDocument } from 'rxdb';

type EngineDocument = {
	uuid: string;
	remoteId: string;
	payload: { id?: number; first_name?: string; last_name?: string };
};

const mockFormat = jest.fn((json: { id?: number; first_name?: string; last_name?: string }) => {
	const name = [json.first_name, json.last_name].filter(Boolean).join(' ');
	return name || `ID: ${json.id}`;
});
const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(null);
const findOne = jest.fn(() => ({ $: document$.asObservable() }));
const database = { collections: { customers: { findOne } } };
const active = jest.fn(() => ({ database }));
const db$ = jest.fn((subscriber: (value: typeof database) => void) => {
	subscriber(database);
	return () => undefined;
});
const engine = {
	active,
	ready: Promise.resolve(),
	whenActive: async () => active(),
	db$,
};
const manager = { engine };

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => manager,
}));

jest.mock('./use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: mockFormat }),
}));

function fakeCustomer(): RxDocument<EngineDocument> {
	const json = {
		uuid: 'customer-uuid',
		remoteId: '42',
		payload: { id: 42, first_name: 'Ada', last_name: 'Lovelace' },
	};
	return {
		...json,
		$: new BehaviorSubject(json).asObservable(),
		collection: { name: 'customers' },
		getLatest: () => fakeCustomer(),
		toJSON: () => json,
	} as unknown as RxDocument<EngineDocument>;
}

describe('parseRemoteId', () => {
	it('normalizes numeric metadata values and rejects invalid ids', () => {
		expect(parseRemoteId(42)).toBe(42);
		expect(parseRemoteId('42')).toBe(42);
		expect(parseRemoteId(' 0042 ')).toBe(42);
		expect(parseRemoteId('42abc')).toBeUndefined();
		expect(parseRemoteId('')).toBeUndefined();
		expect(parseRemoteId(undefined)).toBeUndefined();
	});
});

describe('useCashierLabel', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		document$.next(null);
	});

	it('resolves and formats an engine-resident customer record', async () => {
		document$.next(fakeCustomer());

		const { result } = renderHook(() => useCashierLabel('42'));

		await waitFor(() => expect(result.current.label).toBe('Ada Lovelace'));
		expect(findOne).toHaveBeenCalledWith({ selector: { remoteId: '42' } });
		expect(result.current.record?.uuid).toBe('customer-uuid');
		expect(result.current.record?.payload.id).toBe(42);
		expect(result.current.record?.payload.first_name).toBe('Ada');
		expect(result.current.record?.payload.last_name).toBe('Lovelace');
	});

	it('falls back to the formatted id when the engine document is absent', () => {
		const { result } = renderHook(() => useCashierLabel(99));

		expect(result.current).toEqual({ id: 99, label: 'ID: 99', record: undefined });
	});

	it('updates one mounted label when the cashier document arrives', async () => {
		const { result } = renderHook(() => useCashierLabel(42));

		expect(result.current).toEqual({ id: 42, label: 'ID: 42', record: undefined });

		act(() => document$.next(fakeCustomer()));

		await waitFor(() => expect(result.current.label).toBe('Ada Lovelace'));
		expect(result.current.record?.payload.id).toBe(42);
	});

	it.each([undefined, 'not-a-number'])('returns an empty label without querying for %p', (id) => {
		const { result } = renderHook(() => useCashierLabel(id));

		expect(findOne).not.toHaveBeenCalled();
		expect(result.current).toEqual({ id: undefined, label: '', record: undefined });
	});
});
