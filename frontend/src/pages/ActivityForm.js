import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { Save, Send, Plus, Trash2, Users, MapPin, Crosshair, ArrowLeft, UserPlus } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SPECIES = ["jabali", "zorro", "muflon", "ciervo", "arrui", "gamo"];
const ROLES = ["batidor", "perrero", "acompanante", "ojeador", "postor", "secretario", "auxiliar", "controlador_acceso", "no_titular_arma", "lleva_dos"];

const DrawControl = ({ onCreated }) => {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) return;
    const items = new L.FeatureGroup();
    map.addLayer(items);
    const ctrl = new L.Control.Draw({
      position: 'topright',
      draw: { polygon: { shapeOptions: { color: '#EF4444', fillOpacity: 0.2, weight: 2 } }, polyline: false, rectangle: { shapeOptions: { color: '#EF4444', fillOpacity: 0.2 } }, circle: false, circlemarker: false, marker: false },
      edit: { featureGroup: items, remove: true }
    });
    map.addControl(ctrl);
    ref.current = ctrl;
    map.on(L.Draw.Event.CREATED, (e) => { items.clearLayers(); items.addLayer(e.layer); onCreated(e.layer.toGeoJSON().geometry); });
    return () => { map.removeControl(ctrl); map.removeLayer(items); ref.current = null; };
  }, [map, onCreated]);
  return null;
};

