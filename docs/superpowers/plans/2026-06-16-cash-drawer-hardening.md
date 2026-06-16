# Cash Drawer Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining implementation work from wcpos/monorepo#601 after PRs #600 and #603 by making drawer connector selection configurable, carrying drawer settings through order-based cloud jobs, improving no-sale reliability, and adding language/emulation safeguards.

**Architecture:** Keep drawer semantics in printer profiles and renderer options, then thread them through the existing profile-building, print-service, renderer, raster, and cloud-enqueue boundaries. Split the work into independent PRs so hardware-dependent verification can land separately from pure client/server payload work.

**Tech Stack:** React Native + Expo + Electron, TypeScript, RxDB schema migrations, `@point-of-sale/receipt-printer-encoder`, Vitest, WCPOS REST client, printer transports in `packages/printer`.

---

## PR/Task breakdown

1. **PR A — drawer connector selection**: add `drawerConnector: 'pin2' | 'pin5'` to profiles and renderer options; default pin 2; make `<drawer connector="pin5" />` possible; UI selector appears only when auto-open drawer is enabled.
2. **PR B — order-based cloud payloads**: thread `autoOpenDrawer` and `drawerConnector` through `CloudPrintJob.kind === 'order'` and `/print-jobs` requests so server work in wcpos/woocommerce-pos#1169 has data to consume.
3. **PR C — dedicated no-sale realtime kick**: add an ESC/POS real-time drawer kick option for the Add/Edit dialog button while retaining the buffered template path for Star and non-ESC/POS languages.
4. **PR D — connection drain audit**: improve/verify network tail handling and document device-adapter constraints; add tests around TCP socket ordering.
5. **PR E — language/emulation guard + test-print drawer check**: warn when Star vendor/language settings are likely mismatched and optionally fire drawer on Test Print when `autoOpenDrawer` is enabled.
6. **Hardware verification issue/notes**: keep real Star SDK fallback and Sunmi/iMin SDK support as separate hardware-backed follow-ups unless failures are reproduced.

---

## PR A: Drawer connector selection

### Files

- Modify: `packages/printer/src/types.ts`
- Modify: `packages/receipt-renderer/src/types.ts`
- Modify: `packages/receipt-renderer/src/parse-xml.ts`
- Modify: `packages/receipt-renderer/src/render-escpos.ts`
- Modify: `packages/receipt-renderer/src/__tests__/parse-xml.test.ts`
- Modify: `packages/receipt-renderer/src/__tests__/render-escpos-drawer.test.ts`
- Modify: `packages/printer/src/encoder/__tests__/drawer-auto-open.test.ts`
- Modify: `packages/printer/src/printer-service.ts`
- Modify: `packages/printer/src/hooks/use-print.ts`
- Modify: `packages/printer/src/raster/receipt-rasterizer.dom.tsx`
- Modify: `packages/database/src/collections/schemas/printer-profiles.ts`
- Modify: `packages/database/src/collections/index.ts`
- Modify: `packages/database/src/collections/printer-profiles.test.ts`
- Modify: `packages/core/src/screens/main/settings/printer/schema.ts`
- Modify: `packages/core/src/screens/main/settings/printer/profile-config.ts`
- Modify: `packages/core/src/screens/main/settings/printer/profile-config.test.ts`
- Modify: `packages/core/src/screens/main/settings/printer/printer-profile.ts`
- Modify: `packages/core/src/screens/main/settings/printer/dialog/use-printer-dialog-form.ts`
- Modify: `packages/core/src/screens/main/settings/printer/dialog/advanced-settings.tsx`
- Create: `packages/core/src/screens/main/settings/printer/dialog/drawer-connector-field.tsx`

### Data model

Use a string union instead of a numeric encoder device so the UI and persisted JSON stay self-describing:

```ts
export type DrawerConnector = 'pin2' | 'pin5';
```

Map it at the renderer boundary:

```ts
function drawerConnectorToDevice(connector: DrawerConnector | undefined): 0 | 1 {
	return connector === 'pin5' ? 1 : 0;
}
```

### Task A1: Receipt renderer supports connector on explicit and auto drawer pulses

- [ ] **Step 1: Write failing parser test**

Add to `packages/receipt-renderer/src/__tests__/parse-xml.test.ts`:

```ts
it('parses drawer connector attribute', () => {
	const ast = parseXml('<receipt><drawer connector="pin5" /></receipt>');
	expect(ast.children[0]).toEqual({ type: 'drawer', connector: 'pin5' });
});
```

Run:

```bash
cd packages/receipt-renderer && ../../node_modules/.bin/vitest run src/__tests__/parse-xml.test.ts -t 'drawer connector'
```

Expected: fail because parsed drawer nodes do not include `connector`.

- [ ] **Step 2: Add AST type support**

