import test from "node:test";
import assert from "node:assert/strict";

import { checkBumpSubmodulesWorkflow } from "./check-bump-submodules-workflow.mjs";

const validWorkflow = `
steps:
  - id: app-token
    uses: actions/create-github-app-token@v2
    with:
      owner: wcpos
      repositories: |
        monorepo
      app-id: \${{ secrets.WCPOS_BOT_APP_ID }}
      private-key: \${{ secrets.WCPOS_BOT_PRIVATE_KEY }}
  - uses: actions/checkout@v4
    with:
      token: \${{ steps.app-token.outputs.token }}
`;

test("accepts a workflow with the required GitHub App auth wiring", () => {
  assert.doesNotThrow(() => checkBumpSubmodulesWorkflow(validWorkflow));
});

test("rejects a workflow missing required GitHub App auth wiring", () => {
  const withoutPrivateKey = validWorkflow.replace(
    "      private-key: ${{ secrets.WCPOS_BOT_PRIVATE_KEY }}\n",
    "",
  );

  assert.throws(
    () => checkBumpSubmodulesWorkflow(withoutPrivateKey),
    /uses the WCPOS bot private key secret/,
  );
});
