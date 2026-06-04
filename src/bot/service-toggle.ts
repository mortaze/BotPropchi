export const BOT_TEXT_FEATURES: Record<string, string> = {
  '🎯 کدهای تخفیف': 'discount_codes',
  '🏢 پراپ فرم‌ها': 'prop_firms',
  '🔍 جستجو': 'discount_codes',
  '🎰 قرعه‌کشی': 'lottery',
  '⭐️ امتیاز من': 'points',
  '🏆 لیدربورد': 'leaderboard',
  '👥 دعوت دوستان': 'referrals',
  '📊 گزارشات': 'reports',
  '🤖 هوش مصنوعی پراپ هاب': 'ai_assistant',
};

export function featureForCallback(data?: string) {
  if (!data) return null;
  if (/^(firm|firmPage|copy|back:discounts)/.test(data)) return 'discount_codes';
  if (/^propReview:/.test(data)) return 'prop_firm_check';
  if (/^lottery:/.test(data)) return 'lottery';
  return null;
}
