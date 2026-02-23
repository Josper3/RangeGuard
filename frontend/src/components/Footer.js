import { useLanguage } from '../context/LanguageContext';
import { Shield, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <Link to="/" className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-800 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold font-[Manrope] text-stone-800 dark:text-stone-100">RangeGuard</span>
            </Link>
            <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
              {t('footer_desc')}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-stone-800 dark:text-stone-200 mb-3">
              {t('footer_safety')}
            </h4>
            <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
              {t('footer_safety_text')}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-stone-800 dark:text-stone-200 mb-3">
              Links
            </h4>
            <div className="flex flex-col gap-2">
              <Link to="/map" className="text-sm text-stone-500 hover:text-green-700 dark:text-stone-400 dark:hover:text-green-400 transition-colors">{t('nav_map')}</Link>
              <Link to="/login" className="text-sm text-stone-500 hover:text-green-700 dark:text-stone-400 dark:hover:text-green-400 transition-colors">{t('nav_login')}</Link>
              <Link to="/register" className="text-sm text-stone-500 hover:text-green-700 dark:text-stone-400 dark:hover:text-green-400 transition-colors">{t('nav_register')}</Link>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-stone-100 dark:border-stone-800 flex items-center justify-center text-xs text-stone-400 dark:text-stone-500 gap-1">
          Made with <Heart className="w-3 h-3 text-red-400" /> for safer trails &bull; RangeGuard 2025
        </div>
      </div>
    </footer>
  );
};
