// Phone number utilities for country detection and formatting

interface CountryInfo {
  name: string;
  code: string;
  flag: string;
  dialCode: string;
  pattern?: RegExp;
  format?: (phone: string) => string;
}

// Extended country mappings with flags and dial codes
export const COUNTRY_DATA: CountryInfo[] = [
  // North America
  { name: "United States", code: "US", flag: "🇺🇸", dialCode: "+1", pattern: /^1[2-9]\d{9}$/ },
  { name: "Canada", code: "CA", flag: "🇨🇦", dialCode: "+1", pattern: /^1[2-9]\d{9}$/ },
  
  // Europe
  { name: "United Kingdom", code: "GB", flag: "🇬🇧", dialCode: "+44", pattern: /^44\d{10,11}$/ },
  { name: "Germany", code: "DE", flag: "🇩🇪", dialCode: "+49", pattern: /^49\d{10,12}$/ },
  { name: "France", code: "FR", flag: "🇫🇷", dialCode: "+33", pattern: /^33\d{9}$/ },
  { name: "Italy", code: "IT", flag: "🇮🇹", dialCode: "+39", pattern: /^39\d{9,10}$/ },
  { name: "Spain", code: "ES", flag: "🇪🇸", dialCode: "+34", pattern: /^34\d{9}$/ },
  { name: "Netherlands", code: "NL", flag: "🇳🇱", dialCode: "+31", pattern: /^31\d{9}$/ },
  { name: "Belgium", code: "BE", flag: "🇧🇪", dialCode: "+32", pattern: /^32\d{8,9}$/ },
  { name: "Switzerland", code: "CH", flag: "🇨🇭", dialCode: "+41", pattern: /^41\d{9}$/ },
  { name: "Austria", code: "AT", flag: "🇦🇹", dialCode: "+43", pattern: /^43\d{4,13}$/ },
  { name: "Poland", code: "PL", flag: "🇵🇱", dialCode: "+48", pattern: /^48\d{9}$/ },
  { name: "Sweden", code: "SE", flag: "🇸🇪", dialCode: "+46", pattern: /^46\d{7,13}$/ },
  { name: "Denmark", code: "DK", flag: "🇩🇰", dialCode: "+45", pattern: /^45\d{8}$/ },
  { name: "Norway", code: "NO", flag: "🇳🇴", dialCode: "+47", pattern: /^47\d{8}$/ },
  { name: "Finland", code: "FI", flag: "🇫🇮", dialCode: "+358", pattern: /^358\d{6,12}$/ },
  { name: "Ireland", code: "IE", flag: "🇮🇪", dialCode: "+353", pattern: /^353\d{7,9}$/ },
  { name: "Portugal", code: "PT", flag: "🇵🇹", dialCode: "+351", pattern: /^351\d{9}$/ },
  { name: "Greece", code: "GR", flag: "🇬🇷", dialCode: "+30", pattern: /^30\d{10}$/ },
  { name: "Czech Republic", code: "CZ", flag: "🇨🇿", dialCode: "+420", pattern: /^420\d{9}$/ },
  { name: "Romania", code: "RO", flag: "🇷🇴", dialCode: "+40", pattern: /^40\d{9}$/ },
  { name: "Hungary", code: "HU", flag: "🇭🇺", dialCode: "+36", pattern: /^36\d{8,9}$/ },
  
  // Asia
  { name: "China", code: "CN", flag: "🇨🇳", dialCode: "+86", pattern: /^86\d{11}$/ },
  { name: "Japan", code: "JP", flag: "🇯🇵", dialCode: "+81", pattern: /^81\d{10}$/ },
  { name: "South Korea", code: "KR", flag: "🇰🇷", dialCode: "+82", pattern: /^82\d{9,10}$/ },
  { name: "India", code: "IN", flag: "🇮🇳", dialCode: "+91", pattern: /^91\d{10}$/ },
  { name: "Singapore", code: "SG", flag: "🇸🇬", dialCode: "+65", pattern: /^65\d{8}$/ },
  { name: "Hong Kong", code: "HK", flag: "🇭🇰", dialCode: "+852", pattern: /^852\d{8}$/ },
  { name: "Thailand", code: "TH", flag: "🇹🇭", dialCode: "+66", pattern: /^66\d{9}$/ },
  { name: "Malaysia", code: "MY", flag: "🇲🇾", dialCode: "+60", pattern: /^60\d{7,9}$/ },
  { name: "Indonesia", code: "ID", flag: "🇮🇩", dialCode: "+62", pattern: /^62\d{9,12}$/ },
  { name: "Philippines", code: "PH", flag: "🇵🇭", dialCode: "+63", pattern: /^63\d{10}$/ },
  { name: "Vietnam", code: "VN", flag: "🇻🇳", dialCode: "+84", pattern: /^84\d{9,10}$/ },
  { name: "Taiwan", code: "TW", flag: "🇹🇼", dialCode: "+886", pattern: /^886\d{9}$/ },
  { name: "Israel", code: "IL", flag: "🇮🇱", dialCode: "+972", pattern: /^972\d{8,9}$/ },
  { name: "United Arab Emirates", code: "AE", flag: "🇦🇪", dialCode: "+971", pattern: /^971\d{8,9}$/ },
  { name: "Saudi Arabia", code: "SA", flag: "🇸🇦", dialCode: "+966", pattern: /^966\d{9}$/ },
  { name: "Turkey", code: "TR", flag: "🇹🇷", dialCode: "+90", pattern: /^90\d{10}$/ },
  
  // Oceania
  { name: "Australia", code: "AU", flag: "🇦🇺", dialCode: "+61", pattern: /^61\d{9}$/ },
  { name: "New Zealand", code: "NZ", flag: "🇳🇿", dialCode: "+64", pattern: /^64\d{8,10}$/ },
  
  // Latin America
  { name: "Mexico", code: "MX", flag: "🇲🇽", dialCode: "+52", pattern: /^52\d{10}$/ },
  { name: "Brazil", code: "BR", flag: "🇧🇷", dialCode: "+55", pattern: /^55\d{10,11}$/ },
  { name: "Argentina", code: "AR", flag: "🇦🇷", dialCode: "+54", pattern: /^54\d{10}$/ },
  { name: "Colombia", code: "CO", flag: "🇨🇴", dialCode: "+57", pattern: /^57\d{10}$/ },
  { name: "Chile", code: "CL", flag: "🇨🇱", dialCode: "+56", pattern: /^56\d{9}$/ },
  { name: "Peru", code: "PE", flag: "🇵🇪", dialCode: "+51", pattern: /^51\d{9}$/ },
  
  // Africa
  { name: "South Africa", code: "ZA", flag: "🇿🇦", dialCode: "+27", pattern: /^27\d{9}$/ },
  { name: "Egypt", code: "EG", flag: "🇪🇬", dialCode: "+20", pattern: /^20\d{10}$/ },
  { name: "Nigeria", code: "NG", flag: "🇳🇬", dialCode: "+234", pattern: /^234\d{10}$/ },
  { name: "Kenya", code: "KE", flag: "🇰🇪", dialCode: "+254", pattern: /^254\d{9}$/ },
  { name: "Morocco", code: "MA", flag: "🇲🇦", dialCode: "+212", pattern: /^212\d{9}$/ },
  
  // Eastern Europe
  { name: "Russia", code: "RU", flag: "🇷🇺", dialCode: "+7", pattern: /^7\d{10}$/ },
  { name: "Ukraine", code: "UA", flag: "🇺🇦", dialCode: "+380", pattern: /^380\d{9}$/ },
  { name: "Belarus", code: "BY", flag: "🇧🇾", dialCode: "+375", pattern: /^375\d{9}$/ },
];

