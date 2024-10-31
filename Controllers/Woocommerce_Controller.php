<?php

/**
 * Woocommerce page class for Rocketfuel
 *
 * @author UdorBlessing
 */

namespace Rocketfuel_Gateway\Controllers;

use Rocketfuel_Gateway\Plugin;
use Rocketfuel_Gateway\Services\Subscription_Service;
use Rocketfuel_Gateway\Controllers\Cart_Handler_Controller;

class Woocommerce_Controller {

	public static function register() {

		add_action( 'plugins_loaded', array( __CLASS__, 'init_rocketfuel_gateway_class' ) );

		add_filter( 'woocommerce_payment_gateways', array( __CLASS__, 'add_gateway_class' ) );

		add_action( 'init', array( __CLASS__, 'register_partial_payment_order_status' ) );

		add_filter( 'wc_order_statuses', array( __CLASS__, 'add_partial_payment_to_order_status' ) );

		add_action( 'wp_ajax_nopriv_rocketfuel_process_user_data', array( __CLASS__, 'process_user_data' ) );

		add_action( 'wp_ajax_rocketfuel_process_user_data', array( __CLASS__, 'process_user_data' ) );

		add_action( 'wc_ajax_rocketfuel_process_checkout', array( __CLASS__, 'rocketfuel_process_checkout' ) );

		if ( ! is_admin() ) {

			add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_action' ) );
		}
		add_action(
			'wc_ajax_rocketfuel_process_block_checkout',
			array(
				__CLASS__,
				'process_user_data',
			)
		);

		add_action( 'woocommerce_checkout_update_order_meta', array( __CLASS__, 'add_temp_id_to_order' ) );

		add_action( 'woocommerce_subscription_status_cancelled', array( __CLASS__, 'cancel_subscription_order' ) );

		add_action( 'woocommerce_subscription_status_pending-cancelled', array( __CLASS__, 'cancel_subscription_order' ) );
		// add_filter( 'woocommerce_order_button_html', array( __CLASS__, 'hide_order_button_html' ) );
	}
	public static function hide_order_button_html() {
		$style       = 'style="display:none"';
		$button_text = apply_filters( 'woocommerce_order_button_text', __( 'Places order', 'woocommerce' ) );
		$button      = '<button type="submit" name="woocommerce_checkout_place_order" id="place_order" value="Place order" data-value="Place order" class="button alt" ' . $style . '>' . $button_text . '</button>';
		return $button;
	}
	/**
	 * Cancel Subscription
	 *
	 * @param
	 */
	public static function cancel_subscription_order( $subscription ) {

		// wcs_get_subscriptions_for_order( $order );

		$order_id = $subscription->get_parent_id();

		if ( ! $order_id ) {
			return false;
		}

		$temporary_order_id = get_post_meta( $order_id, 'rocketfuel_temp_orderid', true );

		if ( ! $temporary_order_id ) {
			return false;
		}

		$gateway = new Rocketfuel_Gateway_Controller();

		$order_items = $subscription->get_items();

		// Loop through order items
		foreach ( $order_items as $item_id => $item ) {

			$product = $item->get_product();

			// Or to get the simple subscription or the variation subscription product ID
			$_product_id = $product->get_id();

			$payload = array(
				'merchant_id'     => base64_encode( $gateway->merchant_id ),
				'merchant_auth'   => $gateway->get_encrypted(
					json_encode( array( 'subscriptionId' => $temporary_order_id . '-' . $_product_id ) ),
					false
				),
				'subscription_id' => $temporary_order_id . '-' . $_product_id,
				'endpoint'        => $gateway->endpoint,
			);

			try {

				$response = Subscription_Service::cancel_subscription( $payload );

				$response_body = wp_remote_retrieve_body( $response );
			} catch ( \Throwable $th ) {
				// throw $th;
			}
		}
	}

