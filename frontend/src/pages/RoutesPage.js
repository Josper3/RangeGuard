import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
import {
  Upload, Trash2, Route, CheckCircle, AlertTriangle, Download,
  FileText, Clock, Shield, XCircle, Loader2, Calendar
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Polygon, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FitRoute = ({ geometry }) => {
  const map = useMap();
  useEffect(() => {
    if (geometry?.coordinates?.length > 0) {
      const bounds = geometry.coordinates.map(c => [c[1], c[0]]);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [geometry, map]);
  return null;
};

export default function RoutesPage() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [checkTime, setCheckTime] = useState('');
  const [routeName, setRouteName] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/routes`, { headers });
      setRoutes(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchRoutes();
  }, [fetchRoutes, token]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', routeName || file.name);

    setUploading(true);
    try {
      const res = await axios.post(`${API}/routes/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });
      toast.success(t('success'));
      setRouteName('');
      fetchRoutes();
      setSelectedRoute(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  const handleCheck = async (route) => {
    setChecking(true);
    setCheckResult(null);
    try {
      const payload = {
        route_id: route.id,
        check_time: checkTime ? new Date(checkTime).toISOString() : undefined
      };
      const res = await axios.post(`${API}/check-intersection`, payload);
      setCheckResult(res.data);
      setSelectedRoute(route);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadPdf = async (route) => {
    setDownloadingPdf(true);
    try {
      const payload = {
        route_id: route.id,
        check_time: checkTime ? new Date(checkTime).toISOString() : undefined
      };
      const res = await axios.post(`${API}/reports/pdf`, payload, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `rangeguard_report.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Error generating PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDelete = async (routeId) => {
    try {
      await axios.delete(`${API}/routes/${routeId}`, { headers });
      toast.success(t('success'));
      if (selectedRoute?.id === routeId) {
        setSelectedRoute(null);
        setCheckResult(null);
      }
      fetchRoutes();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100 flex items-center gap-2 mb-2">
          <Route className="w-6 h-6 text-blue-600" />
          {t('routes_title')}
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-8">{t('routes_upload_hint')}</p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Upload and list */}
          <div className="lg:col-span-4 space-y-4">
            {/* Upload */}
            <Card className="border-stone-200 dark:border-stone-800" data-testid="route-upload-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4" /> {t('routes_upload')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>{t('routes_name')}</Label>
                  <Input
                    data-testid="route-name-input"
                    value={routeName}
                    onChange={e => setRouteName(e.target.value)}
                    placeholder="Mi ruta por la sierra..."
                  />
                </div>
                <div>
                  <Label htmlFor="gpx-upload" className="block mb-2">GPX File</Label>
                  <label
                    htmlFor="gpx-upload"
                    className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors"
                    data-testid="route-upload-area"
                  >
                    {uploading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                    ) : (
                      <Upload className="w-5 h-5 text-stone-400" />
                    )}
                    <span className="text-sm text-stone-500">
                      {uploading ? t('loading') : 'Click to upload .gpx file'}
                    </span>
                  </label>
                  <input
                    id="gpx-upload"
                    type="file"
                    accept=".gpx"
                    onChange={handleUpload}
                    className="hidden"
                    disabled={uploading}
                    data-testid="route-file-input"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Check Time */}
            <Card className="border-stone-200 dark:border-stone-800" data-testid="check-time-card">
              <CardContent className="pt-4 space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> {t('map_filter_date')}
                </Label>
                <Input
                  type="datetime-local"
                  data-testid="check-time-input"
                  value={checkTime}
                  onChange={e => setCheckTime(e.target.value)}
                />
                <p className="text-xs text-stone-400">Leave empty to check current time</p>
              </CardContent>
            </Card>

            {/* Route List */}
            <Card className="border-stone-200 dark:border-stone-800" data-testid="route-list-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" /> {t('routes_title')} ({routes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                {routes.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-4">{t('routes_no_routes')}</p>
                ) : (
                  routes.map(route => (
                    <div
                      key={route.id}
                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedRoute?.id === route.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-stone-100 dark:border-stone-800 hover:border-stone-300'
                      }`}
                      onClick={() => { setSelectedRoute(route); setCheckResult(null); }}
                      data-testid={`route-item-${route.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-medium text-sm text-stone-800 dark:text-stone-100">{route.name}</span>
                          <div className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(route.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`check-route-${route.id}`}
                            onClick={(e) => { e.stopPropagation(); handleCheck(route); }}
                            disabled={checking}
                            className="h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-50"
                          >
                            {checking && selectedRoute?.id === route.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Shield className="w-3 h-3" />
                            )}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`delete-route-${route.id}`}
                                className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={e => e.stopPropagation()}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('delete')}</AlertDialogTitle>
                                <AlertDialogDescription>{t('admin_confirm_delete')}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(route.id)} className="bg-red-600">{t('delete')}</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Map and Results */}
          <div className="lg:col-span-8 space-y-4">
            {/* Map */}
            <div className="rounded-xl overflow-hidden shadow-inner border border-stone-200 dark:border-stone-700 h-[400px] md:h-[450px]" data-testid="route-map">
              <MapContainer
                center={[40.4168, -3.7038]}
                zoom={6}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {selectedRoute?.geometry && (
                  <>
                    <FitRoute geometry={selectedRoute.geometry} />
                    <Polyline
                      positions={selectedRoute.geometry.coordinates.map(c => [c[1], c[0]])}
                      pathOptions={{ color: '#3B82F6', weight: 4 }}
                    />
                  </>
                )}
                {checkResult?.zones?.map((zone, i) => (
                  <Polygon
                    key={i}
                    positions={[]}
                    pathOptions={{ color: '#EF4444', fillOpacity: 0.2 }}
                  />
                ))}
              </MapContainer>
            </div>

            {/* Intersection Results */}
            {checkResult && (
              <Card
                className={`border-2 ${checkResult.intersects
                  ? 'border-red-400 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                  : 'border-green-400 bg-green-50 dark:bg-green-900/10 dark:border-green-800'
                }`}
                data-testid="intersection-result"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      checkResult.intersects ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'
                    }`}>
                      {checkResult.intersects ? (
                        <AlertTriangle className="w-6 h-6 text-red-600" />
                      ) : (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className={`text-lg font-bold font-[Manrope] ${
                        checkResult.intersects ? 'text-red-800 dark:text-red-300' : 'text-green-800 dark:text-green-300'
                      }`}>
                        {checkResult.intersects ? t('result_danger') : t('result_safe')}
                      </h3>
                      <p className="text-sm mt-1 text-stone-600 dark:text-stone-400">
                        {checkResult.intersects ? t('result_danger_desc') : t('result_safe_desc')}
                      </p>

                      {checkResult.zones?.length > 0 && (
                        <div className="mt-4 space-y-3">
                          {checkResult.zones.map((zone, i) => (
                            <div key={i} className="p-3 rounded-lg bg-white dark:bg-stone-900 border border-red-200 dark:border-red-800" data-testid={`result-zone-${i}`}>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm text-stone-800 dark:text-stone-100">{zone.zone_name}</span>
                                <Badge variant="destructive">{zone.overlap_percentage}% overlap</Badge>
                              </div>
                              <div className="text-xs text-stone-500 mt-1 space-y-0.5">
                                <div>{t('result_association')}: {zone.association}</div>
                                <div>{t('result_period')}: {new Date(zone.start_time).toLocaleString()} - {new Date(zone.end_time).toLocaleString()}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex gap-3">
                        <Button
                          data-testid="download-pdf-btn"
                          onClick={() => selectedRoute && handleDownloadPdf(selectedRoute)}
                          disabled={downloadingPdf}
                          variant="outline"
                          className="gap-2"
                        >
                          {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          {t('result_download_pdf')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
