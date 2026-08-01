import React, { useEffect, useRef, useState } from 'react';
import API from './api';

import {
  UserPlus,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Phone,
  Camera,
  Upload,
  X,
  Briefcase,
  Heart,
  MapPin,
  FileText,
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  BadgeCheck,
  Zap,
  ChevronDown
} from 'lucide-react';

// ======================================================
// INITIAL FORM STATE
// ======================================================
const initialForm = {
  name: '',
  email: '',
  password: '',
  role: 'electrician',
  phone: '',
  maritalStatus: 'Single',
  address: '',
  backgroundInfo: ''
};

// ======================================================
// ROLE OPTIONS
// ======================================================
const roleOptions = [
  {
    value: 'electrician',
    label: 'Electrician',
    description: 'Electrical maintenance and field operations'
  },
  {
    value: 'cro',
    label: 'CRO',
    description: 'Control room and operational monitoring'
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Administrative and management access'
  }
];

// ======================================================
// MAIN COMPONENT
// ======================================================
export default function AddUser() {
  // ====================================================
  // STATE
  // ====================================================
  const [form, setForm] = useState(initialForm);

  const [profileImage, setProfileImage] = useState(null);
  const [profilePreview, setProfilePreview] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState({
    type: '',
    text: ''
  });

  const [errors, setErrors] = useState({});

  const fileInputRef = useRef(null);

  // ====================================================
  // AUTO HIDE SUCCESS / ERROR MESSAGE
  // ====================================================
  useEffect(() => {
    if (!message.text) return undefined;

    const timer = setTimeout(() => {
      setMessage({
        type: '',
        text: ''
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [message]);

  // ====================================================
  // CLEAN IMAGE PREVIEW MEMORY
  // ====================================================
  useEffect(() => {
    return () => {
      if (profilePreview && profilePreview.startsWith('blob:')) {
        URL.revokeObjectURL(profilePreview);
      }
    };
  }, [profilePreview]);

  // ====================================================
  // COMMON INPUT STYLE
  // ====================================================
  const inputStyle = `
    w-full
    h-14
    px-4
    bg-[#0b1220]
    text-white
    text-sm
    font-semibold
    rounded-2xl
    border
    border-white/[0.08]
    outline-none
    transition-all
    duration-300
    placeholder:text-slate-600
    hover:border-white/[0.15]
    focus:border-yellow-500
    focus:ring-4
    focus:ring-yellow-500/10
  `;

  const textareaStyle = `
    w-full
    min-h-[130px]
    px-4
    py-4
    bg-[#0b1220]
    text-white
    text-sm
    font-semibold
    rounded-2xl
    border
    border-white/[0.08]
    outline-none
    resize-y
    transition-all
    duration-300
    placeholder:text-slate-600
    hover:border-white/[0.15]
    focus:border-yellow-500
    focus:ring-4
    focus:ring-yellow-500/10
  `;

  // ====================================================
  // GENERIC FIELD CHANGE
  // ====================================================
  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((previousForm) => ({
      ...previousForm,
      [name]: value
    }));

    // Remove field error while typing
    if (errors[name]) {
      setErrors((previousErrors) => ({
        ...previousErrors,
        [name]: ''
      }));
    }

    // Remove old server message
    if (message.text) {
      setMessage({
        type: '',
        text: ''
      });
    }
  };

  // ====================================================
  // PROFILE IMAGE SELECTION
  // ====================================================
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      setMessage({
        type: 'error',
        text: 'Please select a JPG, PNG or WEBP image.'
      });

      e.target.value = '';
      return;
    }

    // 5 MB limit
    if (file.size > 5 * 1024 * 1024) {
      setMessage({
        type: 'error',
        text: 'Profile image must be smaller than 5 MB.'
      });

      e.target.value = '';
      return;
    }

    if (profilePreview && profilePreview.startsWith('blob:')) {
      URL.revokeObjectURL(profilePreview);
    }

    const previewUrl = URL.createObjectURL(file);

    setProfileImage(file);
    setProfilePreview(previewUrl);

    setMessage({
      type: '',
      text: ''
    });
  };

  // ====================================================
  // REMOVE PROFILE IMAGE
  // ====================================================
  const removeProfileImage = () => {
    if (profilePreview && profilePreview.startsWith('blob:')) {
      URL.revokeObjectURL(profilePreview);
    }

    setProfileImage(null);
    setProfilePreview('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ====================================================
  // FORM VALIDATION
  // ====================================================
  const validateForm = () => {
    const newErrors = {};

    const cleanName = form.name.trim();
    const cleanEmail = form.email.trim();
    const cleanPhone = form.phone.trim();

    if (!cleanName) {
      newErrors.name = 'Full name is required.';
    } else if (cleanName.length < 2) {
      newErrors.name = 'Full name must contain at least 2 characters.';
    }

    if (!cleanEmail) {
      newErrors.email = 'Email address is required.';
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!form.password) {
      newErrors.password = 'Password is required.';
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must contain at least 6 characters.';
    }

    if (
      cleanPhone &&
      !/^[0-9+\-\s()]{7,20}$/.test(cleanPhone)
    ) {
      newErrors.phone = 'Please enter a valid phone number.';
    }

    if (!form.role) {
      newErrors.role = 'Please select a staff role.';
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  // ====================================================
  // RESET FORM
  // ====================================================
  const handleReset = () => {
    if (
      form.name ||
      form.email ||
      form.password ||
      form.phone ||
      form.address ||
      form.backgroundInfo ||
      profileImage
    ) {
      const confirmed = window.confirm(
        'Are you sure you want to clear the complete staff form?'
      );

      if (!confirmed) return;
    }

    removeProfileImage();

    setForm(initialForm);
    setErrors({});

    setMessage({
      type: '',
      text: ''
    });

    setShowPassword(false);
  };

  // ====================================================
  // SUBMIT FORM
  // ====================================================
  const handleSubmit = async (e) => {
    e.preventDefault();

    setMessage({
      type: '',
      text: ''
    });

    const isValid = validateForm();

    if (!isValid) {
      setMessage({
        type: 'error',
        text: 'Please check the highlighted fields before creating the staff account.'
      });

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

      return;
    }

    try {
      setLoading(true);

      // Keep the same JSON format expected by your current backend.
      // profileImage is preview-only until backend multipart upload is added.
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        phone: form.phone.trim(),
        maritalStatus: form.maritalStatus,
        address: form.address.trim(),
        backgroundInfo: form.backgroundInfo.trim()
      };

      const response = await API.post('/user', payload);

      setMessage({
        type: 'success',
        text:
          response?.data?.message ||
          'Staff member created successfully.'
      });

      // Reset after successful creation
      removeProfileImage();
      setForm(initialForm);
      setErrors({});
      setShowPassword(false);

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } catch (error) {
      console.error('CREATE STAFF ERROR:', error);

      const serverMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Failed to create staff member. Please check the information and try again.';

      setMessage({
        type: 'error',
        text: serverMessage
      });

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } finally {
      setLoading(false);
    }
  };

  // ====================================================
  // GET SELECTED ROLE
  // ====================================================
  const selectedRole =
    roleOptions.find((item) => item.value === form.role) ||
    roleOptions[0];

  // ====================================================
  // UI
  // ====================================================
  return (
    <div className="relative min-h-screen text-white animate-in fade-in duration-500">
      {/* =================================================
          DECORATIVE BACKGROUND
      ================================================== */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-yellow-500/[0.04] blur-3xl" />

      {/* =================================================
          PAGE HEADER
      ================================================== */}
      <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="relative w-14 h-14 rounded-2xl bg-yellow-500 flex items-center justify-center text-black shadow-xl shadow-yellow-500/20">
            <UserPlus size={27} strokeWidth={2.4} />

            <span className="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-green-500 border-[3px] border-[#0a0f1e]" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">
                Add Staff Member
              </h1>

              <span className="px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[9px] font-black uppercase tracking-widest">
                Employee Registration
              </span>
            </div>

            <p className="text-slate-500 text-sm mt-1">
              Create a new employee account and configure staff information and system access.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="h-11 px-5 rounded-xl bg-[#111827] border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-wider disabled:opacity-50"
          >
            <RotateCcw size={16} />
            Reset Form
          </button>

          <button
            type="button"
            onClick={() => {
              document
                .getElementById('add-staff-form')
                ?.requestSubmit();
            }}
            disabled={loading}
            className="h-11 px-6 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black transition-all flex items-center gap-2 text-xs font-black uppercase tracking-wider shadow-lg shadow-yellow-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Save size={17} />
            )}

            {loading ? 'Creating...' : 'Create Staff'}
          </button>
        </div>
      </div>

      {/* =================================================
          SUCCESS / ERROR MESSAGE
      ================================================== */}
      {message.text && (
        <div
          className={`
            relative z-10
            mb-7
            px-5
            py-4
            rounded-2xl
            border
            flex
            items-start
            justify-between
            gap-4
            ${
              message.type === 'success'
                ? 'bg-green-500/10 border-green-500/25 text-green-400'
                : 'bg-red-500/10 border-red-500/25 text-red-400'
            }
          `}
        >
          <div className="flex items-start gap-3">
            {message.type === 'success' ? (
              <CheckCircle2
                size={20}
                className="shrink-0 mt-0.5"
              />
            ) : (
              <AlertTriangle
                size={20}
                className="shrink-0 mt-0.5"
              />
            )}

            <div>
              <p className="text-xs font-black uppercase tracking-wider">
                {message.type === 'success'
                  ? 'Success'
                  : 'Action Required'}
              </p>

              <p className="text-sm font-semibold mt-1 opacity-90">
                {message.text}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setMessage({
                type: '',
                text: ''
              })
            }
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* =================================================
          MAIN FORM
      ================================================== */}
      <form
        id="add-staff-form"
        onSubmit={handleSubmit}
        className="relative z-10 space-y-7"
      >
        {/* =================================================
            EMPLOYEE ID INFORMATION
        ================================================== */}
        <div className="bg-gradient-to-r from-yellow-500/[0.12] to-transparent border border-yellow-500/15 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500 text-black flex items-center justify-center shadow-lg shadow-yellow-500/10">
              <BadgeCheck size={20} />
            </div>

            <div>
              <p className="text-white text-sm font-black">
                Automatic Employee ID
              </p>

              <p className="text-slate-500 text-xs mt-1">
                A unique employee ID will be automatically generated after successful registration.
              </p>
            </div>
          </div>

          <div className="px-4 py-2 rounded-xl bg-[#020617]/60 border border-white/5 text-yellow-500 text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
            Auto Generated
          </div>
        </div>

        {/* =================================================
            PROFILE + BASIC INFORMATION
        ================================================== */}
        <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-7">
          {/* ===============================================
              PROFILE IMAGE CARD
          ================================================ */}
          <section className="bg-[#020617]/80 border border-white/[0.06] rounded-[2rem] overflow-hidden shadow-2xl">
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
                  <Camera size={19} />
                </div>

                <div>
                  <h2 className="text-sm font-black">
                    Profile Photo
                  </h2>

                  <p className="text-slate-600 text-[10px] mt-1">
                    Employee identification image
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="relative mx-auto w-40 h-40 rounded-[2rem] bg-[#0b1220] border-2 border-dashed border-white/10 overflow-hidden flex items-center justify-center group">
                {profilePreview ? (
                  <>
                    <img
                      src={profilePreview}
                      alt="Employee preview"
                      className="w-full h-full object-cover"
                    />

                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-11 h-11 rounded-xl bg-yellow-500 text-black flex items-center justify-center hover:scale-105 transition-transform"
                      >
                        <Camera size={19} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center px-5">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center mb-3">
                      <User size={31} />
                    </div>

                    <p className="text-white text-xs font-black">
                      No Photo Selected
                    </p>

                    <p className="text-slate-600 text-[10px] mt-1">
                      JPG, PNG or WEBP
                    </p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="hidden"
              />

              <div className="grid grid-cols-1 gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-11 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-yellow-400 transition-all"
                >
                  <Upload size={16} />
                  {profileImage ? 'Change Photo' : 'Choose Photo'}
                </button>

                {profileImage && (
                  <button
                    type="button"
                    onClick={removeProfileImage}
                    className="w-full h-11 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all"
                  >
                    <X size={16} />
                    Remove Photo
                  </button>
                )}
              </div>

              {profileImage && (
                <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <p className="text-slate-400 text-[10px] font-bold truncate">
                    {profileImage.name}
                  </p>

                  <p className="text-slate-600 text-[9px] mt-1">
                    {(profileImage.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ===============================================
              BASIC INFORMATION CARD
          ================================================ */}
          <section className="bg-[#020617]/80 border border-white/[0.06] rounded-[2rem] overflow-hidden shadow-2xl">
            <div className="px-6 md:px-7 py-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
                  <UserPlus size={19} />
                </div>

                <div>
                  <h2 className="text-sm font-black">
                    Basic Staff Information
                  </h2>

                  <p className="text-slate-600 text-[10px] mt-1">
                    Personal identity and contact information
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-7">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* FULL NAME */}
                <FieldWrapper
                  label="Full Name"
                  required
                  error={errors.name}
                  icon={<User size={16} />}
                >
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Example: Muhammad Asad"
                    autoComplete="name"
                    maxLength={100}
                    className={`${inputStyle} ${
                      errors.name
                        ? '!border-red-500 focus:!border-red-500'
                        : ''
                    }`}
                  />
                </FieldWrapper>

                {/* EMAIL */}
                <FieldWrapper
                  label="Email Address"
                  required
                  error={errors.email}
                  icon={<Mail size={16} />}
                >
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Example: employee@powerhouse.com"
                    autoComplete="email"
                    maxLength={150}
                    className={`${inputStyle} ${
                      errors.email
                        ? '!border-red-500 focus:!border-red-500'
                        : ''
                    }`}
                  />
                </FieldWrapper>

                {/* PASSWORD */}
                <FieldWrapper
                  label="Account Password"
                  required
                  error={errors.password}
                  icon={<Lock size={16} />}
                >
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      maxLength={100}
                      className={`${inputStyle} pr-14 ${
                        errors.password
                          ? '!border-red-500 focus:!border-red-500'
                          : ''
                      }`}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((previous) => !previous)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl text-slate-500 hover:text-yellow-500 hover:bg-yellow-500/10 transition-all flex items-center justify-center"
                      title={
                        showPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </FieldWrapper>

                {/* PHONE */}
                <FieldWrapper
                  label="Phone Number"
                  error={errors.phone}
                  icon={<Phone size={16} />}
                >
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="Example: +92 300 1234567"
                    autoComplete="tel"
                    maxLength={20}
                    className={`${inputStyle} ${
                      errors.phone
                        ? '!border-red-500 focus:!border-red-500'
                        : ''
                    }`}
                  />
                </FieldWrapper>
              </div>
            </div>
          </section>
        </div>

        {/* =================================================
            ROLE AND ACCESS
        ================================================== */}
        <section className="bg-[#020617]/80 border border-white/[0.06] rounded-[2rem] overflow-hidden shadow-2xl">
          <div className="px-6 md:px-7 py-5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
                <ShieldCheck size={19} />
              </div>

              <div>
                <h2 className="text-sm font-black">
                  Role & Access Configuration
                </h2>

                <p className="text-slate-600 text-[10px] mt-1">
                  Select employee designation and account permission level
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-7">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {roleOptions.map((role) => {
                const isSelected = form.role === role.value;

                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => {
                      setForm((previousForm) => ({
                        ...previousForm,
                        role: role.value
                      }));

                      if (errors.role) {
                        setErrors((previousErrors) => ({
                          ...previousErrors,
                          role: ''
                        }));
                      }
                    }}
                    className={`
                      relative
                      text-left
                      p-5
                      rounded-2xl
                      border
                      transition-all
                      duration-300
                      ${
                        isSelected
                          ? 'bg-yellow-500/[0.08] border-yellow-500 shadow-lg shadow-yellow-500/[0.05]'
                          : 'bg-[#0b1220] border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div
                        className={`
                          w-11
                          h-11
                          rounded-xl
                          flex
                          items-center
                          justify-center
                          ${
                            isSelected
                              ? 'bg-yellow-500 text-black'
                              : 'bg-white/[0.05] text-slate-500'
                          }
                        `}
                      >
                        {role.value === 'electrician' ? (
                          <Zap size={20} />
                        ) : role.value === 'cro' ? (
                          <Briefcase size={20} />
                        ) : (
                          <ShieldCheck size={20} />
                        )}
                      </div>

                      <div
                        className={`
                          w-5
                          h-5
                          rounded-full
                          border-2
                          flex
                          items-center
                          justify-center
                          ${
                            isSelected
                              ? 'border-yellow-500'
                              : 'border-slate-700'
                          }
                        `}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                        )}
                      </div>
                    </div>

                    <h3
                      className={`
                        text-sm
                        font-black
                        mt-4
                        ${
                          isSelected
                            ? 'text-yellow-500'
                            : 'text-white'
                        }
                      `}
                    >
                      {role.label}
                    </h3>

                    <p className="text-slate-600 text-[11px] mt-2 leading-relaxed">
                      {role.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* SELECT FALLBACK / CURRENT ROLE SUMMARY */}
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <FieldWrapper
                label="Selected Staff Role"
                required
                error={errors.role}
                icon={<Briefcase size={16} />}
              >
                <div className="relative">
                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    className={`${inputStyle} appearance-none pr-12 ${
                      errors.role
                        ? '!border-red-500'
                        : ''
                    }`}
                  >
                    {roleOptions.map((role) => (
                      <option
                        key={role.value}
                        value={role.value}
                      >
                        {role.label}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={17}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />
                </div>
              </FieldWrapper>

              <div className="flex items-end">
                <div className="w-full min-h-14 rounded-2xl bg-yellow-500/[0.06] border border-yellow-500/15 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-yellow-500 text-black flex items-center justify-center shrink-0">
                    <BadgeCheck size={17} />
                  </div>

                  <div>
                    <p className="text-yellow-500 text-xs font-black">
                      {selectedRole.label}
                    </p>

                    <p className="text-slate-600 text-[10px] mt-0.5">
                      {selectedRole.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================
            PERSONAL + ADDITIONAL INFORMATION
        ================================================== */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-7">
          {/* PERSONAL INFORMATION */}
          <section className="bg-[#020617]/80 border border-white/[0.06] rounded-[2rem] overflow-hidden shadow-2xl">
            <div className="px-6 md:px-7 py-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
                  <Heart size={19} />
                </div>

                <div>
                  <h2 className="text-sm font-black">
                    Personal Information
                  </h2>

                  <p className="text-slate-600 text-[10px] mt-1">
                    Additional employee personal details
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-7 space-y-5">
              {/* MARITAL STATUS */}
              <FieldWrapper
                label="Marital Status"
                icon={<Heart size={16} />}
              >
                <div className="grid grid-cols-2 gap-3">
                  {['Single', 'Married'].map((status) => {
                    const isSelected =
                      form.maritalStatus === status;

                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() =>
                          setForm((previousForm) => ({
                            ...previousForm,
                            maritalStatus: status
                          }))
                        }
                        className={`
                          h-14
                          rounded-2xl
                          border
                          font-black
                          text-xs
                          transition-all
                          ${
                            isSelected
                              ? 'bg-yellow-500 text-black border-yellow-500'
                              : 'bg-[#0b1220] text-slate-400 border-white/[0.07] hover:border-white/20'
                          }
                        `}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </FieldWrapper>

              {/* ADDRESS */}
              <FieldWrapper
                label="Residential Address"
                icon={<MapPin size={16} />}
              >
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Enter complete residential address..."
                  maxLength={500}
                  className={textareaStyle}
                />

                <CharacterCounter
                  current={form.address.length}
                  max={500}
                />
              </FieldWrapper>
            </div>
          </section>

          {/* BACKGROUND INFORMATION */}
          <section className="bg-[#020617]/80 border border-white/[0.06] rounded-[2rem] overflow-hidden shadow-2xl">
            <div className="px-6 md:px-7 py-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
                  <FileText size={19} />
                </div>

                <div>
                  <h2 className="text-sm font-black">
                    Background Information
                  </h2>

                  <p className="text-slate-600 text-[10px] mt-1">
                    Experience, qualification, skills and employee notes
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-7">
              <FieldWrapper
                label="Professional Background"
                icon={<Briefcase size={16} />}
              >
                <textarea
                  name="backgroundInfo"
                  value={form.backgroundInfo}
                  onChange={handleChange}
                  placeholder="Enter previous experience, qualification, certifications, technical skills or other relevant background information..."
                  maxLength={1500}
                  className={`${textareaStyle} min-h-[245px]`}
                />

                <CharacterCounter
                  current={form.backgroundInfo.length}
                  max={1500}
                />
              </FieldWrapper>
            </div>
          </section>
        </div>

        {/* =================================================
            FINAL ACTION BAR
        ================================================== */}
        <div className="bg-[#020617]/90 border border-white/[0.06] rounded-[2rem] p-5 md:p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center shrink-0">
                <ShieldCheck size={19} />
              </div>

              <div>
                <p className="text-white text-sm font-black">
                  Ready to Create Staff Account
                </p>

                <p className="text-slate-600 text-xs mt-1 max-w-2xl leading-relaxed">
                  Review all employee details before submission. Fields marked with an asterisk are required.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="h-12 px-6 rounded-xl bg-[#111827] border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                <RotateCcw size={16} />
                Reset
              </button>

              <button
                type="submit"
                disabled={loading}
                className="h-12 px-8 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider shadow-xl shadow-yellow-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                    Creating Staff...
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    Create Staff Member
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ======================================================
// REUSABLE FIELD WRAPPER
// ======================================================
function FieldWrapper({
  label,
  required = false,
  error = '',
  icon = null,
  children
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <label className="flex items-center gap-2 text-[10px] text-slate-400 font-black uppercase tracking-[0.16em]">
          {icon && (
            <span className="text-yellow-500">
              {icon}
            </span>
          )}

          {label}

          {required && (
            <span className="text-red-500">*</span>
          )}
        </label>
      </div>

      {children}

      {error && (
        <div className="mt-2 flex items-center gap-2 text-red-400">
          <AlertTriangle size={13} />

          <p className="text-[10px] font-bold">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

// ======================================================
// CHARACTER COUNTER
// ======================================================
function CharacterCounter({ current, max }) {
  return (
    <div className="flex justify-end mt-2">
      <span
        className={`
          text-[9px]
          font-black
          tracking-wider
          ${
            current >= max
              ? 'text-red-400'
              : 'text-slate-700'
          }
        `}
      >
        {current} / {max}
      </span>
    </div>
  );
}