import * as React from 'react';
import { Platform } from 'react-native';

import { decode } from 'html-entities';

import * as Alert from '@wcpos/components/alert-dialog';
import { Button, ButtonText } from '@wcpos/components/button';
import { DeviceList, DeviceRow, DeviceRowActions } from '@wcpos/components/device-row';
import { DocsLink } from '@wcpos/components/docs-link';
import { EmptyState } from '@wcpos/components/empty-state';
import { HStack } from '@wcpos/components/hstack';
import { MenuRow, MenuRowGroup } from '@wcpos/components/menu-row';
import { Icon } from '@wcpos/components/icon';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Portal } from '@wcpos/components/portal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { CARD_READER_DOCS_URL } from './docs';
import { readerName, ReaderRow } from './reader-row';
import { useReaderActions } from './use-reader-actions';
import { SettingsSection } from '../components/settings-section';
import { useT } from '../../../../contexts/translations';
import { getDriver } from '../../../../services/payment-drivers/registry';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';
import { useRememberedReaders } from '../../pos/checkout/tender/remembered-readers';
import { deviceTransports } from '../../pos/checkout/tender/tiles';
import { useDriverChanges } from '../../pos/checkout/tender/use-driver-status';

/** Device-mode methods this build can drive: a row's worth of reader maintenance each. */
function deviceMethods(methods: readonly PaymentMethodDescriptor[]) {
	return methods.filter((method) => {
		if (!method.pos_enabled || method.capture.mode !== 'device') return false;
		const availability = getDriver(method.capture.provider)?.availability();
		if (!availability) return false;
		// A driver that can never run on this platform (a web stub) is not a provider to offer.
		return availability.available || availability.reason !== 'web';
	});
}

/**
 * Settings → Card readers (wcpos/roadmap#407). Rows are readers, like the Printers page: the
 * reader the provider's driver is connected to, or the one remembered from the last sale. The
 * provider is a chip on the row. "Connect a reader" picks the provider and scans in place; a
 * provider whose SDK owns its pairing screen (SumUp) opens that screen instead.
 */
