import * as React from 'react';
import { View } from 'react-native';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { Text } from '../text';
import { TreeCombobox, TreeComboboxContent, TreeComboboxTrigger } from '../tree-combobox';

import type { Option } from '../combobox/types';
import type { HierarchicalOption } from '../lib/use-hierarchy';
import type { TreeComboboxContentProps } from '../tree-combobox/types';
import type { FormItemProps } from './common';

type FormTreeComboboxProps = FormItemProps<Option[]> &
	Pick<
		TreeComboboxContentProps,
		'searchPlaceholder' | 'emptyMessage' | 'estimatedItemSize' | 'renderItem' | 'portalHost'
	> & {
		options: HierarchicalOption[];
		placeholder?: string;
		cascadeSelection?: boolean;
		maxDepth?: number;
		parentSelectable?: boolean;
		searchMode?: 'tree' | 'flat';
	};

export function FormTreeCombobox({
	children,
	label,
	description,
	value,
	onChange,
	options,
	placeholder = 'Select...',
	searchPlaceholder,
	emptyMessage,
	estimatedItemSize,
	renderItem,
	portalHost,
	...treeProps
}: FormTreeComboboxProps & { children?: React.ReactNode }) {
	const { labelNativeID, ariaProps } = useFormControlAria({ label, description });

	const selected = value ?? [];
	const hasValue = selected.length > 0;

	const displayText = React.useMemo(() => {
		if (selected.length === 0) return placeholder;
		return selected.map((s) => s.label).join(', ');
	}, [selected, placeholder]);

	return (
		<FormItem>
			{!!label && <FormLabel nativeID={labelNativeID}>{label}</FormLabel>}
			<TreeCombobox
				options={options}
				multiple
				value={selected}
				onValueChange={onChange}
				{...ariaProps}
				{...treeProps}
			>
				<TreeComboboxTrigger>
					<View
						className={cn(
							'border-border bg-card web:ring-offset-background h-10 w-full flex-row items-center rounded-md border px-2'
						)}
					>
						<View className="flex-1">
							<Text
								className={cn('text-sm', hasValue ? 'text-foreground' : 'text-muted-foreground')}
								numberOfLines={1}
								decodeHtml
							>
								{displayText}
							</Text>
						</View>
						<Icon name="chevronDown" />
					</View>
				</TreeComboboxTrigger>
				<TreeComboboxContent
					matchWidth
					searchPlaceholder={searchPlaceholder}
					emptyMessage={emptyMessage}
					estimatedItemSize={estimatedItemSize}
					renderItem={renderItem}
					portalHost={portalHost}
				>
					{children}
				</TreeComboboxContent>
			</TreeCombobox>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
