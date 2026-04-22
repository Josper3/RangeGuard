import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Users, Plus, Trash2, Edit2, Save, X, Loader2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ROLES = ["batidor", "perrero", "acompanante", "ojeador", "postor", "secretario", "auxiliar", "controlador_acceso", "no_titular_arma", "lleva_dos"];

export default function RegularParticipantsPage() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', dni: '', phone: '', default_role: '', dog_count: 0 });
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/regular-participants`, { headers: { Authorization: `Bearer ${token}` } });
      setParticipants(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchParticipants(); }, [fetchParticipants]);

  const resetForm = () => { setForm({ name: '', dni: '', phone: '', default_role: '', dog_count: 0 }); setEditingId(null); setShowAdd(false); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await axios.put(`${API}/regular-participants/${editingId}`, form, { headers });
      } else {
        await axios.post(`${API}/regular-participants`, form, { headers });
      }
      toast.success(t('success'));
      resetForm();
      fetchParticipants();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally { setSaving(false); }
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setForm({ name: p.name, dni: p.dni || '', phone: p.phone || '', default_role: p.default_role || '', dog_count: p.dog_count || 0 });
    setShowAdd(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/regular-participants/${id}`, { headers });
      toast.success(t('success'));
      fetchParticipants();
    } catch (err) { toast.error(t('error')); }
  };

  const up = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
        <Button variant="ghost" onClick={() => navigate('/society')} className="mb-4 gap-2 text-stone-500" data-testid="back-to-society">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Button>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-green-700" /> {t('act_regular_participants')}
          </h1>
          {!showAdd && (
            <Button onClick={() => { resetForm(); setShowAdd(true); }} data-testid="add-regular-btn" className="bg-green-800 hover:bg-green-700 text-white gap-2">
              <Plus className="w-4 h-4" /> {t('act_add_regular')}
            </Button>
          )}
        </div>

        {/* Add/Edit Form */}
        {showAdd && (
          <Card className="mb-6 border-green-200 dark:border-green-800" data-testid="regular-form">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{editingId ? 'Editar participante' : t('act_add_regular')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('act_part_name')} *</Label>
                  <Input data-testid="regular-name" value={form.name} onChange={e => up('name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('act_part_dni')}</Label>
                  <Input data-testid="regular-dni" value={form.dni} onChange={e => up('dni', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('act_part_phone')}</Label>
                  <Input data-testid="regular-phone" value={form.phone} onChange={e => up('phone', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('act_part_role')}</Label>
                  <Select value={form.default_role} onValueChange={v => up('default_role', v)}>
                    <SelectTrigger data-testid="regular-role"><SelectValue placeholder="Seleccionar rol" /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.default_role === 'perrero' && (
                <div className="space-y-2 w-32">
                  <Label>{t('act_part_dogs')}</Label>
                  <Input type="number" data-testid="regular-dogs" value={form.dog_count} onChange={e => up('dog_count', parseInt(e.target.value) || 0)} min={0} />
                </div>
              )}
              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={saving} data-testid="save-regular-btn" className="bg-green-800 hover:bg-green-700 text-white gap-2">
                  <Save className="w-4 h-4" /> {saving ? t('loading') : t('save')}
                </Button>
                <Button variant="outline" onClick={resetForm} className="gap-2">
                  <X className="w-4 h-4" /> {t('cancel')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-stone-400" /></div>
        ) : participants.length === 0 ? (
          <Card className="border-stone-200 dark:border-stone-800">
            <CardContent className="py-12 text-center">
              <Users className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500">No hay participantes habituales registrados.</p>
              <p className="text-xs text-stone-400 mt-1">Anade participantes frecuentes para seleccionarlos rapidamente al crear actividades.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {participants.map(p => (
              <Card key={p.id} className="border-stone-200 dark:border-stone-800" data-testid={`regular-${p.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-stone-800 dark:text-stone-100">{p.name}</span>
                        {p.default_role && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 capitalize">
                            {p.default_role.replace('_', ' ')}
                          </span>
                        )}
                        {p.dog_count > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{p.dog_count} perros</span>
                        )}
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        DNI: {p.dni || '-'} | Tel: {p.phone || '-'}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(p)} data-testid={`edit-regular-${p.id}`} className="h-8 w-8 p-0 text-stone-500">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} data-testid={`delete-regular-${p.id}`} className="h-8 w-8 p-0 text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
