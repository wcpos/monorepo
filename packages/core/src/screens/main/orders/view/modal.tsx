import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { CustomerSection } from './sections/customer';
import { HeaderSection } from './sections/header';
import { LineItemsSection } from './sections/line-items';
import { PaymentSection } from './sections/payment';
import { POSMetadataSection } from './sections/pos-metadata';
import { RefundsFallback, RefundsSection, RefundsSkeleton } from './sections/refunds';
import { useOrderRefunds } from './use-order-refunds';
import { TotalsSection } from './sections/totals';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

export function ViewOrderModal({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const [refundsRetryKey, setRefundsRetryKey] = React.useState(0);

	if (!isRxDocument(order)) {
		return (
			<Modal>
				<ModalContent size="xl">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('common.no_order_found')}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	return (
		<Modal>
			<ModalContent size="xl" className="h-full">
				<ModalHeader>
					<ModalTitle>
						<Text>Order #{order.number || order.id || ''}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody contentContainerStyle={{ paddingBottom: 24 }}>
					<VStack space="lg">
						<HeaderSection order={order} />
						<LineItemsSection order={order} />
						<TotalsSection order={order} />
						<PaymentSection order={order} />
						<RefundsBoundary
							key={refundsRetryKey}
							order={order}
							onRetry={() => setRefundsRetryKey((key) => key + 1)}
						/>
						<CustomerSection order={order} />
						<POSMetadataSection order={order} />
					</VStack>
				</ModalBody>
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
		return <RefundsSection order={order} />;
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