In `packages/receipt-renderer/src/types.ts`, define and use:

```ts
export type DrawerConnector = 'pin2' | 'pin5';

export interface DrawerNode {
	type: 'drawer';
	connector?: DrawerConnector;
}
```

If `DrawerNode` already exists inline in the `ThermalNode` union, replace that inline shape with the interface above.

- [ ] **Step 3: Parse only supported connector values**

In `packages/receipt-renderer/src/parse-xml.ts`, add:

```ts
function drawerConnectorAttr(el: Element): DrawerConnector | undefined {
	const connector = el.getAttribute('connector');
	return connector === 'pin5' ? 'pin5' : connector === 'pin2' ? 'pin2' : undefined;
}
```

Change the drawer case to:

```ts
case 'drawer':
	nodes.push({ type: 'drawer', connector: drawerConnectorAttr(el) });
	break;
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
cd packages/receipt-renderer && ../../node_modules/.bin/vitest run src/__tests__/parse-xml.test.ts
```

Expected: pass.

- [ ] **Step 5: Write failing renderer tests for connector bytes**

Add to `packages/receipt-renderer/src/__tests__/render-escpos-drawer.test.ts`:

```ts
function includesSequence(bytes: Uint8Array, sequence: number[]): boolean {
	return Array.from(bytes).some((_, index, all) =>
		sequence.every((value, offset) => all[index + offset] === value)
	);
}

it('emits ESC/POS pin 5 for explicit drawer connector pin5', () => {
	const ast = parseXml('<receipt><drawer connector="pin5" /></receipt>');
	const bytes = renderEscpos(ast, { language: 'esc-pos' });
	expect(includesSequence(bytes, [0x1b, 0x70, 0x01])).toBe(true);
});

it('emits ESC/POS pin 5 for auto-open drawerConnector pin5', () => {
	const ast = parseXml('<receipt><text>Receipt</text></receipt>');
	const bytes = renderEscpos(ast, {
		language: 'esc-pos',
		openDrawer: true,
		drawerConnector: 'pin5',
	});
	expect(includesSequence(bytes, [0x1b, 0x70, 0x01])).toBe(true);
});

```

Run:

```bash
cd packages/receipt-renderer && ../../node_modules/.bin/vitest run src/__tests__/render-escpos-drawer.test.ts -t 'pin 5'
```

Expected: fail because `drawerConnector` is not an option and drawer nodes always call `encoder.pulse()` with no device.

- [ ] **Step 6: Add renderer option and pulse helper**

In `packages/receipt-renderer/src/render-escpos.ts`, import `DrawerConnector` and add to `EscposRenderOptions`:

```ts
drawerConnector?: DrawerConnector;
```

Add helper:

```ts
function pulseDrawer(
	encoder: ReceiptPrinterEncoder,
	connector: DrawerConnector | undefined
): void {
	encoder.pulse(connector === 'pin5' ? 1 : 0);
}
```

Change auto pulse calls from `encoder.pulse()` to:

```ts
pulseDrawer(encoder, options.drawerConnector);
```

Change the `drawer` case inside the node walker from `encoder.pulse()` to:

```ts
pulseDrawer(encoder, node.connector ?? options.drawerConnector);
```

Generated templates such as `DEFAULT_THERMAL_TEMPLATE` and drawer-only fallback XML contain a bare `<drawer />`, so bare drawer nodes must fall back to the profile-level render option. Keep explicit `connector` attributes higher priority than the option. If the drawer case is in a helper, pass `options.drawerConnector` through the existing render context; do not create a global mutable variable.

- [ ] **Step 7: Run renderer tests**

Run:

```bash
cd packages/receipt-renderer && ../../node_modules/.bin/vitest run src/__tests__/render-escpos-drawer.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit PR A renderer slice**

```bash
git add packages/receipt-renderer/src
git commit -m "Add drawer connector rendering"
```

### Task A2: Printer package threads drawerConnector through all client-rendered paths

- [ ] **Step 1: Write failing service test**

Add to `packages/printer/src/__tests__/printer-service.test.ts`:

```ts
it('passes drawerConnector to drawer-only open', async () => {
	const service = new PrinterService();
	const transport: PrinterTransport = {
		name: 'test',
		printRaw: vi.fn().mockResolvedValue(undefined),
		printHtml: vi.fn().mockResolvedValue(undefined),
	};
	(service as unknown as { getTransport: typeof service['printRaw'] }).getTransport = vi
		.fn()
		.mockResolvedValue(transport) as never;

	const profile: PrinterProfile = {
		id: 'printer-1',
		name: 'Test Printer',
		connectionType: 'network',
		vendor: 'epson',
		address: '127.0.0.1',
		port: 9100,
		language: 'esc-pos',
		columns: 48,
		fullReceiptRaster: false,
		autoCut: true,
		autoOpenDrawer: false,
		drawerConnector: 'pin5',
		isDefault: true,
		isBuiltIn: false,
	};

	await service.openDrawer(profile);

	const [bytes] = vi.mocked(transport.printRaw).mock.calls[0];
	expect(Array.from(bytes).some((byte, index, all) => byte === 0x1b && all[index + 1] === 0x70 && all[index + 2] === 0x01)).toBe(true);
});
```

Add to `packages/printer/src/encoder/__tests__/drawer-auto-open.test.ts` so generated templates with bare `<drawer />` use the profile connector too:

```ts
it('uses drawerConnector for generated bare drawer nodes', () => {
	const bytes = encodeReceipt(sampleReceiptData, { openDrawer: true, drawerConnector: 'pin5' });
	expect(includesSequence(bytes, [0x1b, 0x70, 0x01])).toBe(true);
});
```

Run:

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/printer-service.test.ts -t drawerConnector
cd packages/printer && ../../node_modules/.bin/vitest run src/encoder/__tests__/drawer-auto-open.test.ts -t drawerConnector
```

