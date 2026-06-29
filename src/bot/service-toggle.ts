export const BOT_TEXT_FEATURES: Record<string, string> = {
  '🎰 قرعه‌کشی': 'lottery',
  '⭐️ امتیاز من': 'points',
  '🏆 لیدربورد': 'leaderboard',
  '👥 دعوت دوستان': 'referrals',
  '📊 گزارشات': 'reports',
  '📋 Posts': 'posts',
  '🎫 تیکت': 'ticket_system',
  '🎫 ایجاد تیکت جدید': 'ticket_system',
  '📋 تیکت\u200cهای من': 'ticket_system',
};

export function featureForCallback(data?: string) {
  if (!data) return null;
  if (/^lottery:/.test(data)) return 'lottery';
  if (/^ticket:/.test(data)) return 'ticket_system';
  if (data.startsWith('referral:show_leaderboard') || data.startsWith('referral:')) return 'referrals';
  return null;
}
