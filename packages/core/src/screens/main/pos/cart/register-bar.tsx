import * as React from 'react';
import { View } from 'react-native';

import { StatusBadge } from '@wcpos/components/status-badge';
import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import { RegisterPanel } from './register-panel';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { BarControls, useBarMenu, useOnlineBadge } from '../../components/bar-controls';
import { useAwaitingStoreCount } from '../checkout/use-awaiting-store';
import { describeRegisterBar } from './register-bar.helpers';
import { SwitchStoreSheet } from './switch-store-sheet';

export function RegisterBar({
	onSwitchRegister,
	panelOpen,
	onPanelOpenChange,
	strip = false,
}: {
	onSwitchRegister?: () => void;
	panelOpen: boolean;
	onPanelOpenChange: (open: boolean) => void;
	/** The desktop's title-bar strip: 40 pt, no frame of its own (the strip is the frame). */
	strip?: boolean;
}) {
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
	const [storeOpen, setStoreOpen] = React.useState(false);
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
							onPress={() => setStoreOpen(true)}
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
					<StatusBadge
						testID="register-bar-pill"
						label={t(pill, { count: awaitingStore })}
						variant="warning"
					/>
				)}
				<View className="flex-1" />
				{(session || lastClosure) && (
					<IconButton
						name="register"
						accessibilityLabel={t('common.register')}
						testID="register-bar-drawer"
						iconClassName={overdue ? 'text-warning' : undefined}
						onPress={() => onPanelOpenChange(true)}
					/>
				)}
				{/* The rail carries the avatar only on `lg`; the phone needs the bar's. */}
				<BarControls testID="register-bar" portalHost="pos" onSwitchRegister={onSwitchRegister} />
			</HStack>
			{panelOpen && <RegisterPanel open={panelOpen} onOpenChange={onPanelOpenChange} />}
			<SwitchStoreSheet open={storeOpen} onOpenChange={setStoreOpen} />
		</>
	);
}