Expected: fail because `PrinterProfile`, `EncodeReceiptOptions`, and service options do not include/pass `drawerConnector`.

- [ ] **Step 2: Add profile type**

In `packages/printer/src/types.ts`:

```ts
export type DrawerConnector = 'pin2' | 'pin5';
```

Add to `PrinterProfile`:

```ts
/** Cash drawer connector: ESC/POS pin 2 / Star drawer 1 by default, pin 5 / drawer 2 when selected. */
drawerConnector?: DrawerConnector;
```

- [ ] **Step 3: Thread into `PrinterService`**

In `packages/printer/src/printer-service.ts`, every call to `encodeReceipt`, `encodeThermalTemplate`, and `encodeThermalTemplateForPrint` that includes `openDrawer` must also include:

```ts
drawerConnector: profile.drawerConnector,
```

For `openDrawer(profile)`, the options object becomes:

```ts
{
	language: profile.language,
	columns: profile.columns,
	printerModel: profile.printerModel,
	emitEscPrintMode: profile.emitEscPrintMode ?? true,
	drawerConnector: profile.drawerConnector,
}
```

- [ ] **Step 4: Thread into hook raster path**

In `packages/printer/src/hooks/use-print.ts`, where `openDrawer: printerProfile.autoOpenDrawer` is passed, also pass:

```ts
drawerConnector: printerProfile.drawerConnector,
```

In `packages/printer/src/raster/receipt-rasterizer.dom.tsx`, add `drawerConnector?: DrawerConnector` to raster encode options and pass it to the renderer.

- [ ] **Step 5: Run printer tests**

```bash
cd packages/printer && ../../node_modules/.bin/vitest run
```

Expected: pass.

- [ ] **Step 6: Commit PR A printer slice**

```bash
git add packages/printer/src
git commit -m "Thread drawer connector through printer paths"
```

### Task A3: Persist and edit drawerConnector in printer profiles

- [ ] **Step 1: Write failing database schema test**

Add to `packages/database/src/collections/printer-profiles.test.ts`:

```ts
it('declares schema version 8 with drawerConnector defaulting to pin2', async () => {
	const { storeCollections } = await import('./index');
	const schema = storeCollections.printer_profiles.schema as unknown as {
		version: number;
		properties: { drawerConnector?: { enum?: readonly string[]; default?: string } };
	};

	expect(schema.version).toBe(8);
	expect(schema.properties.drawerConnector?.enum).toEqual(['pin2', 'pin5']);
	expect(schema.properties.drawerConnector?.default).toBe('pin2');
});
```

Run:

```bash
cd packages/database && ../../node_modules/.bin/vitest run src/collections/printer-profiles.test.ts -t drawerConnector
```

Expected: fail because schema is v7 and has no drawerConnector.

- [ ] **Step 2: Update RxDB schema and migration**

In `packages/database/src/collections/schemas/printer-profiles.ts`:

```ts
version: 8,
```

Add property:

```ts
drawerConnector: {
	type: 'string',
	enum: ['pin2', 'pin5'],
	default: 'pin2',
	description: 'Cash drawer connector: pin2/drawer1 by default, pin5/drawer2 when selected.',
},
```

In `packages/database/src/collections/index.ts`, add migration strategy 8 to preserve existing documents and backfill:

```ts
8: (oldDoc) => ({
	...oldDoc,
	drawerConnector: oldDoc.drawerConnector === 'pin5' ? 'pin5' : 'pin2',
}),
```

- [ ] **Step 3: Update core form types and defaults**

In `packages/core/src/screens/main/settings/printer/schema.ts`, add:

```ts
drawerConnector: 'pin2' | 'pin5';
```

Default:

```ts
drawerConnector: 'pin2',
```

Zod shape:

