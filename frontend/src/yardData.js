/**
 * Authoritative yard list from Nippon stockyard master sheet (Jul 2026).
 * Keep in sync with backend/src/lib/yardData.ts
 */

const YARD_ROWS = [
  { code: "CO01A", area: "Nettoor", district: "Cochin", site: "Showroom" },
  { code: "CO01A", area: "Cherthala", district: "Cochin", site: "T-Sparsh, Thankey" },
  { code: "CO01B", area: "Kalamassery", district: "Cochin", site: "JNS Stadium Land" },
  { code: "CO01B", area: "Kalamassery", district: "Cochin", site: "Showroom" },
  { code: "CO01B", area: "Kalamassery", district: "Cochin", site: "Towers-7th floor" },
  { code: "CO01B", area: "Kalamassery", district: "Cochin", site: "St.Joseph Hospital Trust Land" },
  { code: "CO01B", area: "Kalamassery", district: "Cochin", site: "Vallathole BP adjacent area" },
  { code: "KY01A", area: "Kayamkulam", district: "Cochin", site: "Showroom" },
  { code: "KY01A", area: "Kayamkulam", district: "Cochin", site: "Showroom adjacent-Ramapuram East" },
  { code: "KY01A", area: "Kayamkulam", district: "Cochin", site: "Showroom adjacent-Ramapuram West" },
  { code: "KY01A", area: "Kayamkulam", district: "Cochin", site: "Showroom adjacent-Evoor" },
  { code: "KY01A", area: "Mavelikkara", district: "Cochin", site: "T-Sparsh, Mavelikkara" },
  { code: "KY01A", area: "Thankey", district: "Cochin", site: "T-Sparsh, Thankey" },
  { code: "KY01A", area: "Kunnathur", district: "Cochin", site: "T-Sparsh, Sasthamkotta" },
  { code: "TI01A", area: "Thrissur", district: "Thrissur", site: "Showroom" },
  { code: "TI01A", area: "Thrissur", district: "Thrissur", site: "Peramangalam, Mundur" },
  { code: "TI01A", area: "Wadakkanchery", district: "Thrissur", site: "T-Sparsh, Wadakkanchery" },
  { code: "TI01A", area: "Thrithallur", district: "Thrissur", site: "T-Sparsh, Thrithallur" },
  { code: "TI01B", area: "Thrissur", district: "Thrissur", site: "Showroom" },
  { code: "TI01C", area: "Arthat, Kunnamkulam", district: "Thrissur", site: "Showroom" },
  { code: "IR01A", area: "Irinjalakkuda", district: "Thrissur", site: "Showroom" },
  { code: "IR01A", area: "Chenthrappinny", district: "Thrissur", site: "T-Sparsh, Chenthrappinny" },
  { code: "IR01A", area: "Chalakkudy", district: "Thrissur", site: "T-Sparsh, Chalakkudy" },
  { code: "MV01A", area: "Muvattupuzha", district: "Thrissur", site: "Showroom" },
  { code: "MV01A", area: "Muvattupuzha", district: "Thrissur", site: "Showroom adjacent area" },
  { code: "MV01A", area: "Muvattupuzha", district: "Thrissur", site: "Mekkadambu yard" },
  { code: "MV01A", area: "Kothamangalam", district: "Thrissur", site: "T-Sparsh, Kothamangalam" },
  { code: "MV01A", area: "Kuthattukulam", district: "Thrissur", site: "T-Sparsh, Kuthattukulam" },
  { code: "KT01A", area: "Nattakam", district: "Kottayam", site: "Showroom" },
  { code: "KT01A", area: "Nattakam", district: "Kottayam", site: "Showroom adjacent area" },
  { code: "KT01A", area: "Nattakam", district: "Kottayam", site: "Showroom nearby-helipad area" },
  { code: "KT01A", area: "Nattakam", district: "Kottayam", site: "Showroom nearby-school area" },
  { code: "KT01A", area: "Ettumanoor", district: "Kottayam", site: "1S, Ettumanoor" },
  { code: "KT01A", area: "Vaikom", district: "Kottayam", site: "T-Sparsh, Vaikom" },
  { code: "KT01A", area: "Kuravilangadu", district: "Kottayam", site: "T-Sparsh, Uzhavoor" },
  { code: "KT01A", area: "Changanassery", district: "Kottayam", site: "T-Sparsh, Changanachery" },
  { code: "KT01A", area: "Kanjirappally", district: "Kottayam", site: "T-Sparsh, Kanjirappally" },
  { code: "KT01B", area: "Meenachil", district: "Kottayam", site: "Showroom" },
  { code: "TL01A", area: "Thiruvalla", district: "Kottayam", site: "Showroom" },
  { code: "TL01A", area: "Thiruvalla", district: "Kottayam", site: "Showroom adjacent area" },
  { code: "TL01A", area: "Chengannur", district: "Kottayam", site: "T-Sparsh, Chengannur" },
  { code: "TL01A", area: "Mallappally", district: "Kottayam", site: "T-Sparsh, Mallappally" },
  { code: "PH01A", area: "Pathanamthitta", district: "Kottayam", site: "Showroom" },
  { code: "PH01A", area: "Pathanamthitta", district: "Kottayam", site: "Accessory area" },
  { code: "PH01A", area: "Pathanamthitta", district: "Kottayam", site: "Nearby Showroom" },
  { code: "PH01A", area: "Adoor", district: "Kottayam", site: "T-Sparsh, Adoor" },
  { code: "PH01A", area: "Konni", district: "Kottayam", site: "T-Sparsh, Konni" },
  { code: "PH01A", area: "Ranni", district: "Kottayam", site: "T-Sparsh, Ranni" },
  { code: "TR01A", area: "Kazhakkuttam", district: "Trivandrum", site: "Showroom" },
  { code: "TR01A", area: "Kazhakkuttam", district: "Trivandrum", site: "Yard-1, Mess area" },
  { code: "TR01A", area: "Kazhakkuttam", district: "Trivandrum", site: "Yard-2, Luxon yard" },
  { code: "TR01A", area: "Kazhakkuttam", district: "Trivandrum", site: "Yard-3, Kushamuttom" },
  { code: "TR01A", area: "Varkkala", district: "Trivandrum", site: "T-Sparsh, Varkkala" },
  { code: "TR01C", area: "Enchakkal", district: "Trivandrum", site: "Showroom" },
  { code: "TR01C", area: "Enchakkal", district: "Trivandrum", site: "Showroom adjacent area" },
  { code: "TR01C", area: "Neyyattinkara", district: "Trivandrum", site: "T-Sparsh, Neyyattinkara" },
  { code: "TR01C", area: "Parassala", district: "Trivandrum", site: "T-Sparsh, Parassala" },
  { code: "KL01A", area: "Kottiyam", district: "Trivandrum", site: "Showroom" },
  { code: "KL01A", area: "Kottiyam", district: "Trivandrum", site: "Showroom adjacent area" },
  { code: "KL01A", area: "Thazhuthla", district: "Trivandrum", site: "BP adjacent area" },
  { code: "KL01A", area: "Anandavalleaswaram", district: "Trivandrum", site: "Festive Counter, Anandavalleaswaram" },
  { code: "KL01A", area: "Punalur", district: "Trivandrum", site: "T-Sparsh, Punalur" },
  { code: "KL01A", area: "Karunagappally", district: "Trivandrum", site: "T-Sparsh, Karunagappally" },
  { code: "KL01A", area: "Nilamel", district: "Trivandrum", site: "T-Sparsh, Nilamel" },
  { code: "KL01A", area: "Pathanapuram", district: "Trivandrum", site: "T-Sparsh, Pathanapuram" },
];

function buildYardData() {
  const counters = new Map();
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

export const YARD_REGIONS = ["Cochin", "Thrissur", "Kottayam", "Trivandrum"];

export const YARD_DATA = buildYardData();
