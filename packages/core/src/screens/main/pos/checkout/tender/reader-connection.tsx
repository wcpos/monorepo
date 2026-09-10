import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { PaymentMethodDescriptor, PaymentTransport } from '@wcpos/order-math';

import { useT } from '../../../../../contexts/translations';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { deviceTransports } from './tiles';
import { useDriverStatus } from './use-driver-status';

import type { ReaderInfo } from '../../../../../services/payment-drivers/types';

export function ReaderConnection({
	method,
	bootstrap,
	remembered,
	remember,
	transport,
	pickTransport,
	online,
	disabled,
}: {
	method: PaymentMethodDescriptor;
	remembered: string | null;
	remember: (readerId: string) => Promise<void>;
	bootstrap: (transport: PaymentTransport) => Promise<Record<string, unknown> | null>;
	transport: PaymentTransport | null;
	pickTransport: (transport: PaymentTransport) => void;
	online: boolean;
	disabled: boolean;
}) {
	const t = useT();
	const driver = getDriver(method.capture.provider);
	const status = useDriverStatus(driver);
	const [readers, setReaders] = React.useState<ReaderInfo[] | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [working, setWorking] = React.useState(false);
	const attempted = React.useRef(false);
	const reconnect = React.useRef<{ cancelled: boolean } | null>(null);
	const transports = deviceTransports(method);
	const connect = React.useCallback(
		async (reader: ReaderInfo, active: () => boolean = () => true) => {
			if (!driver?.connect) return;
			const handoff = online ? await bootstrap(reader.transport) : null;
			if (!active()) return;
			await driver.connect(reader, handoff);
			if (!active()) return;
			pickTransport(reader.transport);
			await remember(reader.id);
			if (!active()) return;
			setReaders(null);
		},
		[driver, online, bootstrap, pickTransport, remember]
	);
	const run = async (operation: () => Promise<void>) => {
		if (working || disabled) return;
		attempted.current = true;
		setWorking(true);
		setError(null);
		try {
			await operation();
		} catch (error) {
			setError(error instanceof Error ? error.message : t('pos_checkout.reader_connection_failed'));
		} finally {
			setWorking(false);
		}
	};
	// Reconnect an externally loaded preference once when this method's keypad mounts.
	React.useEffect(() => {
		if (reconnect.current?.cancelled) {
			reconnect.current = null;
			// eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, react-you-might-not-need-an-effect/no-external-store-subscription -- Release the cancelled run only while mounted.
			setWorking(false);
		}
		if (!remembered || attempted.current || !driver?.discoverReaders || disabled) return;
		attempted.current = true;
		let active = true;
		const operation = { cancelled: false };
		reconnect.current = operation;
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, react-you-might-not-need-an-effect/no-external-store-subscription -- Reconnect an externally loaded preference; this begins async driver work.
		setWorking(true);
		void (async () => {
			for (const item of deviceTransports(method)) {
				const reader = (await driver.discoverReaders!(item.transport)).find(
					(r) => r.id === remembered
				);
				if (!active) return;
				if (reader) {
					if (
						driver.status$.get().connection === 'connected' &&
						driver.status$.get().reader?.id === reader.id
					)
						pickTransport(reader.transport);
					else await connect(reader, () => active);
					return;
				}
			}
		})()
			.catch((error) => {
				if (active) setError(error instanceof Error ? error.message : String(error));
			})
			.finally(() => {
				if (active && reconnect.current === operation) {
					reconnect.current = null;
					setWorking(false);
				}
			});
		return () => {
			active = false;
			if (reconnect.current === operation) {
				operation.cancelled = true;
				attempted.current = false;
			}
		};
	}, [remembered, driver, method, disabled, connect, pickTransport]);
	let line = t('pos_checkout.reader_disconnected');
	if (status.pairingCode) line = t('pos_checkout.reader_pairing', { code: status.pairingCode });
	else if (status.connection === 'connected')
		line = [
			t('pos_checkout.reader_connected'),
			status.reader?.label ?? status.reader?.model,
			status.reader?.battery == null ? null : `${status.reader.battery}%`,
		]
			.filter(Boolean)
			.join(' · ');
	else if (status.connection === 'updating')
		line = t('pos_checkout.reader_updating', {
			progress: status.progress == null ? '' : `${Math.round(status.progress * 100)}%`,
		});
	else if (status.connection === 'connecting') line = t('pos_checkout.reader_connecting');
	else if (status.connection === 'discovering') line = t('pos_checkout.reader_discovering');
	return (
		<VStack space="xs">
			<HStack className="items-center gap-2">
				<Text testID="checkout-reader-status" className="text-muted-foreground text-sm">
					{line}
				</Text>
				<Button
					testID="checkout-reader-connect"
					size="sm"
					variant="secondary"
					disabled={disabled || working}
					onPress={() =>
						void run(async () => {
							if (driver?.capabilities.discovery === 'sdk_ui') await driver.openReaderSettings?.();
							else if (driver?.discoverReaders && transport)
								setReaders(await driver.discoverReaders(transport));
						})
					}
				>
					<ButtonText>
						{status.connection === 'connected'
							? t('pos_checkout.change_reader')
							: t('pos_checkout.connect_reader')}
					</ButtonText>
				</Button>
			</HStack>
			{status.message ? (
				<Text className="text-muted-foreground text-xs">{status.message}</Text>
			) : null}
			{error ? <Text className="text-destructive text-sm">{error}</Text> : null}
			{transports.length > 1 ? (
				<HStack className="flex-wrap gap-2">
					{transports.map((item) => (
						<Button
							key={item.transport}
							size="sm"
							testID={`checkout-transport-${item.transport}`}
							variant={transport === item.transport ? 'default' : 'secondary'}
							disabled={disabled || working}
							onPress={() => {
								attempted.current = true;
								setReaders(null);
								pickTransport(item.transport);
							}}
						>
							<ButtonText>{t(`pos_checkout.transport_${item.transport}`)}</ButtonText>
						</Button>
					))}
				</HStack>
			) : null}
			{readers ? (
				<VStack testID="checkout-reader-list" space="xs">
					{readers.map((reader) => (
						<Button
							key={reader.id}
							testID={`checkout-reader-option-${reader.id}`}
							variant="secondary"
							disabled={disabled || working}
							onPress={() => void run(() => connect(reader))}
						>
							<ButtonText>{reader.label}</ButtonText>
						</Button>
					))}
					{readers.length === 0 ? <Text>{t('pos_checkout.no_readers_found')}</Text> : null}
				</VStack>
			) : null}
		</VStack>
	);
}
