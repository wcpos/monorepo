import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scriptSource = readFileSync(new URL('./check-bump-submodules-workflow.mjs', import.meta.url), 'utf8');

const requiredChecks = [
  {
    description: 'targets the wcpos owner',
    patternSource: 'owner:\\s*wcpos',
  },
  {
    description: 'scopes token to monorepo repository',
    patternSource: 'repositories:\\s*\\|[\\s\\S]*?\\n\\s*monorepo\\s*$',
  },
  {
    description: 'scopes token to wiki repository',
    patternSource: 'repositories:\\s*\\|[\\s\\S]*?\\n\\s*wiki\\s*$',
  },
];

test('workflow guard asserts owner and repository scope for private submodule access', () => {
  for (const { description, patternSource } of requiredChecks) {
    assert.match(scriptSource, new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(scriptSource, new RegExp(patternSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
