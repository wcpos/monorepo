import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Modal, ModalBody, ModalClose, ModalContent, ModalFooter } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { AddressesRail, CustomerNoteSection, CustomerRail, TaxIdsRail } from './sections/customer';
import { HeaderSection } from './sections/header';
import { LineItemsSection } from './sections/line-items';
import { PaymentSection } from './sections/payment';
import { POSMetadataSection } from './sections/pos-metadata';
import { TotalsSection } from './sections/totals';
import { RefundsBoundary } from './refunds-boundary';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
}

const REFUNDABLE_STATUSES: readonly string[] = ['completed', 'processing', 'on-hold'];

export function ViewOrderModal({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const router = useRouter();
	const payload = useRecordField(order, (record) => record.payload);

	if (!order || !payload) {
		return (
			<Modal>
				<ModalContent side="right" size="2xl" className="gap-0 py-0">
					<View className="px-5 py-6">
						<Text className="text-foreground text-base font-semibold">
							{t('common.no_order_found')}
						</Text>
					</View>
				</ModalContent>
			</Modal>
		);
	}

	const handlePrintReceipt = () =>
		router.push({ pathname: '/orders/receipt/[orderId]', params: { orderId: order.uuid } });

	const canRefund =
		!!payload.id && !!payload.status && REFUNDABLE_STATUSES.includes(payload.status);
	const handleRefund = canRefund
		? () => router.push({ pathname: '/orders/refund/[orderId]', params: { orderId: order.uuid } })
		: undefined;

	return (
		<Modal>
			<ModalContent side="right" size="2xl" className="gap-0">
				<HeaderSection order={payload} />
				<ModalBody className="p-0">
					<View className="w-full flex-col sm:flex-row">
						{/* Main column */}
						<View className="min-w-0 flex-1">
							<LineItemsSection order={payload} />
							<TotalsSection order={payload} />
							{payload.id ? (
								<RefundsBoundary order={payload} orderUuid={order.uuid} orderId={payload.id} />
							) : null}
							<CustomerNoteSection order={payload} />
						</View>

						{/* Rail */}
						<View className="border-border bg-muted/30 border-t sm:w-80 sm:shrink-0 sm:border-t-0 sm:border-l">
							<CustomerRail order={payload} />
							<AddressesRail order={payload} />
							<TaxIdsRail order={payload} />
							<PaymentSection order={payload} />
							<POSMetadataSection order={payload} last />
						</View>
					</View>
				</ModalBody>
				<ModalFooter className="border-border border-t pt-4">
					{payload.id ? (
						<Button variant="outline" onPress={handlePrintReceipt} leftIcon="receipt">
							<ButtonText>{t('receipt.print_receipt')}</ButtonText>
						</Button>
					) : null}
					{handleRefund ? (
						<Button variant="outline-destructive" onPress={handleRefund} leftIcon="arrowRotateLeft">
							<ButtonText>{t('orders.refund')}</ButtonText>
						</Button>
					) : null}
					<ModalClose>{t('common.cancel')}</ModalClose>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
