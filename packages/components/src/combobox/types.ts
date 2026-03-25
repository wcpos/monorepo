import type { ViewProps } from 'react-native';

import type { ListProps as VirtualizedListPrimitiveProps } from '@wcpos/components/virtualized-list';

export interface Option<T = undefined> {
	value: string;
	label: string;
	item?: T;
}

interface ComboboxRootContextType {
	multiple: boolean;
	value: Option<any> | Option<any>[] | undefined;
	onValueChange: (option: Option<any> | Option<any>[] | undefined) => void;
	isSelected: (value: string) => boolean;
	disabled?: boolean;
	filterValue: string;
	onFilterChange: (text: string) => void;
}

type ComboboxSingleRootProps<T = undefined> = {
	children: React.ReactNode;
	multiple?: false;
	value?: Option<T>;
	defaultValue?: Option<T>;
	onValueChange?: (option: Option<T> | undefined) => void;
	onOpenChange?: (open: boolean) => void;
	disabled?: boolean;
};

type ComboboxMultiRootProps<T = undefined> = {
	children: React.ReactNode;
	multiple: true;
	value?: Option<T>[];
	defaultValue?: Option<T>[];
	onValueChange?: (options: Option<T>[]) => void;
	onOpenChange?: (open: boolean) => void;
	disabled?: boolean;
};

type ComboboxRootProps<T = undefined> = ComboboxSingleRootProps<T> | ComboboxMultiRootProps<T>;

type ComboboxTriggerProps = object;

type ComboboxValueProps = {
	placeholder: string;
	asChild?: boolean;
	className?: string;
};

type ComboboxInputProps = {
	value?: string;
	placeholder?: string;
	testID?: string;
	onKeyPress?: (event: any) => void;
	onChangeText?: (value: string) => void;
};

export type ComboboxListProps<T> = Omit<VirtualizedListPrimitiveProps<T>, 'data'> & {
	data: readonly T[];
	shouldFilter?: boolean;
	filter?: (data: T[], filterValue: string, threshold?: number) => T[];
};

type ComboboxEmptyProps = ViewProps & {
	children?: React.ReactNode;
};

type ComboboxItemProps = ViewProps & {
	value: string;
	label: string;
	item: any; // allow the item object to be passed in
	disabled?: boolean;
};

type ComboboxItemTextProps = {
	className?: string;
};

export type {
	ComboboxRootProps,
	ComboboxSingleRootProps,
	ComboboxMultiRootProps,
	ComboboxTriggerProps,
	ComboboxValueProps,
	ComboboxInputProps,
	ComboboxEmptyProps,
	ComboboxItemProps,
	ComboboxItemTextProps,
	ComboboxRootContextType,
};
