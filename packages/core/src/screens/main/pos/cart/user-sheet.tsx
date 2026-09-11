import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { map } from 'rxjs';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import type { StoreDocument, WPCredentialsDocument } from '@wcpos/database';
import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { observeEngineQuery, useDocField, useQueryRuntime } from '@wcpos/query';
import { log } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useAppState, useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { AddUserButton } from '../../../auth/components/add-user-button';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePOSOverlaySide } from '../contexts/overlay-side';

export function useSalesToday() {
	const { wpCredentials, store } = useStoreSession();
	const { engine, locale } = useQueryRuntime();
	const sales$ = React.useMemo(() => {
		const today = new Date();
		const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
		// Local read only: opening the user sheet must not declare a new server fetch.
		return observeEngineQuery(engine, locale, {
			collection: 'orders',
			limit: Number.MAX_SAFE_INTEGER,
			selector: {
				status: 'completed',
				date_created_gmt: {
					$gte: convertLocalDateToUTCString(start),
					$lt: convertLocalDateToUTCString(end),
				},
				$and: [
					{ meta_data: { $elemMatch: { key: '_pos_user', value: String(wpCredentials.id) } } },
					{
						meta_data: {
							$elemMatch: {
								key: '_pos_store',
								value: store.id ? String(store.id) : 'woocommerce-pos',
							},
						},
					},
				],
			},
		}).pipe(
			map((result) =>
				result.hits.reduce((sum, hit) => sum + Number(hit.record.payload.total || 0), 0)
			)
		);
	}, [engine, locale, wpCredentials.id, store.id]);
	return useObservableState(sales$, 0);
}

function SalesToday() {
	const total = useSalesToday();
	const { format } = useCurrencyFormat();
	const t = useT();
	return (
		<View
			testID="user-sheet-sales-today"
			className="h-11 flex-row items-center justify-between gap-2"
		>
			<Text>{t('register.your_sales_today')}</Text>
			<Text className="tabular-nums">{format(total)}</Text>
		</View>
	);
}

function UserRows() {
	const { site, store, wpCredentials, logout } = useStoreSession();
	const { login } = useAppState();
	const router = useRouter();
	const credentials = useObservableSuspense(
		site.populateResource('wp_credentials')
	) as WPCredentialsDocument[];
	const switchUser = async (credential: WPCredentialsDocument) => {
		try {
			const stores = (await credential.populate('stores')) as StoreDocument[];
			const next = stores.find((candidate) => candidate.id === store.id);
			requestStateManager.clearRefreshedToken();
			requestStateManager.setAuthFailed(false);
			if (!next) {
				await logout();
				router.replace('/connect');
				return;
			}
			await login({
				siteID: site.uuid!,
				wpCredentialsID: credential.uuid!,
				storeID: next.localID!,
			});
		} catch (error) {
			log.error('Store login failed', {
				code: ERROR_CODES.AUTH_UNEXPECTED,
				showToast: true,
				context: { error },
			});
		}
	};
	return (
		<>
			{credentials
				.filter((credential) => credential.uuid !== wpCredentials.uuid)
				.map((credential) => (
					<Button
						key={credential.uuid}
						testID={`user-sheet-user-${credential.uuid}`}
						variant="ghost"
						className="h-11 items-start"
						onPress={() => void switchUser(credential)}
					>
						<Text numberOfLines={1}>{credential.display_name}</Text>
					</Button>
				))}
		</>
	);
}

export function UserSheet({
	open,
	onOpenChange,
	onSwitchRegister,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSwitchRegister?: () => void;
}) {
	const { site, wpCredentials, logout } = useStoreSession();
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	const side = usePOSOverlaySide();
	const { registers } = useRegisterBinding();
	const t = useT();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} portalHost="pos" testID="user-sheet">
				<DialogHeader>
					<DialogTitle>{displayName}</DialogTitle>
				</DialogHeader>
				{open && (
					<ScrollView>
						<SalesToday />
						<View testID="user-sheet-switch-user">
							<Text className="h-11 py-3">{t('register.switch_user')}</Text>
							<Suspense>
								<UserRows />
							</Suspense>
							<AddUserButton site={site} hasExistingUsers compact />
						</View>
						{registers.length > 1 && onSwitchRegister && (
							<Button
								testID="user-sheet-switch-register"
								variant="ghost"
								className="h-11 items-start"
								onPress={() => {
									onOpenChange(false);
									onSwitchRegister();
								}}
							>
								{t('register.switch_register')}
							</Button>
						)}
						<View className="border-border mt-2 border-t pt-2">
							<Button
								testID="user-sheet-sign-out"
								className="h-11"
								variant="outline-destructive"
								onPress={logout}
							>
								{t('register.sign_out')}
							</Button>
						</View>
					</ScrollView>
				)}
			</DialogContent>
		</Dialog>
	);
}
