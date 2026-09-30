<?php
/**
 * Plugin Name: E2E store tweaks
 * Description: Mounted by ops/e2e-store/compose.yaml as a must-use plugin.
 */

// There is no mail server on the E2E store: make every wp_mail() (new-customer,
// order and password emails) a silent no-op instead of a sendmail error.
add_filter( 'pre_wp_mail', '__return_false' );
