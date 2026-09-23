import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('text-foreground border-border bg-card h-ctl');
	expect(source).toContain('opacity-45');
	expect(source).not.toContain('web:focus:ring');
	expect(source).not.toContain('ring-offset');
});

it('uses the overlay-tier rows in index.tsx', () => {
	const content = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');
	expect(content).not.toMatch(/web:group|bg-popover|accent|PhoneSheetShell/);
	expect(content).toContain('min-h-row');
});

it('uses the overlay-tier rows in select-multi.tsx', () => {
	const content = fs.readFileSync(path.join(__dirname, 'select-multi.tsx'), 'utf8');
	expect(content).not.toMatch(/web:group|bg-popover|accent|PhoneSheetShell/);
	expect(content).toContain('min-h-row');
});
