import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { PrinterProfile } from '@wcpos/printer';

import { printerIconName } from './utils';
import { useT } from '../../../../contexts/translations';

interface PrinterRowProps {
	profile: PrinterProfile;
	isFirst: boolean;
	/** True only when a test print for *this* profile is in progress. */
	isTesting: boolean;
	onTest: (profile: PrinterProfile) => void;
	onEdit: (profile: PrinterProfile) => void;
	onSetDefault: (id: string) => void;
	onDelete: (id: string) => void;
}

/**
 * One row of the Printers list. Presentational + local action wiring — all data
 * mutation handlers are passed in from the parent.
 */
export function PrinterRow({
	profile,
	isFirst,
	isTesting,
	onTest,
	onEdit,
	onSetDefault,
	onDelete,
}: PrinterRowProps) {
	const t = useT();

	let connectionLabel: string;
	if (profile.connectionType === 'system') {
		connectionLabel = `${t('settings.connection_system', 'System Dialog')} · ${t(
			'settings.connection_built_in',
			'built-in'
		)}`;
	} else {
		const host = profile.address || '?';
		const base = profile.port ? `${host}:${profile.port}` : host;
		if (profile.vendor === 'epson') {
			connectionLabel = `${base} · Epson`;
		} else if (profile.vendor === 'star') {
			connectionLabel = `${base} · Star`;
		} else {
			connectionLabel = base;
		}
	}

	// The ⋮ menu holds Set Default (when not default) and Delete (when not built-in).
	// If both are unavailable (the built-in default printer), omit the menu entirely.
	const showMenu = !profile.isDefault || !profile.isBuiltIn;

	return (
		<>
			{!isFirst && <View className="border-border border-t" />}
			<View testID={`printer-row-${profile.id}`} className="flex-row items-center gap-3 p-3">
				<View className="bg-muted rounded-md p-2">
					<Icon name={printerIconName(profile)} variant="muted" size="lg" />
				</View>
				<VStack className="flex-1 gap-0.5">
					<Text className="text-sm font-medium">{profile.name}</Text>
					<Text className="text-muted-foreground text-xs">{connectionLabel}</Text>
				</VStack>
				<HStack className="items-center gap-2">
					{profile.isDefault && (
						<StatusBadge variant="default" label={t('common.default', 'Default')} />
					)}
					<Button
						variant="outline"
						size="sm"
						loading={isTesting}
						onPress={() => onTest(profile)}
						testID={`printer-row-${profile.id}-test`}
					>
						<Text>{t('settings.test_print', 'Test')}</Text>
					</Button>
					{!profile.isBuiltIn && (
						<Button
							variant="outline"
							size="sm"
							leftIcon="penToSquare"
							onPress={() => onEdit(profile)}
							testID={`printer-row-${profile.id}-edit`}
						>
							<Text>{t('common.edit', 'Edit')}</Text>
						</Button>
					)}
					{showMenu && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<IconButton name="ellipsisVertical" testID={`printer-row-${profile.id}-menu`} />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{!profile.isDefault && (
									<DropdownMenuItem
										onPress={() => onSetDefault(profile.id)}
										testID={`printer-row-${profile.id}-set-default`}
									>
										<Icon name="star" />
										<Text>{t('settings.set_default', 'Set Default')}</Text>
									</DropdownMenuItem>
								)}
								{!profile.isBuiltIn && (
									<DropdownMenuItem
										variant="destructive"
										onPress={() => onDelete(profile.id)}
										testID={`printer-row-${profile.id}-delete`}
									>
										<Icon
											name="trash"
											className="fill-destructive web:group-focus:fill-accent-foreground"
										/>
										<Text>{t('common.delete', 'Delete')}</Text>
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</HStack>
			</View>
		</>
	);
}
