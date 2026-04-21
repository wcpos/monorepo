import * as React from 'react';
import { Pressable } from 'react-native';

import { of } from 'rxjs';
import { distinctUntilChanged, switchMap, tap } from 'rxjs/operators';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Label } from '@wcpos/components/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/radio-group';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { StoreDocument, WPCredentialsDocument } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { useUserValidation } from '../../../hooks/use-user-validation';

const storeLogger = getLogger(['wcpos', 'auth', 'stores']);

interface StoreSelectProps {
	site: import('@wcpos/database').SiteDocument;
	wpUser: WPCredentialsDocument;
	selectedStoreId: string | null;
	onStoreSelect: (storeId: string | null) => void;
	onLogin: (storeId: string) => void;
}

/**
 * Store selection and login button — separated because it uses Suspense
 * to resolve the stores population from the selected user.
 */
export function StoreSelect({
	site,
	wpUser,
	selectedStoreId,
	onStoreSelect,
	onLogin,
}: StoreSelectProps) {
	const t = useT();
	const [stores, setStores] = React.useState<StoreDocument[]>([]);
	const { isValid, isLoading: isValidating } = useUserValidation({ site, wpUser });

	// Resolve stores reactively by combining wpUser.stores$ (the localID array)
	// with a reactive query on the stores collection. The populate$ plugin uses
	// findByIds(...).exec() which is a one-shot Promise, so it misses the case
	// where store docs are inserted *after* the ids are already written to the
	// parent (e.g. stale pointer from prior session → cashier re-creates doc
	// with same hash, parent ids never change, populate$ never re-emits).
	React.useEffect(() => {
		// Clear previously-resolved stores synchronously so we don't briefly
		// render the prior user's list while the new subscription spins up.
		setStores([]);

		const wpUserAny = wpUser as unknown as {
			collection: { database: { stores: any } };
			get$: (key: string) => import('rxjs').Observable<any>;
			stores?: string[];
			uuid?: string;
		};
		const storesCollection = wpUserAny.collection.database.stores;
		const ids$ = wpUserAny.get$('stores');

		storeLogger.debug('[stores] StoreSelect subscribing (direct collection query)', {
			context: {
				wpUserUuid: wpUser.uuid,
				storesOnDoc: wpUserAny.stores,
				hasIdsObservable: !!ids$,
			},
		});

		const idsEqual = (a: string[], b: string[]) =>
			a.length === b.length && a.every((v, i) => v === b[i]);
		const storesEqual = (a: StoreDocument[], b: StoreDocument[]) =>
			a.length === b.length && a.every((v, i) => v.localID === b[i].localID);

		const sub = ids$
			.pipe(
				tap((ids) => {
					storeLogger.debug('[stores] wpUser.get$(stores) emitted', {
						context: { wpUserUuid: wpUser.uuid, ids },
					});
				}),
				distinctUntilChanged((a, b) => Array.isArray(a) && Array.isArray(b) && idsEqual(a, b)),
				switchMap((ids: string[]) => {
					const validIds = Array.isArray(ids) ? ids.filter((id) => id != null && id !== '') : [];
					if (validIds.length === 0) return of([] as StoreDocument[]);
					// Use a reactive find() query — findByIds(...).$ on filesystem-node
					// storage does not re-emit when matching docs are inserted *after*
					// the query was created. find({selector: { $in }}).$ does.
					return storesCollection.find({ selector: { localID: { $in: validIds } } })
						.$ as import('rxjs').Observable<StoreDocument[]>;
				}),
				distinctUntilChanged(storesEqual)
			)
			.subscribe((resolved: StoreDocument[]) => {
				storeLogger.debug('[stores] StoreSelect stores resolved', {
					context: {
						wpUserUuid: wpUser.uuid,
						storeCount: resolved.length,
						storeIDs: resolved.map((s) => s.id),
						storeLocalIDs: resolved.map((s) => s.localID),
					},
				});
				setStores(resolved);
			});
		return () => sub.unsubscribe();
	}, [wpUser]);

	// Auto-select single store
	React.useEffect(() => {
		if (stores.length === 1 && !selectedStoreId) {
			onStoreSelect(stores[0].localID ?? null);
		}
		// Reset if current selection is no longer valid
		if (selectedStoreId && !stores.find((s) => s.localID === selectedStoreId)) {
			onStoreSelect(stores.length === 1 ? (stores[0].localID ?? null) : null);
		}
	}, [stores, selectedStoreId, onStoreSelect]);

	// Gate login on a validated user — an expired/invalid cashier session should
	// not be allowed to enter the POS with stale credentials. `isValid` starts
	// optimistic (true) and flips false only once validation finishes reporting
	// a failure, so we also block while validation is still in flight.
	const canLogin = stores.length > 0 && !!selectedStoreId && isValid && !isValidating;

	return (
		<VStack space="md">
			{/* Store Selection */}
			<VStack space="sm">
				<Text className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
					{stores.length > 1
						? t('auth.select_a_store', { _tags: 'core' })
						: t('auth.store', { _tags: 'core' })}
				</Text>
				{stores.length === 0 ? (
					<Text className="text-muted-foreground text-sm">
						{t('auth.no_stores_available', { _tags: 'core' })}
					</Text>
				) : (
					<RadioGroup value={selectedStoreId ?? ''} onValueChange={(val) => onStoreSelect(val)}>
						<VStack space="xs">
							{stores.map((store) => (
								<Pressable
									key={store.localID}
									onPress={() => onStoreSelect(store.localID ?? null)}
									className={`web:cursor-pointer web:transition-colors rounded-lg border p-3 ${
										selectedStoreId === store.localID
											? 'border-primary bg-primary/10'
											: 'border-border web:hover:border-primary/40 web:hover:bg-primary/5'
									}`}
								>
									<HStack space="sm" className="items-center">
										<RadioGroupItem
											value={store.localID ?? ''}
											aria-labelledby={`store-${store.localID}`}
										/>
										<Label
											nativeID={`store-${store.localID}`}
											onPress={() => onStoreSelect(store.localID ?? null)}
											className="flex-1 text-sm font-medium"
										>
											{store.name ?? t('common.default')}
										</Label>
										{store.id != null && (
											<Text className="text-muted-foreground text-xs">#{store.id}</Text>
										)}
									</HStack>
								</Pressable>
							))}
						</VStack>
					</RadioGroup>
				)}
			</VStack>

			{/* Login Button */}
			<Button
				onPress={() => {
					if (selectedStoreId) onLogin(selectedStoreId);
				}}
				disabled={!canLogin}
				size="lg"
				rightIcon={<Icon name="arrowRight" size="sm" className="fill-primary-foreground" />}
			>
				<ButtonText>{t('auth.open_pos', { _tags: 'core' })}</ButtonText>
			</Button>
		</VStack>
	);
}
