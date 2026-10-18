import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';

import { Button, ButtonText } from '@wcpos/components/button';
import { EmptyState } from '@wcpos/components/empty-state';
import { ListItem } from '@wcpos/components/list-item';
import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import {
	observeCredentialStores,
	PENDING_USER_DB_READ,
	type ReadonlySiteRecord,
	type ReadonlyStoreRecord,
	type ReadonlyWpCredentialsRecord,
} from '@wcpos/query/user-db';
import { getLogger } from '@wcpos/utils/logger';

import { resolvePreselectedStore, storeListsEqual } from './store-select.helpers';
import { useT } from '../../../contexts/translations';
import { useUserValidation } from '../../../hooks/use-user-validation';
import { useRegister } from '../../../services/register/use-register';

const storeLogger = getLogger(['wcpos', 'auth', 'stores']);

// Survive Suspense retries without rebuilding the read; each cashier has their own resource.
type StoreResource = ObservableResource<
	ReadonlyStoreRecord[] | typeof PENDING_USER_DB_READ,
	ReadonlyStoreRecord[]
>;
const resourcesByCredentials = new WeakMap<WPCredentialsDocument, StoreResource>();

/** `numeric` so "Store 2" precedes "Store 10"; `base` so case never decides order. */
const storeCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Stable, human order for the store picker.
 *
 * The query below has no `sort`, so RxDB falls back to the collection's default
 * index and returns stores in `localID` order — and `localID` is a SHA-256 hash
 * of {user, site, wpCredentials, store}. The list therefore arrived in an order
 * that looked arbitrary AND RESHUFFLED between logins, because a fresh login
 * mints a new wpCredentials uuid and re-hashes every localID. A cashier opening
 * this screen expects to find their store where it was last time, so sort by the
 * only thing they actually read — the name — and fall back to the numeric store
 * id so blank or duplicate names still land in a fixed order.
 */
function sortStores(stores: ReadonlyStoreRecord[]): ReadonlyStoreRecord[] {
	return [...stores].sort((a, b) => {
		const byName = storeCollator.compare(a.name ?? '', b.name ?? '');
		if (byName !== 0) return byName;
		return (Number(a.id) || 0) - (Number(b.id) || 0);
	});
}

interface StoreSelectProps {
	site: ReadonlySiteRecord;
	wpUser: ReadonlyWpCredentialsRecord;
	selectedStoreId: string | null;
	onStoreSelect: (storeId: string | null) => void;
	onLogin: (storeId: string) => void;
}

/**
 * Store selection and login button — separated because it uses Suspense
 * to resolve the stores population from the selected user.
 */
export function StoreSelect(props: StoreSelectProps) {
	// The Suspense hook retains state across resource changes; a cashier switch needs a new reader.
	return <StoreSelectReader key={props.wpUser.uuid} {...props} />;
}

