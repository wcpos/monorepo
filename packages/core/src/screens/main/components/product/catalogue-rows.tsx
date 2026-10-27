import * as React from 'react';

import { useFormContext, useWatch } from 'react-hook-form';

import {
	FormField,
	FormInput,
	FormItem,
	FormSelect,
	FormSwitch,
	SavedMark,
	useSavedName,
} from '@wcpos/components/form';
import {
	PropertyAdd,
	PropertyPlaceholder,
	PropertyRow,
	PropertyVerb,
} from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';

import { ProductStatusSelect } from './status-select';
import { useT } from '../../../../contexts/translations';
import { PARENT_TAX_CLASS } from '../../hooks/tax-class';
import { CurrencyInput } from '../currency-input';
import { META_DATA_DEFAULT_ROW } from '../meta-data-form';
import { CountInput } from '../count-input';
import { useTaxClassOptions } from '../tax-class-select';
import { TaxSelect } from '../tax-select';
import { useFieldPresence } from '../use-field-presence';

import type { FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * The product and variation edit modals as property rows (Paul, 2026-10-25): one module, so the
 * two forms read one way. Every row takes the form by context; ids carry the record's kind.
 */
export const CatalogueKind = React.createContext<'product' | 'variation'>('product');

/**
 * One catalogue fact: its control in the value slot, named by the row's key; a switch sits in
 * the trailing slot. The row's verb (or Remove) hides while one of its fields' Saved marks shows.
 */
export function CatalogueRow(props: {
	id: string;
	label: string;
	marks?: string[];
	align?: 'top';
	control?: React.ReactNode;
	verb?: React.ReactNode;
	onRemove?: () => void;
	children?: React.ReactNode;
}) {
	const { id, marks = [id], control, onRemove } = props;
	const t = useT();
	const kind = React.useContext(CatalogueKind);
	const marked = marks.includes(useSavedName());
	const verb = onRemove ? (
		<PropertyVerb testID={`${kind}-remove-${id}`} onPress={onRemove}>
			{t('common.remove')}
		</PropertyVerb>
	) : (
		props.verb
	);
	return (
		<PropertyRow
			testID={`${kind}-row-${id}`}
			label={props.label}
			align={props.align}
			nativeID={`${kind}-${id}-form-item`}
			trailing={
				<>
					{control && <FormItem nativeID={`${kind}-${id}`}>{control}</FormItem>}
					{!marked && verb}
					{marks.map((name) => (
						<SavedMark key={name} name={name} label={t('settings.saved')} />
					))}
				</>
			}
		>
			<FormItem nativeID={control ? undefined : `${kind}-${id}`}>{props.children}</FormItem>
		</PropertyRow>
	);
}

type InputRowProps = {
	name: 'name' | 'sku' | 'barcode' | 'regular_price' | 'sale_price';
	label: string;
	testID?: string;
	onRemove?: () => void;
};

/** A text fact. These modals keep inputs: the E2E fills `product-edit-name-input`. */
export function TextRow({ money, ...props }: InputRowProps & { money?: boolean }) {
	const { control } = useFormContext();
	return (
		<CatalogueRow id={props.name} label={props.label} onRemove={props.onRemove}>
			<FormField
				control={control}
				name={props.name}
				render={({ field }) => (
					<FormInput
						customComponent={money ? CurrencyInput : undefined}
						testID={props.testID}
						{...field}
					/>
				)}
			/>
		</CatalogueRow>
	);
}

export function PriceRow(props: Omit<InputRowProps, 'testID'>) {
	return <TextRow {...props} money />;
}

/**
 * Manage stock + Quantity as ONE fact (property rows rule 4). Untracked, the quantity is not a
 * control at all; Stop tracking leaves it as it is (Woo ignores it while unmanaged).
 */
export function StockRow() {
	const t = useT();
	const kind = React.useContext(CatalogueKind);
	const { control, setValue } = useFormContext();
	const managed = !!useWatch({ control, name: 'manage_stock' });
	const [focus, setFocus] = React.useState(false);
	const track = (on: boolean) => {
		setFocus(on);
		setValue('manage_stock', on, { shouldDirty: true });
	};
	return (
		<CatalogueRow
			id="stock"
			marks={['manage_stock', 'stock_quantity']}
			label={t('common.stock')}
			verb={
				<PropertyVerb testID={`${kind}-stock-tracking`} onPress={() => track(!managed)}>
					{managed ? t('products.stop_tracking') : t('products.track_quantity')}
				</PropertyVerb>
			}
		>
			{managed ? (
				<FormField
					control={control}
					name="stock_quantity"
					render={({ field: { value, ...rest } }) => (
						<FormInput
							customComponent={CountInput}
							type="numeric"
							autoFocus={focus}
							value={value != null ? String(value) : undefined}
							{...rest}
						/>
					)}
				/>
			) : (
				<PropertyPlaceholder>{t('products.not_tracked')}</PropertyPlaceholder>
			)}
		</CatalogueRow>
	);
}

/**
 * Tax status + Tax class as ONE fact. A variation that follows its parent is derived (rule 5):
 * "Same as parent · <class>" and a verb that opens the select, on Same as parent, for the owner
 * to pick the variation's own class; choosing Same as parent in the select derives it again.
 */
export function TaxRow({
	includeParent,
	parentClass,
}: {
	includeParent?: boolean;
	/** The parent product's class slug, when its record is on the device. */
	parentClass?: string;
}) {
	const t = useT();
	const kind = React.useContext(CatalogueKind);
	const { control, setValue } = useFormContext();
	const [status, taxClass] = useWatch({ control, name: ['tax_status', 'tax_class'] });
	const [open, setOpen] = React.useState(false);
	const classes = useTaxClassOptions();
	const follows = includeParent && status !== 'none' && taxClass === PARENT_TAX_CLASS;
	const parentLabel = classes.find((option) => option.value === parentClass)?.label ?? parentClass;
	return (
		<CatalogueRow
			id="tax"
			marks={['tax_class', 'tax_status']}
			label={t('common.tax')}
			verb={
				follows &&
				!open && (
					<PropertyVerb testID={`${kind}-tax-set`} onPress={() => setOpen(true)}>
						{t('products.set_for_this_variation')}
					</PropertyVerb>
				)
			}
		>
			{follows && !open ? (
				<Text>
					{t('common.tax_class_same_as_parent')}
					{parentLabel && <Text className="text-muted-foreground"> · {parentLabel}</Text>}
				</Text>
			) : (
				<TaxSelect
					includeParent={includeParent}
					status={status}
					// The stored class, never the parent's: a select opened on the parent's class could not
					// commit that class (Radix drops an unchanged selection), and Not taxable echoes this prop.
					taxClass={taxClass}
					onChange={(next) => {
						setValue('tax_status', next.tax_status, { shouldDirty: true });
						setValue('tax_class', next.tax_class, { shouldDirty: true });
						if (next.tax_class === PARENT_TAX_CLASS) setOpen(false);
					}}
					testID={`${kind}-tax-select`}
					aria-labelledby={`${kind}-tax-form-item`}
				/>
			)}
		</CatalogueRow>
	);
}

export function StatusRow() {
	const t = useT();
	const { control } = useFormContext();
	return (
		<CatalogueRow id="status" label={t('common.status')}>
			<FormField
				control={control}
				name="status"
				render={({ field: { value, onChange, ...rest } }) => (
					<FormSelect
						customComponent={ProductStatusSelect}
						value={value as string}
						onChange={onChange}
						{...rest}
					/>
				)}
			/>
		</CatalogueRow>
	);
}

/** An off-by-default switch (rule 7): added, it arrives on; Remove turns it off. */
export function OfferedSwitchRow(props: {
	name: 'featured' | 'virtual' | 'downloadable';
	label: string;
	onRemove: () => void;
}) {
	const kind = React.useContext(CatalogueKind);
	const { control } = useFormContext();
	return (
		<CatalogueRow
			id={props.name}
			label={props.label}
			onRemove={props.onRemove}
			control={
				<FormField
					control={control}
					name={props.name}
					render={({ field }) => <FormSwitch testID={`${kind}-${props.name}`} {...field} />}
				/>
			}
		/>
	);
}

/** Custom field's add button: appends one empty row to the `MetaDataForm` above it. */
export function CustomFieldAdd() {
	const t = useT();
	const kind = React.useContext(CatalogueKind);
	const { getValues, setValue } = useFormContext();
	return (
		<PropertyAdd
			testID={`${kind}-add-meta_data`}
			label={t('common.custom_field')}
			onPress={() =>
				setValue('meta_data', [...(getValues('meta_data') ?? []), { ...META_DATA_DEFAULT_ROW }], {
					shouldDirty: true,
				})
			}
		/>
	);
}

type Offered = 'sale_price' | 'sku' | 'barcode' | 'featured' | 'virtual' | 'downloadable';
const SWITCHES: readonly Offered[] = ['featured', 'virtual', 'downloadable'];

/**
 * The offered facts (a sale price, a barcode, a switch that is off): `row(name)` is the fact's
 * row while present, for the form to place where it belongs; `adds` the absent ones' buttons.
 * Remove writes the cleared value through the form, so the autosave writes the clearing.
 */
export function useOfferedRows<T extends FieldValues>(
	form: UseFormReturn<T>,
	kind: 'product' | 'variation',
	names: readonly Offered[]
) {
	const t = useT();
	const values = useWatch({ control: form.control }) as Record<string, unknown>;
	const write = (name: Offered, value: string | boolean) =>
		form.setValue(name as never, value as never, { shouldDirty: true });
	const isSwitch = (name: Offered) => SWITCHES.includes(name);
	const presence = useFieldPresence(
		names.map((name) => ({ name })),
		(name) => !values[name],
		(name) => write(name, isSwitch(name) ? false : '')
	);
	const labels: Record<Offered, string> = {
		sale_price: t('common.sale_price'),
		sku: t('common.sku'),
		barcode: t('common.barcode'),
		featured: t('common.featured'),
		virtual: t('products.virtual'),
		downloadable: t('products.downloadable'),
	};
	const row = (name: Offered) => {
		if (!presence.present.includes(name)) return null;
		const props = { name, label: labels[name], onRemove: () => presence.withdraw(name) };
		if (name === 'sale_price') return <PriceRow {...props} name="sale_price" />;
		return isSwitch(name) ? (
			<OfferedSwitchRow {...props} name={name as 'featured'} />
		) : (
			<TextRow {...props} name={name as 'sku'} />
		);
	};
	const adds = presence.offered.map((name) => (
		<PropertyAdd
			key={name}
			testID={`${kind}-add-${name}`}
			label={labels[name]}
			onPress={() => {
				presence.add(name);
				if (isSwitch(name)) write(name, true);
			}}
		/>
	));
	return { row, adds };
}
