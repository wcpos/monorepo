import * as React from 'react';
import { View } from 'react-native';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditOrderForm } from './form';
import { OrderView } from './view';
import { useT } from '../../../../contexts/translations';
import { useAppInfo } from '../../../../hooks/use-app-info';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
}

const TABS = ['view', 'edit', 'json'] as const;

/** The one order surface: View (the default), Edit and JSON. */
export function OrderModal({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	// The modal is its own route, outside the list page's Pro guard and its provider: the
	// guard's own derivation, as the attention notice reads it. Free browses; it never edits.
	const readOnly = !useAppInfo().license?.isPro;
	// The route's `tab` picks the tab it opens on; the tab strip owns it after that.
	const { tab } = useLocalSearchParams<{ tab?: string }>();
	const requested = TABS.find((name) => name === tab) ?? 'view';
	const [value, setValue] = React.useState<string>(
		readOnly && requested === 'edit' ? 'view' : requested
	);
	const payload = useRecordField(order, (record) => record.payload);

	if (!order) {
		return (
			<Dialog route>
				<DialogContent side="right" size="xl">
					<DialogHeader>
						<DialogTitle>
							<Text>{t('common.no_order_found')}</Text>
						</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	const number = payload?.number || payload?.id;
	return (
		<Dialog route>
			<DialogContent side="right" size="xl" testID="order-modal">
				<DialogHeader>
					<DialogTitle>
						<Text>{number ? t('orders.order_title', { number }) : t('common.order')}</Text>
					</DialogTitle>
				</DialogHeader>
				<View className="min-h-0 flex-1">
					<Tabs className="min-h-0 flex-1" value={value} onValueChange={setValue}>
						<TabsList className="mx-4 flex-row">
							<TabsTrigger value="view" className="flex-1">
								<Text>{t('common.view')}</Text>
							</TabsTrigger>
							{!readOnly && (
								<TabsTrigger value="edit" className="flex-1">
									<Text>{t('common.edit')}</Text>
								</TabsTrigger>
							)}
							<TabsTrigger value="json" className="flex-1">
								<Text>{t('common.json')}</Text>
							</TabsTrigger>
						</TabsList>
						<TabsContent value="view" className="min-h-0 flex-1">
							<OrderView order={order} readOnly={readOnly} />
						</TabsContent>
						{!readOnly && (
							<TabsContent value="edit" className="min-h-0 flex-1">
								<EditOrderForm key={order.uuid} order={order} />
							</TabsContent>
						)}
						<TabsContent value="json" className="min-h-0 flex-1">
							<DialogBody>
								<Tree value={payload} />
							</DialogBody>
						</TabsContent>
					</Tabs>
				</View>
			</DialogContent>
		</Dialog>
	);
}
