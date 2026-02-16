import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  Bell, AlertTriangle, AlertOctagon, Info, CheckCheck, Trash2,
  Clock, MapPin, Route, Shield, ChevronRight, Inbox
} from 'lucide-react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ConflictIcon = ({ type }) => {
  if (type === 'contained') return <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400" />;
  if (type === 'intersects') return <AlertTriangle className="w-5 h-5 text-orange-500 dark:text-orange-400" />;
  return <Info className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />;
};

const ConflictBadge = ({ type, t }) => {
  if (type === 'contained') {
    return <Badge variant="destructive" className="text-[10px]">{t('notif_conflict_contained')}</Badge>;
  }
  if (type === 'intersects') {
    return <Badge className="text-[10px] bg-orange-500 hover:bg-orange-600 text-white">{t('notif_conflict_intersects')}</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">{t('notif_conflict_buffer')}</Badge>;
};

export default function NotificationsPage() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  const headers = { Authorization: `Bearer ${token}` };

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/notifications`, { headers });
      setNotifications(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) fetchNotifications();
  }, [fetchNotifications, token]);

  const markRead = async (id) => {
    try {
      await axios.put(`${API}/notifications/${id}/read`, {}, { headers });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      toast.error(t('error'));
    }
  };

  const markAllRead = async () => {
    try {
      await axios.put(`${API}/notifications/read-all`, {}, { headers });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success(t('success'));
    } catch (err) {
      toast.error(t('error'));
    }
  };

  const deleteNotification = async (id) => {
    try {
      await axios.delete(`${API}/notifications/${id}`, { headers });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      toast.error(t('error'));
    }
  };

  const filtered = tab === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100 flex items-center gap-2">
              <Bell className="w-6 h-6 text-green-700 dark:text-green-400" />
              {t('notif_title')}
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1">{unreadCount}</Badge>
              )}
            </h1>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              data-testid="mark-all-read-btn"
              onClick={markAllRead}
              className="gap-2 text-sm"
            >
              <CheckCheck className="w-4 h-4" />
              {t('notif_mark_all_read')}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[240px]">
            <TabsTrigger value="all" data-testid="notif-tab-all">{t('notif_all')}</TabsTrigger>
            <TabsTrigger value="unread" data-testid="notif-tab-unread">
              {t('notif_unread')} {unreadCount > 0 && `(${unreadCount})`}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Notification List */}
        {loading ? (
          <div className="text-center py-12 text-stone-400">{t('loading')}</div>
        ) : filtered.length === 0 ? (
          <Card className="border-stone-200 dark:border-stone-800">
            <CardContent className="py-16 text-center">
              <Inbox className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-4" />
              <p className="text-stone-500 dark:text-stone-400 text-sm max-w-sm mx-auto">
                {t('notif_empty')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(notif => (
              <Card
                key={notif.id}
                className={`border transition-colors ${
                  notif.read
                    ? 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
                    : 'border-l-4 border-l-red-500 border-stone-200 dark:border-stone-800 bg-red-50/50 dark:bg-red-950/10'
                }`}
                data-testid={`notification-${notif.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      notif.data?.conflict_type === 'contained'
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : notif.data?.conflict_type === 'intersects'
                        ? 'bg-orange-100 dark:bg-orange-900/30'
                        : 'bg-yellow-100 dark:bg-yellow-900/30'
                    }`}>
                      <ConflictIcon type={notif.data?.conflict_type} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className={`text-sm font-semibold leading-tight ${
                          notif.read
                            ? 'text-stone-600 dark:text-stone-300'
                            : 'text-stone-800 dark:text-stone-100'
                        }`}>
                          {notif.title}
                        </h3>
                        <span className="text-[10px] text-stone-400 whitespace-nowrap mt-0.5">
                          {timeAgo(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed whitespace-pre-line mb-2">
                        {notif.message}
                      </p>

                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {notif.data?.conflict_type && (
                          <ConflictBadge type={notif.data.conflict_type} t={t} />
                        )}
                        {notif.data?.route_name && (
                          <span className="text-[10px] text-stone-400 flex items-center gap-1">
                            <Route className="w-3 h-3" /> {notif.data.route_name}
                          </span>
                        )}
                        {notif.data?.zone_name && (
                          <span className="text-[10px] text-stone-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {notif.data.zone_name}
                          </span>
                        )}
                        {notif.data?.zone_start && (
                          <span className="text-[10px] text-stone-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {notif.data.zone_start?.slice(0, 16)} - {notif.data.zone_end?.slice(0, 16)}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Link to="/routes">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid={`notif-view-route-${notif.id}`}>
                            <Shield className="w-3 h-3" />
                            {t('routes_check')}
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </Link>
                        {!notif.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-green-600 hover:text-green-700"
                            onClick={() => markRead(notif.id)}
                            data-testid={`notif-mark-read-${notif.id}`}
                          >
                            <CheckCheck className="w-3 h-3 mr-1" />
                            {t('notif_mark_read')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-500 hover:text-red-600 ml-auto"
                          onClick={() => deleteNotification(notif.id)}
                          data-testid={`notif-delete-${notif.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