export default function ActivityForm() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { activityId } = useParams();
  const isEdit = activityId && activityId !== 'new';

  const [form, setForm] = useState({
    activity_type: 'batida', coto_matricula: '', coto_name: '',
    responsible_name: '', responsible_dni: '', responsible_phone: '',
    date: '', partida_paraje: '', termino_municipal: '',
    start_time: '', end_time: '', authorization_type: 'ptoc_comunicacion',
    authorized_species: [], geometry: null, buffer_meters: 200,
    participants: []
  });
  const [saving, setSaving] = useState(false);
  const [regulars, setRegulars] = useState([]);
  const [activity, setActivity] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (isEdit) {
      axios.get(`${API}/activities/${activityId}`, { headers }).then(r => {
        setActivity(r.data);
        const a = r.data;
        setForm({
          activity_type: a.activity_type, coto_matricula: a.coto_matricula || '', coto_name: a.coto_name || '',
          responsible_name: a.responsible_name || '', responsible_dni: a.responsible_dni || '', responsible_phone: a.responsible_phone || '',
          date: a.date || '', partida_paraje: a.partida_paraje || '', termino_municipal: a.termino_municipal || '',
          start_time: a.start_time?.slice(0, 16) || '', end_time: a.end_time?.slice(0, 16) || '',
          authorization_type: a.authorization_type || 'ptoc_comunicacion',
          authorized_species: a.authorized_species || [], geometry: a.geometry, buffer_meters: a.buffer_meters || 200,
          participants: a.participants || []
        });
      }).catch(() => toast.error(t('error')));
    }
    axios.get(`${API}/regular-participants`, { headers }).then(r => setRegulars(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const up = (f, v) => setForm(prev => ({ ...prev, [f]: v }));
  const toggleSpecies = (sp) => {
    setForm(prev => ({
      ...prev,
      authorized_species: prev.authorized_species.includes(sp)
        ? prev.authorized_species.filter(s => s !== sp)
        : [...prev.authorized_species, sp]
    }));
  };

  const addParticipant = () => {
    setForm(prev => ({ ...prev, participants: [...prev.participants, { name: '', dni: '', phone: '', role: '', dog_count: 0, observations: '' }] }));
  };

  const addRegular = (reg) => {
    const exists = form.participants.some(p => p.dni === reg.dni);
    if (exists) { toast.error('Already added'); return; }
    setForm(prev => ({
      ...prev,
      participants: [...prev.participants, { name: reg.name, dni: reg.dni, phone: reg.phone, role: reg.default_role, dog_count: reg.dog_count, observations: '' }]
    }));
  };

  const updateParticipant = (idx, field, value) => {
    setForm(prev => {
      const ps = [...prev.participants];
      ps[idx] = { ...ps[idx], [field]: value };
      return { ...prev, participants: ps };
    });
  };

  const removeParticipant = (idx) => {
    setForm(prev => ({ ...prev, participants: prev.participants.filter((_, i) => i !== idx) }));
  };

  const handleSave = async (submitForApproval = false) => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        start_time: form.start_time ? new Date(form.start_time).toISOString() : '',
        end_time: form.end_time ? new Date(form.end_time).toISOString() : '',
        status: submitForApproval ? 'pending' : 'draft'
      };

      if (isEdit) {
        await axios.put(`${API}/activities/${activityId}`, payload, { headers });
        if (submitForApproval) {
          await axios.put(`${API}/activities/${activityId}/submit`, {}, { headers });
        }
      } else {
        await axios.post(`${API}/activities`, payload, { headers });
      }
      toast.success(t('success'));
      navigate('/society');
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally { setSaving(false); }
  };

  const canEdit = !isEdit || (activity && ['draft', 'rejected'].includes(activity.status));

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
        <Button variant="ghost" onClick={() => navigate('/society')} className="mb-4 gap-2 text-stone-500">
          <ArrowLeft className="w-4 h-4" /> {t('cancel')}
        </Button>

        <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100 mb-6">
          {isEdit ? t('act_edit') : t('act_create')} - {form.activity_type === 'batida' ? t('act_batida') : t('act_gancho')}
        </h1>

        <div className="space-y-6">
          {/* Type & Coto */}
          <Card className="border-stone-200 dark:border-stone-800">
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t('act_type')} & {t('act_coto_name')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('act_type')}</Label>
                  <Select value={form.activity_type} onValueChange={v => up('activity_type', v)} disabled={isEdit}>
                    <SelectTrigger data-testid="activity-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="batida">{t('act_batida')}</SelectItem>
                      <SelectItem value="gancho">{t('act_gancho')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.activity_type === 'gancho' && <p className="text-xs text-amber-600">{t('act_gancho_limit')}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('act_coto_name')} *</Label>
                  <Input data-testid="coto-name" value={form.coto_name} onChange={e => up('coto_name', e.target.value)} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                  <Label>{t('act_coto_matricula')}</Label>
                  <Input data-testid="coto-matricula" value={form.coto_matricula} onChange={e => up('coto_matricula', e.target.value)} disabled={!canEdit} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Responsible */}
          <Card className="border-stone-200 dark:border-stone-800">
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t('act_responsible')}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2"><Label>{t('act_resp_name')} *</Label><Input data-testid="resp-name" value={form.responsible_name} onChange={e => up('responsible_name', e.target.value)} disabled={!canEdit} /></div>
                <div className="space-y-2"><Label>{t('act_resp_dni')} *</Label><Input data-testid="resp-dni" value={form.responsible_dni} onChange={e => up('responsible_dni', e.target.value)} disabled={!canEdit} /></div>
                <div className="space-y-2"><Label>{t('act_resp_phone')} *</Label><Input data-testid="resp-phone" value={form.responsible_phone} onChange={e => up('responsible_phone', e.target.value)} disabled={!canEdit} /></div>
              </div>
            </CardContent>
          </Card>

          {/* Date, Time, Location */}
          <Card className="border-stone-200 dark:border-stone-800">
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t('act_date')} & {t('act_location')}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2"><Label>{t('act_start')} *</Label><Input type="datetime-local" data-testid="start-time" value={form.start_time} onChange={e => up('start_time', e.target.value)} disabled={!canEdit} /></div>
                <div className="space-y-2"><Label>{t('act_end')} *</Label><Input type="datetime-local" data-testid="end-time" value={form.end_time} onChange={e => up('end_time', e.target.value)} disabled={!canEdit} /></div>
                <div className="space-y-2"><Label>{t('act_paraje')}</Label><Input data-testid="paraje" value={form.partida_paraje} onChange={e => up('partida_paraje', e.target.value)} disabled={!canEdit} /></div>
                <div className="space-y-2"><Label>{t('act_municipio')}</Label><Input data-testid="municipio" value={form.termino_municipal} onChange={e => up('termino_municipal', e.target.value)} disabled={!canEdit} /></div>
              </div>
            </CardContent>
          </Card>

          {/* Authorization & Species */}
          <Card className="border-stone-200 dark:border-stone-800">
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t('act_auth_type')} & {t('act_species')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select value={form.authorization_type} onValueChange={v => up('authorization_type', v)} disabled={!canEdit}>
                <SelectTrigger data-testid="auth-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ptoc_comunicacion">{t('act_ptoc')}</SelectItem>
                  <SelectItem value="extraordinaria">{t('act_extra')}</SelectItem>
                </SelectContent>
              </Select>
              <div>
                <Label className="mb-2 block">{t('act_species')}</Label>
                <div className="flex flex-wrap gap-2">
                  {SPECIES.map(sp => (
                    <label key={sp} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                      form.authorized_species.includes(sp) ? 'bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                    }`}>
                      <Checkbox checked={form.authorized_species.includes(sp)} onCheckedChange={() => toggleSpecies(sp)} disabled={!canEdit} data-testid={`species-${sp}`} />
                      <span className="capitalize">{sp}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Participants */}
          <Card className="border-stone-200 dark:border-stone-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> {t('act_participants')} ({form.participants.length})</CardTitle>
                <div className="flex gap-2">
                  {regulars.length > 0 && (
                    <Select onValueChange={v => { const r = regulars.find(x => x.id === v); if (r) addRegular(r); }}>
                      <SelectTrigger className="w-48 h-8 text-xs" data-testid="select-regular"><SelectValue placeholder={t('act_select_regular')} /></SelectTrigger>
                      <SelectContent>
                        {regulars.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.default_role})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {canEdit && <Button variant="outline" size="sm" onClick={addParticipant} data-testid="add-participant-btn" className="gap-1"><UserPlus className="w-3 h-3" /> {t('act_add_participant')}</Button>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {form.participants.length === 0 ? (
                <p className="text-sm text-stone-400 text-center py-4">Sin participantes</p>
              ) : (
                form.participants.map((p, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-stone-100 dark:border-stone-800" data-testid={`participant-${i}`}>
                    <div className="col-span-12 md:col-span-3 space-y-1">
                      <Label className="text-[10px]">{t('act_part_name')}</Label>
                      <Input value={p.name} onChange={e => updateParticipant(i, 'name', e.target.value)} disabled={!canEdit} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-4 md:col-span-2 space-y-1">
                      <Label className="text-[10px]">{t('act_part_dni')}</Label>
                      <Input value={p.dni} onChange={e => updateParticipant(i, 'dni', e.target.value)} disabled={!canEdit} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-4 md:col-span-2 space-y-1">
                      <Label className="text-[10px]">{t('act_part_phone')}</Label>
                      <Input value={p.phone} onChange={e => updateParticipant(i, 'phone', e.target.value)} disabled={!canEdit} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-4 md:col-span-2 space-y-1">
                      <Label className="text-[10px]">{t('act_part_role')}</Label>
                      <Select value={p.role} onValueChange={v => updateParticipant(i, 'role', v)} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Rol" /></SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="text-xs capitalize">{r.replace('_', ' ')}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {p.role === 'perrero' && (
                      <div className="col-span-3 md:col-span-1 space-y-1">
                        <Label className="text-[10px]">{t('act_part_dogs')}</Label>
                        <Input type="number" value={p.dog_count || 0} onChange={e => updateParticipant(i, 'dog_count', parseInt(e.target.value) || 0)} disabled={!canEdit} className="h-8 text-xs" min={0} />
                      </div>
                    )}
                    <div className={`${p.role === 'perrero' ? 'col-span-8 md:col-span-1' : 'col-span-11 md:col-span-2'} space-y-1`}>
                      <Label className="text-[10px]">{t('act_part_observations')}</Label>
                      <Input value={p.observations || ''} onChange={e => updateParticipant(i, 'observations', e.target.value)} disabled={!canEdit} className="h-8 text-xs" />
                    </div>
                    {canEdit && (
                      <div className="col-span-1 flex items-end">
                        <Button variant="ghost" size="sm" onClick={() => removeParticipant(i)} className="h-8 w-8 p-0 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Map */}
          <Card className="border-stone-200 dark:border-stone-800">
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Crosshair className="w-4 h-4" /> {t('act_draw_zone')}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-stone-400 mb-2">{t('act_draw_hint')}</p>
              <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 h-[350px]" data-testid="activity-draw-map">
                <MapContainer center={[39.5, -0.5]} zoom={8} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {canEdit && <DrawControl onCreated={g => up('geometry', g)} />}
                  {form.geometry?.coordinates?.[0] && (
                    <Polygon positions={form.geometry.coordinates[0].map(c => [c[1], c[0]])} pathOptions={{ color: '#EF4444', fillOpacity: 0.2 }} />
                  )}
                </MapContainer>
              </div>
              {form.geometry && <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><MapPin className="w-3 h-3" /> Zona dibujada</p>}
            </CardContent>
          </Card>

          {/* Actions */}
          {canEdit && (
            <div className="flex justify-end gap-3 pb-8">
              <Button variant="outline" onClick={() => navigate('/society')}>{t('cancel')}</Button>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} data-testid="save-draft-btn" className="gap-2">
                <Save className="w-4 h-4" /> {t('act_save_draft')}
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving} data-testid="submit-btn" className="bg-green-800 hover:bg-green-700 text-white gap-2">
                <Send className="w-4 h-4" /> {t('act_submit')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
