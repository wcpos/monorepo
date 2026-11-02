import { useCallback, useMemo, useState } from 'react';

// --- Types ---

export interface HierarchicalOption<T = undefined> {
	value: string;
	label: string;
	parentId?: string;
	item?: T;
}

export interface HierarchyConfig {
	maxDepth?: number;
	defaultExpanded?: string[] | 'all' | 'none';
	expandedIds?: string[];
	onExpandChange?: (ids: string[]) => void;
	parentSelectable?: boolean;
	searchMode?: 'flat' | 'tree';
	filterValue?: string;
	breadcrumbSeparator?: string;
}

export interface TreeNode<T = undefined> {
	value: string;
	label: string;
	parentId?: string;
	item?: T;
	children: TreeNode<T>[];
	depth: number;
	hasChildren: boolean;
}

export interface FlatTreeItem<T = undefined> {
	value: string;
	label: string;
	item?: T;
	depth: number;
	hasChildren: boolean;
	isExpanded: boolean;
	parentId?: string;
}

// --- buildTree ---

interface BuildTreeResult<T> {
	tree: TreeNode<T>[];
	nodeMap: Map<string, TreeNode<T>>;
}

export function buildTree<T>(
	options: HierarchicalOption<T>[],
	config?: { maxDepth?: number }
): BuildTreeResult<T> {
	const maxDepth = config?.maxDepth ?? Infinity;
	const nodeMap = new Map<string, TreeNode<T>>();

	// Helper: build childrenMap from current parentId values in nodeMap
	function buildChildrenMap(): Map<string, TreeNode<T>[]> {
		const map = new Map<string, TreeNode<T>[]>();
		for (const node of nodeMap.values()) {
			if (node.parentId && nodeMap.has(node.parentId)) {
				if (!map.has(node.parentId)) {
					map.set(node.parentId, []);
				}
				map.get(node.parentId)!.push(node);
			}
		}
		return map;
	}

	// First pass: create all nodes (skip duplicates)
	for (const option of options) {
		if (nodeMap.has(option.value)) continue;
		const node: TreeNode<T> = {
			value: option.value,
			label: option.label,
			parentId: option.parentId,
			item: option.item,
			children: [],
			depth: 0,
			hasChildren: false,
		};
		nodeMap.set(option.value, node);
	}

	// Second pass: build parent-child relationships (before cycle detection)
	let childrenMap = buildChildrenMap();

	// Detect circular references by computing depths
	const visited = new Set<string>();
	const inStack = new Set<string>();

	function computeDepth(node: TreeNode<T>): number {
		if (visited.has(node.value)) return node.depth;
		if (inStack.has(node.value)) {
			// Circular reference detected — promote to root
			console.warn(
				`[useHierarchy] Circular reference detected for node "${node.value}". Promoting to root.`
			);
			node.parentId = undefined;
			return 0;
		}

		inStack.add(node.value);

		if (node.parentId && nodeMap.has(node.parentId)) {
			const parent = nodeMap.get(node.parentId)!;
			const parentDepth = computeDepth(parent);
			// If the parent was promoted to root due to a cycle, this node is also part of the cycle
			if (inStack.has(node.value) && parent.parentId === undefined && parentDepth === 0) {
				// Check if this node was the original parent of the promoted node (cycle)
				const originalParentId = options.find((o) => o.value === parent.value)?.parentId;
				if (originalParentId === node.value) {
					console.warn(
						`[useHierarchy] Circular reference detected for node "${node.value}". Promoting to root.`
					);
					node.parentId = undefined;
					node.depth = 0;
				} else {
					node.depth = parentDepth + 1;
				}
			} else {
				node.depth = parentDepth + 1;
			}
		} else {
			node.depth = 0;
		}

		inStack.delete(node.value);
		visited.add(node.value);
		return node.depth;
	}

	for (const node of nodeMap.values()) {
		computeDepth(node);
	}

	// Rebuild childrenMap after cycle detection (parentId may have changed)
	childrenMap = buildChildrenMap();

	// Third pass: assign children and apply maxDepth
	for (const node of nodeMap.values()) {
		const children = childrenMap.get(node.value) ?? [];
		if (node.depth < maxDepth) {
			node.children = children;
			node.hasChildren = children.length > 0;
		} else {
			node.children = [];
			node.hasChildren = false;
		}
	}

	// Fourth pass: collect roots
	const roots: TreeNode<T>[] = [];
	for (const node of nodeMap.values()) {
		const isRoot = !node.parentId || !nodeMap.has(node.parentId);
		if (isRoot) {
			roots.push(node);
		}
	}

	return { tree: roots, nodeMap };
}

// --- getBreadcrumb ---

export function getBreadcrumb<T>(
	id: string,
	nodeMap: Map<string, TreeNode<T>>,
	separator = ' > '
): string {
	const parts: string[] = [];
	let current = nodeMap.get(id);
	while (current) {
		parts.unshift(current.label);
		current = current.parentId ? nodeMap.get(current.parentId) : undefined;
	}
	return parts.join(separator);
}

// --- getDescendantIds ---

