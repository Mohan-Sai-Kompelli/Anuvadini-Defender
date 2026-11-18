import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  MapPin,
  Building2,
  Star,
  StarOff,
  X,
  Compass,
  SlidersHorizontal,
  Mail,
  Target,
  ChevronDown
} from 'lucide-react';
import { organizationAPI } from '../services/api';
import toast from 'react-hot-toast';

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

const ORG_FORM_TYPE_OPTIONS = [
  { value: '', label: 'Select type' },
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

function ResponsiveSelect({ value, options, onChange, placeholder = 'Select', required = false, floating = false }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value);

  const updateMenuPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gutter = 12;
    const spaceBelow = window.innerHeight - rect.bottom - gutter;
    const spaceAbove = rect.top - gutter;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(288, openUp ? spaceAbove : spaceBelow));

    setMenuStyle({
      left: `${Math.max(gutter, rect.left)}px`,
      top: openUp ? 'auto' : `${rect.bottom + 4}px`,
      bottom: openUp ? `${window.innerHeight - rect.top + 4}px` : 'auto',
      width: `${Math.min(rect.width, window.innerWidth - gutter * 2)}px`,
      maxHeight: `${maxHeight}px`,
    });
  }, []);

  useEffect(() => {
    if (!open || !floating) return undefined;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [floating, open, updateMenuPosition]);

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${open ? 'z-[120]' : 'z-0'}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input className="sr-only" required={required} tabIndex={-1} value={value || ''} onChange={() => {}} />
      <button
        type="button"
        onClick={() => {
          updateMenuPosition();
          setOpen((current) => !current);
        }}
        className="flex min-h-[2.75rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/20 px-4 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 truncate ${selected?.value || value ? '' : 'text-slate-400'}`}>{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={`${floating ? 'fixed z-[9999]' : 'absolute left-0 right-0 top-full z-[999] mt-1'} max-h-[min(18rem,45vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-elevation-4 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-elevation-4-dark`}
          style={floating ? menuStyle : undefined}
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
                className={`block w-full min-w-0 px-4 py-2.5 text-left text-sm transition ${
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

function OrganizationTypeSelect({ value, onChange }) {
  return <ResponsiveSelect value={value} onChange={onChange} options={ORG_TYPE_OPTIONS} placeholder="All Types" />;
}
const OrganizationMobileCard = ({ org, getBadgeStyles, onEdit, onAddLocation, onEditLocation, onDeleteLocation, onSetPrimaryLocation }) => (
  <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
        <Building2 className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-extrabold text-slate-900 dark:text-slate-100">{org.name}</p>
        <p className="mt-0.5 break-all text-xs font-semibold text-slate-500 dark:text-slate-400">{org.email}</p>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${getBadgeStyles(org.organizationType)}`}>
        {org.organizationType?.replace('_', ' ') || 'Organization'}
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {org.locations?.length || 0} locations
      </span>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-2 text-xs min-[380px]:grid-cols-2">
      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <p className="font-bold uppercase tracking-wider text-slate-400">Latitude</p>
        <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">{org.location?.latitude ? parseFloat(org.location.latitude).toFixed(6) : 'Not set'}</p>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <p className="font-bold uppercase tracking-wider text-slate-400">Longitude</p>
        <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">{org.location?.longitude ? parseFloat(org.location.longitude).toFixed(6) : 'Not set'}</p>
      </div>
    </div>

    {org.locations?.length > 0 && (
      <div className="mt-3 space-y-2">
        {org.locations.slice(0, 3).map((location) => (
          <div key={location._id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{location.name}</p>
              <p className="text-[11px] text-slate-400">{location.geofenceRadius || 100}m geofence</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onSetPrimaryLocation(org._id, location._id)} className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-slate-700" aria-label="Set primary location">
                {org.primaryLocation === location._id ? <Star className="h-3.5 w-3.5 fill-amber-500" /> : <StarOff className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={() => onEditLocation(org, location)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Edit location"><Edit className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => onDeleteLocation(org._id, location._id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-700" aria-label="Delete location"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="mt-4 grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onAddLocation(org)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
        Add Location
      </button>
      <button type="button" onClick={() => onEdit(org)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm">
        Edit
      </button>
    </div>
  </div>
);
const OrganizationManagement = () => {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchOrganizations();
  }, [currentPage, searchTerm, selectedType]);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const response = await organizationAPI.getAll();
      if (response.success) {
        setOrganizations(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
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

  const handleEdit = (org) => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingOrg) {
        const response = await organizationAPI.update(editingOrg._id, formData);
        if (response.success) {
          toast.success('Organization updated successfully');
          setShowModal(false);
          fetchOrganizations();
        }
      } else {
        const response = await organizationAPI.create(formData);
        if (response.success) {
          toast.success('Organization created successfully');
          setShowModal(false);
          fetchOrganizations();
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
          fetchOrganizations();
        }
      } else {
        const response = await organizationAPI.addLocation(selectedOrg._id, locationForm);
        if (response.success) {
          toast.success('Location added successfully');
          setShowLocationModal(false);
          fetchOrganizations();
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
        fetchOrganizations();
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
        fetchOrganizations();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to set primary location');
    }
  };

  const filteredOrganizations = organizations.filter(org => {
    const matchesSearch = org.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          org.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !selectedType || org.organizationType === selectedType;
    return matchesSearch && matchesType;
  });

  const getBadgeStyles = (type) => {
    switch (type) {
      case 'school':
        return 'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/40';
      case 'institute':
        return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40';
      case 'private_company':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40';
      case 'government_office':
        return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40';
      default:
        return 'bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="relative flex items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-emerald-600"></div>
          <Building2 className="absolute h-6 w-6 text-emerald-600 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-8">
      {/* Header Banner */}
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
        
        <div className="relative flex flex-col items-stretch justify-between gap-4 sm:items-center md:flex-row md:gap-6">
          <div className="text-left md:text-left">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">Organization Management</h1>
            <p className="mt-2 text-emerald-100/90 text-sm font-medium">
              Configure node settings, register new organization units, and edit geofencing coordinates.
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-emerald-700 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-xl sm:w-auto sm:px-6 sm:py-3.5"
          >
            <Plus className="h-5 w-5" />
            Add Organization
          </button>
        </div>

        {/* Shine sweep */}
        <span className="shine-overlay-anuvadini rounded-3xl" />
      </div>

      {/* Modern Filter Widget */}
      <div className="relative z-30 overflow-visible rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-elevation-1 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/80 sm:p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
          <SlidersHorizontal className="h-4.5 w-4.5 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Search & Filters</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,0.8fr)] md:items-end md:gap-4">
          <div>
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
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Filter by Organization Type
            </label>
            <OrganizationTypeSelect value={selectedType} onChange={setSelectedType} />
          </div>
          
          <div>
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

      {/* Styled Organizations Table */}
      <div className="space-y-3 lg:hidden">
        {filteredOrganizations.map((org) => (
          <OrganizationMobileCard
            key={org._id}
            org={org}
            getBadgeStyles={getBadgeStyles}
            onEdit={handleEdit}
            onAddLocation={handleAddLocation}
            onEditLocation={handleEditLocation}
            onDeleteLocation={handleDeleteLocation}
            onSetPrimaryLocation={handleSetPrimaryLocation}
          />
        ))}
      </div>

      <div className="relative hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-elevation-1 dark:border-slate-800/60 dark:bg-slate-900 lg:block">
        <div className="overflow-x-auto">
          <table className="table w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-900/50 dark:border-slate-800">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Organization</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Type</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Coordinates</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Locations & Geofences</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Radius & Security</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredOrganizations.map((org) => (
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
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getBadgeStyles(org.organizationType)}`}>
                      {org.organizationType?.replace('_', ' ')}
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
                        className="flex items-center justify-center p-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition-colors"
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
                              className="text-slate-400 hover:text-emerald-600 transition-colors"
                              title="Edit"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            {org.primaryLocation !== location._id && (
                              <>
                                <button
                                  onClick={() => handleSetPrimaryLocation(org._id, location._id)}
                                  className="text-slate-400 hover:text-amber-500 transition-colors"
                                  title="Set as Primary"
                                >
                                  <StarOff className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteLocation(org._id, location._id)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors"
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
                      onClick={() => handleEdit(org)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition-colors"
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
      </div>

      {/* Custom glassmorphic Organization Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowModal(false)} />
          <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-elevation-4 animate-in fade-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-3xl">
            {/* Modal Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:items-center sm:px-6 sm:py-5">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {editingOrg ? 'Edit Organization' : 'Register New Organization'}
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
            <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5" data-lenis-prevent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    floating
                    value={formData.organizationType}
                    onChange={(value) => setFormData({ ...formData, organizationType: value })}
                    options={ORG_FORM_TYPE_OPTIONS}
                    placeholder="Select type"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Organization Size
                  </label>
                  <ResponsiveSelect
                    floating
                    value={formData.organizationSize}
                    onChange={(value) => setFormData({ ...formData, organizationSize: value })}
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <div className="sticky bottom-0 -mx-4 grid grid-cols-1 gap-2 border-t border-slate-100 bg-white px-4 pt-4 dark:border-slate-800 dark:bg-slate-900 sm:-mx-6 sm:flex sm:justify-end sm:gap-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                >
                  {editingOrg ? 'Save Settings' : 'Register Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Geofence Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowLocationModal(false)} />
          <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-elevation-4 animate-in fade-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-3xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:items-center sm:px-6 sm:py-5">
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

            <form onSubmit={handleLocationSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5" data-lenis-prevent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    Description & Details
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
              <div className="sticky bottom-0 -mx-4 grid grid-cols-1 gap-2 border-t border-slate-100 bg-white px-4 pt-4 dark:border-slate-800 dark:bg-slate-900 sm:-mx-6 sm:flex sm:justify-end sm:gap-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
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

export default OrganizationManagement;