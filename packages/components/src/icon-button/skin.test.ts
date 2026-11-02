import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('size-ctl');
	expect(source).toContain('rounded-lg');
	expect(source).toContain('active:bg-accent');
	expect(source).toContain('size-8');
	expect(source).not.toContain('focus-visible');
});

it('gives the muted variant the default hover tint, not a near-invisible fraction of it', () => {
	expect(source).toContain("muted: 'web:hover:bg-accent active:bg-accent'");
	expect(source).not.toContain('bg-muted/15');
});