```ts
drawerConnector: z.enum(['pin2', 'pin5']).default('pin2'),
```

In `packages/core/src/screens/main/settings/printer/profile-config.ts`, add `drawerConnector` to `PrinterProfileFormData` and returned profile fields:

```ts
drawerConnector: data.drawerConnector ?? 'pin2',
```

In `packages/core/src/screens/main/settings/printer/printer-profile.ts`, add:

```ts
drawerConnector: doc.drawerConnector === 'pin5' ? 'pin5' : 'pin2',
```

In `packages/core/src/screens/main/settings/printer/available-printer-profiles.ts`, set system/cloud synthesized profiles to `drawerConnector: 'pin2'`.

- [ ] **Step 4: Update dialog reset**

In `packages/core/src/screens/main/settings/printer/dialog/use-printer-dialog-form.ts`, add to edit reset:

```ts
drawerConnector: printer.drawerConnector ?? 'pin2',
```

Add to fresh/default reset through `defaultValues`, no special code needed once default values include it.

- [ ] **Step 5: Create drawer connector UI field**

Create `packages/core/src/screens/main/settings/printer/dialog/drawer-connector-field.tsx`:

```tsx
import * as React from 'react';

import { FormField, FormSelect } from '@wcpos/components/form';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';
import { View } from 'react-native';

import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues } from '../schema';
import type { UseFormReturn } from 'react-hook-form';

function DrawerConnectorSelect({ value, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => [
			{ value: 'pin2', label: t('settings.cash_drawer_pin2', 'Pin 2 / Drawer 1') },
			{ value: 'pin5', label: t('settings.cash_drawer_pin5', 'Pin 5 / Drawer 2') },
		],
		[t]
	);

	const selectedLabel =
		options.find((option) => option.value === value?.value)?.label ??
		value?.label ??
		value?.value ??
		'';

	return (
		<Select value={value ? { ...value, label: selectedLabel } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue placeholder={t('settings.cash_drawer_connector', 'Cash drawer connector')} />
			</SelectTrigger>
			<SelectContent matchWidth>
				<SelectGroup>
					{options.map((option) => (
						<SelectItem key={option.value} label={option.label} value={option.value}>
							<Text>{option.label}</Text>
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

export function DrawerConnectorField({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	const autoOpenDrawer = form.watch('autoOpenDrawer');
	if (!autoOpenDrawer) return null;

	return (
		<FormField
			control={form.control}
			name="drawerConnector"
			render={({ field: { value, onChange, ...rest } }) => (
				<View testID="add-printer-drawer-connector-field">
					<FormSelect
						customComponent={DrawerConnectorSelect}
						label={t('settings.cash_drawer_connector', 'Cash drawer connector')}
						value={value}
						onChange={onChange}
						{...rest}
					/>
				</View>
			)}
		/>
	);
}
```

`FormSelect` must receive `DrawerConnectorSelect` through `customComponent`; do not pass an `options` prop directly.


- [ ] **Step 6: Render connector field in advanced settings**

In `packages/core/src/screens/main/settings/printer/dialog/advanced-settings.tsx`:

```ts
import { DrawerConnectorField } from './drawer-connector-field';
```

Render after `<FullReceiptRasterField form={form} />`:

```tsx
<DrawerConnectorField form={form} />
```

- [ ] **Step 7: Run focused tests**

```bash
cd packages/database && ../../node_modules/.bin/vitest run src/collections/printer-profiles.test.ts
cd packages/core && ../../node_modules/.bin/vitest run src/screens/main/settings/printer/profile-config.test.ts
pnpm typecheck --force
```

Expected: pass.

- [ ] **Step 8: Commit PR A persistence/UI slice**

```bash
git add packages/database/src packages/core/src/screens/main/settings/printer
git commit -m "Add printer drawer connector setting"
```

---

## PR B: Order-based cloud jobs carry drawer settings

### Files

- Modify: `packages/printer/src/transport/cloud-adapter.ts`
- Modify: `packages/printer/src/printer-service.ts`
- Modify: `packages/printer/src/hooks/use-print.ts`
- Modify: `packages/printer/src/__tests__/cloud-adapter.test.ts`
- Modify: `packages/printer/src/__tests__/printer-service-cloud-roundtrip.test.ts`
- Modify: `packages/core/src/screens/main/hooks/use-cloud-enqueue.ts`
- Modify: `packages/core/src/screens/main/hooks/use-cloud-enqueue.test.ts`

### Task B1: Add drawer settings to order CloudPrintJob

- [ ] **Step 1: Write failing cloud adapter test**

In `packages/printer/src/__tests__/cloud-adapter.test.ts` add:

```ts
it('enqueues order jobs with drawer settings', async () => {
	const enqueue = vi.fn().mockResolvedValue(undefined);
	const adapter = new CloudAdapter('reg-1', enqueue);

	await adapter.enqueueOrder(4567, '88', { autoOpenDrawer: true, drawerConnector: 'pin5' });

	expect(enqueue).toHaveBeenCalledWith('reg-1', {
		kind: 'order',
		orderId: 4567,
		templateId: '88',
		autoOpenDrawer: true,
		drawerConnector: 'pin5',
	});
});
```

Run:

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/cloud-adapter.test.ts -t 'drawer settings'
```

Expected: fail because `enqueueOrder` accepts only order/template.

- [ ] **Step 2: Extend CloudPrintJob order variant**

In `packages/printer/src/transport/cloud-adapter.ts`:

```ts
export interface CloudOrderDrawerOptions {
	autoOpenDrawer?: boolean;
	drawerConnector?: PrinterProfile['drawerConnector'];
}
```

Extend order job:

```ts
| {
	kind: 'order';
	orderId: number;
	templateId: string;
	autoOpenDrawer?: boolean;
	drawerConnector?: PrinterProfile['drawerConnector'];
}
```

Change method:

```ts
async enqueueOrder(
	orderId: number,
	templateId: string,
	options: CloudOrderDrawerOptions = {}
): Promise<void> {
	await this.enqueue(this.cloudPrinterId, {
		kind: 'order',
		orderId,
		templateId,
		...(options.autoOpenDrawer !== undefined ? { autoOpenDrawer: options.autoOpenDrawer } : {}),
		...(options.drawerConnector ? { drawerConnector: options.drawerConnector } : {}),
	});
}
```

- [ ] **Step 3: Thread from PrinterService**

In `packages/printer/src/printer-service.ts`, update `printOrderViaCloud` signature:

```ts
async printOrderViaCloud(
	profile: PrinterProfile,
	orderId: number,
	templateId: string
): Promise<void> {
```

Keep signature stable, but call:

```ts
await transport.enqueueOrder(orderId, templateId, {
	autoOpenDrawer: profile.autoOpenDrawer,
	drawerConnector: profile.drawerConnector,
});
```

- [ ] **Step 4: Update REST payload test first**

In `packages/core/src/screens/main/hooks/use-cloud-enqueue.test.ts` add:

```ts
it('posts order jobs with drawer settings', async () => {
	const post = vi.fn().mockResolvedValue(undefined);
	const factory = createCloudEnqueueFactory({ post });
	const enqueue = factory({} as PrinterProfile);

	await enqueue('reg-7', {
		kind: 'order',
		orderId: 123,
		templateId: 'receipt',
		autoOpenDrawer: true,
		drawerConnector: 'pin5',
	});

	expect(post).toHaveBeenCalledWith('/print-jobs', {
		printer_id: 'reg-7',
		order_id: 123,
		template_id: 'receipt',
		auto_open_drawer: true,
		drawer_connector: 'pin5',
	});
});
```

Run:

```bash
cd packages/core && ../../node_modules/.bin/vitest run src/screens/main/hooks/use-cloud-enqueue.test.ts -t 'drawer settings'
```

Expected: fail because the REST payload omits drawer fields.

- [ ] **Step 5: Update REST enqueue implementation**

In `packages/core/src/screens/main/hooks/use-cloud-enqueue.ts`, order payload becomes:

```ts
await http.post('/print-jobs', {
	printer_id: printerId,
	order_id: job.orderId,
	template_id: job.templateId,
	auto_open_drawer: job.autoOpenDrawer === true,
	...(job.drawerConnector ? { drawer_connector: job.drawerConnector } : {}),
});
```

This sends `false` explicitly so the server can distinguish default false from missing legacy clients.

- [ ] **Step 6: Run cloud tests**

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/cloud-adapter.test.ts src/__tests__/printer-service-cloud-roundtrip.test.ts
cd packages/core && ../../node_modules/.bin/vitest run src/screens/main/hooks/use-cloud-enqueue.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit PR B**

```bash
git add packages/printer/src packages/core/src/screens/main/hooks
git commit -m "Send drawer settings with cloud order jobs"
```

---

## PR C: Real-time ESC/POS no-sale kick for Open drawer

### Files

- Modify: `packages/printer/src/printer-service.ts`
- Modify: `packages/printer/src/__tests__/printer-service.test.ts`

### Design

Use real-time command only for `language === 'esc-pos'` in `openDrawer(profile)`, because Star drawer commands already differ and should keep using the encoder's language-correct `pulse()` path. Real-time bytes are:

- pin 2: `10 14 01 00 03` (DLE DC4 fn=1, connector 0, 300ms)
- pin 5: `10 14 01 01 03`

### Task C1: Add real-time option behind service method only

- [ ] **Step 1: Write failing test for ESC/POS no-sale bytes**

In `packages/printer/src/__tests__/printer-service.test.ts`:

```ts
it('uses ESC/POS real-time kick for drawer-only opens', async () => {
	const service = new PrinterService();
	const transport: PrinterTransport = {
		name: 'test',
		printRaw: vi.fn().mockResolvedValue(undefined),
		printHtml: vi.fn().mockResolvedValue(undefined),
	};
	(service as any).getTransport = vi.fn().mockResolvedValue(transport);

	await service.openDrawer({
		id: 'printer-1',
		name: 'Test Printer',
		connectionType: 'network',
		vendor: 'epson',
		address: '127.0.0.1',
		port: 9100,
		language: 'esc-pos',
		columns: 48,
		fullReceiptRaster: false,
		autoCut: true,
		autoOpenDrawer: false,
		drawerConnector: 'pin5',
		isDefault: true,
		isBuiltIn: false,
	});

	expect(transport.printRaw).toHaveBeenCalledWith(Uint8Array.from([0x10, 0x14, 0x01, 0x01, 0x03]));
});
```

Run:

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/printer-service.test.ts -t 'real-time kick'
```

Expected: fail because current implementation emits buffered template bytes.

- [ ] **Step 2: Implement helper**

In `packages/printer/src/printer-service.ts` add near top:

```ts
function encodeEscposRealtimeDrawerKick(profile: PrinterProfile): Uint8Array | null {
	if (profile.language !== 'esc-pos') return null;
	const connector = profile.drawerConnector === 'pin5' ? 1 : 0;
	return Uint8Array.from([0x10, 0x14, 0x01, connector, 0x03]);
}
```

Change `openDrawer(profile)`:

```ts
const realtimeBytes = encodeEscposRealtimeDrawerKick(profile);
const bytes =
	realtimeBytes ??
	encodeThermalTemplate('<receipt><drawer /></receipt>', {}, {
		language: profile.language,
		columns: profile.columns,
		printerModel: profile.printerModel,
		emitEscPrintMode: profile.emitEscPrintMode ?? true,
		drawerConnector: profile.drawerConnector,
	});
await transport.printRaw(bytes, { cutPaper: false });
```

Preserve the existing `{ cutPaper: false }` option for every drawer-only path. Star WebPRNT network printing defaults to cutting unless this option is passed, so the regression test must continue to assert it.

- [ ] **Step 3: Add Star regression test**

```ts
it('keeps using language-correct Star drawer bytes for drawer-only opens', async () => {
	const service = new PrinterService();
	const transport: PrinterTransport = {
		name: 'test',
		printRaw: vi.fn().mockResolvedValue(undefined),
		printHtml: vi.fn().mockResolvedValue(undefined),
	};
	(service as any).getTransport = vi.fn().mockResolvedValue(transport);

	await service.openDrawer({
		id: 'star-1',
		name: 'Star',
		connectionType: 'network',
		vendor: 'star',
		address: '127.0.0.1',
		port: 9100,
		language: 'star-line',
		columns: 48,
		fullReceiptRaster: false,
		autoCut: true,
		autoOpenDrawer: false,
		isDefault: false,
		isBuiltIn: false,
	});

	const [bytes] = vi.mocked(transport.printRaw).mock.calls[0];
	expect(Array.from(bytes).some((byte, index, all) => byte === 0x1b && all[index + 1] === 0x07)).toBe(true);
});
```

- [ ] **Step 4: Run printer tests and commit**

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/printer-service.test.ts
cd packages/printer && ../../node_modules/.bin/vitest run
git add packages/printer/src/printer-service.ts packages/printer/src/__tests__/printer-service.test.ts
git commit -m "Use realtime drawer kick for ESC/POS no-sale opens"
```

---

## PR D: Connection-close tail-drop / drain audit

### Files

- Modify: `packages/printer/src/transport/network-adapter.ts`
- Modify: `packages/printer/src/__tests__/network-adapter.test.ts`

### Task D1: Resolve network print after socket close, not immediately after write callback

- [ ] **Step 1: Write failing test with fake TCP socket**

Update the existing `packages/printer/src/__tests__/network-adapter.test.ts`; do not replace the file. Keep the current Buffer-less write and `end(callback)` crash regressions, and append the close/drain coverage below:

```ts
import { describe, expect, it, vi } from 'vitest';

const socket = {
	write: vi.fn(),
	end: vi.fn(),
	destroy: vi.fn(),
	on: vi.fn(),
};

vi.mock('react-native-tcp-socket', () => ({
	default: {
		createConnection: vi.fn((_opts, onConnect) => {
			queueMicrotask(onConnect);
			return socket;
		}),
	},
}));

describe('NetworkAdapter', () => {
	it('waits for close after ending the socket', async () => {
		const { NetworkAdapter } = await import('../transport/network-adapter');
		let closeHandler: (() => void) | undefined;
		socket.on.mockImplementation((event: string, handler: () => void) => {
			if (event === 'close') closeHandler = handler;
			return socket;
		});
		socket.write.mockImplementation((_data, _encoding, cb) => cb(undefined));

		const promise = new NetworkAdapter('127.0.0.1', 9100).printRaw(Uint8Array.from([1, 2, 3]));
		await Promise.resolve();

		let settled = false;
		promise.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);

		closeHandler?.();
		await promise;
		expect(settled).toBe(true);
	});
});
```

Run:

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/network-adapter.test.ts
```

