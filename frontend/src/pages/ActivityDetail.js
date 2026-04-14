import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Users, MapPin, Clock, Calendar, Shield, CheckCircle, Send } from 'lucide-react';
import { MapContainer, TileLayer, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SPECIES = ["jabali", "zorro", "muflon", "ciervo", "arrui", "gamo"];
const WEIGHTS = ["<25kg", "25-50kg", "50-75kg", "75-100kg", ">100kg"];

const statusColors = {
  draft: 'bg-stone-100 text-stone-600', pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700', completed: 'bg-purple-100 text-purple-700',
};

export default function ActivityDetail() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { activityId } = useParams();
  const [activity, setActivity] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState({
    species_results: SPECIES.map(sp => ({
      species: sp,
      males: Object.fromEntries(WEIGHTS.map(w => [w, 0])),
      females: Object.fromEntries(WEIGHTS.map(w => [w, 0])),
      trophies: 0
    })),
    taxonomic_observations: '',
    incidents: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios.get(`${API}/activities/${activityId}`, { headers })
      .then(r => {
        setActivity(r.data);
        if (r.data.results) {
          setResults(r.data.results);
        }
      })
      .catch(() => toast.error(t('error')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const updateSpeciesResult = (spIdx, sex, weight, value) => {
    setResults(prev => {
      const sr = [...prev.species_results];
      sr[spIdx] = { ...sr[spIdx], [sex]: { ...sr[spIdx][sex], [weight]: parseInt(value) || 0 } };
      return { ...prev, species_results: sr };
    });
  };

  const updateTrophies = (spIdx, value) => {
    setResults(prev => {
      const sr = [...prev.species_results];
      sr[spIdx] = { ...sr[spIdx], trophies: parseInt(value) || 0 };
      return { ...prev, species_results: sr };
    });
  };

  const submitResults = async () => {
    setSubmitting(true);
    try {
      // Filter to only species that were authorized
      const filtered = {
        ...results,
        species_results: results.species_results.filter(sr =>
          activity.authorized_species?.includes(sr.species)
        )
      };
      await axios.put(`${API}/activities/${activityId}/results`, filtered, { headers });
      toast.success(t('success'));
      // Refresh
      const r = await axios.get(`${API}/activities/${activityId}`, { headers });
      setActivity(r.data);
      setShowResults(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally { setSubmitting(false); }
  };

  if (!activity) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-green-800 border-t-transparent rounded-full" /></div>;

  const canEdit = ['draft', 'rejected'].includes(activity.status);
  const canSubmitResults = ['approved', 'in_progress'].includes(activity.status);
  const coords = activity.geometry?.coordinates?.[0]?.map(c => [c[1], c[0]]) || [];

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
        <Button variant="ghost" onClick={() => navigate('/society')} className="mb-4 gap-2 text-stone-500">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`${statusColors[activity.status]}`}>{t(`act_${activity.status}`)}</Badge>
              <Badge variant="outline" className="uppercase text-xs">{activity.activity_type}</Badge>
            </div>
            <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100">{activity.coto_name || 'Sin nombre'}</h1>
            <p className="text-sm text-stone-500">{activity.society_name}</p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => navigate(`/society/activity/${activityId}/edit`)} className="gap-2" data-testid="edit-activity-btn">
                <FileText className="w-4 h-4" /> {t('act_edit')}
              </Button>
            )}
            {canSubmitResults && (
              <Button onClick={() => setShowResults(true)} className="bg-green-800 hover:bg-green-700 text-white gap-2" data-testid="open-results-btn">
                <CheckCircle className="w-4 h-4" /> {t('act_results')}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Info */}
          <Card className="border-stone-200 dark:border-stone-800">
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t('act_responsible')} & {t('act_location')}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-stone-400 text-xs block">{t('act_resp_name')}</span><span className="text-stone-800 dark:text-stone-100">{activity.responsible_name}</span></div>
                <div><span className="text-stone-400 text-xs block">{t('act_resp_dni')}</span><span className="text-stone-800 dark:text-stone-100">{activity.responsible_dni}</span></div>
                <div><span className="text-stone-400 text-xs block">{t('act_resp_phone')}</span><span className="text-stone-800 dark:text-stone-100">{activity.responsible_phone}</span></div>
                <div><span className="text-stone-400 text-xs block">{t('act_coto_matricula')}</span><span className="text-stone-800 dark:text-stone-100">{activity.coto_matricula || '-'}</span></div>
              </div>
              <div className="border-t border-stone-100 dark:border-stone-800 pt-3 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-stone-400" /><span>{activity.start_time?.slice(0, 16)} - {activity.end_time?.slice(0, 16)}</span></div>
                <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-stone-400" /><span>{activity.partida_paraje} - {activity.termino_municipal}</span></div>
              </div>
              <div className="border-t border-stone-100 dark:border-stone-800 pt-3">
                <span className="text-stone-400 text-xs block mb-1">{t('act_auth_type')}</span>
                <span>{activity.authorization_type === 'ptoc_comunicacion' ? t('act_ptoc') : t('act_extra')}</span>
              </div>
              <div className="border-t border-stone-100 dark:border-stone-800 pt-3">
                <span className="text-stone-400 text-xs block mb-1">{t('act_species')}</span>
                <div className="flex flex-wrap gap-1">
                  {activity.authorized_species?.map(sp => <Badge key={sp} variant="outline" className="text-xs capitalize">{sp}</Badge>)}
                </div>
              </div>
              {activity.federation_notes && (
                <div className="border-t border-stone-100 dark:border-stone-800 pt-3">
                  <span className="text-stone-400 text-xs block mb-1">{t('fed_notes')}</span>
                  <p className="text-stone-700 dark:text-stone-300">{activity.federation_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Map */}
          <div className="space-y-4">
            {coords.length > 0 ? (
              <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 h-[300px]">
                <MapContainer center={coords[0] || [39.5, -0.5]} zoom={12} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Polygon positions={coords} pathOptions={{ color: '#EF4444', fillOpacity: 0.2, weight: 2 }} />
                </MapContainer>
              </div>
            ) : (
              <Card className="border-stone-200 dark:border-stone-800 h-[300px] flex items-center justify-center">
                <p className="text-stone-400 text-sm">{t('act_draw_hint')}</p>
              </Card>
            )}

            {/* Participants */}
            <Card className="border-stone-200 dark:border-stone-800">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> {t('act_participants')} ({activity.participants?.length || 0})</CardTitle></CardHeader>
              <CardContent className="max-h-[250px] overflow-y-auto">
                {activity.participants?.length ? (
                  <div className="space-y-2">
                    {activity.participants.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded border border-stone-100 dark:border-stone-800 text-xs">
                        <div>
                          <span className="font-medium text-stone-800 dark:text-stone-100">{p.name}</span>
                          <span className="text-stone-400 ml-2">{p.dni}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">{p.role?.replace('_', ' ') || '-'}</Badge>
                          {p.role === 'perrero' && p.dog_count > 0 && <Badge className="text-[10px] bg-amber-100 text-amber-700">{p.dog_count} perros</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-stone-400 text-sm text-center py-4">Sin participantes</p>}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Completed Results Display */}
        {activity.results && (
          <Card className="mt-6 border-green-300 dark:border-green-700" data-testid="results-display">
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> {t('act_results_title')}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-700">
                      <th className="text-left p-2">{t('act_results_species')}</th>
                      <th className="text-center p-2" colSpan={5}>{t('act_results_males')}</th>
                      <th className="text-center p-2" colSpan={5}>{t('act_results_females')}</th>
                      <th className="text-center p-2">{t('act_results_trophies')}</th>
                    </tr>
                    <tr className="border-b border-stone-100 dark:border-stone-800 text-stone-400">
                      <td></td>
                      {WEIGHTS.map(w => <td key={`m${w}`} className="text-center p-1 text-[10px]">{w}</td>)}
                      {WEIGHTS.map(w => <td key={`f${w}`} className="text-center p-1 text-[10px]">{w}</td>)}
                      <td></td>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.results.species_results?.map((sr, i) => (
                      <tr key={i} className="border-b border-stone-50 dark:border-stone-800">
                        <td className="p-2 font-medium capitalize">{sr.species}</td>
                        {WEIGHTS.map(w => <td key={`m${w}`} className="text-center p-1">{sr.males?.[w] || 0}</td>)}
                        {WEIGHTS.map(w => <td key={`f${w}`} className="text-center p-1">{sr.females?.[w] || 0}</td>)}
                        <td className="text-center p-1 font-semibold">{sr.trophies || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {activity.results.taxonomic_observations && (
                <div className="mt-4"><Label className="text-xs text-stone-400">{t('act_results_taxo')}</Label><p className="text-sm mt-1">{activity.results.taxonomic_observations}</p></div>
              )}
              {activity.results.incidents && (
                <div className="mt-3"><Label className="text-xs text-stone-400">{t('act_results_incidents')}</Label><p className="text-sm mt-1 text-red-600">{activity.results.incidents}</p></div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Results Form Modal */}
        {showResults && canSubmitResults && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowResults(false)}>
            <Card className="w-full max-w-4xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="results-form">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600" /> {t('act_results_title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Species table */}
                {activity.authorized_species?.map((sp, spIdx) => {
                  const srIdx = results.species_results.findIndex(s => s.species === sp);
                  if (srIdx === -1) return null;
                  return (
                    <div key={sp} className="border border-stone-200 dark:border-stone-700 rounded-lg p-4">
                      <h4 className="font-semibold capitalize text-stone-800 dark:text-stone-100 mb-3">{sp}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-blue-600 mb-2 block">{t('act_results_males')}</Label>
                          <div className="grid grid-cols-5 gap-2">
                            {WEIGHTS.map(w => (
                              <div key={w} className="space-y-1">
                                <Label className="text-[9px] text-stone-400">{w}</Label>
                                <Input type="number" min={0} className="h-7 text-xs text-center" value={results.species_results[srIdx]?.males?.[w] || 0}
                                  onChange={e => updateSpeciesResult(srIdx, 'males', w, e.target.value)} data-testid={`result-${sp}-male-${w}`} />
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-pink-600 mb-2 block">{t('act_results_females')}</Label>
                          <div className="grid grid-cols-5 gap-2">
                            {WEIGHTS.map(w => (
                              <div key={w} className="space-y-1">
                                <Label className="text-[9px] text-stone-400">{w}</Label>
                                <Input type="number" min={0} className="h-7 text-xs text-center" value={results.species_results[srIdx]?.females?.[w] || 0}
                                  onChange={e => updateSpeciesResult(srIdx, 'females', w, e.target.value)} data-testid={`result-${sp}-female-${w}`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <Label className="text-xs">{t('act_results_trophies')}</Label>
                        <Input type="number" min={0} className="h-8 w-24 text-sm mt-1" value={results.species_results[srIdx]?.trophies || 0}
                          onChange={e => updateTrophies(srIdx, e.target.value)} data-testid={`result-${sp}-trophies`} />
                      </div>
                    </div>
                  );
                })}

                <div className="space-y-2">
                  <Label>{t('act_results_taxo')}</Label>
                  <Textarea value={results.taxonomic_observations} onChange={e => setResults(prev => ({ ...prev, taxonomic_observations: e.target.value }))}
                    placeholder="Epizootias, malformaciones, amputaciones, trampeo..." data-testid="taxo-observations" rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>{t('act_results_incidents')}</Label>
                  <Textarea value={results.incidents} onChange={e => setResults(prev => ({ ...prev, incidents: e.target.value }))}
                    placeholder="Accidentes, percances..." data-testid="incidents" rows={3} />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowResults(false)}>{t('cancel')}</Button>
                  <Button onClick={submitResults} disabled={submitting} data-testid="submit-results-btn" className="bg-green-800 hover:bg-green-700 text-white gap-2">
                    <Send className="w-4 h-4" /> {t('act_results_submit')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
