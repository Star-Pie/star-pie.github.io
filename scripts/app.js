import { translate } from './i18n.js';
import { presets, polar, sectorPath } from './menu-data.js';

const root = document.documentElement;
let language = root.dataset.language === 'en' ? 'en' : 'zh-CN';
let preset = 'everyday';
let selectedIndex = null;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const t = (key, values) => translate(key, language, values);
const svgNS = 'http://www.w3.org/2000/svg';
const wheel = $('#radial-menu');
const sectors = $('#wheel-sectors');
const result = $('#demo-result');
const nav = $('#main-nav');
const menuButton = $('#menu-toggle');

function save(key, value) {
  try { localStorage.setItem('starpie-' + key, value); } catch { /* Optional storage. */ }
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function updateResult(index = selectedIndex, preview = false) {
  const text = result.querySelector('[data-i18n]');
  text.textContent = index === null ? t('demo.hint') : t(preview ? 'demo.preview' : 'demo.selected', {
    action: presets[preset][index].label[language]
  });
  [...sectors.children].forEach((sector, i) => sector.classList.toggle('is-highlighted', i === index));
  result.classList.toggle('has-result', index !== null && !preview);
}

function selectAction(index) {
  selectedIndex = index;
  [...sectors.children].forEach((sector, i) => {
    sector.setAttribute('aria-pressed', String(i === index));
  });
  updateResult();
}

function renderWheel() {
  const items = presets[preset];
  sectors.replaceChildren();
  items.forEach((item, index) => {
    const group = svgElement('g', {
      class: 'wheel-sector', role: 'button', tabindex: index === 0 ? '0' : '-1',
      'aria-label': t('demo.action', { action: item.label[language] }), 'aria-pressed': 'false'
    });
    group.append(svgElement('path', { class: 'sector-shape', d: sectorPath(index), fill: 'url(#sector-rest)' }));
    const [x, y] = polar(184, -90 + index * 45);
    if (item.image) {
      group.append(svgElement('image', {
        href: item.image, class: 'app-icon', x: x - 27, y: y - 34, width: 54, height: 54, 'aria-hidden': 'true'
      }));
    } else {
      const icon = svgElement('svg', { class: 'icon sector-icon', x: x - 16, y: y - 22, width: 32, height: 32, 'aria-hidden': 'true' });
      icon.append(svgElement('use', { href: '#i-' + item.icon }));
      group.append(icon);
    }
    const label = svgElement('text', { class: 'sector-label', x, y: y + 40, 'aria-hidden': 'true' });
    label.textContent = item.label[language];
    group.append(label);
    group.addEventListener('click', () => selectAction(index));
    group.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') updateResult(index, true); });
    group.addEventListener('pointerleave', () => updateResult());
    group.addEventListener('focus', () => updateResult(index, true));
    group.addEventListener('blur', () => updateResult());
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectAction(index);
      }
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;
      else next = (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      [...sectors.children].forEach((sector, i) => sector.setAttribute('tabindex', i === next ? '0' : '-1'));
      sectors.children[next].focus();
    });
    sectors.append(group);
  });
  if (selectedIndex !== null) selectAction(selectedIndex);
  wheel.removeAttribute('hidden');
  $('#wheel-fallback').hidden = true;
  updateResult();
}

function updateThemeButton() {
  $('#theme-toggle').setAttribute('aria-label', t(root.dataset.theme === 'dark' ? 'a11y.themeLight' : 'a11y.themeDark'));
  document.querySelector('meta[name="theme-color"]').content = root.dataset.theme === 'dark' ? '#080b17' : '#f7f8fe';
}

function updateMenuButton() {
  menuButton.setAttribute('aria-label', t(nav.classList.contains('is-open') ? 'a11y.closeMenu' : 'a11y.menu'));
}

function setMenu(open) {
  nav.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  updateMenuButton();
}

