import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableState, useObservableSuspense } from 'observable-hooks';
import { map } from 'rxjs/operators';

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
import { useEngineRecordByWooId } from '@wcpos/query/record-readers';

import { EditVariationForm } from './form';
import { useT } from '../../../../../contexts/translations';
import { taxClassFromWire } from '../../../hooks/tax-class';

interface Props {
	resource: ObservableResource<EngineRecord<'variations'> | null>;
	parentID?: string;
}

export function EditVariationModal({ resource }: Props) {
	const variation = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	const name = useRecordField(variation, (record) => record.payload.name);
	const payload = useRecordField(variation, (record) => record.payload);
	// The parent's class names what "Same as parent" means; a parent not on the device names none.
	const parentResource = useEngineRecordByWooId('products', variation?.payload.parent_id ?? 0);
	const parent$ = React.useMemo(
		() => parentResource.valueRef$$.pipe(map((value) => value?.current)),
		[parentResource]
	);
	const parent = useObservableState(parent$, undefined);

	if (!variation) {
		return (
			<Dialog route>
				<DialogContent side="right" size="lg">
					<DialogHeader>
						<DialogTitle>
							<Text>{t('common.no_variation_found')}</Text>
						</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog route>
			<DialogContent side="right" size="lg">
				<DialogHeader>
					<DialogTitle>
						<Text decodeHtml>{t('common.edit_2', { name })}</Text>
					</DialogTitle>
				</DialogHeader>
				<View className="min-h-0 flex-1">
					<Tabs className="min-h-0 flex-1" value={value} onValueChange={setValue}>
						<TabsList className="mx-4 flex-row">
							<TabsTrigger value="form" className="flex-1">
								<Text>{t('common.form')}</Text>
							</TabsTrigger>
							<TabsTrigger value="json" className="flex-1">
								<Text>{t('common.json')}</Text>
							</TabsTrigger>
						</TabsList>
						<TabsContent value="form" className="min-h-0 flex-1">
							<EditVariationForm
								variation={variation}
								parentClass={parent ? taxClassFromWire(parent.payload.tax_class) : undefined}
							/>
						</TabsContent>
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
