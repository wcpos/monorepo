import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('--text-base');
	expect(source).toContain('--text-xs');
	expect(source).toContain('--spacing');
	expect(source).not.toContain('Platform');
});
