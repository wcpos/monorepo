import * as React from 'react';
import { Pressable, View } from 'react-native';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
	useComboboxRootContext,
} from '@wcpos/components/combobox';
import type { Option } from '@wcpos/components/combobox';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useProductMetaKeys } from './use-product-meta-keys';

/** comma string -> Option[] */
export function stringToOptions(value: string | undefined): Option[] {
	return (value ?? '')
		.split(',')
		.map((k) => k.trim())
		.filter(Boolean)
		.map((k) => ({ value: k, label: k }));
}

/** Option[] -> comma string */
export function optionsToString(options: Option[]): string {
	return options.map((o) => o.value).join(',');
}

/**
 * Inner list: reads the combobox filter text, does its own filtering, and
 * offers an "add custom key" row when the typed text is not already an option.
 * Kept separate so it can read the combobox root context.
 */
function MetaKeyList({ options }: { options: Option[] }) {
	const { filterValue } = useComboboxRootContext();
	const t = useT();

	const q = filterValue.trim();
	const ql = q.toLowerCase();
	const exact = options.some((o) => o.value.toLowerCase() === ql);
	const createValue = q && !exact ? q : null;

	const data = React.useMemo<Option[]>(() => {
		const filtered = q ? options.filter((o) => o.value.toLowerCase().includes(ql)) : options;
		return createValue ? [{ value: createValue, label: createValue }, ...filtered] : filtered;
	}, [options, q, ql, createValue]);

	return (
		<ComboboxList
			data={data}
			shouldFilter={false}
			estimatedItemSize={40}
			renderItem={({ item }) => (
				<ComboboxItem value={item.value} label={item.label} item={item}>
					{createValue && item.value === createValue ? (
						<Text className="text-primary text-sm">
							{t('pos_products.add_custom_meta_key', { key: item.value })}
						</Text>
					) : (
						<ComboboxItemText />
					)}
				</ComboboxItem>
			)}
			ListEmptyComponent={<ComboboxEmpty>{t('common.no_results_found')}</ComboboxEmpty>}
		/>
	);
}

interface MetaDataKeysFieldProps {
	value?: string;
	onChange?: (value: string) => void;
}

/**
 * Multi-select combobox for product meta keys. Suggestions are discovered from
 * synced products; custom keys can be typed. The value is stored as the existing
 * comma-separated string so downstream consumers stay unchanged.
 */
export function MetaDataKeysField({ value, onChange }: MetaDataKeysFieldProps) {
	const t = useT();
	const discovered = useProductMetaKeys();

	const selected = React.useMemo(() => stringToOptions(value), [value]);
	const options = React.useMemo<Option[]>(
		() => discovered.map((k) => ({ value: k, label: k })),
		[discovered]
	);

	const handleChange = React.useCallback(
		(next: Option[]) => {
			onChange?.(optionsToString(next));
		},
		[onChange]
	);

	const removeKey = React.useCallback(
		(key: string) => {
			onChange?.(optionsToString(selected.filter((o) => o.value !== key)));
		},
		[onChange, selected]
	);

	return (
		<View className="gap-2">
			{selected.length > 0 && (
				<View className="flex-row flex-wrap gap-1">
					{selected.map((opt) => (
						<HStack
							key={opt.value}
							className="border-border bg-muted items-center gap-1 rounded-full border px-2 py-0.5"
						>
							<Text className="text-sm">{opt.value}</Text>
							<Pressable
								onPress={() => removeKey(opt.value)}
								testID={`meta-key-remove-${opt.value}`}
								accessibilityRole="button"
								accessibilityLabel={t('common.remove_2', { name: opt.value })}
							>
								<Text className="text-muted-foreground text-sm">✕</Text>
							</Pressable>
						</HStack>
					))}
				</View>
			)}
			<Combobox multiple value={selected} onValueChange={handleChange}>
				<ComboboxTrigger testID="meta-data-keys-trigger">
					<ComboboxValue placeholder={t('common.meta_data_keys')} />
				</ComboboxTrigger>
				<ComboboxContent>
					<ComboboxInput placeholder={t('common.meta_data_keys')} />
					<MetaKeyList options={options} />
				</ComboboxContent>
			</Combobox>
		</View>
	);
}
