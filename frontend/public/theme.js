// Shows the theme chosen in this browser from the first paint, so that a dark page does not flash light while the app
// loads: «Как в системе», with no choice stored, follows the scheme of the system. A classic script in <head>, which runs
// before the page is drawn, and a file of its own: the policy of the app allows no inline scripts. The app keeps the
// theme up to date afterwards; the key and the class are those of src/theme/theme.ts.
;(function () {
  var choice = null
  try {
    choice = window.localStorage.getItem('codraw.theme')
  } catch {
    // The browser keeps no data for the site: the scheme of the system.
  }
  var systemDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  if (choice === 'dark' || (choice !== 'light' && systemDark)) document.documentElement.classList.add('dark')
})()
