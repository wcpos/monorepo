import * as React from 'react';
import { ScrollView } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { StatusBadge } from '@wcpos/components/status-badge';
import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useSwitchStore } from '../../components/header/use-switch-store';
import { storeListResource } from '../../hooks/store-list-resource';
import { usePOSOverlaySide } from '../contexts/overlay-side';

export function SwitchStoreSheet({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const side = usePOSOverlaySide();
	const t = useT();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} portalHost="pos" testID="switch-store-sheet">
				<DialogHeader>
					<DialogTitle>{t('register.switch_store')}</DialogTitle>
				</DialogHeader>
				<Suspense>
					<StoreRows onSwitched={() => onOpenChange(false)} />
				</Suspense>
			</DialogContent>
		</Dialog>
	);
}

function StoreRows({ onSwitched }: { onSwitched: () => void }) {
	const { wpCredentials, store } = useStoreSession();
	const stores = useObservableSuspense(storeListResource(wpCredentials));
	const { handleSwitchStore, isSwitching } = useSwitchStore();
	const t = useT();
	return (
		<ScrollView>
			{stores.map((next) => (
				<Button
					key={next.localID}
					testID={`switch-store-row-${next.localID}`}
					variant="ghost"
					className="h-11 flex-row justify-between"
					disabled={isSwitching || next.localID === store.localID}
					onPress={async () => {
						await handleSwitchStore(next);
						onSwitched();
					}}
				>
					<Text numberOfLines={1} className="min-w-0 flex-1">
						{next.name}
					</Text>
					{next.localID === store.localID && <StatusBadge label={t('register.current')} />}
				</Button>
			))}
		</ScrollView>
	);
}
