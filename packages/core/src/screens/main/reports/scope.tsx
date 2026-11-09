import * as React from 'react';

import { filter } from 'rxjs';
import { useObservableState } from 'observable-hooks';

import { wooMetaCarrier } from '@wcpos/sync-core';
import {
	observeCredentialStores,
	observeSiteCredentials,
	PENDING_USER_DB_READ,
	type ReadonlyStoreRecord,
	type ReadonlyWpCredentialsRecord,
} from '@wcpos/query/user-db';

import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useQueryState } from '../../../query';
import { useRegisterBinding } from '../../../services/register/use-register-binding';
import {
	useRegisterNames,
	useRegisterNamesReady,
} from '../../../services/register/use-register-names';

import type { OrderPayload } from './context';

/** A POS order's `created_via`, and the `store` filter's whole-site sentinel (store 0). */
export const POS_SOURCE = 'woocommerce-pos';

/** The cashier and store directories, read once for both rooms; undefined until each answers. */
export interface ReportsDirectories {
	cashiers?: ReadonlyWpCredentialsRecord[];
	stores?: ReadonlyStoreRecord[];
}

/** The Sales query's store, register and cashier filters, decoded once with the names they show. */
export interface ReportsFilterScope {
	/** The `store` filter as written: a store id, the sentinel, or none. */
	store?: string | number;
	/** The viewed store's id; undefined for the sentinel, which keeps the bound till's day. */
	storeId?: number;
	allStores: boolean;
	registerId?: string;
	cashierId?: string;
	/** All stores, the register's name, or All registers: what the printed scope line names. */
	registerLabel: string;
	names: {
		cashier: Record<string, string>;
		register: Record<string, string>;
		store: Record<string, string>;
	};
	/** Each directory has answered: a name read before then is Unknown. */
	namesReady: { cashier: boolean; register: boolean; store: boolean };
}

/** The sentinel is also a single-store install's own scope; All stores needs stores to choose from. */
export const isAllStores = (
	store: ReportsFilterScope['store'],
	stores: ReportsDirectories['stores']
) => store === POS_SOURCE && (stores?.length ?? 0) > 1;

type Identified = Pick<OrderPayload, 'meta_data'>;
/**
 * Whether a record belongs to the scope by its POS identity, read from its local parent when there
 * is one. With no register, a non-POS parent joins the store scope (ledger line 37); the sentinel
 * matches a parent by `created_via`.
 */
export function inRoom(
	{ store, registerId, cashierId }: Pick<ReportsFilterScope, 'store' | 'registerId' | 'cashierId'>,
	record: Identified,
	parent?: Identified & Pick<OrderPayload, 'created_via'>
) {
	const identity = wooMetaCarrier.readIdentity((parent ?? record).meta_data);
	return (
		(!store ||
			(!registerId && !!parent && parent.created_via !== POS_SOURCE) ||
			(parent && !/^\d+$/.test(String(store))
				? parent.created_via === store
				: identity.storeId === String(store === POS_SOURCE ? 0 : store))) &&
		(!registerId || identity.registerId === registerId) &&
		(!cashierId || identity.cashierId === cashierId)
	);
}

const DirectoriesContext = React.createContext<ReportsDirectories | undefined>(undefined);
const FilterScopeContext = React.createContext<ReportsFilterScope | undefined>(undefined);

export function ReportsDirectoriesProvider({ children }: React.PropsWithChildren) {
	const { site, wpCredentials } = useStoreSession();
	const cashiersSource = React.useMemo(
		() => observeSiteCredentials(site).pipe(filter((value) => value !== PENDING_USER_DB_READ)),
		[site]
	);
	const storesSource = React.useMemo(
		() =>
			observeCredentialStores(wpCredentials).pipe(
				filter((value) => value !== PENDING_USER_DB_READ)
			),
		[wpCredentials]
	);
	const cashiers = useObservableState(cashiersSource);
	const stores = useObservableState(storesSource);
	const value = React.useMemo(() => ({ cashiers, stores }), [cashiers, stores]);
	return <DirectoriesContext.Provider value={value}>{children}</DirectoriesContext.Provider>;
}

export function useReportsDirectories() {
	const value = React.useContext(DirectoriesContext);
	if (!value)
		throw new Error('useReportsDirectories must be used within ReportsDirectoriesProvider');
	return value;
}

/** Inside the Sales query state, below `ReportsDirectoriesProvider`. */
export function ReportsFilterScopeProvider({ children }: React.PropsWithChildren) {
	const t = useT();
	const { store, register: registerId, cashier } = useQueryState<'orders'>().filters;
	const { cashiers, stores } = useReportsDirectories();
	const storeId = Number.isFinite(Number(store)) ? Number(store) : undefined;
	const register = useRegisterNames(storeId),
		registerReady = useRegisterNamesReady(storeId);
	const { registerId: boundId, registerName: boundName } = useRegisterBinding();
	const value = React.useMemo<ReportsFilterScope>(() => {
		const allStores = isAllStores(store, stores);
		return {
			store,
			storeId,
			allStores,
			registerId,
			cashierId: cashier === undefined ? undefined : String(cashier),
			registerLabel: allStores
				? t('reports.all_stores')
				: registerId
					? register[registerId] || (boundId === registerId ? boundName : '') || t('common.unknown')
					: t('reports.all_registers'),
			names: {
				cashier: Object.fromEntries(
					(cashiers ?? []).map((row) => [String(row.id), row.display_name || t('common.unknown')])
				),
				register,
				store: Object.fromEntries(
					(stores ?? []).map((row) => [String(row.id), row.name || t('common.unknown')])
				),
			},
			namesReady: { cashier: !!cashiers, register: registerReady, store: !!stores },
		};
	}, [
		t,
		store,
		storeId,
		registerId,
		cashier,
		cashiers,
		stores,
		register,
		registerReady,
		boundId,
		boundName,
	]);
	return <FilterScopeContext.Provider value={value}>{children}</FilterScopeContext.Provider>;
}

export function useReportsFilterScope() {
	const value = React.useContext(FilterScopeContext);
	if (!value)
		throw new Error('useReportsFilterScope must be used within ReportsFilterScopeProvider');
	return value;
}
