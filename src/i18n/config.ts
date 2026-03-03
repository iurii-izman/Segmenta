import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ru from './locales/ru.json';
import en from './locales/en.json';

const LANG_STORAGE_KEY = 'transkribator-lang';

function getSavedLanguage(): string {
    try {
        const saved = localStorage.getItem(LANG_STORAGE_KEY);
        if (saved === 'ru' || saved === 'en') return saved;
    } catch { }
    return 'ru';
}

i18n
    .use(initReactI18next)
    .init({
        resources: {
            ru: { translation: ru },
            en: { translation: en }
        },
        lng: getSavedLanguage(),
        fallbackLng: 'ru',
        interpolation: {
            escapeValue: false // react already safes from xss
        }
    });

i18n.on('languageChanged', (lng) => {
    try {
        localStorage.setItem(LANG_STORAGE_KEY, lng);
    } catch { }
});

export default i18n;
