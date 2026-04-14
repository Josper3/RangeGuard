import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  LayoutDashboard, Building2, ClipboardList, CheckCircle, XCircle,
  Clock, Users, MapPin, Calendar, Shield, Loader2, ChevronDown, ChevronUp, FileText, Map as MapIcon
} from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  draft: 'bg-stone-100 text-stone-600',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-purple-100 text-purple-700',
};

const zoneColors = {
  pending: { stroke: '#EAB308', fill: '#FDE047', opacity: 0.3 },
  approved: { stroke: '#16A34A', fill: '#4ADE80', opacity: 0.25 },
  rejected: { stroke: '#DC2626', fill: '#FCA5A5', opacity: 0.2 },
  in_progress: { stroke: '#2563EB', fill: '#60A5FA', opacity: 0.25 },
  completed: { stroke: '#7C3AED', fill: '#C4B5FD', opacity: 0.2 },
  draft: { stroke: '#78716C', fill: '#D6D3D1', opacity: 0.15 },
};

const FlyToActivity = ({ activity }) => {
  const map = useMap();
  useEffect(() => {
    if (!activity?.geometry?.coordinates?.[0]?.length) return;
    const coords = activity.geometry.coordinates[0].map(c => [c[1], c[0]]);
    if (coords.length > 0) {
      map.flyToBounds(coords, { padding: [40, 40], duration: 0.6 });
    }
  }, [activity, map]);
  return null;
};

const FitAll = ({ activities }) => {
  const map = useMap();
  useEffect(() => {
    const allCoords = [];
    activities.forEach(a => {
      if (a.geometry?.coordinates?.[0]) {
        a.geometry.coordinates[0].forEach(c => allCoords.push([c[1], c[0]]));
      }
    });
    if (allCoords.length > 0) {
      map.fitBounds(allCoords, { padding: [30, 30] });
    }
  }, [activities, map]);
  return null;
};

