import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appTokenChecks = [
  {
    description: "targets the wcpos owner",
    pattern: /^\s*owner:\s*wcpos\s*$/m,
  },
  {
    description: "scopes token to monorepo repository",
    pattern: /^\s*repositories:\s*\|[\s\S]*?\n\s*monorepo\s*$/m,
  },
  {
    description: "uses the WCPOS bot app id secret",
    pattern: /^\s*app-id:\s*\$\{\{\s*secrets\.WCPOS_BOT_APP_ID\s*\}\}\s*$/m,
  },
  {
    description: "uses the WCPOS bot private key secret",
    pattern:
      /^\s*private-key:\s*\$\{\{\s*secrets\.WCPOS_BOT_PRIVATE_KEY\s*\}\}\s*$/m,
  },
];

const actionStepPattern =
  /^\s*(?:-\s*)?uses:\s*actions\/create-github-app-token@/m;
const checkoutStepPattern = /^\s*(?:-\s*)?uses:\s*actions\/checkout@/m;
const checkoutTokenPattern =
  /^\s*token:\s*\$\{\{\s*steps\.app-token\.outputs\.token\s*\}\}\s*$/m;

function getStepBlocks(workflow) {
  const lines = workflow
    .split("\n")
    .map((line) => line.replace(/#.*$/, ""));
  const stepsIndex = lines.findIndex((line) => /^\s*steps:\s*$/.test(line));

  if (stepsIndex === -1) return [];

  const stepsIndent = lines[stepsIndex].search(/\S/);
  const blocks = [];
  let stepIndent;
  let currentBlock = [];

  for (const line of lines.slice(stepsIndex + 1)) {
    const indent = line.search(/\S/);
    if (indent !== -1 && indent <= stepsIndent) break;

    const bullet = line.match(/^(\s*)-\s+/);
    if (bullet && stepIndent === undefined) stepIndent = bullet[1].length;

    if (bullet && bullet[1].length === stepIndent) {
      if (currentBlock.length > 0) blocks.push(currentBlock.join("\n"));
      currentBlock = [line];
    } else if (currentBlock.length > 0) {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) blocks.push(currentBlock.join("\n"));
  return blocks;
}

export function checkBumpSubmodulesWorkflow(workflow) {
  const stepBlocks = getStepBlocks(workflow);
  const appTokenStep = stepBlocks.find((step) => actionStepPattern.test(step));
  const checkoutStep = stepBlocks.find((step) => checkoutStepPattern.test(step));
  const failures = [];

  if (!appTokenStep) {
    failures.push("creates a GitHub App token step");
  } else {
    failures.push(
      ...appTokenChecks
        .filter(({ pattern }) => !pattern.test(appTokenStep))
        .map(({ description }) => description),
    );
  }

  if (!checkoutStep) {
    failures.push("finds the actions/checkout step");
  } else if (!checkoutTokenPattern.test(checkoutStep)) {
    failures.push("checks out submodules with the app token");
  }

  if (failures.length > 0) {
    throw new Error(
      "bump-submodules workflow is missing required GitHub App auth wiring:\n" +
        failures.map((description) => `- ${description}`).join("\n"),
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const workflow = readFileSync(
      new URL("../.github/workflows/bump-submodules.yml", import.meta.url),
      "utf8",
    );
    checkBumpSubmodulesWorkflow(workflow);
    console.log(
      "bump-submodules workflow has the required GitHub App auth wiring.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
