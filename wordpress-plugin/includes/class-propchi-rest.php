<?php
if (!defined('ABSPATH')) { exit; }

final class Propchi_REST {
    public static function init() {
        add_action('rest_api_init', array(__CLASS__, 'routes'));
    }

    public static function routes() {
        register_rest_route('propchi/v1', '/message', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array(__CLASS__, 'message'),
            'permission_callback' => array('Propchi_Security', 'validate'),
            'args' => array(
                'telegram_id' => array('required' => true),
                'message' => array('required' => true),
                'user_data' => array('required' => false),
            ),
        ));
    }

    public static function message(WP_REST_Request $request) {
        $telegram_id = absint($request->get_param('telegram_id'));
        $message = (string) $request->get_param('message');
        $user_data = $request->get_param('user_data');
        if (!is_array($user_data)) { $user_data = array(); }
        try {
            $result = Propchi_Engine::handle($telegram_id, $message, $user_data);
            Propchi_DB::log($telegram_id, $message, $result['response'], $result['source']);
            return Propchi_Utils::json_response($result);
        } catch (Throwable $e) {
            $fallback = Propchi_Utils::option('fallback_message', 'خطا در پردازش درخواست.');
            Propchi_DB::log($telegram_id, $message, $fallback, 'gemini', 'error', $e->getMessage());
            return Propchi_Utils::json_response(array('response' => $fallback, 'source' => 'gemini'), 200);
        }
    }
}
