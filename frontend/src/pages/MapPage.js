import { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { MapPin, Calendar, Clock, AlertTriangle, CheckCircle, Filter, Layers } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const FitBounds = ({ zones }) => {
  const map = useMap();
  useEffect(() => {
    if (zones.length > 0) {
      const allCoords = [];
      zones.forEach(z => {
        const coords = z.geometry?.coordinates?.[0] || [];
        coords.forEach(c => allCoords.push([c[1], c[0]]));
      });
      if (allCoords.length > 0) {
        map.fitBounds(allCoords, { padding: [50, 50] });
      }
    }
  }, [zones, map]);
  return null;
};

const isZoneActive = (zone) => {
  const now = new Date().toISOString();
  return zone.start_time <= now && zone.end_time >= now;
};

export default function MapPage() {
  const { t } = useLanguage();
  const [zones, setZones] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchZones = useCallback(async () => {
    try {
      const params = {};
      if (filterDate) {
        params.date = new Date(filterDate).toISOString();
      } else {
        params.active = true;
      }
      const res = await axios.get(`${API}/zones`, { params });
      setZones(res.data);
    } catch (err) {
      console.error('Error fetching zones:', err);
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const getZoneColor = (zone) => {
    if (isZoneActive(zone)) return { fill: '#EF4444', stroke: '#DC2626', fillOpacity: 0.25 };
    return { fill: '#F97316', stroke: '#EA580C', fillOpacity: 0.15 };
  };

  const getBufferColor = () => ({ fill: '#FBBF24', stroke: '#F59E0B', fillOpacity: 0.1 });

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Header */}
      <div className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100">{t('map_title')}</h1>
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                {zones.length} {t('map_active_zones').toLowerCase()}
              </p>
            </div>
            <Button
              variant="outline"
              data-testid="map-filter-toggle"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              {t('map_filter_date')}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 flex flex-wrap items-center gap-4 pb-2" data-testid="map-filters">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-stone-400" />
                <Input
                  type="datetime-local"
                  data-testid="map-date-filter"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="w-auto"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                data-testid="map-clear-filter"
                onClick={() => setFilterDate('')}
              >
                {t('cancel')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Map and Sidebar */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Map */}
          <div className="md:col-span-8">
            <div className="rounded-xl overflow-hidden shadow-inner border border-stone-200 dark:border-stone-700 h-[500px] md:h-[600px]" data-testid="map-container">
              <MapContainer
                center={[40.4168, -3.7038]}
                zoom={6}
                style={{ height: '100%', width: '100%' }}
                className="z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds zones={zones} />

                {zones.map(zone => {
                  const colors = getZoneColor(zone);
                  const bufferColors = getBufferColor();
                  const coords = zone.geometry?.coordinates?.[0]?.map(c => [c[1], c[0]]) || [];
                  const bufferCoords = zone.buffered_geometry?.coordinates?.[0]?.map(c => [c[1], c[0]]) || [];

                  return (
                    <div key={zone.id}>
                      {/* Buffer zone */}
                      {bufferCoords.length > 0 && (
                        <Polygon
                          positions={bufferCoords}
                          pathOptions={{
                            color: bufferColors.stroke,
                            fillColor: bufferColors.fill,
                            fillOpacity: bufferColors.fillOpacity,
                            weight: 1,
                            dashArray: '5 5'
                          }}
                        />
                      )}
                      {/* Main zone */}
                      {coords.length > 0 && (
                        <Polygon
                          positions={coords}
                          pathOptions={{
                            color: colors.stroke,
                            fillColor: colors.fill,
                            fillOpacity: colors.fillOpacity,
                            weight: 2
                          }}
                        >
                          <Popup>
                            <div className="text-sm space-y-1 min-w-[200px]">
                              <div className="font-bold text-base">{zone.name}</div>
                              {zone.description && <p className="text-gray-600">{zone.description}</p>}
                              <div className="flex items-center gap-1 text-gray-500">
                                <Calendar className="w-3 h-3" />
                                {new Date(zone.start_time).toLocaleDateString()} - {new Date(zone.end_time).toLocaleDateString()}
                              </div>
                              <div className="flex items-center gap-1 text-gray-500">
                                <Clock className="w-3 h-3" />
                                {new Date(zone.start_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} - {new Date(zone.end_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                              </div>
                              <div className="text-xs text-gray-400">{zone.association_name}</div>
                              <div className="text-xs text-amber-600">{t('map_buffer_zone')}: {zone.buffer_meters}m</div>
                            </div>
                          </Popup>
                        </Polygon>
                      )}
                    </div>
                  );
                })}
              </MapContainer>
            </div>
          </div>

          {/* Sidebar */}
          <div className="md:col-span-4 space-y-4">
            {/* Legend */}
            <Card className="border-stone-200 dark:border-stone-800" data-testid="map-legend">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4" /> {t('map_legend')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-red-500/30 border-2 border-red-600" />
                  <span className="text-sm text-stone-600 dark:text-stone-300">{t('map_hunting_zone')} ({t('map_zone_active')})</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-orange-400/20 border-2 border-orange-500" />
                  <span className="text-sm text-stone-600 dark:text-stone-300">{t('map_hunting_zone')} ({t('map_zone_scheduled')})</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-yellow-400/15 border-2 border-yellow-500 border-dashed" />
                  <span className="text-sm text-stone-600 dark:text-stone-300">{t('map_buffer_zone')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-3 bg-blue-500 rounded-sm" />
                  <span className="text-sm text-stone-600 dark:text-stone-300">{t('map_route')}</span>
                </div>
              </CardContent>
            </Card>

            {/* Zone List */}
            <Card className="border-stone-200 dark:border-stone-800" data-testid="zone-list-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" /> {t('map_active_zones')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 max-h-[400px] overflow-y-auto">
                {loading ? (
                  <p className="text-sm text-stone-400">{t('loading')}</p>
                ) : zones.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-stone-500">{t('map_no_zones')}</p>
                  </div>
                ) : (
                  zones.map(zone => (
                    <div
                      key={zone.id}
                      className="p-3 rounded-lg border border-stone-100 dark:border-stone-800 hover:border-red-200 dark:hover:border-red-800 transition-colors"
                      data-testid={`zone-item-${zone.id}`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="font-medium text-sm text-stone-800 dark:text-stone-100">{zone.name}</span>
                        <Badge variant={isZoneActive(zone) ? "destructive" : "outline"} className="text-[10px]">
                          {isZoneActive(zone) ? t('map_zone_active') : t('map_zone_scheduled')}
                        </Badge>
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {zone.association_name}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(zone.start_time).toLocaleString()} - {new Date(zone.end_time).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
