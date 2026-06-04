<?php
if (!defined('ABSPATH')) { exit; }

final class Propchi_Admin {
    public static function init() {
        add_action('admin_menu', array(__CLASS__, 'menu'));
        add_action('admin_post_propchi_add_gemini_key', array(__CLASS__, 'add_key'));
        add_action('admin_post_propchi_delete_gemini_key', array(__CLASS__, 'delete_key'));
    }

    public static function menu() {
        add_menu_page('Propchi AI Backend', 'Propchi AI', 'manage_options', 'propchi-ai-backend', array(__CLASS__, 'render'), 'dashicons-superhero-alt', 56);
    }

    public static function add_key() {
        if (!current_user_can('manage_options') || !check_admin_referer('propchi_add_gemini_key')) { wp_die('Forbidden'); }
        Propchi_Gemini::add_key($_POST['name'] ?? '', $_POST['api_key'] ?? '', !empty($_POST['is_active']), $_POST['weight'] ?? 1);
        wp_safe_redirect(admin_url('admin.php?page=propchi-ai-backend&tab=keys&updated=1'));
        exit;
    }

    public static function delete_key() {
        if (!current_user_can('manage_options') || !check_admin_referer('propchi_delete_gemini_key')) { wp_die('Forbidden'); }
        Propchi_Gemini::delete_key($_GET['id'] ?? 0);
        wp_safe_redirect(admin_url('admin.php?page=propchi-ai-backend&tab=keys&updated=1'));
        exit;
    }

    public static function render() {
        if (!current_user_can('manage_options')) { return; }
        $tab = sanitize_key($_GET['tab'] ?? 'settings');
        echo '<div class="wrap"><h1>Propchi AI Backend</h1>';
        echo '<nav class="nav-tab-wrapper">';
        foreach (array('settings' => 'تنظیمات', 'keys' => 'Gemini API Keys', 'logs' => 'لاگ درخواست‌ها') as $key => $label) {
            $active = $tab === $key ? ' nav-tab-active' : '';
            echo '<a class="nav-tab' . esc_attr($active) . '" href="' . esc_url(admin_url('admin.php?page=propchi-ai-backend&tab=' . $key)) . '">' . esc_html($label) . '</a>';
        }
        echo '</nav>';
        if ($tab === 'keys') { self::render_keys(); }
        elseif ($tab === 'logs') { self::render_logs(); }
        else { self::render_settings(); }
        echo '</div>';
    }

    private static function render_settings() {
        $options = Propchi_Settings::all();
        ?>
        <form method="post" action="options.php">
            <?php settings_fields('propchi_ai_backend'); ?>
            <table class="form-table" role="presentation">
                <tr><th>Bot API Key</th><td><input class="regular-text" name="propchi_ai_backend_options[bot_secret]" value="<?php echo esc_attr($options['bot_secret']); ?>"><p class="description">در هدر <code>x-propchi-bot-key</code> از سمت ربات ارسال می‌شود.</p></td></tr>
                <tr><th>Signature Secret</th><td><input class="regular-text" name="propchi_ai_backend_options[signature_secret]" value="<?php echo esc_attr($options['signature_secret']); ?>"><p class="description">برای HMAC: <code>x-propchi-signature = HMAC_SHA256(timestamp.body)</code>.</p></td></tr>
                <tr><th>AI Engine</th><td><label><input type="checkbox" name="propchi_ai_backend_options[ai_enabled]" value="1" <?php checked($options['ai_enabled']); ?>> فعال باشد</label></td></tr>
                <tr><th>Database Lookup</th><td><label><input type="checkbox" name="propchi_ai_backend_options[database_lookup_enabled]" value="1" <?php checked($options['database_lookup_enabled']); ?>> فعال باشد</label></td></tr>
                <tr><th>Cache</th><td><label><input type="checkbox" name="propchi_ai_backend_options[cache_enabled]" value="1" <?php checked($options['cache_enabled']); ?>> فعال باشد</label> TTL: <input type="number" name="propchi_ai_backend_options[cache_ttl]" value="<?php echo esc_attr($options['cache_ttl']); ?>" min="30"></td></tr>
                <tr><th>Gemini Model</th><td><input class="regular-text" name="propchi_ai_backend_options[gemini_model]" value="<?php echo esc_attr($options['gemini_model']); ?>"></td></tr>
                <tr><th>System Prompt</th><td><textarea class="large-text" rows="5" name="propchi_ai_backend_options[system_prompt]"><?php echo esc_textarea($options['system_prompt']); ?></textarea></td></tr>
                <tr><th>Fallback Message</th><td><textarea class="large-text" rows="3" name="propchi_ai_backend_options[fallback_message]"><?php echo esc_textarea($options['fallback_message']); ?></textarea></td></tr>
                <tr><th>Disabled Message</th><td><textarea class="large-text" rows="2" name="propchi_ai_backend_options[disabled_message]"><?php echo esc_textarea($options['disabled_message']); ?></textarea></td></tr>
                <tr><th>Allowed DB Tables</th><td><textarea class="large-text code" rows="6" name="propchi_ai_backend_options[allowed_tables]"><?php echo esc_textarea($options['allowed_tables']); ?></textarea><p class="description">هر جدول در یک خط؛ افزونه فقط همین جدول‌ها را جستجو می‌کند.</p></td></tr>
            </table>
            <?php submit_button('ذخیره تنظیمات'); ?>
        </form>
        <?php
    }

