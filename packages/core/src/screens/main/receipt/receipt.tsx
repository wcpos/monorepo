import * as React from 'react';

import { useNavigationState } from '@react-navigation/native';
import get from 'lodash/get';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableState,
	useObservableSuspense,
} from 'observable-hooks';
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
import { ToggleGroup, ToggleGroupItem } from '@wcpos/components/toggle-group';
import { VStack } from '@wcpos/components/vstack';
import { WebView } from '@wcpos/components/webview';

import { EmailForm } from './email';
import { FiscalStatus } from './fiscal-status';
import { useReceiptData } from './hooks/use-receipt-data';
import { useTemplateRenderer } from './hooks/use-template-renderer';
import { ReceiptModeBadge } from './mode-badge';
import { SyncingBadge } from './syncing-badge';
import { TemplateSwitcher } from './template-switcher';
import { useT } from '../../../contexts/translations';
import { useUISettings } from '../contexts/ui-settings';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { useDefaultPrinterProfile } from '../settings/printer/use-default-printer-profile';
import { usePrint } from '@wcpos/printer';

import type { ReceiptMode } from './hooks/use-receipt-data';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

const CHECKOUT_ROUTE_NAMES = ['Checkout', '(modals)/cart/[orderId]/checkout'] as const;

/**
 * Appends or updates the mode query parameter on a receipt URL.
 */
function appendModeParam(url: string, mode: ReceiptMode): string {
	try {
		const parsed = new URL(url);
		parsed.searchParams.set('mode', mode);
		return parsed.toString();
	} catch {
		// URL might be relative — safely update query while preserving hash
		const [beforeHash, hash = ''] = url.split('#');
		const [pathname, query = ''] = beforeHash.split('?');
		const params = new URLSearchParams(query);
		params.set('mode', mode);
		const next = `${pathname}?${params.toString()}`;
		return hash ? `${next}#${hash}` : next;
	}
}

/**
 *
 */
export function Receipt({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const iframeRef = React.useRef<HTMLIFrameElement>(null);

	// Get the WC order ID for the receipts API
	const orderId = useObservableEagerState(order.id$ ?? of(undefined as number | undefined));

	// Legacy receipt URL from order links
	const links$ = order.links$ ?? of(undefined);
	const baseReceiptURL = useObservableState(
		links$.pipe(map((links) => get(links, ['receipt', 0, 'href']) as string | undefined)),
		get(order, ['links', 'receipt', 0, 'href']) as string | undefined
	);

	// Mode state — default to live
	const [selectedMode, setSelectedMode] = React.useState<ReceiptMode>('live');

	// Reset mode for each new order to avoid carrying stale mode across receipts
	React.useEffect(() => {
		setSelectedMode('live');
	}, [orderId]);

	// Template renderer — provides template list, selection, and rendered output
	const {
		templates,
		selectedTemplateId,
		setSelectedTemplateId,
		renderedHtml,
		receiptData,
		receiptUrl: templateReceiptUrl,
		isOffline,
		isSyncing,
	} = useTemplateRenderer({
		orderId,
		baseReceiptURL,
		mode: selectedMode,
		order,
	});

	// Fetch receipt metadata from the receipts REST API
	const {
		mode: activeMode,
		hasSnapshot,
		submissionStatus,
		isLoading: isLoadingReceipt,
		refetch,
	} = useReceiptData({
		orderId,
		mode: selectedMode,
	});

	// Build the receipt URL with mode parameter
	const receiptURL = React.useMemo(() => {
		if (!baseReceiptURL) return '';
		return appendModeParam(baseReceiptURL, selectedMode);
	}, [baseReceiptURL, selectedMode]);

	// Default printer profile for direct thermal printing (bypasses system dialog)
	const defaultProfile = useDefaultPrinterProfile();

	const { print, isPrinting } = usePrint({
		receiptData: receiptData ?? undefined,
		html: renderedHtml ?? undefined,
		receiptUrl: templateReceiptUrl || receiptURL,
		printerProfile: defaultProfile,
	});

	// Retry fiscal submission
	const http = useRestHttpClient();
	const [isRetrying, setIsRetrying] = React.useState(false);
	const handleFiscalRetry = React.useCallback(async () => {
		if (!orderId || isRetrying) return;
		setIsRetrying(true);
		try {
			await http.post(`/receipts/${orderId}/fiscal/retry`, {});
			refetch();
		} catch {
			// Error handled by HTTP client
		} finally {
			setIsRetrying(false);
		}
	}, [http, orderId, isRetrying, refetch]);

	/**
	 * Allow auto print for checkout
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const checkoutRef = React.useRef(false);
	const hasAutoPrintedRef = React.useRef(false);
	useNavigationState((state) => {
		if (CHECKOUT_ROUTE_NAMES.some((routeName) => state.routeNames.includes(routeName))) {
			checkoutRef.current = true;
		}
		return state;
	});

	// Reset auto-print guard when a new receipt is loaded
	React.useEffect(() => {
		hasAutoPrintedRef.current = false;
	}, [orderId]);

	/**
	 * Handle load — single-shot auto-print guard prevents duplicate prints on mode switch
	 */
	const handleLoad = () => {
		if (uiSettings.autoPrintReceipt && checkoutRef.current && !hasAutoPrintedRef.current) {
			hasAutoPrintedRef.current = true;
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
					{hasSnapshot && (
						<ToggleGroup
							type="single"
							value={selectedMode}
							onValueChange={(val) => {
								if (val) setSelectedMode(val as ReceiptMode);
							}}
							size="sm"
						>
							<ToggleGroupItem value="fiscal">
								<Text>{t('receipt.fiscal', 'Fiscal')}</Text>
							</ToggleGroupItem>
							<ToggleGroupItem value="live">
								<Text>{t('receipt.live', 'Live')}</Text>
							</ToggleGroupItem>
						</ToggleGroup>
					)}
				</ModalHeader>
				<ModalBody contentContainerStyle={{ height: '100%' }}>
					<ErrorBoundary>
						<VStack className="h-full gap-2">
							<ReceiptModeBadge mode={activeMode} />
							<SyncingBadge isSyncing={isSyncing} />
							{submissionStatus && (
								<FiscalStatus
									status={submissionStatus}
									onRetry={
										submissionStatus === 'failed' && !isRetrying ? handleFiscalRetry : undefined
									}
								/>
							)}
							<TemplateSwitcher
								templates={templates}
								selectedId={selectedTemplateId}
								onSelect={setSelectedTemplateId}
								isOffline={isOffline}
							/>
							<WebView
								ref={iframeRef as never}
								{...(renderedHtml != null
									? { srcDoc: renderedHtml }
									: { src: templateReceiptUrl || receiptURL })}
								onLoad={handleLoad}
								onMessage={() => {}}
								className="flex-1"
							/>
						</VStack>
					</ErrorBoundary>
				</ModalBody>
				<ModalFooter>
					<ModalClose testID="receipt-close-button">{t('common.close')}</ModalClose>
					{!isOffline ? (
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
					) : (
						<ModalAction disabled>{t('receipt.email_receipt')}</ModalAction>
					)}
					<ModalAction
						testID="receipt-print-button"
						onPress={() => print()}
						loading={isPrinting || isLoadingReceipt}
					>
						{t('receipt.print_receipt')}
					</ModalAction>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
