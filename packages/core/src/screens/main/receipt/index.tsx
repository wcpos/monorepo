import * as React from 'react';

import { useNavigationState } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableSuspense, ObservableResource, useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { map } from 'rxjs/operators';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/src/dialog';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import {
	Modal,
	ModalContent,
	ModalFooter,
	ModalTitle,
	ModalBody,
	ModalClose,
	ModalHeader,
	ModalAction,
} from '@wcpos/components/src/modal';
import { Text } from '@wcpos/components/src/text';
import { WebView } from '@wcpos/components/src/webview';

import { EmailForm } from './email';
import { useT } from '../../../contexts/translations';
import useModalRefreshFix from '../../../hooks/use-modal-refresh-fix';
import { useUISettings } from '../contexts/ui-settings';
import { usePrintExternalURL } from '../hooks/use-print';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
export const ReceiptModal = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const t = useT();
	useModalRefreshFix();
	const iframeRef = React.useRef<HTMLIFrameElement>(null);
	const receiptURL = useObservableState(
		order.links$.pipe(map((links) => get(links, ['receipt', 0, 'href']))),
		get(order, ['links', 'receipt', 0, 'href'])
	);
	const { print, isPrinting } = usePrintExternalURL({ externalURL: receiptURL });

	/**
	 * Allow auto print for checkout
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const checkoutRef = React.useRef(false);
	useNavigationState((state) => {
		if (state.routeNames.includes('Checkout')) {
			checkoutRef.current = true;
		}
		return state;
	});

	/**
	 * Handle load
	 */
	const handleLoad = () => {
		if (uiSettings.autoPrintReceipt && checkoutRef.current) {
			print();
		}
	};

	/**
	 *
	 */
	if (!isRxDocument(order)) {
		return (
			<Modal>
				<ModalContent size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('No order found', { _tags: 'core' })}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	/**
	 *
	 */
	return (
		<Modal>
			<ModalContent size="xl" className="h-full">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('Receipt', { _tags: 'core' })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody contentContainerStyle={{ height: '100%' }}>
					<ErrorBoundary>
						<WebView ref={iframeRef} src={receiptURL} onLoad={handleLoad} className="flex-1" />
					</ErrorBoundary>
				</ModalBody>
				<ModalFooter>
					<ModalClose>{t('Close', { _tags: 'core' })}</ModalClose>
					<Dialog>
						<DialogTrigger asChild>
							<ModalAction>{t('Email Receipt', { _tags: 'core' })}</ModalAction>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>{t('Email Receipt', { _tags: 'core' })}</DialogTitle>
							</DialogHeader>
							<DialogBody>
								<EmailForm order={order} />
							</DialogBody>
						</DialogContent>
					</Dialog>
					<ModalAction onPress={() => print()} loading={isPrinting}>
						{t('Print Receipt', { _tags: 'core' })}
					</ModalAction>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};