	/**
	 * Keep Temporary order_id for webhook
	 *
	 * @param string $order_id
	 */
	public static function add_temp_id_to_order( $order_id ) {

		if ( isset( $_POST ) ) {

			$temporary_order_id = sanitize_text_field( $_POST['temp_orderid_rocketfuel'] );
			$email              = sanitize_text_field( $_POST['billing_email'] );

			try {

				delete_option( 'rkfl_partial_payment_cache_' . $email );

				// delete_transient($temporary_order_id);

				$gateway = new Rocketfuel_Gateway_Controller();

				$gateway->swap_order_id( $temporary_order_id, $order_id );
			} catch ( \Throwable $th ) {
				// throw $th;
			}
			update_post_meta( $order_id, 'rocketfuel_temp_orderid', $temporary_order_id );
			$order_status_rocketfuel = isset( $_POST['order_status_rocketfuel'] ) ? sanitize_text_field( wp_unslash( $_POST['order_status_rocketfuel'] ) ) : null;
			if ( null !== $order_status_rocketfuel && 'wc-on-hold' !== $order_status_rocketfuel ) {
				try {
					$order = wc_get_order( $order_id );

					$order->update_status( $order_status_rocketfuel );
				} catch ( \Throwable $th ) {
					return false;
					// silently ignore
				}
			}
		}
	}

	public static function rocketfuel_process_checkout() {
		Cart_Handler_Controller::rocketfuel_process_checkout();
	}
	public static function process_user_data() {
		Cart_Handler_Controller::process_user_data();
	}

	/**
	 * Enqueue Rocketfuel scripts
	 */
	public static function enqueue_action() {
		// if ( is_page( 'checkout' ) ) {
			wp_enqueue_script( 'wc-gateway-rkfl-script', Plugin::get_url( 'assets/js/rkfl.js' ), array(), time() );
			wp_enqueue_style( 'wc-gateway-rkfl-frontend', Plugin::get_url( 'assets/css/rkfl-iframe.css' ), array(), Plugin::get_ver() );
		// }

		// wp_register_script('wc-gateway-rkfl-script', 'https://d3rpjm0wf8u2co.cloudfront.net/static/rkfl.js', array(), Plugin::get_ver());

		$data = array(
			'start_checkout_nonce'     => wp_create_nonce( '_wc_rkfl_start_checkout_nonce' ),
			'start_checkout_url'       => \WC_AJAX::get_endpoint( 'rocketfuel_process_checkout' ),
			'start_block_checkout_url' => \WC_AJAX::get_endpoint( 'rocketfuel_process_block_checkout' ),
			'return_url'               => wc_get_checkout_url(),
			'cancel_url'               => '',
		);
		wp_localize_script( 'wc-gateway-rkfl-script', 'wc_rkfl_context', $data );

		wp_register_script( 'wc-gateway-rkfl-payment-buttons', Plugin::get_url( 'assets/js/rkfl-button.js' ), array(), Plugin::get_ver() );
	}
	public static function add_gateway_class( $methods ) {

		if ( class_exists( 'WC_Subscriptions_Order' ) && class_exists( 'WC_Payment_Gateway_CC' ) ) {
			$methods[] = 'Rocketfuel_Gateway\Controllers\Rocketfuel_Gateway_Subscription_Controller';
		} else {
			$methods[] = 'Rocketfuel_Gateway\Controllers\Rocketfuel_Gateway_Controller';
		}

		return $methods;
	}
	/**
	 * Initiate the gateway
	 */
	public static function init_rocketfuel_gateway_class() {
		if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
			return;
		}
		// $this->enqueue_action();
		require_once 'Rocketfuel_Gateway_Controller.php';
	}
	/**
	 * Register custom order status
	 */
	public static function register_partial_payment_order_status() {
		$args = array(
			'label'                     => 'Partial payment',
			'public'                    => true,
			'show_in_admin_status_list' => true,
			'show_in_admin_all_list'    => true,
			'exclude_from_search'       => false,
			'label_count'               => _n_noop( 'Partial Payment <span class="count">(%s)</span>', 'Partial Payments <span class="count">(%s)</span>' ),
		);
		register_post_status( 'wc-partial-payment', $args );
	}
	/**
	 * Add custom order status
	 *
	 * @param string $order_status
	 *
	 * @return array
	 */
	public static function add_partial_payment_to_order_status( $order_statuses ) {
		$new_order_statuses = array();
		foreach ( $order_statuses as $key => $status ) {
			$new_order_statuses[ $key ] = $status;
			if ( 'wc-on-hold' === $key ) {
				$new_order_statuses['wc-partial-payment'] = 'Partial payment';
			}
		}
		return $new_order_statuses;
	}
}
