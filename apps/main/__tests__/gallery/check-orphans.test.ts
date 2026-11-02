import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Match the source-only app tests: clear Expo's lazy native runtime after setup.
jest.resetModules();

const SCRIPT = join(__dirname, '..', '..', 'gallery', 'check-orphans.mjs');

let root: string;
let shots: string;
let snapshots: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'gallery-orphans-'));
	shots = join(root, '.shots');
	snapshots = join(root, 'gallery.spec.ts-snapshots');
	mkdirSync(shots);
	mkdirSync(snapshots);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const list = (component: string, names: string[]) =>
	writeFileSync(join(shots, `${component}.json`), JSON.stringify(names));
const png = (...names: string[]) => {
	for (const name of names) writeFileSync(join(snapshots, name), '');
};
const run = () => spawnSync(process.execPath, [SCRIPT, shots, snapshots], { encoding: 'utf8' });

it('passes when the union of every shard’s shot lists is the baseline set', () => {
	list('button', ['button-a-light-linux.png', 'button-a-dark-linux.png']);
	list('chip', ['chip-a-light-linux.png']);
	png('button-a-light-linux.png', 'button-a-dark-linux.png', 'chip-a-light-linux.png');
	const result = run();
	expect(result.stderr).toBe('');
	expect(result.status).toBe(0);
	expect(result.stdout).toContain('3 cells from 2 components');
});

it('fails on a PNG no test shot, naming it', () => {
	list('button', ['button-a-light-linux.png']);
	png('button-a-light-linux.png', 'gone-a-light-linux.png');
	const result = run();
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('Orphaned baselines');
	expect(result.stderr).toContain('gone-a-light-linux.png');
});

it('fails on a shot with no PNG, naming it', () => {
	list('button', ['button-a-light-linux.png', 'button-b-light-linux.png']);
	png('button-a-light-linux.png');
	const result = run();
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('Missing baselines');
	expect(result.stderr).toContain('button-b-light-linux.png');
});

it('fails when a shard’s list never arrived, so its PNGs read as orphans', () => {
	list('button', ['button-a-light-linux.png']);
	png('button-a-light-linux.png', 'chip-a-light-linux.png');
	expect(run().stderr).toContain('chip-a-light-linux.png');
});

it('fails with no shot lists at all rather than passing an empty union', () => {
	png('button-a-light-linux.png');
	const result = run();
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('No shot lists');
});
