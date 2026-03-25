import type * as SelectPrimitive from '@rn-primitives/select';

type Option = SelectPrimitive.Option;

interface SelectMultiRootContextType {
	multiple: true;
	value: Option[];
	onValueChange: (options: Option[]) => void;
	isSelected: (value: string) => boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	disabled?: boolean;
}

type SelectSingleRootProps = {
	children: React.ReactNode;
	multiple?: false;
	value?: Option;
	defaultValue?: Option;
	onValueChange?: (option: Option | undefined) => void;
	onOpenChange?: (open: boolean) => void;
	open?: boolean;
	disabled?: boolean;
};

type SelectMultiRootProps = {
	children: React.ReactNode;
	multiple: true;
	value?: Option[];
	defaultValue?: Option[];
	onValueChange?: (options: Option[]) => void;
	onOpenChange?: (open: boolean) => void;
	open?: boolean;
	disabled?: boolean;
};

type SelectRootProps = SelectSingleRootProps | SelectMultiRootProps;

type SelectValueProps = {
	placeholder: string;
	asChild?: boolean;
	className?: string;
	/** Max character length before truncating. Default: 24. Only used in multi-select mode. */
	maxDisplayLength?: number;
	/** How to truncate overflowing labels. Default: "+N". Only used in multi-select mode. */
	truncationStyle?: '+N' | 'ellipsis';
};

export type {
	Option,
	SelectMultiRootContextType,
	SelectSingleRootProps,
	SelectMultiRootProps,
	SelectRootProps,
	SelectValueProps,
};
