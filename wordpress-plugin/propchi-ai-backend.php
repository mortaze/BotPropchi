<?php
/**
 * Plugin Name: Propchi AI Backend
 * Description: Backend هوشمند وردپرس برای اتصال ربات تلگرام پراپچی به دیتابیس وردپرس و Google Gemini.
 * Version: 1.0.0
 * Author: Propchi
 * Text Domain: propchi-ai-backend
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PROPCHI_AI_BACKEND_VERSION', '1.0.0');
define('PROPCHI_AI_BACKEND_FILE', __FILE__);
define('PROPCHI_AI_BACKEND_DIR', plugin_dir_path(__FILE__));
define('PROPCHI_AI_BACKEND_URL', plugin_dir_url(__FILE__));

require_once PROPCHI_AI_BACKEND_DIR . 'includes/class-propchi-utils.php';
require_once PROPCHI_AI_BACKEND_DIR . 'includes/class-propchi-activator.php';
require_once PROPCHI_AI_BACKEND_DIR . 'includes/class-propchi-settings.php';
require_once PROPCHI_AI_BACKEND_DIR . 'includes/class-propchi-security.php';
require_once PROPCHI_AI_BACKEND_DIR . 'includes/class-propchi-db.php';
require_once PROPCHI_AI_BACKEND_DIR . 'includes/class-propchi-gemini.php';
require_once PROPCHI_AI_BACKEND_DIR . 'includes/class-propchi-engine.php';
require_once PROPCHI_AI_BACKEND_DIR . 'includes/class-propchi-rest.php';
require_once PROPCHI_AI_BACKEND_DIR . 'admin/class-propchi-admin.php';

register_activation_hook(__FILE__, array('Propchi_Activator', 'activate'));
register_deactivation_hook(__FILE__, array('Propchi_Activator', 'deactivate'));

add_action('plugins_loaded', static function () {
    Propchi_Settings::init();
    Propchi_REST::init();
    if (is_admin()) {
        Propchi_Admin::init();
    }
});
