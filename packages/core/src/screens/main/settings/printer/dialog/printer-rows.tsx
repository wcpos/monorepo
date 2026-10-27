import * as React from 'react';
import { View } from 'react-native';

import { type ControllerRenderProps, useFormContext, useWatch } from 'react-hook-form';

import {
	FormField,
	FormItem,
	FormSelect,
	FormSwitch,
	SavedMark,
	useSavedName,
} from '@wcpos/components/form';
import { PropertyRow } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';

import { DrawerEmulationWarning } from './drawer-emulation-warning';
import { CodePageSelect } from '../components/code-page-select';
import { DrawerConnectorSelect } from '../components/drawer-connector-select';
import { LanguageSelect } from '../components/language-select';
import { PaperWidthSelect } from '../components/paper-width-select';
import { VendorSelect } from '../components/vendor-select';
import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues, VendorOption } from '../schema';

/**
 * One printer setting (property rows): its control in the value slot, named by the row's key.
 * A switch sits in the trailing slot (`control`) beside its Saved mark; a verb hides while the
 * mark shows. `mark` lists every field the row holds (Address · port is two).
 */
export function PrinterRow(props: {
	id: string;
	label: string;
	mark?: string | string[];
	verb?: React.ReactNode;
	control?: React.ReactNode;
	indent?: boolean;
	children?: React.ReactNode;
}) {
	const { id, control } = props;
	const t = useT();
	const saved = useSavedName();
	const marked = !!saved && [props.mark ?? []].flat().includes(saved);
	return (
		<PropertyRow
			testID={`printer-row-${id}`}
			label={props.label}
			indent={props.indent}
			nativeID={`printer-${id}-form-item`}
			trailing={
				marked || props.verb || control ? (
					<>
						{marked ? <SavedMark name={saved} label={t('settings.saved')} /> : props.verb}
						{control ? <FormItem nativeID={`printer-${id}`}>{control}</FormItem> : null}
					</>
				) : null
			}
		>
			<FormItem nativeID={control ? undefined : `printer-${id}`}>{props.children}</FormItem>
		</PropertyRow>
	);
}

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
		<PrinterRow
			id={props.name}
			label={props.label}
			mark={props.name}
			control={<FormField control={control} name={props.name} render={render} />}
		>
			{props.children}
		</PrinterRow>
	);
}

function SelectRow(props: {
	name: 'vendor' | 'language' | 'columns' | 'codePage' | 'drawerConnector';
	label: string;
	/** The select, as `FormSelect`'s own `customComponent` is typed; it types the rest of the props. */
	select: React.ComponentProps<typeof FormSelect>['customComponent'];
	/** The vendor list; `FormSelect` hands extra props to its custom component, as the wizard does. */
	options?: VendorOption[];
	indent?: boolean;
	/** Columns is a number in the form and a string in the select. */
	numeric?: boolean;
	onManualChange?: () => void;
}) {
	const { name, numeric } = props;
	const { control } = useFormContext<PrinterFormValues>();
	return (
		<PrinterRow id={name} label={props.label} mark={name} indent={props.indent}>
			<FormField
				control={control}
				name={name}
				render={({ field: { value, onChange, ...rest } }) => (
					<FormSelect
						customComponent={props.select}
						// Only the vendor row supplies a list: an `options: undefined` would overwrite the
						// built-in list the other selects spread after their own (Codex, #2978).
						{...(props.options ? { options: props.options } : {})}
						value={value != null ? String(value) : undefined}
						onChange={(next: string) => {
							props.onManualChange?.();
							onChange(numeric ? Number(next) : next);
						}}
						{...rest}
					/>
				)}
			/>
		</PrinterRow>
	);
}

/**
 * Auto-cut, auto-open drawer and default: the setup wizard's options and the Edit Printer form.
 * `connector` nests the drawer's connector under its switch while the switch is on (rule 8).
 */
export function PrinterToggleRows({ connector }: { connector?: boolean }) {
	const t = useT();
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
						select={DrawerConnectorSelect}
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
}) {
	const { vendorOptions } = props;
	const t = useT();
	const [vendor, language] = useWatch<PrinterFormValues, ['vendor', 'language']>({
		name: ['vendor', 'language'],
	});
	return (
		<>
			{vendorOptions ? (
				<SelectRow
					name="vendor"
					label={t('settings.printer_vendor')}
					select={VendorSelect}
					options={vendorOptions}
					onManualChange={props.onVendorManualChange}
				/>
			) : null}
			<SelectRow name="language" label={t('settings.printer_language')} select={LanguageSelect} />
			<SelectRow
				name="columns"
				label={t('settings.setup_paper_label')}
				select={PaperWidthSelect}
				numeric
			/>
			{language === 'esc-pos' ? (
				<SelectRow
					name="codePage"
					label={t('settings.printer_code_page')}
					select={CodePageSelect}
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
				<Text className="text-muted-foreground text-xs">
					{t('settings.print_receipts_as_image_help')}
				</Text>
			</SwitchRow>
		</>
	);
}
