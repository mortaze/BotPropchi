import { PrismaClient } from '@prisma/client';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const testData = [
  { 'id': '1', 'name': 'سرمایه گذار برتر', 'aliases': 'Sarmayegozar Bartar, سرمایه گذار', 'summary': 'پرداخت ریالی - پشتیبانی فارسی - بدون محدودیت زمانی', 'website': 'https://sarmayegozarbartar.com/?ref=propchi', 'discount_code': 'PROPCHI5', 'discount_percent': '5%', 'active': 'TRUE' },
  { 'id': '2', 'name': 'فاندد مکس', 'aliases': 'FundedMax, فاندد مکث', 'summary': 'تارگت منعطف - اسپرد پایین - چالش یک مرحله‌ای', 'website': 'https://fundedmax.com/?ref=propchi', 'discount_code': 'MAXPROPCHI', 'discount_percent': '10%', 'active': 'TRUE' },
  { 'id': '3', 'name': 'پراپی', 'aliases': 'Propi', 'summary': 'سرورهای اختصاصی - پرداخت رمزارزی - دریافت سود ۸۰ درصد', 'website': 'https://propi.ir/?ref=propchi', 'discount_code': 'PROPI_CHI', 'discount_percent': '8%', 'active': 'TRUE' },
  { 'id': '4', 'name': 'ستارگان ترید', 'aliases': 'Setaregan Trade', 'summary': 'پشتیبانی ۲۴ ساعته - برداشت سود دو هفته‌ای - چالش دو مرحله‌ای', 'website': 'https://setaregantrade.com/?ref=propchi', 'discount_code': 'STARCHI10', 'discount_percent': '10%', 'active': 'TRUE' },
  { 'id': '5', 'name': 'پراپ ترید فاند', 'aliases': 'Prop Trade Fund, PTF', 'summary': 'حساب‌های متنوع - ترید در خبر مجاز - بدون محدودیت سبک ترید', 'website': 'https://proptradefund.com/?ref=propchi', 'discount_code': 'PTFCHI', 'discount_percent': '5%', 'active': 'TRUE' },
  { 'id': '6', 'name': 'تریدینگ فاند', 'aliases': 'Trading Fund', 'summary': 'قوانین ساده - دراوداون محاسبه بر اساس بالانس - اکانت‌های بزرگ', 'website': 'https://tradingfund.com/?ref=propchi', 'discount_code': 'TRDFUND7', 'discount_percent': '7%', 'active': 'TRUE' },
  { 'id': '7', 'name': 'فاندد نکست', 'aliases': 'FundedNext', 'summary': 'ترید در روزهای تعطیل - تقسیم سود از فاز چالش - سرورهای پرسرعت', 'website': 'https://fundednext.com/?ref=propchi', 'discount_code': 'FNEXTCHI', 'discount_percent': '10%', 'active': 'TRUE' },
  { 'id': '8', 'name': 'اف تی ام او', 'aliases': 'FTMO', 'summary': 'معتبرترین پراپ فرم جهانی - قوانین سخت‌گیرانه اما مطمئن', 'website': 'https://ftmo.com/?ref=propchi', 'discount_code': 'FTMOCHI', 'discount_percent': '5%', 'active': 'FALSE' },
  { 'id': '9', 'name': 'فیدل کرست', 'aliases': 'Fidelcrest', 'summary': 'تارگت سود بالا اما پاداش جذاب - حساب‌های پرو و نرمال', 'website': 'https://fidelcrest.com/?ref=propchi', 'discount_code': 'FIDELCHI', 'discount_percent': '15%', 'active': 'TRUE' },
  { 'id': '10', 'name': 'الفا کپیتال', 'aliases': 'Alpha Capital', 'summary': 'پلن‌های متنوع - برداشت بدون دردسر - داشبورد اختصاصی', 'website': 'https://alphacapitalgroup.uk/?ref=propchi', 'discount_code': 'ALPHACHI', 'discount_percent': '10%', 'active': 'TRUE' }
];

async function main() {
  try {
    const settings = await prisma.aiSettings.findFirst();
    if (!settings || !settings.googleSheetId || !settings.googleServiceAccountEmail || !settings.googlePrivateKey) {
      console.log('Google Sheets credentials not found in the database. Aborting.');
      process.exit(1);
    }

    console.log('Connecting to Google Sheets...');
    const auth = new JWT({
      email: settings.googleServiceAccountEmail,
      key: settings.googlePrivateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(settings.googleSheetId, auth);
    await doc.loadInfo();
    console.log(`Loaded Document: ${doc.title}`);

    const sheet = doc.sheetsByIndex[0]; // use first sheet
    console.log(`Clearing sheet: ${sheet.title}...`);
    await sheet.clear();

    console.log('Setting headers...');
    await sheet.setHeaderRow(['id', 'name', 'aliases', 'summary', 'website', 'discount_code', 'discount_percent', 'active']);

    console.log('Adding rows...');
    await sheet.addRows(testData);

    console.log('Successfully seeded Google Sheets with test data!');
  } catch (error) {
    console.error('Failed to seed Google Sheets:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
