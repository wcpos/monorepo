import * as React from 'react';
import { View } from 'react-native';

import { type ControllerRenderProps, useFormContext, useWatch } from 'react-hook-form';

import { FormField, FormSelect, FormSwitch } from '@wcpos/components/form';
import { PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';

import { DrawerEmulationWarning } from './drawer-emulation-warning';
import { useT } from '../../../../../contexts/translations';
import { usePrinterOptions } from '../options';

import type { PrinterFormValues, VendorOption } from '../schema';

type SwitchName = 'autoCut' | 'autoOpenDrawer' | 'isDefault' | 'fullReceiptRaster';

/** A switch row: the switch has no label of its own, the row's key is its label. */
function SwitchRow(props: {
	name: SwitchName;
	label: string;
	testID: string;
	children?: React.ReactNode;
}) {
	const { control } = useFormContext<PrinterFormValues>();
	const render = ({ field }: { field: ControllerRenderProps<PrinterFormValues, SwitchName> }) => (
		<FormSwitch testID={props.testID} {...field} />
	);
	return (
		<PropertyRow
			prefix="printer"
			id={props.name}
			label={props.label}
			control={<FormField control={control} name={props.name} render={render} />}
		>
			{props.children}
		</PropertyRow>
	);
}

type SelectRowProps = {
	name: 'vendor' | 'language' | 'columns' | 'codePage' | 'drawerConnector';
	label: string;
	options: { value: string; label: string }[];
	placeholder: string;
	indent?: boolean;
	/** Columns is a number in the form and a string in the select. */
	numeric?: boolean;
	onManualChange?: () => void;
};

function SelectRow(props: SelectRowProps) {
	const { name, numeric } = props;
	const { control } = useFormContext<PrinterFormValues>();
	return (
		<PropertyRow prefix="printer" id={name} label={props.label} indent={props.indent}>
			<FormField
				control={control}
				name={name}
				render={({ field: { value, onChange, ...rest } }) => (
					<FormSelect
						options={props.options}
						placeholder={props.placeholder}
						value={value != null ? String(value) : undefined}
						onChange={(next: string) => {
							props.onManualChange?.();
							onChange(numeric ? Number(next) : next);
						}}
						{...rest}
					/>
				)}
			/>
		</PropertyRow>
	);
}

/** What this session's probe wrote into the form (null where it wrote nothing); `id` is per scan. */
export type PrinterDetection = {
	language: PrinterFormValues['language'] | null;
	columns: number | null;
	id: number;
};

/**
 * A select the scan filled in (rule 5, a copy is derived): while the form still holds the detected
 * value the row reads the value and "detected", and Change breaks the link for the dialog's life.
 * Only a new detection (a new `detectionId`) links it again; a value that moved off the detected one,
 * even back onto it, is the plain select.
 */
function DetectedSelectRow(
	props: SelectRowProps & { detected: string | number | null; detectionId: number }
) {
	const { detected, detectionId } = props;
	const t = useT();
	const value = useWatch<PrinterFormValues>({ name: props.name });
	const [changing, setChanging] = React.useState(false);
	const [prevId, setPrevId] = React.useState(detectionId);
	const [prevValue, setPrevValue] = React.useState(value);
	if (detectionId !== prevId) {
		setPrevId(detectionId);
		setChanging(false);
	} else if (!changing && detected != null && prevValue === detected && value !== detected) {
		// A linked row whose value moved (Change, or the vendor's derivation) is unlinked for good:
		// picking the detected value again is a choice, not a detection.
		setChanging(true);
	}
	if (value !== prevValue) setPrevValue(value);
	if (detected == null || value !== detected || changing) return <SelectRow {...props} />;
	const label = props.options.find((option) => option.value === String(value))?.label;
	return (
		<PropertyRow
			prefix="printer"
			id={props.name}
			label={props.label}
			derived
			verb={
				<PropertyVerb testID={`printer-${props.name}-change`} onPress={() => setChanging(true)}>
					{t('common.change')}
				</PropertyVerb>
			}
		>
			<View className="flex-row flex-wrap items-center gap-x-2">
				<Text>{label ?? String(value)}</Text>
				<Text variant="help">{t('settings.detected')}</Text>
			</View>
		</PropertyRow>
	);
}

/**
 * Auto-cut, auto-open drawer and default: the setup wizard's options and the Edit Printer form.
 * `connector` nests the drawer's connector under its switch while the switch is on (rule 8).
 */
export function PrinterToggleRows({ connector }: { connector?: boolean }) {
	const t = useT();
	const { drawerConnectors } = usePrinterOptions();
	const autoOpenDrawer = useWatch<PrinterFormValues, 'autoOpenDrawer'>({ name: 'autoOpenDrawer' });
	return (
		<>
			<SwitchRow
				name="autoCut"
				label={t('settings.auto_cut_paper')}
				testID="add-printer-autocut-toggle"
			/>
			<SwitchRow
				name="autoOpenDrawer"
				label={t('settings.auto_open_cash_drawer')}
				testID="add-printer-autodrawer-toggle"
			/>
			{connector && autoOpenDrawer ? (
				<View testID="add-printer-drawer-connector-field">
					<SelectRow
						name="drawerConnector"
						label={t('settings.drawer_connector')}
						options={drawerConnectors}
						placeholder={t('settings.select_drawer_connector')}
						indent
					/>
				</View>
			) : null}
			<SwitchRow
				name="isDefault"
				label={t('settings.set_as_default_printer')}
				testID="add-printer-default-toggle"
			/>
		</>
	);
}

/**
 * The Edit Printer rows after Connection, in the board's order. `vendorOptions` is the native
 * and Electron vendor choice; the web chooses its vendor in the network lane instead.
 */
export function PrinterSettingsRows(props: {
	vendorOptions?: VendorOption[];
	onVendorManualChange?: () => void;
	detected?: PrinterDetection;
}) {
	const { vendorOptions } = props;
	const t = useT();
	const options = usePrinterOptions();
	const [vendor, language] = useWatch<PrinterFormValues, ['vendor', 'language']>({
		name: ['vendor', 'language'],
	});
	return (
		<>
			{vendorOptions ? (
				<SelectRow
					name="vendor"
					label={t('settings.printer_vendor')}
					options={vendorOptions}
					placeholder={t('settings.select_vendor')}
					onManualChange={props.onVendorManualChange}
				/>
			) : null}
			<DetectedSelectRow
				name="language"
				label={t('settings.printer_language')}
				options={options.languages}
				placeholder={t('settings.select_language')}
				detected={props.detected?.language ?? null}
				detectionId={props.detected?.id ?? 0}
			/>
			<DetectedSelectRow
				name="columns"
				label={t('settings.setup_paper_label')}
				options={options.columns}
				placeholder={t('settings.select_printer_text_width')}
				numeric
				detected={props.detected?.columns ?? null}
				detectionId={props.detected?.id ?? 0}
			/>
			{language === 'esc-pos' ? (
				<SelectRow
					name="codePage"
					label={t('settings.printer_code_page')}
					options={options.codePages}
					placeholder={t('settings.printer_code_page')}
				/>
			) : null}
			<DrawerEmulationWarning vendor={vendor} language={language} />
			<PrinterToggleRows connector />
			{/* Troubleshooting stays findable: last, never folded, with its one help line (rule 9). */}
			<SwitchRow
				name="fullReceiptRaster"
				label={t('settings.print_receipts_as_image')}
				testID="add-printer-raster-toggle"
			>
				<Text variant="help">{t('settings.print_receipts_as_image_help')}</Text>
			</SwitchRow>
		</>
	);
}
