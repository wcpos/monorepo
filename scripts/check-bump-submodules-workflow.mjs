import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const checks = [
  {
    description: "creates a GitHub App token step",
    pattern: /uses:\s*actions\/create-github-app-token@/m,
  },
  {
    description: "targets the wcpos owner",
    pattern: /owner:\s*wcpos/m,
  },
  {
    description: "scopes token to monorepo repository",
    pattern: /repositories:\s*\|[\s\S]*?\n\s*monorepo\s*$/m,
  },
  {
    description: "uses the WCPOS bot app id secret",
    pattern: /app-id:\s*\$\{\{\s*secrets\.WCPOS_BOT_APP_ID\s*\}\}/m,
  },
  {
    description: "uses the WCPOS bot private key secret",
    pattern: /private-key:\s*\$\{\{\s*secrets\.WCPOS_BOT_PRIVATE_KEY\s*\}\}/m,
  },
  {
    description: "checks out submodules with the app token",
    pattern: /token:\s*\$\{\{\s*steps\.app-token\.outputs\.token\s*\}\}/m,
  },
];

export function checkBumpSubmodulesWorkflow(workflow) {
  const failures = checks.filter(({ pattern }) => !pattern.test(workflow));

  if (failures.length > 0) {
    throw new Error(
      "bump-submodules workflow is missing required GitHub App auth wiring:\n" +
        failures.map(({ description }) => `- ${description}`).join("\n"),
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
