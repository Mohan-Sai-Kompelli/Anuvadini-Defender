import React, { useState, useEffect } from 'react';
import {
  Search,
  MapPin,
  Check,
  X,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { studentLocationAPI, organizationAPI } from '../services/api';
import toast from 'react-hot-toast';
import ScrollReveal from '../components/ScrollReveal';
import { EmptyState, SkeletonTable } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';


const LocationSelect = ({ value, options, onChange, placeholder = 'Select', disabled = false, title, className = '' }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div
      className={`relative min-w-0 ${open ? 'z-[120]' : 'z-0'} ${className}`} 
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-[2.5rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-bold text-slate-700 shadow-sm outline-none transition-all hover:border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-[999] mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900" data-lenis-prevent
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          role="listbox">
          {options.map((option) => (
            <button
              key={option.value || '__empty'}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors ${
                option.value === value
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
              role="option"
              aria-selected={option.value === value}
            >
              <span className="block truncate">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const getInitials = (name) =>
  (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const StudentLocationManagement = () => {
  const { userType, viewAsOrg } = useAuth();
  const readOnly = userType === 'superadmin' && !!viewAsOrg;

  const [students, setStudents] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationRequests, setLocationRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('students');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTerm, selectedLocation, selectedStatus]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadStudents(),
        loadLocations(),
        loadLocationRequests()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const viewOrg = (() => { try { return JSON.parse(localStorage.getItem('viewAsOrg'))?.id; } catch { return null; } })();
      const response = await fetch('/api/students?limit=1000', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          ...(viewOrg ? { 'x-view-org': viewOrg } : {}),
        }
      });
      const data = await response.json();
      if (data.success) {
        setStudents(data.students || []);
      }
    } catch (error) {
      console.error('Failed to load students:', error);
    }
  };

  const loadLocations = async () => {
    try {
      const orgResponse = await organizationAPI.getAll();
      if (orgResponse.success && orgResponse.data.length > 0) {
        const org = orgResponse.data[0];
        setLocations(org.locations || []);
      }
    } catch (error) {
      console.error('Failed to load locations:', error);
    }
  };

  const loadLocationRequests = async () => {
    try {
      const orgResponse = await organizationAPI.getAll();
      if (orgResponse.success && orgResponse.data.length > 0) {
        const org = orgResponse.data[0];
        const requestsResponse = await studentLocationAPI.getOrgLocationRequests(org._id, 'pending');
        if (requestsResponse.success) {
          setLocationRequests(requestsResponse.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to load location requests:', error);
    }
  };

  const handleLocationChange = async (studentId, newLocationId) => {
    try {
      const orgResponse = await organizationAPI.getAll();
      if (orgResponse.success && orgResponse.data.length > 0) {
        const org = orgResponse.data[0];
        const response = await studentLocationAPI.assignStudentLocation(
          org._id,
          studentId,
          newLocationId
        );
        
        if (response.success) {
          toast.success('Student location updated successfully');
          loadStudents();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update location');
    }
  };

  const handleProcessRequest = async (request, status, rejectionReason = '') => {
    try {
      const orgResponse = await organizationAPI.getAll();
      if (orgResponse.success && orgResponse.data.length > 0) {
        const org = orgResponse.data[0];
        const response = await studentLocationAPI.processLocationRequest(
          org._id,
          request.studentId,
          request._id,
          status,
          rejectionReason
        );
        
        if (response.success) {
          toast.success(`Location request ${status} successfully`);
          loadLocationRequests();
          loadStudents();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to ${status} request`);
    }
  };

  const getLocationName = (locationId) => {
    const location = locations.find(loc => loc._id === locationId);
    return location ? location.name : 'No location assigned';
  };

  const getLocationRadius = (locationId) => {
    const location = locations.find(loc => loc._id === locationId);
    return location ? location.geofenceRadius : 0;
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.uid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.class?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.bureau?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLocation = !selectedLocation || student.currentLocation === selectedLocation;
    const matchesStatus = !selectedStatus || 
                         (selectedStatus === 'assigned' && student.currentLocation) ||
                         (selectedStatus === 'unassigned' && !student.currentLocation);
    
    return matchesSearch && matchesLocation && matchesStatus;
  });

  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * 10,
    currentPage * 10
  );

  return (
    <ScrollReveal y={28} duration={800} blur={8} className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <div className="kicker-label text-emerald-700 dark:text-emerald-400 mb-1">
            GEOFENCING & SPATIAL CONTROL
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "'Geist','Inter',sans-serif" }}
          >
            Staff Locations
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure geofence coordinates and audit check-in zones for staff and faculty members.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <ScrollReveal delay={100} y={16} blur={0} className="flex items-center justify-between p-2 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/50 dark:border-slate-800/50 backdrop-blur-md">
        <div className="flex w-full overflow-x-auto scrollbar-none">
          <div className="flex flex-nowrap min-w-max gap-2 p-1">
            <button
              type="button"
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 shrink-0 cursor-pointer ${
                activeTab === 'students'
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-md"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
              onClick={() => setActiveTab('students')}
            >
              Staff Listings ({filteredStudents.length})
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 shrink-0 cursor-pointer ${
                activeTab === 'requests'
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-md"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
              onClick={() => setActiveTab('requests')}
            >
              Pending Requests ({locationRequests.length})
            </button>
          </div>
        </div>
      </ScrollReveal>

      {/* Main Content Area */}
      <div className="min-h-[300px] space-y-6">
        {activeTab === 'students' ? (
          <>
            {/* Filters */}
            <ScrollReveal delay={150} y={16} blur={0} className="glass relative z-30 overflow-visible p-5">
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                    Search Staff
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name, UID, department..."
                      className="input pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                    Geofence Location
                  </label>
                  <LocationSelect
                    value={selectedLocation}
                    onChange={(next) => {
                      setSelectedLocation(next);
                      setCurrentPage(1);
                    }}
                    placeholder="All Locations"
                    options={[
                      { value: '', label: 'All Locations' },
                      ...locations.map((location) => ({ value: location._id, label: location.name })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                    Assignment Status
                  </label>
                  <LocationSelect
                    value={selectedStatus}
                    onChange={(next) => {
                      setSelectedStatus(next);
                      setCurrentPage(1);
                    }}
                    placeholder="All Statuses"
                    options={[
                      { value: '', label: 'All Statuses' },
                      { value: 'assigned', label: 'Location Assigned' },
                      { value: 'unassigned', label: 'No Location Assigned' },
                    ]}
                  />
                </div>

                <div>
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedLocation('');
                      setSelectedStatus('');
                      setCurrentPage(1);
                    }}
                    className="btn-secondary w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </ScrollReveal>

            {/* Students Table */}
            {loading ? (
              <div className="glass p-5">
                <SkeletonTable rows={5} cols={5} />
              </div>
            ) : paginatedStudents.length === 0 ? (
              <div className="glass p-8">
                <EmptyState
                  icon={Search}
                  title="No staff members found"
                  message="Try clearing your filters or adjusting your search term."
                />
              </div>
            ) : (
              <div className="glass overflow-visible">
                <div className="overflow-x-auto overflow-y-visible">
                  <table className="w-full min-w-max table-auto">
                    <thead>
                      <tr className="bg-slate-50/50 dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800">
                        <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[200px] whitespace-nowrap">
                          Staff Member
                        </th>
                        <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[100px] whitespace-nowrap">
                          UID
                        </th>
                        <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[140px] whitespace-nowrap">
                          Department
                        </th>
                        <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[180px] whitespace-nowrap">
                          Current Geofence
                        </th>
                        <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[180px] whitespace-nowrap">
                          Change Assignment
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                      {paginatedStudents.map((student) => (
                        <tr key={student._id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/25">
                          {/* Profile */}
                          <td className="p-4 align-middle">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white shadow-sm shadow-emerald-500/10">
                                {getInitials(student.fullName)}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {student.fullName}
                                </div>
                                <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                                  {student.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* UID */}
                          <td className="p-4 align-middle text-slate-600 dark:text-slate-350 font-mono text-xs font-semibold">
                            {student.uid}
                          </td>

                          {/* Department */}
                          <td className="p-4 align-middle text-slate-650 dark:text-slate-350 text-xs font-semibold">
                            {student.department || student.class || student.bureau || 'Not Assigned'}
                          </td>

                          {/* Current Geofence */}
                          <td className="p-4 align-middle">
                            {student.currentLocation ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/35">
                                  <MapPin className="h-4 w-4" />
                                </span>
                                <div>
                                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {getLocationName(student.currentLocation)}
                                  </div>
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                                    Radius: {getLocationRadius(student.currentLocation)}m
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">
                                <AlertCircle className="h-3.5 w-3.5" />
                                No Geofence Assigned
                              </span>
                            )}
                          </td>

                          {/* Dropdown Change */}
                          <td className="p-4 align-middle">
                            <LocationSelect
                                value={student.currentLocation || ''}
                                onChange={(next) => handleLocationChange(student._id, next)}
                                disabled={readOnly}
                                title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                                placeholder="Select location..."
                                className="w-full min-w-[180px] max-w-[220px]"
                                options={[
                                  { value: '', label: 'Select location...' },
                                  ...locations.map((location) => ({
                                    value: location._id,
                                    label: `${location.name} (${location.geofenceRadius}m)`,
                                  })),
                                ]}
                              />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {Math.ceil(filteredStudents.length / 10) > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/10">
                    <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center sm:text-left">
                      Showing {((currentPage - 1) * 10) + 1} to {Math.min(currentPage * 10, filteredStudents.length)} of {filteredStudents.length} staff
                    </div>
                    <div className="flex space-x-2 shrink-0">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="btn-secondary py-1.5 px-3 rounded-xl disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 text-xs font-bold"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Prev
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredStudents.length / 10)))}
                        disabled={currentPage === Math.ceil(filteredStudents.length / 10)}
                        className="btn-secondary py-1.5 px-3 rounded-xl disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 text-xs font-bold"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Pending Requests Tab */
          loading ? (
            <div className="glass p-5">
              <SkeletonTable rows={3} cols={5} />
            </div>
          ) : locationRequests.length === 0 ? (
            <div className="glass p-8">
              <EmptyState
                icon={Clock}
                title="No pending requests"
                message="All location change requests have been processed."
              />
            </div>
          ) : (
            <div className="glass overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max table-auto">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800">
                      <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[200px] whitespace-nowrap">
                        Staff Member
                      </th>
                      <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[180px] whitespace-nowrap">
                        Requested Geofence
                      </th>
                      <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[160px] whitespace-nowrap">
                        Reason for Change
                      </th>
                      <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[130px] whitespace-nowrap">
                        Requested Date
                      </th>
                      <th className="p-4 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 min-w-[180px] whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    {locationRequests.map((request) => (
                      <tr key={request._id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/25">
                        {/* Profile */}
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-semibold text-white shadow-sm shadow-indigo-500/10">
                              {getInitials(request.studentName)}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {request.studentName}
                              </div>
                              <div className="text-xs font-mono text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                                UID: {request.studentUid}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Requested Location */}
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100 dark:border-blue-900/35">
                              <MapPin className="h-4 w-4" />
                            </span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {request.locationDetails?.name || 'Unknown Location'}
                            </span>
                          </div>
                        </td>

                        {/* Reason */}
                        <td className="p-4 align-middle text-slate-650 dark:text-slate-350 text-xs font-semibold max-w-xs truncate">
                          {request.reason}
                        </td>

                        {/* Date */}
                        <td className="p-4 align-middle text-slate-600 dark:text-slate-350 text-xs font-semibold">
                          {new Date(request.requestedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-center align-middle">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleProcessRequest(request, 'approved')}
                              disabled={readOnly}
                              title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                              className={`inline-flex items-center px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl text-white bg-emerald-600 shadow-sm shadow-emerald-600/10 transition-all duration-150 ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-700'}`}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt('Rejection reason (optional):');
                                handleProcessRequest(request, 'rejected', reason || '');
                              }}
                              disabled={readOnly}
                              title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                              className={`inline-flex items-center px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl text-white bg-rose-600 shadow-sm shadow-rose-600/10 transition-all duration-150 ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-700'}`}
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </ScrollReveal>
  );
};

export default StudentLocationManagement;