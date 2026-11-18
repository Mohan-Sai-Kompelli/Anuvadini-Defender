import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  X, Search, Building2, Users, UserCheck, UserX, Percent, Calendar, 
  SlidersHorizontal, Activity, ExternalLink, Plus, Edit,
  Trash2, MapPin, Star, StarOff, Compass, Mail, Target,
  ChevronDown
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { EmptyState, SkeletonTable, StatCard } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { organizationAPI } from '../../services/api';

const PARTICLES = Array.from({ length: 20 }).map((_, i) => ({
  w: 1 + (i % 3) * 0.8,
  l: `${(i * 53) % 100}%`,
  t: `${(i * 71) % 100}%`,
  dur: `${5 + (i % 5)}s`,
  delay: `${(i * 0.15) % 3}s`,
}));

const ORG_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'school', label: 'School' },
  { value: 'institute', label: 'Institute' },
  { value: 'private_company', label: 'Private Company' },
  { value: 'government_office', label: 'Government Office' },
];

const ORG_SIZE_OPTIONS = [
  { value: '', label: 'Select size' },
  { value: 'small', label: 'Small (1-50)' },
  { value: 'medium', label: 'Medium (51-200)' },
  { value: 'large', label: 'Large (201-1000)' },
  { value: 'enterprise', label: 'Enterprise (1000+)' },
];