// Get country info from phone number
export function getCountryFromPhone(phoneNumber: string): CountryInfo | null {
  // Remove any non-digit characters except +
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  const withoutPlus = cleaned.replace(/^\+/, '');
  
  // Sort by dial code length (longest first) to match more specific codes first
  const sortedCountries = [...COUNTRY_DATA].sort((a, b) => 
    b.dialCode.length - a.dialCode.length
  );
  
  for (const country of sortedCountries) {
    const dialCodeWithoutPlus = country.dialCode.replace('+', '');
    if (withoutPlus.startsWith(dialCodeWithoutPlus)) {
      return country;
    }
  }
  
  return null;
}

// Format phone number for display
export function formatPhoneNumber(phoneNumber: string): string {
  const country = getCountryFromPhone(phoneNumber);
  
  // US/Canada specific formatting
  if (country && (country.code === 'US' || country.code === 'CA')) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
  }
  
  // UK specific formatting
  if (country?.code === 'GB') {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('44')) {
      const number = cleaned.slice(2);
      if (number.length === 10) {
        return `+44 ${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}`;
      }
    }
  }
  
  // Germany specific formatting
  if (country?.code === 'DE') {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('49')) {
      const number = cleaned.slice(2);
      return `+49 ${number.slice(0, 3)} ${number.slice(3, 7)} ${number.slice(7)}`;
    }
  }
  
  // Default formatting with spaces every 3-4 digits
  const cleaned = phoneNumber.replace(/\D/g, '');
  if (cleaned.length > 10) {
    const parts = [];
    let remaining = cleaned;
    
    // Country code (1-3 digits)
    const countryCodeLength = country ? country.dialCode.length - 1 : 
                             cleaned.length > 11 ? 2 : 1;
    parts.push('+' + remaining.slice(0, countryCodeLength));
    remaining = remaining.slice(countryCodeLength);
    
    // Format the rest in groups
    while (remaining.length > 0) {
      const groupSize = remaining.length > 7 ? 3 : 4;
      parts.push(remaining.slice(0, groupSize));
      remaining = remaining.slice(groupSize);
    }
    
    return parts.join(' ');
  }
  
  return phoneNumber;
}

