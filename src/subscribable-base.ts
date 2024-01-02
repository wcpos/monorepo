import { Subscription, Subject } from 'rxjs';

export class SubscribableBase {
	protected isCanceled = false;
	private cancelSubject = new Subject<void>();
	private cancel$ = this.cancelSubject.asObservable();

	public readonly subs: Subscription[] = [];
	protected subjects: Record<string, Subject<any>> = {};

	/**
	 * Cancel
	 *
	 * Make sure we clean up subscriptions:
	 * - things we subscribe to in this class, also
	 * - complete the subjects accessible from this class
	 */
	cancel() {
		this.subs.forEach((sub) => sub.unsubscribe());
		Object.values(this.subjects).forEach((subject) => subject.complete());
		this.isCanceled = true;
		this.cancelSubject.next();
		this.cancelSubject.complete();
	}
}