    private static function render_keys() {
        $keys = Propchi_Gemini::keys();
        ?>
        <h2>افزودن API Key</h2>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('propchi_add_gemini_key'); ?>
            <input type="hidden" name="action" value="propchi_add_gemini_key">
            <input name="name" placeholder="نام" class="regular-text">
            <input name="api_key" placeholder="Gemini API Key" class="regular-text" autocomplete="off">
            <input name="weight" type="number" value="1" min="1" style="width:80px">
            <label><input type="checkbox" name="is_active" value="1" checked> فعال</label>
            <?php submit_button('افزودن', 'primary', '', false); ?>
        </form>
        <h2>کلیدها و Load Balancer</h2>
        <table class="widefat striped"><thead><tr><th>ID</th><th>نام</th><th>Key</th><th>فعال</th><th>Weight</th><th>Requests</th><th>Last Used</th><th></th></tr></thead><tbody>
        <?php foreach ($keys as $key): ?>
            <tr><td><?php echo esc_html($key['id']); ?></td><td><?php echo esc_html($key['name']); ?></td><td><?php echo esc_html($key['key_preview']); ?></td><td><?php echo $key['is_active'] ? '✅' : '❌'; ?></td><td><?php echo esc_html($key['weight']); ?></td><td><?php echo esc_html($key['request_count']); ?></td><td><?php echo esc_html($key['last_used_at']); ?></td><td><a class="button-link-delete" href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=propchi_delete_gemini_key&id=' . absint($key['id'])), 'propchi_delete_gemini_key')); ?>">حذف</a></td></tr>
        <?php endforeach; ?>
        </tbody></table>
        <?php
    }

    private static function render_logs() {
        global $wpdb;
        $logs = $wpdb->get_results('SELECT * FROM ' . Propchi_Utils::table('request_logs') . ' ORDER BY id DESC LIMIT 100', ARRAY_A);
        echo '<table class="widefat striped"><thead><tr><th>زمان</th><th>Telegram ID</th><th>پیام</th><th>پاسخ</th><th>Source</th><th>Status</th><th>Error</th></tr></thead><tbody>';
        foreach ($logs as $log) {
            echo '<tr><td>' . esc_html($log['created_at']) . '</td><td>' . esc_html($log['telegram_id']) . '</td><td>' . esc_html(wp_trim_words($log['message'], 12)) . '</td><td>' . esc_html(wp_trim_words($log['response'], 16)) . '</td><td>' . esc_html($log['source']) . '</td><td>' . esc_html($log['status']) . '</td><td>' . esc_html($log['error']) . '</td></tr>';
        }
        echo '</tbody></table>';
    }
}
