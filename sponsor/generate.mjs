import { readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const rootDirectory = fileURLToPath(new URL('./', import.meta.url));
export const outputNames = ['index.html', 'sponsors-light.svg', 'sponsors-dark.svg'];
const maxAvatarBytes = 256 * 1024;
const maxTotalAvatarBytes = 4 * 1024 * 1024;

function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`${label}: unknown field ${key}`);
  }
}

function text(value, label, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || Array.from(value).length > max || /[\u0000-\u001f\u007f-\u009f\ud800-\udfff\ufffe\uffff]/u.test(value)) {
    throw new Error(`${label} must be trimmed, printable text of at most ${max} characters`);
  }
  return value;
}

function id(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new Error(`${label} must be a lowercase identifier`);
  return value;
}

function httpsUrl(value, label) {
  text(value, label, 2048);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || /\s/.test(value)) throw new Error(`${label} must be an HTTPS URL without credentials`);
  return url.href;
}

export function validateData(raw) {
  record(raw, ['version', 'currency', 'updatedAt', 'donationLinks', 'qrMethods', 'contactEmail', 'profileFormUrl', 'sponsors'], 'data');
  if (raw.version !== 1) throw new Error('Unsupported data version; v1 requires explicit currency and cumulative amountMinor values');
  if (typeof raw.currency !== 'string' || !/^[A-Z]{3}$/.test(raw.currency)) throw new Error('currency must be one three-letter accounting currency');
  const date = typeof raw.updatedAt === 'string' ? new Date(raw.updatedAt) : new Date(NaN);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.updatedAt ?? '') || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== raw.updatedAt) throw new Error('updatedAt must be a valid YYYY-MM-DD date');
  if (!Array.isArray(raw.sponsors) || raw.sponsors.length > 1000) throw new Error('sponsors must be an array of at most 1000 entries');
  if (!Array.isArray(raw.donationLinks) || raw.donationLinks.length > 6) throw new Error('donationLinks must be an array of at most six links');
  const ids = new Set();
  const sponsors = raw.sponsors.map((entry, index) => {
    const label = `sponsors[${index}]`;
    record(entry, ['id', 'name', 'amountMinor', 'avatar', 'url'], label);
    const key = id(entry.id, `${label}.id`);
    if (ids.has(key)) throw new Error(`Duplicate sponsor id: ${key}`);
    ids.add(key);
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor < 0) throw new Error(`${label}.amountMinor must be a non-negative safe integer`);
    const avatar = entry.avatar ?? null;
    if (avatar !== null && (typeof avatar !== 'string' || !/^avatars\/[a-z0-9][a-z0-9_-]*\.(png|jpe?g|webp)$/i.test(avatar))) throw new Error(`${label}.avatar must name a local PNG, JPEG or WebP in avatars/`);
    return { id: key, name: text(entry.name, `${label}.name`), amountMinor: entry.amountMinor, avatar, url: entry.url == null ? null : httpsUrl(entry.url, `${label}.url`) };
  });
  // Restore v1 ranking: cumulative amounts descending, stable IDs for equal amounts.
  sponsors.sort((a, b) => b.amountMinor - a.amountMinor || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const donationLinks = raw.donationLinks.map((entry, index) => {
    const label = `donationLinks[${index}]`;
    record(entry, ['label', 'url'], label);
    record(entry.label, ['zh-CN', 'en'], `${label}.label`);
    return { label: { 'zh-CN': text(entry.label['zh-CN'], `${label}.label.zh-CN`, 40), en: text(entry.label.en, `${label}.label.en`, 60) }, url: httpsUrl(entry.url, `${label}.url`) };
  });
  const qrIds = new Set();
  if (!Array.isArray(raw.qrMethods ?? []) || (raw.qrMethods ?? []).length > 2) throw new Error('qrMethods supports WeChat and Alipay only');
  const qrMethods = (raw.qrMethods ?? []).map((entry, index) => {
    const label = `qrMethods[${index}]`;
    record(entry, ['id', 'label', 'image'], label);
    if (!['wechat', 'alipay'].includes(entry.id) || qrIds.has(entry.id)) throw new Error('Invalid or duplicate QR method');
    qrIds.add(entry.id);
    record(entry.label, ['zh-CN', 'en'], `${label}.label`);
    const image = entry.image ?? null;
    if (image !== null && image !== `payment-codes/${entry.id}.png`) throw new Error('QR image must use its approved local payment-codes path');
    return { id: entry.id, label: { 'zh-CN': text(entry.label['zh-CN'], `${label}.label.zh-CN`, 40), en: text(entry.label.en, `${label}.label.en`, 60) }, image };
  });
  if (raw.profileFormUrl != null) throw new Error('Web profile forms are retired; configure contactEmail instead');
  const contactEmail = raw.contactEmail ?? null;
  if (contactEmail !== null && (typeof contactEmail !== 'string' || contactEmail.length > 254 || !/^[A-Za-z0-9][A-Za-z0-9._+\-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)+$/.test(contactEmail) || contactEmail.includes('..') || contactEmail.split('@')[0].endsWith('.'))) throw new Error('contactEmail must be a plain email address without headers or whitespace');
  return { version: 1, currency: raw.currency, updatedAt: raw.updatedAt, donationLinks, qrMethods, contactEmail, sponsors };
}

