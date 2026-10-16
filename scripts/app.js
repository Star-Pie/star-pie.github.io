import { translate } from './i18n.js';
import { presets, polar, sectorPath } from './menu-data.js';

const root = document.documentElement;
let language = root.dataset.language === 'en' ? 'en' : 'zh-CN';
let preset = 'everyday';
let selectedIndex = null;
let previewMode = 'studio';
let isPlaying = false;
let mediaFailed = false;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const t = (key, values) => translate(key, language, values);
const svgNS = 'http://www.w3.org/2000/svg';
const wheel = $('#radial-menu');
const sectors = $('#wheel-sectors');
const result = $('#demo-result');
const gestureImage = $('#gesture-image');
const playButton = $('#play-demo');
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
  result.classList.toggle('has-result', index !== null && !preview);
}

function selectAction(index) {
  selectedIndex = index;
  [...sectors.children].forEach((sector, i) => {
    sector.classList.toggle('is-selected', i === index);
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
    const fill = index === 1 ? 'violet' : index >= 2 && index <= 4 ? 'indigo' : 'blue';
    group.append(svgElement('path', { class: 'sector-shape', d: sectorPath(index), fill: 'url(#sector-' + fill + ')' }));
    const [x, y] = polar(184, -90 + index * 45);
    const icon = svgElement('svg', { class: 'icon sector-icon', x: x - 12.5, y: y - 21, width: 25, height: 25, 'aria-hidden': 'true' });
    icon.append(svgElement('use', { href: '#i-' + item.icon }));
    group.append(icon);
    const label = svgElement('text', { class: 'sector-label', x, y: y + 25, 'aria-hidden': 'true' });
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

function updateAppearance() {
  const image = $('#appearance-image');
  const studio = previewMode === 'studio';
  const src = studio ? './assets/theme-studio.webp' : './assets/themes.webp';
  if (image.getAttribute('src') !== src) image.src = src;
  image.alt = t(studio ? 'appearance.studioAlt' : 'appearance.stylesAlt');
  image.dataset.i18nAlt = studio ? 'appearance.studioAlt' : 'appearance.stylesAlt';
  const caption = $('#appearance-caption');
  caption.dataset.i18n = studio ? 'appearance.studioCaption' : 'appearance.stylesCaption';
  caption.textContent = t(caption.dataset.i18n);
}

function updatePlaybackButton() {
  playButton.setAttribute('aria-pressed', String(isPlaying));
  playButton.classList.toggle('is-playing', isPlaying);
  playButton.querySelector('use').setAttribute('href', isPlaying ? '#i-pause' : '#i-play');
  playButton.querySelector('span').textContent = t(playButton.disabled ? 'fast.loading' : isPlaying ? 'fast.pause' : 'fast.play');
  playButton.querySelector('span').dataset.i18n = isPlaying ? 'fast.pause' : 'fast.play';
  const caption = gestureImage.closest('figure').querySelector('figcaption');
  caption.dataset.i18n = mediaFailed ? 'fast.failed' : 'fast.caption';
  caption.textContent = t(caption.dataset.i18n);
}

function setPlaying(playing) {
  isPlaying = playing;
  mediaFailed = false;
  playButton.disabled = playing;
  playButton.setAttribute('aria-busy', String(playing));
  gestureImage.src = playing ? './assets/gesture-demo.gif' : './assets/gesture-poster.webp';
  updatePlaybackButton();
}

gestureImage.addEventListener('load', () => {
  playButton.disabled = false;
  playButton.removeAttribute('aria-busy');
  updatePlaybackButton();
});
gestureImage.addEventListener('error', () => {
  if (isPlaying) {
    setPlaying(false);
    mediaFailed = true;
    updatePlaybackButton();
  }
});
playButton.addEventListener('click', () => setPlaying(!isPlaying));
document.addEventListener('visibilitychange', () => { if (document.hidden && isPlaying) setPlaying(false); });
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
  if (event.matches && isPlaying) setPlaying(false);
});

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
  updateAppearance();
  updatePlaybackButton();
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
$$('[data-preview]').forEach(button => {
  button.addEventListener('click', () => {
    previewMode = button.dataset.preview;
    $$('[data-preview]').forEach(node => {
      const active = node === button;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-pressed', String(active));
    });
    updateAppearance();
  });
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
