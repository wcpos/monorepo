// The notifier lives with the service so start/stop cannot be missed; this
// module keeps the previous import path.
export {
	getCustomerDisplayServiceStartVersion,
	notifyCustomerDisplayServiceStart,
	subscribeCustomerDisplayServiceStart,
} from '../../../../services/customer-display';
