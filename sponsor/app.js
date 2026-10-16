(() => {
  const root = document.documentElement;
  const themeButton = document.getElementById('theme-toggle');
  const languageButton = document.getElementById('language-toggle');
  const navigation = document.querySelector('.header-links');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let manualTheme = false;
  try { manualTheme = ['dark', 'light'].includes(localStorage.getItem('starpie-theme')); } catch { /* Optional storage. */ }

  function remember(key, value) {
    try { localStorage.setItem(key, value); } catch { /* The current page still works without storage. */ }
  }

  function updateLabels() {
    const english = root.dataset.language === 'en';
    const dark = root.dataset.theme === 'dark';
    document.title = english ? 'Thank you for your support · StarPie' : '感谢每一份支持 · StarPie';
    navigation.setAttribute('aria-label', english ? 'Page navigation' : '页面导航');
    document.querySelector('.donation-links')?.setAttribute('aria-label', english ? 'Choose a support method' : '选择支持方式');
    languageButton.textContent = english ? '简体中文' : 'English';
    languageButton.setAttribute('aria-label', english ? '切换到简体中文' : 'Switch to English');
    const label = english ? `Switch to ${dark ? 'light' : 'dark'} theme` : `切换到${dark ? '浅' : '深'}色主题`;
    themeButton.setAttribute('aria-label', label);
    themeButton.setAttribute('title', label);
    themeButton.setAttribute('aria-pressed', String(dark));
  }

  themeButton.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    manualTheme = true;
    remember('starpie-theme', root.dataset.theme);
    updateLabels();
  });
  languageButton.addEventListener('click', () => {
    root.dataset.language = root.dataset.language === 'en' ? 'zh-CN' : 'en';
    root.lang = root.dataset.language;
    remember('starpie-language', root.dataset.language);
    updateLabels();
  });
  systemTheme.addEventListener('change', event => {
    if (manualTheme) return;
    root.dataset.theme = event.matches ? 'dark' : 'light';
    updateLabels();
  });
  updateLabels();
})();