export function getDescendantIds<T>(id: string, nodeMap: Map<string, TreeNode<T>>): string[] {
	const node = nodeMap.get(id);
	if (!node) return [];
	const result: string[] = [];
	function collect(children: TreeNode<T>[]) {
		for (const child of children) {
			result.push(child.value);
			collect(child.children);
		}
	}
	collect(node.children);
	return result;
}

// --- getAncestorIds ---

export function getAncestorIds<T>(id: string, nodeMap: Map<string, TreeNode<T>>): string[] {
	const result: string[] = [];
	let current = nodeMap.get(id);
	while (current?.parentId) {
		result.push(current.parentId);
		current = nodeMap.get(current.parentId);
	}
	return result;
}

// --- applyCascadeToggle ---

/**
 * Apply cascade toggle logic for multi-select with hierarchy.
 * Selecting a node selects all descendants. Deselecting removes all descendants.
 * Auto-selects ancestors when all their descendants become selected (bubble up).
 * Auto-deselects ancestors when any descendant is removed.
 */
export function applyCascadeToggle<T>(
	current: { value: string; label: string }[],
	toggleId: string,
	nodeMap: Map<string, TreeNode<T>>
): { value: string; label: string }[] {
	const currentSet = new Set(current.map((o) => o.value));
	const isDeselecting = currentSet.has(toggleId);
	const descendantIds = getDescendantIds(toggleId, nodeMap);
	const allIds = [toggleId, ...descendantIds];

	let nextSet: Set<string>;

	if (isDeselecting) {
		// Remove self + all descendants
		const toRemove = new Set(allIds);
		nextSet = new Set([...currentSet].filter((id) => !toRemove.has(id)));

		// Bubble up: deselect any ancestor that was fully selected
		const ancestorIds = getAncestorIds(toggleId, nodeMap);
		for (const ancestorId of ancestorIds) {
			nextSet.delete(ancestorId);
		}
	} else {
		// Add self + all descendants
		nextSet = new Set(currentSet);
		for (const id of allIds) {
			nextSet.add(id);
		}

		// Bubble up: auto-select ancestors whose full subtree is now selected
		const ancestorIds = getAncestorIds(toggleId, nodeMap);
		for (const ancestorId of ancestorIds) {
			const allDescendants = getDescendantIds(ancestorId, nodeMap);
			const allSelected = allDescendants.every((id) => nextSet.has(id));
			if (allSelected) {
				nextSet.add(ancestorId);
			}
		}
	}

	// Convert back to options array, preserving original objects where possible
	const currentMap = new Map(current.map((o) => [o.value, o]));
	return Array.from(nextSet).map((id) => {
		if (currentMap.has(id)) return currentMap.get(id)!;
		const node = nodeMap.get(id);
		return { value: id, label: node?.label ?? '' };
	});
}

// --- filterTree ---

export function filterTree<T>(
	tree: TreeNode<T>[],
	nodeMap: Map<string, TreeNode<T>>,
	query: string,
	mode: 'tree' | 'flat'
): FlatTreeItem<T>[] {
	if (!query.trim()) return [];

	const lowerQuery = query.toLowerCase();

	// Find all matching node IDs
	const matchIds = new Set<string>();
	for (const node of nodeMap.values()) {
		if (node.label.toLowerCase().includes(lowerQuery)) {
			matchIds.add(node.value);
		}
	}

	if (matchIds.size === 0) return [];

	if (mode === 'flat') {
		// Flat mode: return matches as a flat list at depth 0.
		// hasChildren is false because flat results have no expand/collapse — they're
		// displayed as a simple list with breadcrumb text for context.
		const results: FlatTreeItem<T>[] = [];
		for (const id of matchIds) {
			const node = nodeMap.get(id)!;
			results.push({
				value: node.value,
				label: node.label,
				item: node.item,
				depth: 0,
				hasChildren: false,
				isExpanded: false,
				parentId: node.parentId,
			});
		}
		return results;
	}

	// Tree mode: include ancestors of matches to preserve hierarchy
	const visibleIds = new Set<string>(matchIds);
	for (const id of matchIds) {
		let current = nodeMap.get(id);
		while (current?.parentId) {
			visibleIds.add(current.parentId);
			current = nodeMap.get(current.parentId);
		}
	}

	// Walk tree in order, only including visible nodes (all auto-expanded)
	const result: FlatTreeItem<T>[] = [];
	function walk(nodes: TreeNode<T>[]) {
		for (const node of nodes) {
			if (!visibleIds.has(node.value)) continue;
			const hasVisibleChildren = node.children.some((c) => visibleIds.has(c.value));
			result.push({
				value: node.value,
				label: node.label,
				item: node.item,
				depth: node.depth,
				hasChildren: hasVisibleChildren,
				isExpanded: hasVisibleChildren,
				parentId: node.parentId,
			});
			if (hasVisibleChildren) {
				walk(node.children);
			}
		}
	}
	walk(tree);

	return result;
}

// --- getVisibleItems ---

