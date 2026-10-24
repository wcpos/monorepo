import * as React from 'react';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';

import { useT } from '../../../../../contexts/translations';

/** `testID` prefixes the dialog's own: `-dialog`, `-cancel`, `-confirm`. */
type Facts = { title: string; body: string; action: string; destructive?: boolean; testID: string };

/**
 * The tender's one confirm: a tender the store cannot hear yet (ADR 0040 Decided 1 rule 1), the
 * staff clear (c5-2). `useTenderFlow` asks it (holding busy, so one question at a time) and
 * returns `dialog` for its host to render, and `open` while the question is asked. Closing the
 * question any way but the confirm (Cancel, or the host unmounting) answers no.
 */
export function useConfirm({
	portalHost,
}: {
	/** The host's overlay layer: the checkout column paints in the POS host, the modal at the root. */
	portalHost?: string;
}) {
	const t = useT();
	// The facts stay while the dialog animates out; `open` is the question.
	const [question, setQuestion] = React.useState<{ facts: Facts; open: boolean } | null>(null);
	const resolver = React.useRef<((confirmed: boolean) => void) | null>(null);
	const answer = React.useCallback((confirmed: boolean) => {
		resolver.current?.(confirmed);
		resolver.current = null;
		setQuestion((current) => (current ? { ...current, open: false } : current));
	}, []);
	React.useEffect(() => () => answer(false), [answer]);
	const confirm = React.useCallback(
		(facts: Facts) =>
			new Promise<boolean>((resolve) => {
				resolver.current?.(false);
				resolver.current = resolve;
				setQuestion({ facts, open: true });
			}),
		[]
	);
	const facts = question?.facts;
	const dialog = facts ? (
		<AlertDialog open={question.open} onOpenChange={(open) => !open && answer(false)}>
			<AlertDialogContent portalHost={portalHost} testID={`${facts.testID}-dialog`}>
				<AlertDialogHeader>
					<AlertDialogTitle>{facts.title}</AlertDialogTitle>
					<AlertDialogDescription>{facts.body}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel testID={`${facts.testID}-cancel`}>
						{t('common.cancel')}
					</AlertDialogCancel>
					{/* Red only for a loss (the clear): taking the sale is the constructive act. */}
					<AlertDialogAction
						variant={facts.destructive ? 'destructive' : 'default'}
						testID={`${facts.testID}-confirm`}
						onPress={() => answer(true)}
					>
						{facts.action}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	) : null;
	return { confirm, dialog, open: question?.open ?? false };
}
