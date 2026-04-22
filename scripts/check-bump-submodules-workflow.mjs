import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/bump-submodules.yml', import.meta.url), 'utf8');

const checks = [
  {
    description: 'creates a GitHub App token step',
    pattern: /uses:\s*actions\/create-github-app-token@/m,
  },
  {
    description: 'uses the WCPOS bot app id secret',
    pattern: /app-id:\s*\$\{\{\s*secrets\.WCPOS_BOT_APP_ID\s*\}\}/m,
  },
  {
    description: 'uses the WCPOS bot private key secret',
    pattern: /private-key:\s*\$\{\{\s*secrets\.WCPOS_BOT_PRIVATE_KEY\s*\}\}/m,
  },
  {
    description: 'checks out submodules with the app token',
    pattern: /token:\s*\$\{\{\s*steps\.app-token\.outputs\.token\s*\}\}/m,
  },
];

const failures = checks.filter(({ pattern }) => !pattern.test(workflow));

if (failures.length > 0) {
  console.error('bump-submodules workflow is missing required private-submodule auth wiring:');
  for (const failure of failures) {
    console.error(`- ${failure.description}`);
  }
  process.exit(1);
}

console.log('bump-submodules workflow has GitHub App auth wiring for private submodules.');
