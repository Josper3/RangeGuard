import { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, MapPin, Calendar, Shield, Crosshair } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Drawing component
const DrawControl = ({ onCreated }) => {
  const map = useMap();
  const drawControlRef = useRef(null);

  useEffect(() => {
    if (drawControlRef.current) return;

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          drawError: { color: '#e1e100', message: 'Error!' },
          shapeOptions: { color: '#EF4444', fillColor: '#EF4444', fillOpacity: 0.2, weight: 2 }
        },
        polyline: false,
        rectangle: {
          shapeOptions: { color: '#EF4444', fillColor: '#EF4444', fillOpacity: 0.2, weight: 2 }
        },
        circle: false,
        circlemarker: false,
        marker: false
      },
      edit: { featureGroup: drawnItems, remove: true }
    });

    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      const geojson = e.layer.toGeoJSON();
      onCreated(geojson.geometry);
    });

    return () => {
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
      drawControlRef.current = null;
    };
  }, [map, onCreated]);

  return null;
};

export default function AdminPage() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const [zones, setZones] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', start_time: '', end_time: '', buffer_meters: 200, geometry: null
  });
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchZones = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/zones/my/list`, { headers });
      setZones(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const handleDrawCreated = useCallback((geometry) => {
    setForm(prev => ({ ...prev, geometry }));
  }, []);

  const handleSave = async () => {
    if (!form.geometry) {
      toast.error(t('admin_draw_hint'));
      return;
    }
    if (!form.name || !form.start_time || !form.end_time) {
      toast.error('Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        geometry: form.geometry,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        buffer_meters: parseInt(form.buffer_meters) || 200
      };

      if (editingZone) {
        await axios.put(`${API}/zones/${editingZone.id}`, payload, { headers });
        toast.success(t('success'));
      } else {
        await axios.post(`${API}/zones`, payload, { headers });
        toast.success(t('success'));
      }

      setCreating(false);
      setEditingZone(null);
      setForm({ name: '', description: '', start_time: '', end_time: '', buffer_meters: 200, geometry: null });
      fetchZones();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (zoneId) => {
    try {
      await axios.delete(`${API}/zones/${zoneId}`, { headers });
      toast.success(t('success'));
      fetchZones();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    }
  };

  const startEdit = (zone) => {
    setEditingZone(zone);
    setForm({
      name: zone.name,
      description: zone.description || '',
      start_time: zone.start_time?.slice(0, 16) || '',
      end_time: zone.end_time?.slice(0, 16) || '',
      buffer_meters: zone.buffer_meters || 200,
      geometry: zone.geometry
    });
    setCreating(true);
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100 flex items-center gap-2">
              <Shield className="w-6 h-6 text-green-700" />
              {t('admin_title')}
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
              {user?.organization_name || user?.name}
            </p>
          </div>
          {!creating && (
            <Button
              data-testid="create-zone-btn"
              onClick={() => { setCreating(true); setEditingZone(null); setForm({ name: '', description: '', start_time: '', end_time: '', buffer_meters: 200, geometry: null }); }}
              className="bg-green-800 hover:bg-green-700 text-white gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('admin_create')}
            </Button>
          )}
        </div>

        {/* Create/Edit Form */}
        {creating && (
          <Card className="mb-8 border-stone-200 dark:border-stone-800 shadow-lg" data-testid="zone-form">
            <CardHeader>
              <CardTitle className="font-[Manrope]">
                {editingZone ? t('admin_edit') : t('admin_create')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Form fields */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('admin_zone_name')} *</Label>
                    <Input
                      data-testid="zone-name-input"
                      value={form.name}
                      onChange={e => update('name', e.target.value)}
                      placeholder="Coto de caza Sierra Norte"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin_zone_desc')}</Label>
                    <Textarea
                      data-testid="zone-desc-input"
                      value={form.description}
                      onChange={e => update('description', e.target.value)}
                      placeholder="Descripcion de la zona..."
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('admin_start')} *</Label>
                      <Input
                        type="datetime-local"
                        data-testid="zone-start-input"
                        value={form.start_time}
                        onChange={e => update('start_time', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('admin_end')} *</Label>
                      <Input
                        type="datetime-local"
                        data-testid="zone-end-input"
                        value={form.end_time}
                        onChange={e => update('end_time', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin_buffer')}</Label>
                    <Input
                      type="number"
                      data-testid="zone-buffer-input"
                      value={form.buffer_meters}
                      onChange={e => update('buffer_meters', e.target.value)}
                      min={0}
                      max={1000}
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button
                      data-testid="zone-save-btn"
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-green-800 hover:bg-green-700 text-white"
                    >
                      {saving ? t('loading') : t('admin_save')}
                    </Button>
                    <Button
                      variant="outline"
                      data-testid="zone-cancel-btn"
                      onClick={() => { setCreating(false); setEditingZone(null); }}
                    >
                      {t('admin_cancel')}
                    </Button>
                  </div>
                </div>

                {/* Map for drawing */}
                <div>
                  <Label className="mb-2 block">
                    <Crosshair className="w-4 h-4 inline mr-1" />
                    {t('admin_draw_hint')}
                  </Label>
                  <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 h-[350px]" data-testid="admin-draw-map">
                    <MapContainer
                      center={[40.4168, -3.7038]}
                      zoom={6}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <DrawControl onCreated={handleDrawCreated} />
                      {form.geometry && form.geometry.coordinates?.[0] && (
                        <Polygon
                          positions={form.geometry.coordinates[0].map(c => [c[1], c[0]])}
                          pathOptions={{ color: '#EF4444', fillColor: '#EF4444', fillOpacity: 0.2 }}
                        />
                      )}
                    </MapContainer>
                  </div>
                  {form.geometry && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Polygon drawn successfully
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Zone List */}
        <div>
          <h2 className="text-lg font-semibold font-[Manrope] text-stone-800 dark:text-stone-100 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-500" />
            {t('admin_my_zones')} ({zones.length})
          </h2>
          {zones.length === 0 ? (
            <Card className="border-stone-200 dark:border-stone-800">
              <CardContent className="py-12 text-center">
                <MapPin className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                <p className="text-stone-500">{t('map_no_zones')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {zones.map(zone => (
                <Card key={zone.id} className="border-stone-200 dark:border-stone-800 hover:shadow-md transition-shadow" data-testid={`admin-zone-${zone.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-stone-800 dark:text-stone-100">{zone.name}</h3>
                        {zone.description && (
                          <p className="text-xs text-stone-500 mt-1 line-clamp-2">{zone.description}</p>
                        )}
                      </div>
                      <Badge variant={new Date(zone.end_time) > new Date() ? "destructive" : "outline"} className="text-[10px] shrink-0">
                        {new Date(zone.end_time) > new Date() ? 'Active' : 'Expired'}
                      </Badge>
                    </div>
                    <div className="text-xs text-stone-500 space-y-1 mb-4">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(zone.start_time).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(zone.end_time).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`edit-zone-${zone.id}`}
                        onClick={() => startEdit(zone)}
                        className="gap-1 flex-1"
                      >
                        <Edit className="w-3 h-3" /> {t('admin_edit')}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" data-testid={`delete-zone-${zone.id}`} className="gap-1 text-red-600 border-red-200 hover:bg-red-50">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('admin_delete')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('admin_confirm_delete')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(zone.id)}
                              className="bg-red-600 hover:bg-red-700"
                              data-testid={`confirm-delete-${zone.id}`}
                            >
                              {t('delete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
