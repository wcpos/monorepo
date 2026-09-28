import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('border-border bg-card h-ctl');
	expect(source).toContain('border-ring web:ring-1 web:ring-ring');
	expect(source).toContain('opacity-45');
	expect(source).not.toContain('focus-visible');
	expect(source).not.toContain('bg-input');
});
