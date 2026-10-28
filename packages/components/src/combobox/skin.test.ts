import * as fs from 'fs';
import * as path from 'path';

it('uses the overlay-tier rows in combobox.tsx', () => {
	const content = fs.readFileSync(path.join(__dirname, 'combobox.tsx'), 'utf8');
	expect(content).not.toMatch(/web:group|bg-popover|accent|PhoneSheetShell/);
	expect(content).toContain('min-h-row');
});
