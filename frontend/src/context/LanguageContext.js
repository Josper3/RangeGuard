import { createContext, useContext, useState, useCallback } from 'react';
import translations from '../i18n/translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('rangeguard_lang') || 'es';
  });

  const t = useCallback((key) => {
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  }, [lang]);

  const switchLang = useCallback((newLang) => {
    setLang(newLang);
    localStorage.setItem('rangeguard_lang', newLang);
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, t, switchLang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
