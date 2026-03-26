import type { FlatTreeItem, HierarchicalOption, HierarchyConfig } from '../lib/use-hierarchy';
import type { Option } from '../combobox/types';

// --- Root props ---

type TreeComboboxBaseProps<T = undefined> = {
	children: React.ReactNode;
	options: HierarchicalOption<T>[];
	maxDepth?: number;
	parentSelectable?: boolean;
	searchMode?: 'tree' | 'flat';
	defaultExpanded?: HierarchyConfig['defaultExpanded'];
	expandedIds?: string[];
	onExpandChange?: (ids: string[]) => void;
	onOpenChange?: (open: boolean) => void;
};

export type TreeComboboxSingleProps<T = undefined> = TreeComboboxBaseProps<T> & {
	multiple?: false;
	value?: Option<T>;
	defaultValue?: Option<T>;
	onValueChange?: (option: Option<T> | undefined) => void;
	cascadeSelection?: never;
};

export type TreeComboboxMultiProps<T = undefined> = TreeComboboxBaseProps<T> & {
	multiple: true;
	value?: Option<T>[];
	defaultValue?: Option<T>[];
	onValueChange?: (options: Option<T>[]) => void;
	cascadeSelection?: boolean;
};

export type TreeComboboxProps<T = undefined> =
	| TreeComboboxSingleProps<T>
	| TreeComboboxMultiProps<T>;

// --- Content props ---

export type TreeComboboxContentProps<T = undefined> = {
	children?: React.ReactNode;
	portalHost?: string;
	className?: string;
	matchWidth?: boolean;
	searchPlaceholder?: string;
	emptyMessage?: string;
	estimatedItemSize?: number;
	renderItem?: (
		item: FlatTreeItem<T>,
		defaultRender: () => React.ReactElement
	) => React.ReactElement;
};
