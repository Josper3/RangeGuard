import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Shield, Mountain } from 'lucide-react';

export default function AuthPage({ mode = 'login' }) {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(mode === 'login');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', name: '', role: 'user', organization_name: '', cif: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await login(form.email, form.password);
        toast.success(t('success'));
      } else {
        await register(form);
        toast.success(t('success'));
      }
      navigate('/map');
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-green-800 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight font-[Manrope] text-stone-800 dark:text-stone-100">
            RangeGuard
          </span>
        </div>

        <Card className="border-stone-200 dark:border-stone-800 shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-[Manrope] text-stone-800 dark:text-stone-100">
              {isLogin ? t('auth_login_title') : t('auth_register_title')}
            </CardTitle>
            <CardDescription className="text-stone-500 dark:text-stone-400">
              {isLogin ? t('auth_login_subtitle') : t('auth_register_subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t('auth_name')}</Label>
                  <Input
                    id="name"
                    data-testid="auth-name-input"
                    value={form.name}
                    onChange={e => update('name', e.target.value)}
                    required
                    placeholder="Juan Garcia"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth_email')}</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="auth-email-input"
                  value={form.email}
                  onChange={e => update('email', e.target.value)}
                  required
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth_password')}</Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="auth-password-input"
                  value={form.password}
                  onChange={e => update('password', e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min. 6 caracteres"
                />
              </div>
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label>{t('auth_role')}</Label>
                    <Select value={form.role} onValueChange={v => update('role', v)}>
                      <SelectTrigger data-testid="auth-role-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">
                          <span className="flex items-center gap-2">
                            <Mountain className="w-4 h-4" /> {t('auth_role_user')}
                          </span>
                        </SelectItem>
                        <SelectItem value="admin">
                          <span className="flex items-center gap-2">
                            <Shield className="w-4 h-4" /> {t('auth_role_admin')}
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.role === 'admin' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="org">{t('auth_org_name')}</Label>
                        <Input
                          id="org"
                          data-testid="auth-org-input"
                          value={form.organization_name}
                          onChange={e => update('organization_name', e.target.value)}
                          required
                          placeholder="Asociacion de Caza..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cif">{t('auth_cif')}</Label>
                        <Input
                          id="cif"
                          data-testid="auth-cif-input"
                          value={form.cif}
                          onChange={e => update('cif', e.target.value)}
                          required
                          placeholder="B12345678"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
              <Button
                type="submit"
                data-testid="auth-submit-button"
                className="w-full bg-green-800 hover:bg-green-700 text-white font-medium"
                disabled={loading}
              >
                {loading ? t('loading') : (isLogin ? t('auth_submit_login') : t('auth_submit_register'))}
              </Button>
            </form>
            <div className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
              {isLogin ? t('auth_no_account') : t('auth_has_account')}{' '}
              <button
                data-testid="auth-toggle-mode"
                onClick={() => setIsLogin(!isLogin)}
                className="text-green-700 dark:text-green-400 font-medium hover:underline"
              >
                {isLogin ? t('nav_register') : t('nav_login')}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
