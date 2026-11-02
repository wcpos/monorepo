import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Dialog } from '@wcpos/components/dialog';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditProductForm } from './form';
import { useT } from '../../../../../contexts/translations';
import { RecordDialog } from '../../../components/record-dialog';

interface Props {
	resource: ObservableResource<EngineRecord<'products'> | null>;
}

export function EditProductModal({ resource }: Props) {
	const product = useObservableSuspense(resource);
	const t = useT();
	const name = useRecordField(product, (record) => record.payload.name);
	const payload = useRecordField(product, (record) => record.payload);

	return (
		<Dialog route>
			<RecordDialog
				title={product ? t('common.edit_2', { name }) : t('common.product')}
				record={product}
				notFound={t('products.no_product_found')}
				form={(record) => <EditProductForm product={record} />}
				payload={payload}
				testID="product-edit-modal"
			/>
		</Dialog>
	);
}
