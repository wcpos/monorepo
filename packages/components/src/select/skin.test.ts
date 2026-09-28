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

it('dismisses the multi-select sheet through the popover root, not the mirror context', () => {
	// The root owns the open state; closing only the mirror leaves the popover open and the
	// trigger's next press closes it instead of reopening (CodeRabbit on #2212).
	const content = fs.readFileSync(path.join(__dirname, 'select-multi.tsx'), 'utf8');
	expect(content).toMatch(/const \{ open, onOpenChange \} = PopoverPrimitive\.useRootContext\(\)/);
	expect(content).not.toMatch(/context\.onOpenChange\(false\)/);
	expect(content).toMatch(/onDismiss=\{phone \? \(\) => onOpenChange\(false\) : undefined\}/);
});
