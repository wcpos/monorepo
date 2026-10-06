import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import type { PaymentMethodDescriptor, PaymentTransport } from '@wcpos/order-math';

import { useT } from '../../../../../contexts/translations';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { deviceTransports } from './tiles';
import { useDriverStatus } from './use-driver-status';

import type { ReaderInfo } from '../../../../../services/payment-drivers/types';
import type { RememberedReader } from './remembered-readers';

export const CARD_READERS_SETTINGS_HREF = '/settings/card-readers';

/**
 * The pay sheet's one line about the reader. Scanning, software updates, errors, Disconnect and
 * Forget live on Settings → Card readers (wcpos/roadmap#407); here the cashier only sees which
 * reader is connected, or a link to go and connect one. The remembered reader still reconnects
 * when the method's keypad opens, so the usual sale needs no trip to Settings.
 */
export function ReaderConnection({
	method,
	bootstrap,
	remembered,
	remember,
	pickTransport,
	online,
	disabled,
}: {
	method: PaymentMethodDescriptor;
	remembered: string | null;
	remember: (reader: RememberedReader) => Promise<void>;
	bootstrap: (transport: PaymentTransport) => Promise<Record<string, unknown> | null>;
	transport: PaymentTransport | null;
	pickTransport: (transport: PaymentTransport) => void;
	online: boolean;
	disabled: boolean;
}) {
	const t = useT();
	const router = useRouter();
	const driver = getDriver(method.capture.provider);
	const status = useDriverStatus(driver);
	const [failed, setFailed] = React.useState(false);
	const [working, setWorking] = React.useState(false);
	const attempted = React.useRef(false);
	const reconnect = React.useRef<{ cancelled: boolean } | null>(null);
	const connect = React.useCallback(
		async (reader: ReaderInfo, active: () => boolean = () => true) => {
			if (!driver?.connect) return;
			const handoff = online ? await bootstrap(reader.transport) : null;
			if (!active()) return;
			await driver.connect(reader, handoff ? { ...handoff, method_id: method.id } : null);
			if (!active()) return;
			pickTransport(reader.transport);
			await remember(reader);
		},
		[driver, online, bootstrap, pickTransport, remember, method.id]
	);
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
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, react-you-might-not-need-an-effect/no-external-store-subscription -- A fresh attempt clears the last attempt's verdict.
		setFailed(false);
		void (async () => {
			for (const item of deviceTransports(method)) {
				const reader = (await driver.discoverReaders!(item.transport, { until: remembered })).find(
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
			.catch(() => {
				// The reason is on the settings page's row; the sheet only says it did not happen.
				if (active) setFailed(true);
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
	const connected = status.connection === 'connected' && !working;
	let line: string;
	if (connected)
		line = [
			status.reader?.label ?? status.reader?.model ?? t('pos_checkout.reader_connected'),
			status.reader?.battery == null
				? null
				: t('pos_checkout.reader_battery_percent', { battery: status.reader.battery }),
		]
			.filter(Boolean)
			.join(' · ');
	else if (status.connection === 'updating')
		line = t('pos_checkout.reader_updating', {
			progress: status.progress == null ? '' : `${Math.round(status.progress * 100)}%`,
		});
	else if (working || status.connection === 'connecting' || status.connection === 'discovering')
		line = t('pos_checkout.reader_connecting');
	else if (failed) line = t('pos_checkout.reader_reconnect_failed');
	else line = t('pos_checkout.reader_disconnected');
	return (
		<HStack className="flex-wrap items-center justify-center gap-x-2 gap-y-1">
			<Text
				testID="checkout-reader-status"
				className={connected ? 'text-foreground text-sm' : 'text-muted-foreground text-sm'}
			>
				{line}
			</Text>
			{!connected && !working && status.connection === 'disconnected' ? (
				<Button
					testID="checkout-reader-settings-link"
					variant="link"
					disabled={disabled}
					onPress={() => router.push(CARD_READERS_SETTINGS_HREF)}
				>
					<ButtonText>{t('pos_checkout.connect_in_card_readers')}</ButtonText>
				</Button>
			) : null}
		</HStack>
	);
}
