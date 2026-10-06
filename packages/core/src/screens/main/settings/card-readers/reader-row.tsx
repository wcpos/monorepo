import * as React from 'react';
import { View } from 'react-native';

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
import { IconButton } from '@wcpos/components/icon-button';
import { Progress } from '@wcpos/components/progress';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { CARD_READER_DOCS_URL } from './docs';
import { useT } from '../../../../contexts/translations';
import { getDriver } from '../../../../services/payment-drivers/registry';
import { useDriverStatus } from '../../pos/checkout/tender/use-driver-status';

import type { ReaderActions } from './use-reader-actions';
import type { ReaderInfo } from '../../../../services/payment-drivers/types';
import type { RememberedReader } from '../../pos/checkout/tender/remembered-readers';

// Literal keys so the translation extractor sees them.
const ERROR_KEYS = {
	connect: 'settings.card_readers.could_not_connect',
	disconnect: 'settings.card_readers.could_not_disconnect',
	forget: 'settings.card_readers.could_not_forget',
	open: 'settings.card_readers.could_not_open',
} as const;

// Stripe reports the SDK's device type; the cashier knows the name on the box.
const MODEL_NAMES: Record<string, string> = {
	wisePad3: 'WisePad 3',
	stripeM2: 'Stripe Reader M2',
	chipper2X: 'Chipper 2X',
	wisePosE: 'WisePOS E',
	stripeS700: 'Stripe Reader S700',
};

export function readerName(
	reader: (Pick<ReaderInfo, 'label' | 'model'> & Partial<Pick<ReaderInfo, 'transport'>>) | null,
	t: (key: string) => string
): string {
	if (!reader) return '';
	if (reader.transport === 'tap_to_pay') return t('settings.card_readers.this_device');
	const model = reader.model ? (MODEL_NAMES[reader.model] ?? reader.model) : null;
	return model ?? reader.label;
}

/** The driver's availability turned into the one line the row shows instead of its actions. */
function availabilityLine(
	reason: 'web' | 'permission' | 'bluetooth_off' | 'not_logged_in' | 'unsupported' | null,
	title: string,
	t: (key: string, vars?: Record<string, string>) => string
): string | null {
	switch (reason) {
		case 'bluetooth_off':
			return t('settings.card_readers.bluetooth_off');
		case 'permission':
			return t('settings.card_readers.permission');
		case 'not_logged_in':
			return t('settings.card_readers.not_logged_in', { title });
		default:
			return null;
	}
}