function StoreSelectReader({
	site,
	wpUser,
	selectedStoreId,
	onStoreSelect,
	onLogin,
}: StoreSelectProps) {
	const t = useT();
	const register = useRegister();
	const { isValid, isLoading: isValidating } = useUserValidation({ site, wpUser });

	let resource = resourcesByCredentials.get(wpUser);
	if (!resource) {
		// The constructor subscribes synchronously, so an error can precede cache insertion.
		const holder: { resource?: StoreResource; failed: boolean } = { failed: false };
		resource = new ObservableResource(
			observeCredentialStores(wpUser).pipe(
				map((value) => (value === PENDING_USER_DB_READ ? value : sortStores(value))),
				distinctUntilChanged((a, b) =>
					a === PENDING_USER_DB_READ || b === PENDING_USER_DB_READ ? a === b : storeListsEqual(a, b)
				),
				tap((resolved) => {
					if (resolved === PENDING_USER_DB_READ) return;
					storeLogger.debug('[stores] StoreSelect stores resolved', {
						context: {
							wpUserUuid: wpUser.uuid,
							storeCount: resolved.length,
							storeIDs: resolved.map((s) => s.id),
							storeLocalIDs: resolved.map((s) => s.localID),
						},
					});
				}),
				tap({
					error: () => {
						holder.failed = true;
						if (holder.resource && resourcesByCredentials.get(wpUser) === holder.resource) {
							resourcesByCredentials.delete(wpUser);
						}
					},
				})
			),
			(
				value: ReadonlyStoreRecord[] | typeof PENDING_USER_DB_READ
			): value is ReadonlyStoreRecord[] => value !== PENDING_USER_DB_READ
		);
		holder.resource = resource;
		if (!holder.failed) resourcesByCredentials.set(wpUser, resource);
	}

	const offeredStores = useObservableSuspense(resource);
	const preselectedStore = resolvePreselectedStore(
		offeredStores,
		register?.sites[site.uuid!]?.store_id
	);
	// An accessible binding follows the same selection and UI path as a lone store.
	const stores = React.useMemo(
		() => (preselectedStore ? [preselectedStore] : offeredStores),
		[offeredStores, preselectedStore]
	);

	// The parent holds the cashier's explicit pick; the EFFECTIVE selection is
	// derived here rather than pushed back up through an effect. A pick that no
	// longer resolves (a stale id from a prior user) simply falls away, and a
	// lone store selects itself. Every read below — highlight, radio, login —
	// goes through the derived store, so the parent never learns about
	// auto-selection and a missing store id can never reach `onLogin`.
	const selectedStore = React.useMemo(
		() =>
			stores.find((s) => s.localID === selectedStoreId) ?? (stores.length === 1 ? stores[0] : null),
		[stores, selectedStoreId]
	);
	const selectedStoreLocalID = selectedStore?.localID ?? null;

	// Gate login on a validated user — an expired/invalid cashier session should
	// not be allowed to enter the POS with stale credentials. `isValid` starts
	// optimistic (true) and flips false only once validation finishes reporting
	// a failure, so we also block while validation is still in flight.
	const canLogin = !!selectedStoreLocalID && isValid && !isValidating;

	return (
		<VStack space="md">
			{/* Store Selection */}
			<VStack space="sm">
				<Text className="text-sm font-semibold">
					{stores.length > 1
						? t('auth.choose_a_store', { _tags: 'core' })
						: t('auth.store', { _tags: 'core' })}
				</Text>
				{stores.length === 0 ? (
					<EmptyState
						kind="empty"
						size="surface"
						title={t('auth.no_stores_for_this_user')}
						description={t('auth.set_up_store_on_server')}
					/>
				) : (
					<RadioGroup
						value={selectedStoreLocalID ?? ''}
						onValueChange={(val) => onStoreSelect(val)}
					>
						<VStack space="sm">
							{stores.map((store) => (
								<ListItem
									key={store.localID}
									// Addressed by the WooCommerce store id, not `localID`. `localID` is a
									// SHA-256 of {user, site, credentials, store}, so it gave E2E no way to
									// ask for a PARTICULAR store — only "whichever renders first", which is
									// how the tax specs ended up sampling a random store per run and going
									// green without ever exercising a multi-compound-rate one
									// (woocommerce-pos#1548).
									testID={store.id != null ? `store-option-${store.id}` : undefined}
									onPress={() => onStoreSelect(store.localID ?? null)}
									selected={selectedStoreLocalID === store.localID}
								>
									<RadioGroupOption
										value={store.localID ?? ''}
										label={store.name ?? t('common.default')}
										className="items-center"
										labelClassName="text-base"
										right={
											store.id != null ? (
												<Text className="text-muted-foreground ml-auto text-sm">#{store.id}</Text>
											) : null
										}
									/>
								</ListItem>
							))}
						</VStack>
					</RadioGroup>
				)}
			</VStack>

			{/* Login Button */}
			<Button
				testID="open-pos-button"
				onPress={() => {
					if (selectedStoreLocalID) onLogin(selectedStoreLocalID);
				}}
				disabled={!canLogin}
				size="lg"
				className="w-full"
			>
				<ButtonText>{t('auth.open_pos', { _tags: 'core' })}</ButtonText>
			</Button>
		</VStack>
	);
}
