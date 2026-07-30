/**
 * Authoritative yard list from Nippon stockyard master sheet (Jul 2026).
 * Each row is a scannable physical location; codes may repeat across sites.
 */

type YardRow = {
  code: string;
  primary: string;
  area: string;
  district: string;
  site: string;
  capacity?: number;
};

const YARD_ROWS: YardRow[] = [
  // Cochin
  { code: 'CO01A', primary: 'Nettoor', area: 'Nettoor', district: 'Cochin', site: 'Showroom' },
  { code: 'CO01A', primary: 'Nettoor', area: 'Cherthala', district: 'Cochin', site: 'T-Sparsh, Thankey' },
  { code: 'CO01B', primary: 'Kalamassery', area: 'Kalamassery', district: 'Cochin', site: 'JNS Stadium Land' },
  { code: 'CO01B', primary: 'Kalamassery', area: 'Kalamassery', district: 'Cochin', site: 'Showroom' },
  { code: 'CO01B', primary: 'Kalamassery', area: 'Kalamassery', district: 'Cochin', site: 'Towers-7th floor' },
  { code: 'CO01B', primary: 'Kalamassery', area: 'Kalamassery', district: 'Cochin', site: 'St.Joseph Hospital Trust Land' },
  { code: 'CO01B', primary: 'Kalamassery', area: 'Kalamassery', district: 'Cochin', site: 'Vallathole BP adjacent area' },
  { code: 'KY01A', primary: 'Kayamkulam', area: 'Kayamkulam', district: 'Cochin', site: 'Showroom' },
  { code: 'KY01A', primary: 'Kayamkulam', area: 'Kayamkulam', district: 'Cochin', site: 'Showroom adjacent-Ramapuram East' },
  { code: 'KY01A', primary: 'Kayamkulam', area: 'Kayamkulam', district: 'Cochin', site: 'Showroom adjacent-Ramapuram West' },
  { code: 'KY01A', primary: 'Kayamkulam', area: 'Kayamkulam', district: 'Cochin', site: 'Showroom adjacent-Evoor' },
  { code: 'KY01A', primary: 'Kayamkulam', area: 'Mavelikkara', district: 'Cochin', site: 'T-Sparsh, Mavelikkara' },
  { code: 'KY01A', primary: 'Kayamkulam', area: 'Thankey', district: 'Cochin', site: 'T-Sparsh, Thankey' },
  { code: 'KY01A', primary: 'Kayamkulam', area: 'Kunnathur', district: 'Cochin', site: 'T-Sparsh, Sasthamkotta' },
  // Thrissur
  { code: 'TI01A', primary: 'Thrissur', area: 'Thrissur', district: 'Thrissur', site: 'Showroom' },
  { code: 'TI01A', primary: 'Thrissur', area: 'Thrissur', district: 'Thrissur', site: 'Peramangalam, Mundur' },
  { code: 'TI01A', primary: 'Thrissur', area: 'Wadakkanchery', district: 'Thrissur', site: 'T-Sparsh, Wadakkanchery' },
  { code: 'TI01A', primary: 'Thrissur', area: 'Thrithallur', district: 'Thrissur', site: 'T-Sparsh, Thrithallur' },
  { code: 'TI01B', primary: 'Nadathara', area: 'Thrissur', district: 'Thrissur', site: 'Showroom' },
  { code: 'TI01C', primary: 'Chavakkad', area: 'Arthat, Kunnamkulam', district: 'Thrissur', site: 'Showroom' },
  { code: 'IR01A', primary: 'Irinjalakkuda', area: 'Irinjalakkuda', district: 'Thrissur', site: 'Showroom' },
  { code: 'IR01A', primary: 'Irinjalakkuda', area: 'Chenthrappinny', district: 'Thrissur', site: 'T-Sparsh, Chenthrappinny' },
  { code: 'IR01A', primary: 'Irinjalakkuda', area: 'Chalakkudy', district: 'Thrissur', site: 'T-Sparsh, Chalakkudy' },
  { code: 'MV01A', primary: 'Muvattupuzha', area: 'Muvattupuzha', district: 'Thrissur', site: 'Showroom' },
  { code: 'MV01A', primary: 'Muvattupuzha', area: 'Muvattupuzha', district: 'Thrissur', site: 'Showroom adjacent area' },
  { code: 'MV01A', primary: 'Muvattupuzha', area: 'Muvattupuzha', district: 'Thrissur', site: 'Mekkadambu yard' },
  { code: 'MV01A', primary: 'Muvattupuzha', area: 'Kothamangalam', district: 'Thrissur', site: 'T-Sparsh, Kothamangalam' },
  { code: 'MV01A', primary: 'Muvattupuzha', area: 'Kuthattukulam', district: 'Thrissur', site: 'T-Sparsh, Kuthattukulam' },
  // Kottayam
  { code: 'KT01A', primary: 'Kottayam', area: 'Nattakam', district: 'Kottayam', site: 'Showroom' },
  { code: 'KT01A', primary: 'Kottayam', area: 'Nattakam', district: 'Kottayam', site: 'Showroom adjacent area' },
  { code: 'KT01A', primary: 'Kottayam', area: 'Nattakam', district: 'Kottayam', site: 'Showroom nearby-helipad area' },
  { code: 'KT01A', primary: 'Kottayam', area: 'Nattakam', district: 'Kottayam', site: 'Showroom nearby-school area' },
  { code: 'KT01A', primary: 'Kottayam', area: 'Ettumanoor', district: 'Kottayam', site: '1S, Ettumanoor' },
  { code: 'KT01A', primary: 'Kottayam', area: 'Vaikom', district: 'Kottayam', site: 'T-Sparsh, Vaikom' },
  { code: 'KT01A', primary: 'Kottayam', area: 'Kuravilangadu', district: 'Kottayam', site: 'T-Sparsh, Uzhavoor' },
  { code: 'KT01A', primary: 'Kottayam', area: 'Changanassery', district: 'Kottayam', site: 'T-Sparsh, Changanachery' },
  { code: 'KT01A', primary: 'Kottayam', area: 'Kanjirappally', district: 'Kottayam', site: 'T-Sparsh, Kanjirappally' },
  { code: 'KT01B', primary: 'Pala', area: 'Meenachil', district: 'Kottayam', site: 'Showroom' },
  { code: 'TL01A', primary: 'Thiruvalla', area: 'Thiruvalla', district: 'Kottayam', site: 'Showroom' },
  { code: 'TL01A', primary: 'Thiruvalla', area: 'Thiruvalla', district: 'Kottayam', site: 'Showroom adjacent area' },
  { code: 'TL01A', primary: 'Thiruvalla', area: 'Chengannur', district: 'Kottayam', site: 'T-Sparsh, Chengannur' },
  { code: 'TL01A', primary: 'Thiruvalla', area: 'Mallappally', district: 'Kottayam', site: 'T-Sparsh, Mallappally' },
  { code: 'PH01A', primary: 'Pathanamthitta', area: 'Pathanamthitta', district: 'Kottayam', site: 'Showroom' },
  { code: 'PH01A', primary: 'Pathanamthitta', area: 'Pathanamthitta', district: 'Kottayam', site: 'Accessory area' },
  { code: 'PH01A', primary: 'Pathanamthitta', area: 'Pathanamthitta', district: 'Kottayam', site: 'Nearby Showroom' },
  { code: 'PH01A', primary: 'Pathanamthitta', area: 'Adoor', district: 'Kottayam', site: 'T-Sparsh, Adoor' },
  { code: 'PH01A', primary: 'Pathanamthitta', area: 'Konni', district: 'Kottayam', site: 'T-Sparsh, Konni' },
  { code: 'PH01A', primary: 'Pathanamthitta', area: 'Ranni', district: 'Kottayam', site: 'T-Sparsh, Ranni' },
  // Trivandrum
  { code: 'TR01A', primary: 'Trivandrum', area: 'Kazhakkuttam', district: 'Trivandrum', site: 'Showroom' },
  { code: 'TR01A', primary: 'Trivandrum', area: 'Kazhakkuttam', district: 'Trivandrum', site: 'Yard-1, Mess area' },
  { code: 'TR01A', primary: 'Trivandrum', area: 'Kazhakkuttam', district: 'Trivandrum', site: 'Yard-2, Luxon yard' },
  { code: 'TR01A', primary: 'Trivandrum', area: 'Kazhakkuttam', district: 'Trivandrum', site: 'Yard-3, Kushamuttom' },
  { code: 'TR01A', primary: 'Trivandrum', area: 'Varkkala', district: 'Trivandrum', site: 'T-Sparsh, Varkkala' },
  { code: 'TR01C', primary: 'Enchakkal', area: 'Enchakkal', district: 'Trivandrum', site: 'Showroom' },
  { code: 'TR01C', primary: 'Enchakkal', area: 'Enchakkal', district: 'Trivandrum', site: 'Showroom adjacent area' },
  { code: 'TR01C', primary: 'Enchakkal', area: 'Neyyattinkara', district: 'Trivandrum', site: 'T-Sparsh, Neyyattinkara' },
  { code: 'TR01C', primary: 'Enchakkal', area: 'Parassala', district: 'Trivandrum', site: 'T-Sparsh, Parassala' },
  { code: 'KL01A', primary: 'Kollam', area: 'Kottiyam', district: 'Trivandrum', site: 'Showroom' },
  { code: 'KL01A', primary: 'Kollam', area: 'Kottiyam', district: 'Trivandrum', site: 'Showroom adjacent area' },
  { code: 'KL01A', primary: 'Kollam', area: 'Thazhuthla', district: 'Trivandrum', site: 'BP adjacent area' },
  { code: 'KL01A', primary: 'Kollam', area: 'Anandavalleaswaram', district: 'Trivandrum', site: 'Festive Counter, Anandavalleaswaram' },
  { code: 'KL01A', primary: 'Kollam', area: 'Punalur', district: 'Trivandrum', site: 'T-Sparsh, Punalur' },
  { code: 'KL01A', primary: 'Kollam', area: 'Karunagappally', district: 'Trivandrum', site: 'T-Sparsh, Karunagappally' },
  { code: 'KL01A', primary: 'Kollam', area: 'Nilamel', district: 'Trivandrum', site: 'T-Sparsh, Nilamel' },
  { code: 'KL01A', primary: 'Kollam', area: 'Pathanapuram', district: 'Trivandrum', site: 'T-Sparsh, Pathanapuram' },
];

function buildYardData() {
  const counters = new Map<string, number>();
  return YARD_ROWS.map((row) => {
    const n = (counters.get(row.code) ?? 0) + 1;
    counters.set(row.code, n);
    return {
      id: `${row.code}-${n}`,
      code: row.code,
      name: `${row.site}, ${row.area}`,
      city: row.district,
      capacity: row.capacity ?? 50,
    };
  });
}

export const YARD_REGIONS = ['Cochin', 'Thrissur', 'Kottayam', 'Trivandrum'] as const;

export const YARD_DATA = buildYardData();
