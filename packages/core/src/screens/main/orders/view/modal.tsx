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

	const retryRefunds = () => setRefundsRetryKey((key) => key + 1);
	function RefundsErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
		return (
			<RefundsFallback
				refunds={order.refunds}
				currencySymbol={order.currency_symbol}
				onRetry={() => {
					retryRefunds();
					resetErrorBoundary();
				}}
			/>
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
						<ErrorBoundary FallbackComponent={RefundsErrorFallback} resetKeys={[refundsRetryKey]}>
							<React.Suspense fallback={<RefundsSkeleton />}>
								<RefundsSection key={refundsRetryKey} order={order} />
							</React.Suspense>
						</ErrorBoundary>
						<CustomerSection order={order} />
						<POSMetadataSection order={order} />
					</VStack>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