export async function loadPaymentCodes(directory, methods) {
  const root = await realpath(directory);
  const versions = new Map();
  for (const method of methods) {
    if (!method.image) continue;
    const folder = path.join(root, 'payment-codes');
    if ((await lstat(folder)).isSymbolicLink()) throw new Error('payment-codes cannot be a symbolic link');
    const file = path.join(root, ...method.image.split('/'));
    const info = await lstat(file);
    const relative = path.relative(root, await realpath(file));
    if (!info.isFile() || info.isSymbolicLink() || path.isAbsolute(relative) || relative.startsWith('..')) throw new Error('QR image must be a regular local file');
    if (info.size > 2 * 1024 * 1024) throw new Error('QR image exceeds 2 MiB');
    const bytes = await readFile(file);
    avatarMediaType(bytes, '.png');
    versions.set(method.image, createHash('sha256').update(bytes).digest('hex').slice(0, 16));
  }
  return versions;
}

export function escapeMarkup(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function avatarMediaType(bytes, extension) {
  const ext = extension.toLowerCase();
  if (ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (['.jpg', '.jpeg'].includes(ext) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (ext === '.webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new Error('Avatar extension does not match a supported image signature');
}

export async function loadAvatars(directory, sponsors) {
  const result = new Map();
  let total = 0;
  const root = await realpath(directory);
  for (const sponsor of sponsors) {
    if (!sponsor.avatar || result.has(sponsor.avatar)) continue;
    if ((await lstat(path.join(root, 'avatars'))).isSymbolicLink()) throw new Error('avatars/ must not be a symbolic link');
    const filename = path.join(root, ...sponsor.avatar.split('/'));
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Avatar must be a regular local file');
    const relative = path.relative(root, await realpath(filename));
    if (path.isAbsolute(relative) || relative.startsWith('..')) throw new Error('Avatar escapes the sponsor directory');
    if (info.size > maxAvatarBytes) throw new Error('Avatar exceeds 256 KiB');
    total += info.size;
    if (total > maxTotalAvatarBytes) throw new Error('Total avatar data exceeds 4 MiB');
    const bytes = await readFile(filename);
    const type = avatarMediaType(bytes, path.extname(filename));
    result.set(sponsor.avatar, `data:${type};base64,${bytes.toString('base64')}`);
  }
  return result;
}

const bilingual = (zh, en) => `<span data-lang="zh-CN">${escapeMarkup(zh)}</span><span data-lang="en" lang="en">${escapeMarkup(en)}</span>`;
const initials = name => Array.from(name).slice(0, 2).join('').toUpperCase();

export function renderSupporters(sponsors) {
  if (!sponsors.length) return `<div class="empty-state"><svg class="empty-orbit" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="44"/><circle cx="60" cy="60" r="30"/><path d="M60 38l6.5 15.5L83 60l-16.5 6.5L60 82l-6.5-15.5L37 60l16.5-6.5z"/><circle class="orbit-dot" cx="91" cy="29" r="5"/></svg><h3>${bilingual('期待在这里向你道一声感谢', 'A place to say thank you')}</h3><p>${bilingual('目前还没有添加公开展示的赞助者。无论赞助、分享还是参与改进，都感谢你对 StarPie 的支持。', 'No supporters have been added to this public list yet. Donations, sharing and contributions all help StarPie move forward.')}</p></div>`;
  return `<ul class="supporter-grid">\n${sponsors.map(sponsor => {
    const avatar = sponsor.avatar ? `<img src="./${escapeMarkup(sponsor.avatar)}" width="88" height="88" alt="" loading="lazy" decoding="async">` : `<span class="avatar-initials" aria-hidden="true">${escapeMarkup(initials(sponsor.name))}</span>`;
    const content = `<span class="avatar-frame">${avatar}</span><span class="supporter-name">${escapeMarkup(sponsor.name)}</span>`;
    const item = sponsor.url ? `<a class="supporter" href="${escapeMarkup(sponsor.url)}" target="_blank" rel="noopener noreferrer">${content}</a>` : `<div class="supporter">${content}</div>`;
    return `  <li data-sponsor-id="${sponsor.id}">${item}</li>`;
  }).join('\n')}\n</ul>`;
}

export function renderPage(data, template, codeVersions = new Map()) {
  const qr = data.qrMethods ?? [];
  const contact = data.contactEmail ? `<p class="contact-address">${bilingual('联系邮箱：', 'Email: ')}<a href="mailto:${escapeMarkup(data.contactEmail)}">${escapeMarkup(data.contactEmail)}</a></p>` : `<p>${bilingual('公开联系邮箱尚未配置，暂不接收展示申请。', 'A public contact email has not been configured yet.')}</p>`;
  const acknowledgement = `<section class="email-acknowledgement" id="contact-support" aria-labelledby="contact-title"><h2 id="contact-title">${bilingual('希望公开展示在致谢名单', 'Be publicly acknowledged')}</h2><p>${bilingual('通过微信、支付宝或爱发电支持 StarPie 后，如希望加入公开致谢名单，请通过邮箱联系维护者，提供希望展示的昵称、头像、个人主页，以及用于核对的订单信息。', 'After supporting StarPie through WeChat, Alipay or Afdian, email the maintainer if you would like to join the public acknowledgement list. Include your preferred display name, avatar, profile link and order information for verification.')}</p><p>${bilingual('如需修改昵称、头像或链接，或希望移除展示，也可通过同一邮箱联系。', 'Use the same email to update your display name, avatar or profile link, or to request removal from the list.')}</p>${contact}<p class="contact-private">${bilingual('公开展示完全自愿，展示内容包括昵称、头像及个人主页。支持金额不会直接显示在页面中，但会进入公开仓库；付款凭证仅供私下核对，不会进入公开仓库。', 'Public listing is entirely optional and includes your display name, avatar and profile link. Support amounts are not shown directly on the page, but are included in the public repository. Payment evidence is used only for private verification and is not added to the public repository.')}</p></section>`;
  const choices = data.donationLinks.map(link => `<a class="button" href="${escapeMarkup(link.url)}" target="_blank" rel="noopener noreferrer">${bilingual(link.label['zh-CN'], link.label.en)}<span aria-hidden="true">↗</span></a>`).join('') + qr.map(method => `<a class="button qr-choice" href="#pay-${method.id}">${bilingual(method.label['zh-CN'], method.label.en)}<span aria-hidden="true">⌄</span></a>`).join('');
  const panels = qr.map(method => `<section class="qr-panel" id="pay-${method.id}" aria-labelledby="pay-${method.id}-title" tabindex="-1"><div class="qr-heading"><h2 id="pay-${method.id}-title">${bilingual(method.label['zh-CN'], method.label.en)}</h2><a href="#support-choices" class="qr-close">${bilingual('收起', 'Close')}</a></div>${method.image ? `<img class="payment-code" src="./${method.image}${codeVersions.has(method.image) ? '?v='+codeVersions.get(method.image) : ''}" alt="${escapeMarkup(method.label['zh-CN'])}" loading="lazy"><p>${bilingual(method.id === 'wechat' ? '请使用微信扫码，付款前核对收款方。' : '请使用支付宝扫码，付款前核对收款方。', method.id === 'wechat' ? 'Scan with WeChat and verify the recipient before paying.' : 'Scan with Alipay and verify the recipient before paying.')}</p>` : `<p class="qr-unavailable">${bilingual('此方式暂未开放。维护者配置真实二维码后即可使用。', 'This method is not available yet. The maintainer needs to configure a real payment code.')}</p>`}</section>`).join('');
  const links = choices ? `<nav class="donation-links" id="support-choices" aria-label="选择支持方式">${choices}</nav>${panels}` : `<p class="support-note">${bilingual('分享使用体验、反馈问题、贡献代码，同样是珍贵的支持。', 'Sharing your experience, reporting issues and contributing code are valuable support, too.')}</p>`;
  const replacements = { SUPPORTERS: renderSupporters(data.sponsors), DONATION_LINKS: links + `<div class="acknowledgement-cta"><a class="acknowledgement-button" href="#contact-support"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>${bilingual('希望公开展示在致谢名单', 'Be publicly acknowledged')}</a></div>` };
  if (template.includes('{{UPDATED_AT}}')) replacements.UPDATED_AT = data.updatedAt;
  if (template.includes('{{CONTACT}}')) replacements.CONTACT = acknowledgement;
  else replacements.DONATION_LINKS += acknowledgement;
  for (const key of Object.keys(replacements)) {
    if (!template.includes(`{{${key}}}`)) throw new Error(`Missing template token: ${key}`);
  }
  // Replace the original template once; a donor name containing {{...}} is just text.
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(replacements, key)) throw new Error('Unknown template token');
    return replacements[key];
  });
}

function shortName(name) {
  let width = 0;
  let result = '';
  for (const character of name) {
    width += character.codePointAt(0) > 255 ? 2 : 1;
    if (width > 13) return result + '…';
    result += character;
  }
  return result;
}

export function renderSvg(sponsors, avatars, theme) {
  if (!['light', 'dark'].includes(theme)) throw new Error('Unknown SVG theme');
  const color = theme === 'dark' ? { text: '#f2f3ff', muted: '#a7afc8', line: '#46445f', accent: '#b6a9ff', surface: '#171b2d' } : { text: '#24283e', muted: '#606981', line: '#ded8ef', accent: '#6e57af', surface: '#f1eefb' };
  const columns = 8;
  const compact = sponsors.length > 0 && sponsors.length <= 3;
  const width = compact ? 640 : 832;
  const height = compact ? 128 : sponsors.length ? Math.ceil(sponsors.length / columns) * 118 + 98 : 180;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="list-title list-desc">`, '<title id="list-title">StarPie supporters</title>', '<desc id="list-desc">Thank you to everyone supporting StarPie. Ordered by cumulative donations; all supporters use the same presentation.</desc>'];
  // GitHub's selected theme can differ from prefers-color-scheme. Own the surface
  // so both SVG variants stay legible regardless of the README background.
  parts.push(`<rect data-surface="acknowledgement" x="1" y="1" width="${width - 2}" height="${height - 2}" rx="18" fill="${color.surface}" stroke="${color.line}"/>`);
  if (!sponsors.length) {
    parts.push(`<path d="M416 28l7 17 17 7-17 7-7 17-7-17-17-7 17-7z" fill="${color.accent}"/>`, `<g font-family="system-ui, sans-serif" text-anchor="middle"><text x="416" y="112" font-size="21" fill="${color.text}">Thank you for supporting StarPie.</text><text x="416" y="141" font-size="14" fill="${color.muted}">Our public supporter list will appear here.</text></g>`);
  } else {
    const headingY = compact ? 58 : 44;
    parts.push(`<path d="M12 0l3.5 8.5L24 12l-8.5 3.5L12 24l-3.5-8.5L0 12l8.5-3.5z" transform="translate(32 ${headingY - 21})" fill="${color.accent}"/>`, `<text x="68" y="${headingY}" font-family="system-ui, sans-serif" font-size="${compact ? 20 : 24}" font-weight="650" fill="${color.text}">感谢每一份支持</text>`, `<text x="32" y="${headingY + 29}" font-family="system-ui, sans-serif" font-size="${compact ? 12 : 15}" fill="${color.muted}">Thank you for supporting StarPie.</text>`);
    if (compact) parts.push(`<path d="M344 24v80" fill="none" stroke="${color.line}"/>`);
    // Store each distinct bitmap once, even if multiple entries share an avatar.
    const avatarIds = new Map(Array.from(avatars.keys(), (key, index) => [key, `source-avatar-${index}`]));
    if (avatars.size) parts.push(`<defs>${Array.from(avatars, ([key, image]) => `<image id="${avatarIds.get(key)}" href="${image}" width="62" height="62" preserveAspectRatio="xMidYMid slice"/>`).join('')}</defs>`);
    const occupiedColumns = Math.min(columns, sponsors.length);
    const offset = sponsors.length < columns ? (width - occupiedColumns * 98) / 2 : 24;
    sponsors.forEach((sponsor, index) => {
      const x = compact ? 360 + (index + 0.5) * 256 / sponsors.length : offset + (index % columns + 0.5) * 98;
      const y = compact ? 53 : 128 + Math.floor(index / columns) * 118;
      const clipId = `avatar-${sponsor.id}`;
      const title = `<title>${escapeMarkup(sponsor.name)}</title>`;
      const image = sponsor.avatar ? avatars.get(sponsor.avatar) : null;
      if (sponsor.avatar && !image) throw new Error(`Avatar was not loaded: ${sponsor.avatar}`);
      const face = image ? `<defs><clipPath id="${clipId}"><circle cx="${x}" cy="${y}" r="31"/></clipPath></defs><g clip-path="url(#${clipId})"><use href="#${avatarIds.get(sponsor.avatar)}" x="${x - 31}" y="${y - 31}"/></g>` : `<circle cx="${x}" cy="${y}" r="31" fill="${color.surface}"/><text x="${x}" y="${y + 7}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="19" fill="${color.accent}">${escapeMarkup(initials(sponsor.name))}</text>`;
      const labelWidth = compact ? Math.min(180, 256 / sponsors.length - 12) : 92;
      const labelId = `label-${sponsor.id}`;
      const body = `${title}<circle cx="${x}" cy="${y}" r="36" fill="none" stroke="${color.accent}" stroke-width="1.5"/>${face}<defs><clipPath id="${labelId}"><rect x="${x - labelWidth / 2}" y="${y + 42}" width="${labelWidth}" height="24"/></clipPath></defs><text x="${x}" y="${y + 58}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${compact ? 18 : 14}" font-weight="600" fill="${color.text}" clip-path="url(#${labelId})">${escapeMarkup(shortName(sponsor.name))}</text>`;
      parts.push(`<g data-sponsor-id="${sponsor.id}">${sponsor.url ? `<a href="${escapeMarkup(sponsor.url)}" target="_blank" rel="noopener noreferrer">${body}</a>` : body}</g>`);
    });
  }
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}