export function CardReadersSettings() {
	const t = useT();
	const { methods } = usePaymentMethods();
	useDriverChanges();
	const remembered = useRememberedReaders();
	const actions = useReaderActions();
	const { caps } = useUserCapabilities();
	const devices = deviceMethods(methods);
	const rows = devices.filter((method) => {
		const status = getDriver(method.capture.provider)?.status$.get();
		// A row stays while it has something to say: a connection, a memory, a scan or an error.
		return (
			status?.connection !== 'disconnected' ||
			status.reader !== null ||
			remembered[method.id] !== undefined ||
			actions.scan?.methodId === method.id ||
			actions.working === method.id ||
			Boolean(actions.errors[method.id])
		);
	});
	// The phone itself (a connected or remembered Tap to Pay reader) sits under This phone.
	const onPhone = (method: PaymentMethodDescriptor) =>
		(actions.scan?.methodId === method.id
			? actions.scan
			: (getDriver(method.capture.provider)?.status$.get().reader ?? remembered[method.id])
		)?.transport === 'tap_to_pay';
	// Tap to Pay (the native app only; the browser has no NFC): the phone is a reader this provider
	// can connect, offered as a row of its own until it is the connected one. The provider's terms
	// (Apple's awareness moment and Terms sheet on iOS, the SDK's own on Android) come on the first
	// connect; only an administrator may accept them (fail closed). Android needs the Stripe plugin
	// options from roadmap#429 in the native build.
	// The simulated provider gets no Tap to Pay row on a device: it is a development stand-in.
	const tapToPay = devices.filter(
		(method) =>
			Platform.OS !== 'web' &&
			method.capture.provider !== 'simulated' &&
			deviceTransports(method).some((item) => item.transport === 'tap_to_pay') &&
			getDriver(method.capture.provider)?.capabilities.discovery === 'harness' &&
			!onPhone(method)
	);
	// Named from the target, not the pending flag, so the title survives the dialog's exit.
	const forgetName = actions.forgetTarget
		? readerName(
				getDriver(actions.forgetTarget.capture.provider)?.status$.get().reader ??
					remembered[actions.forgetTarget.id] ??
					null,
				t
			) || actions.forgetTarget.title
		: '';

	// A reader held by any provider (the row's ⋮ offers to release it) makes Connect secondary.
	const readerHeld = devices.some((method) =>
		Boolean(getDriver(method.capture.provider)?.status$.get().reader)
	);
	const [picking, setPicking] = React.useState(false);
	const row = (method: PaymentMethodDescriptor) => (
		<ReaderRow
			key={method.id}
			method={method}
			remembered={remembered[method.id] ?? null}
			actions={actions}
		/>
	);
	const phoneRows = rows.filter(onPhone);
	const bluetoothRows = rows.filter((method) => !onPhone(method));

	return (
		<VStack className="gap-5">
			<Text className="text-muted-foreground">{t('settings.card_readers.description')}</Text>
			{devices.length === 0 ? (
				<EmptyState
					testID="card-readers-none"
					kind="empty"
					size="inline"
					title={t('settings.card_readers.no_device_methods')}
				/>
			) : (
				<>
					{phoneRows.length > 0 || tapToPay.length > 0 ? (
						<SettingsSection
							first
							title={t('settings.card_readers.section_this_phone')}
							testID="card-readers-this-phone"
						>
							<DeviceList>
								{phoneRows.map(row)}
								{tapToPay.map((method) => (
									<TapToPayRow
										key={`ttp-${method.id}`}
										method={method}
										canAccept={caps.canAcceptReaderTerms}
										busy={actions.working !== null}
										onSetUp={() => void actions.start(method, 'tap_to_pay')}
									/>
								))}
							</DeviceList>
						</SettingsSection>
					) : null}
					<SettingsSection
						first
						title={t('settings.card_readers.section_bluetooth')}
						testID="card-readers-list"
					>
						{bluetoothRows.length === 0 ? (
							<EmptyState
								testID="card-readers-empty"
								kind="empty"
								icon="card"
								title={t('settings.card_readers.empty_bluetooth')}
							/>
						) : (
							<DeviceList>{bluetoothRows.map(row)}</DeviceList>
						)}
					</SettingsSection>
					{/* The page's call to action, full width: the primary while no reader is held,
					    secondary beside one; the guide is a quiet link beneath. */}
					<VStack className="gap-1">
						<Button
							variant={readerHeld ? 'outline' : 'default'}
							leftIcon="plus"
							disabled={actions.working !== null}
							onPress={() =>
								devices.length === 1 ? void actions.start(devices[0]) : setPicking(true)
							}
							testID="card-readers-connect"
						>
							<ButtonText>{t('settings.card_readers.connect_a_reader')}</ButtonText>
						</Button>
						<HStack className="justify-center py-2">
							<DocsLink testID="card-readers-guide-link" href={CARD_READER_DOCS_URL}>
								{t('settings.card_readers.reader_guide')}
							</DocsLink>
						</HStack>
					</VStack>
				</>
			)}

			{picking ? (
				<Portal name="card-readers-provider-sheet">
					<Dialog route onClose={() => setPicking(false)}>
						<DialogContent side="bottom" testID="card-readers-provider-sheet">
							<DialogHeader>
								<DialogTitle>{t('settings.card_readers.connect_with')}</DialogTitle>
							</DialogHeader>
							<VStack className="gap-1 px-4">
								<MenuRowGroup
									accessibilityLabel={t('settings.card_readers.connect_with')}
									className="gap-1"
								>
									{devices.map((method) => (
										<MenuRow
											key={method.id}
											choice
											selected={false}
											onPress={() => {
												setPicking(false);
												void actions.start(method);
											}}
											testID={`card-readers-connect-${method.id}`}
											leading={<Icon name="card" variant="muted" size="lg" />}
											label={<MenuRow.Label decodeHtml>{method.title}</MenuRow.Label>}
											trailing={<Icon name="chevronRight" variant="muted" />}
										/>
									))}
								</MenuRowGroup>
							</VStack>
							<DialogFooter close={{ testID: 'card-readers-provider-cancel' }} />
						</DialogContent>
					</Dialog>
				</Portal>
			) : null}

			<Alert.AlertDialog
				open={actions.pendingForget !== null}
				onOpenChange={(open) => !open && actions.cancelForget()}
			>
				<Alert.AlertDialogContent>
					<Alert.AlertDialogHeader>
						<Alert.AlertDialogTitle>
							{t('settings.card_readers.forget_title', { name: forgetName })}
						</Alert.AlertDialogTitle>
						<Alert.AlertDialogDescription>
							{t('settings.card_readers.forget_description')}
						</Alert.AlertDialogDescription>
					</Alert.AlertDialogHeader>
					<Alert.AlertDialogFooter
						cancel={{ testID: 'card-readers-forget-cancel' }}
						confirm={{
							label: t('settings.card_readers.forget'),
							destructive: true,
							testID: 'card-readers-forget-confirm',
							onPress: actions.confirmForget,
						}}
					/>
				</Alert.AlertDialogContent>
			</Alert.AlertDialog>
		</VStack>
	);
}

function TapToPayRow({
	method,
	canAccept,
	busy,
	onSetUp,
}: {
	method: PaymentMethodDescriptor;
	canAccept: boolean;
	busy: boolean;
	onSetUp: () => void;
}) {
	const t = useT();
	// Named for the phone in the cashier's hand: Apple's name on iOS, Android's on Android.
	const android = Platform.OS === 'android';
	return (
		<DeviceRow
			testID={`tap-to-pay-row-${method.id}`}
			icon="card"
			name={
				android
					? t('settings.card_readers.tap_to_pay_android')
					: t('settings.card_readers.tap_to_pay')
			}
			tag={decode(method.title)}
			// One line: not set up, and who can set it up when this user cannot.
			state={{
				tone: 'muted',
				testID: `tap-to-pay-row-${method.id}-line`,
				label: canAccept
					? t('settings.card_readers.not_set_up')
					: t('settings.card_readers.not_set_up_admin'),
			}}
		>
			{canAccept ? (
				<DeviceRowActions>
					<Button disabled={busy} onPress={onSetUp} testID={`tap-to-pay-row-${method.id}-set-up`}>
						<ButtonText>{t('settings.card_readers.set_up_tap_to_pay')}</ButtonText>
					</Button>
				</DeviceRowActions>
			) : null}
		</DeviceRow>
	);
}