Expected: fail because current adapter resolves immediately after write callback/end.

- [ ] **Step 2: Update NetworkAdapter**

In `packages/printer/src/transport/network-adapter.ts`, after successful write:

```ts
client!.end();
```

Do not call `settle()` there. Add close handler:

```ts
client.on('close', () => {
	settle();
});
```

Keep `error` and timeout handling. In `settle`, use `client.destroy()` only for error/timeout or if the socket has not closed; if the library has no destroyed flag, retain current destroy behavior after close because the test asserts timing, not destroy internals.

- [ ] **Step 3: Run network and printer tests**

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/network-adapter.test.ts
cd packages/printer && ../../node_modules/.bin/vitest run
```

Expected: pass.

- [ ] **Step 4: Commit PR D**

```bash
git add packages/printer/src/transport/network-adapter.ts packages/printer/src/__tests__/network-adapter.test.ts
git commit -m "Wait for network printer socket close"
```

### Task D2: Native adapter audit note

- [ ] **Step 1: Inspect native adapters**

Read:

```bash
sed -n '1,220p' packages/printer/src/transport/epson-native-adapter.ts
sed -n '1,220p' packages/printer/src/transport/star-native-adapter.ts
```

- [ ] **Step 2: Add inline comments only if the SDK methods already await completion**

If Epson uses `sendData()` promise and Star uses `printRawData()` promise, add comments above each `printRaw` explaining the promise is the drain/ack boundary. If either method fire-and-forgets, add a failing test/mocking harness before changing behavior.

- [ ] **Step 3: Commit audit comments with PR D or leave no-op**

```bash
git add packages/printer/src/transport/epson-native-adapter.ts packages/printer/src/transport/star-native-adapter.ts
git commit -m "Document native printer drain boundaries"
```

Skip this commit if no code/comment change is needed.

---

## PR E: Emulation guard and Test Print drawer check

### Files

- Modify: `packages/core/src/screens/main/settings/printer/dialog/use-printer-dialog-form.ts`
- Modify: `packages/core/src/screens/main/settings/printer/dialog/advanced-settings.tsx`
- Create: `packages/core/src/screens/main/settings/printer/dialog/drawer-emulation-warning.tsx`
- Modify: `packages/printer/src/printer-service.ts`
- Modify: `packages/printer/src/__tests__/printer-service.test.ts`

### Task E1: Star language/emulation warning in dialog

- [ ] **Step 1: Create warning component**

Create `packages/core/src/screens/main/settings/printer/dialog/drawer-emulation-warning.tsx`:

```tsx
import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues } from '../schema';

