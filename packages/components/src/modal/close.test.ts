import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('closes with the borderless, muted 44 pt icon button, overriding ModalClose’s outline', () => {
	expect(source).toContain('<IconButton name="xmark" variant="default" />');
});

it('counts the status bar once for a full-size modal: its card-coloured scrim pads it, the panel adds 8', () => {
	// The host (the POS root) no longer pads insets.top (ledger line 17), so the scrim does.
	expect(source).toContain('paddingTop: insets.top,');
	expect(source).not.toContain('paddingTop: fill ? 0 : insets.top');
	expect(source).toContain("'bg-card items-stretch justify-start p-0'");
	expect(source).toContain('border-0 py-2 shadow-none');
});
