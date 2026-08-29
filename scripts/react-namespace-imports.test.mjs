import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('CodePanel uses the required React namespace import', () => {
	const filename = path.join(ROOT, 'apps', 'template-studio', 'src', 'components', 'CodePanel.tsx');
	const source = ts.createSourceFile(
		filename,
		readFileSync(filename, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX
	);
	const reactImport = source.statements.find(
		(statement) => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === 'react'
	);

	assert.ok(
		reactImport?.importClause?.namedBindings &&
			ts.isNamespaceImport(reactImport.importClause.namedBindings),
		'CodePanel must import React as a namespace so hooks use the repository convention'
	);
});
