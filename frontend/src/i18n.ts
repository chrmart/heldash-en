import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'

// The active language is stored in the app's Settings (DB key: "language").
// This init uses the stored value if available, falling back to 'de' (the
// app's original language) so existing installs are unaffected by default.
const storedLang = localStorage.getItem('heldash_lang') ?? 'de'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    lng: storedLang,
    fallbackLng: 'de',
    interpolation: {
      // React already escapes values
      escapeValue: false,
    },
  })

export default i18n

/** Call this whenever the stored language setting changes. */
export function applyLanguage(lang: string) {
  localStorage.setItem('heldash_lang', lang)
  void i18n.changeLanguage(lang)
}
