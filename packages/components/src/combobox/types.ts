import type { ViewProps } from 'react-native';

import type { ListProps as VirtualizedListPrimitiveProps } from '@wcpos/components/virtualized-list';

export interface Option {
	value: string | number;
	label: string;
}

interface ComboboxRootContextType {
	value: Option | undefined;
	onValueChange: (option: Option | undefined) => void;
	disabled?: boolean;
	filterValue: string;
	onFilterChange: (text: string) => void;
}

type ComboboxRootProps = {
	children: React.ReactNode;
	value?: Option;
	defaultValue?: Option;
	onValueChange?: (option: Option | undefined) => void;
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
