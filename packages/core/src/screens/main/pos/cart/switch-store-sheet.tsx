import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { StatusBadge } from '@wcpos/components/status-badge';
import { MenuRow } from '@wcpos/components/menu-row';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Loader } from '@wcpos/components/loader';
import { Portal } from '@wcpos/components/portal';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import type { ReadonlyStoreRecord } from '@wcpos/query/user-db';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useSwitchStore } from './use-switch-store';
import { storeListResource } from '../../hooks/store-list-resource';
import { usePanelSide } from '../contexts/overlay-side';

export function SwitchStoreSheet({
	open,
	onOpenChange,
	portalHost = 'pos',
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** `null` off the POS: the root host, as the user sheet it opens from. */
	portalHost?: string | null;
}) {
	const side = usePanelSide('cart');
	const t = useT();
	// One switch per sheet: the sheet cannot be dismissed mid-switch (a hydrating store must not
	// leave the old screen operable underneath), and the overlay blocks the app until it lands
	// or fails, as the header's store menu did (`pos/cart/LEDGER.md` line 68).
	const { handleSwitchStore, isSwitching } = useSwitchStore();
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && isSwitching) return;
				onOpenChange(next);
			}}
		>
			<DialogContent
				side={side}
				size="lg"
				portalHost={portalHost ?? undefined}
				testID="switch-store-sheet"
			>
				<DialogHeader>
					<DialogTitle>{t('register.switch_store')}</DialogTitle>
				</DialogHeader>
				<Suspense>
					<StoreRows
						isSwitching={isSwitching}
						onSwitch={async (next) => {
							if (await handleSwitchStore(next)) onOpenChange(false);
						}}
					/>
				</Suspense>
			</DialogContent>
			{isSwitching ? (
				<Portal name="store-switch-overlay">
					<View
						testID="store-switch-overlay"
						className="bg-background/80 absolute inset-0 z-50 items-center justify-center gap-3"
					>
						<Loader size="xl" />
						<Text>{t('common.switching_store')}</Text>
					</View>
				</Portal>
			) : null}
		</Dialog>
	);
}

function StoreRows({
	isSwitching,
	onSwitch,
}: {
	isSwitching: boolean;
	onSwitch: (store: ReadonlyStoreRecord) => Promise<void>;
}) {
	const { wpCredentials, store } = useStoreSession();
	const stores = useObservableSuspense(storeListResource(wpCredentials));
	const t = useT();
	return (
		<ScrollView contentContainerClassName="px-4 pb-4">
			{stores.map((next) => (
				<MenuRow
					key={next.localID}
					testID={`switch-store-row-${next.localID}`}
					disabled={isSwitching || next.localID === store.localID}
					onPress={() => void onSwitch(next)}
					label={next.name}
					trailing={next.localID === store.localID && <StatusBadge label={t('register.current')} />}
				/>
			))}
		</ScrollView>
	);
}
