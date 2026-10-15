<?php
/**
 * Plugin Name: WCPOS E2E preview redirect (dev stores only)
 * Description: Lets the POS login page redirect to this project's EAS Hosting PR preview origins (https://wcpos--<id>.expo.app), so monorepo PR E2E runs can log in. Install on dev-pro and dev-free only, never on a production or customer store.
 * Version: 1.0.0
 *
 * Why: woocommerce-pos #2259 (eab45d8b, 2026-10-14) sends login tokens only to
 * the site's own origin, https://wcpos.expo.app and loopback hosts, and leaves
 * preview origins to this filter on purpose. Without it every PR whose E2E
 * logs in fresh fails with "Missing or invalid redirect_uri parameter."
 * (monorepo#2555, Deploy run 38732563222).
 *
 * The filter is woocommerce_pos_auth_redirect_origin_allowed (plugin 1.11.1+).
 * $origin is `scheme://host[:port]`, lower-cased, default port omitted, so an
 * origin with a path, a port, userinfo or any other host never matches.
 *
 * Install (Paul's call, 2026-10-15; the front desk or Paul applies it on the
 * VPS, never a worker): copy this file to wp-content/mu-plugins/ of the
 * dev-pro.wcpos.com and dev-free.wcpos.com installs, nowhere else. A
 * must-use plugin loads without activation and writes nothing to the
 * database.
 *
 * Verify: a PR's E2E global-setup logs "Auth complete for pro-cashier-N"
 * instead of "Missing or invalid redirect_uri parameter."
 *
 * Undo: delete the file from wp-content/mu-plugins/.
 *
 * @package WCPOS\DevStore
 */

defined( 'ABSPATH' ) || exit;

add_filter(
	'woocommerce_pos_auth_redirect_origin_allowed',
	static function ( $allowed, $origin ) {
		// Only ever widens: an origin the plugin already allows stays allowed.
		if ( $allowed ) {
			return true;
		}

		// Exactly this project's preview origins; no other expo.app subdomain.
		return 1 === preg_match( '/^https:\/\/wcpos--[a-z0-9]+\.expo\.app\z/', (string) $origin );
	},
	10,
	2
);