function applyLanguage() {
  root.lang = language;
  root.dataset.language = language;
  $$('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  $$('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
  $$('[data-i18n-alt]').forEach(node => { node.alt = t(node.dataset.i18nAlt); });
  document.title = t('page.title');
  $('meta[name="description"]').content = t('page.description');
  $('meta[property="og:title"]').content = t('page.title');
  $('meta[property="og:description"]').content = t('page.description');
  $('#language-toggle').textContent = language === 'en' ? '中' : 'EN';
  $('#language-toggle').setAttribute('aria-label', language === 'en' ? '切换到中文' : 'Switch to English');
  $$('.brand[aria-label]').forEach(node => node.setAttribute('aria-label', language === 'en' ? 'StarPie home' : 'StarPie 首页'));
  updateThemeButton();
  updateMenuButton();
  renderWheel();
}

$('#theme-toggle').addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  save('theme', root.dataset.theme);
  updateThemeButton();
});
$('#language-toggle').addEventListener('click', () => {
  language = language === 'zh-CN' ? 'en' : 'zh-CN';
  save('language', language);
  applyLanguage();
});
$$('[data-preset]').forEach(button => {
  button.addEventListener('click', () => {
    preset = button.dataset.preset;
    selectedIndex = null;
    $$('[data-preset]').forEach(node => {
      const active = node === button;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-pressed', String(active));
    });
    renderWheel();
  });
});
const gallery = $('.wheel-looks');
for (const button of $$('[data-look]')) {
  button.addEventListener('click', () => {
    gallery.dataset.active = button.dataset.look;
    for (const choice of $$('[data-look]')) {
      choice.setAttribute('aria-pressed', String(choice === button));
    }
  });
}
const video = $('#gesture-video');
const player = video.closest('.demo-player');
const transport = player.querySelector('.demo-transport');
const play = transport.querySelector('.demo-play');
const seek = transport.querySelector('.demo-seek');
const fullscreen = transport.querySelector('.demo-fullscreen');

function setControlLabel(node, key) {
  node.dataset.i18n = key;
  node.textContent = t(key);
}

function syncPlayback() {
  const key = video.ended ? 'fast.replay' : video.paused ? 'fast.play' : 'fast.pause';
  setControlLabel(play.querySelector('span'), key);
  play.querySelector('use').setAttribute('href', video.paused || video.ended ? '#i-play' : '#i-pause');
  seek.disabled = !Number.isFinite(video.duration) || video.duration <= 0;
  if (!seek.disabled) {
    seek.max = video.duration;
    seek.value = video.currentTime;
  }
}

async function togglePlayback() {
  if (!video.paused && !video.ended) {
    video.pause();
    return;
  }
  try {
    await video.play();
  } catch (error) {
    if (error.name !== 'AbortError') {
      video.controls = true;
      transport.hidden = true;
    }
  }
}

play.addEventListener('click', togglePlayback);
video.addEventListener('click', () => { if (!video.controls) togglePlayback(); });
for (const event of ['play', 'pause', 'ended', 'durationchange', 'loadedmetadata', 'timeupdate']) {
  video.addEventListener(event, syncPlayback);
}
seek.addEventListener('input', () => { video.currentTime = seek.valueAsNumber; });
if (document.fullscreenEnabled) {
  fullscreen.hidden = false;
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === player) await document.exitFullscreen();
      else await player.requestFullscreen();
    } catch { /* Embedding pages can restrict fullscreen. Inline playback remains available. */ }
  });
  document.addEventListener('fullscreenchange', () => {
    setControlLabel(fullscreen, document.fullscreenElement === player ? 'fast.exitFullscreen' : 'fast.fullscreen');
  });
}
syncPlayback();
video.controls = false;
transport.hidden = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) video.pause();
});
menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('click', event => {
  if (!event.target.closest('.site-header') && nav.classList.contains('is-open')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuButton.focus(); }
});
window.matchMedia('(min-width: 601px)').addEventListener('change', event => { if (event.matches) setMenu(false); });
applyLanguage();
