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

test("accepts required auth wiring in a later job", () => {
  const multiJobWorkflow = `
jobs:
  prepare:
    steps:
      - uses: example/prepare@v1
  bump:
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

  assert.doesNotThrow(() => checkBumpSubmodulesWorkflow(multiJobWorkflow));
});

test("rejects multi-job workflows missing auth wiring in every job", () => {
  const multiJobWorkflow = `
jobs:
  prepare:
    steps:
      - uses: example/prepare@v1
  bump:
    steps:
      - uses: example/bump@v1
`;

  assert.throws(
    () => checkBumpSubmodulesWorkflow(multiJobWorkflow),
    /creates a GitHub App token step/,
  );
});

const requiredWiring = [
  [
    "the App token action",
    "    uses: actions/create-github-app-token@v2\n",
    /creates a GitHub App token step/,
  ],
  ["the owner", "      owner: wcpos\n", /targets the wcpos owner/],
  [
    "the repositories scope",
    "      repositories: |\n        monorepo\n",
    /scopes token to monorepo repository/,
  ],
  [
    "the app id",
    "      app-id: ${{ secrets.WCPOS_BOT_APP_ID }}\n",
    /uses the WCPOS bot app id secret/,
  ],
  [
    "the private key",
    "      private-key: ${{ secrets.WCPOS_BOT_PRIVATE_KEY }}\n",
    /uses the WCPOS bot private key secret/,
  ],
  [
    "the checkout token",
    "      token: ${{ steps.app-token.outputs.token }}\n",
    /checks out submodules with the app token/,
  ],
];

for (const [name, requiredText, expectedFailure] of requiredWiring) {
  test(`rejects a workflow missing ${name}`, () => {
    const incompleteWorkflow = validWorkflow.replace(requiredText, "");

    assert.throws(
      () => checkBumpSubmodulesWorkflow(incompleteWorkflow),
      expectedFailure,
    );
  });
}

test("rejects a workflow without an actions/checkout step", () => {
  const withoutCheckout = validWorkflow.replace(
    "  - uses: actions/checkout@v4\n",
    "  - name: Not checkout\n",
  );

  assert.throws(
    () => checkBumpSubmodulesWorkflow(withoutCheckout),
    /finds the actions\/checkout step/,
  );
});

test("rejects the app token reference in an unrelated step", () => {
  const misplacedToken = validWorkflow
    .replace("      token: ${{ steps.app-token.outputs.token }}\n", "")
    .concat(`
  - uses: example/unrelated-action@v1
    with:
      token: \${{ steps.app-token.outputs.token }}
`);

  assert.throws(
    () => checkBumpSubmodulesWorkflow(misplacedToken),
    /checks out submodules with the app token/,
  );
});

test("rejects a required value that appears only in a comment", () => {
  const commentedOwner = validWorkflow.replace(
    "      owner: wcpos\n",
    "      # owner: wcpos\n",
  );

  assert.throws(
    () => checkBumpSubmodulesWorkflow(commentedOwner),
    /targets the wcpos owner/,
  );
});
