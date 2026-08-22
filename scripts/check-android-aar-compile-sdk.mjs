#!/usr/bin/env node
/**
 * Android AAR compileSdk tripwire.
 *
 * react-native-star-io10 1.13.0 shipped a bundled `stario10.aar` whose AAR
 * metadata declares `minCompileSdk=37`. Nothing local noticed: the caret range
 * floated the version in during a routine dep sweep, every JS test stayed
 * green, and the failure only surfaced minutes into a cloud EAS build as
 * `:app:checkDebugAarMetadata` refusing to compile against android-36
 * (2026-08-22).
 *
 * A prebuilt .aar can demand a newer compileSdk than the Expo-pinned Android
 * Gradle Plugin supports, and no amount of app configuration fixes it — the
 * dependency has to be held back until Expo ships a newer AGP. This check
 * reads that requirement straight out of every .aar a direct apps/main
 * dependency bundles and fails before the build minutes are spent.
 *
 * Needs `pnpm install` to have run. With no root node_modules at all it skips
 * (exit 0) so a lockfile-only checkout is safe; with dependencies installed but
 * no .aar found anywhere it FAILS, because that is what a check silently
 * scanning nothing looks like.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The compileSdk the Android build actually uses. Expo SDK 57 ships Android
 * Gradle Plugin 8.12, whose maximum supported compileSdk is 36 — the app does
 * not set it, so this tracks the Expo default rather than a repo value. Bump
 * it when an Expo upgrade raises the prescribed AGP/compileSdk pair.
 */
export const ANDROID_COMPILE_SDK = 36;

const AAR_METADATA_ENTRY = 'META-INF/com/android/build/gradle/aar-metadata.properties';

/**
 * Directories never walked while hunting for bundled .aar files. Deliberately
 * short: `src` is NOT skipped — react-native-star-io10 ships its .aar at
 * android/src/lib/, which is exactly the file this check exists for.
 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'ios', 'windows', 'example']);

/** Depth limit for the .aar walk — Star ships at android/src/lib/, RN libs are shallower. */
const MAX_DEPTH = 6;

/**
 * Read one entry out of a zip (an .aar is a zip) without a dependency.
 * Returns the entry's bytes as a string, or null when the entry is absent.
 */
export function readZipEntry(zipBuffer, entryName) {
  // End of central directory record: signature 0x06054b50, scanned backwards
  // because the trailing comment is variable length.
  let eocd = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;

  const entryCount = zipBuffer.readUInt16LE(eocd + 10);
  let offset = zipBuffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (zipBuffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const nameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const localOffset = zipBuffer.readUInt32LE(offset + 42);
    const name = zipBuffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (name === entryName) {
      // Local file header: name/extra lengths differ from the central copy.
      const localNameLength = zipBuffer.readUInt16LE(localOffset + 26);
      const localExtraLength = zipBuffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = zipBuffer.subarray(dataStart, dataStart + compressedSize);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

/** Pull `minCompileSdk` out of an aar-metadata.properties body. Null when absent. */
export function parseMinCompileSdk(propertiesText) {
  const match = propertiesText.match(/^\s*minCompileSdk\s*=\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : null;
}

/** Every .aar file under `dir`, depth-bounded, skipping vendor/platform noise. */
export function findAarFiles(dir, depth = 0) {
  if (depth > MAX_DEPTH || !existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      found.push(...findAarFiles(full, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith('.aar')) {
      found.push(full);
    }
  }
  return found;
}

/** Where pnpm may have put a dependency of apps/main. First hit wins. */
function resolvePackageDir(name) {
  const candidates = [
    path.join(repoRoot, 'apps/main/node_modules', name),
    path.join(repoRoot, 'node_modules', name),
  ];
  return candidates.find((dir) => existsSync(path.join(dir, 'package.json'))) ?? null;
}

function main() {
  if (!existsSync(path.join(repoRoot, 'node_modules'))) {
    console.log('check-android-aar-compile-sdk: dependencies not installed, skipping.');
    return;
  }

  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, 'apps/main/package.json'), 'utf8')
  );
  const deps = Object.keys(manifest.dependencies ?? {});

  const violations = [];
  let uninstalled = 0;
  let scanned = 0;

  for (const name of deps) {
    const dir = resolvePackageDir(name);
    if (!dir) {
      uninstalled++;
      continue;
    }
    for (const aar of findAarFiles(dir)) {
      const properties = readZipEntry(readFileSync(aar), AAR_METADATA_ENTRY);
      if (!properties) continue;
      scanned++;
      const minCompileSdk = parseMinCompileSdk(properties);
      if (minCompileSdk !== null && minCompileSdk > ANDROID_COMPILE_SDK) {
        violations.push({
          name,
          aar: path.relative(repoRoot, aar),
          minCompileSdk,
          version: JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version,
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `check-android-aar-compile-sdk: ${violations.length} bundled .aar file(s) require a newer compileSdk than the Android build uses (${ANDROID_COMPILE_SDK}).\n`
    );
    for (const v of violations) {
      console.error(`  ${v.name}@${v.version} — ${v.aar} requires compileSdk ${v.minCompileSdk}`);
    }
    console.error(
      '\nThe Android build will fail at :app:checkDebugAarMetadata. Hold the dependency at the last' +
        '\nversion whose .aar fits (pin it in the package manifest AND pnpm-workspace.yaml overrides),' +
        '\nor raise ANDROID_COMPILE_SDK here once Expo ships an AGP that supports the newer API.'
    );
    process.exit(1);
  }

  if (scanned === 0) {
    console.error(
      'check-android-aar-compile-sdk: found no bundled .aar metadata under any apps/main dependency.\n' +
        'react-native-star-io10 and react-native-esc-pos-printer both ship one, so zero means this check\n' +
        'scanned nothing — a partial install, or a walk that no longer reaches android/src/lib.' +
        (uninstalled > 0 ? ` (${uninstalled} of ${deps.length} dependencies are not installed.)` : '')
    );
    process.exit(1);
  }

  const skipped = uninstalled > 0 ? ` (${uninstalled} dependencies not installed, skipped)` : '';
  console.log(
    `check-android-aar-compile-sdk: ${scanned} bundled .aar file(s) fit compileSdk ${ANDROID_COMPILE_SDK}${skipped}.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
