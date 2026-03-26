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
