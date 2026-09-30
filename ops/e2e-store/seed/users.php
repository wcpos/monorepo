<?php
/**
 * E2E identities. Idempotent. Passwords arrive ONLY through the environment
 * (never argv), are never printed, and seed.sh stores them in the keychain.
 *
 *     wp eval-file /e2e-ops/seed/users.php status   # which groups need a password
 *     wp eval-file /e2e-ops/seed/users.php apply    # create users, set given passwords
 *
 * Groups and the variables that carry their password on `apply`:
 *   cashiers  e2e-cashier-1..16 (cashier)       E2E_CASHIER_PASS, ONE password for
 *             all 16, because the suite reads a single E2E_CASHIER_PASS
 *   writer    e2e-product-writer (shop_manager)  E2E_WRITER_PASS
 *   admin     e2e-admin (administrator)          E2E_ADMIN_PASS
 * A group needs a password when any member is missing or was never given one
 * by this script; `apply` without a group's variable leaves its passwords alone.
 *
 * Also created, without secrets:
 *   demo / demo (cashier): the free variant's built-in default login
 *     (E2E_USERNAME / E2E_PASSWORD fall back to demo / demo in fixtures.ts, and
 *     CI sets neither), as on dev-next;
 *   75 customers, more than one 50-row picker page (customer-picker-paging).
 */

const E2E_PASSWORD_META = '_e2e_password_set';
const E2E_CASHIERS      = 16;
const E2E_CUSTOMERS     = 75;

$groups = array(
	'cashiers' => array( 'role' => 'cashier', 'env' => 'E2E_CASHIER_PASS', 'users' => array() ),
	'writer'   => array( 'role' => 'shop_manager', 'env' => 'E2E_WRITER_PASS', 'users' => array( 'e2e-product-writer' ) ),
	'admin'    => array( 'role' => 'administrator', 'env' => 'E2E_ADMIN_PASS', 'users' => array( 'e2e-admin' ) ),
);
for ( $i = 1; $i <= E2E_CASHIERS; $i++ ) {
	$groups['cashiers']['users'][] = "e2e-cashier-$i";
}

$mode = $args[0] ?? 'status';

if ( 'status' === $mode ) {
	foreach ( $groups as $name => $group ) {
		$needs = false;
		foreach ( $group['users'] as $login ) {
			$user = get_user_by( 'login', $login );
			if ( ! $user || ! get_user_meta( $user->ID, E2E_PASSWORD_META, true ) ) {
				$needs = true;
				break;
			}
		}
		WP_CLI::line( sprintf( '%s=%s', $name, $needs ? 'needs-password' : 'ok' ) );
	}
	return;
}

if ( 'apply' !== $mode ) {
	WP_CLI::error( "unknown mode $mode (status|apply)" );
}

function e2e_ensure_user( $login, $role, $display ) {
	$user = get_user_by( 'login', $login );
	if ( $user ) {
		if ( ! in_array( $role, (array) $user->roles, true ) ) {
			$user->set_role( $role );
		}
		return $user->ID;
	}
	$id = wp_insert_user(
		array(
			'user_login'   => $login,
			'user_email'   => "$login@example.test",
			'user_pass'    => wp_generate_password( 32 ),
			'role'         => $role,
			'display_name' => $display,
			'first_name'   => $display,
		)
	);
	if ( is_wp_error( $id ) ) {
		WP_CLI::error( "user $login: " . $id->get_error_message() );
	}
	WP_CLI::log( "user: created $login ($role)" );
	return $id;
}

foreach ( $groups as $name => $group ) {
	$password = getenv( $group['env'] );
	foreach ( $group['users'] as $login ) {
		$id = e2e_ensure_user( $login, $group['role'], $login );
		if ( $password ) {
			wp_set_password( $password, $id );
			update_user_meta( $id, E2E_PASSWORD_META, gmdate( 'c' ) );
		}
	}
	if ( $password ) {
		WP_CLI::log( sprintf( 'password: set for %d %s user(s)', count( $group['users'] ), $name ) );
	}
}

$demo = e2e_ensure_user( 'demo', 'cashier', 'Demo Cashier' );
if ( ! get_user_meta( $demo, E2E_PASSWORD_META, true ) ) {
	wp_set_password( 'demo', $demo );
	update_user_meta( $demo, E2E_PASSWORD_META, 'well-known' );
}

$created = 0;
for ( $i = 1; $i <= E2E_CUSTOMERS; $i++ ) {
	$email = sprintf( 'e2e-customer-%02d@example.test', $i );
	if ( email_exists( $email ) ) {
		continue;
	}
	$customer = new WC_Customer();
	$customer->set_email( $email );
	$customer->set_username( sprintf( 'e2e-customer-%02d', $i ) );
	$customer->set_password( wp_generate_password( 32 ) );
	$customer->set_first_name( 'Customer' );
	$customer->set_last_name( sprintf( 'E2E %02d', $i ) );
	$customer->set_billing_first_name( 'Customer' );
	$customer->set_billing_last_name( sprintf( 'E2E %02d', $i ) );
	$customer->set_billing_email( $email );
	$customer->set_billing_country( 'GB' );
	$customer->set_billing_city( 'London' );
	$customer->save();
	++$created;
}
WP_CLI::log( "customers: $created created" );
