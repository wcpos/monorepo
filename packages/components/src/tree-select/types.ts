import type { FlatTreeItem, HierarchicalOption, HierarchyConfig } from '../lib/use-hierarchy';

/**
 * TreeSelect value type matches Select primitive's Option: { value, label }.
 * The `item` field from HierarchicalOption is not carried through to the value —
 * use the hook's nodeMap to look up the full item from a selected value if needed.
 */
type SelectOption = { value: string; label: string };

type TreeSelectBaseProps<T = undefined> = {
	options: HierarchicalOption<T>[];
	menuType?: 'inline'; // 'submenu' deferred to Phase 4
	maxDepth?: number;
	parentSelectable?: boolean;
	defaultExpanded?: HierarchyConfig['defaultExpanded'];
	expandedIds?: string[];
	onExpandChange?: (ids: string[]) => void;
	placeholder?: string;
	disabled?: boolean;
	portalHost?: string;
	className?: string;
	renderItem?: (
		item: FlatTreeItem<T>,
		defaultRender: () => React.ReactElement
	) => React.ReactElement;
};

export type TreeSelectSingleProps<T = undefined> = TreeSelectBaseProps<T> & {
	multiple?: false;
	value?: SelectOption;
	defaultValue?: SelectOption;
	onValueChange?: (option: SelectOption | undefined) => void;
	cascadeSelection?: never;
};

export type TreeSelectMultiProps<T = undefined> = TreeSelectBaseProps<T> & {
	multiple: true;
	value?: SelectOption[];
	defaultValue?: SelectOption[];
	onValueChange?: (options: SelectOption[]) => void;
	cascadeSelection?: boolean;
};

export type TreeSelectProps<T = undefined> = TreeSelectSingleProps<T> | TreeSelectMultiProps<T>;
