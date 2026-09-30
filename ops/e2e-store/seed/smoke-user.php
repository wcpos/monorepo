<?php
/**
 * Throwaway cashier for smoke.sh's login round-trip, so the smoke test never
 * needs a stored credential. Password comes from E2E_SMOKE_PASS, never argv.
 *
 *     wp eval-file /e2e-ops/seed/smoke-user.php create e2e-smoke-abc123
 *     wp eval-file /e2e-ops/seed/smoke-user.php delete e2e-smoke-abc123
 */

require_once ABSPATH . 'wp-admin/includes/user.php';

list( $mode, $login ) = array_pad( $args, 2, '' );
if ( ! preg_match( '/^e2e-smoke-[a-f0-9]+$/', $login ) ) {
	WP_CLI::error( 'smoke user login must look like e2e-smoke-<hex>' );
}

if ( 'create' === $mode ) {
	$password = getenv( 'E2E_SMOKE_PASS' );
	if ( ! $password ) {
		WP_CLI::error( 'E2E_SMOKE_PASS is not set' );
	}
	$id = wp_insert_user(
		array(
			'user_login' => $login,
			'user_email' => "$login@example.test",
			'user_pass'  => $password,
			'role'       => 'cashier',
		)
	);
	if ( is_wp_error( $id ) ) {
		WP_CLI::error( $id->get_error_message() );
	}
	WP_CLI::log( "created $login (#$id)" );
} elseif ( 'delete' === $mode ) {
	$user = get_user_by( 'login', $login );
	if ( $user ) {
		wp_delete_user( $user->ID );
		WP_CLI::log( "deleted $login" );
	}
} else {
	WP_CLI::error( "unknown mode $mode (create|delete)" );
}
