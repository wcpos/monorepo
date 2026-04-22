import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scriptSource = readFileSync(new URL('./check-bump-submodules-workflow.mjs', import.meta.url), 'utf8');

const requiredChecks = [
  {
    description: 'targets the wcpos owner',
    patternSource: 'pattern: /owner:\\s*wcpos/m',
  },
  {
    description: 'scopes token to monorepo repository',
    patternSource: 'pattern: /repositories:\\s*\\|[\\s\\S]*?\\n\\s*monorepo\\s*$/m',
  },
  {
    description: 'scopes token to wiki repository',
    patternSource: 'pattern: /repositories:\\s*\\|[\\s\\S]*?\\n\\s*wiki\\s*$/m',
  },
  {
    description: 'uses the WCPOS bot app id secret',
    patternSource: 'pattern: /app-id:\\s*\\$\\{\\{\\s*secrets\\.WCPOS_BOT_APP_ID\\s*\\}\\}/m',
  },
  {
    description: 'uses the WCPOS bot private key secret',
    patternSource: 'pattern: /private-key:\\s*\\$\\{\\{\\s*secrets\\.WCPOS_BOT_PRIVATE_KEY\\s*\\}\\}/m',
  },
  {
    description: 'checks out submodules with the app token',
    patternSource: 'pattern: /token:\\s*\\$\\{\\{\\s*steps\\.app-token\\.outputs\\.token\\s*\\}\\}/m',
  },
];

test('workflow guard asserts all required private-submodule auth invariants', () => {
  for (const { description, patternSource } of requiredChecks) {
    assert.ok(scriptSource.includes(description), `missing description: ${description}`);
    assert.ok(scriptSource.includes(patternSource), `missing pattern source: ${patternSource}`);
  }
});
