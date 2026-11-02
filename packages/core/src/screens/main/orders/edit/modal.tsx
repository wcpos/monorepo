import * as React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Dialog } from '@wcpos/components/dialog';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditOrderForm } from './form';
import { OrderView } from './view';
import { useT } from '../../../../contexts/translations';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { RecordDialog, type RecordTab } from '../../components/record-dialog';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
}

/** The one order surface: View (the default), Edit and JSON. */
export function OrderModal({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	// The modal is its own route, outside the list page's Pro guard and its provider: the
	// guard's own derivation, as the attention notice reads it. Free browses; it never edits.
	const readOnly = !useAppInfo().license?.isPro;
	// The route's `tab` picks the tab it opens on (a read-only modal has no Edit, so opens on View).
	const { tab } = useLocalSearchParams<{ tab?: string }>();
	const payload = useRecordField(order, (record) => record.payload);
	const number = payload?.number || payload?.id;
	const view: RecordTab<EngineRecord<'orders'>> = {
		value: 'view',
		label: t('common.view'),
		render: (record) => <OrderView order={record} readOnly={readOnly} />,
	};
	const edit: RecordTab<EngineRecord<'orders'>> = {
		value: 'edit',
		label: t('common.edit'),
		render: (record) => <EditOrderForm key={record.uuid} order={record} />,
	};

	return (
		<Dialog route>
			<RecordDialog
				title={number ? t('orders.order_title', { number }) : t('common.order')}
				record={order}
				notFound={t('common.no_order_found')}
				form={readOnly ? [view] : [view, edit]}
				initialTab={tab}
				payload={payload}
				testID="order-modal"
			/>
		</Dialog>
	);
}
