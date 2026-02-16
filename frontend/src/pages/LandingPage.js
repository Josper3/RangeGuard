import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Shield, Map, Upload, AlertTriangle, ChevronRight, Target, Eye, FileCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LandingPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ active_zones: 0, total_users: 0, total_routes: 0 });

  useEffect(() => {
    axios.get(`${API}/stats`).then(r => setStats(r.data)).catch(() => {});
  }, []);

  const features = [
    { icon: Eye, title: t('feat_1_title'), desc: t('feat_1_desc'), color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' },
    { icon: Upload, title: t('feat_2_title'), desc: t('feat_2_desc'), color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' },
    { icon: Shield, title: t('feat_3_title'), desc: t('feat_3_desc'), color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900" />
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23166534' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-32 md:pt-32 md:pb-40">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-xs font-semibold uppercase tracking-wider mb-6">
              <Target className="w-3.5 h-3.5" />
              {t('landing_safe')}
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight font-[Manrope] text-stone-900 dark:text-stone-50 leading-[1.1] mb-6">
              {t('hero_title')}
            </h1>
            <p className="text-lg md:text-xl text-stone-600 dark:text-stone-300 leading-relaxed mb-10 max-w-2xl">
              {t('hero_subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={() => navigate('/map')}
                data-testid="hero-explore-map"
                className="bg-green-800 hover:bg-green-700 text-white font-semibold px-8 py-3 h-auto text-base gap-2 rounded-lg shadow-lg shadow-green-800/20"
              >
                <Map className="w-5 h-5" />
                {t('hero_cta')}
                <ChevronRight className="w-4 h-4" />
              </Button>
              {!user && (
                <Button
                  onClick={() => navigate('/register')}
                  variant="outline"
                  data-testid="hero-register"
                  className="border-2 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 font-semibold px-8 py-3 h-auto text-base rounded-lg hover:border-green-600 hover:text-green-800 dark:hover:border-green-400 dark:hover:text-green-300"
                >
                  {t('hero_cta_register')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative -mt-16 z-10">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-3 gap-4 md:gap-6">
            {[
              { label: t('landing_active_zones'), value: stats.active_zones, icon: AlertTriangle, color: 'text-red-500' },
              { label: t('landing_users'), value: stats.total_users, icon: Shield, color: 'text-green-600' },
              { label: t('landing_routes_checked'), value: stats.total_routes, icon: FileCheck, color: 'text-blue-500' },
            ].map((stat, i) => (
              <Card key={i} className="bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 shadow-lg hover:shadow-xl transition-shadow" data-testid={`stat-card-${i}`}>
                <CardContent className="p-4 md:p-6 text-center">
                  <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} />
                  <div className="text-2xl md:text-3xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100">{stat.value}</div>
                  <div className="text-xs md:text-sm text-stone-500 dark:text-stone-400 mt-1">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold font-[Manrope] text-stone-900 dark:text-stone-50 tracking-tight">
              {t('feat_title')}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {features.map((feat, i) => (
              <Card key={i} className="bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:shadow-lg transition-shadow group" data-testid={`feature-card-${i}`}>
                <CardContent className="p-8">
                  <div className={`w-12 h-12 rounded-xl ${feat.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                    <feat.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-semibold font-[Manrope] text-stone-800 dark:text-stone-100 mb-3">
                    {feat.title}
                  </h3>
                  <p className="text-stone-500 dark:text-stone-400 leading-relaxed">
                    {feat.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-green-800 dark:bg-green-900">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-[Manrope] text-white mb-4">
            {t('landing_safe')}
          </h2>
          <p className="text-green-100 text-lg mb-8 max-w-2xl mx-auto">
            {t('footer_safety_text')}
          </p>
          <Button
            onClick={() => navigate('/map')}
            data-testid="cta-explore-map"
            className="bg-white text-green-800 hover:bg-green-50 font-semibold px-8 py-3 h-auto text-base rounded-lg gap-2"
          >
            <Map className="w-5 h-5" />
            {t('hero_cta')}
          </Button>
        </div>
      </section>
    </div>
  );
}
