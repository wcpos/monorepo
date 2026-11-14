/** @jest-environment jsdom */
import * as React from 'react';

import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { PENDING_USER_DB_READ } from '@wcpos/query/user-db';

import {
	inRoom,
	isAllStores,
	ReportsDirectoriesProvider,
	ReportsFilterScopeProvider,
	useReportsDirectories,
	useReportsFilterScope,
} from './scope';

type Row = { id: number; name?: string; display_name?: string };
const mockCashiers = new BehaviorSubject<Row[] | typeof PENDING_USER_DB_READ>(PENDING_USER_DB_READ);
const mockStores = new BehaviorSubject<Row[] | typeof PENDING_USER_DB_READ>(PENDING_USER_DB_READ);
const mockState = {
	filters: {} as { store?: string; register?: string; cashier?: string | number },
	registerNames: {} as Record<string, string>,
	registerReady: false,
};
// One session object: a new `site` per render would resubscribe the directories.
const mockSession = { site: {}, wpCredentials: {} };
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeSiteCredentials: () => mockCashiers,
	observeCredentialStores: () => mockStores,
}));
jest.mock('../../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../query', () => ({ useQueryState: () => ({ filters: mockState.filters }) }));
jest.mock('../../../services/register/use-register-names', () => ({
	useRegisterNames: () => mockState.registerNames,
	useRegisterNamesReady: () => mockState.registerReady,
}));
jest.mock('../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'bound', registerName: 'Bound till' }),
}));

const twoStores = [
	{ id: 7, name: 'Front shop' },
	{ id: 9, name: '' },
];
beforeEach(() => {
	mockCashiers.next(PENDING_USER_DB_READ);
	mockStores.next(PENDING_USER_DB_READ);
	mockState.filters = {};
	mockState.registerNames = {};
	mockState.registerReady = false;
});

// The sentinel alone is a single-store install's own scope; a numeric filter is one store.
it.each([
	['woocommerce-pos', twoStores, true],
	['woocommerce-pos', [{ id: 9 }], false],
	['woocommerce-pos', undefined, false],
	['9', twoStores, false],
	[undefined, twoStores, false],
])('the All-stores rule: store %s over %j is %s', (store, stores, expected) => {
	expect(isAllStores(store, stores as never)).toBe(expected);
});

const identity = (store: string, register = 'front', cashier?: string) => [
	{ key: '_pos_store', value: store },
	{ key: '_wcpos_register', value: register },
	...(cashier ? [{ key: '_pos_user', value: cashier }] : []),
];
const scope = { store: '9', registerId: 'front' };
const posParent = (store: string, register?: string) => ({
	created_via: 'woocommerce-pos',
	meta_data: identity(store, register),
});
// Parent identity wins over the record's; no parent falls back to the record's own POS identity.
it.each([
	['an order in the room', scope, { meta_data: identity('9') }, undefined, true],
	[
		'a refund in the room by its parent',
		scope,
		{ meta_data: identity('10') },
		posParent('9'),
		true,
	],
	[
		'a refund of another store by its parent',
		scope,
		{ meta_data: identity('9') },
		posParent('10'),
		false,
	],
	['another store, no parent', scope, { meta_data: identity('10') }, undefined, false],
	['another register', scope, { meta_data: identity('9', 'back') }, undefined, false],
	['unassigned, no parent', scope, { meta_data: [] }, undefined, false],
	['unassigned under no store filter', { registerId: '' }, { meta_data: [] }, undefined, true],
	[
		'a non-POS parent with no register',
		{ store: '9' },
		{},
		{ created_via: 'checkout', meta_data: identity('10') },
		true,
	],
	['a non-POS parent under a register', scope, {}, { created_via: 'checkout' }, false],
	[
		'a POS parent under the sentinel',
		{ store: 'woocommerce-pos' },
		{},
		{ created_via: 'woocommerce-pos', meta_data: identity('0') },
		true,
	],
	[
		'a non-POS parent under the sentinel and a register',
		{ store: 'woocommerce-pos', registerId: 'front' },
		{},
		{ created_via: 'checkout', meta_data: identity('0') },
		false,
	],
	[
		'store zero under the sentinel, no parent',
		{ store: 'woocommerce-pos' },
		{ meta_data: identity('0') },
		undefined,
		true,
	],
	[
		'another cashier',
		{ ...scope, cashierId: '7' },
		{ meta_data: identity('9', 'front', '8') },
		undefined,
		false,
	],
	[
		'the cashier',
		{ ...scope, cashierId: '7' },
		{ meta_data: identity('9', 'front', '7') },
		undefined,
		true,
	],
])('inRoom: %s', (_name, where, record, parent, expected) => {
	expect(inRoom(where, record as never, parent as never)).toBe(expected);
});

function Scope({ children }: React.PropsWithChildren) {
	return (
		<ReportsDirectoriesProvider>
			<ReportsFilterScopeProvider>{children}</ReportsFilterScopeProvider>
		</ReportsDirectoriesProvider>
	);
}
const read = () =>
	renderHook(() => ({ ...useReportsFilterScope(), directories: useReportsDirectories() }), {
		wrapper: Scope,
	});

it('decodes the filters once, with names Unknown until each directory answers', () => {
	mockState.filters = { store: '9', register: 'r', cashier: 7 };
	const { result } = read();
	expect(result.current).toMatchObject({
		store: '9',
		storeId: 9,
		allStores: false,
		registerId: 'r',
		cashierId: '7',
		registerLabel: 'common.unknown',
		names: { cashier: {}, register: {}, store: {} },
		namesReady: { cashier: false, register: false, store: false },
	});
	expect(result.current.directories).toEqual({ cashiers: undefined, stores: undefined });
	act(() => {
		mockCashiers.next([{ id: 7, display_name: 'Pat' }, { id: 8 }]);
		mockStores.next(twoStores);
	});
	expect(result.current.names.cashier).toEqual({ 7: 'Pat', 8: 'common.unknown' });
	expect(result.current.names.store).toEqual({ 7: 'Front shop', 9: 'common.unknown' });
	expect(result.current.namesReady).toEqual({ cashier: true, register: false, store: true });
	expect(result.current.directories.cashiers).toHaveLength(2);
});

it.each([
	[
		'All stores on a multi-store site',
		{ store: 'woocommerce-pos', register: 'r' },
		'reports.all_stores',
	],
	['the register by name', { store: '9', register: 'r' }, 'Front'],
	['the bound register its name has not reached', { store: '9', register: 'bound' }, 'Bound till'],
	['an unnamed register', { store: '9', register: 'gone' }, 'common.unknown'],
	['no register', { store: '9' }, 'reports.all_registers'],
	['the sentinel on a single-store site', { store: 'woocommerce-pos' }, 'reports.all_registers'],
])('labels %s', (_name, filters: { store: string; register?: string }, label) => {
	mockState.filters = filters;
	mockState.registerNames = { r: 'Front' };
	mockState.registerReady = true;
	const { result } = read();
	act(() => mockStores.next(filters.register === 'r' ? twoStores : [{ id: 9 }]));
	expect(result.current.registerLabel).toBe(label);
	expect(result.current.storeId).toBe(filters.store === '9' ? 9 : undefined);
});

it('throws outside its providers', () => {
	jest.spyOn(console, 'error').mockImplementation(() => {});
	expect(() => renderHook(() => useReportsFilterScope())).toThrow(/ReportsFilterScopeProvider/);
	expect(() => renderHook(() => useReportsDirectories())).toThrow(/ReportsDirectoriesProvider/);
	jest.mocked(console.error).mockRestore();
});
