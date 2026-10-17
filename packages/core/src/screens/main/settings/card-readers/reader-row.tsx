import * as React from 'react';
import { View } from 'react-native';

import { decode } from 'html-entities';

import { Badge } from '@wcpos/components/badge';
import { Button, ButtonText } from '@wcpos/components/button';
import { Chip } from '@wcpos/components/chip';
import { DocsLink } from '@wcpos/components/docs-link';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { cn } from '@wcpos/components/lib/utils';
import { Progress } from '@wcpos/components/progress';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { CARD_READER_DOCS_URL } from './docs';
import { readerName } from './reader-name';
import { useT } from '../../../../contexts/translations';
import { getDriver } from '../../../../services/payment-drivers/registry';
import { useDriverStatus } from '../../pos/checkout/tender/use-driver-status';

import type { ReaderActions } from './use-reader-actions';
import type { RememberedReader } from '../../pos/checkout/tender/remembered-readers';

// Literal keys so the translation extractor sees them.
const ERROR_KEYS = {
	connect: 'settings.card_readers.could_not_connect',
	disconnect: 'settings.card_readers.could_not_disconnect',
	forget: 'settings.card_readers.could_not_forget',
	open: 'settings.card_readers.could_not_open',
} as const;

export { readerName };

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
	const name =
		(scan || working) && !reader ? t('settings.card_readers.new_reader') : readerName(reader, t);
	const serial = reader?.serial ?? (reader && reader.id !== name ? reader.id : null);

	const updating = status.connection === 'updating';
	const connecting = status.connection === 'connecting' || status.connection === 'discovering';
	// One line of state under the name; the actions get a full-width row of their own below.
	let line: React.ReactNode = null;
	let lineClass = 'text-muted-foreground text-sm';
	let below: React.ReactNode = null;
	if (error) {
		line = t(ERROR_KEYS[error.kind], { message: error.message });
		lineClass = 'text-destructive text-sm';
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
		lineClass = 'text-warning text-sm';
	} else if (updating) {
		line = t('settings.card_readers.installing');
		below = (
			<VStack className="gap-1 pt-1">
				<Progress
					testID={`reader-row-${method.id}-progress`}
					value={status.progress == null ? undefined : Math.round(status.progress * 100)}
					indeterminate={status.progress == null}
				/>
				<Text className="text-muted-foreground text-sm">
					{t('settings.card_readers.installing_hint')}
				</Text>
			</VStack>
		);
	} else if (connecting) line = t('settings.card_readers.connecting_to', { name });
	else if (!connected && sdkUi && reader)
		line = t('settings.card_readers.saved_in_app', { title: method.title });
	// The state line is never blank (owner, 2026-10-13: a Connect button beside a Disconnect
	// menu item read as "so is it connected or not?"): a remembered reader says it is not.
	else if (!connected && reader) line = t('settings.card_readers.not_connected');

	// A scan that found nothing has ended: there is nothing to cancel, so the slot below offers
	// Try again (the guide's "unavailable → the same slot") and the docs link sits under the line.
	const foundNone = found !== null && found.length === 0;
	if (foundNone)
		below = (
			<DocsLink testID={`reader-row-${method.id}-cant-see`} href={CARD_READER_DOCS_URL}>
				{t('settings.card_readers.cant_see')}
			</DocsLink>
		);
	else if (found)
		below = (
			<VStack testID={`reader-row-${method.id}-found`}>
				{found.map((candidate) => (
					<HStack key={candidate.id} className="border-border items-center gap-3 border-t py-3">
						<VStack className="flex-1 gap-0">
							<Text className="font-semibold" numberOfLines={1}>
								{readerName(candidate, t)}
							</Text>
							{candidate.serial || candidate.id !== candidate.label ? (
								<Text className="text-muted-foreground font-mono text-sm">
									{candidate.serial ?? candidate.id}
								</Text>
							) : null}
						</VStack>
						<Button
							className="w-28"
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
						variant="ghost"
						onPress={actions.cancelScan}
						testID={`reader-row-${method.id}-cancel-scan`}
					>
						<ButtonText>{t('common.cancel')}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		);

	const busy = working || connecting || updating;
	// The gateway names its Terminal location in the descriptor (Stripe: `location_name`); a
	// Bluetooth reader registers to that location when it connects, so it is the reader's too.
	const locationName =
		typeof method.provider_data.location_name === 'string' && method.provider_data.location_name
			? method.provider_data.location_name
			: null;
	return (
		<View
			testID={`reader-row-${method.id}`}
			className="bg-card border-border gap-3 rounded-lg border p-3"
		>
			{/* Stacked lines, never a wrap: name and provider, serial and location, then the state. */}
			<HStack className="items-start gap-3">
				<View
					className={cn(
						'size-10 items-center justify-center rounded-lg',
						error ? 'bg-destructive/10' : connected ? 'bg-success/10' : 'bg-muted'
					)}
				>
					<Icon
						name="creditCard"
						variant={error ? 'destructive' : connected ? 'success' : 'muted'}
						size="lg"
						loading={scan !== null && found === null}
					/>
				</View>
				<VStack className="flex-1 gap-0.5">
					<HStack className="items-start gap-2">
						<Text className="flex-1 text-lg font-semibold" numberOfLines={1}>
							{name || method.title}
						</Text>
						<Badge testID={`reader-row-${method.id}-provider`} variant="muted" className="max-w-32">
							{decode(method.title)}
						</Badge>
					</HStack>
					{serial || locationName ? (
						<HStack className="items-center gap-1.5">
							{serial ? (
								<Text className="text-muted-foreground shrink font-mono text-sm" numberOfLines={1}>
									{serial}
								</Text>
							) : null}
							{locationName ? (
								<Text
									testID={`reader-row-${method.id}-location`}
									className="text-muted-foreground shrink text-sm"
									numberOfLines={1}
								>
									{serial ? `· ${locationName}` : locationName}
								</Text>
							) : null}
						</HStack>
					) : null}
					{connected ? (
						<HStack testID={`reader-row-${method.id}-status`} className="items-center gap-1.5">
							<View className="bg-success size-2 rounded-full" />
							<Text className="text-sm">
								{reader?.transport === 'tap_to_pay'
									? t('settings.card_readers.ready')
									: t('settings.card_readers.connected')}
								{status.reader?.battery == null
									? ''
									: ` · ${t('pos_checkout.reader_battery_percent', { battery: status.reader.battery })}`}
							</Text>
						</HStack>
					) : null}
					{line ? (
						<Text testID={`reader-row-${method.id}-line`} className={lineClass}>
							{line}
						</Text>
					) : null}
				</VStack>
			</HStack>
			{below}
			{/* The actions are a full-width row of their own: nothing shares a line with free text. */}
			{!scan || found === null || foundNone ? (
				<HStack className="w-full items-center gap-2">
					{foundNone ? (
						<Button
							className="flex-1"
							disabled={busy}
							onPress={() => void actions.start(method, scan?.transport)}
							testID={`reader-row-${method.id}-retry`}
						>
							<ButtonText>{t('settings.card_readers.try_again')}</ButtonText>
						</Button>
					) : null}
					{scan && found === null ? (
						<Button
							variant="outline"
							className="flex-1"
							onPress={actions.cancelScan}
							testID={`reader-row-${method.id}-cancel-scan`}
						>
							<ButtonText>{t('common.cancel')}</ButtonText>
						</Button>
					) : null}
					{/* A failed disconnect or forget on a held reader keeps Disconnect as the way back. */}
					{error && !connected ? (
						<>
							<Button
								className="flex-1"
								disabled={busy}
								// A failed Tap to Pay set-up retries Tap to Pay, not a Bluetooth scan.
								onPress={() => void actions.start(method, error.transport)}
								testID={`reader-row-${method.id}-retry`}
							>
								<ButtonText>{t('settings.card_readers.try_again')}</ButtonText>
							</Button>
							<Button
								variant="outline"
								className="flex-1"
								rightIcon="arrowUpRight"
								onPress={() => void openExternalURL(CARD_READER_DOCS_URL)}
								testID={`reader-row-${method.id}-help`}
							>
								<ButtonText>{t('settings.card_readers.help')}</ButtonText>
							</Button>
						</>
					) : null}
					{sdkUi && !(error && !connected) ? (
						<Button
							variant="outline"
							className="flex-1"
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
					{/* Connecting and installing keep a disabled button in the slot: it never empties. */}
					{!sdkUi && !scan && !error && (connecting || updating) ? (
						<Button
							variant="outline"
							className="flex-1"
							disabled
							testID={`reader-row-${method.id}-connect`}
						>
							<ButtonText>
								{updating
									? t('settings.card_readers.installing_button')
									: t('settings.card_readers.connecting_button')}
							</ButtonText>
						</Button>
					) : null}
					{!sdkUi && !scan && !error && !connected && status.connection === 'disconnected' ? (
						<Button
							className="flex-1"
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
							className="flex-1"
							disabled={working}
							loading={working}
							onPress={() => void actions.disconnect(method)}
							testID={`reader-row-${method.id}-disconnect`}
						>
							<ButtonText>{t('settings.card_readers.disconnect')}</ButtonText>
						</Button>
					) : null}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton
								name="ellipsisVertical"
								variant="outline"
								// The menu stays in place; with nothing to release or forget it is disabled.
								disabled={!connected && !status.reader && !remembered}
								testID={`reader-row-${method.id}-menu`}
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{!connected && !sdkUi && status.reader ? (
								// The recovery for an SDK still holding a reader the app thinks is gone:
								// offered only while the driver reports one held, and named for what it
								// does, so it never contradicts the Connect button beside it.
								<DropdownMenuItem
									onPress={() => void actions.disconnect(method)}
									testID={`reader-row-${method.id}-release`}
								>
									<Icon name="circleInfo" />
									<Text>{t('settings.card_readers.release_reader')}</Text>
								</DropdownMenuItem>
							) : null}
							{remembered && !connected && !sdkUi && status.reader ? (
								// The red row is last and set apart when another action sits above it.
								<DropdownMenuSeparator />
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
				</HStack>
			) : null}
			{__DEV__ && devControls.length > 0 && connected ? (
				<HStack className="flex-wrap gap-2">
					{devControls.map((control) => (
						// An on/off dev control is a choice: a Chip, never a toggled Button.
						<Chip
							key={control.id}
							label={control.label}
							on={control.active}
							testID={`reader-row-${method.id}-dev-control-${control.id}`}
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
						/>
					))}
				</HStack>
			) : null}
		</View>
	);
}
