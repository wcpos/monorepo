import * as React from 'react';
import { Platform, View } from 'react-native';

import * as Alert from '@wcpos/components/alert-dialog';
import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import {
	Dialog,
	DialogClose,
	DialogContent,
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
	return methods.filter(
		(method) =>
			method.pos_enabled &&
			method.capture.mode === 'device' &&
			getDriver(method.capture.provider) !== undefined
	);
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
				<Text testID="card-readers-none" className="text-muted-foreground text-sm">
					{t('settings.card_readers.no_device_methods')}
				</Text>
			) : (
				<>
					{phoneRows.length > 0 || tapToPay.length > 0 ? (
						<SettingsSection
							first
							title={t('settings.card_readers.section_this_phone')}
							testID="card-readers-this-phone"
						>
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
						</SettingsSection>
					) : null}
					<SettingsSection
						first
						title={t('settings.card_readers.section_bluetooth')}
						testID="card-readers-list"
					>
						{bluetoothRows.length === 0 ? (
							<View
								testID="card-readers-empty"
								className="border-border rounded-lg border border-dashed px-3 py-5"
							>
								<Text className="text-muted-foreground text-center text-sm">
									{t('settings.card_readers.empty_bluetooth')}
								</Text>
							</View>
						) : (
							bluetoothRows.map(row)
						)}
					</SettingsSection>
					{/* The page's call to action, full width: the primary while no reader is held,
					    secondary beside one; the guide is a quiet link beneath. */}
					<VStack className="gap-1">
						<Button
							variant={readerHeld ? 'outline' : 'default'}
							className="h-14"
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
								{devices.map((method) => (
									<Button
										key={method.id}
										variant="ghost"
										className="h-14 flex-row justify-start gap-3 px-1"
										onPress={() => {
											setPicking(false);
											void actions.start(method);
										}}
										testID={`card-readers-connect-${method.id}`}
									>
										<View className="bg-muted size-10 items-center justify-center rounded-lg">
											<Icon name="creditCard" variant="muted" size="lg" />
										</View>
										<Text className="flex-1 text-lg font-semibold" numberOfLines={1} decodeHtml>
											{method.title}
										</Text>
										<Icon name="chevronRight" variant="muted" />
									</Button>
								))}
								<DialogClose className="mt-2 h-14" testID="card-readers-provider-cancel">
									<ButtonText>{t('common.cancel')}</ButtonText>
								</DialogClose>
							</VStack>
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
					<Alert.AlertDialogFooter>
						<Alert.AlertDialogCancel testID="card-readers-forget-cancel">
							{t('common.cancel')}
						</Alert.AlertDialogCancel>
						<Alert.AlertDialogAction
							variant="destructive"
							testID="card-readers-forget-confirm"
							onPress={actions.confirmForget}
						>
							{t('settings.card_readers.forget')}
						</Alert.AlertDialogAction>
					</Alert.AlertDialogFooter>
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
		<View
			testID={`tap-to-pay-row-${method.id}`}
			className="bg-card border-border gap-3 rounded-lg border p-3"
		>
			<HStack className="items-start gap-3">
				<View className="bg-muted size-10 items-center justify-center rounded-lg">
					<Icon name="creditCard" variant="muted" size="lg" />
				</View>
				<VStack className="flex-1 gap-0.5">
					<HStack className="items-start gap-2">
						<Text className="flex-1 text-lg font-semibold" numberOfLines={1}>
							{android
								? t('settings.card_readers.tap_to_pay_android')
								: t('settings.card_readers.tap_to_pay')}
						</Text>
						<Text
							className="text-muted-foreground bg-muted max-w-32 overflow-hidden rounded-full px-2 py-0.5 text-xs"
							numberOfLines={1}
							decodeHtml
						>
							{method.title}
						</Text>
					</HStack>
					{/* One line: not set up, and who can set it up when this user cannot. */}
					<Text
						className="text-muted-foreground text-sm"
						testID={`tap-to-pay-row-${method.id}-line`}
					>
						{canAccept
							? t('settings.card_readers.not_set_up')
							: t('settings.card_readers.not_set_up_admin')}
					</Text>
				</VStack>
			</HStack>
			{canAccept ? (
				<Button disabled={busy} onPress={onSetUp} testID={`tap-to-pay-row-${method.id}-set-up`}>
					<ButtonText>{t('settings.card_readers.set_up_tap_to_pay')}</ButtonText>
				</Button>
			) : null}
		</View>
	);
}
