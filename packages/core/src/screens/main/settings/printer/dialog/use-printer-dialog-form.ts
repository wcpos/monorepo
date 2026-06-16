import * as React from 'react';

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';

import { Toast } from '@wcpos/components/toast';
import {
	isOrderBasedCloudProfile,
	isPrinterConnectionError,
	PrinterService,
	probeVendor,
} from '@wcpos/printer';
import type { ConnectionDiagnostics, PrinterProfile, PrinterServiceOptions } from '@wcpos/printer';

import { buildPrinterProfileFields, type PrinterDialogPrefill } from '../profile-config';
import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';

import type * as z from 'zod';
import type { PrinterFormValues } from '../schema';

export interface VendorDefaults {
	language: PrinterFormValues['language'];
	port: number;
}

/** A failed test print — message always present, diagnostics when the transport provides them. */
export interface TestPrintFailure {
	message: string;
	diagnostics: ConnectionDiagnostics | null;
}

function toTestPrintFailure(err: unknown): TestPrintFailure {
	return {
		message: err instanceof Error ? err.message : String(err),
		diagnostics: isPrinterConnectionError(err) ? err.diagnostics : null,
	};
}

type PrinterFormSchema = z.ZodType<PrinterFormValues, any>;
type PrinterConnectionType = PrinterProfile['connectionType'] | PrinterFormValues['connectionType'];

function normalizeConnectionType(
	connectionType: PrinterConnectionType | undefined,
	fallback: PrinterFormValues['connectionType']
): PrinterFormValues['connectionType'] {
	return connectionType === 'network' || connectionType === 'bluetooth' || connectionType === 'usb'
		? connectionType
		: fallback;
}

function normalizeVendor(
	vendor: PrinterProfile['vendor'] | PrinterFormValues['vendor'] | undefined,
	fallback: PrinterFormValues['vendor']
): PrinterFormValues['vendor'] {
	if (vendor !== 'epson' && vendor !== 'star' && vendor !== 'generic') {
		return fallback;
	}
	if (vendor === 'generic' && fallback !== 'generic') {
		return fallback;
	}
	return vendor;
}

interface UsePrinterDialogFormArgs {
	open: boolean;
	schema: PrinterFormSchema;
	defaultValues: PrinterFormValues;
	/** Per-platform: derive language/port (and anything else) from the chosen vendor. */
	deriveVendorDefaults: (vendor: PrinterFormValues['vendor']) => VendorDefaults;
	printer?: PrinterProfile;
	prefill?: PrinterDialogPrefill;
	cloudEnqueueFactory?: PrinterServiceOptions['cloudEnqueueFactory'];
	printerCount: number;
	onSave: () => void;
}

