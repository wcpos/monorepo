import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { DeviceRow, DeviceRowActions } from '@wcpos/components/device-row';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import type { PrinterProfile } from '@wcpos/printer';
import { usesSystemPrintDialog } from '@wcpos/printer/transport/device-key';

import { printerIconName } from './utils';
import { useCopySetupReport } from '../printer/copy-setup-report';
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
	if (usesSystemPrintDialog(profile)) {
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
		// A 'system' profile that is not the Print Dialog is a Windows installed queue; its address is
		// the queue key, not something a cashier recognises.
		const base =
			profile.connectionType === 'system'
				? t('settings.setup_source_system')
				: profile.port
					? `${host}:${profile.port}`
					: host;
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
	const copyReport = useCopySetupReport();
	const canDelete = !profile.isBuiltIn;
	const showMenu = true; // the setup report is always offered

	return (
		<DeviceRow
			testID={`printer-row-${profile.id}`}
			icon={printerIconName(profile)}
			name={profile.name}
			tag={profile.isDefault ? t('common.default') : undefined}
			identifiers={[connectionLabel]}
		>
			<DeviceRowActions>
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
						leftIcon="edit"
						onPress={() => onEdit(profile)}
						testID={`printer-row-${profile.id}-edit`}
					>
						<Text>{t('common.edit')}</Text>
					</Button>
				)}
				{showMenu && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton
								name="more"
								accessibilityLabel={t('common.more_actions')}
								testID={`printer-row-${profile.id}-menu`}
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onPress={() =>
									void copyReport({
										printer: {
											name: profile.name,
											vendor: profile.vendor,
											model: profile.printerModel,
											connectionType: profile.connectionType,
											address: profile.address,
											port: profile.port,
											columns: profile.columns,
											language: profile.language,
										},
									})
								}
								testID={`printer-row-${profile.id}-copy-report`}
							>
								<Icon name="info" />
								<Text>{t('settings.setup_copy_report')}</Text>
							</DropdownMenuItem>
							{canSetDefault && (
								<DropdownMenuItem
									onPress={() => onSetDefault(profile.id)}
									testID={`printer-row-${profile.id}-set-default`}
								>
									<Icon name="featured" />
									<Text>{t('settings.set_default')}</Text>
								</DropdownMenuItem>
							)}
							{canDelete && (
								// The red row is last and set apart from the actions above it.
								<DropdownMenuSeparator />
							)}
							{canDelete && (
								<DropdownMenuItem
									variant="destructive"
									onPress={() => onDelete(profile.id)}
									testID={`printer-row-${profile.id}-delete`}
								>
									<Icon
										name="delete"
										className="fill-destructive web:group-focus:fill-accent-foreground"
									/>
									<Text>{t('common.delete')}</Text>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</DeviceRowActions>
		</DeviceRow>
	);
}