export function DrawerEmulationWarning({
	vendor,
	language,
}: {
	vendor: PrinterFormValues['vendor'];
	language: PrinterFormValues['language'];
}) {
	const t = useT();
	const mismatch =
		(vendor === 'star' && language === 'esc-pos') ||
		(vendor !== 'star' && (language === 'star-line' || language === 'star-prnt'));

	if (!mismatch) return null;

	return (
		<Text testID="add-printer-drawer-emulation-warning" className="text-warning text-xs">
			{t(
				'settings.cash_drawer_emulation_warning',
				'Cash drawer kicks depend on printer language/emulation. If the drawer does not open, match this language to the printer emulation mode.'
			)}
		</Text>
	);
}
```

- [ ] **Step 2: Render warning in advanced settings**

In `advanced-settings.tsx`, watch `vendor` and `language`:

```ts
const vendor = form.watch('vendor');
const language = form.watch('language');
```

Render below language/columns row:

```tsx
<DrawerEmulationWarning vendor={vendor} language={language} />
```

- [ ] **Step 3: Add component test if test harness exists**

Search for nearby render tests:

```bash
find packages/core/src/screens/main/settings/printer/dialog -name '*.test.tsx' -maxdepth 2 -print
```

If existing tests use React Native Testing Library, add `drawer-emulation-warning.test.tsx` asserting the warning appears for `vendor='star', language='esc-pos'` and hides for `vendor='star', language='star-line'`. Use `getByTestId`, not text.

### Task E2: Test print kicks drawer when autoOpenDrawer is on

- [ ] **Step 1: Write failing service test**

In `packages/printer/src/__tests__/printer-service.test.ts`:

```ts
it('testPrint includes a drawer pulse when autoOpenDrawer is enabled', async () => {
	const service = new PrinterService();
	const transport: PrinterTransport = {
		name: 'test',
		printRaw: vi.fn().mockResolvedValue(undefined),
		printHtml: vi.fn().mockResolvedValue(undefined),
	};
	(service as any).getTransport = vi.fn().mockResolvedValue(transport);

	await service.testPrint({
		id: 'printer-1',
		name: 'Test Printer',
		connectionType: 'network',
		vendor: 'epson',
		address: '127.0.0.1',
		port: 9100,
		language: 'esc-pos',
		columns: 48,
		fullReceiptRaster: false,
		autoCut: true,
		autoOpenDrawer: true,
		isDefault: true,
		isBuiltIn: false,
	});

	const [bytes] = vi.mocked(transport.printRaw).mock.calls[0];
	expect(Array.from(bytes).some((byte, index, all) => byte === 0x1b && all[index + 1] === 0x70)).toBe(true);
});
```

Run:

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/printer-service.test.ts -t 'testPrint includes a drawer pulse'
```