export function usePrinterDialogForm({
	open,
	schema,
	defaultValues,
	deriveVendorDefaults,
	printer,
	prefill,
	cloudEnqueueFactory,
	printerCount,
	onSave,
}: UsePrinterDialogFormArgs) {
	const t = useT();
	const { storeDB } = useAppState();
	const printerService = React.useMemo(() => new PrinterService(), []);
	const isEditing = !!printer;

	const [testLoading, setTestLoading] = React.useState(false);
	const [drawerLoading, setDrawerLoading] = React.useState(false);
	const [saveLoading, setSaveLoading] = React.useState(false);
	const [testError, setTestError] = React.useState<TestPrintFailure | null>(null);
	const [probing, setProbing] = React.useState(false);
	const [detectedVendor, setDetectedVendor] = React.useState<string | null>(null);

	const manualVendorRef = React.useRef(false);
	const probeRequestIdRef = React.useRef(0);

	const form = useForm<PrinterFormValues>({
		resolver: standardSchemaResolver(schema),
		defaultValues,
	});

	const prevVendorRef = React.useRef(form.getValues('vendor'));

	React.useEffect(() => {
		printerService.setCloudEnqueueFactory(cloudEnqueueFactory);
	}, [printerService, cloudEnqueueFactory]);

	React.useEffect(() => {
		return () => {
			void printerService.dispose();
		};
	}, [printerService]);

	// Reset on open — edit / prefill / fresh.
	React.useEffect(() => {
		if (!open) return;
		if (printer) {
			const resolvedVendor = normalizeVendor(printer.vendor, defaultValues.vendor);
			const next: PrinterFormValues = {
				name: printer.name,
				connectionType: normalizeConnectionType(
					printer.connectionType,
					defaultValues.connectionType
				),
				vendor: resolvedVendor,
				address: printer.address ?? '',
				port: printer.port ?? 9100,
				language: printer.language ?? 'esc-pos',
				columns: printer.columns ?? 42,
				emitEscPrintMode: printer.emitEscPrintMode ?? true,
				fullReceiptRaster: printer.fullReceiptRaster ?? false,
				autoCut: printer.autoCut ?? true,
				autoOpenDrawer: printer.autoOpenDrawer ?? false,
				drawerConnector: printer.drawerConnector ?? 'pin2',
				isDefault: printer.isDefault ?? false,
				nativeInterfaceType: printer.nativeInterfaceType,
				cloudPrinterId: printer.cloudPrinterId ?? '',
				cloudProvider: printer.cloudProvider,
			};
			prevVendorRef.current = next.vendor;
			form.reset(next);
		} else if (prefill) {
			const resolvedVendor = normalizeVendor(prefill.vendor, defaultValues.vendor);
			const vendorDefaults = deriveVendorDefaults(resolvedVendor);
			const next: PrinterFormValues = {
				...defaultValues,
				name: prefill.name || defaultValues.name,
				connectionType: normalizeConnectionType(
					prefill.connectionType,
					defaultValues.connectionType
				),
				vendor: resolvedVendor,
				address: prefill.address || '',
				port: prefill.port ?? vendorDefaults.port,
				language: vendorDefaults.language,
				nativeInterfaceType: prefill.nativeInterfaceType,
				cloudPrinterId: prefill.cloudPrinterId ?? '',
				cloudProvider: prefill.cloudProvider,
			};
			prevVendorRef.current = next.vendor;
			form.reset(next);
		} else {
			const autoName =
				printerCount > 0
					? `${t('settings.receipt_printer', 'Receipt Printer')} ${printerCount + 1}`
					: t('settings.receipt_printer', 'Receipt Printer');
			const vendorDefaults = deriveVendorDefaults(defaultValues.vendor);
			const next = {
				...defaultValues,
				name: autoName,
				language: vendorDefaults.language,
				port: vendorDefaults.port,
			};
			prevVendorRef.current = next.vendor;
			form.reset(next);
		}
		setTestError(null);
		probeRequestIdRef.current += 1;
		setProbing(false);
		setDetectedVendor(null);
		manualVendorRef.current = false;
	}, [open, printer, prefill, form, printerCount, t, defaultValues, deriveVendorDefaults]);

	// Vendor change → derive language/port.
	const vendor = form.watch('vendor');
	React.useEffect(() => {
		if (vendor !== prevVendorRef.current) {
			const previousVendor = prevVendorRef.current;
			prevVendorRef.current = vendor;
			const previousDefaults = deriveVendorDefaults(previousVendor);
			const d = deriveVendorDefaults(vendor);
			const currentPort = form.getValues('port');
			form.setValue('language', d.language);
			if (currentPort == null || currentPort === previousDefaults.port) {
				form.setValue('port', d.port);
			}
		}
	}, [vendor, form, deriveVendorDefaults]);

	// IP probe → auto-detect vendor (network only).
	const address = form.watch('address');
	const connectionType = form.watch('connectionType');
	React.useEffect(() => {
		if (connectionType !== 'network') {
			probeRequestIdRef.current += 1;
			setProbing(false);
			setDetectedVendor(null);
			return;
		}
		const trimmed = address?.trim() ?? '';
		const requestId = ++probeRequestIdRef.current;
		if (!trimmed || !/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
			setDetectedVendor(null);
			setProbing(false);
			return;
		}
		if (manualVendorRef.current) {
			setProbing(false);
			return;
		}
		const timer = setTimeout(() => {
			setProbing(true);
			probeVendor(trimmed)
				.then((result) => {
					if (probeRequestIdRef.current !== requestId) return;
					if (result) {
						setDetectedVendor(result);
						form.setValue('vendor', result as PrinterFormValues['vendor']);
						const d = deriveVendorDefaults(result as PrinterFormValues['vendor']);
						form.setValue('language', d.language);
						form.setValue('port', d.port);
						prevVendorRef.current = result as PrinterFormValues['vendor'];
					} else {
						setDetectedVendor(null);
					}
				})
				.finally(() => {
					if (probeRequestIdRef.current === requestId) setProbing(false);
				});
		}, 500);
		return () => clearTimeout(timer);
	}, [address, connectionType, form, deriveVendorDefaults]);

	const setManualVendor = React.useCallback(() => {
		manualVendorRef.current = true;
		probeRequestIdRef.current += 1;
		setProbing(false);
		setDetectedVendor(null);
	}, []);

	const buildProfile = React.useCallback(
		(data: PrinterFormValues): PrinterProfile => {
			const fields = buildPrinterProfileFields(
				{ ...data, name: data.name || 'Test' },
				{ printer, prefill }
			);
			return {
				id: printer?.id ?? `test-${Date.now()}`,
				...fields,
				isBuiltIn: printer?.isBuiltIn ?? false,
			};
		},
		[printer, prefill]
	);

	const handleTestPrint = React.useCallback(async () => {
		const data = form.getValues();
		setTestLoading(true);
		setTestError(null);
		try {
			await printerService.testPrint(buildProfile(data));
			Toast.show({
				title: t('settings.test_print_sent', 'Test print sent to %s').replace(
					'%s',
					data.name || 'printer'
				),
				type: 'success',
			});
		} catch (err) {
			setTestError(toTestPrintFailure(err));
		} finally {
			setTestLoading(false);
		}
	}, [form, buildProfile, printerService, t]);

	const cloudPrinterId = form.watch('cloudPrinterId');
	const cloudProvider = form.watch('cloudProvider');
	const canOpenDrawer = React.useMemo(() => {
		const profile = buildProfile({
			...form.getValues(),
			connectionType,
			cloudPrinterId,
			cloudProvider,
		});
		if (isOrderBasedCloudProfile(profile)) {
			return false;
		}
		return (
			profile.connectionType === 'network' ||
			profile.connectionType === 'bluetooth' ||
			profile.connectionType === 'usb' ||
			profile.connectionType === 'cloud'
		);
	}, [connectionType, cloudPrinterId, cloudProvider, form, buildProfile]);

	const handleOpenDrawer = React.useCallback(async () => {
		const data = form.getValues();
		setDrawerLoading(true);
		setTestError(null);
		try {
			await printerService.openDrawer(buildProfile(data));
			Toast.show({
				title: t('settings.cash_drawer_opened', 'Cash drawer opened'),
				type: 'success',
			});
		} catch (err) {
			setTestError(toTestPrintFailure(err));
		} finally {
			setDrawerLoading(false);
		}
	}, [form, buildProfile, printerService, t]);

	const persistProfile = React.useCallback(
		async (data: PrinterFormValues) => {
			const collection = storeDB.collections.printer_profiles;
			if (data.isDefault) {
				const existingDefaults = await collection.find({ selector: { isDefault: true } }).exec();
				for (const doc of existingDefaults) {
					if (doc.id !== printer?.id) await doc.patch({ isDefault: false });
				}
			}
			const profileData = buildPrinterProfileFields(data, { printer, prefill });
			if (printer) {
				const doc = await collection.findOne(printer.id).exec();
				if (doc) await doc.patch(profileData);
			} else {
				await collection.insert({ id: uuidv4(), ...profileData });
			}
		},
		[storeDB, printer, prefill]
	);

	const handleSave = React.useCallback(
		async (data: PrinterFormValues) => {
			setSaveLoading(true);
			setTestError(null);
			try {
				await printerService.testPrint(buildProfile(data));
			} catch (err) {
				setTestError(toTestPrintFailure(err));
				setSaveLoading(false);
				return;
			}
			try {
				await persistProfile(data);
				form.reset();
				Toast.show({ title: t('settings.printer_saved', 'Printer saved'), type: 'success' });
				onSave();
			} finally {
				setSaveLoading(false);
			}
		},
		[buildProfile, printerService, persistProfile, form, onSave, t]
	);

	const handleSaveAnyway = React.useCallback(async () => {
		const result = schema.safeParse(form.getValues());
		if (!result.success) return;
		setSaveLoading(true);
		try {
			await persistProfile(result.data);
			form.reset();
			onSave();
		} finally {
			setSaveLoading(false);
		}
	}, [form, schema, persistProfile, onSave]);

	return {
		form,
		isEditing,
		testLoading,
		drawerLoading,
		saveLoading,
		testError,
		probing,
		detectedVendor,
		canOpenDrawer,
		setManualVendor,
		handleOpenDrawer,
		handleTestPrint,
		handleSave,
		handleSaveAnyway,
	};
}
