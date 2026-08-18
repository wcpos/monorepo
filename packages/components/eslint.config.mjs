import { config } from "../eslint/index.js";

// Shared config paths are repo-root-relative, but this workspace runs ESLint
// from packages/components. Rebase its package-specific override locally.
export default config.map((entry) =>
  entry.files?.includes("**/packages/components/**/*.{js,jsx,ts,tsx}")
    ? { ...entry, files: ["**/*.{js,jsx,ts,tsx}"] }
    : entry,
);
