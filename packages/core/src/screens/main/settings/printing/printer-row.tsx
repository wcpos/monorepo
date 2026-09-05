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
	isTesting,
	onTest,
	onEdit,
	onSetDefault,
	onDelete,
}: PrinterRowProps) {
	const t = useT();

	let connectionLabel: string;
	if (profile.connectionType === 'system') {
		connectionLabel = `${t('settings.connection_print_dialog')} · ${t(
			'settings.connection_built_in'
		)}`;
	} else if (profile.connectionType === 'cloud') {
		const provider =
			profile.cloudProvider === 'star-cloudprnt'
				? 'Star CloudPRNT'
				: profile.cloudProvider === 'epson-sdp'
					? 'Epson Server Direct Print'
					: profile.cloudProvider === 'printnode'
						? 'PrintNode'
						: t('settings.cloud_printer');
		connectionLabel = `${provider} · ${t('settings.managed_by_wcpos')}`;
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

	// Built-in/server-owned targets are not backed by mutable printer_profiles documents.
	const canSetDefault = !profile.isDefault && !profile.isBuiltIn;
	const canDelete = !profile.isBuiltIn;
	const showMenu = canSetDefault || canDelete;

	return (
		<View
			testID={`printer-row-${profile.id}`}
			className="web:hover:bg-accent flex-row flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-2.5"
		>
			<View className="bg-muted rounded-md p-2">
				<Icon name={printerIconName(profile)} variant="muted" size="lg" />
			</View>
			<VStack className="min-w-40 flex-1 gap-0.5">
				<Text className="text-sm font-medium" numberOfLines={1}>
					{profile.name}
				</Text>
				<Text className="text-muted-foreground text-xs" numberOfLines={1}>
					{connectionLabel}
				</Text>
			</VStack>
			<HStack className="ml-auto flex-wrap items-center gap-2">
				{profile.isDefault && <StatusBadge variant="default" label={t('common.default')} />}
				<Button
					variant="outline"
					size="sm"
					loading={isTesting}
					onPress={() => onTest(profile)}
					testID={`printer-row-${profile.id}-test`}
				>
					<Text>{t('settings.test_print')}</Text>
				</Button>
				{!profile.isBuiltIn && (
					<Button
						variant="outline"
						size="sm"
						leftIcon="penToSquare"
						onPress={() => onEdit(profile)}
						testID={`printer-row-${profile.id}-edit`}
					>
						<Text>{t('common.edit')}</Text>
					</Button>
				)}
				{showMenu && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton name="ellipsisVertical" testID={`printer-row-${profile.id}-menu`} />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{canSetDefault && (
								<DropdownMenuItem
									onPress={() => onSetDefault(profile.id)}
									testID={`printer-row-${profile.id}-set-default`}
								>
									<Icon name="star" />
									<Text>{t('settings.set_default')}</Text>
								</DropdownMenuItem>
							)}
							{canDelete && (
								<DropdownMenuItem
									variant="destructive"
									onPress={() => onDelete(profile.id)}
									testID={`printer-row-${profile.id}-delete`}
								>
									<Icon
										name="trash"
										className="fill-destructive web:group-focus:fill-accent-foreground"
									/>
									<Text>{t('common.delete')}</Text>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</HStack>
		</View>
	);
}
