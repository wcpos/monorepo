import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('bg-card border-primary block size-5');
	expect(source).toContain('hitSlop={12}');
	expect(source).toContain('opacity-45');
});
