import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('size-5');
	expect(source).toContain('bg-primary border-primary');
	expect(source).toContain('hitSlop={12}');
	expect(source).not.toContain('native:h-[');
	expect(source).not.toContain('focus-visible');
});
