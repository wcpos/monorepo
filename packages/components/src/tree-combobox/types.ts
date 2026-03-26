import type { FlatTreeItem, HierarchicalOption, HierarchyConfig } from '../lib/use-hierarchy';
import type { Option } from '../combobox/types';

type TreeComboboxBaseProps<T = undefined> = {
	options: HierarchicalOption<T>[];
	menuType?: 'inline'; // 'submenu' deferred to Phase 4
	maxDepth?: number;
	parentSelectable?: boolean;
	searchMode?: 'tree' | 'flat';
	defaultExpanded?: HierarchyConfig['defaultExpanded'];
	expandedIds?: string[];
	onExpandChange?: (ids: string[]) => void;
	placeholder?: string;
	searchPlaceholder?: string;
	disabled?: boolean;
	portalHost?: string;
	className?: string;
	estimatedItemSize?: number;
	emptyMessage?: string;
	renderItem?: (
		item: FlatTreeItem<T>,
		defaultRender: () => React.ReactElement
	) => React.ReactElement;
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