export default function FederationDashboard() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [mainTab, setMainTab] = useState('activities');
  const [societies, setSocieties] = useState([]);
  const [activities, setActivities] = useState([]);
  const [actFilter, setActFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [expandedAct, setExpandedAct] = useState(null);
  const [processing, setProcessing] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [socRes, actRes] = await Promise.all([
        axios.get(`${API}/federation/societies`, { headers }),
        axios.get(`${API}/federation/activities`, { headers, params: actFilter !== 'all' ? { status: actFilter } : {} }),
      ]);
      setSocieties(socRes.data);
      setActivities(actRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, actFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSocietyAction = async (id, action) => {
    setProcessing(id);
    try {
      await axios.put(`${API}/federation/societies/${id}/${action}`, {}, { headers });
      toast.success(t('success'));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally { setProcessing(null); }
  };

  const handleActivityAction = async (id, action) => {
    setProcessing(id);
    try {
      const note = notes[id] || '';
      await axios.put(`${API}/federation/activities/${id}/${action}?notes=${encodeURIComponent(note)}`, {}, { headers });
      toast.success(t('success'));
      setNotes(prev => { const n = { ...prev }; delete n[id]; return n; });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally { setProcessing(null); }
  };

  const pendingSocieties = societies.filter(s => !s.approved);
  const pendingActivities = activities.filter(a => a.status === 'pending');

  const activitiesWithGeometry = useMemo(() => activities.filter(a => a.geometry?.coordinates?.[0]?.length > 0), [activities]);
  const selectedActivity = useMemo(() => expandedAct ? activities.find(a => a.id === expandedAct) : null, [expandedAct, activities]);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100 flex items-center gap-2" data-testid="federation-title">
            <LayoutDashboard className="w-6 h-6 text-blue-600" /> {t('fed_title')}
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {pendingSocieties.length} sociedades pendientes, {pendingActivities.length} actividades pendientes
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: t('fed_societies'), value: societies.length, icon: Building2, color: 'text-amber-600' },
            { label: t('fed_society_pending'), value: pendingSocieties.length, icon: Clock, color: 'text-yellow-600' },
            { label: t('fed_activities'), value: activities.length, icon: ClipboardList, color: 'text-blue-600' },
            { label: t('fed_pending'), value: pendingActivities.length, icon: Shield, color: 'text-red-600' },
          ].map((s, i) => (
            <Card key={i} className="border-stone-200 dark:border-stone-800" data-testid={`fed-stat-${i}`}>
              <CardContent className="p-4 text-center">
                <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-1`} />
                <div className="text-2xl font-bold text-stone-800 dark:text-stone-100">{s.value}</div>
                <div className="text-xs text-stone-500">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs value={mainTab} onValueChange={setMainTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="activities" data-testid="fed-tab-activities" className="gap-2">
              <ClipboardList className="w-4 h-4" /> {t('fed_activities')}
              {pendingActivities.length > 0 && <Badge variant="destructive" className="ml-1 text-[10px]">{pendingActivities.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="societies" data-testid="fed-tab-societies" className="gap-2">
              <Building2 className="w-4 h-4" /> {t('fed_societies')}
              {pendingSocieties.length > 0 && <Badge variant="destructive" className="ml-1 text-[10px]">{pendingSocieties.length}</Badge>}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-stone-400" /></div>
        ) : mainTab === 'societies' ? (
          /* ==================== SOCIETIES TAB ==================== */
          <div className="space-y-3">
            {societies.length === 0 ? (
              <Card className="border-stone-200 dark:border-stone-800">
                <CardContent className="py-12 text-center">
                  <Building2 className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                  <p className="text-stone-500">No hay sociedades registradas.</p>
                </CardContent>
              </Card>
            ) : (
              societies.map(soc => (
                <Card key={soc.id} className={`border-stone-200 dark:border-stone-800 ${!soc.approved ? 'border-l-4 border-l-yellow-500' : ''}`} data-testid={`society-${soc.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-stone-800 dark:text-stone-100">{soc.society_name || soc.name}</h3>
                          <Badge className={soc.approved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                            {soc.approved ? t('fed_approved_label') : t('fed_society_pending')}
                          </Badge>
                        </div>
                        <div className="text-xs text-stone-500 space-y-0.5">
                          <div>CIF: {soc.cif || '-'}</div>
                          <div>Responsable: {soc.responsible_name || '-'} | Tel: {soc.responsible_phone || '-'}</div>
                          <div>Email: {soc.email}</div>
                          <div>Registro: {new Date(soc.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      {!soc.approved && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" onClick={() => handleSocietyAction(soc.id, 'approve')}
                            disabled={processing === soc.id} data-testid={`approve-society-${soc.id}`}
                            className="bg-green-700 hover:bg-green-600 text-white gap-1">
                            <CheckCircle className="w-3 h-3" /> {t('fed_approve')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleSocietyAction(soc.id, 'reject')}
                            disabled={processing === soc.id} data-testid={`reject-society-${soc.id}`}
                            className="text-red-600 border-red-200 hover:bg-red-50 gap-1">
                            <XCircle className="w-3 h-3" /> {t('fed_reject')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* ==================== ACTIVITIES TAB (with Map) ==================== */
          <div className="space-y-4">
            <Tabs value={actFilter} onValueChange={setActFilter}>
              <TabsList className="flex-wrap h-auto gap-1">
                {['pending', 'approved', 'rejected', 'completed', 'all'].map(s => (
                  <TabsTrigger key={s} value={s} data-testid={`fed-filter-${s}`} className="text-xs">
                    {s === 'all' ? t('notif_all') : t(`act_${s}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Map + Activity List Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Map */}
              <div className="lg:col-span-5 lg:order-2">
                <Card className="border-stone-200 dark:border-stone-800 sticky top-20" data-testid="fed-map-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapIcon className="w-4 h-4 text-blue-600" /> Mapa de Actividades
                      {activitiesWithGeometry.length > 0 && (
                        <Badge variant="outline" className="text-[10px] ml-auto">{activitiesWithGeometry.length} con zona</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 h-[400px]" data-testid="fed-map">
                      <MapContainer center={[39.5, -1.0]} zoom={7} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        {selectedActivity?.geometry ? (
                          <FlyToActivity activity={selectedActivity} />
                        ) : activitiesWithGeometry.length > 0 ? (
                          <FitAll activities={activitiesWithGeometry} />
                        ) : null}

                        {activitiesWithGeometry.map(act => {
                          const coords = act.geometry.coordinates[0].map(c => [c[1], c[0]]);
                          const bufferCoords = act.buffered_geometry?.coordinates?.[0]?.map(c => [c[1], c[0]]) || [];
                          const isSelected = expandedAct === act.id;
                          const colors = zoneColors[act.status] || zoneColors.draft;

                          return (
                            <div key={act.id}>
                              {/* Buffer zone */}
                              {bufferCoords.length > 0 && (
                                <Polygon
                                  positions={bufferCoords}
                                  pathOptions={{
                                    color: colors.stroke, fillColor: colors.fill,
                                    fillOpacity: isSelected ? 0.12 : 0.06,
                                    weight: 1, dashArray: '5 5'
                                  }}
                                />
                              )}
                              {/* Main zone */}
                              <Polygon
                                positions={coords}
                                pathOptions={{
                                  color: isSelected ? '#1D4ED8' : colors.stroke,
                                  fillColor: isSelected ? '#3B82F6' : colors.fill,
                                  fillOpacity: isSelected ? 0.4 : colors.opacity,
                                  weight: isSelected ? 3 : 2,
                                }}
                                eventHandlers={{ click: () => setExpandedAct(isSelected ? null : act.id) }}
                              >
                                <Popup>
                                  <div className="text-sm space-y-1 min-w-[180px]">
                                    <div className="font-bold">{act.activity_type.toUpperCase()}: {act.coto_name}</div>
                                    <div className="text-xs text-gray-600">{act.society_name}</div>
                                    <div className="text-xs text-gray-500">{act.partida_paraje} - {act.termino_municipal}</div>
                                    <div className="text-xs text-gray-500">
                                      {act.start_time?.slice(0, 16)} - {act.end_time?.slice(0, 16)}
                                    </div>
                                    <div className="text-xs font-medium mt-1" style={{ color: colors.stroke }}>
                                      Estado: {t(`act_${act.status}`)}
                                    </div>
                                  </div>
                                </Popup>
                              </Polygon>
                            </div>
                          );
                        })}
                      </MapContainer>
                    </div>
                    {/* Map Legend */}
                    <div className="flex flex-wrap gap-3 mt-3 px-1">
                      {[
                        { label: t('act_pending'), color: '#EAB308' },
                        { label: t('act_approved'), color: '#16A34A' },
                        { label: t('act_rejected'), color: '#DC2626' },
                        { label: t('act_completed'), color: '#7C3AED' },
                      ].map(l => (
                        <div key={l.label} className="flex items-center gap-1.5 text-[10px] text-stone-500">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: l.color, opacity: 0.5 }} />
                          {l.label}
                        </div>
                      ))}
                      <div className="flex items-center gap-1.5 text-[10px] text-blue-600 font-medium">
                        <div className="w-3 h-3 rounded bg-blue-500" />
                        Seleccionada
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Activity List */}
              <div className="lg:col-span-7 lg:order-1 space-y-3">
                {activities.length === 0 ? (
                  <Card className="border-stone-200 dark:border-stone-800">
                    <CardContent className="py-12 text-center">
                      <FileText className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                      <p className="text-stone-500">No hay actividades con este filtro.</p>
                    </CardContent>
                  </Card>
                ) : (
                  activities.map(act => {
                    const isExpanded = expandedAct === act.id;
                    const hasGeo = act.geometry?.coordinates?.[0]?.length > 0;
                    return (
                      <Card key={act.id}
                        className={`border-stone-200 dark:border-stone-800 transition-all ${
                          act.status === 'pending' ? 'border-l-4 border-l-yellow-500' : ''
                        } ${isExpanded ? 'ring-2 ring-blue-400 dark:ring-blue-600 shadow-md' : ''}`}
                        data-testid={`fed-activity-${act.id}`}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 cursor-pointer" onClick={() => setExpandedAct(isExpanded ? null : act.id)}>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge className={`text-[10px] ${statusColors[act.status]}`}>{t(`act_${act.status}`)}</Badge>
                                <Badge variant="outline" className="text-[10px] uppercase">{act.activity_type}</Badge>
                                <span className="text-xs text-stone-400">{act.society_name}</span>
                                {hasGeo && <MapPin className="w-3 h-3 text-blue-500" title="Tiene zona en el mapa" />}
                              </div>
                              <h3 className="font-semibold text-stone-800 dark:text-stone-100">{act.coto_name || 'Sin nombre'}</h3>
                              <div className="text-xs text-stone-500 flex flex-wrap gap-3 mt-1">
                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {act.partida_paraje} - {act.termino_municipal}</span>
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {act.date || act.start_time?.slice(0, 10)}</span>
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {act.participants?.length || 0} part.</span>
                              </div>
                              <div className="flex items-center gap-1 mt-1 text-xs text-stone-400">
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {isExpanded ? 'Ocultar detalles' : 'Ver detalles'}
                              </div>
                            </div>
                            {act.status === 'pending' && (
                              <div className="flex flex-col gap-2 shrink-0">
                                <Button size="sm" onClick={() => handleActivityAction(act.id, 'approve')}
                                  disabled={processing === act.id} data-testid={`approve-act-${act.id}`}
                                  className="bg-green-700 hover:bg-green-600 text-white gap-1">
                                  <CheckCircle className="w-3 h-3" /> {t('fed_approve')}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleActivityAction(act.id, 'reject')}
                                  disabled={processing === act.id} data-testid={`reject-act-${act.id}`}
                                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1">
                                  <XCircle className="w-3 h-3" /> {t('fed_reject')}
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Notes input for pending */}
                          {act.status === 'pending' && (
                            <div className="mt-3">
                              <Textarea
                                placeholder={t('fed_notes')}
                                value={notes[act.id] || ''}
                                onChange={e => setNotes(prev => ({ ...prev, [act.id]: e.target.value }))}
                                rows={2} className="text-xs"
                                data-testid={`fed-notes-${act.id}`}
                              />
                            </div>
                          )}

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-3 text-sm animate-in fade-in duration-200">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div><span className="text-stone-400 block">{t('act_resp_name')}</span>{act.responsible_name || '-'}</div>
                                <div><span className="text-stone-400 block">{t('act_resp_dni')}</span>{act.responsible_dni || '-'}</div>
                                <div><span className="text-stone-400 block">{t('act_resp_phone')}</span>{act.responsible_phone || '-'}</div>
                                <div><span className="text-stone-400 block">{t('act_coto_matricula')}</span>{act.coto_matricula || '-'}</div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div><span className="text-stone-400 block">{t('act_start')}</span>{act.start_time?.slice(0, 16) || '-'}</div>
                                <div><span className="text-stone-400 block">{t('act_end')}</span>{act.end_time?.slice(0, 16) || '-'}</div>
                                <div><span className="text-stone-400 block">{t('act_auth_type')}</span>{act.authorization_type === 'ptoc_comunicacion' ? t('act_ptoc') : t('act_extra')}</div>
                                <div><span className="text-stone-400 block">{t('act_species')}</span>{act.authorized_species?.join(', ') || '-'}</div>
                              </div>
                              {act.participants?.length > 0 && (
                                <div>
                                  <span className="text-stone-400 text-xs block mb-2">{t('act_participants')} ({act.participants.length})</span>
                                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                    {act.participants.map((p, i) => (
                                      <div key={i} className="flex items-center justify-between p-2 rounded border border-stone-100 dark:border-stone-800 text-xs">
                                        <span className="font-medium">{p.name} <span className="text-stone-400">{p.dni}</span></span>
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className="text-[10px] capitalize">{p.role?.replace('_', ' ') || '-'}</Badge>
                                          {p.dog_count > 0 && <Badge className="text-[10px] bg-amber-100 text-amber-700">{p.dog_count} perros</Badge>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {act.federation_notes && (
                                <div className="p-3 rounded bg-stone-50 dark:bg-stone-800/50 text-xs">
                                  <span className="text-stone-400 block mb-1">{t('fed_notes')}</span>
                                  {act.federation_notes}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
