import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('text-foreground border-border bg-card h-ctl');
	expect(source).toContain('opacity-45');
	expect(source).not.toContain('web:focus:ring');
	expect(source).not.toContain('ring-offset');
});