function ResponsiveSelect({ value, options, onChange, placeholder = 'Select', required = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value);

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${open ? 'z-[80]' : 'z-0'}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <input className="sr-only" required={required} tabIndex={-1} value={value || ''} onChange={() => {}} />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-[2.75rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-slate-50/20 px-4 py-2.5 text-left text-sm font-semibold shadow-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:bg-slate-800 ${
          open
            ? 'border-emerald-500 ring-2 ring-emerald-500/10'
            : 'border-slate-200/80 text-slate-800 dark:border-slate-700 dark:text-slate-100'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 truncate ${selected?.value || value ? '' : 'text-slate-400'}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-[12rem] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-elevation-4 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 sm:max-h-[min(16rem,45vh)]"
          data-lenis-prevent
          onMouseDown={(event) => event.preventDefault()}
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || '__empty'}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block min-h-10 w-full min-w-0 px-4 py-2.5 text-left text-sm font-semibold transition ${
                  isSelected
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-800 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-slate-800'
                }`}
                role="option"
                aria-selected={isSelected}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SuperAdminOrganizations = ({ view }) => {
  const navigate = useNavigate();
  const { enterInstituteView } = useAuth();

  // Derive active view state from props
  const activeTab = view || 'directory';

  // Tab 1: Directory Overview States
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(null);
  const [focusLoading, setFocusLoading] = useState(false);

  // Tab 2: Administration States
  const [adminOrgs, setAdminOrgs] = useState([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Location management
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    organizationType: '',
    organizationSize: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: ''
    },
    location: {
      latitude: '',
      longitude: ''
    },
    settings: {
      defaultGeofenceRadius: 100,
      allowLocationChange: true,
      requireLocationApproval: false
    }
  });
  
  const [locationForm, setLocationForm] = useState({
    name: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: ''
    },
    coordinates: {
      latitude: '',
      longitude: ''
    },
    geofenceRadius: 100,
    workingHours: {
      start: '09:00',
      end: '17:00'
    },
    description: ''
  });

  // Tab 1 Data Fetching
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/superadmin/organizations');
        setOrgs(res.data.organizations || []);
      } catch {
        toast.error('Failed to load directory organizations');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Tab 2 Data Fetching
  const fetchAdminOrgs = async () => {
    try {
      setAdminLoading(true);
      const response = await organizationAPI.getAll();
      if (response.success) {
        setAdminOrgs(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
      toast.error('Failed to load administration organizations');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminOrgs();
    }
  }, [activeTab, currentPage, searchTerm, selectedType]);

  // Tab 1 Actions
  const handleOpenHoiReport = () => {
    if (focus && focus.organization) {
      enterInstituteView({
        id: focus.organization.id || focus.organization._id,
        name: focus.organization.name
      });
      navigate('/dashboard');
    }
  };

  const closeFocus = () => {
    setFocus(null);
  };

  const openOrg = useCallback(async (id) => {
    setFocus({ loading: true });
    setFocusLoading(true);
    try {
      const res = await axios.get(`/api/superadmin/org/${id}`);
      setFocus(res.data);
    } catch {
      toast.error('Failed to load organization details');
      closeFocus();
    } finally {
      setFocusLoading(false);
    }
  }, []);

  const filtered = orgs.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()) || (o.type || '').includes(q.toLowerCase()));

  const getTypeBadgeStyles = (type) => {
    switch (type) {
      case 'school':
        return 'bg-violet-50 text-violet-700 border border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/40';
      case 'institute':
        return 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40';
      case 'private_company':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40';
      case 'government_office':
        return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40';
      default:
        return 'bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-750';
    }
  };

  const getPercentageColor = (rate) => {
    const r = parseFloat(rate);
    if (r >= 85) return 'text-emerald-600 dark:text-emerald-450';
    if (r >= 70) return 'text-amber-600 dark:text-amber-450';
    return 'text-rose-600 dark:text-rose-400';
  };

  // Tab 2 Actions
  const handleCreateOrg = () => {
    setEditingOrg(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      organizationType: '',
      organizationSize: '',
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      },
      location: {
        latitude: '',
        longitude: ''
      },
      settings: {
        defaultGeofenceRadius: 100,
        allowLocationChange: true,
        requireLocationApproval: false
      }
    });
    setShowModal(true);
  };

  const handleEditOrg = (org) => {
    setEditingOrg(org);
    setFormData({
      name: org.name || '',
      email: org.email || '',
      password: '',
      phone: org.phone || '',
      organizationType: org.organizationType || '',
      organizationSize: org.organizationSize || '',
      address: org.address || {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      },
      location: org.location || {
        latitude: '',
        longitude: ''
      },
      settings: org.settings || {
        defaultGeofenceRadius: 100,
        allowLocationChange: true,
        requireLocationApproval: false
      }
    });
    setShowModal(true);
  };

  const handleOrgSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingOrg) {
        const response = await organizationAPI.update(editingOrg._id, formData);
        if (response.success) {
          toast.success('Organization updated successfully');
          setShowModal(false);
          fetchAdminOrgs();
          // Refetch directory listing to match
          const res = await axios.get('/api/superadmin/organizations');
          setOrgs(res.data.organizations || []);
        }
      } else {
        const response = await organizationAPI.create(formData);
        if (response.success) {
          toast.success('Organization created successfully');
          setShowModal(false);
          fetchAdminOrgs();
          // Refetch directory listing to match
          const res = await axios.get('/api/superadmin/organizations');
          setOrgs(res.data.organizations || []);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save organization');
    }
  };

  const handleAddLocation = (org) => {
    setSelectedOrg(org);
    setEditingLocation(null);
    setLocationForm({
      name: '',
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      },
      coordinates: {
        latitude: '',
        longitude: ''
      },
      geofenceRadius: 100,
      workingHours: {
        start: '09:00',
        end: '17:00'
      },
      description: ''
    });
    setShowLocationModal(true);
  };

  const handleEditLocation = (org, location) => {
    setSelectedOrg(org);
    setEditingLocation(location);
    setLocationForm({
      name: location.name || '',
      address: location.address || {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      },
      coordinates: location.coordinates || {
        latitude: '',
        longitude: ''
      },
      geofenceRadius: location.geofenceRadius || 100,
      workingHours: location.workingHours || {
        start: '09:00',
        end: '17:00'
      },
      description: location.description || ''
    });
    setShowLocationModal(true);
  };

  const handleLocationSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLocation) {
        const response = await organizationAPI.updateLocation(selectedOrg._id, editingLocation._id, locationForm);
        if (response.success) {
          toast.success('Location updated successfully');
          setShowLocationModal(false);
          fetchAdminOrgs();
        }
      } else {
        const response = await organizationAPI.addLocation(selectedOrg._id, locationForm);
        if (response.success) {
          toast.success('Location added successfully');
          setShowLocationModal(false);
          fetchAdminOrgs();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save location');
    }
  };

  const handleDeleteLocation = async (orgId, locationId) => {
    if (!window.confirm('Are you sure you want to delete this location?')) return;
    
    try {
      const response = await organizationAPI.deleteLocation(orgId, locationId);
      if (response.success) {
        toast.success('Location deleted successfully');
        fetchAdminOrgs();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete location');
    }
  };

  const handleSetPrimaryLocation = async (orgId, locationId) => {
    try {
      const response = await organizationAPI.setPrimaryLocation(orgId, locationId);
      if (response.success) {
        toast.success('Primary location updated successfully');
        fetchAdminOrgs();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to set primary location');
    }
  };

  const filteredAdminOrgs = adminOrgs.filter(org => {
    const matchesSearch = org.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          org.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !selectedType || org.organizationType === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden sm:space-y-8">
      {/* Super Admin Top Banner */}
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 p-5 text-white shadow-xl shadow-emerald-600/10 dark:border-slate-800 sm:rounded-3xl sm:p-8"
        style={{
          background: 'linear-gradient(135deg, #0B1220 0%, #101827 35%, #315CE8 65%, #0B1220 100%)'
        }}
      >
        {/* Atmospheric glows */}
        <div className="absolute -top-16 left-1/3 w-72 h-72 rounded-full pointer-events-none atmo-glow-gold opacity-60" />
        <div className="absolute -bottom-16 right-1/4 w-72 h-72 rounded-full pointer-events-none atmo-glow-cyan opacity-50" />

        {/* Animated light particles */}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white pointer-events-none"
            style={{
              width: p.w, height: p.w,
              left: p.l, top: p.t,
              boxShadow: '0 0 6px rgba(255,255,255,0.6)',
              opacity: 0.4,
              animation: `floatY ${p.dur} ease-in-out infinite`,
              animationDelay: p.delay,
            }}
          />
        ))}

        {/* Chrome scan line */}
        <div className="chrome-scan" />
        
        <div className="relative flex min-w-0 flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">Organizations Network</h1>
            <p className="mx-auto mt-2 max-w-sm text-xs font-medium text-emerald-100/90 sm:text-sm md:mx-0 md:max-w-lg">
              Manage national Anuvadini network node, configure geofences, and monitor institution directories.
            </p>
          </div>
          <div className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wider backdrop-blur-md sm:w-auto sm:gap-4 sm:px-5">
            <Activity className="h-4.5 w-4.5 text-amber-300 animate-pulse" />
            <span>Total Units: {orgs.length}</span>
          </div>
        </div>

        {/* Shine sweep */}
        <span className="shine-overlay-anuvadini rounded-3xl" />
      </div>
      {activeTab === 'directory' ? (
        <>
          {/* Styled Search Bar (Tab 1) */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-elevation-1 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/85 sm:p-5">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4.5 w-4.5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Search Institution</h3>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter by name or type..."
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/20 pl-10 pr-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Network Organizations List Card (Tab 1) */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-slate-900 shadow-elevation-1">
            {loading ? (
              <div className="p-6"><SkeletonTable rows={6} /></div>
            ) : filtered.length === 0 ? (
              <div className="p-10"><EmptyState title="No registered organizations found" description="Adjust your filters to view details." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[62rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-900/50 dark:border-slate-850">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Institution</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Type</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Staff Count</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Present Today</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Today Rate</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Month Average</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Last Sync Activity</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((o) => (
                      <tr
                        key={o.id}
                        className="cursor-pointer hover:bg-slate-50/40 dark:hover:bg-slate-800/35 transition-all"
                        onClick={() => {
                          enterInstituteView({ id: o.id, name: o.name });
                          navigate('/dashboard');
                        }}
                      >
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 border border-emerald-500/10 flex items-center justify-center font-bold text-emerald-600">
                            {o.name?.[0]?.toUpperCase() || 'I'}
                          </div>
                          <span className="truncate max-w-xs">{o.name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getTypeBadgeStyles(o.type)}`}>
                            {(o.type || '').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">{o.staff}</td>
                        <td className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">{o.presentToday}</td>
                        <td className={`px-6 py-4 font-extrabold ${getPercentageColor(o.todayRate)}`}>{o.todayRate}%</td>
                        <td className={`px-6 py-4 font-extrabold ${getPercentageColor(o.monthRate)}`}>{o.monthRate}%</td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs font-medium">{o.lastActivity || 'No log'}</td>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openOrg(o.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-600" />
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Modern Filter Widget (Tab 2) */}
          <div className="relative z-30 overflow-visible rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-elevation-1 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/80 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4.5 w-4.5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Search &amp; Filters</h3>
              </div>
              <button
                onClick={handleCreateOrg}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-emerald-700 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                Add Institute
              </button>
            </div>
            
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="min-w-0">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Institution Name or Email
                </label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/20 pl-10 pr-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
              
              <div className="min-w-0">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Filter by Organization Type
                </label>
                <ResponsiveSelect
                  value={selectedType}
                  onChange={(nextValue) => {
                    setSelectedType(nextValue);
                    setCurrentPage(1);
                  }}
                  options={ORG_TYPE_OPTIONS}
                  placeholder="All Types"
                />
              </div>
              
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedType('');
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>

          {/* Styled Organizations Table (Tab 2) */}
          <div className="relative z-0 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-slate-900 shadow-elevation-1">
            {adminLoading ? (
              <div className="p-6"><SkeletonTable rows={6} /></div>
            ) : filteredAdminOrgs.length === 0 ? (
              <div className="p-10"><EmptyState title="No institutions found" description="Adjust your search parameters or register a new institute." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[72rem] border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-900/50 dark:border-slate-800">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Organization</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Type</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Coordinates</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Locations &amp; Geofences</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Radius &amp; Security</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredAdminOrgs.map((org) => (
                      <tr key={org._id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4.5">
                          <div className="flex items-center">
                            <div className="h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="ml-4 min-w-0">
                              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                {org.name}
                              </div>
                              <div className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                                <Mail className="h-3 w-3" /> {org.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4.5">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getTypeBadgeStyles(org.organizationType)}`}>
                            {(org.organizationType || '').replace('_', ' ')}
                          </span>
                        </td>
                        
                        <td className="px-6 py-4.5">
                          {org.location?.latitude && org.location?.longitude ? (
                            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 space-y-0.5">
                              <span className="flex items-center gap-1"><Compass className="h-3.5 w-3.5 text-emerald-500" /> Lat: {parseFloat(org.location.latitude).toFixed(6)}</span>
                              <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-emerald-500" /> Lng: {parseFloat(org.location.longitude).toFixed(6)}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-slate-400 italic">No GPS Set</span>
                          )}
                        </td>
                        
                        <td className="px-6 py-4.5">
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 mb-2">
                            <span className="text-xs font-bold text-slate-500">{org.locations?.length || 0} Registered Locations</span>
                            <button
                              onClick={() => handleAddLocation(org)}
                              className="flex items-center justify-center p-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition-colors cursor-pointer"
                              title="Add geofence location"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {org.locations?.map((location) => (
                              <div key={location._id} className="flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-xl px-2.5 py-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{location.name}</span>
                                  {org.primaryLocation === location._id && (
                                    <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 ml-2">
                                  <button
                                    onClick={() => handleEditLocation(org, location)}
                                    className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                                    title="Edit"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  {org.primaryLocation !== location._id && (
                                    <>
                                      <button
                                        onClick={() => handleSetPrimaryLocation(org._id, location._id)}
                                        className="text-slate-400 hover:text-amber-500 transition-colors cursor-pointer"
                                        title="Set as Primary"
                                      >
                                        <StarOff className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteLocation(org._id, location._id)}
                                        className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                        title="Delete"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4.5">
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-400 font-medium">Geofence Radius:</span>
                              <span className="text-slate-800 dark:text-slate-200 font-bold">{org.settings?.defaultGeofenceRadius || 100}m</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-400 font-medium">Allow GPS Change:</span>
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${org.settings?.allowLocationChange ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'}`}>
                                {org.settings?.allowLocationChange ? 'YES' : 'NO'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-400 font-medium">Require Approval:</span>
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${org.settings?.requireLocationApproval ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                {org.settings?.requireLocationApproval ? 'YES' : 'NO'}
                              </span>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4.5 text-right">
                          <button
                            onClick={() => handleEditOrg(org)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                            title="Edit organization parameters"
                          >
                            <Edit className="h-4.5 w-4.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Styled glassmorphic Org detail modal (Tab 1) */}
      {focus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={closeFocus} />
          <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-elevation-4 animate-in fade-in zoom-in-95 duration-250 max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-5 shrink-0 bg-slate-50/40 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Building2 className="h-5.5 w-5.5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {focus.organization?.name || 'Syncing...'}
                </h3>
              </div>
              <button
                onClick={closeFocus}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto p-6 flex-1 space-y-6">
              {focusLoading || focus.loading ? (
                <div className="py-8"><SkeletonTable rows={5} /></div>
              ) : (
                <div className="space-y-6">
                  {/* Neon Info Stats Cards */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <StatCard label="Total Staff" value={focus.stats.staff} icon={Users} accent="primary" className="border-t-2 border-t-blue-500 shadow-sm" />
                    <StatCard label="Present Today" value={focus.stats.presentToday} icon={UserCheck} accent="success" className="border-t-2 border-t-emerald-500 shadow-sm" />
                    <StatCard label="Absent Today" value={focus.stats.absentToday} icon={UserX} accent="danger" className="border-t-2 border-t-rose-500 shadow-sm" />
                    <StatCard label="Month Rate" value={`${focus.stats.monthRate}%`} icon={Percent} accent="info" className="border-t-2 border-t-amber-500 shadow-sm" />
                  </div>

                  {/* Graphical Analysis grid */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Recharts Bar Chart */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-800/20 p-5">
                      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                        <Calendar className="h-4.5 w-4.5 text-emerald-600" />
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">10-Day Attendance Trend</p>
                      </div>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={(focus.trend || []).map((t) => ({ date: t.date.slice(5), Present: t.present, Absent: t.absent }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 'bold' }} stroke="#94a3b8" />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fontWeight: 'bold' }} stroke="#94a3b8" />
                            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 'bold', paddingTop: 10 }} />
                            <Bar dataKey="Present" stackId="a" fill="#4A74F0" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="Absent" stackId="a" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Attendance verification — face-only product */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-800/20 p-5">
                      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                        <UserCheck className="h-4.5 w-4.5 text-emerald-600" />
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Attendance Verification (month)</p>
                      </div>
                      <div className="flex h-56 flex-col items-center justify-center text-center">
                        {(() => {
                          const totalCheckins = (focus.authMethodDistribution || []).reduce((s, m) => s + (m.value || 0), 0);
                          return totalCheckins === 0 ? (
                            <p className="text-sm text-slate-400">No attendance captured this month.</p>
                          ) : (
                            <>
                              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                                <UserCheck className="h-8 w-8" />
                              </div>
                              <p className="mt-3 text-3xl font-black text-slate-900 dark:text-slate-100">{totalCheckins.toLocaleString()}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Face-verified check-ins</p>
                              <p className="mt-1 text-xs text-slate-400">100% via Face Recognition — the only enrolled biometric.</p>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Department Distribution (if available) */}
                  {focus.departmentDistribution?.length > 0 && (
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-800/20 p-5">
                      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                        <Users className="h-4.5 w-4.5 text-emerald-600" />
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Department Headcount</p>
                      </div>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={focus.departmentDistribution} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fontWeight: 'bold' }} stroke="#94a3b8" />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} width={100} stroke="#94a3b8" />
                            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} name="Staff Members" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 px-6 py-4 shrink-0 bg-slate-50/40 dark:bg-slate-900/50">
              <button
                onClick={closeFocus}
                className="rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 px-5 py-2.5 text-sm font-bold dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Close View
              </button>

              {!focusLoading && !focus.loading && focus.organization && (
                <button
                  onClick={handleOpenHoiReport}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-bold shadow-sm transition-colors cursor-pointer"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Dashboard
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Custom glassmorphic Organization Add/Edit Modal (Tab 2) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-elevation-4 animate-in fade-in zoom-in-95 duration-200 z-50">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-5">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {editingOrg ? 'Edit Organization Settings' : 'Register New Organization'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleOrgSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Organization Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="Enter name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="name@institution.org"
                    disabled={!!editingOrg}
                  />
                </div>

                {!editingOrg && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Account Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                      placeholder="Enter safe password"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Phone Contact
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="Phone number"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Organization Type *
                  </label>
                  <ResponsiveSelect
                    required
                    value={formData.organizationType}
                    onChange={(nextValue) => setFormData({ ...formData, organizationType: nextValue })}
                    options={ORG_TYPE_OPTIONS}
                    placeholder="Select type"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Organization Size
                  </label>
                  <ResponsiveSelect
                    value={formData.organizationSize}
                    onChange={(nextValue) => setFormData({ ...formData, organizationSize: nextValue })}
                    options={ORG_SIZE_OPTIONS}
                    placeholder="Select size"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Office Coordinates (Latitude)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.location.latitude}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: { ...formData.location, latitude: e.target.value }
                    })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="e.g. 28.6139"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Office Coordinates (Longitude)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.location.longitude}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: { ...formData.location, longitude: e.target.value }
                    })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="e.g. 77.2090"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Default Geofence Radius (meters)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.settings.defaultGeofenceRadius}
                    onChange={(e) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, defaultGeofenceRadius: parseInt(e.target.value) }
                    })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="100"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Security Policies</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.settings.allowLocationChange}
                      onChange={(e) => setFormData({
                        ...formData,
                        settings: { ...formData.settings, allowLocationChange: e.target.checked }
                      })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 h-4.5 w-4.5"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Allow location modifications</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.settings.requireLocationApproval}
                      onChange={(e) => setFormData({
                        ...formData,
                        settings: { ...formData.settings, requireLocationApproval: e.target.checked }
                      })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 h-4.5 w-4.5"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Require supervisor approval</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow shadow-emerald-600/20 hover:bg-emerald-700 transition-all cursor-pointer"
                >
                  {editingOrg ? 'Save Settings' : 'Register Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Geofence Location Modal (Tab 2) */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowLocationModal(false)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-elevation-4 animate-in fade-in zoom-in-95 duration-200 z-50">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-5">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {editingLocation ? 'Edit Geofence Location' : 'Define New Geofence Location'}
                </h3>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleLocationSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={locationForm.name}
                    onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="e.g. Block A Main Gate"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Latitude Coordinates *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={locationForm.coordinates.latitude}
                    onChange={(e) => setLocationForm({
                      ...locationForm,
                      coordinates: { ...locationForm.coordinates, latitude: e.target.value }
                    })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="e.g. 28.6140"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Longitude Coordinates *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={locationForm.coordinates.longitude}
                    onChange={(e) => setLocationForm({
                      ...locationForm,
                      coordinates: { ...locationForm.coordinates, longitude: e.target.value }
                    })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="e.g. 77.2091"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Geofence Radius (meters) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={locationForm.geofenceRadius}
                    onChange={(e) => setLocationForm({ ...locationForm, geofenceRadius: parseInt(e.target.value) })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    City Name
                  </label>
                  <input
                    type="text"
                    value={locationForm.address.city}
                    onChange={(e) => setLocationForm({
                      ...locationForm,
                      address: { ...locationForm.address, city: e.target.value }
                    })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="City name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Work Shifts (Start Time)
                  </label>
                  <input
                    type="time"
                    value={locationForm.workingHours.start}
                    onChange={(e) => setLocationForm({
                      ...locationForm,
                      workingHours: { ...locationForm.workingHours, start: e.target.value }
                    })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Work Shifts (End Time)
                  </label>
                  <input
                    type="time"
                    value={locationForm.workingHours.end}
                    onChange={(e) => setLocationForm({
                      ...locationForm,
                      workingHours: { ...locationForm.workingHours, end: e.target.value }
                    })}
                    className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Description &amp; Details
                  </label>
                  <textarea
                    rows={3}
                    value={locationForm.description}
                    onChange={(e) => setLocationForm({ ...locationForm, description: e.target.value })}
                    className="textarea w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="Enter details..."
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow shadow-emerald-600/20 hover:bg-emerald-700 transition-all cursor-pointer"
                >
                  {editingLocation ? 'Save Location' : 'Register Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOrganizations;
