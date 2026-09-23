import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('h-5 w-8.5');
	expect(source).toContain('size-4');
	expect(source).toContain('bg-card');
	expect(source).toContain('bg-border');
	expect(source).toContain('CROSSFADE');
	expect(source).not.toContain('focus-visible');
	expect(source).not.toContain('getTranslateX');
	expect(source).not.toContain('px-px');
});
