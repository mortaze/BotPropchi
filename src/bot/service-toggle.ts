export const BOT_TEXT_FEATURES: Record<string, string> = {
  '🎰 قرعه‌کشی': 'lottery',
  '⭐️ امتیاز من': 'points',
  '🏆 لیدربورد': 'leaderboard',
  '👥 دعوت دوستان': 'referrals',
  '📊 گزارشات': 'reports',
  '📋 Posts': 'posts',
};

export function featureForCallback(data?: string) {
  if (!data) return null;
  if (/^lottery:/.test(data)) return 'lottery';
  return null;
}
