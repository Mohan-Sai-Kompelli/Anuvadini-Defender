import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Users as UsersIcon,
  ToggleLeft,
  ToggleRight,
  SlidersHorizontal,
  Mail,
  Info,
  ChevronDown,
  AlertCircle,
  Loader2,
  Camera
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext';
import Webcam from 'react-webcam';
import { ReactMic } from 'react-mic';
import { Button, ConfirmDialog, EmptyState, Skeleton, SkeletonTable } from '../components/ui';


const DirectorySelect = ({ value, options, onChange, placeholder = 'Select', className = '' }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div
      className={`relative min-w-0 ${open ? 'z-[140]' : 'z-0'} ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[2.75rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/20 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 shadow-sm outline-none transition-all hover:border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
                <div
          className="absolute left-0 right-0 top-full z-[999] mt-1 max-h-[min(18rem,45vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          role="listbox"
          data-lenis-prevent
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          {options.map((option) => (
            <button
              key={option.value || '__all'}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
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

// Face is the only supported attendance method, so a thin enrollment (1-2
// photos) has no redundancy against a single bad crop/angle getting rejected
// server-side — require enough images up front for a reliable embedding.
const MIN_FACE_IMAGES = 5;

const PARTICLES = Array.from({ length: 20 }).map((_, i) => ({
  w: 1 + (i % 3) * 0.8,
  l: `${(i * 53) % 100}%`,
  t: `${(i * 71) % 100}%`,
  dur: `${5 + (i % 5)}s`,
  delay: `${(i * 0.15) % 3}s`,
}));

const Students = () => {
  const { user, userType, viewAsOrg } = useAuth();
  const readOnly = userType === 'superadmin' && !!viewAsOrg;
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState(['Administration', 'Engineering', 'Operations']);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedBureau, setSelectedBureau] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    age: '',
    gender: '',
    uid: '',
    class: '',
    department: '',
    role: 'faculty',
    designation: '',
    bureau: '',
    selectedBiometrics: {
      face: true
    },
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: ''
    }
  });

  const [files, setFiles] = useState({
    faceImages: [],
    voiceSample: null,
    fingerprintImage: null,
    irisImage: null,
    palmImage: null
  });
  const [rejectedImages, setRejectedImages] = useState([]);

  const [webcamModal, setWebcamModal] = useState({ open: false, type: '' });
  // getUserMedia negotiation + first decoded frame takes a beat after <Webcam>
  // mounts. Capturing before that returns getScreenshot() === null — this used
  // to be a silent no-op (button did nothing, no feedback at all). Mirrors the
  // same fix applied to the public self-registration page (PublicRegister.js).
  const [cameraReady, setCameraReady] = useState(false);
  const [justCaptured, setJustCaptured] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState(null);
  const webcamRef = useRef(null);

  const handleVoiceStop = (recordedData) => {
    setVoiceBlob(recordedData.blob);
    setFiles(prev => ({
      ...prev,
      voiceSample: new File([recordedData.blob], 'voice.wav', { type: 'audio/wav' })
    }));
  };

  // Face is the only supported attendance method.
  const biometricOptions = [
    { key: 'face', label: 'Face Recognition', icon: '👤' },
  ];

  useEffect(() => {
    fetchStudents();
  }, [currentPage, searchTerm, selectedClass, selectedDepartment, selectedBureau, selectedStatus]);

  useEffect(() => {
    const fetchOrgDetails = async () => {
      try {
        const { data } = await axios.get('/api/auth/me');
        if (data.success && data.organization) {
          const orgDepts = data.organization.departments || [];
          if (orgDepts.length > 0) {
            setDepartments(orgDepts);
          }
        }
      } catch (err) {
        console.error('Error fetching organization details:', err);
      }
    };
    fetchOrgDetails();
  }, []);

  const fetchStudents = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: 10,
        ...(searchTerm && { search: searchTerm }),
        ...(selectedClass && { class: selectedClass }),
        ...(selectedDepartment && { department: selectedDepartment }),
        ...(selectedBureau && { bureau: selectedBureau }),
        ...(selectedStatus !== '' && { isActive: selectedStatus })
      });

      const response = await axios.get(`/api/students?${params}`);
      setStudents(response.data.students);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleBiometricChange = (key) => {
    setFormData(prev => ({
      ...prev,
      selectedBiometrics: {
        ...prev.selectedBiometrics,
        [key]: !prev.selectedBiometrics[key]
      }
    }));
  };

  const onDrop = (acceptedFiles, fieldName) => {
    if (fieldName === 'faceImages') {
      setFiles(prev => ({
        ...prev,
        faceImages: [...prev.faceImages, ...acceptedFiles]
      }));
      setRejectedImages([]);
      toast.success(`${acceptedFiles.length} face image(s) uploaded`);
    } else {
      if (acceptedFiles.length > 0) {
        setFiles(prev => ({
          ...prev,
          [fieldName]: acceptedFiles[0]
        }));
        toast.success(`${fieldName} file uploaded successfully`);
      }
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (files) => onDrop(files, 'faceImages'),
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    multiple: true
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.selectedBiometrics.face) {
      const faceCount = files.faceImages.length;
      if (!editingStudent && faceCount === 0) {
        toast.error(`Please upload at least ${MIN_FACE_IMAGES} face images for face recognition`);
        return;
      }
      if (faceCount > 0 && faceCount < MIN_FACE_IMAGES) {
        toast.error(`Please upload at least ${MIN_FACE_IMAGES} face images (currently ${faceCount}) for reliable recognition`);
        return;
      }
    }

    try {
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        if (key === 'address') {
          formDataToSend.append(key, JSON.stringify(formData[key]));
        } else if (key === 'selectedBiometrics') {
          formDataToSend.append('selectedBiometrics', JSON.stringify(formData[key]));
        } else {
          formDataToSend.append(key, formData[key]);
        }
      });

      files.faceImages.forEach((img) => {
        formDataToSend.append('faceImages', img);
      });

      Object.keys(files).forEach(key => {
        if (key !== 'faceImages' && files[key]) {
          formDataToSend.append(key, files[key]);
        }
      });

      if (editingStudent) {
        await axios.put(`/api/students/${editingStudent._id}`, formDataToSend);
        toast.success('Staff member updated successfully');
      } else {
        await axios.post('/api/students', formDataToSend);
        toast.success('Staff member created successfully');
      }

      setShowModal(false);
      resetForm();
      fetchStudents();
    } catch (error) {
      console.error('Error saving student:', error);
      const perImage = error.response?.data?.security?.perImage;
      if (Array.isArray(perImage)) {
        const rejectedIndices = [];
        perImage.forEach((imgData, idx) => {
          if (imgData.status !== 'usable') {
            rejectedIndices.push(idx);
          }
        });
        setRejectedImages(rejectedIndices);
        // Specific, actionable count instead of a generic error — tells the
        // admin exactly how many of the captured photos need a retake.
        const usableCount = perImage.length - rejectedIndices.length;
        toast.error(`${usableCount}/${perImage.length} photos were acceptable. Retake the ones circled in red.`, { duration: 6000 });
      } else {
        setRejectedImages([]);
        const errorMessage = error.response?.data?.message ||
          (error.response?.data?.errors && Array.isArray(error.response.data.errors) ?
            error.response.data.errors.join(', ') :
            error.response?.data?.errors) ||
          'Failed to save student';
        toast.error(errorMessage);
      }
    }
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    setFormData({
      fullName: student.fullName,
      email: student.email || '',
      age: student.age,
      gender: student.gender,
      uid: student.uid,
      class: student.class || '',
      department: student.department || '',
      role: student.role || 'faculty',
      designation: student.designation || '',
      selectedBiometrics: student.selectedBiometrics || {
        face: true
      },
      address: student.address || {}
    });
    setShowModal(true);
  };

  const handleDelete = (student) => {
    setDeleteTarget(student);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/students/${deleteTarget._id}`);
      toast.success('Staff member deleted successfully');
      setDeleteTarget(null);
      fetchStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('Failed to delete student');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (studentId) => {
    try {
      await axios.patch(`/api/students/${studentId}/status`);
      toast.success('Staff status updated successfully');
      fetchStudents();
    } catch (error) {
      console.error('Error updating student status:', error);
      toast.error('Failed to update student status');
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      age: '',
      gender: '',
      uid: '',
      class: '',
      department: '',
      role: 'faculty',
      designation: '',
      selectedBiometrics: {
        face: true
      },
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      }
    });
    setFiles({
      faceImages: [],
      voiceSample: null,
      fingerprintImage: null,
      irisImage: null,
      palmImage: null
    });
    setRejectedImages([]);
    setEditingStudent(null);
  };

  const openModal = () => {
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const getOrganizationTypeLabel = () => {
    switch (user?.organizationType) {
      case 'school': return 'Class';
      case 'institute': return 'Class';
      case 'private_company': return 'Department';
      case 'government_office': return 'Bureau';
      default: return 'Class';
    }
  };

  const getOrganizationOptions = () => {
    if (user?.organizationType === 'school' || user?.organizationType === 'institute') {
      return user?.classes || [];
    } else if (user?.organizationType === 'private_company') {
      return user?.departments || [];
    } else if (user?.organizationType === 'government_office') {
      return user?.bureaus || [];
    }
    return [];
  };

  const handleWebcamCapture = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      // getScreenshot() returns null if the video frame isn't decoded yet —
      // this used to be a silent no-op (button did nothing, no feedback).
      // Same fix as the public self-registration page.
      toast.error('Camera is still starting up — wait a second and try again.');
      return;
    }
    const captureType = webcamModal.type;
    fetch(imageSrc)
      .then(res => res.blob())
      .then(blob => {
        if (captureType === 'face') {
          // Face allows MULTIPLE shots per session (min. MIN_FACE_IMAGES, admin
          // flow permits extra for a richer embedding) — keep the modal open so
          // the admin can capture several without reopening it each time.
          setFiles(prev => ({
            ...prev,
            faceImages: [...prev.faceImages, new File([blob], `face_${Date.now()}.jpg`, { type: 'image/jpeg' })]
          }));
          setRejectedImages([]);
          setJustCaptured(true);
          setTimeout(() => setJustCaptured(false), 450);
        } else if (captureType === 'iris' || captureType === 'palm') {
          // Single-shot biometrics — was previously ALWAYS written into
          // faceImages regardless of capture type (a pre-existing bug: live
          // iris/palm capture silently corrupted the face-image set instead of
          // populating irisImage/palmImage). Route to the correct field and
          // close the modal, since only one shot is needed.
          const fieldKey = captureType === 'iris' ? 'irisImage' : 'palmImage';
          setFiles(prev => ({
            ...prev,
            [fieldKey]: new File([blob], `${captureType}_${Date.now()}.jpg`, { type: 'image/jpeg' })
          }));
          setWebcamModal({ open: false, type: '' });
          toast.success(`${captureType === 'iris' ? 'Iris' : 'Palm'} image captured`);
        }
      });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={8} cols={7} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner Card */}
      <div
        className="relative overflow-hidden rounded-3xl"
        style={{
          background: 'linear-gradient(135deg, #0B1220 0%, #101827 35%, #315CE8 65%, #0B1220 100%)',
          minHeight: 180,
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

        {/* Main content */}
        <div className="relative z-10 px-4 py-6 md:px-8 md:py-8 text-white">
          <div className="relative flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left animate-slide-up" style={{ animationDelay: '0.05s' }}>
              <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none"
                style={{ fontFamily: "'Geist', 'Inter', sans-serif", letterSpacing: '-0.025em' }}>
                Faculty &amp; Staff Directory
              </h1>
              <p className="mt-3.5 text-sm text-emerald-100/70 max-w-xl">
                Manage medical faculties, HODs, doctors, and auxiliary staff profiles and their corresponding biometrics credentials.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto shrink-0">
              <button
                onClick={() => navigate('/students-details')}
                className="w-full sm:w-auto flex justify-center items-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur-sm hover:bg-white/20 transition-all shadow-md"
              >
                Detailed List View
              </button>
              <button
                onClick={openModal}
                disabled={readOnly}
                title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                className={`w-full sm:w-auto flex justify-center items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-extrabold text-emerald-700 shadow-lg hover:bg-slate-50 transition-all ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Plus className="h-4.5 w-4.5" />
                Add Staff
              </button>
            </div>
          </div>
        </div>

        {/* Shine sweep */}
        <span className="shine-overlay-anuvadini rounded-3xl" />
      </div>

      {/* Styled Filters card */}
      <div className="relative overflow-visible rounded-2xl border border-slate-200/80 bg-white p-4 shadow-elevation-1 dark:border-slate-800/60 dark:bg-slate-900 sm:p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
          <SlidersHorizontal className="h-4.5 w-4.5 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Search &amp; Filters</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Search Staff</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name or UID..."
                className="input w-full rounded-xl border border-slate-200/80 bg-slate-50/20 pl-10 pr-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">{getOrganizationTypeLabel()}</label>
            <DirectorySelect
              value={
                user?.organizationType === 'school' || user?.organizationType === 'institute'
                  ? selectedClass
                  : user?.organizationType === 'private_company'
                    ? selectedDepartment
                    : selectedBureau
              }
              onChange={(next) => {
                if (user?.organizationType === 'school' || user?.organizationType === 'institute') {
                  setSelectedClass(next);
                } else if (user?.organizationType === 'private_company') {
                  setSelectedDepartment(next);
                } else {
                  setSelectedBureau(next);
                }
                setCurrentPage(1);
              }}
              placeholder={`All ${getOrganizationTypeLabel()}s`}
              options={[
                { value: '', label: `All ${getOrganizationTypeLabel()}s` },
                ...getOrganizationOptions().map((option) => ({ value: option, label: option })),
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Status</label>
            <DirectorySelect
              value={selectedStatus}
              onChange={(next) => {
                setSelectedStatus(next);
                setCurrentPage(1);
              }}
              placeholder="All Status"
              options={[
                { value: '', label: 'All Status' },
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedClass('');
                setSelectedDepartment('');
                setSelectedBureau('');
                setSelectedStatus('');
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Main Staff Directory Table Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-slate-900 shadow-elevation-1">
        {students.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={UsersIcon}
              title="No staff records found"
              message="Register a new faculty or adjust your filters to locate personnel logs."
              action={
                <Button onClick={openModal} icon={Plus} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Add Staff Member
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-900/50 dark:border-slate-800">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Staff Member</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">UID</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Department</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Age</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Gender</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">System Status</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {students.map((student) => (
                  <tr key={student._id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-750 dark:text-emerald-400">
                          {student.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4 min-w-0">
                          <button
                            onClick={() => navigate(`/student-report/${student._id}`)}
                            className="text-sm font-bold text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-450 text-left truncate block"
                          >
                            {student.fullName}
                          </button>
                          <p className="text-xs text-slate-450 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                            <Mail className="h-3 w-3" /> {student.email || 'No email registered'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-200">
                      {student.uid}
                    </td>

                    <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-200">
                      {student.department || 'N/A'}
                    </td>

                    <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-200">
                      {student.age}
                    </td>

                    <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-200 capitalize">
                      {student.gender}
                    </td>

                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(student._id)}
                        disabled={readOnly}
                        title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${student.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40'
                            : 'bg-slate-50 text-slate-400 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-500 dark:border-slate-800'
                          } ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {student.isActive ? (
                          <>
                            <ToggleRight className="h-4.5 w-4.5" />
                            Active
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-4.5 w-4.5" />
                            Inactive
                          </>
                        )}
                      </button>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(student)}
                          disabled={readOnly}
                          title={readOnly ? "Editing is disabled in Read-Only Mode." : `Edit ${student.fullName}`}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition-colors ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
                          aria-label={`Edit ${student.fullName}`}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(student)}
                          disabled={readOnly}
                          title={readOnly ? "Editing is disabled in Read-Only Mode." : `Delete ${student.fullName}`}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-450 transition-colors ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
                          aria-label={`Delete ${student.fullName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Panel */}
        {students.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete staff member record?"
        message={
          deleteTarget
            ? `Are you sure you want to permanently delete the profile of ${deleteTarget.fullName} and their registered biometric datasets? This action cannot be undone.`
            : ''
        }
        confirmLabel="Confirm Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />

      {/* Glassmorphic Add/Edit Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden p-0 sm:items-center sm:p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={closeModal} />

          <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-elevation-4 animate-in fade-in slide-in-from-bottom-2 duration-200 dark:border-slate-800 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-3xl sm:zoom-in-95">
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50 sm:px-6 sm:py-5">
              <div className="flex items-center gap-2">
                <UsersIcon className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 sm:text-lg">
                  {editingStudent ? 'Edit Staff Member Parameters' : 'Register New Faculty/Staff'}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:space-y-6 sm:p-6" data-lenis-prevent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Full Name *</label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      required
                      className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none"
                      placeholder="Enter full name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Staff UID / Employee Code *</label>
                    <input
                      type="text"
                      name="uid"
                      value={formData.uid}
                      onChange={handleInputChange}
                      required
                      className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none"
                      placeholder="e.g. EMP12938"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Email Address *</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none"
                      placeholder="name@institution.edu"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Age *</label>
                    <input
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleInputChange}
                      required
                      min="18"
                      max="120"
                      className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none"
                      placeholder="e.g. 35"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:col-span-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Gender *</label>
                                            <DirectorySelect
                        value={formData.gender}
                        onChange={(next) => setFormData((prev) => ({ ...prev, gender: next }))}
                        placeholder="Select Gender"
                        options={[
                          { value: '', label: 'Select Gender' },
                          { value: 'male', label: 'Male' },
                          { value: 'female', label: 'Female' },
                          { value: 'other', label: 'Other' },
                        ]}
                      />
                    </div>

                    {getOrganizationOptions().length > 0 && (
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          {getOrganizationTypeLabel()} *
                        </label>
                                                <DirectorySelect
                          value={
                            user?.organizationType === 'school' || user?.organizationType === 'institute'
                              ? formData.class
                              : user?.organizationType === 'private_company'
                                ? formData.department
                                : formData.bureau
                          }
                          onChange={(next) => {
                            const key = user?.organizationType === 'school' || user?.organizationType === 'institute'
                              ? 'class'
                              : user?.organizationType === 'private_company'
                                ? 'department'
                                : 'bureau';
                            setFormData((prev) => ({ ...prev, [key]: next }));
                          }}
                          placeholder={`Select ${getOrganizationTypeLabel()}`}
                          options={[
                            { value: '', label: `Select ${getOrganizationTypeLabel()}` },
                            ...getOrganizationOptions().map((option) => ({ value: option, label: option })),
                          ]}
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:col-span-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Department *
                      </label>
                                            <DirectorySelect
                        value={formData.department}
                        onChange={(next) => setFormData((prev) => ({ ...prev, department: next }))}
                        placeholder="Select Department"
                        options={[
                          { value: '', label: 'Select Department' },
                          ...departments.map((department) => ({ value: department, label: department })),
                        ]}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Role *
                      </label>
                                            <DirectorySelect
                        value={formData.role}
                        onChange={(next) => setFormData((prev) => ({ ...prev, role: next }))}
                        placeholder="Select Role"
                        options={[
                          { value: 'faculty', label: 'Faculty' },
                          { value: 'staff', label: 'Staff' },
                          { value: 'hod', label: 'HOD' },
                        ]}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Designation</label>
                      <input
                        type="text"
                        name="designation"
                        value={formData.designation}
                        onChange={handleInputChange}
                        placeholder="e.g. Associate Professor"
                        className="input mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Biometric Checklist Section */}
                <div className="pt-3 border-t border-slate-150 dark:border-slate-800 space-y-3">
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Configure Biometric Authorization</span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {biometricOptions.map(option => {
                      const orgBiometrics = user?.selectedBiometrics || {};
                      const hasAnyBiometrics = Object.values(orgBiometrics).some(v => v);
                      const isEnabled = hasAnyBiometrics ? orgBiometrics[option.key] : true;

                      return (
                        <label
                          key={option.key}
                          className={`flex items-center justify-between p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer bg-slate-50/20 dark:bg-slate-900/40 select-none hover:border-slate-350 dark:hover:border-slate-750 transition-all ${!isEnabled ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl">{option.icon}</span>
                            <div>
                              <span className="block text-sm font-bold text-slate-800 dark:text-slate-200">{option.label}</span>
                              {!isEnabled && (
                                <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wide">Locked by Org Admin</span>
                              )}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={formData.selectedBiometrics[option.key]}
                            onChange={() => handleBiometricChange(option.key)}
                            disabled={!isEnabled}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/10 h-4.5 w-4.5 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>

                  {user?.selectedBiometrics && Object.values(user.selectedBiometrics).every(v => !v) && (
                    <p className="text-xs text-rose-500 font-bold flex items-center gap-1 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 p-2.5 rounded-xl">
                      <Info className="h-4 w-4 shrink-0" />
                      Warning: No biometric modes are currently enabled for this organization node.
                    </p>
                  )}
                </div>

                {/* Address Section */}
                <div className="pt-3 border-t border-slate-150 dark:border-slate-800 space-y-3">
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Postal Address Details</span>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Street Address</label>
                    <input
                      type="text"
                      name="address.street"
                      value={formData.address.street}
                      onChange={handleInputChange}
                      className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/10"
                      placeholder="Enter street"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">City</label>
                      <input
                        type="text"
                        name="address.city"
                        value={formData.address.city}
                        onChange={handleInputChange}
                        className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/10"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">State</label>
                      <input
                        type="text"
                        name="address.state"
                        value={formData.address.state}
                        onChange={handleInputChange}
                        className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/10"
                        placeholder="State"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">ZIP Code</label>
                      <input
                        type="text"
                        name="address.zipCode"
                        value={formData.address.zipCode}
                        onChange={handleInputChange}
                        className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/10"
                        placeholder="ZIP code"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Country</label>
                      <input
                        type="text"
                        name="address.country"
                        value={formData.address.country}
                        onChange={handleInputChange}
                        className="input w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/10"
                        placeholder="Country"
                      />
                    </div>
                  </div>
                </div>

              {/* Biometric files upload cards */}
              <div className="pt-3 border-t border-slate-150 dark:border-slate-800 space-y-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Enrollment Biometrics Data Upload</span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {biometricOptions.map(option => {
                    if (!formData.selectedBiometrics[option.key]) return null;
                    if (option.key === 'face') {
                      return (
                        <div key={option.key} className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center bg-slate-50/20 dark:bg-slate-900/50 flex flex-col justify-between min-h-[160px]">
                          <div>
                            <div className="text-xl mb-1">{option.icon}</div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{option.label}</p>
                          </div>
                          <div {...getRootProps()} className="my-2 cursor-pointer p-2 border-2 border-dotted rounded-xl bg-white dark:bg-slate-800 text-slate-400 border-slate-200 hover:border-emerald-500 transition-colors">
                            <input {...getInputProps()} />
                            <span className="text-[10px] font-semibold block leading-tight">Drag or click to choose pictures</span>
                          </div>
                          <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-150 dark:border-slate-700 dark:text-slate-300 transition-all"
                            onClick={() => { setCameraReady(false); setWebcamModal({ open: true, type: 'face' }); }}
                          >
                            Capture live face
                          </button>

                          <p className={`mt-1.5 text-[10px] font-bold ${files.faceImages.length >= MIN_FACE_IMAGES ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {files.faceImages.length}/{MIN_FACE_IMAGES} images {files.faceImages.length >= MIN_FACE_IMAGES ? '✓' : `(min. ${MIN_FACE_IMAGES} required)`}
                          </p>

                          {/* Quality-check result — set from server's security.perImage on a
                              failed save (see handleSubmit's catch block). Tells the admin
                              WHICH captures need retaking instead of a generic error. */}
                          {rejectedImages.length > 0 && (
                            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 px-2.5 py-2 text-left text-[10px] text-rose-700 dark:text-rose-400">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>
                                {files.faceImages.length - rejectedImages.length}/{files.faceImages.length} passed the quality check.
                                Remove and retake the ones circled in red (blurry, poorly lit, or failed liveness).
                              </span>
                            </div>
                          )}

                          {/* Previews */}
                          {files.faceImages.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5 justify-center">
                              {files.faceImages.map((img, idx) => {
                                const isRejected = rejectedImages.includes(idx);
                                return (
                                  <div key={idx} className="relative">
                                    <img
                                      src={URL.createObjectURL(img)}
                                      alt={`face-${idx}`}
                                      className={`w-10 h-10 object-cover rounded-lg border ${isRejected ? 'border-2 border-rose-500 ring-2 ring-rose-500/40' : 'border-slate-200'}`}
                                    />
                                    {isRejected && (
                                      <span className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
                                        <AlertCircle className="h-2.5 w-2.5" />
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 shadow-sm"
                                      onClick={() => {
                                        setFiles(prev => ({
                                          ...prev,
                                          faceImages: prev.faceImages.filter((_, i) => i !== idx)
                                        }));
                                        setRejectedImages([]);
                                      }}
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={option.key} className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center bg-slate-50/20 dark:bg-slate-900/50 flex flex-col justify-between min-h-[160px]">
                        <div>
                          <div className="text-xl mb-1">{option.icon}</div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{option.label}</p>
                        </div>

                        <div className="my-2 text-center">
                          <input
                            type="file"
                            id={`file-${option.key}`}
                            onChange={e => {
                              if (e.target.files[0]) {
                                onDrop([e.target.files[0]], `${option.key}${option.key === 'voice' ? 'Sample' : 'Image'}`);
                              }
                            }}
                            accept={option.key === 'voice' ? 'audio/wav' : 'image/*'}
                            className="hidden"
                          />
                          <label
                            htmlFor={`file-${option.key}`}
                            className="cursor-pointer inline-block rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 transition-colors"
                          >
                            Choose File
                          </label>
                          {files[`${option.key}${option.key === 'voice' ? 'Sample' : 'Image'}`] && (
                            <span className="block text-[10px] text-emerald-600 font-bold mt-1 truncate">
                              ✓ {files[`${option.key}${option.key === 'voice' ? 'Sample' : 'Image'}`].name}
                            </span>
                          )}
                        </div>

                        {['iris', 'palm'].includes(option.key) && (
                          <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-150 dark:border-slate-700 dark:text-slate-300 transition-all"
                            onClick={() => { setCameraReady(false); setWebcamModal({ open: true, type: option.key }); }}
                          >
                            Capture {option.label}
                          </button>
                        )}

                        {option.key === 'voice' && (
                          <div className="mt-2 flex flex-col items-center">
                            <button
                              type="button"
                              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${recording
                                  ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:text-rose-455 dark:border-rose-900/30'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400'
                                }`}
                              onClick={() => setRecording(r => !r)}
                            >
                              {recording ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full bg-rose-600 animate-ping" />
                                  Recording...
                                </span>
                              ) : (
                                'Record Voice sample'
                              )}
                            </button>

                            <ReactMic
                              record={recording}
                              className="sound-wave"
                              onStop={handleVoiceStop}
                              mimeType="audio/wav"
                              strokeColor="#4A74F0"
                              backgroundColor="transparent"
                              echoCancellation={true}
                              channelCount={1}
                              height={16}
                              style={{ width: '100%' }}
                            />

                            {voiceBlob && (
                              <audio controls src={URL.createObjectURL(voiceBlob)} className="mt-2 w-full max-w-[200px] h-8" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              </div>

              {/* Action Buttons */}
              <div className="sticky bottom-0 flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/95 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/95 sm:flex-row sm:items-center sm:justify-center sm:px-6 sm:py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 sm:w-auto"
                >
                  Cancel
                </button>
                 <button
                  type="submit"
                  disabled={readOnly}
                  title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                  className={`w-full rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow shadow-emerald-600/20 transition-all hover:bg-emerald-700 sm:w-auto ${readOnly ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {editingStudent ? 'Save Details' : 'Register Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Webcam modal */}
      {webcamModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setWebcamModal({ open: false, type: '' })} />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-elevation-4 p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Camera className="h-4 w-4 text-emerald-600" />
              {webcamModal.type === 'face' ? 'Live Face Capture' : 'Biometric Camera Capture'}
            </h3>

            <div className={`relative overflow-hidden rounded-2xl border-2 bg-slate-900 flex items-center justify-center transition-colors duration-300 ${justCaptured ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-800'}`}>
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                onUserMedia={() => setCameraReady(true)}
                onUserMediaError={() => {
                  setCameraReady(false);
                  toast.error('Could not access the camera. Check browser permissions and try again.');
                }}
                className="w-full h-auto object-cover max-h-[300px]"
              />
              {justCaptured && <div className="absolute inset-0 bg-white/30 animate-fade-in-fast" />}
              {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/70 text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs font-semibold">Starting camera…</span>
                </div>
              )}
            </div>

            {webcamModal.type === 'face' && (
              <p className={`mt-2.5 text-center text-xs font-bold ${files.faceImages.length >= MIN_FACE_IMAGES ? 'text-emerald-600' : 'text-amber-600'}`}>
                {files.faceImages.length}/{MIN_FACE_IMAGES} captured {files.faceImages.length >= MIN_FACE_IMAGES ? '✓ — capture more for a stronger match, or hit Done' : ''}
              </p>
            )}

            <div className="flex justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setWebcamModal({ open: false, type: '' })}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all"
              >
                {webcamModal.type === 'face' ? 'Done' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleWebcamCapture}
                disabled={!cameraReady}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow transition-all flex items-center gap-1.5 ${
                  cameraReady
                    ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
                    : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed shadow-none'
                }`}
              >
                {cameraReady ? <Camera className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {cameraReady ? 'Capture Snapshot' : 'Starting…'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;

