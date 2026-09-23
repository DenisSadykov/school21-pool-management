(function () {
  try {
    var savedTheme = localStorage.getItem('uiTheme');
    var theme = savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]').setAttribute(
      'content',
      theme === 'dark' ? '#0b0f14' : '#f6f7f9'
    );
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}());
