import * as React from 'react';

import { useNavigationState } from '@react-navigation/native';
import get from 'lodash/get';
import { ObservableResource, useObservableState, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import {
	Modal,
	ModalAction,
	ModalBody,
	ModalClose,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { WebView } from '@wcpos/components/webview';

import { EmailForm } from './email';
import { useT } from '../../../contexts/translations';
import { useUISettings } from '../contexts/ui-settings';
import { usePrintExternalURL } from '../hooks/use-print';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
export function Receipt({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const iframeRef = React.useRef<HTMLIFrameElement>(null);
	const links$ = order.links$ ?? of(undefined);
	const receiptURL = useObservableState(
		links$.pipe(map((links) => get(links, ['receipt', 0, 'href']) as string | undefined)),
		get(order, ['links', 'receipt', 0, 'href']) as string | undefined
	);

	const { print, isPrinting } = usePrintExternalURL({ externalURL: receiptURL ?? '' });

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
							<Text>{t('common.no_order_found')}</Text>
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
						<Text>{t('common.receipt')}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody contentContainerStyle={{ height: '100%' }}>
					<ErrorBoundary>
						<WebView
							ref={iframeRef as never}
							src={receiptURL ?? ''}
							onLoad={handleLoad}
							onMessage={() => {}}
							className="flex-1"
						/>
					</ErrorBoundary>
				</ModalBody>
				<ModalFooter>
					<ModalClose testID="receipt-close-button">{t('common.close')}</ModalClose>
					<Dialog>
						<DialogTrigger asChild>
							<ModalAction>{t('receipt.email_receipt')}</ModalAction>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>{t('receipt.email_receipt')}</DialogTitle>
							</DialogHeader>
							<DialogBody>
								<EmailForm order={order} />
							</DialogBody>
						</DialogContent>
					</Dialog>
					<ModalAction testID="receipt-print-button" onPress={() => print()} loading={isPrinting}>
						{t('receipt.print_receipt')}
					</ModalAction>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
