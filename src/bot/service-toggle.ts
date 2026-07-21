export const BOT_TEXT_FEATURES: Record<string, string> = {
  '🎰 قرعه‌کشی': 'lottery',
  '🏆 امتیازهای من': 'leaderboard',
  '⭐️ امتیاز من': 'leaderboard',
  '👥 دعوت دوستان': 'referrals',
  '🎫 تیکت': 'ticket_system',
  '🎫 ایجاد تیکت جدید': 'ticket_system',
  '📋 تیکت\u200cهای من': 'ticket_system',
  '📊 گزارشات': 'reports',
  '📋 Posts': 'posts',
  '📰 اخبار فارکس': 'forex_news',
};

export function featureForCallback(data?: string) {
  if (!data) return null;
  if (/^lottery:/.test(data)) return 'lottery';
  if (/^ticket:/.test(data)) return 'ticket_system';
  if (data.startsWith('referral:')) return 'referrals';
  return null;
}
