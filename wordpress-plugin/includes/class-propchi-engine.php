<?php
if (!defined('ABSPATH')) { exit; }

final class Propchi_Engine {
    public static function handle($telegram_id, $message, $user_data = array()) {
        $message = Propchi_Utils::normalize_text($message);
        if ($message === '') {
            return array('response' => 'پیام خالی است.', 'source' => 'database');
        }
        if (!Propchi_DB::user_has_access($telegram_id)) {
            return array('response' => 'دسترسی شما به این سرویس فعال نیست.', 'source' => 'database');
        }
        $cached = Propchi_DB::cache_get($message);
        if ($cached) {
            return array('response' => $cached['response'], 'source' => 'cache');
        }
        $db_answer = Propchi_DB::find_answer($message);
        if ($db_answer) {
            Propchi_DB::cache_set($message, $db_answer, 'database');
            return array('response' => $db_answer, 'source' => 'database');
        }
        $ai = Propchi_Gemini::generate($message, $user_data);
        Propchi_DB::cache_set($message, $ai['response'], $ai['source']);
        return $ai;
    }
}