export function getVisibleItems<T>(
	tree: TreeNode<T>[],
	expandedIds: Set<string>
): FlatTreeItem<T>[] {
	const result: FlatTreeItem<T>[] = [];

	function walk(nodes: TreeNode<T>[]) {
		for (const node of nodes) {
			const isExpanded = expandedIds.has(node.value) && node.hasChildren;
			result.push({
				value: node.value,
				label: node.label,
				item: node.item,
				depth: node.depth,
				hasChildren: node.hasChildren,
				isExpanded,
				parentId: node.parentId,
			});
			if (isExpanded) {
				walk(node.children);
			}
		}
	}

	walk(tree);
	return result;
}

// --- useHierarchy hook ---

export interface HierarchyState<T = undefined> {
	tree: TreeNode<T>[];
	nodeMap: Map<string, TreeNode<T>>;
	expandedIds: Set<string>;
	toggle: (id: string) => void;
	expandAll: () => void;
	collapseAll: () => void;
	visibleItems: FlatTreeItem<T>[];
	filteredItems: FlatTreeItem<T>[];
	getDescendantIds: (id: string) => string[];
	getAncestorIds: (id: string) => string[];
	getBreadcrumb: (id: string) => string;
	getDepth: (id: string) => number;
}

export function useHierarchy<T = undefined>(
	options: HierarchicalOption<T>[],
	config?: HierarchyConfig
): HierarchyState<T> {
	const {
		maxDepth,
		defaultExpanded = 'none',
		expandedIds: controlledExpandedIds,
		onExpandChange,
		searchMode = 'tree',
		filterValue,
		breadcrumbSeparator = ' > ',
	} = config ?? {};

	// Build tree (memoized on options + maxDepth)
	const { tree, nodeMap } = useMemo(() => buildTree(options, { maxDepth }), [options, maxDepth]);

	// Uncontrolled expand state. useState initializer runs once on mount.
	const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(() => {
		if (defaultExpanded === 'all') {
			// Build tree inside initializer to get accurate hasChildren from nodeMap
			const { nodeMap: initNodeMap } = buildTree(options, { maxDepth });
			const parentIds = new Set<string>();
			for (const node of initNodeMap.values()) {
				if (node.hasChildren) parentIds.add(node.value);
			}
			return parentIds;
		}
		if (defaultExpanded === 'none') return new Set<string>();
		return new Set(defaultExpanded);
	});

	const isControlled = controlledExpandedIds !== undefined;
	const controlledExpandedSet = useMemo(
		() => (controlledExpandedIds ? new Set(controlledExpandedIds) : undefined),
		[controlledExpandedIds]
	);
	const expandedIds = isControlled ? controlledExpandedSet! : internalExpandedIds;

	const toggle = useCallback(
		(id: string) => {
			if (isControlled) {
				const next = new Set(controlledExpandedSet);
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				onExpandChange?.(Array.from(next));
			} else {
				setInternalExpandedIds((prev) => {
					const next = new Set(prev);
					if (next.has(id)) {
						next.delete(id);
					} else {
						next.add(id);
					}
					onExpandChange?.(Array.from(next));
					return next;
				});
			}
		},
		[isControlled, controlledExpandedSet, onExpandChange]
	);

	const expandAll = useCallback(() => {
		const all = new Set<string>();
		for (const node of nodeMap.values()) {
			if (node.hasChildren) all.add(node.value);
		}
		if (isControlled) {
			onExpandChange?.(Array.from(all));
		} else {
			setInternalExpandedIds(all);
			onExpandChange?.(Array.from(all));
		}
	}, [nodeMap, isControlled, onExpandChange]);

	const collapseAll = useCallback(() => {
		const empty = new Set<string>();
		if (isControlled) {
			onExpandChange?.([]);
		} else {
			setInternalExpandedIds(empty);
			onExpandChange?.([]);
		}
	}, [isControlled, onExpandChange]);

	const visibleItems = useMemo(() => getVisibleItems(tree, expandedIds), [tree, expandedIds]);

	const filteredItems = useMemo(() => {
		if (!filterValue?.trim()) return [] as FlatTreeItem<T>[];
		return filterTree(tree, nodeMap, filterValue, searchMode);
	}, [tree, nodeMap, filterValue, searchMode]);

	const boundGetBreadcrumb = useCallback(
		(id: string) => getBreadcrumb(id, nodeMap, breadcrumbSeparator),
		[nodeMap, breadcrumbSeparator]
	);
	const boundGetDescendantIds = useCallback(
		(id: string) => getDescendantIds(id, nodeMap),
		[nodeMap]
	);
	const boundGetAncestorIds = useCallback((id: string) => getAncestorIds(id, nodeMap), [nodeMap]);
	const boundGetDepth = useCallback((id: string) => nodeMap.get(id)?.depth ?? -1, [nodeMap]);

	return {
		tree,
		nodeMap,
		expandedIds,
		toggle,
		expandAll,
		collapseAll,
		visibleItems,
		filteredItems,
		getDescendantIds: boundGetDescendantIds,
		getAncestorIds: boundGetAncestorIds,
		getBreadcrumb: boundGetBreadcrumb,
		getDepth: boundGetDepth,
	};
}
