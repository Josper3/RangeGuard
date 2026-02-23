import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Shield, Menu, X, Sun, Moon, Globe, Map, Route, LayoutDashboard, User, LogOut, Bell, Compass, Heart } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const Navbar = () => {
  const { user, token, logout, isAdmin } = useAuth();
  const { t, lang, switchLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user || !token) return;
    try {
      const res = await axios.get(`${API}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUnreadCount(res.data.count);
    } catch {}
  }, [user, token]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navLinks = [
    { to: '/map', label: t('nav_map'), icon: Map },
    { to: '/explore', label: t('explore_title'), icon: Compass },
    ...(user ? [{ to: '/routes', label: t('nav_routes'), icon: Route }] : []),
    ...(isAdmin ? [{ to: '/admin', label: t('nav_admin'), icon: LayoutDashboard }] : []),
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group" data-testid="nav-logo">
            <div className="w-9 h-9 rounded-lg bg-green-800 flex items-center justify-center group-hover:bg-green-700 transition-colors">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight font-[Manrope] text-stone-800 dark:text-stone-100">
              RangeGuard
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link key={link.to} to={link.to} data-testid={`nav-link-${link.to.slice(1)}`}>
                <Button variant="ghost" className="text-stone-600 dark:text-stone-300 hover:text-green-800 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 gap-2 font-medium">
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => switchLang(lang === 'es' ? 'en' : 'es')}
              data-testid="lang-toggle"
              className="text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
            >
              <Globe className="w-4 h-4" />
              <span className="ml-1 text-xs font-mono uppercase">{lang}</span>
            </Button>
            {user && (
              <Link to="/notifications" data-testid="nav-notifications">
                <Button variant="ghost" size="icon" className="relative text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100">
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="theme-toggle"
              className="text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" data-testid="user-menu-trigger" className="gap-2 text-stone-600 dark:text-stone-300">
                    <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                      <User className="w-4 h-4 text-green-800 dark:text-green-300" />
                    </div>
                    <span className="text-sm font-medium">{user.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="text-xs text-stone-400">
                    {user.email}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} data-testid="logout-button" className="text-red-600">
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('nav_logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login">
                  <Button variant="ghost" data-testid="nav-login-btn" className="text-stone-600 dark:text-stone-300 font-medium">
                    {t('nav_login')}
                  </Button>
                </Link>
                <Link to="/register">
                  <Button data-testid="nav-register-btn" className="bg-green-800 hover:bg-green-700 text-white font-medium">
                    {t('nav_register')}
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 text-stone-600 dark:text-stone-300"
            onClick={() => setMobileOpen(!mobileOpen)}
            data-testid="mobile-menu-toggle"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-stone-200 dark:border-stone-800 py-4 space-y-2">
            {navLinks.map(link => (
              <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-2 text-stone-600 dark:text-stone-300">
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Button>
              </Link>
            ))}
            <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <Button variant="ghost" size="sm" onClick={() => switchLang(lang === 'es' ? 'en' : 'es')}>
                <Globe className="w-4 h-4 mr-1" /> {lang.toUpperCase()}
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
            {user ? (
              <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-red-600 gap-2">
                <LogOut className="w-4 h-4" /> {t('nav_logout')}
              </Button>
            ) : (
              <div className="flex gap-2 pt-2">
                <Link to="/login" onClick={() => setMobileOpen(false)} className="flex-1">
                  <Button variant="outline" className="w-full">{t('nav_login')}</Button>
                </Link>
                <Link to="/register" onClick={() => setMobileOpen(false)} className="flex-1">
                  <Button className="w-full bg-green-800 text-white">{t('nav_register')}</Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
