import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditCouponForm } from './form';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'coupons'> | null>;
}

export function EditCoupon({ resource }: Props) {
	const coupon = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	const code = useRecordField(coupon, (record) => record.payload.code);
	const payload = useRecordField(coupon, (record) => record.payload);

	if (!coupon) {
		return (
			<Modal>
				<ModalContent side="right" size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('coupons.no_coupon_found')}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	return (
		<Modal>
			<ModalContent side="right" size="lg">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('common.edit_2', { name: code })}</Text>
					</ModalTitle>
				</ModalHeader>
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
							<EditCouponForm coupon={coupon} />
						</TabsContent>
						<TabsContent value="json" className="min-h-0 flex-1">
							<ModalBody>
								<Tree value={payload} />
							</ModalBody>
						</TabsContent>
					</Tabs>
				</View>
			</ModalContent>
		</Modal>
	);
}
