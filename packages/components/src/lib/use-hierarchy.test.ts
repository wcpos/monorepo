import { buildTree } from './use-hierarchy';

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
