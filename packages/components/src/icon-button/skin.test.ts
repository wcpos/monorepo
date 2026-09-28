import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('size-ctl');
	expect(source).toContain('rounded-lg');
	expect(source).toContain('active:bg-muted');
	expect(source).toContain('size-8');
	expect(source).not.toContain('focus-visible');
});
