import React, { useState } from 'react';
import {
  X
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { ReactMic } from 'react-mic';

// Face is the only supported attendance method, so a thin enrollment (1-2
// photos) has no redundancy against a single bad crop/angle getting rejected
// server-side — require enough images up front for a reliable embedding.
const MIN_FACE_IMAGES = 5;

const StudentRegistrationForm = ({ user, editingStudent, onClose, onSuccess }) => {
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
    },
    organization: '1' // default to 'anuvadini'
  });

  const [files, setFiles] = useState({
    faceImages: [],
    voiceSample: null,
    fingerprintImage: null,
    irisImage: null,
    palmImage: null
  });

  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [registeredUid, setRegisteredUid] = useState('');

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

  const organizationOptions = [
    { value: '1', label: 'Anuvadini' },
    { value: '2', label: 'NETF' },
    { value: '3', label: 'IUAC' }
  ];

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
      toast.success(`${acceptedFiles.length} face image(s) uploaded successfully`);
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

  const validateForm = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = 'Full Name is required';
    if (!formData.uid.trim()) newErrors.uid = 'Mobile Number is required';
    else if (!/^\d{10}$/.test(formData.uid.trim())) newErrors.uid = 'Mobile Number must be 10 digits';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!formData.age) newErrors.age = 'Age is required';
    if (!formData.gender) newErrors.gender = 'Gender is required';
    if (!formData.organization) newErrors.organization = 'Organization is required';
    // SAACMS: Department + Role are required — they drive HOD department-scoping
    // and which web portal/dashboard the person sees after login.
    if (!formData.department || !formData.department.trim()) newErrors.department = 'Department is required';
    if (!formData.role) newErrors.role = 'Role is required';
    // Biometric file checks — face is the only supported attendance method,
    // so a thin enrollment has no redundancy against a single rejected
    // photo; require enough images for a reliable embedding (see check.py's
    // MIN_ENROLLMENT_IMAGES, which enforces the same floor server-side).
    if (formData.selectedBiometrics.face) {
      if (!editingStudent && files.faceImages.length === 0) {
        newErrors.faceImages = `At least ${MIN_FACE_IMAGES} face images are required`;
      } else if (files.faceImages.length > 0 && files.faceImages.length < MIN_FACE_IMAGES) {
        newErrors.faceImages = `At least ${MIN_FACE_IMAGES} face images are required (currently ${files.faceImages.length})`;
      }
    }
    if (formData.selectedBiometrics.voice && !files.voiceSample) newErrors.voiceSample = 'Voice sample is required';
    if (formData.selectedBiometrics.fingerprint && !files.fingerprintImage) newErrors.fingerprintImage = 'Fingerprint image is required';
    if (formData.selectedBiometrics.iris && !files.irisImage) newErrors.irisImage = 'Iris image is required';
    if (formData.selectedBiometrics.palm && !files.palmImage) newErrors.palmImage = 'Palm image is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please fix validation errors');
      return;
    }
    setLoading(true);
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

      files.faceImages.forEach((img, idx) => {
        formDataToSend.append('faceImages', img);
      });
      Object.keys(files).forEach(key => {
        if (key !== 'faceImages' && files[key]) {
          formDataToSend.append(key, files[key]);
        }
      });

      if (editingStudent) {
        await axios.put(`/api/students/${editingStudent._id}`, formDataToSend);
        toast.success('Student updated successfully');
        setLoading(false);
        onSuccess();
      } else {
        await axios.post('/api/students', formDataToSend);
        toast.success('Student created successfully');
        setRegisteredUid(formData.uid);
        setShowSuccess(true);
        setLoading(false);
        // Do not call onSuccess() here, show success modal instead
      }
    } catch (error) {
      console.error('Error saving student:', error);
      const errorMessage = error.response?.data?.message || 
                          (error.response?.data?.errors && Array.isArray(error.response.data.errors) ? 
                           error.response.data.errors.join(', ') : 
                           error.response?.data?.errors) || 
                          'Failed to save student';
      toast.error(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-lg w-full">
            <h2 className="text-2xl font-bold text-green-700 mb-4">Registration Successful!</h2>
            <div className="mb-6">
              <div className="text-lg font-semibold text-gray-700 mb-2">Your Login Credentials:</div>
              <div className="text-3xl font-bold text-blue-700 mb-2">UID: {registeredUid}</div>
              <div className="text-lg font-bold text-blue-700 mb-2">Password:{registeredUid}</div>
              <div className="text-sm text-gray-500">(Use your mobile number as both UID and password)</div>
            </div>
            <div className="mb-6 text-left">
              <ul className="list-disc pl-6 text-gray-700 text-base">
                <li>Download the attendance app.</li>
                <li>Login using the above credentials.</li>
                <li>Mark your face attendance within office premises.</li>
              </ul>
            </div>
            <button
              className="btn-primary w-full mt-4"
              onClick={() => {
                setShowSuccess(false);
                onSuccess();
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          {editingStudent ? 'Edit Student' : 'Register Employee'}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-6 w-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Organization Dropdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Organization</label>
            <select
              name="organization"
              value={formData.organization}
              onChange={handleInputChange}
              required
              className="input mt-1"
            >
              {organizationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {errors.organization && <p className="text-xs text-red-600">{errors.organization}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleInputChange}
              required
              className="input mt-1"
            />
            {errors.fullName && <p className="text-xs text-red-600">{errors.fullName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Mobile Number</label>
            <input
              type="text"
              name="uid"
              value={formData.uid}
              onChange={handleInputChange}
              required
              className="input mt-1"
              maxLength={10}
              pattern="\d{10}"
            />
            {errors.uid && <p className="text-xs text-red-600">{errors.uid}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              className="input mt-1"
            />
            {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Age</label>
            <input
              type="number"
              name="age"
              value={formData.age}
              onChange={handleInputChange}
              required
              min="1"
              max="120"
              className="input mt-1"
            />
            {errors.age && <p className="text-xs text-red-600">{errors.age}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Gender</label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleInputChange}
              required
              className="input mt-1"
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            {errors.gender && <p className="text-xs text-red-600">{errors.gender}</p>}
          </div>
        </div>

        {/* SAACMS: Department + Role + Designation. Department/Role required;
            Department feeds HOD scoping, Role decides the post-login dashboard. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Department <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              name="department"
              list="department-options"
              value={formData.department}
              onChange={handleInputChange}
              required
              placeholder="e.g. Administration"
              className="input mt-1"
            />
            <datalist id="department-options">
              {(user?.departments || user?.bureaus || user?.classes || []).map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            {errors.department && <p className="text-xs text-red-600">{errors.department}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Role <span className="text-red-600">*</span>
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleInputChange}
              required
              className="input mt-1"
            >
              <option value="faculty">Faculty</option>
              <option value="staff">Staff</option>
              <option value="hod">HOD</option>
            </select>
            {errors.role && <p className="text-xs text-red-600">{errors.role}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Designation</label>
            <input
              type="text"
              name="designation"
              value={formData.designation}
              onChange={handleInputChange}
              placeholder="e.g. Associate Professor"
              className="input mt-1"
            />
          </div>
        </div>

        {/* Biometric Selection */}
        {/* <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Biometric Methods
          </label>
          <div className="grid grid-cols-2 gap-2">
            {biometricOptions.map(option => {
              const orgBiometrics = user?.selectedBiometrics || {};
              const hasAnyBiometrics = Object.values(orgBiometrics).some(v => v);
              const isEnabled = hasAnyBiometrics ? orgBiometrics[option.key] : true;
              
              return (
                <label 
                  key={option.key} 
                  className={`flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer ${
                    isEnabled ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.selectedBiometrics[option.key]}
                    onChange={() => handleBiometricChange(option.key)}
                    disabled={!isEnabled}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-3 text-lg">{option.icon}</span>
                  <span className="ml-2 text-sm font-medium text-gray-700">{option.label}</span>
                  {!isEnabled && (
                    <span className="ml-auto text-xs text-gray-500">(Not enabled)</span>
                  )}
                </label>
              );
            })}
          </div>
          {user?.selectedBiometrics && Object.values(user.selectedBiometrics).every(v => !v) && (
            <p className="text-sm text-warning-600 mt-2">
              ⚠️ No biometric methods are enabled for your organization. Please contact your administrator.
            </p>
          )}
        </div> */}

        {/* <div>
          <label className="block text-sm font-medium text-gray-700">Street Address</label>
          <input
            type="text"
            name="address.street"
            value={formData.address.street}
            onChange={handleInputChange}
            className="input mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">City</label>
            <input
              type="text"
              name="address.city"
              value={formData.address.city}
              onChange={handleInputChange}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">State</label>
            <input
              type="text"
              name="address.state"
              value={formData.address.state}
              onChange={handleInputChange}
              className="input mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
            <input
              type="text"
              name="address.zipCode"
              value={formData.address.zipCode}
              onChange={handleInputChange}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Country</label>
            <input
              type="text"
              name="address.country"
              value={formData.address.country}
              onChange={handleInputChange}
              className="input mt-1"
            />
          </div>
        </div> */}

        {/* File Uploads */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Biometric Data Files
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {biometricOptions.map(option => {
              if (!formData.selectedBiometrics[option.key]) return null;
              if (option.key === 'face') {
                return (
                  <div key={option.key} className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <div className="text-lg mb-2">{option.icon}</div>
                    <p className="text-sm text-gray-600 mb-2">{option.label}</p>
                    <div {...getRootProps()} className="mb-2 cursor-pointer p-2 border rounded bg-gray-50">
                      <input {...getInputProps()} />
                      <span className="text-xs">Drag & drop or click to upload face images (multiple allowed)</span>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={e => {
                        if (e.target.files.length > 0) {
                          onDrop(Array.from(e.target.files), 'faceImages');
                        }
                      }}
                      className="text-xs mb-2"
                    />
                    <p className={`text-xs font-medium mb-1 ${files.faceImages.length >= MIN_FACE_IMAGES ? 'text-green-600' : 'text-amber-600'}`}>
                      {files.faceImages.length}/{MIN_FACE_IMAGES} images {files.faceImages.length >= MIN_FACE_IMAGES ? '✓' : `(min. ${MIN_FACE_IMAGES} required)`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {files.faceImages.map((img, idx) => {
                        // Only preview if it's a valid image file
                        let previewUrl = '';
                        if (img instanceof File && img.type.startsWith('image/')) {
                          previewUrl = URL.createObjectURL(img);
                        } else if (typeof img === 'string' && img.startsWith('data:image')) {
                          previewUrl = img;
                        }
                        return (
                          <div key={idx} className="relative">
                            {previewUrl ? (
                              <img
                                src={previewUrl}
                                alt={`face-${idx}`}
                                className="w-16 h-16 object-cover rounded border"
                              />
                            ) : (
                              <div className="w-16 h-16 flex items-center justify-center border rounded bg-gray-100 text-xs text-gray-500">
                                No Preview
                              </div>
                            )}
                            <button
                              type="button"
                              className="absolute top-0 right-0 bg-white rounded-full p-1 text-xs"
                              onClick={() => {
                                setFiles(prev => ({
                                  ...prev,
                                  faceImages: prev.faceImages.filter((_, i) => i !== idx)
                                }));
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {errors.faceImages && <p className="text-xs text-red-600">{errors.faceImages}</p>}
                  </div>
                );
              }
              return (
                <div key={option.key} className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <div className="text-lg mb-2">{option.icon}</div>
                  <p className="text-sm text-gray-600 mb-2">{option.label}</p>
                  <input
                    type="file"
                    onChange={e => {
                      if (e.target.files[0]) {
                        onDrop([e.target.files[0]], `${option.key}${option.key === 'voice' ? 'Sample' : 'Image'}`);
                      }
                    }}
                    accept={option.key === 'voice' ? 'audio/wav' : 'image/*'}
                    className="text-xs"
                  />
                  {option.key === 'voice' && (
                    <div className="mt-2 flex flex-col items-center">
                      <button
                        type="button"
                        className={`btn-secondary mb-2 ${recording ? 'bg-red-100 text-red-700 border-red-300' : ''}`}
                        style={{ minWidth: 140 }}
                        onClick={() => setRecording(r => !r)}
                      >
                        {recording ? (
                          <>
                            <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                            Stop Recording
                          </>
                        ) : (
                          <>
                            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                            Record Voice
                          </>
                        )}
                      </button>
                      
                        <ReactMic
                          record={recording}
                          className="sound-wave"
                          onStop={handleVoiceStop}
                          mimeType="audio/wav"
                          strokeColor="#fff"
                          backgroundColor="transparent"
                          echoCancellation={true}
                          channelCount={1}
                          height={24}
                          style={{ width: '100%' }}
                        />
                      
                      {voiceBlob && (
                        <audio controls src={URL.createObjectURL(voiceBlob)} className="mt-2 w-full" />
                      )}
                      {option.key === 'voice' && errors.voiceSample && <p className="text-xs text-red-600">{errors.voiceSample}</p>}
                    </div>
                  )}
                  {option.key === 'fingerprint' && errors.fingerprintImage && <p className="text-xs text-red-600">{errors.fingerprintImage}</p>}
                  {option.key === 'iris' && errors.irisImage && <p className="text-xs text-red-600">{errors.irisImage}</p>}
                  {option.key === 'palm' && errors.palmImage && <p className="text-xs text-red-600">{errors.palmImage}</p>}
                  {/* Show preview for uploaded images */}
                  {['iris', 'palm', 'fingerprint'].includes(option.key) && files[`${option.key}Image`] && (
                    <div className="mt-2 flex flex-col items-center">
                      <img
                        src={URL.createObjectURL(files[`${option.key}Image`])}
                        alt={`${option.key}-preview`}
                        className="w-16 h-16 object-cover rounded border"
                      />
                      <button
                        type="button"
                        className="mt-1 text-xs text-red-600"
                        onClick={() => setFiles(prev => ({
                          ...prev,
                          [`${option.key}Image`]: null
                        }))}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {/* Show preview for uploaded voice sample */}
                  {option.key === 'voice' && files.voiceSample && (
                    <div className="mt-2 flex flex-col items-center">
                      <audio controls src={URL.createObjectURL(files.voiceSample)} className="w-full" />
                      <button
                        type="button"
                        className="mt-1 text-xs text-red-600"
                        onClick={() => {
                          setFiles(prev => ({
                            ...prev,
                            voiceSample: null
                          }));
                          setVoiceBlob(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`btn-primary flex items-center justify-center ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={loading}
          >
            {loading && (
              <span className="mr-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              </span>
            )}
            {editingStudent ? 'Update Student' : 'Add Employee'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentRegistrationForm;