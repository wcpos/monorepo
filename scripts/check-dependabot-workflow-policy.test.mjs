import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const testWorkflow = readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
const deployWorkflow = readFileSync(
  new URL('../.github/workflows/deploy.yml', import.meta.url),
  'utf8'
);

// GitHub Actions expressions only execute on the hosted runner, so pin the
// workflow policy itself: repair commits must not change a PR's Dependabot identity.
test('test jobs identify Dependabot from the pull request author', () => {
  const authorChecks = testWorkflow.match(
    /github\.event\.pull_request\.user\.login == 'dependabot\[bot\]'/g
  );

  assert.equal(authorChecks?.length, 2);
});

test('preview deploys stay disabled for Dependabot-authored pull requests', () => {
  assert.match(
    deployWorkflow,
    /github\.event\.pull_request\.user\.login != 'dependabot\[bot\]'/
  );
});

test('deployment summaries stay disabled for Dependabot-authored pull requests', () => {
  const authorChecks = deployWorkflow.match(
    /github\.event\.pull_request\.user\.login != 'dependabot\[bot\]'/g
  );

  assert.equal(authorChecks?.length, 2);
});

test('test and deploy policies do not use the event actor as PR identity', () => {
  assert.doesNotMatch(`${testWorkflow}\n${deployWorkflow}`, /github\.actor.*dependabot/);
});