Expected: fail if `testPrint` currently builds a diagnostic template without passing `openDrawer`.

- [ ] **Step 2: Implement in `testPrint`**

In `packages/printer/src/printer-service.ts`, find the diagnostic template encode call and pass:

```ts
openDrawer: profile.autoOpenDrawer,
drawerConnector: profile.drawerConnector,
```

If diagnostic uses `encodeReceipt`, pass equivalent `EncodeReceiptOptions` fields.

In `packages/core/src/screens/main/settings/printing/index.tsx`, extend the cloud test-print request so cloud profiles follow the same drawer setting:

```ts
await cloudHttp.post('/print-jobs/test', {
	printer_id: profile.cloudPrinterId,
	auto_open_drawer: profile.autoOpenDrawer,
	drawer_connector: profile.drawerConnector,
});
```

Update `packages/core/src/screens/main/settings/printing/index-cloud.test.tsx` to expect those payload fields.

- [ ] **Step 3: Run tests and commit PR E**

```bash
cd packages/printer && ../../node_modules/.bin/vitest run src/__tests__/printer-service.test.ts
cd packages/printer && ../../node_modules/.bin/vitest run
pnpm typecheck --force
git add packages/core/src/screens/main/settings/printer/dialog packages/printer/src
git commit -m "Warn on drawer emulation mismatch and test drawer setting"
```

---

## Hardware-backed follow-ups

### Native Star verification

This cannot be closed honestly without hardware. Create a GitHub issue or checklist entry with:

- Star model tested: TSP650II, mC-Print, or equivalent.
- Profile language tested: `star-line` and `esc-pos` emulation if the printer supports mode switching.
- Transport tested: Bluetooth and USB native.
- Expected pass condition: `PrinterService.openDrawer()` opens drawer using raw `ESC BEL` bytes.
- If raw bytes fail through `react-native-star-io10`, implement a new `PrinterTransport.openCashDrawer()` path in `StarNativeAdapter` using StarXpand `DrawerBuilder().actionOpen(Channel.No1|No2)` and update `PrinterService.openDrawer()` to prefer `transport.openCashDrawer?.()` before raw bytes.

### Sunmi/iMin

No implementation in this monorepo until all-in-one device support exists. File a separate issue titled `Add all-in-one cash drawer SDK support` with these acceptance criteria:

- Sunmi path calls the vendor `openDrawer()` SDK API.
- iMin path calls `opencashBox()` or current vendor equivalent.
- UI hides pin2/pin5 connector options for SDK-only devices.

---

## Final validation for every PR

Run before pushing each PR:

```bash
cd packages/printer && ../../node_modules/.bin/vitest run
cd packages/receipt-renderer && ../../node_modules/.bin/vitest run
pnpm run lint
pnpm typecheck --force
```

For PRs that touch database schema, also run:

```bash
cd packages/database && ../../node_modules/.bin/vitest run
```

For PRs that touch core settings UI, also run the nearest focused core tests found by:

```bash
find packages/core/src/screens/main/settings/printer -name '*.test.ts' -o -name '*.test.tsx'
```

## Plan self-review

- **Spec coverage:** P1 connector configuration is covered by PR A; P2 tail-drop/realtime are covered by PR C and PR D; P3 optional test-print drawer check is covered by PR E; order-based cloud client payload work is covered by PR B; Star hardware and all-in-one SDK work are explicitly separated because they require hardware or unsupported device classes.
- **Placeholders:** No step uses TBD/TODO/implement-later language. Hardware-only items have concrete verification criteria instead of code placeholders.
- **Type consistency:** `drawerConnector` uses `'pin2' | 'pin5'` across profile, form, database, renderer, and cloud payloads; REST uses snake_case `drawer_connector`.
