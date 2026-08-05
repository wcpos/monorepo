/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { parseRemoteId, useCashierLabel } from './use-cashier-label';

import type { RxDocument } from 'rxdb';

type EngineDocument = {
	id: string;
	wooCustomerId: number;
	payload: { first_name?: string; last_name?: string };
};

const mockFormat = jest.fn((json: { id?: number; first_name?: string; last_name?: string }) => {
	const name = [json.first_name, json.last_name].filter(Boolean).join(' ');
	return name || `ID: ${json.id}`;
});
const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(null);
const findOne = jest.fn(() => ({ $: document$.asObservable() }));
const database = { collections: { customers: { findOne } } };
const engine = {
	active: () => ({ database }),
	ready: Promise.resolve({ database }),
	db$: (subscriber: (value: typeof database) => void) => {
		subscriber(database);
		return () => undefined;
	},
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
		id: 'customer-uuid',
		wooCustomerId: 42,
		payload: { first_name: 'Ada', last_name: 'Lovelace' },
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

	it('resolves and formats an engine-resident customer document', async () => {
		document$.next(fakeCustomer());

		const { result } = renderHook(() => useCashierLabel('42'));

		await waitFor(() => expect(result.current.label).toBe('Ada Lovelace'));
		expect(findOne).toHaveBeenCalledWith({ selector: { wooCustomerId: 42 } });
		expect(result.current.document?.uuid).toBe('customer-uuid');
		expect(result.current.document?.id).toBe(42);
		expect(result.current.document?.first_name).toBe('Ada');
		expect(result.current.document?.last_name).toBe('Lovelace');
	});

	it('falls back to the formatted id when the engine document is absent', () => {
		const { result } = renderHook(() => useCashierLabel(99));

		expect(result.current).toEqual({ id: 99, label: 'ID: 99', document: undefined });
	});

	it('returns an empty label without querying when the id is invalid', () => {
		const { result } = renderHook(() => useCashierLabel('not-a-number'));

		expect(findOne).not.toHaveBeenCalled();
		expect(result.current).toEqual({ id: undefined, label: '', document: undefined });
	});
});
