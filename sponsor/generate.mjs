import { readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
  record(raw, ['version', 'currency', 'updatedAt', 'donationLinks', 'sponsors'], 'data');
  if (raw.version !== 1) throw new Error('Unsupported data version');
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
  // An explicit identifier tie-breaker prevents equal donations from moving when JSON is reordered.
  sponsors.sort((a, b) => b.amountMinor - a.amountMinor || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const donationLinks = raw.donationLinks.map((entry, index) => {
    const label = `donationLinks[${index}]`;
    record(entry, ['label', 'url'], label);
    record(entry.label, ['zh-CN', 'en'], `${label}.label`);
    return { label: { 'zh-CN': text(entry.label['zh-CN'], `${label}.label.zh-CN`, 40), en: text(entry.label.en, `${label}.label.en`, 60) }, url: httpsUrl(entry.url, `${label}.url`) };
  });
  return { version: 1, currency: raw.currency, updatedAt: raw.updatedAt, donationLinks, sponsors };
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

export function renderPage(data, template) {
  const links = data.donationLinks.length ? `<div class="donation-links">${data.donationLinks.map(link => `<a class="button" href="${escapeMarkup(link.url)}" target="_blank" rel="noopener noreferrer">${bilingual(link.label['zh-CN'], link.label.en)}<span aria-hidden="true">↗</span></a>`).join('')}</div>` : `<p class="support-note">${bilingual('分享使用体验、反馈问题、贡献代码，同样是珍贵的支持。', 'Sharing your experience, reporting issues and contributing code are valuable support, too.')}</p>`;
  const replacements = { SUPPORTERS: renderSupporters(data.sponsors), DONATION_LINKS: links, UPDATED_AT: data.updatedAt };
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
  const color = theme === 'dark' ? { text: '#f2f3ff', muted: '#a7afc8', line: '#46445f', accent: '#b6a9ff', surface: '#171b2d' } : { text: '#24283e', muted: '#606981', line: '#ded8ef', accent: '#7360b7', surface: '#f1eefb' };
  const columns = 8;
  const width = 832;
  const height = sponsors.length ? Math.ceil(sponsors.length / columns) * 118 + 32 : 180;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="list-title list-desc">`, '<title id="list-title">StarPie supporters</title>', '<desc id="list-desc">Thank you to everyone supporting StarPie. Ordered by cumulative donations; all supporters use the same presentation.</desc>'];
  if (!sponsors.length) {
    parts.push(`<rect x="1" y="1" width="830" height="178" rx="18" fill="${color.surface}"/>`, `<path d="M416 28l7 17 17 7-17 7-7 17-7-17-17-7 17-7z" fill="${color.accent}"/>`, `<g font-family="system-ui, sans-serif" text-anchor="middle"><text x="416" y="112" font-size="21" fill="${color.text}">Thank you for supporting StarPie.</text><text x="416" y="141" font-size="14" fill="${color.muted}">Our public supporter list will appear here.</text></g>`);
  } else {
    // Store each distinct bitmap once, even if multiple entries share an avatar.
    const avatarIds = new Map(Array.from(avatars.keys(), (key, index) => [key, `source-avatar-${index}`]));
    if (avatars.size) parts.push(`<defs>${Array.from(avatars, ([key, image]) => `<image id="${avatarIds.get(key)}" href="${image}" width="62" height="62" preserveAspectRatio="xMidYMid slice"/>`).join('')}</defs>`);
    const occupiedColumns = Math.min(columns, sponsors.length);
    const offset = sponsors.length < columns ? (width - occupiedColumns * 98) / 2 : 24;
    sponsors.forEach((sponsor, index) => {
      const x = offset + (index % columns + 0.5) * 98;
      const y = 54 + Math.floor(index / columns) * 118;
      const clipId = `avatar-${sponsor.id}`;
      const title = `<title>${escapeMarkup(sponsor.name)}</title>`;
      const image = sponsor.avatar ? avatars.get(sponsor.avatar) : null;
      if (sponsor.avatar && !image) throw new Error(`Avatar was not loaded: ${sponsor.avatar}`);
      const face = image ? `<defs><clipPath id="${clipId}"><circle cx="${x}" cy="${y}" r="31"/></clipPath></defs><g clip-path="url(#${clipId})"><use href="#${avatarIds.get(sponsor.avatar)}" x="${x - 31}" y="${y - 31}"/></g>` : `<circle cx="${x}" cy="${y}" r="31" fill="${color.surface}"/><text x="${x}" y="${y + 7}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="19" fill="${color.accent}">${escapeMarkup(initials(sponsor.name))}</text>`;
      const body = `${title}<circle cx="${x}" cy="${y}" r="36" fill="none" stroke="${color.line}" stroke-width="1.5"/>${face}<text x="${x}" y="${y + 58}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="${color.text}">${escapeMarkup(shortName(sponsor.name))}</text>`;
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
  const template = await readFile(path.join(directory, 'template.html'), 'utf8');
  const outputs = new Map([['index.html', renderPage(data, template)], ['sponsors-light.svg', renderSvg(data.sponsors, avatars, 'light')], ['sponsors-dark.svg', renderSvg(data.sponsors, avatars, 'dark')]]);
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
