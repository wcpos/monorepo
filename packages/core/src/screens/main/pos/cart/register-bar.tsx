import * as React from 'react';
import { View } from 'react-native';

import { useIsFocused } from 'expo-router/react-navigation';

import { StatusBadge } from '@wcpos/components/status-badge';
import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import {
	consumeRegisterPanelRequest,
	requestRegisterPanel,
	useRegisterPanelPane,
	useRegisterPanelRequested,
} from './register-panel-request';
import { RegisterPanel } from './register-panel';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { BarControls, useBarMenu, useOnlineBadge } from '../../components/bar-controls';
import { useAwaitingStoreCount } from '../checkout/use-awaiting-store';
import { describeRegisterBar } from './register-bar.helpers';
import { requestCashierSheet } from '../../components/cashier-entry/cashier-sheet-request';

export function RegisterBar({
	panelOpen,
	onPanelOpenChange,
	strip = false,
}: {
	panelOpen: boolean;
	onPanelOpenChange: (open: boolean) => void;
	/** The desktop's title-bar strip: 40 pt, no frame of its own (the strip is the frame). */
	strip?: boolean;
}) {
	const focused = useIsFocused();
	const panelRequested = useRegisterPanelRequested();
	const initialPane = useRegisterPanelPane();
	React.useEffect(() => {
		if (focused && panelRequested && consumeRegisterPanelRequest()) onPanelOpenChange(true);
	}, [focused, panelRequested, onPanelOpenChange]);

	const { session, sessionsOn, overdue, lastClosure } = useRegisterSession();
	const { wpCredentials, store } = useStoreSession();
	const menu = useBarMenu();
	const t = useT();
	const binding = useRegisterBinding();
	const storeName = useDocField(store, (value) => value.name) as string;
	const stores = useDocField(wpCredentials, (value) => value.stores) as string[];
	// The store being unreachable reads as offline to a cashier: one pill, one place.
	const online = useOnlineBadge() === undefined;
	const awaitingStore = useAwaitingStoreCount();
	const { place, pill } = describeRegisterBar({
		registerName: binding.registerName,
		registerCount: binding.registers.length,
		storeName,
		// While Try again runs the directory reads `unknown`; the pill keeps the state being retried.
		bindingStatus: binding.retrying === 'none' ? 'none' : binding.status,
		// Only an unbound till reads Offline for a failed directory read (the gate's twin); a bound
		// till keeps its session pills, or one 5xx at boot would hide Overdue all day.
		directoryFailed:
			(binding.status === 'unknown' && binding.failed) || binding.retrying === 'failed',
		online,
		sessionsOn,
		sessionStatus: session?.status,
		approvalRequired: session?.approval_required,
		overdue,
		awaitingStore,
	});
	const pillLabels: Record<NonNullable<typeof pill>, string> = {
		'register.choose_register': t('register.choose_register', { count: awaitingStore }),
		'register.no_register': t('register.no_register', { count: awaitingStore }),
		'register.offline_to_send': t('register.offline_to_send', { count: awaitingStore }),
		'register.offline': t('register.offline', { count: awaitingStore }),
		'register.counting': t('register.counting', { count: awaitingStore }),
		'register.approval_needed': t('register.approval_needed', { count: awaitingStore }),
		'register.overdue': t('register.overdue', { count: awaitingStore }),
		'register.closed': t('register.closed', { count: awaitingStore }),
		'register.awaiting_store': t('register.awaiting_store', { count: awaitingStore }),
	};
	// The sheets live beside the bar, not in it: a closed Dialog still mounts an empty root,
	// and inside the bar's gap row that root was an invisible 8 pt cell pushing the bell and
	// the drawer icon out of line with the row below (Paul, 2026-10-09).
	return (
		<>
			<HStack
				testID={strip ? 'register-bar-strip' : undefined}
				className={strip ? 'flex-1 gap-2 px-2' : 'border-border h-12 gap-2 border-b px-2'}
			>
				{menu && (
					<IconButton
						name="menu"
						testID="pos-drawer-open-button"
						accessibilityLabel={menu.label}
						onPress={menu.onPress}
					/>
				)}
				<View className="min-w-0 shrink">
					{stores?.length > 1 ? (
						<Button
							testID="register-bar-store"
							variant="ghost"
							className="min-w-11 shrink items-start px-0"
							onPress={requestCashierSheet}
						>
							{/* The bar's title, not a quiet action: it keeps the foreground over the ghost's muted label. */}
							<Text
								testID="register-bar-place"
								className="text-foreground text-base font-semibold"
								numberOfLines={1}
							>
								{place}
							</Text>
						</Button>
					) : (
						<Text testID="register-bar-place" className="text-base font-semibold" numberOfLines={1}>
							{place}
						</Text>
					)}
				</View>
				{pill && (
					<StatusBadge testID="register-bar-pill" label={pillLabels[pill]} variant="warning" />
				)}
				<View className="flex-1" />
				{(session || lastClosure) && (
					<IconButton
						name="register"
						accessibilityLabel={t('common.register')}
						testID="register-bar-drawer"
						iconClassName={overdue ? 'text-warning' : undefined}
						onPress={() => requestRegisterPanel()}
					/>
				)}
				{/* The rail carries the avatar only on `lg`; the phone needs the bar's. */}
				<BarControls
					testID="register-bar"
					portalHost="pos"
					onOpenRegister={() => onPanelOpenChange(true)}
				/>
			</HStack>
			{/* Always mounted: on web the shell can only play the panel's exit while the caller keeps
			    rendering the closed Dialog (OVERLAY_EXIT_MOUNTED); a conditional mount tore it down in
			    the same commit, so the panel vanished where every other sheet slides. */}
			<RegisterPanel open={panelOpen} initialPane={initialPane} onOpenChange={onPanelOpenChange} />
		</>
	);
}
