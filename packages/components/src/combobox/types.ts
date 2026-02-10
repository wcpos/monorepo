import type { ViewProps } from 'react-native';

import type { ListProps as VirtualizedListPrimitiveProps } from '@wcpos/components/virtualized-list';

export interface Option<T = undefined> {
	value: string;
	label: string;
	item?: T;
}

interface ComboboxRootContextType {
	value: Option<any> | undefined;
	onValueChange: (option: Option<any> | undefined) => void;
	disabled?: boolean;
	filterValue: string;
	onFilterChange: (text: string) => void;
}

type ComboboxRootProps<T = undefined> = {
	children: React.ReactNode;
	value?: Option<T>;
	defaultValue?: Option<T>;
	onValueChange?: (option: Option<T> | undefined) => void;
	onOpenChange?: (open: boolean) => void;
	disabled?: boolean;
};

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
	ComboboxTriggerProps,
	ComboboxValueProps,
	ComboboxInputProps,
	ComboboxEmptyProps,
	ComboboxItemProps,
	ComboboxItemTextProps,
	ComboboxRootContextType,
};
