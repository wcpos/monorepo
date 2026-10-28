import * as React from 'react';

import { ObservableResource, useObservableState, useObservableSuspense } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Dialog } from '@wcpos/components/dialog';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { useEngineRecordByWooId } from '@wcpos/query/record-readers';

import { EditVariationForm } from './form';
import { useT } from '../../../../../contexts/translations';
import { RecordDialog } from '../../../components/record-dialog';
import { taxClassFromWire } from '../../../hooks/tax-class';

interface Props {
	resource: ObservableResource<EngineRecord<'variations'> | null>;
	parentID?: string;
}

export function EditVariationModal({ resource }: Props) {
	const variation = useObservableSuspense(resource);
	const t = useT();
	const name = useRecordField(variation, (record) => record.payload.name);
	const payload = useRecordField(variation, (record) => record.payload);
	// The parent's class names what "Same as parent" means; a parent not on the device names none.
	const parentResource = useEngineRecordByWooId('products', variation?.payload.parent_id ?? 0);
	const parent$ = React.useMemo(
		() => parentResource.valueRef$$.pipe(map((value) => value?.current)),
		[parentResource]
	);
	const parent = useObservableState(parent$, undefined);

	return (
		<Dialog route>
			<RecordDialog
				title={variation ? t('common.edit_2', { name }) : t('common.variation')}
				record={variation}
				notFound={t('common.no_variation_found')}
				form={(record) => (
					<EditVariationForm
						variation={record}
						parentClass={parent ? taxClassFromWire(parent.payload.tax_class) : undefined}
					/>
				)}
				payload={payload}
			/>
		</Dialog>
	);
}
