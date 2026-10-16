/* Applied before first paint. Preferences are optional; blocked storage is safe. */
(() => {
  let theme = 'dark';
  let language = 'zh-CN';
  try {
    const savedTheme = localStorage.getItem('starpie-theme');
    const savedLanguage = localStorage.getItem('starpie-language');
    if (savedTheme === 'light' || savedTheme === 'dark') theme = savedTheme;
    if (savedLanguage === 'en' || savedLanguage === 'zh-CN') language = savedLanguage;
  } catch { /* Private browsers may disable localStorage. */ }
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.language = language;
  document.documentElement.classList.add('js');
})();
