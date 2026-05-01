import * as React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { useRouter } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Modal, ModalContent } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';

import { AddressesRail, CustomerNoteSection, CustomerRail } from './sections/customer';
import { HeaderSection } from './sections/header';
import { LineItemsSection } from './sections/line-items';
import { PaymentSection } from './sections/payment';
import { POSMetadataSection } from './sections/pos-metadata';
import { RefundsFallback, RefundsSection, RefundsSkeleton } from './sections/refunds';
import { TotalsSection } from './sections/totals';
import { useOrderRefunds } from './use-order-refunds';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

const REFUNDABLE_STATUSES: readonly string[] = ['completed', 'processing', 'on-hold', 'refunded'];

export function ViewOrderModal({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const router = useRouter();
	const { width } = useWindowDimensions();
	const isWide = width >= 768;
	const [refundsRetryKey, setRefundsRetryKey] = React.useState(0);

	if (!isRxDocument(order)) {
		return (
			<Modal>
				<ModalContent size="xl" className="gap-0 py-0">
					<View className="px-5 py-6">
						<Text className="text-foreground text-base font-semibold">
							{t('common.no_order_found')}
						</Text>
					</View>
				</ModalContent>
			</Modal>
		);
	}

	const handlePrintReceipt = order.id
		? () => router.push({ pathname: `/orders/receipt/${order.uuid}` })
		: undefined;

	const canRefund = !!order.id && !!order.status && REFUNDABLE_STATUSES.includes(order.status);
	const handleRefund = canRefund
		? () => router.push({ pathname: `/orders/refund/${order.uuid}` })
		: undefined;

	return (
		<Modal>
			<ModalContent size="2xl" className="h-full gap-0 overflow-hidden py-0">
				<ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
					<HeaderSection
						order={order}
						onPrintReceipt={handlePrintReceipt}
						onRefund={handleRefund}
					/>

					<View className={isWide ? 'flex-row' : 'flex-col'}>
						{/* Main column */}
						<View className={isWide ? 'min-w-0 flex-1' : ''}>
							<LineItemsSection order={order} />
							<TotalsSection order={order} />
							<RefundsBoundary
								key={refundsRetryKey}
								order={order}
								onRetry={() => setRefundsRetryKey((key) => key + 1)}
							/>
							<CustomerNoteSection order={order} />
						</View>

						{/* Rail */}
						<View
							className={
								isWide
									? 'border-border bg-muted/30 w-[300px] border-l'
									: 'border-border bg-muted/30 border-t'
							}
						>
							<CustomerRail order={order} />
							<AddressesRail order={order} />
							<PaymentSection order={order} />
							<POSMetadataSection order={order} last />
						</View>
					</View>
				</ScrollView>
			</ModalContent>
		</Modal>
	);
}

function RefundsBoundary({
	order,
	onRetry,
}: {
	order: import('@wcpos/database').OrderDocument;
	onRetry: () => void;
}) {
	if (!order.id) {
		return null;
	}

	return <RefundsResourceBoundary order={order} orderId={order.id} onRetry={onRetry} />;
}

function RefundsResourceBoundary({
	order,
	orderId,
	onRetry,
}: {
	order: import('@wcpos/database').OrderDocument;
	orderId: number;
	onRetry: () => void;
}) {
	const resource = useOrderRefunds(orderId);

	function RefundsErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
		return (
			<RefundsFallback
				refunds={order.refunds}
				currencySymbol={order.currency_symbol}
				onRetry={() => {
					onRetry();
					resetErrorBoundary();
				}}
			/>
		);
	}

	return (
		<ErrorBoundary FallbackComponent={RefundsErrorFallback}>
			<React.Suspense fallback={<RefundsSkeleton />}>
				<RefundsSection order={order} resource={resource} />
			</React.Suspense>
		</ErrorBoundary>
	);
}
