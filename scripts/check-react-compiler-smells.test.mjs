import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { auditReactCompiler, SMELL_REASONS } from './check-react-compiler-smells.mjs';

const temporaryDirectories = [];

/** A fake package tree: { 'src/<name>.tsx': source }. Returns its root. */
function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), 'wcpos-react-compiler-smells-'));
	temporaryDirectories.push(root);
	for (const [name, contents] of Object.entries(files)) {
		const full = path.join(root, name);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, contents);
	}
	return root;
}

after(() => {
	for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

const CLEAN = `
import * as React from 'react';
export function Clean({ items }: { items: string[] }) {
	const upper = items.map((item) => item.toUpperCase());
	return <ul>{upper.map((item) => <li key={item}>{item}</li>)}</ul>;
}
`;

// Mutates state during render: the compiler refuses ("This value cannot be modified").
const MUTATES_PROP = `
import * as React from 'react';
export function MutatesState() {
	const [state] = React.useState({ n: 0 });
	state.n = 1;
	return <span>{state.n}</span>;
}
`;

// Hand-written memo whose dependency list omits state the memoised closure reads
// ("Existing memoization could not be preserved"): the classic stale closure.
const STALE_MEMO = `
import * as React from 'react';
export function StaleMemo() {
	const [n, setN] = React.useState(0);
	const get = React.useMemo(() => () => n, []);
	return <button onClick={() => setN(get() + 1)}>{n}</button>;
}
`;

// A compiler limitation, not a rules violation: try/finally inside the component.
const TRY_FINALLY = `
import * as React from 'react';
export function TryFinally({ run }: { run: () => void }) {
	const onPress = () => {
		try {
			run();
		} finally {
			console.log('done');
		}
	};
	return <button onClick={onPress}>go</button>;
}
`;

describe('auditReactCompiler', () => {
	it('compiles a clean component and reports nothing', () => {
		const root = fixture({ 'src/clean.tsx': CLEAN });
		const result = auditReactCompiler(['src'], root);
		assert.equal(result.compiled, 1);
		assert.deepEqual(result.smells, []);
		assert.equal(result.todos.size, 0);
	});

	it('classifies a state mutation and a stale manual memo as smells, with file and line', () => {
		const root = fixture({ 'src/mutates.tsx': MUTATES_PROP, 'src/stale.tsx': STALE_MEMO });
		const { smells } = auditReactCompiler(['src'], root);
		const byFile = Object.fromEntries(smells.map((s) => [s.file, s]));

		assert.ok(byFile['src/mutates.tsx'], 'state mutation is reported');
		assert.ok(byFile['src/mutates.tsx'].reason.startsWith('This value cannot be modified'));
		assert.equal(byFile['src/mutates.tsx'].line, 5);

		assert.ok(byFile['src/stale.tsx'], 'stale manual memo is reported');
		assert.ok(
			byFile['src/stale.tsx'].reason.startsWith('Existing memoization could not be preserved')
		);
		assert.equal(byFile['src/stale.tsx'].line, 5);

		for (const s of smells) {
			assert.ok(
				SMELL_REASONS.some((prefix) => s.reason.startsWith(prefix)),
				`every reported smell matches SMELL_REASONS: ${s.reason}`
			);
		}
	});

	it('files a try/finally skip under the informational todos, not the smells', () => {
		const root = fixture({ 'src/try-finally.tsx': TRY_FINALLY });
		const { smells, todos } = auditReactCompiler(['src'], root);
		assert.deepEqual(smells, []);
		assert.equal(todos.size, 1);
		const [reason, count] = [...todos.entries()][0];
		assert.match(reason, /TryStatement/);
		assert.equal(count, 1);
	});

	it('skips test files and __mocks__', () => {
		const root = fixture({
			'src/mutates.test.tsx': MUTATES_PROP,
			'src/__mocks__/mutates.tsx': MUTATES_PROP,
			'src/clean.tsx': CLEAN,
		});
		const { compiled, smells } = auditReactCompiler(['src'], root);
		assert.equal(compiled, 1);
		assert.deepEqual(smells, []);
	});
});