export function ReaderRow({
	method,
	remembered,
	actions,
}: {
	method: PaymentMethodDescriptor;
	remembered: RememberedReader | null;
	actions: ReaderActions;
}) {
	const t = useT();
	const driver = getDriver(method.capture.provider);
	const status = useDriverStatus(driver);
	const [devControlRevision, refreshDevControls] = React.useReducer((value) => value + 1, 0);
	const devControls = React.useMemo(
		() => (__DEV__ ? (driver?.devControls?.() ?? []) : []),
		// The driver's mutable control snapshot changes on status events and completed actions.
		[driver, status, devControlRevision]
	);
	const sdkUi = driver?.capabilities.discovery === 'sdk_ui';
	const scan = actions.scan?.methodId === method.id ? actions.scan : null;
	const found = scan?.readers ?? null;
	const working = actions.working === method.id;
	const error = actions.errors[method.id] || null;
	const availability = driver?.availability() ?? null;
	const unavailable =
		availability && !availability.available
			? availabilityLine(availability.reason, method.title, t)
			: null;
	const connected = status.connection === 'connected';
	const reader = status.reader ?? remembered;
	const name = scan && !reader ? t('settings.card_readers.new_reader') : readerName(reader, t);
	const serial = reader?.serial ?? (reader && reader.id !== name ? reader.id : null);

	// One line of state under the name; the actions on the right follow it.
	let line: React.ReactNode = null;
	let lineClass = 'text-muted-foreground text-xs';
	let below: React.ReactNode = null;
	if (error) {
		line = t(ERROR_KEYS[error.kind], { message: error.message });
		lineClass = 'text-destructive text-xs';
	} else if (scan && found === null) line = t('settings.card_readers.looking');
	else if (found)
		line =
			found.length === 0
				? t('settings.card_readers.none_found')
				: found.length === 1
					? t('settings.card_readers.found_single')
					: t('settings.card_readers.found_n', { n: found.length });
	else if (unavailable) {
		line = unavailable;
		lineClass = 'text-warning text-xs';
	} else if (status.connection === 'updating') {
		line = t('settings.card_readers.installing');
		below = (
			<VStack className="gap-1 pt-1">
				<Progress
					testID={`reader-row-${method.id}-progress`}
					value={status.progress == null ? undefined : Math.round(status.progress * 100)}
					indeterminate={status.progress == null}
				/>
				<Text className="text-muted-foreground text-xs">
					{t('settings.card_readers.installing_hint')}
				</Text>
			</VStack>
		);
	} else if (status.connection === 'connecting' || status.connection === 'discovering')
		line = t('settings.card_readers.connecting_to', { name });
	else if (!connected && sdkUi && reader)
		line = t('settings.card_readers.saved_in_app', { title: method.title });
	// Connected says so in the status chip, and a plain Connect button already means "not
	// connected": neither state earns a third line (the Printers row has two).

	if (found)
		below = (
			<VStack testID={`reader-row-${method.id}-found`} className="gap-1 pt-1">
				{found.map((candidate) => (
					<HStack
						key={candidate.id}
						className="bg-card border-border items-center gap-3 rounded-lg border px-3 py-2"
					>
						<VStack className="flex-1 gap-0">
							<Text className="text-sm">{readerName(candidate, t)}</Text>
							{candidate.serial || candidate.id !== candidate.label ? (
								<Text className="text-muted-foreground font-mono text-xs">
									{candidate.serial ?? candidate.id}
								</Text>
							) : null}
						</VStack>
						<Button
							size="sm"
							disabled={working}
							loading={working}
							onPress={() => void actions.connect(method, candidate)}
							testID={`reader-row-${method.id}-connect-${candidate.id}`}
						>
							<ButtonText>{t('settings.card_readers.connect')}</ButtonText>
						</Button>
					</HStack>
				))}
				<HStack className="items-center justify-between">
					<DocsLink testID={`reader-row-${method.id}-cant-see`} href={CARD_READER_DOCS_URL}>
						{t('settings.card_readers.cant_see')}
					</DocsLink>
					<Button
						variant="ghost-quiet"
						size="sm"
						onPress={actions.cancelScan}
						testID={`reader-row-${method.id}-cancel-scan`}
					>
						<ButtonText>{t('common.cancel')}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		);

	const busy = working || status.connection === 'connecting' || status.connection === 'updating';
	return (
		<View testID={`reader-row-${method.id}`} className="gap-1 rounded-lg px-2 py-2.5">
			<HStack className="flex-wrap items-center gap-x-3 gap-y-2">
				<View className="bg-muted rounded-md p-2">
					<Icon name="creditCard" variant={connected ? 'success' : 'muted'} size="lg" />
				</View>
				<VStack className="min-w-40 flex-1 gap-0.5">
					<Text className="text-sm font-medium" numberOfLines={1}>
						{name || method.title}
					</Text>
					<HStack className="flex-wrap items-center gap-x-1.5">
						{serial ? (
							<Text className="text-muted-foreground font-mono text-xs" numberOfLines={1}>
								{serial}
							</Text>
						) : null}
						<Text
							testID={`reader-row-${method.id}-provider`}
							className="text-muted-foreground border-border rounded-full border px-1.5 text-xs"
							decodeHtml
						>
							{method.title}
						</Text>
					</HStack>
				</VStack>
				<HStack className="ml-auto flex-wrap items-center gap-2">
					{connected ? (
						<HStack testID={`reader-row-${method.id}-status`} className="items-center gap-1.5">
							<View className="bg-success size-2 rounded-full" />
							<Text className="text-success text-xs">
								{reader?.transport === 'tap_to_pay'
									? t('settings.card_readers.ready')
									: t('settings.card_readers.connected')}
								{status.reader?.battery == null
									? ''
									: ` · ${t('pos_checkout.reader_battery_percent', { battery: status.reader.battery })}`}
							</Text>
						</HStack>
					) : null}
					{scan && found === null ? (
						<Button
							variant="ghost-quiet"
							size="sm"
							onPress={actions.cancelScan}
							testID={`reader-row-${method.id}-cancel-scan`}
						>
							<ButtonText>{t('common.cancel')}</ButtonText>
						</Button>
					) : null}
					{error ? (
						<>
							<Button
								variant="outline"
								size="sm"
								disabled={busy}
								// A failed Tap to Pay set-up retries Tap to Pay, not a Bluetooth scan.
								onPress={() => void actions.start(method, error.transport)}
								testID={`reader-row-${method.id}-retry`}
							>
								<ButtonText>{t('settings.card_readers.try_again')}</ButtonText>
							</Button>
							<DocsLink testID={`reader-row-${method.id}-help`} href={CARD_READER_DOCS_URL}>
								{t('settings.card_readers.help')}
							</DocsLink>
						</>
					) : null}
					{sdkUi && !error ? (
						<Button
							variant="outline"
							size="sm"
							// Signing in is what the SDK's own screen is for; every other block stays a block.
							disabled={
								busy ||
								Boolean(
									availability &&
									!availability.available &&
									unavailable &&
									availability.reason !== 'not_logged_in'
								)
							}
							loading={working}
							onPress={() => void actions.start(method)}
							testID={`reader-row-${method.id}-open-sdk`}
						>
							<ButtonText>
								{t('settings.card_readers.open_provider_settings', { title: method.title })}
							</ButtonText>
						</Button>
					) : null}
					{!sdkUi && !scan && !error && !connected && status.connection === 'disconnected' ? (
						<Button
							variant="outline"
							size="sm"
							disabled={busy || Boolean(unavailable)}
							loading={working}
							onPress={() => void actions.start(method, reader?.transport)}
							testID={`reader-row-${method.id}-connect`}
						>
							<ButtonText>{t('settings.card_readers.connect')}</ButtonText>
						</Button>
					) : null}
					{connected && !sdkUi ? (
						<Button
							variant="outline"
							size="sm"
							disabled={working}
							loading={working}
							onPress={() => void actions.disconnect(method)}
							testID={`reader-row-${method.id}-disconnect`}
						>
							<ButtonText>{t('settings.card_readers.disconnect')}</ButtonText>
						</Button>
					) : null}
					{!scan ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<IconButton name="ellipsisVertical" testID={`reader-row-${method.id}-menu`} />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{!connected && !sdkUi ? (
									// The recovery for an SDK still holding a reader the app thinks is gone.
									<DropdownMenuItem
										onPress={() => void actions.disconnect(method)}
										testID={`reader-row-${method.id}-release`}
									>
										<Icon name="circleInfo" />
										<Text>{t('settings.card_readers.disconnect')}</Text>
									</DropdownMenuItem>
								) : null}
								{remembered || connected ? (
									<DropdownMenuItem
										variant="destructive"
										onPress={() => actions.askForget(method)}
										testID={`reader-row-${method.id}-forget`}
									>
										<Icon name="trash" className="fill-destructive" />
										<Text>{t('settings.card_readers.forget')}</Text>
									</DropdownMenuItem>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</HStack>
			</HStack>
			{line ? (
				<Text testID={`reader-row-${method.id}-line`} className={`${lineClass} pl-12`}>
					{line}
				</Text>
			) : null}
			{below ? <View className="pl-12">{below}</View> : null}
			{__DEV__ && devControls.length > 0 && connected ? (
				<HStack className="flex-wrap gap-2 pt-1 pl-12">
					{devControls.map((control) => (
						<Button
							key={control.id}
							testID={`reader-row-${method.id}-dev-control-${control.id}`}
							size="sm"
							variant={control.active ? 'default' : 'secondary'}
							disabled={working}
							onPress={() =>
								void actions.runDev(method, async () => {
									try {
										await control.run();
									} finally {
										refreshDevControls();
									}
								})
							}
						>
							<ButtonText>{control.label}</ButtonText>
						</Button>
					))}
				</HStack>
			) : null}
		</View>
	);
}
