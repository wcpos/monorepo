import * as React from 'react';
import { Platform, View } from 'react-native';

import * as Alert from '@wcpos/components/alert-dialog';
import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
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
			Boolean(actions.errors[method.id])
		);
	});
	// Tap to Pay (iOS only): the phone is a reader this provider can connect, offered as a row of
	// its own until it is the connected one. Apple's awareness moment and Terms sheet come from the
	// provider's SDK on the first connect; only an administrator may accept them (fail closed).
	const tapToPay = devices.filter(
		(method) =>
			Platform.OS === 'ios' &&
			deviceTransports(method).some((item) => item.transport === 'tap_to_pay') &&
			getDriver(method.capture.provider)?.capabilities.discovery === 'harness' &&
			getDriver(method.capture.provider)?.status$.get().reader?.transport !== 'tap_to_pay' &&
			remembered[method.id]?.transport !== 'tap_to_pay'
	);
	// Every provider stays offered: scanning again is how a reader is changed.
	const connectable = devices;
	// Named from the target, not the pending flag, so the title survives the dialog's exit.
	const forgetName = actions.forgetTarget
		? readerName(
				getDriver(actions.forgetTarget.capture.provider)?.status$.get().reader ??
					remembered[actions.forgetTarget.id] ??
					null,
				t
			) || actions.forgetTarget.title
		: '';

	const connectButton = (variant: 'default' | 'outline') =>
		connectable.length === 1 ? (
			<Button
				variant={variant}
				size={variant === 'outline' ? 'sm' : undefined}
				leftIcon="plus"
				disabled={actions.working !== null}
				onPress={() => void actions.start(connectable[0])}
				testID="card-readers-connect"
			>
				<Text>{t('settings.card_readers.connect_a_reader')}</Text>
			</Button>
		) : (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant={variant}
						size={variant === 'outline' ? 'sm' : undefined}
						leftIcon="plus"
						disabled={actions.working !== null}
						testID="card-readers-connect"
					>
						<Text>{t('settings.card_readers.connect_a_reader')}</Text>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{connectable.map((method) => (
						<DropdownMenuItem
							key={method.id}
							onPress={() => void actions.start(method)}
							testID={`card-readers-connect-${method.id}`}
						>
							<Icon name="creditCard" />
							<Text decodeHtml>{method.title}</Text>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		);

	return (
		<VStack className="gap-5">
			<SettingsSection
				first
				title={t('settings.card_readers.readers')}
				description={t('settings.card_readers.readers_description')}
				testID="card-readers-list"
			>
				{devices.length === 0 ? (
					<Text testID="card-readers-none" className="text-muted-foreground text-sm">
						{t('settings.card_readers.no_device_methods')}
					</Text>
				) : rows.length === 0 && tapToPay.length === 0 ? (
					<View
						testID="card-readers-empty"
						className="border-border items-center rounded-lg border border-dashed p-8"
					>
						<VStack className="max-w-sm items-center gap-3">
							<View className="bg-muted rounded-lg p-3">
								<Icon name="creditCard" variant="muted" size="2xl" />
							</View>
							<Text className="text-center font-medium">
								{t('settings.card_readers.empty_title')}
							</Text>
							<Text className="text-muted-foreground text-center text-sm">
								{t('settings.card_readers.empty_body')}
							</Text>
							<HStack className="flex-wrap items-center justify-center gap-2">
								{connectButton('default')}
								<DocsLink testID="card-readers-guide-link" href={CARD_READER_DOCS_URL}>
									{t('settings.card_readers.reader_guide')}
								</DocsLink>
							</HStack>
						</VStack>
					</View>
				) : (
					<>
						<View>
							{rows.map((method) => (
								<ReaderRow
									key={method.id}
									method={method}
									remembered={remembered[method.id] ?? null}
									actions={actions}
								/>
							))}
							{tapToPay.map((method) => (
								<TapToPayRow
									key={`ttp-${method.id}`}
									method={method}
									canAccept={caps.canAcceptReaderTerms}
									busy={actions.working !== null}
									onSetUp={() => void actions.start(method, 'tap_to_pay')}
								/>
							))}
						</View>
						<HStack className="flex-wrap items-center gap-2 pt-2">
							{connectButton('outline')}
							<DocsLink testID="card-readers-having-trouble" href={CARD_READER_DOCS_URL}>
								{t('settings.having_trouble')}
							</DocsLink>
						</HStack>
					</>
				)}
			</SettingsSection>

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
	return (
		<View testID={`tap-to-pay-row-${method.id}`} className="gap-1 rounded-lg px-2 py-2.5">
			<HStack className="flex-wrap items-center gap-x-3 gap-y-2">
				<View className="bg-muted rounded-md p-2">
					<Icon name="creditCard" variant="muted" size="lg" />
				</View>
				<VStack className="min-w-40 flex-1 gap-0.5">
					<Text className="text-sm font-medium">{t('settings.card_readers.tap_to_pay')}</Text>
					<HStack className="flex-wrap items-center gap-x-1.5">
						<Text
							className="text-muted-foreground text-xs"
							testID={`tap-to-pay-row-${method.id}-line`}
						>
							{canAccept
								? t('settings.card_readers.tap_to_pay_body')
								: t('settings.card_readers.tap_to_pay_admin_only')}
						</Text>
						<Text
							className="text-muted-foreground border-border rounded-full border px-1.5 text-xs"
							decodeHtml
						>
							{method.title}
						</Text>
					</HStack>
				</VStack>
				<HStack className="ml-auto items-center gap-2">
					{canAccept ? (
						<Button
							size="sm"
							disabled={busy}
							onPress={onSetUp}
							testID={`tap-to-pay-row-${method.id}-set-up`}
						>
							<ButtonText>{t('settings.card_readers.set_up')}</ButtonText>
						</Button>
					) : (
						<Text className="text-muted-foreground text-xs">
							{t('settings.card_readers.not_set_up')}
						</Text>
					)}
				</HStack>
			</HStack>
		</View>
	);
}
