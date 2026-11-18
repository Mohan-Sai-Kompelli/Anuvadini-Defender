import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Phone,
  MapPin,
  Building2,
  Eye,
  EyeOff,
  Plus,
  X,
  Save,
  Edit3,
  Calendar,
  ShieldAlert,
  UserCheck,
  ShieldCheck,
  Search,
  Timer,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import BureauManagement from '../components/BureauManagement';
import { Button, EmptyState, Skeleton, SkeletonCard } from '../components/ui';

const PARTICLES = Array.from({ length: 20 }).map((_, i) => ({
  w: 1 + (i % 3) * 0.8,
  l: `${(i * 53) % 100}%`,
  t: `${(i * 71) % 100}%`,
  dur: `${5 + (i % 5)}s`,
  delay: `${(i * 0.15) % 3}s`,
}));

const Profile = () => {
  const navigate = useNavigate();
  const { user, updateProfile, updatePassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingDepartments, setEditingDepartments] = useState(false);
  const [editingClasses, setEditingClasses] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: {
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
    },
    latitude: "",
    longitude: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [newDepartment, setNewDepartment] = useState("");
  const [newClass, setNewClass] = useState("");

  // Nodal Officer Modal State
  const [showNodalModal, setShowNodalModal] = useState(false);
  const [nodalStep, setNodalStep] = useState(1); // 1 = Select, 2 = OTP
  const [nodalSearch, setNodalSearch] = useState("");
  const [nodalStaff, setNodalStaff] = useState([]);
  const [selectedNodal, setSelectedNodal] = useState(null);
  const [nodalOtp, setNodalOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  useEffect(() => {
    let interval = null;
    if (otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    } else if (interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [otpTimer]);

  const handleOpenNodalModal = async () => {
    setShowNodalModal(true);
    setNodalStep(1);
    setSelectedNodal(null);
    setNodalSearch("");
    setNodalOtp("");
    
    try {
      const res = await axios.get('/api/students', { params: { limit: 1000 } });
      const activeStaff = (res.data.students || []).filter(s => s.isActive && s._id !== user?.nodalOfficer?._id);
      setNodalStaff(activeStaff);
    } catch (err) {
      toast.error("Failed to load staff list.");
    }
  };

  const requestNodalOtp = async () => {
    if (!selectedNodal) return toast.error("Please select a new Nodal Officer first.");
    setOtpLoading(true);
    try {
      await axios.post('/api/organization/change-nodal-officer/request-otp', {
        newNodalOfficerId: selectedNodal._id
      });
      toast.success("OTP sent to your registered email address.");
      setNodalStep(2);
      setOtpTimer(60); // 60s cooldown
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to request OTP.");
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyNodalOtp = async () => {
    if (nodalOtp.length < 6) return toast.error("Please enter a valid 6-digit OTP.");
    setOtpLoading(true);
    try {
      await axios.post('/api/organization/change-nodal-officer/verify-otp', {
        otp: nodalOtp
      });
      toast.success("Nodal Officer updated successfully!");
      setShowNodalModal(false);
      // Trigger a re-fetch or reload to get updated profile (assuming context update logic doesn't refresh automatically)
      window.location.reload(); 
    } catch (err) {
      toast.error(err.response?.data?.message || "Invalid OTP or request failed.");
    } finally {
      setOtpLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        phone: user.phone || "",
        address: user.address || {
          street: "",
          city: "",
          state: "",
          zipCode: "",
          country: "",
        },
        latitude: user.location?.latitude || "",
        longitude: user.location?.longitude || "",
      });
      setDepartments(user.departments || []);
      setClasses(user.classes || []);
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setFormData((prev) => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddDepartment = () => {
    if (newDepartment.trim() && !departments.includes(newDepartment.trim())) {
      setDepartments((prev) => [...prev, newDepartment.trim()]);
      setNewDepartment("");
    }
  };

  const handleRemoveDepartment = (departmentToRemove) => {
    setDepartments((prev) =>
      prev.filter((dept) => dept !== departmentToRemove)
    );
  };

  const handleAddClass = () => {
    if (newClass.trim() && !classes.includes(newClass.trim())) {
      setClasses((prev) => [...prev, newClass.trim()]);
      setNewClass("");
    }
  };

  const handleRemoveClass = (classToRemove) => {
    setClasses((prev) => prev.filter((cls) => cls !== classToRemove));
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData((prev) => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }));
        },
        (error) => {
          console.error("Error getting location:", error);
          toast.error("Failed to get current location");
        }
      );
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateProfile(formData);
      setEditing(false);
      toast.success("Profile updated successfully");
    } catch (error) {
      console.error("Profile update error:", error);
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await updatePassword(
        passwordData.currentPassword,
        passwordData.newPassword
      );
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Password updated successfully");
    } catch (error) {
      console.error("Password update error:", error);
      toast.error("Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.put("/api/organization/departments", {
        departments: departments,
      });

      // Update the user context with new departments
      if (response.data.success) {
        // You might need to update the auth context to refresh user data
        toast.success("Departments updated successfully");
        setEditingDepartments(false);
      }
    } catch (error) {
      console.error("Departments update error:", error);
      toast.error("Failed to update departments");
    } finally {
      setLoading(false);
    }
  };

  const handleClassesSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.put("/api/organization/classes", {
        classes: classes,
      });

      if (response.data.success) {
        toast.success("Classes updated successfully");
        setEditingClasses(false);
      }
    } catch (error) {
      console.error("Classes update error:", error);
      toast.error("Failed to update classes");
    } finally {
      setLoading(false);
    }
  };

  const getOrganizationTypeLabel = () => {
    switch (user?.organizationType) {
      case "school":
        return "School";
      case "institute":
        return "Institute";
      case "private_company":
        return "Private Company";
      case "government_office":
        return "Government Office";
      default:
        return "Organization";
    }
  };

  const handleOrganizationUpdate = (updatedOrganization) => {
    updateProfile(updatedOrganization);
  };

  const formatDate = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const goToReportsRange = (hoursBack) => {
    const now = new Date();
    const start = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    const startDate = formatDate(start);
    const endDate = formatDate(now);
    navigate(`/reports?startDate=${startDate}&endDate=${endDate}`);
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 overflow-hidden sm:space-y-8">
      {/* Premium Gradient Header Card */}
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
        
        <div className="relative z-10 flex flex-col items-start gap-4 sm:items-center md:flex-row md:gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/20 text-2xl font-extrabold shadow-inner backdrop-blur-md sm:h-20 sm:w-20 sm:text-3xl">
            {user?.name?.[0]?.toUpperCase() || 'O'}
          </div>
          <div className="min-w-0 flex-1 text-left md:text-left">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="max-w-full break-words text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{user?.name}</h1>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-sm border border-white/10">
                {getOrganizationTypeLabel()}
              </span>
            </div>
            <p className="mt-2 text-sm text-emerald-100/90 font-medium">
              Anuvadini Node ID: <span className="font-mono text-amber-300 font-bold">{user?._id || user?.id || 'N/A'}</span>
            </p>
            <div className="mt-4 flex flex-col gap-2 text-xs font-semibold text-white/90 sm:flex-row sm:flex-wrap sm:gap-4">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-amber-300" /> Size: {user?.organizationSize}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-amber-300" /> {user?.phone || 'No phone'}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-amber-300" /> Lat: {formData.latitude || '—'}, Lng: {formData.longitude || '—'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Shine sweep */}
        <span className="shine-overlay-anuvadini rounded-3xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Basic Information Form */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-elevation-1 dark:border-slate-800/60 dark:bg-slate-900 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              Basic Information
            </h3>
            <Button
              variant={editing ? "outline" : "primary"}
              size="sm"
              icon={editing ? X : Edit3}
              onClick={() => setEditing(!editing)}
              className={!editing ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
            >
              {editing ? 'Cancel' : 'Edit'}
            </Button>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Organization Type
                </label>
                <div className="flex h-10 items-center rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 border border-slate-100 dark:border-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <Building2 className="h-4 w-4 text-emerald-500 mr-2" />
                  {getOrganizationTypeLabel()}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Organization Size
                </label>
                <div className="flex h-10 items-center rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 border border-slate-100 dark:border-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <Users className="h-4 w-4 text-emerald-500 mr-2" />
                  <span>
                    {user?.organizationSize === "small" && "Small (1-50 employees)"}
                    {user?.organizationSize === "medium" && "Medium (51-200 employees)"}
                    {user?.organizationSize === "large" && "Large (201-1000 employees)"}
                    {user?.organizationSize === "enterprise" && "Enterprise (1000+ employees)"}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                disabled={!editing}
                required
                className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  disabled={!editing}
                  required
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 pl-10 pr-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
              <div>
                <label htmlFor="latitude" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Latitude
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    id="latitude"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleInputChange}
                    disabled={!editing}
                    required
                    className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 pl-4 pr-10 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
                  />
                  {editing && (
                    <button
                      type="button"
                      onClick={getCurrentLocation}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-emerald-600 transition-colors"
                      title="Get coordinates via GPS"
                    >
                      <MapPin className="h-4.5 w-4.5 text-emerald-500" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="longitude" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  id="longitude"
                  name="longitude"
                  value={formData.longitude}
                  onChange={handleInputChange}
                  disabled={!editing}
                  required
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
                />
              </div>
            </div>

            <div>
              <label htmlFor="address.street" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Street Address
              </label>
              <input
                type="text"
                id="address.street"
                name="address.street"
                value={formData.address.street}
                onChange={handleInputChange}
                disabled={!editing}
                className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
              <div>
                <label htmlFor="address.city" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  City
                </label>
                <input
                  type="text"
                  id="address.city"
                  name="address.city"
                  value={formData.address.city}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
                />
              </div>
              <div>
                <label htmlFor="address.state" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  State
                </label>
                <input
                  type="text"
                  id="address.state"
                  name="address.state"
                  value={formData.address.state}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
              <div>
                <label htmlFor="address.zipCode" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  ZIP Code
                </label>
                <input
                  type="text"
                  id="address.zipCode"
                  name="address.zipCode"
                  value={formData.address.zipCode}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
                />
              </div>
              <div>
                <label htmlFor="address.country" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  id="address.country"
                  name="address.country"
                  value={formData.address.country}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/30"
                />
              </div>
            </div>

            {editing && (
              <div className="flex justify-stretch pt-2 sm:justify-end">
                <Button type="submit" loading={loading} icon={Save} className="w-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 sm:w-auto">
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            )}
          </form>
        </div>

        {/* Right Columns: Reports, Departments/Classes, password */}
        <div className="space-y-6">

          {/* Premium Nodal Officer Card */}
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/5 via-teal-900/5 to-slate-900/5 dark:from-emerald-900/20 dark:via-teal-900/10 dark:to-slate-900/20 p-6 shadow-[0_8px_30px_rgb(16,185,129,0.05)] dark:shadow-[0_8px_30px_rgb(16,185,129,0.02)] backdrop-blur-2xl group transition-all duration-500 hover:border-emerald-500/40">
            {/* Animated Glow Elements */}
            <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 blur-[80px] transition-all duration-700 group-hover:scale-110 group-hover:bg-emerald-500/20"></div>
            <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-teal-500/10 dark:bg-teal-500/20 blur-[80px] transition-all duration-700 group-hover:scale-110"></div>
            
            <div className="relative z-10 flex items-center justify-between mb-6 pb-5 border-b border-emerald-500/10">
              <div className="flex items-center gap-3.5">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/30 overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%,100%_100%] bg-[position:-100%_0,0_0] bg-no-repeat group-hover:animate-shine"></div>
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
                    Nodal Officer
                  </h3>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Security & Compliance</p>
                </div>
              </div>
              <button
                onClick={handleOpenNodalModal}
                className="group/btn relative flex items-center gap-2 overflow-hidden rounded-full bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shadow-sm transition-all duration-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-md hover:shadow-emerald-500/10 hover:-translate-y-0.5 active:translate-y-0"
              >
                <RefreshCw className="h-3.5 w-3.5 transition-transform duration-500 group-hover/btn:rotate-180" />
                <span>Change Officer</span>
              </button>
            </div>
            
            <div className="relative z-10 flex items-center gap-5 p-5 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-white/80 dark:border-slate-700/50 backdrop-blur-md transition-all duration-300 hover:bg-white/80 dark:hover:bg-slate-900/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] dark:shadow-none">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-emerald-400 blur-md opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-slate-100 to-white dark:from-slate-800 dark:to-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 z-10">
                  <UserCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                {user?.nodalOfficer && (
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 z-20 flex items-center justify-center">
                     <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-black text-slate-900 dark:text-white truncate tracking-tight">
                  {user?.nodalOfficer?.fullName || "Not Assigned"}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`relative flex h-2 w-2 rounded-full ${user?.nodalOfficer ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${user?.nodalOfficer ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                  </span>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {user?.nodalOfficer?.designation || (user?.nodalOfficer ? "Nodal Officer" : "Action Required: Assign Officer")}
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Quick Reports Card */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-elevation-1 dark:border-slate-800/60 dark:bg-slate-900 sm:p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              Quick Reports
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Select a time range to view and analyze your organization's attendance.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              <button
                type="button"
                onClick={() => goToReportsRange(24)}
                className="group flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 p-4 text-center text-white shadow shadow-indigo-500/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-500/30"
              >
                <div className="rounded-xl bg-white/20 p-2.5 transition-transform group-hover:scale-110">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <span className="mt-3 text-xs font-bold">24 Hours</span>
              </button>
              <button
                type="button"
                onClick={() => goToReportsRange(24 * 7)}
                className="group flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-center text-white shadow shadow-emerald-500/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/30"
              >
                <div className="rounded-xl bg-white/20 p-2.5 transition-transform group-hover:scale-110">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <span className="mt-3 text-xs font-bold">Last Week</span>
              </button>
              <button
                type="button"
                onClick={() => goToReportsRange(24 * 30)}
                className="group flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-4 text-center text-white shadow shadow-amber-500/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-500/30"
              >
                <div className="rounded-xl bg-white/20 p-2.5 transition-transform group-hover:scale-110">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <span className="mt-3 text-xs font-bold">Last Month</span>
              </button>
            </div>
          </div>

          {/* Departments management (for private_company) */}
          {user.organizationType === "private_company" && (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-elevation-1 dark:border-slate-800/60 dark:bg-slate-900 sm:p-6">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Departments
                </h3>
                <Button
                  variant={editingDepartments ? "outline" : "primary"}
                  size="sm"
                  icon={editingDepartments ? X : Edit3}
                  onClick={() => setEditingDepartments(!editingDepartments)}
                  className={!editingDepartments ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                >
                  {editingDepartments ? 'Cancel' : 'Edit'}
                </Button>
              </div>

              <form onSubmit={handleDepartmentsSubmit} className="space-y-4">
                {editingDepartments ? (
                  <>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={newDepartment}
                        onChange={(e) => setNewDepartment(e.target.value)}
                        placeholder="Enter department name"
                        className="input flex-1 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddDepartment();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={handleAddDepartment}
                        icon={Plus}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        aria-label="Add department"
                      />
                    </div>
                    {departments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {departments.map((dept) => (
                          <span
                            key={dept}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40"
                          >
                            {dept}
                            <button
                              type="button"
                              onClick={() => handleRemoveDepartment(dept)}
                              className="ml-1 text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-200"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-stretch sm:justify-end">
                      <Button type="submit" loading={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {loading ? 'Saving...' : 'Save Departments'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div>
                    {departments.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {departments.map((dept) => (
                          <span
                            key={dept}
                            className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60 shadow-sm"
                          >
                            {dept}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={Building2}
                        title="No departments yet"
                        message="Add departments to organize your staff."
                        className="py-6 bg-slate-50 dark:bg-slate-800/40 rounded-xl"
                      />
                    )}
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Classes management (for school/institute) */}
          {(user.organizationType === "school" || user.organizationType === "institute") && (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-elevation-1 dark:border-slate-800/60 dark:bg-slate-900 sm:p-6">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Classes</h3>
                <Button
                  variant={editingClasses ? "outline" : "primary"}
                  size="sm"
                  icon={editingClasses ? X : Edit3}
                  onClick={() => setEditingClasses(!editingClasses)}
                  className={!editingClasses ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                >
                  {editingClasses ? 'Cancel' : 'Edit'}
                </Button>
              </div>

              <form onSubmit={handleClassesSubmit} className="space-y-4">
                {editingClasses ? (
                  <>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={newClass}
                        onChange={(e) => setNewClass(e.target.value)}
                        placeholder="Enter class name"
                        className="input flex-1 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddClass();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={handleAddClass}
                        icon={Plus}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        aria-label="Add class"
                      />
                    </div>
                    {classes.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {classes.map((cls) => (
                          <span
                            key={cls}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40"
                          >
                            {cls}
                            <button
                              type="button"
                              onClick={() => handleRemoveClass(cls)}
                              className="ml-2 text-emerald-600 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-stretch sm:justify-end">
                      <Button type="submit" loading={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {loading ? 'Saving...' : 'Save Classes'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div>
                    {classes.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {classes.map((cls) => (
                          <span
                            key={cls}
                            className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60 shadow-sm"
                          >
                            {cls}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={Building2}
                        title="No classes yet"
                        message="Add classes to organize your students."
                        className="py-6 bg-slate-50 dark:bg-slate-800/40 rounded-xl"
                      />
                    )}
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Bureau Management */}
          <BureauManagement
            organization={user}
            onUpdate={handleOrganizationUpdate}
          />

          {/* Change Password Card */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-elevation-1 dark:border-slate-800/60 dark:bg-slate-900 sm:p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              Change Password
            </h3>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="currentPassword" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="currentPassword"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    required
                    className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  New Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  id="newPassword"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  required
                  minLength={6}
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Confirm New Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  required
                  minLength={6}
                  className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/30 px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-stretch pt-2 sm:justify-end">
                <Button type="submit" loading={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 w-full md:w-auto">
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Clean Nodal Officer Modal */}
      {showNodalModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">
                  Change Nodal Officer
                </h3>
              </div>
              <button 
                onClick={() => setShowNodalModal(false)}
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {nodalStep === 1 ? (
                <div className="space-y-5">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Select a staff member to assign as the Nodal Officer. They will have elevated administrative access.
                  </p>
                  
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Search by name, UID, or email..."
                      value={nodalSearch}
                      onChange={(e) => setNodalSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800">
                    {nodalStaff.filter(s => 
                      (s.fullName || '').toLowerCase().includes(nodalSearch.toLowerCase()) || 
                      (s.email || '').toLowerCase().includes(nodalSearch.toLowerCase()) || 
                      (s.uid || '').toLowerCase().includes(nodalSearch.toLowerCase())
                    ).length > 0 ? (
                      nodalStaff.filter(s => 
                        (s.fullName || '').toLowerCase().includes(nodalSearch.toLowerCase()) || 
                        (s.email || '').toLowerCase().includes(nodalSearch.toLowerCase()) || 
                        (s.uid || '').toLowerCase().includes(nodalSearch.toLowerCase())
                      ).map(staff => (
                        <div 
                          key={staff._id} 
                          onClick={() => setSelectedNodal(staff)}
                          className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${selectedNodal?._id === staff._id ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${selectedNodal?._id === staff._id ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                            {selectedNodal?._id === staff._id ? <CheckCircle className="h-5 w-5" /> : (staff.fullName?.[0] || 'U')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${selectedNodal?._id === staff._id ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                              {staff.fullName}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {staff.designation || 'Staff'} • {staff.uid}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                        <Search className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No staff members found</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowNodalModal(false)}
                      className="px-5 py-2 text-sm"
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="primary" 
                      className={`px-6 py-2 text-sm ${!selectedNodal ? 'opacity-50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                      onClick={requestNodalOtp}
                      disabled={!selectedNodal || otpLoading}
                      loading={otpLoading}
                    >
                      {otpLoading ? 'Sending...' : 'Continue'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-4">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">Security Verification</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      Enter the 6-digit verification code sent to your email to authorize <strong className="text-slate-700 dark:text-slate-200">{selectedNodal?.fullName}</strong>.
                    </p>
                  </div>

                  <div className="max-w-xs mx-auto">
                    <input 
                      type="text"
                      maxLength={6}
                      placeholder="••••••"
                      value={nodalOtp}
                      onChange={(e) => setNodalOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full text-center text-3xl tracking-[0.5em] font-bold rounded-xl border border-slate-200 bg-slate-50 py-3 outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex justify-center items-center h-6">
                    {otpTimer > 0 ? (
                      <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                        <Timer className="h-3.5 w-3.5" /> 
                        Code expires in {Math.floor(otpTimer / 60)}:{(otpTimer % 60).toString().padStart(2, '0')}
                      </p>
                    ) : (
                      <button 
                        onClick={requestNodalOtp} 
                        disabled={otpLoading}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${otpLoading ? 'animate-spin' : ''}`} /> 
                        Resend Code
                      </button>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setNodalStep(1)}
                      className="px-4 py-2 text-sm text-slate-600"
                    >
                      Back
                    </Button>
                    <Button 
                      variant="primary" 
                      className={`px-6 py-2 text-sm ${nodalOtp.length < 6 ? 'opacity-50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                      onClick={verifyNodalOtp}
                      disabled={nodalOtp.length < 6 || otpLoading}
                      loading={otpLoading}
                    >
                      {otpLoading ? 'Verifying...' : 'Verify'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Profile; 