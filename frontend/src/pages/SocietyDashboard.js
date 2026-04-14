import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Calendar, MapPin, Shield, Clock, AlertTriangle, FileText, Users, ChevronRight, Loader2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  draft: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export default function SocietyDashboard() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const headers = { Authorization: `Bearer ${token}` };

  const fetch = useCallback(async () => {
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const res = await axios.get(`${API}/activities`, { headers, params });
      setActivities(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  if (!user?.approved) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4">
        <Card className="max-w-md w-full border-yellow-300 dark:border-yellow-700">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-2">{t('auth_pending_approval')}</h2>
            <p className="text-sm text-stone-500">{user?.society_name} - CIF: {user?.cif}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filtered = activities;
  const counts = { all: activities.length };
  activities.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100 flex items-center gap-2">
              <Shield className="w-6 h-6 text-green-700" /> {t('act_title')}
            </h1>
            <p className="text-sm text-stone-500 mt-1">{user?.society_name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/society/participants')} data-testid="manage-regulars-btn" className="gap-2">
              <Users className="w-4 h-4" /> {t('act_regular_participants')}
            </Button>
            <Button onClick={() => navigate('/society/activity/new')} data-testid="create-activity-btn" className="bg-green-800 hover:bg-green-700 text-white gap-2">
              <Plus className="w-4 h-4" /> {t('act_create')}
            </Button>
          </div>
        </div>

        {/* Status Tabs */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
          <TabsList className="flex-wrap h-auto gap-1">
            {['all', 'draft', 'pending', 'approved', 'rejected', 'completed'].map(s => (
              <TabsTrigger key={s} value={s} data-testid={`filter-${s}`} className="text-xs">
                {s === 'all' ? t('notif_all') : t(`act_${s}`)} {counts[s] ? `(${counts[s]})` : ''}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Activities List */}
        {loading ? (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-stone-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="border-stone-200 dark:border-stone-800">
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500">{t('act_no_activities')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(act => (
              <Card key={act.id} className="border-stone-200 dark:border-stone-800 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/society/activity/${act.id}`)} data-testid={`activity-${act.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-[10px] ${statusColors[act.status]}`}>{t(`act_${act.status}`)}</Badge>
                        <Badge variant="outline" className="text-[10px] uppercase">{act.activity_type}</Badge>
                      </div>
                      <h3 className="font-semibold text-stone-800 dark:text-stone-100">{act.coto_name || 'Sin nombre'}</h3>
                    </div>
                    <ChevronRight className="w-5 h-5 text-stone-400 shrink-0 mt-1" />
                  </div>
                  <div className="text-xs text-stone-500 space-y-1">
                    <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {act.partida_paraje} - {act.termino_municipal}</div>
                    <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {act.date || 'Sin fecha'}</div>
                    <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {act.start_time?.slice(11,16) || '--:--'} - {act.end_time?.slice(11,16) || '--:--'}</div>
                    <div className="flex items-center gap-1"><Users className="w-3 h-3" /> {act.participants?.length || 0} participantes</div>
                  </div>
                  {act.status === 'rejected' && act.federation_notes && (
                    <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/10 text-xs text-red-600 dark:text-red-400">
                      Motivo: {act.federation_notes}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
