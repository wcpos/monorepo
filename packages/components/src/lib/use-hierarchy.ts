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
	cascadeSelection?: boolean;
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
	const childrenMap = new Map<string, TreeNode<T>[]>();

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

	// Second pass: build parent-child relationships
	for (const node of nodeMap.values()) {
		if (node.parentId && nodeMap.has(node.parentId)) {
			if (!childrenMap.has(node.parentId)) {
				childrenMap.set(node.parentId, []);
			}
			childrenMap.get(node.parentId)!.push(node);
		}
	}

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
