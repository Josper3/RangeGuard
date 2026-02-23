import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  Compass, Heart, Search, MapPin, Clock, User, Route,
  Star, Loader2, ChevronRight, Eye, Shield
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Polygon, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FitRoute = ({ geometry }) => {
  const map = useMap();
  useEffect(() => {
    if (geometry?.coordinates?.length > 1) {
      const bounds = geometry.coordinates.map(c => [c[1], c[0]]);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [geometry, map]);
  return null;
};

export default function ExplorePage() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const [tab, setTab] = useState('explore');
  const [publicRoutes, setPublicRoutes] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [activeZones, setActiveZones] = useState([]);
  const [togglingFav, setTogglingFav] = useState(null);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchPublicRoutes = useCallback(async () => {
    try {
      const params = search ? { search } : {};
      const res = await axios.get(`${API}/routes/public`, { params });
      setPublicRoutes(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchFavorites = useCallback(async () => {
    if (!token) return;
    try {
      const [favsRes, idsRes] = await Promise.all([
        axios.get(`${API}/favorites`, { headers }),
        axios.get(`${API}/favorites/ids`, { headers })
      ]);
      setFavorites(favsRes.data);
      setFavoriteIds(new Set(idsRes.data));
    } catch (err) {
      console.error(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchZones = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/zones`, { params: { active: true } });
      setActiveZones(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchPublicRoutes(); }, [fetchPublicRoutes]);
  useEffect(() => { fetchFavorites(); }, [fetchFavorites]);
  useEffect(() => { fetchZones(); }, [fetchZones]);

  const toggleFavorite = async (routeId) => {
    if (!token) {
      toast.error('Please sign in to add favorites');
      return;
    }
    setTogglingFav(routeId);
    try {
      if (favoriteIds.has(routeId)) {
        await axios.delete(`${API}/favorites/${routeId}`, { headers });
        setFavoriteIds(prev => { const n = new Set(prev); n.delete(routeId); return n; });
        setFavorites(prev => prev.filter(f => f.route_id !== routeId));
        toast.success(t('route_remove_fav'));
      } else {
        await axios.post(`${API}/favorites/${routeId}`, {}, { headers });
        setFavoriteIds(prev => new Set(prev).add(routeId));
        fetchFavorites();
        toast.success(t('route_fav_added'));
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'));
    } finally {
      setTogglingFav(null);
    }
  };

  const routeList = tab === 'favorites' ? favorites.map(f => ({
    id: f.route_id,
    name: f.route_name,
    owner_name: f.owner_name,
    geometry: f.geometry,
    is_own: f.is_own,
    created_at: f.route_created_at
  })) : publicRoutes;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold font-[Manrope] text-stone-800 dark:text-stone-100 flex items-center gap-2">
            <Compass className="w-6 h-6 text-blue-600" />
            {tab === 'favorites' ? t('favorites_title') : t('explore_title')}
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            {t('explore_subtitle')}
          </p>
        </div>

        {/* Tabs & Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="explore" data-testid="explore-tab" className="gap-2">
                <Compass className="w-4 h-4" /> {t('explore_title')}
              </TabsTrigger>
              <TabsTrigger value="favorites" data-testid="favorites-tab" className="gap-2">
                <Heart className="w-4 h-4" /> {t('favorites_title')}
                {favorites.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{favorites.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === 'explore' && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input
                data-testid="explore-search"
                placeholder={t('explore_search')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Route List */}
          <div className="lg:col-span-5 space-y-3 max-h-[650px] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400 mx-auto" />
              </div>
            ) : routeList.length === 0 ? (
              <Card className="border-stone-200 dark:border-stone-800">
                <CardContent className="py-12 text-center">
                  <Route className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                  <p className="text-sm text-stone-500">
                    {tab === 'favorites' ? t('favorites_empty') : t('explore_no_results')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              routeList.map(route => {
                const isFav = favoriteIds.has(route.id);
                const isSelected = selectedRoute?.id === route.id;
                return (
                  <Card
                    key={route.id}
                    className={`border cursor-pointer transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-md'
                        : 'border-stone-200 dark:border-stone-800'
                    }`}
                    onClick={() => setSelectedRoute(route)}
                    data-testid={`explore-route-${route.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-stone-800 dark:text-stone-100 truncate">
                            {route.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-[11px] text-stone-400 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {route.owner_name || t('explore_by') + ' Unknown'}
                            </span>
                            {route.point_count && (
                              <span className="text-[11px] text-stone-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {route.point_count} {t('explore_points')}
                              </span>
                            )}
                            <span className="text-[11px] text-stone-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(route.created_at).toLocaleDateString()}
                            </span>
                            {route.is_own && (
                              <Badge variant="outline" className="text-[10px]">You</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {user && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-8 w-8 p-0 ${isFav ? 'text-red-500 hover:text-red-600' : 'text-stone-400 hover:text-red-500'}`}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(route.id); }}
                              disabled={togglingFav === route.id}
                              data-testid={`fav-btn-${route.id}`}
                            >
                              {togglingFav === route.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Map */}
          <div className="lg:col-span-7 space-y-3">
            <div className="rounded-xl overflow-hidden shadow-inner border border-stone-200 dark:border-stone-700 h-[450px] md:h-[520px]" data-testid="explore-map">
              <MapContainer
                center={[40.4168, -3.7038]}
                zoom={6}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {selectedRoute?.geometry && <FitRoute geometry={selectedRoute.geometry} />}

                {/* Active hunting zones */}
                {activeZones.map(zone => {
                  const coords = zone.geometry?.coordinates?.[0]?.map(c => [c[1], c[0]]) || [];
                  const bufferCoords = zone.buffered_geometry?.coordinates?.[0]?.map(c => [c[1], c[0]]) || [];
                  if (coords.length === 0) return null;
                  return (
                    <div key={zone.id}>
                      {bufferCoords.length > 0 && (
                        <Polygon
                          positions={bufferCoords}
                          pathOptions={{ color: '#F59E0B', fillColor: '#FBBF24', fillOpacity: 0.08, weight: 1, dashArray: '6 4' }}
                        />
                      )}
                      <Polygon
                        positions={coords}
                        pathOptions={{ color: '#EF4444', fillColor: '#EF4444', fillOpacity: 0.18, weight: 2 }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <strong>{zone.name}</strong>
                            <div className="text-xs text-gray-500 mt-1">{zone.association_name}</div>
                            <div className="text-xs text-gray-500">
                              {new Date(zone.start_time).toLocaleString()} - {new Date(zone.end_time).toLocaleString()}
                            </div>
                          </div>
                        </Popup>
                      </Polygon>
                    </div>
                  );
                })}

                {/* Selected route */}
                {selectedRoute?.geometry && (
                  <Polyline
                    positions={selectedRoute.geometry.coordinates.map(c => [c[1], c[0]])}
                    pathOptions={{ color: '#3B82F6', weight: 4, opacity: 0.9 }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>{selectedRoute.name}</strong>
                        <div className="text-xs text-gray-500">{selectedRoute.owner_name}</div>
                      </div>
                    </Popup>
                  </Polyline>
                )}
              </MapContainer>
            </div>

            {/* Selected route detail */}
            {selectedRoute && (
              <Card className="border-stone-200 dark:border-stone-800" data-testid="selected-route-detail">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-stone-800 dark:text-stone-100">{selectedRoute.name}</h3>
                      <span className="text-xs text-stone-400">
                        {t('explore_by')} {selectedRoute.owner_name} &bull; {new Date(selectedRoute.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {user && (
                        <Button
                          size="sm"
                          variant={favoriteIds.has(selectedRoute.id) ? "default" : "outline"}
                          className={favoriteIds.has(selectedRoute.id) ? "bg-red-500 hover:bg-red-600 text-white gap-2" : "gap-2"}
                          onClick={() => toggleFavorite(selectedRoute.id)}
                          disabled={togglingFav === selectedRoute.id}
                          data-testid="detail-fav-btn"
                        >
                          <Heart className={`w-4 h-4 ${favoriteIds.has(selectedRoute.id) ? 'fill-current' : ''}`} />
                          {favoriteIds.has(selectedRoute.id) ? t('route_remove_fav') : t('route_add_fav')}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Zone indicator */}
            {activeZones.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-stone-500" data-testid="explore-zone-indicator">
                <div className="w-3 h-3 rounded bg-red-500/30 border border-red-500" />
                {activeZones.length} {t('map_active_zones').toLowerCase()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
