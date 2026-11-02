import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Dialog } from '@wcpos/components/dialog';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditCouponForm } from './form';
import { useT } from '../../../../contexts/translations';
import { RecordDialog } from '../../components/record-dialog';

interface Props {
	resource: ObservableResource<EngineRecord<'coupons'> | null>;
}

export function EditCoupon({ resource }: Props) {
	const coupon = useObservableSuspense(resource);
	const t = useT();
	const code = useRecordField(coupon, (record) => record.payload.code);
	const payload = useRecordField(coupon, (record) => record.payload);

	return (
		<Dialog route>
			<RecordDialog
				title={coupon ? t('common.edit_2', { name: code }) : t('common.coupon')}
				record={coupon}
				notFound={t('coupons.no_coupon_found')}
				form={(record) => <EditCouponForm coupon={record} />}
				payload={payload}
			/>
		</Dialog>
	);
}