// Detect number type from phone pattern
export function detectNumberType(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Toll-free patterns (US/Canada)
  if (cleaned.match(/^1(800|888|877|866|855|844|833)\d{7}$/)) {
    return 'toll-free';
  }
  
  // Mobile patterns (various countries)
  // US/Canada mobile
  if (cleaned.match(/^1[2-9]\d{2}[2-9]\d{6}$/)) {
    const areaCode = cleaned.slice(1, 4);
    // Common mobile area codes
    const mobileAreaCodes = ['917', '646', '347', '929', '332', '718', '212'];
    if (mobileAreaCodes.includes(areaCode)) {
      return 'mobile';
    }
  }
  
  // UK mobile (07xxx)
  if (cleaned.match(/^447\d{9}$/)) {
    return 'mobile';
  }
  
  // German mobile (01xxx)
  if (cleaned.match(/^491[567]\d{8,9}$/)) {
    return 'mobile';
  }
  
  return 'local';
}

// Generate call URL for click-to-call functionality
export function getCallUrl(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

// Generate WhatsApp URL for business messaging
export function getWhatsAppUrl(phoneNumber: string, message?: string): string {
  const cleaned = phoneNumber.replace(/[^\d]/g, '');
  const params = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${cleaned}${params}`;
}

// Check if number supports SMS based on capabilities or patterns
export function canSendSMS(phoneNumber: string, capabilities?: { sms: boolean }): boolean {
  if (capabilities?.sms !== undefined) {
    return capabilities.sms;
  }
  
  // Default to true for mobile numbers
  const numberType = detectNumberType(phoneNumber);
  return numberType === 'mobile' || numberType === 'local';
}

// Get timezone for phone number based on country/region
export function getTimezoneForNumber(phoneNumber: string): string | null {
  const country = getCountryFromPhone(phoneNumber);
  
  // Map countries to common timezones
  const timezoneMap: Record<string, string> = {
    'US': 'America/New_York', // Default to ET, should be refined by area code
    'CA': 'America/Toronto',
    'GB': 'Europe/London',
    'DE': 'Europe/Berlin',
    'FR': 'Europe/Paris',
    'IT': 'Europe/Rome',
    'ES': 'Europe/Madrid',
    'JP': 'Asia/Tokyo',
    'CN': 'Asia/Shanghai',
    'IN': 'Asia/Kolkata',
    'AU': 'Australia/Sydney',
    'BR': 'America/Sao_Paulo',
    'RU': 'Europe/Moscow',
  };
  
  return country ? timezoneMap[country.code] || null : null;
}

// Calculate cost estimate for international calls
export function estimateCallCost(fromCountry: string, toCountry: string, duration: number): number {
  // Basic cost matrix (cents per minute)
  const domesticRate = 1; // 1 cent per minute domestic
  const internationalRates: Record<string, number> = {
    'US-CA': 1,
    'US-GB': 2,
    'US-DE': 3,
    'US-JP': 5,
    'US-AU': 4,
    'US-IN': 8,
    'DEFAULT': 10,
  };
  
  if (fromCountry === toCountry) {
    return (domesticRate * duration) / 100;
  }
  
  const rateKey = `${fromCountry}-${toCountry}`;
  const rate = internationalRates[rateKey] || internationalRates['DEFAULT'];
  return (rate * duration) / 100;
}