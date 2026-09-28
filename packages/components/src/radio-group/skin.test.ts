import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('size-5');
	expect(source).toContain('size-2.5');
	expect(source).toContain('border-border bg-card');
	expect(source).toContain('opacity-45');
	expect(source).not.toContain('grid');
	expect(source).not.toContain('focus-visible');
});
