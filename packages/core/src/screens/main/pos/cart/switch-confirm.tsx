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

import { DrawerTile, SalesTile } from './user-sheet';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import {
	type Register,
	useRegisterDirectory,
} from '../../../../services/register/use-register-binding';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useAwaitingStoreCount } from '../checkout/use-awaiting-store';
import { useOpenOrdersOptional } from '../contexts/current-order/context';

export type SwitchRequest =
	| { kind: 'cashier'; credential: ReadonlyWpCredentialsRecord }
	| { kind: 'store'; store: ReadonlyStoreRecord }
	| { kind: 'register'; register: Register; state: string }
	| { kind: 'sign-out' };

export function SwitchConfirm({
	request,
	portalHost,
	onOpenChange,
	onConfirm,
	onSignOutAnyway,
}: {
	request: SwitchRequest | null;
	portalHost?: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: (request: SwitchRequest) => void;
	onSignOutAnyway: () => void;
}) {
	const t = useT();
	const { wpCredentials, store } = useStoreSession();
	const { session, expected, blind, figuresPending, salesCount, binding } = useRegisterSession();
	const y = useRegisterDirectory(request?.kind === 'store' ? request.store.id : store.id);
	const carts = useOpenOrdersOptional().length;
	const unsent = useAwaitingStoreCount();
	const lastAccess = useDocField(wpCredentials, (v) => v.last_access);
	const signedIn = lastAccess ? new Date(lastAccess) : null;
	const { timezone } = useStoreDay();
	const time = (date: Date) => formatDate(date, 'HH:mm', zoneOptions(timezone));
	const { format } = useCurrencyFormat();
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
			title = t('register.switch_to_question', { name });
			description =
				t('register.store_switch_reloads', { name }) +
				' ' +
				(target
					? target.session
						? t('register.store_register_open_since', {
								time: time(convertUTCStringToLocalDate(target.session.opened_at_gmt)),
							})
						: t('register.store_register_closed')
					: t('register.store_register_choose'));
			if (session)
				description += ' ' + t('register.drawer_stays_here', { register: binding.registerName });
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
					description={
						request.register.session ? t('register.you_join_it') : t('register.you_open_with_float')
					}
				/>
			);
			confirm = t('register.switch_to', { name });
			break;
		}
		case 'sign-out':
			title =
				blind || figuresPending
					? t('register.still_open_close_first_blind', { name: binding.registerName })
					: t('register.still_open_close_first', {
							name: binding.registerName,
							amount: format(Number(expected.cash ?? 0)),
						});
			description = t('register.open_till_stays_open');
			if (figuresPending) description += ' ' + t('register.figures_after_sync');
			confirm = t('register.close_register');
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
					cancel={{ testID: 'switch-confirm-cancel' }}
					confirm={{
						label: confirm,
						testID: 'switch-confirm-confirm',
						disabled: request.kind === 'sign-out' && figuresPending,
						onPress: () => {
							onConfirm(request);
							onOpenChange(false);
						},
					}}
					secondary={
						request.kind === 'sign-out'
							? {
									label: t('register.sign_out_anyway'),
									testID: 'switch-confirm-secondary',
									onPress: () => {
										onSignOutAnyway();
										onOpenChange(false);
									},
								}
							: undefined
					}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
