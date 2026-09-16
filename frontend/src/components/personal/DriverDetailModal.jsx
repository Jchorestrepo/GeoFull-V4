import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import {
  User,
  CreditCard,
  Phone,
  FileText,
  DollarSign,
  Tag,
  Save,
  X,
  Plus,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Calendar,
  Users,
  Camera,
  Download,
  MinusCircle,
  MessageSquare,
  Shield,
  Check
} from 'lucide-react';
import axios from 'axios';

export function DriverDetailModal({ driver, onClose, onDriverUpdated }) {
  const [activeTab, setActiveTab] = useState('personal');

  // Form state incorporating all V3 and V4 fields
  const [formData, setFormData] = useState(() => {
    const nameParts = (driver.nombre_completo || '').split(' ');
    const defaultNombres = driver.nombres || nameParts[0] || '';
    const defaultApellidos = driver.apellidos || nameParts.slice(1).join(' ') || '';

    // Parse platforms
    let platformsList = [];
    if (driver.plataformas) {
      try {
        platformsList = typeof driver.plataformas === 'string'
          ? JSON.parse(driver.plataformas)
          : driver.plataformas;
      } catch (e) {
        platformsList = [];
      }
    }

    const imile = platformsList.find(p => p.empresa === 'iMile') || {};
    const jyt = platformsList.find(p => p.empresa === 'J&T') || {};
    const adicionales = platformsList.filter(p => p.empresa !== 'iMile' && p.empresa !== 'J&T');

    // Parse RUT documents
    let rutList = [];
    if (driver.docs_rut) {
      try {
        rutList = typeof driver.docs_rut === 'string' ? JSON.parse(driver.docs_rut) : driver.docs_rut;
        if (!Array.isArray(rutList)) rutList = [];
      } catch (e) {
        rutList = [];
      }
    }

    // Parse bank accounts
    let cuentasList = [];
    if (driver.cuentas_bancarias) {
      try {
        cuentasList = typeof driver.cuentas_bancarias === 'string' ? JSON.parse(driver.cuentas_bancarias) : driver.cuentas_bancarias;
        if (!Array.isArray(cuentasList)) cuentasList = [];
      } catch (e) {
        cuentasList = [];
      }
    }

    // Parse alias
    let aliasesList = [driver.nombre_completo];
    if (driver.alias_nombres) {
      try {
        aliasesList = typeof driver.alias_nombres === 'string'
          ? JSON.parse(driver.alias_nombres)
          : driver.alias_nombres;
      } catch (e) {
        aliasesList = [driver.nombre_completo];
      }
    }

    return {
      nombre_completo: driver.nombre_completo || '',
      nombres: defaultNombres,
      apellidos: defaultApellidos,
      cedula: driver.cedula || '',
      telefono: driver.telefono || '',
      fecha_nacimiento: driver.fecha_nacimiento || '',
      jefe_zona: driver.jefe_zona || '',
      tipo_contrato: driver.tipo_contrato || 'PAQUETEO',
      tarifa_paquete: driver.tarifa_paquete || 2000,
      activo: driver.activo !== undefined ? driver.activo : true,

      // Bank info
      banco: driver.banco || '',
      cuenta: driver.cuenta || '',
      tipo_cuenta: driver.tipo_cuenta || 'Ahorros',
      cc_titular: driver.cc_titular || '',
      cuentas_bancarias: cuentasList,

      // Platforms
      imile_usuario: imile.usuario || '',
      jyt_usuario: jyt.usuario || driver.nombre_completo || '',
      plataformas_adicionales: adicionales,

      // Documents
      foto: driver.foto || '',
      doc_cedula_frontal: driver.doc_cedula_frontal || '',
      doc_cedula_trasera: driver.doc_cedula_trasera || '',
      doc_servicios: driver.doc_servicios || '',
      doc_certificado_bancario: driver.doc_certificado_bancario || '',
      docs_rut: rutList,

      // Alias
      alias_nombres: aliasesList
    };
  });

  const [newAlias, setNewAlias] = useState('');
  const [newPlatEmpresa, setNewPlatEmpresa] = useState('');
  const [newPlatUsuario, setNewPlatUsuario] = useState('');
  const [newRutNombre, setNewRutNombre] = useState('');
  const [newRutArchivo, setNewRutArchivo] = useState('');
  const [newRutFileName, setNewRutFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Auto update nombre_completo when nombres/apellidos change
  const handleNameChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    const fullName = `${updated.nombres.trim()} ${updated.apellidos.trim()}`.trim();
    setFormData({
      ...updated,
      nombre_completo: fullName || updated.nombre_completo
    });
  };

  // Age calculation
  const calcularEdad = (fecha) => {
    if (!fecha) return '';
    const nacimiento = new Date(fecha);
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
    return `${edad} años`;
  };

  const formatPhoneNumber = (num) => {
    if (!num) return '';
    const clean = num.replace(/\D/g, '');
    return clean.startsWith('57') ? clean : `57${clean}`;
  };

  // File handling helpers
  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({
        ...prev,
        [field]: reader.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeFile = (field) => {
    setFormData(prev => ({
      ...prev,
      [field]: ''
    }));
  };

  // Bank Accounts helpers
  const addCuentaBancaria = () => {
    const nuevaCuenta = {
      banco: formData.banco || '',
      cuenta: formData.cuenta || '',
      tipo_cuenta: formData.tipo_cuenta || 'Ahorros',
      cc_titular: formData.cc_titular || formData.cedula || ''
    };
    setFormData(prev => ({
      ...prev,
      cuentas_bancarias: [...prev.cuentas_bancarias, nuevaCuenta]
    }));
  };

  const removeCuentaBancaria = (index) => {
    setFormData(prev => ({
      ...prev,
      cuentas_bancarias: prev.cuentas_bancarias.filter((_, i) => i !== index)
    }));
  };

  const updateCuentaBancaria = (index, field, value) => {
    setFormData(prev => {
      const copy = [...prev.cuentas_bancarias];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, cuentas_bancarias: copy };
    });
  };

  // Platforms helpers
  const addPlatAdicional = () => {
    if (!newPlatEmpresa.trim() || !newPlatUsuario.trim()) return;
    setFormData(prev => ({
      ...prev,
      plataformas_adicionales: [
        ...prev.plataformas_adicionales,
        { empresa: newPlatEmpresa.trim(), usuario: newPlatUsuario.trim() }
      ]
    }));
    setNewPlatEmpresa('');
    setNewPlatUsuario('');
  };

  const removePlatAdicional = (index) => {
    setFormData(prev => ({
      ...prev,
      plataformas_adicionales: prev.plataformas_adicionales.filter((_, i) => i !== index)
    }));
  };

  // RUT Documents helpers
  const handleRutFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setNewRutArchivo(reader.result);
      setNewRutFileName(file.name);
      if (!newRutNombre.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        setNewRutNombre(cleanName.toLowerCase().includes('rut') ? cleanName : `RUT ${cleanName}`);
      }
    };
    reader.readAsDataURL(file);
  };

  const addRutDoc = () => {
    if (!newRutArchivo) return;
    const nombreFinal = newRutNombre.trim() || `RUT ${formData.nombres || 'Conductor'}`;
    const item = {
      id: 'rut_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      nombre: nombreFinal,
      archivo: newRutArchivo,
      fecha: new Date().toISOString()
    };
    setFormData(prev => ({
      ...prev,
      docs_rut: [...prev.docs_rut, item]
    }));
    setNewRutNombre('');
    setNewRutArchivo('');
    setNewRutFileName('');
  };

  const removeRutDoc = (rutId) => {
    setFormData(prev => ({
      ...prev,
      docs_rut: prev.docs_rut.filter(r => r.id !== rutId)
    }));
  };

  const updateRutNombre = (rutId, newNombre) => {
    setFormData(prev => ({
      ...prev,
      docs_rut: prev.docs_rut.map(r => r.id === rutId ? { ...r, nombre: newNombre } : r)
    }));
  };

  // Alias helpers
  const handleAddAlias = () => {
    const clean = newAlias.trim();
    if (clean && !formData.alias_nombres.includes(clean)) {
      setFormData({
        ...formData,
        alias_nombres: [...formData.alias_nombres, clean]
      });
      setNewAlias('');
    }
  };

  const handleRemoveAlias = (aliasToRemove) => {
    setFormData({
      ...formData,
      alias_nombres: formData.alias_nombres.filter(a => a !== aliasToRemove)
    });
  };

  // Submit Handler
  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.nombre_completo.trim() || !formData.cedula.trim()) {
      setError("El Nombre Completo y la Cédula son obligatorios");
      return;
    }

    setSaving(true);
    try {
      // Assemble platforms array for backend
      const plataformas = [
        { empresa: 'iMile', usuario: formData.imile_usuario || '' },
        { empresa: 'J&T', usuario: formData.jyt_usuario || formData.nombre_completo },
        ...formData.plataformas_adicionales
      ];

      const payload = {
        nombre_completo: formData.nombre_completo.trim(),
        nombres: formData.nombres.trim(),
        apellidos: formData.apellidos.trim(),
        cedula: formData.cedula.strip ? formData.cedula.strip() : formData.cedula.trim(),
        telefono: formData.telefono,
        fecha_nacimiento: formData.fecha_nacimiento || null,
        jefe_zona: formData.jefe_zona,
        tipo_contrato: formData.tipo_contrato,
        tarifa_paquete: parseFloat(formData.tarifa_paquete) || 0.0,
        banco: formData.banco,
        cuenta: formData.cuenta,
        tipo_cuenta: formData.tipo_cuenta,
        cc_titular: formData.cc_titular,
        cuentas_bancarias: formData.cuentas_bancarias,
        plataformas: plataformas,
        foto: formData.foto,
        doc_cedula_frontal: formData.doc_cedula_frontal,
        doc_cedula_trasera: formData.doc_cedula_trasera,
        doc_servicios: formData.doc_servicios,
        doc_certificado_bancario: formData.doc_certificado_bancario,
        docs_rut: formData.docs_rut,
        activo: formData.activo,
        alias_nombres: formData.alias_nombres
      };

      const res = await axios.put(`/api/v1/reconciliation/drivers/${driver.id}`, payload);

      onDriverUpdated?.(res.data);
      onClose();
    } catch (err) {
      console.error("Error al actualizar domiciliario", err);
      setError(err.response?.data?.detail || "No se pudieron guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const isTempCedula = formData.cedula.startsWith('AUTO-DA');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <GlassCard className="w-full max-w-3xl p-0 relative rounded-3xl border border-white/20 shadow-2xl bg-slate-900/95 text-white flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-slate-950/60 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 overflow-hidden flex items-center justify-center flex-shrink-0">
              {formData.foto ? (
                <img src={formData.foto} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white">{formData.nombre_completo}</h3>
                <Badge variant={formData.activo ? 'emerald' : 'red'}>
                  {formData.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>Cédula:</span>
                <span className="font-mono text-slate-200 font-bold">{formData.cedula}</span>
                {isTempCedula && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" /> Cédula Temporal
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Operational Stats Strip */}
        <div className="grid grid-cols-3 gap-3 p-3 mx-6 mt-4 rounded-2xl bg-slate-950/80 border border-white/5 flex-shrink-0">
          <div className="text-center p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Entregados</p>
            <p className="text-base font-extrabold text-white mt-0.5">{driver.total_entregados || 0}</p>
          </div>
          <div className="text-center p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">En Ruta</p>
            <p className="text-base font-extrabold text-white mt-0.5">{driver.total_en_ruta || 0}</p>
          </div>
          <div className="text-center p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Pendientes Nómina</p>
            <p className="text-base font-extrabold text-white mt-0.5">{driver.pendientes_liquidacion || 0}</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 px-6 mt-3 gap-2 overflow-x-auto flex-shrink-0 bg-slate-950/40">
          {[
            { id: 'personal', label: 'Info Personal', icon: User },
            { id: 'bancaria', label: `Info Bancaria ${formData.cuentas_bancarias.length > 0 ? `(${formData.cuentas_bancarias.length + 1})` : ''}`, icon: CreditCard },
            { id: 'plataformas', label: 'Plataformas', icon: Users },
            { id: 'documentos', label: `Documentos ${formData.docs_rut.length > 0 ? `(${formData.docs_rut.length} RUT)` : ''}`, icon: FileText },
            { id: 'alias', label: `Alias (${formData.alias_nombres.length})`, icon: Tag }
          ].map(t => {
            const Icon = t.icon;
            const isSelected = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                type="button"
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                  isSelected
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="font-bold text-red-300 hover:text-white">×</button>
          </div>
        )}

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          
          {/* TAB 1: INFORMACIÓN PERSONAL */}
          {activeTab === 'personal' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nombres (*):
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombres}
                    onChange={(e) => handleNameChange('nombres', e.target.value)}
                    placeholder="Ej: Juan Carlos"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Apellidos (*):
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.apellidos}
                    onChange={(e) => handleNameChange('apellidos', e.target.value)}
                    placeholder="Ej: Pérez Gómez"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>Cédula / Identificación (*):</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.cedula}
                    onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold outline-none focus:border-blue-500"
                  />
                  {isTempCedula && (
                    <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Si editas a la Cédula Real y ya existe otro conductor, se unificarán automáticamente.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>Teléfono de Contacto:</span>
                    {formData.telefono && (
                      <a
                        href={`https://wa.me/${formatPhoneNumber(formData.telefono)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline flex items-center gap-1 text-[11px] font-bold"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-400 inline" /> WhatsApp
                      </a>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">+57</span>
                    <input
                      type="tel"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      placeholder="3001234567"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Fecha de Nacimiento {formData.fecha_nacimiento && <span className="text-blue-400">({calcularEdad(formData.fecha_nacimiento)})</span>}:
                  </label>
                  <div className="relative">
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      type="date"
                      value={formData.fecha_nacimiento}
                      onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium outline-none focus:border-blue-500 pr-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Jefe de Zona Asignado:
                  </label>
                  <input
                    type="text"
                    value={formData.jefe_zona}
                    onChange={(e) => setFormData({ ...formData, jefe_zona: e.target.value })}
                    placeholder="Ej: Carlos Supervisor"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tipo de Contrato:
                  </label>
                  <select
                    value={formData.tipo_contrato}
                    onChange={(e) => setFormData({ ...formData, tipo_contrato: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium outline-none focus:border-blue-500"
                  >
                    <option value="PAQUETEO">PAQUETEO / RUTA</option>
                    <option value="DIA_FIJO">DÍA FIJO</option>
                    <option value="PRESTACION">PRESTACIÓN DE SERVICIOS</option>
                    <option value="PLANTA">CONTRATO DE PLANTA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tarifa por Paquete ($ COP):
                  </label>
                  <input
                    type="number"
                    value={formData.tarifa_paquete}
                    onChange={(e) => setFormData({ ...formData, tarifa_paquete: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-emerald-400 font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Estado del Domiciliario:
                </label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, activo: !formData.activo })}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 border ${
                    formData.activo
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-red-500/20 border-red-500/40 text-red-300'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {formData.activo ? 'Conductor Activo (Habilitado)' : 'Conductor Inactivo (Deshabilitado)'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: INFORMACIÓN BANCARIA */}
          {activeTab === 'bancaria' && (
            <div className="space-y-6">
              {/* Account 1 (Principal) */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5 text-xs">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    Cuenta Bancaria Principal
                  </span>
                  <Badge variant="blue">Principal</Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Banco</label>
                    <input
                      type="text"
                      value={formData.banco}
                      onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                      placeholder="Ej: Bancolombia, Nequi..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Cédula Titular (CC)</label>
                    <input
                      type="text"
                      value={formData.cc_titular}
                      onChange={(e) => setFormData({ ...formData, cc_titular: e.target.value })}
                      placeholder="Ej: 10203040"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Número de Cuenta</label>
                    <input
                      type="text"
                      value={formData.cuenta}
                      onChange={(e) => setFormData({ ...formData, cuenta: e.target.value })}
                      placeholder="Ej: 512-123456-78"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Tipo de Cuenta</label>
                    <select
                      value={formData.tipo_cuenta}
                      onChange={(e) => setFormData({ ...formData, tipo_cuenta: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-blue-500"
                    >
                      <option value="Ahorros">Ahorros</option>
                      <option value="Corriente">Corriente</option>
                      <option value="Daviplata/Nequi">Monedero (Nequi / Daviplata)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Secondary Accounts */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="font-bold text-slate-300 uppercase tracking-wider text-xs">
                    Cuentas Bancarias Adicionales ({formData.cuentas_bancarias.length})
                  </div>
                  <button
                    type="button"
                    onClick={addCuentaBancaria}
                    className="px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Agregar Segunda Cuenta
                  </button>
                </div>

                {formData.cuentas_bancarias.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                    No hay cuentas adicionales. Haz clic en <strong>"+ Agregar Segunda Cuenta"</strong> para duplicar los datos de la primera y editarlos.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.cuentas_bancarias.map((cuenta, idx) => (
                      <div key={idx} className="p-4 rounded-2xl bg-slate-950/50 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <span className="font-bold text-blue-300 text-xs">
                            Cuenta Adicional #{idx + 2}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeCuentaBancaria(idx)}
                            className="text-red-400 hover:text-red-300 text-xs font-bold flex items-center gap-1"
                          >
                            <MinusCircle className="w-3.5 h-3.5" /> Eliminar
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-400 font-semibold mb-1">Banco</label>
                            <input
                              type="text"
                              value={cuenta.banco}
                              onChange={(e) => updateCuentaBancaria(idx, 'banco', e.target.value)}
                              placeholder="Ej: Davivienda, Nequi..."
                              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 font-semibold mb-1">Cédula Titular (CC)</label>
                            <input
                              type="text"
                              value={cuenta.cc_titular}
                              onChange={(e) => updateCuentaBancaria(idx, 'cc_titular', e.target.value)}
                              placeholder="Ej: 10203040"
                              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-400 font-semibold mb-1">Número de Cuenta</label>
                            <input
                              type="text"
                              value={cuenta.cuenta}
                              onChange={(e) => updateCuentaBancaria(idx, 'cuenta', e.target.value)}
                              placeholder="Ej: 001-987654-32"
                              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 font-semibold mb-1">Tipo de Cuenta</label>
                            <select
                              value={cuenta.tipo_cuenta}
                              onChange={(e) => updateCuentaBancaria(idx, 'tipo_cuenta', e.target.value)}
                              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none"
                            >
                              <option value="Ahorros">Ahorros</option>
                              <option value="Corriente">Corriente</option>
                              <option value="Daviplata/Nequi">Monedero (Nequi / Daviplata)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PLATAFORMAS */}
          {activeTab === 'plataformas' && (
            <div className="space-y-6">
              {/* IMile & J&T default platforms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-2xl bg-slate-950/70 border border-white/10">
                <div className="space-y-3">
                  <div className="font-bold text-white border-b border-white/10 pb-1 flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> iMile Express
                  </div>
                  <input
                    type="text"
                    value={formData.imile_usuario}
                    onChange={(e) => setFormData({ ...formData, imile_usuario: e.target.value })}
                    placeholder="Usuario / ID iMile"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-3">
                  <div className="font-bold text-white border-b border-white/10 pb-1 flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> J&T Express
                  </div>
                  <input
                    type="text"
                    value={formData.jyt_usuario}
                    onChange={(e) => setFormData({ ...formData, jyt_usuario: e.target.value })}
                    placeholder="Usuario / ID J&T (Auto-creado)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Additional platform manager */}
              <div className="space-y-3">
                <div className="font-bold text-slate-300 uppercase tracking-wider text-xs">
                  Otras Plataformas Adicionales ({formData.plataformas_adicionales.length})
                </div>
                
                {formData.plataformas_adicionales.length > 0 && (
                  <div className="space-y-2">
                    {formData.plataformas_adicionales.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/60 text-xs">
                        <div>
                          <strong className="text-white">{p.empresa}:</strong>
                          <span className="text-slate-300 ml-2">Usuario: {p.usuario}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePlatAdicional(i)}
                          className="text-red-400 hover:text-red-300 p-1"
                        >
                          <MinusCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end pt-2 border-t border-white/10">
                  <div>
                    <input
                      type="text"
                      value={newPlatEmpresa}
                      onChange={(e) => setNewPlatEmpresa(e.target.value)}
                      placeholder="Empresa (ej: Envía)"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={newPlatUsuario}
                      onChange={(e) => setNewPlatUsuario(e.target.value)}
                      placeholder="Usuario / ID"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addPlatAdicional}
                    disabled={!newPlatEmpresa.trim() || !newPlatUsuario.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Agregar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DOCUMENTOS Y ADJUNTOS */}
          {activeTab === 'documentos' && (
            <div className="space-y-6">
              {/* Profile Photo */}
              <div className="flex items-center gap-6 pb-4 border-b border-white/10">
                <div className="relative w-20 h-20 rounded-2xl border border-white/20 bg-slate-950 overflow-hidden flex items-center justify-center flex-shrink-0 group">
                  {formData.foto ? (
                    <>
                      <img src={formData.foto} alt="Profile preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeFile('foto')}
                        className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-red-400 font-bold text-xs"
                      >
                        Eliminar
                      </button>
                    </>
                  ) : (
                    <Camera className="w-8 h-8 text-slate-500" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-white text-xs">Foto de Perfil del Conductor</div>
                  <div className="text-[10px] text-slate-400 mb-2">Formato recomendado JPG/PNG. Máximo 3MB.</div>
                  <label className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs cursor-pointer font-semibold inline-block">
                    Seleccionar Foto
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'foto')} />
                  </label>
                </div>
              </div>

              {/* Standard Documents Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cédula Frontal */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                  <div className="font-bold text-white text-xs">Cédula (Lado Frontal)</div>
                  {formData.doc_cedula_frontal ? (
                    <div className="space-y-2">
                      <div className="h-28 rounded-xl border border-slate-700 overflow-hidden bg-black/40">
                        <img src={formData.doc_cedula_frontal} alt="Front ID" className="w-full h-full object-contain" />
                      </div>
                      <div className="flex justify-end">
                        <button type="button" onClick={() => removeFile('doc_cedula_frontal')} className="text-red-400 hover:text-red-300 text-[10px] font-bold">Eliminar</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-28 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl cursor-pointer bg-slate-900/50 text-slate-400 transition-all">
                      <Camera className="w-6 h-6 mb-1 text-slate-500" />
                      <span className="text-[10px] font-bold">Subir Lado Frontal</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'doc_cedula_frontal')} />
                    </label>
                  )}
                </div>

                {/* Cédula Trasera */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                  <div className="font-bold text-white text-xs">Cédula (Lado Trasero)</div>
                  {formData.doc_cedula_trasera ? (
                    <div className="space-y-2">
                      <div className="h-28 rounded-xl border border-slate-700 overflow-hidden bg-black/40">
                        <img src={formData.doc_cedula_trasera} alt="Back ID" className="w-full h-full object-contain" />
                      </div>
                      <div className="flex justify-end">
                        <button type="button" onClick={() => removeFile('doc_cedula_trasera')} className="text-red-400 hover:text-red-300 text-[10px] font-bold">Eliminar</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-28 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl cursor-pointer bg-slate-900/50 text-slate-400 transition-all">
                      <Camera className="w-6 h-6 mb-1 text-slate-500" />
                      <span className="text-[10px] font-bold">Subir Lado Trasero</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'doc_cedula_trasera')} />
                    </label>
                  )}
                </div>

                {/* Servicios Públicos */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                  <div className="font-bold text-white text-xs flex items-center justify-between">
                    <span>Servicios Públicos</span>
                    {formData.doc_servicios && <Badge variant="emerald">Cargado</Badge>}
                  </div>
                  {formData.doc_servicios ? (
                    <div className="flex flex-col justify-between h-28 p-3 rounded-xl border border-slate-700 bg-slate-900/60">
                      <div className="flex items-center gap-2">
                        <FileText className="w-8 h-8 text-blue-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-white truncate">Servicios Públicos</div>
                          <div className="text-[9px] text-slate-400">Documento Adjunto</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                        <a
                          href={formData.doc_servicios}
                          download="servicios_publicos.pdf"
                          className="text-blue-400 hover:underline text-[10px] font-bold flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Descargar
                        </a>
                        <button type="button" onClick={() => removeFile('doc_servicios')} className="text-red-400 hover:text-red-300 text-[10px] font-bold">Eliminar</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-28 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl cursor-pointer bg-slate-900/50 text-slate-400 transition-all">
                      <FileText className="w-6 h-6 mb-1 text-slate-500" />
                      <span className="text-[10px] font-bold">Subir Recibo de Servicios</span>
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileChange(e, 'doc_servicios')} />
                    </label>
                  )}
                </div>

                {/* Certificado Bancario */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                  <div className="font-bold text-white text-xs flex items-center justify-between">
                    <span>Certificado Bancario</span>
                    {formData.doc_certificado_bancario && <Badge variant="emerald">Cargado</Badge>}
                  </div>
                  {formData.doc_certificado_bancario ? (
                    <div className="flex flex-col justify-between h-28 p-3 rounded-xl border border-slate-700 bg-slate-900/60">
                      <div className="flex items-center gap-2">
                        <FileText className="w-8 h-8 text-blue-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-white truncate">Certificado Bancario</div>
                          <div className="text-[9px] text-slate-400">Documento Adjunto</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                        <a
                          href={formData.doc_certificado_bancario}
                          download="certificado_bancario.pdf"
                          className="text-blue-400 hover:underline text-[10px] font-bold flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Descargar
                        </a>
                        <button type="button" onClick={() => removeFile('doc_certificado_bancario')} className="text-red-400 hover:text-red-300 text-[10px] font-bold">Eliminar</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-28 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl cursor-pointer bg-slate-900/50 text-slate-400 transition-all">
                      <FileText className="w-6 h-6 mb-1 text-slate-500" />
                      <span className="text-[10px] font-bold">Subir Certificado Bancario</span>
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileChange(e, 'doc_certificado_bancario')} />
                    </label>
                  )}
                </div>
              </div>

              {/* Dynamic RUT Documents Section */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5 uppercase tracking-wider text-xs">
                      <FileText className="w-4 h-4 text-purple-400" />
                      Documentos RUT ({formData.docs_rut.length})
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Puedes subir varios documentos RUT y darles etiquetas (ej: <i>RUT Esneider</i>, <i>RUT Esposa</i>).
                    </div>
                  </div>
                </div>

                {/* Upload bar */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={newRutNombre}
                        onChange={(e) => setNewRutNombre(e.target.value)}
                        placeholder="Nombre / Identificador (ej: RUT Esneider)"
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none text-xs"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <label className="flex items-center justify-between h-8 px-3 rounded-xl border border-slate-700 bg-slate-950 cursor-pointer text-xs text-slate-300 truncate">
                        <span className="truncate">{newRutFileName || 'Seleccionar archivo (PDF/Imagen)'}</span>
                        <Camera className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 ml-1" />
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleRutFileChange} />
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={addRutDoc}
                        disabled={!newRutArchivo}
                        className="w-full h-8 px-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center justify-center gap-1 text-xs disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adjuntar
                      </button>
                    </div>
                  </div>
                </div>

                {/* RUT List */}
                {formData.docs_rut.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                    No hay documentos RUT adjuntados aún.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {formData.docs_rut.map((rut) => {
                      const isImg = rut.archivo && (rut.archivo.startsWith('data:image/') || rut.archivo.match(/\.(jpeg|jpg|gif|png|webp)$/i));
                      return (
                        <div key={rut.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 flex flex-col justify-between">
                          <div className="flex items-start gap-2 justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="w-5 h-5 text-purple-400 flex-shrink-0" />
                              <input
                                type="text"
                                value={rut.nombre}
                                onChange={(e) => updateRutNombre(rut.id, e.target.value)}
                                className="bg-transparent text-xs font-bold text-white focus:bg-slate-950 border-b border-transparent focus:border-purple-400 outline-none w-full truncate"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeRutDoc(rut.id)}
                              className="text-red-400 hover:text-red-300 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isImg && (
                            <div className="h-20 rounded-lg border border-slate-800 overflow-hidden bg-black/40">
                              <img src={rut.archivo} alt={rut.nombre} className="w-full h-full object-contain" />
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                            <a
                              href={rut.archivo}
                              download={`${rut.nombre}.pdf`}
                              className="text-purple-300 hover:underline text-[10px] font-bold flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" /> Descargar {rut.nombre}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: ALIAS Y CONCILIACIÓN */}
          {activeTab === 'alias' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-3">
                <label className="block text-slate-200 font-semibold flex items-center gap-1.5 text-xs">
                  <Tag className="w-4 h-4 text-purple-400" />
                  Variaciones de Nombre para Conciliación Automática (iMile / Planillas):
                </label>
                <p className="text-[11px] text-slate-400">
                  GeoFull V4 utiliza estos alias para reconocer automáticamente al domiciliario al importar planillas de entrega de iMile u otros proveedores, sin importar si su nombre está escrito de forma ligeramente diferente.
                </p>

                <div className="flex flex-wrap gap-2 py-2">
                  {formData.alias_nombres.map((alias) => (
                    <span
                      key={alias}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-200 font-medium flex items-center gap-2 text-xs"
                    >
                      {alias}
                      {formData.alias_nombres.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAlias(alias)}
                          className="text-purple-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <input
                    type="text"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }}
                    placeholder="Agregar otra variante de nombre para este conductor..."
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-purple-500 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddAlias}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors flex items-center gap-1 text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
