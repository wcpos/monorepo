import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
} from '@wcpos/components/combobox';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';
import type { ProductDocument } from '@wcpos/database';

import { useT } from '../../../../contexts/translations';

type Attribute = NonNullable<ProductDocument['attributes']>[number];

interface Props {
	attribute: Attribute;
	selected: string;
	onSelect: ({ id, name, option }: { id: number; name: string; option: string }) => void;
	onRemove: () => void;
}

/**
 *
 */
export function VariationSelect({ attribute, selected = '', onSelect, onRemove }: Props) {
	const t = useT();
	const isActive = !!selected;
	const options = attribute?.options || [];
	const data = React.useMemo(
		() => options.map((option: string) => ({ value: option, label: option })),
		[options]
	);

	/**
	 * Select for short list of options
	 */
	if (options.length <= 10) {
		return (
			<Select
				value={{ value: selected, label: selected }}
				onValueChange={(option) =>
					option &&
					onSelect({ id: attribute.id ?? 0, name: attribute.name ?? '', option: option.value })
				}
			>
				<SelectPrimitiveTrigger asChild>
					<ButtonPill
						size="xs"
						leftIcon="check"
						variant={isActive ? undefined : 'muted'}
						removable={isActive}
						onRemove={onRemove}
					>
						<ButtonText>{isActive ? `${attribute.name}: ${selected}` : attribute.name}</ButtonText>
					</ButtonPill>
				</SelectPrimitiveTrigger>
				<SelectContent>
					{options.map((option: string, index: number) => (
						<SelectItem key={index} label={option} value={option} />
					))}
				</SelectContent>
			</Select>
		);
	}

	/**
	 * Combobox for longer list of options
	 */
	return (
		<Combobox
			value={{ value: selected, label: selected }}
			onValueChange={(option) =>
				option &&
				onSelect({
					id: attribute.id ?? 0,
					name: attribute.name ?? '',
					option: String(option.value),
				})
			}
		>
			<ComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="check"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={onRemove}
				>
					<ButtonText>{isActive ? `${attribute.name}: ${selected}` : attribute.name}</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput placeholder={t('common.search_variations')} />
				<ComboboxList
					data={data}
					renderItem={({ item }) => (
						<ComboboxItem value={String(item.value)} label={item.label} item={item}>
							<ComboboxItemText />
						</ComboboxItem>
					)}
					estimatedItemSize={20}
					ListEmptyComponent={() => <ComboboxEmpty>{t('common.no_variation_found')}</ComboboxEmpty>}
				></ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
