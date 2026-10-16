/* Match the homepage preference keys without depending on its files. */
(() => {
  const root = document.documentElement;
  let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  let language = 'zh-CN';
  try {
    const savedTheme = localStorage.getItem('starpie-theme');
    const savedLanguage = localStorage.getItem('starpie-language');
    if (savedTheme === 'light' || savedTheme === 'dark') theme = savedTheme;
    if (savedLanguage === 'zh-CN' || savedLanguage === 'en') language = savedLanguage;
  } catch { /* Storage is optional, including in private browsing. */ }
  root.dataset.theme = theme;
  root.dataset.language = language;
  root.lang = language;
  root.classList.add('js');
})();
