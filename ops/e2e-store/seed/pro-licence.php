<?php
/**
 * Test-only Pro licence flag: mark woocommerce-pos-pro's licence `activated`,
 * with no key, so Pro registers its stores and lists them to the cashier API.
 * Idempotent: writes only when the flag is not already set.
 *
 *     wp eval-file /e2e-ops/seed/pro-licence.php
 *
 * Pro 2.x reads the flag in Init (LicenseSettings::from_database()->is_activated())
 * and starts its Stores service only when it is true; it has no development or
 * test constant that forces it. Nothing here reads, stores or sends a licence
 * key, and Pro only contacts its licence server from wp-admin's updates screen.
 * Local to this tailnet-only test store; README "Test-only Pro licence flag".
 */

$option  = 'woocommerce_pos_pro_settings_license';
$license = get_option( $option, array() );
$license = is_array( $license ) ? $license : array();

if ( ! empty( $license['activated'] ) ) {
	WP_CLI::log( 'pro licence: test-only flag already set' );
	return;
}

$license['activated'] = true;
// Autoloaded, as Pro's License_Section declares: the row is read on every request.
update_option( $option, $license, true );
WP_CLI::log( 'pro licence: test-only flag set (activated, no key)' );