export async function generate(directory = rootDirectory, { check = false } = {}) {
  const raw = JSON.parse(await readFile(path.join(directory, 'data.json'), 'utf8'));
  const data = validateData(raw);
  const avatars = await loadAvatars(directory, data.sponsors);
  const codeVersions = await loadPaymentCodes(directory, data.qrMethods);
  const template = await readFile(path.join(directory, 'template.html'), 'utf8');
  const outputs = new Map([['index.html', renderPage(data, template, codeVersions)], ['sponsors-light.svg', renderSvg(data.sponsors, avatars, 'light')], ['sponsors-dark.svg', renderSvg(data.sponsors, avatars, 'dark')]]);
  const changed = [];
  // Finish validation and rendering before writing anything, so bad input cannot partially update output.
  for (const [name, content] of outputs) {
    const filename = path.join(directory, name);
    let previous;
    try {
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Output must be a regular file: ${name}`);
      previous = await readFile(filename, 'utf8');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous !== content) changed.push(name);
  }
  if (check && changed.length) throw new Error(`Generated files are stale: ${changed.join(', ')}. Run node sponsor/generate.mjs.`);
  if (!check) for (const name of changed) await writeFile(path.join(directory, name), outputs.get(name), 'utf8');
  return { changed, count: data.sponsors.length, data };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check')) throw new Error('Usage: node sponsor/generate.mjs [--check]');
    const result = await generate(rootDirectory, { check: args.includes('--check') });
    console.log(`${args.includes('--check') ? 'Verified' : 'Generated'} ${result.count} supporters; ${result.changed.length} files changed.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
