import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Button } from '@wcpos/components/button';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Form, useFormChangeHandler } from '@wcpos/components/form';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { columnsFormSchema, UISettingsColumnsForm } from './columns-form';
import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';

type ColumnsOnlySettingsID = 'products' | 'coupons' | 'customers' | 'orders' | 'reports-orders';

const columnsOnlyFormSchema = z.object({
	...columnsFormSchema.shape,
});

interface DialogContextProps {
	setButtonPressHandler: (handler: (() => void) | null) => void;
}

const DialogContext = React.createContext<DialogContextProps | undefined>(undefined);

const useDialogContext = () => {
	const context = React.useContext(DialogContext);
	if (!context) {
		throw new Error('useDialogContext must be used within a DialogProvider');
	}
	return context;
};

function UISettingsColumnsOnlyForm({ id }: { id: ColumnsOnlySettingsID }) {
	const { uiSettings, getUILabel, resetUI, patchUI } = useUISettings(id);
	const formData = useDocField(uiSettings, (value) => value);
	const dialog = React.useContext(DialogContext);

	/**
	 * The reset button lives in the dialog footer, outside this form's subtree, so the
	 * handler has to be published back up to UISettingsDialog. It lands in a ref there,
	 * and writing a ref during render is not allowed — hence an effect rather than a
	 * plain call. Nothing here derives state; it only registers the callback.
	 */
	React.useEffect(() => {
		dialog?.setButtonPressHandler(() => void resetUI());
	}, [dialog, resetUI]);

	const form = useForm<z.infer<typeof columnsOnlyFormSchema>>({
		resolver: zodResolver(columnsOnlyFormSchema as never) as never,
		values: formData,
	});

	useFormChangeHandler({ form: form as never, onChange: (changes) => void patchUI(changes) });

	return (
		<Form {...form}>
			<VStack>
				<UISettingsColumnsForm getUILabel={getUILabel} />
			</VStack>
		</Form>
	);
}

interface Props {
	title: string;
	children: React.ReactNode;
	triggerTestID?: string;
	/** The trigger's accessible name; the title when absent. */
	triggerLabel?: string;
	contentTestID?: string;
	/** Footer ids, per page where more than one panel can exist; the generic ids otherwise. */
	closeTestID?: string;
	restoreTestID?: string;
	portalHost?: string;
	side?: 'left' | 'right';
}

/**
 * The one chrome for display settings: a side panel with the form in a scrolling body and
 * Close + Restore defaults in its footer. The POS forms and the pages' columns-only form both
 * open here.
 */
function UISettingsDialog({
	title,
	children,
	triggerTestID,
	triggerLabel,
	contentTestID,
	closeTestID = 'ui-settings-close',
	restoreTestID = 'ui-settings-restore-defaults',
	portalHost,
	side = 'right',
}: Props) {
	const [openDialog, setOpenDialog] = React.useState(false);
	const t = useT();
	const buttonPressHandlerRef = React.useRef<(() => void) | null>(null);

	const setButtonPressHandler = React.useCallback((handler: (() => void) | null) => {
		buttonPressHandlerRef.current = handler;
	}, []);

	const handleButtonPress = () => {
		if (buttonPressHandlerRef.current) {
			buttonPressHandlerRef.current();
		}
	};

	const contextValue = React.useMemo(() => ({ setButtonPressHandler }), [setButtonPressHandler]);

	return (
		<ErrorBoundary>
			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				<Tooltip>
					<TooltipTrigger asChild onPress={() => setOpenDialog(true)}>
						<IconButton
							name="sliders"
							testID={triggerTestID}
							accessibilityLabel={triggerLabel ?? title}
						/>
					</TooltipTrigger>
					<TooltipContent>
						<Text>{title}</Text>
					</TooltipContent>
				</Tooltip>
				<DialogContent side={side} size="lg" portalHost={portalHost} testID={contentTestID}>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<DialogContext.Provider value={contextValue}>{children}</DialogContext.Provider>
					</DialogBody>
					<DialogFooter>
						<DialogClose testID={closeTestID}>{t('common.close')}</DialogClose>
						<Button
							testID={restoreTestID}
							variant="outline-destructive"
							onPress={handleButtonPress}
						>
							{t('common.restore_default_settings')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
}

export {
	UISettingsDialog,
	UISettingsColumnsOnlyForm,
	columnsFormSchema,
	columnsOnlyFormSchema,
	UISettingsColumnsForm,
	useDialogContext,
};
