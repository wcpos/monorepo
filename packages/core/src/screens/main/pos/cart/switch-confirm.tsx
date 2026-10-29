import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns/format';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Notice } from '@wcpos/components/notice';
import { useDocField } from '@wcpos/query';
import type { ReadonlyStoreRecord, ReadonlyWpCredentialsRecord } from '@wcpos/query/user-db';

import { DrawerTile, SalesTile, useSalesToday } from './user-sheet';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { resolveDayTimezone, useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import {
	type Register,
	useRegisterDirectory,
} from '../../../../services/register/use-register-binding';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useAwaitingStoreCount } from '../checkout/use-awaiting-store';
import { useOpenOrdersHandle } from '../contexts/current-order/use-open-orders-handle';

export type SwitchRequest =
	| { kind: 'cashier'; credential: ReadonlyWpCredentialsRecord }
	| { kind: 'store'; store: ReadonlyStoreRecord }
	// `state` is the band's description line and `open` the same resolved session (device cache
	// first, then the directory row), so the confirm's two lines never disagree (CodeRabbit, #3046).
	| { kind: 'register'; register: Register; state: string; open: boolean };

export function SwitchConfirm({
	request,
	portalHost,
	onOpenChange,
	onConfirm,
}: {
	request: SwitchRequest | null;
	portalHost?: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: (request: SwitchRequest) => void;
}) {
	const t = useT();
	const { wpCredentials, store, site } = useStoreSession();
	const { session, binding } = useRegisterSession();
	// The cashier's open carts from the same handle the POS layout owns (the rail's sheet renders
	// outside CurrentOrderProvider, so the context read would say none); never suspends.
	const openOrders = useOpenOrdersHandle(wpCredentials.id, store.id, binding.registerId);
	const carts = React.useSyncExternalStore(openOrders.subscribe, () => openOrders.value).count;
	// The hand-over count is the cashier's day (the same read as the amount), never the register's.
	const { count: salesCount } = useSalesToday();
	// The target store's rows are asked fresh on every opening: another till may have opened or
	// closed its register since the directory last answered (Codex, #3046).
	const y = useRegisterDirectory(request?.kind === 'store' ? request.store.id : store.id, {
		fresh: request?.kind === 'store',
	});
	const unsent = useAwaitingStoreCount();
	const lastAccess = useDocField(wpCredentials, (v) => v.last_access);
	const signedIn = lastAccess ? new Date(lastAccess) : null;
	const { timezone } = useStoreDay();
	// A target store's register opened in THAT store's day when the store names one; otherwise
	// this store's day, never the device's.
	const zone =
		request?.kind === 'store' && request.store.timezone
			? resolveDayTimezone(request.store, site).timezone
			: timezone;
	const time = (date: Date) => formatDate(date, 'HH:mm', zoneOptions(zone));
	if (!request) return null;
	let title: string, description: string, confirm: string;
	let body: React.ReactNode;
	switch (request.kind) {
		case 'cashier': {
			const name = request.credential.display_name;
			title = t('register.hand_till_to', { name });
			description = t('register.hand_over_reloads', { name });
			if (binding.status === 'bound' && session)
				description += ' ' + t('register.drawer_stays_open_on', { register: binding.registerName });
			body = (
				<>
					<View className="flex-row gap-2">
						<SalesTile
							sub={[
								t('register.sales_count', { count: salesCount }),
								signedIn &&
									!Number.isNaN(signedIn.getTime()) &&
									t('register.on_the_till_since', { time: time(signedIn) }),
							]
								.filter(Boolean)
								.join(' · ')}
						/>
						<DrawerTile label={t('register.drawer_stays_at')} />
					</View>
					{(carts > 0 || unsent > 0) && (
						<Notice
							tone="info"
							testID="switch-confirm-waits"
							title={t('register.waits_here_for_you')}
							description={[
								carts > 0 && t('register.open_carts_count', { count: carts }),
								unsent > 0 && t('register.unsent_sales_count', { count: unsent }),
							]
								.filter(Boolean)
								.join(' · ')}
						/>
					)}
				</>
			);
			confirm = t('register.hand_over_to', { name });
			break;
		}
		case 'store': {
			const name = request.store.name;
			const target =
				y.registers.find((r) => r.id === y.registerId) ??
				(y.registers.length === 1 ? y.registers[0] : undefined);
			// Until the target's directory has answered once, say nothing about its register: an
			// empty list is "not loaded yet", not "you'll choose one" (CodeRabbit, #3046).
			const known = y.loaded || y.registers.length > 0;
			title = t('register.switch_to_question', { name });
			description = [
				t('register.store_switch_reloads', { name }),
				known &&
					(target
						? target.session
							? t('register.store_register_open_since', {
									time: time(convertUTCStringToLocalDate(target.session.opened_at_gmt)),
								})
							: t('register.store_register_closed')
						: t('register.store_register_choose')),
				session && t('register.drawer_stays_here', { register: binding.registerName }),
			]
				.filter(Boolean)
				.join(' ');
			confirm = t('register.switch_to', { name });
			break;
		}
		case 'register': {
			const name = request.register.name;
			title = t('register.switch_to_question', { name });
			description = session
				? t('register.register_switch_moves_device', { name, current: binding.registerName })
				: t('register.register_switch_moves_device_short', { name });
			body = (
				<Notice
					tone="info"
					title={request.state}
					description={request.open ? t('register.you_join_it') : t('register.you_open_with_float')}
				/>
			);
			confirm = t('register.switch_to', { name });
			break;
		}
	}
	return (
		<AlertDialog open onOpenChange={onOpenChange}>
			<AlertDialogContent portalHost={portalHost} testID="switch-confirm">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{body && <View className="gap-4 px-4">{body}</View>}
				<AlertDialogFooter
					cancel={{ testID: 'switch-confirm-cancel', onPress: () => onOpenChange(false) }}
					confirm={{
						label: confirm,
						testID: 'switch-confirm-confirm',
						onPress: () => {
							onConfirm(request);
							onOpenChange(false);
						},
					}}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
