import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('rangeguard_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          setUser(res.data);
          setLoading(false);
        })
        .catch(() => {
          localStorage.removeItem('rangeguard_token');
          setToken(null);
          setUser(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('rangeguard_token', newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  }, []);

  const register = useCallback(async (data) => {
    const res = await axios.post(`${API}/auth/register`, data);
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('rangeguard_token', newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('rangeguard_token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
