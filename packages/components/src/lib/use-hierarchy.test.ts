import {
	applyCascadeToggle,
	buildTree,
	getAncestorIds,
	getBreadcrumb,
	getDescendantIds,
	getVisibleItems,
} from './use-hierarchy';

import type { HierarchicalOption } from './use-hierarchy';

describe('buildTree', () => {
	const flat: HierarchicalOption[] = [
		{ value: '1', label: 'Clothing' },
		{ value: '2', label: 'Shirts', parentId: '1' },
		{ value: '3', label: 'T-Shirts', parentId: '2' },
		{ value: '4', label: 'Accessories' },
		{ value: '5', label: 'Hats', parentId: '4' },
	];

	it('builds a tree with correct root nodes', () => {
		const { tree } = buildTree(flat);
		expect(tree).toHaveLength(2);
		expect(tree[0].value).toBe('1');
		expect(tree[1].value).toBe('4');
	});

	it('nests children correctly', () => {
		const { tree } = buildTree(flat);
		const clothing = tree[0];
		expect(clothing.children).toHaveLength(1);
		expect(clothing.children[0].value).toBe('2');
		expect(clothing.children[0].children).toHaveLength(1);
		expect(clothing.children[0].children[0].value).toBe('3');
	});

	it('sets depth correctly', () => {
		const { nodeMap } = buildTree(flat);
		expect(nodeMap.get('1')!.depth).toBe(0);
		expect(nodeMap.get('2')!.depth).toBe(1);
		expect(nodeMap.get('3')!.depth).toBe(2);
	});

	it('sets hasChildren correctly', () => {
		const { nodeMap } = buildTree(flat);
		expect(nodeMap.get('1')!.hasChildren).toBe(true);
		expect(nodeMap.get('3')!.hasChildren).toBe(false);
	});

	it('promotes orphaned nodes to root', () => {
		const orphaned: HierarchicalOption[] = [
			{ value: '1', label: 'Root' },
			{ value: '2', label: 'Orphan', parentId: '999' },
		];
		const { tree } = buildTree(orphaned);
		expect(tree).toHaveLength(2);
		expect(tree[1].value).toBe('2');
		expect(tree[1].depth).toBe(0);
	});

	it('handles empty input', () => {
		const { tree, nodeMap } = buildTree([]);
		expect(tree).toHaveLength(0);
		expect(nodeMap.size).toBe(0);
	});

	it('handles flat list with no parentIds', () => {
		const flatOnly: HierarchicalOption[] = [
			{ value: '1', label: 'A' },
			{ value: '2', label: 'B' },
		];
		const { tree } = buildTree(flatOnly);
		expect(tree).toHaveLength(2);
		expect(tree[0].hasChildren).toBe(false);
	});

	it('ignores duplicate values (first occurrence wins)', () => {
		const dupes: HierarchicalOption[] = [
			{ value: '1', label: 'First' },
			{ value: '1', label: 'Duplicate' },
		];
		const { tree, nodeMap } = buildTree(dupes);
		expect(tree).toHaveLength(1);
		expect(nodeMap.get('1')!.label).toBe('First');
	});

	it('breaks circular references and promotes both to root', () => {
		const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
		const circular: HierarchicalOption[] = [
			{ value: '1', label: 'A', parentId: '2' },
			{ value: '2', label: 'B', parentId: '1' },
		];
		const { tree } = buildTree(circular);
		expect(tree).toHaveLength(2);
		// Both promoted to root since neither can be a valid child
		expect(tree.every((n) => n.depth === 0)).toBe(true);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('respects maxDepth', () => {
		const { tree } = buildTree(flat, { maxDepth: 1 });
		const clothing = tree[0];
		// depth 0: Clothing, depth 1: Shirts — Shirts' children should be pruned
		expect(clothing.children).toHaveLength(1);
		expect(clothing.children[0].children).toHaveLength(0);
		expect(clothing.children[0].hasChildren).toBe(false);
	});
});

describe('getVisibleItems', () => {
	const flat: HierarchicalOption[] = [
		{ value: '1', label: 'Clothing' },
		{ value: '2', label: 'Shirts', parentId: '1' },
		{ value: '3', label: 'T-Shirts', parentId: '2' },
		{ value: '4', label: 'Accessories' },
		{ value: '5', label: 'Hats', parentId: '4' },
	];

	it('shows only roots when nothing is expanded', () => {
		const { tree } = buildTree(flat);
		const items = getVisibleItems(tree, new Set());
		expect(items).toHaveLength(2);
		expect(items[0].value).toBe('1');
		expect(items[1].value).toBe('4');
	});

	it('shows children when parent is expanded', () => {
		const { tree } = buildTree(flat);
		const items = getVisibleItems(tree, new Set(['1']));
		expect(items).toHaveLength(3);
		expect(items[0].value).toBe('1');
		expect(items[0].isExpanded).toBe(true);
		expect(items[1].value).toBe('2');
		expect(items[1].isExpanded).toBe(false);
		expect(items[2].value).toBe('4');
	});

	it('shows deeply nested children when all ancestors expanded', () => {
		const { tree } = buildTree(flat);
		const items = getVisibleItems(tree, new Set(['1', '2']));
		expect(items).toHaveLength(4);
		expect(items[2].value).toBe('3');
	});

	it('preserves depth on FlatTreeItems', () => {
		const { tree } = buildTree(flat);
		const items = getVisibleItems(tree, new Set(['1', '2']));
		expect(items[0].depth).toBe(0);
		expect(items[1].depth).toBe(1);
		expect(items[2].depth).toBe(2);
	});

	it('returns empty array for empty tree', () => {
		expect(getVisibleItems([], new Set())).toHaveLength(0);
	});
});

describe('utility functions', () => {
	const flat: HierarchicalOption[] = [
		{ value: '1', label: 'Clothing' },
		{ value: '2', label: 'Shirts', parentId: '1' },
		{ value: '3', label: 'T-Shirts', parentId: '2' },
		{ value: '4', label: 'Accessories' },
		{ value: '5', label: 'Hats', parentId: '4' },
	];
	const { nodeMap } = buildTree(flat);

	describe('getBreadcrumb', () => {
		it('returns label for root node', () => {
			expect(getBreadcrumb('1', nodeMap)).toBe('Clothing');
		});

		it('returns full breadcrumb for nested node', () => {
			expect(getBreadcrumb('3', nodeMap)).toBe('Clothing > Shirts > T-Shirts');
		});

		it('uses custom separator', () => {
			expect(getBreadcrumb('3', nodeMap, ' / ')).toBe('Clothing / Shirts / T-Shirts');
		});

		it('returns empty string for unknown id', () => {
			expect(getBreadcrumb('999', nodeMap)).toBe('');
		});
	});

	describe('getDescendantIds', () => {
		it('returns all descendants depth-first', () => {
			expect(getDescendantIds('1', nodeMap)).toEqual(['2', '3']);
		});

		it('returns empty array for leaf node', () => {
			expect(getDescendantIds('3', nodeMap)).toEqual([]);
		});

		it('returns empty array for unknown id', () => {
			expect(getDescendantIds('999', nodeMap)).toEqual([]);
		});
	});

	describe('getAncestorIds', () => {
		it('returns all ancestors bottom-up', () => {
			expect(getAncestorIds('3', nodeMap)).toEqual(['2', '1']);
		});

		it('returns empty array for root node', () => {
			expect(getAncestorIds('1', nodeMap)).toEqual([]);
		});

		it('returns empty array for unknown id', () => {
			expect(getAncestorIds('999', nodeMap)).toEqual([]);
		});
	});
});

describe('applyCascadeToggle', () => {
	// A > B > C, D > E
	const flat: HierarchicalOption[] = [
		{ value: '1', label: 'A' },
		{ value: '2', label: 'B', parentId: '1' },
		{ value: '3', label: 'C', parentId: '2' },
		{ value: '4', label: 'D' },
		{ value: '5', label: 'E', parentId: '4' },
	];
	const { nodeMap } = buildTree(flat);
	const toOpt = (id: string) => ({ value: id, label: nodeMap.get(id)!.label });

	it('selecting a parent selects all descendants', () => {
		const result = applyCascadeToggle([], '1', nodeMap);
		const values = result.map((o) => o.value);
		expect(values).toContain('1');
		expect(values).toContain('2');
		expect(values).toContain('3');
	});

	it('deselecting a parent deselects all descendants', () => {
		const current = [toOpt('1'), toOpt('2'), toOpt('3')];
		const result = applyCascadeToggle(current, '1', nodeMap);
		expect(result).toHaveLength(0);
	});

	it('selecting last sibling auto-selects parent (bubble up)', () => {
		const current = [toOpt('3')]; // C selected
		const result = applyCascadeToggle(current, '2', nodeMap); // toggle B on
		const values = result.map((o) => o.value);
		expect(values).toContain('2'); // B selected
		expect(values).toContain('3'); // C stays selected
		// A should be auto-selected: its only direct child B is selected, and B's subtree is fully selected
		expect(values).toContain('1');
	});

	it('deselecting a child deselects ancestors that were fully selected', () => {
		const current = [toOpt('1'), toOpt('2'), toOpt('3')]; // all selected
		const result = applyCascadeToggle(current, '3', nodeMap); // deselect C
		const values = result.map((o) => o.value);
		expect(values).not.toContain('3'); // C removed
		expect(values).not.toContain('2'); // B removed (no longer fully selected subtree)
		expect(values).not.toContain('1'); // A removed (no longer fully selected subtree)
	});

	it('selecting a leaf does not affect unrelated branches', () => {
		const result = applyCascadeToggle([], '5', nodeMap); // select E
		const values = result.map((o) => o.value);
		expect(values).toContain('5');
		expect(values).toContain('4'); // D auto-selected (E is its only child)
		expect(values).not.toContain('1'); // A unaffected
	});
});
