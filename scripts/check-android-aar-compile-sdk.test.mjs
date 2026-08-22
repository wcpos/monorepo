import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ANDROID_COMPILE_SDK,
  findAarFiles,
  parseMinCompileSdk,
  readZipEntry,
} from './check-android-aar-compile-sdk.mjs';

/**
 * Minimal zip writer — one entry, so the tests exercise the real central
 * directory walk rather than a stub. `compress` toggles stored vs deflated,
 * the two methods an .aar uses.
 */
function makeZip(entryName, contents, { compress = true } = {}) {
  const name = Buffer.from(entryName, 'utf8');
  const raw = Buffer.from(contents, 'utf8');
  const data = compress ? deflateRawSync(raw) : raw;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(compress ? 8 : 0, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(compress ? 8 : 0, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);

  const localBlock = Buffer.concat([local, name, data]);
  const centralBlock = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

const METADATA_ENTRY = 'META-INF/com/android/build/gradle/aar-metadata.properties';
const METADATA_BODY = 'aarFormatVersion=1.0\nminCompileSdk=37\nminCompileSdkExtension=0\n';

test('reads a deflated zip entry', () => {
  const zip = makeZip(METADATA_ENTRY, METADATA_BODY);
  assert.equal(readZipEntry(zip, METADATA_ENTRY), METADATA_BODY);
});

test('reads a stored (uncompressed) zip entry', () => {
  const zip = makeZip(METADATA_ENTRY, METADATA_BODY, { compress: false });
  assert.equal(readZipEntry(zip, METADATA_ENTRY), METADATA_BODY);
});

test('returns null for an entry the archive does not contain', () => {
  const zip = makeZip('classes.jar', 'not metadata');
  assert.equal(readZipEntry(zip, METADATA_ENTRY), null);
});

test('parses minCompileSdk out of the properties body', () => {
  assert.equal(parseMinCompileSdk(METADATA_BODY), 37);
  assert.equal(parseMinCompileSdk('minCompileSdk=1\n'), 1);
});

test('returns null when the properties body declares no minCompileSdk', () => {
  assert.equal(parseMinCompileSdk('aarFormatVersion=1.0\n'), null);
  // minCompileSdkExtension must not be mistaken for the requirement itself.
  assert.equal(parseMinCompileSdk('minCompileSdkExtension=0\n'), null);
});

test('finds an .aar nested under android/src/lib — where star-io10 ships it', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aar-check-'));
  const libDir = path.join(root, 'android/src/lib');
  mkdirSync(libDir, { recursive: true });
  writeFileSync(path.join(libDir, 'stario10.aar'), makeZip(METADATA_ENTRY, METADATA_BODY));

  const found = findAarFiles(root);
  assert.equal(found.length, 1);
  assert.equal(path.basename(found[0]), 'stario10.aar');
});

test('does not walk into a nested node_modules', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aar-check-'));
  const nested = path.join(root, 'node_modules/other/android');
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, 'other.aar'), makeZip(METADATA_ENTRY, METADATA_BODY));

  assert.deepEqual(findAarFiles(root), []);
});

test('the tracked compileSdk matches what Expo SDK 57 (AGP 8.12) supports', () => {
  // Guards against a silent bump: raising this constant is only correct
  // alongside an Expo/AGP upgrade, and this line has to move with it.
  assert.equal(ANDROID_COMPILE_SDK, 36);
});
