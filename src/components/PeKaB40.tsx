import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  RefreshCw, 
  Plus, 
  X, 
  AlertCircle, 
  User, 
  MapPin, 
  Calendar, 
  Smartphone, 
  ChevronLeft, 
  ChevronRight,
  Mail,
  Clock,
  FileEdit,
  Users,
  Trash2,
  Upload,
  ArrowRight,
  CheckCircle,
  Download,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  writeBatch 
} from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';
import Papa from 'papaparse';

interface PeKaB40Props {
  currentUser: UserProfile;
}

interface PeKaPatient {
  id: string; // doc ID in firestore
  no: string;
  patientId: string;
  name: string;
  ic: string;
  phone: string;
  address: string;
  postalCode: string;
  appointmentDate: string;
  remarks: string;
  time: string;
  additionalNotes: string;
  branch: string;
  createdAt: string;
}

interface ColumnMapping {
  patientId: string | null;
  name: string | null;
  ic: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  appointmentDate: string | null;
  remarks: string | null;
  time: string | null;
  additionalNotes: string | null;
  branch: string | null;
}

interface ImportedPatient {
  patientId: string;
  name: string;
  ic: string;
  phone: string;
  address: string;
  postalCode: string;
  appointmentDate: string;
  remarks: string;
  time: string;
  additionalNotes: string;
  branch: string;
  isValid: boolean;
  missingFields: string[];
  isDuplicate: boolean;
  rawData: any;
}

const InlineDateCell = ({
  patientId,
  initialValue,
  onSave,
}: {
  patientId: string;
  initialValue: string;
  onSave: (id: string, field: string, val: string) => Promise<void>;
}) => {
  const [val, setVal] = useState(initialValue || '');

  useEffect(() => {
    setVal(initialValue || '');
  }, [initialValue]);

  return (
    <div className="relative flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:border-slate-350 focus-within:border-indigo-600 focus-within:bg-white rounded-xl px-2 py-1 transition-all">
      <Calendar className="w-3.5 h-3.5 text-slate-400 pointer-events-none shrink-0" />
      <input
        type="date"
        value={val}
        onChange={(e) => {
          const newVal = e.target.value;
          setVal(newVal);
          onSave(patientId, 'appointmentDate', newVal);
        }}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch (err) {}
        }}
        className="w-full bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer"
      />
    </div>
  );
};

const InlineTimeCell = ({
  patientId,
  initialValue,
  onSave,
}: {
  patientId: string;
  initialValue: string;
  onSave: (id: string, field: string, val: string) => Promise<void>;
}) => {
  const [val, setVal] = useState(initialValue || '');

  useEffect(() => {
    setVal(initialValue || '');
  }, [initialValue]);

  const timeOptions = [
    '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
    '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM'
  ];

  return (
    <select
      value={val}
      onChange={(e) => {
        const newVal = e.target.value;
        setVal(newVal);
        onSave(patientId, 'time', newVal);
      }}
      className="px-2 py-1.5 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl outline-none cursor-pointer hover:bg-slate-100 transition-colors focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/30"
    >
      <option value="">- Time -</option>
      {timeOptions.map(t => (
        <option key={t} value={t}>{t}</option>
      ))}
      {val && !timeOptions.includes(val) && (
        <option value={val}>{val}</option>
      )}
    </select>
  );
};

const InlineBranchCell = ({
  patientId,
  initialValue,
  onSave,
}: {
  patientId: string;
  initialValue: string;
  onSave: (id: string, field: string, val: string) => Promise<void>;
}) => {
  const [val, setVal] = useState(initialValue || 'Kajang');

  useEffect(() => {
    setVal(initialValue || 'Kajang');
  }, [initialValue]);

  return (
    <select
      value={val}
      onChange={(e) => {
        const newVal = e.target.value;
        setVal(newVal);
        onSave(patientId, 'branch', newVal);
      }}
      className="px-2.5 py-1 text-[11px] font-black tracking-wide uppercase text-slate-700 bg-slate-100 border border-slate-200 rounded-xl outline-none cursor-pointer hover:bg-slate-200 transition-colors focus:bg-white focus:border-indigo-600"
    >
      <option value="Kajang">Kajang</option>
      <option value="Seri Kembangan">Seri Kembangan</option>
      <option value="Semenyih">Semenyih</option>
    </select>
  );
};

const InlineNotesCell = ({
  patientId,
  initialValue,
  onSave,
}: {
  patientId: string;
  initialValue: string;
  onSave: (id: string, field: string, val: string) => Promise<void>;
}) => {
  const [val, setVal] = useState(initialValue || '');

  useEffect(() => {
    setVal(initialValue || '');
  }, [initialValue]);

  const handleBlur = () => {
    if (val !== (initialValue || '')) {
      onSave(patientId, 'additionalNotes', val);
    }
  };

  return (
    <input
      type="text"
      value={val}
      placeholder="Add note..."
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      className="w-full min-w-[170px] max-w-[250px] text-xs text-slate-700 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 focus:bg-white focus:border-indigo-600 border border-slate-200 rounded-xl py-1 px-3 outline-none transition-all font-medium"
    />
  );
};

const getWhatsAppLink = (phone: string, msg: string) => {
  let cleaned = phone.trim().replace(/\D/g, ''); // remove non-digits
  if (cleaned.startsWith('0')) {
    cleaned = '6' + cleaned;
  } else if (!cleaned.startsWith('60') && cleaned.length > 5) {
    cleaned = '60' + cleaned;
  }
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(msg)}`;
};

const getWhatsAppMessage = (p: PeKaPatient) => {
  const statusVal = String(p.remarks || '').trim().toLowerCase();
  const nama_pesakit = p.name || 'Tuan/Puan';
  const appt_date = p.appointmentDate || '-';
  const appt_time = p.time || '-';
  const lokasi_klinik = p.branch ? `Klinik ARA 24 Jam (${p.branch})` : 'Klinik ARA 24 Jam';

  if (statusVal === 'appt given') {
    return `Salam Tuan/Puan ${nama_pesakit},\n` +
           `Saya dari Klinik ARA 24 Jam ingin memaklumkan bahawa tarikh temu janji saringan kesihatan percuma PeKa B40 Tuan/Puan adalah seperti berikut:\n\n` +
           `📅 Tarikh: ${appt_date}\n` +
           `⏰ Masa: ${appt_time}\n` +
           `🏥 Lokasi: ${lokasi_klinik}\n\n` +
           `Boleh hadir tepat pada masa yang ditetapkan dan bawa bersama dokumen pengenalan diri untuk tujuan pengesahan.\n` +
           `Sekiranya ada sebarang pertanyaan atau keperluan untuk menukar tarikh, boleh maklumkan kepada pihak klinik.\n\n` +
           `Terima kasih,\nKlinik ARA 24 Jam`;
  } else {
    return `Salam Tuan/Puan ${nama_pesakit},\n\n` +
           `Tuan/Puan layak untuk menjalani saringan kesihatan percuma di bawah program PeKa B40 di Klinik ARA 24 Jam. ` +
           `Antara ujian yang akan dijalankan termasuklah ujian sel darah, ujian kawalan gula darah, ujian paras kolesterol, ` +
           `ujian fungsi buah pinggang dan ujian air kencing.\n\n` +
           `Sekiranya berminat untuk membuat temu janji, boleh hubungi kami semula.\n\n` +
           `Terima kasih,\nKlinik ARA 24 Jam`;
  }
};

export default function PeKaB40({ currentUser }: PeKaB40Props) {
  // Local Database patients loaded from Firestore
  const [patients, setPatients] = useState<PeKaPatient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('All');
  const [remarksFilter, setRemarksFilter] = useState('All');
  const [postcodeFilter, setPostcodeFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Single patient Modals & Drawers
  const [selectedPatient, setSelectedPatient] = useState<PeKaPatient | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Form states for Editing / Adding
  const [formName, setFormName] = useState('');
  const [formIC, setFormIC] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPostalCode, setFormPostalCode] = useState('');
  const [formApptDate, setFormApptDate] = useState('');
  const [formRemarks, setFormRemarks] = useState('Not contacted yet');
  const [formTime, setFormTime] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formBranch, setFormBranch] = useState('Kajang');
  const [formCustomId, setFormCustomId] = useState('');

  // CSV Import States
  const [showCSVImportModal, setShowCSVImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    patientId: null,
    name: null,
    ic: null,
    phone: null,
    address: null,
    postalCode: null,
    appointmentDate: null,
    remarks: null,
    time: null,
    additionalNotes: null,
    branch: null,
  });
  const [importedPatients, setImportedPatients] = useState<ImportedPatient[]>([]);
  const [selectedImportRows, setSelectedImportRows] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Dropdown options for remarks/status
  const remarksOptions = [
    'refuse',
    'to call again',
    'appt given',
    'not contacted yet',
    'done pekab40'
  ];

  const normalizeRemarks = (remarks: string | null | undefined): string => {
    if (!remarks) return 'not contacted yet';
    const clean = remarks.trim().toLowerCase();
    
    if (clean === 'refuse' || clean.includes('refuse') || clean.includes('tolak')) {
      return 'refuse';
    }
    if (clean === 'done pekab40' || clean.includes('done') || clean.includes('siap') || clean.includes('selesai')) {
      return 'done pekab40';
    }
    if (
      clean === 'appt given' || 
      clean === 'appt date given' || 
      clean.includes('appt') || 
      clean.includes('appointment') || 
      clean.includes('temujanji') || 
      clean.includes('date given')
    ) {
      return 'appt given';
    }
    if (
      clean === 'to call again' || 
      clean.includes('call again') || 
      clean.includes('hubungi semula') || 
      clean.includes('not answered') || 
      clean.includes('no answer') || 
      clean.includes('whatsapp') || 
      clean.includes('wrong number') || 
      clean.includes('out of service') || 
      clean.includes('contact again')
    ) {
      return 'to call again';
    }
    if (clean.includes('not contacted') || clean.includes('belum hubung') || clean.includes('belum')) {
      return 'not contacted yet';
    }
    
    const matched = remarksOptions.find(opt => clean.includes(opt));
    if (matched) return matched;

    return 'not contacted yet';
  };

  const formatRemarkOption = (option: string) => {
    if (!option) return '';
    const o = option.trim().toLowerCase();
    if (o === 'done pekab40') return 'Done PeKaB40';
    if (o === 'appt given') return 'Appt Given';
    return o.replace(/\b\w/g, c => c.toUpperCase());
  };

  const handleUpdateRemarks = async (patientId: string, newRemarks: string) => {
    try {
      const normRemarks = normalizeRemarks(newRemarks);
      const docRef = doc(db, 'peka_b40_patients', patientId);
      await setDoc(docRef, { remarks: normRemarks }, { merge: true });
      
      const p = patients.find(pat => pat.id === patientId);
      const name = p ? p.name : 'Patient';

      setPatients(prev => prev.map(p => p.id === patientId ? { ...p, remarks: normRemarks } : p));
      toast.success(`Updated status for ${name} to "${formatRemarkOption(normRemarks)}"`);
    } catch (error: any) {
      console.error("Failed to update status:", error);
      toast.error(`Failed to update status: ${error.message}`);
    }
  };

  const handleUpdateField = async (patientId: string, field: string, value: string) => {
    try {
      const docRef = doc(db, 'peka_b40_patients', patientId);
      await setDoc(docRef, { [field]: value }, { merge: true });
      
      setPatients(prev => prev.map(p => p.id === patientId ? { ...p, [field]: value } : p));
      
      const p = patients.find(pat => pat.id === patientId);
      const name = p ? p.name : 'Patient';

      let displayField = field;
      if (field === 'appointmentDate') displayField = 'Appointment Date';
      if (field === 'time') displayField = 'Time';
      if (field === 'branch') displayField = 'Cawangan';
      if (field === 'additionalNotes') displayField = 'Additional Notes';

      toast.success(`Updated ${displayField} for ${name} to "${value || '-'}"`);
    } catch (error: any) {
      console.error(`Failed to update ${field}:`, error);
      toast.error(`Failed to update ${field}: ${error.message}`);
    }
  };

  // Load firestore data on mount
  useEffect(() => {
    loadFirestoreData();
  }, []);

  // Fetch from firestore collection 'peka_b40_patients'
  const loadFirestoreData = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'peka_b40_patients'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const list: PeKaPatient[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          no: data.no || '',
          patientId: data.patientId || '',
          name: data.name || '',
          ic: data.ic || '',
          phone: data.phone || '',
          address: data.address || '',
          postalCode: data.postalCode || '',
          appointmentDate: data.appointmentDate || '',
          remarks: normalizeRemarks(data.remarks),
          time: data.time || '',
          additionalNotes: data.additionalNotes || '',
          branch: data.branch || 'Kajang',
          createdAt: data.createdAt || ''
        });
      });
      setPatients(list);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (error: any) {
      console.error("Error reading peka_b40_patients:", error);
      toast.error("Failed to load PeKa B40 patient records: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Save changes for editing
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    if (!formName.trim() || !formPhone.trim() || !formIC.trim()) {
      toast.error("Name, IC No, and Phone number are required fields.");
      return;
    }

    setIsUpdating(true);
    try {
      const docRef = doc(db, 'peka_b40_patients', selectedPatient.id);
      const updatedData = {
        name: formName.trim().toUpperCase(),
        ic: formIC.trim(),
        phone: formPhone.trim().replace(/\s+/g, ''),
        address: formAddress.trim(),
        postalCode: formPostalCode.trim(),
        appointmentDate: formApptDate,
        remarks: normalizeRemarks(formRemarks),
        time: formTime.trim(),
        additionalNotes: formNotes.trim(),
        branch: formBranch,
        patientId: formCustomId.trim()
      };

      await setDoc(docRef, updatedData, { merge: true });
      toast.success(`Successfully updated details for ${formName}!`);
      setIsEditModalOpen(false);
      setSelectedPatient(null);
      loadFirestoreData();
    } catch (error: any) {
      console.error("Failed to save edited patient details:", error);
      toast.error(`Failed to save record: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Add individual patient
  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim() || !formIC.trim()) {
      toast.error("Name, IC, and No Telefon are required fields.");
      return;
    }

    setIsUpdating(true);
    try {
      // Find the next serial number
      const nextNo = patients.length > 0 
        ? String(Math.max(...patients.map(p => parseInt(p.no) || 0)) + 1)
        : '1';

      const nextId = formCustomId.trim() || `PK-${Date.now().toString().slice(-6)}`;

      const newPatientData = {
        no: nextNo,
        patientId: nextId,
        name: formName.trim().toUpperCase(),
        ic: formIC.trim(),
        phone: formPhone.trim().replace(/\s+/g, ''),
        address: formAddress.trim(),
        postalCode: formPostalCode.trim(),
        appointmentDate: formApptDate,
        remarks: normalizeRemarks(formRemarks),
        time: formTime.trim(),
        additionalNotes: formNotes.trim(),
        branch: formBranch,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'peka_b40_patients'), newPatientData);
      toast.success(`Patient "${formName}" successfully added!`);
      setIsAddModalOpen(false);
      loadFirestoreData();
    } catch (err: any) {
      console.error("Failed to append patient record:", err);
      toast.error(`Failed to add record: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete individual patient
  const handleDeletePatient = async (patient: PeKaPatient) => {
    const isConfirmed = window.confirm(`Are you sure you want to delete patient "${patient.name}"?`);
    if (!isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'peka_b40_patients', patient.id));
      toast.success(`Successfully deleted patient "${patient.name}"`);
      loadFirestoreData();
    } catch (error: any) {
      console.error("Delete patient error:", error);
      toast.error("Failed to delete patient record: " + error.message);
    }
  };

  // Open modals with prefilled data
  const handleOpenEdit = (p: PeKaPatient) => {
    setSelectedPatient(p);
    setFormName(p.name);
    setFormIC(p.ic);
    setFormPhone(p.phone);
    setFormAddress(p.address);
    setFormPostalCode(p.postalCode);
    setFormApptDate(p.appointmentDate);
    setFormRemarks(normalizeRemarks(p.remarks));
    setFormTime(p.time);
    setFormNotes(p.additionalNotes);
    setFormBranch(p.branch || 'Kajang');
    setFormCustomId(p.patientId);
    setIsEditModalOpen(true);
  };

  const handleOpenAdd = () => {
    setFormName('');
    setFormIC('');
    setFormPhone('');
    setFormAddress('');
    setFormPostalCode('');
    setFormApptDate('');
    setFormRemarks('not contacted yet');
    setFormTime('');
    setFormNotes('');
    setFormBranch(currentUser.branch || 'Kajang');
    setFormCustomId('');
    setIsAddModalOpen(true);
  };

  // CSV Parsing Handlers
  const handleCSVFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          toast.error(`Error parsing CSV file: ${results.errors[0].message}`);
          return;
        }

        if (!results.data || results.data.length === 0) {
          toast.error("This CSV file contains no readable rows.");
          return;
        }

        const headers = results.meta.fields || [];
        if (headers.length === 0) {
          toast.error("Could not determine headers in your file.");
          return;
        }

        setCsvHeaders(headers);
        setCsvData(results.data);
        autoDetectMapping(headers);
        setImportStep('mapping');
        toast.success(`Successfully parsed ${results.data.length} rows from CSV`);
      },
      error: (err) => {
        toast.error(`Failed to read file: ${err.message}`);
      }
    });

    e.target.value = '';
  };

  // Smart detect Malay/English heading matching
  const autoDetectMapping = (headers: string[]) => {
    const mapping: ColumnMapping = {
      patientId: null,
      name: null,
      ic: null,
      phone: null,
      address: null,
      postalCode: null,
      appointmentDate: null,
      remarks: null,
      time: null,
      additionalNotes: null,
      branch: null,
    };

    headers.forEach(header => {
      const lower = header.toLowerCase().trim();

      if (lower === 'id' || lower.includes('patient id') || lower.includes('patientid')) {
        mapping.patientId = header;
      } else if (lower.includes('name') || lower.includes('nama') || lower === 'nama penuh') {
        mapping.name = header;
      } else if (lower.includes('ic') || lower.includes('kp') || lower.includes('kad pengenalan') || lower.includes('nokp') || lower.includes('k/p')) {
        mapping.ic = header;
      } else if (lower.includes('phone') || lower.includes('tel') || lower.includes('mobile') || lower.includes('telefon') || lower.includes('handphone') || lower.includes('no telefon')) {
        mapping.phone = header;
      } else if (lower.includes('address') || lower.includes('alamat')) {
        mapping.address = header;
      } else if (lower.includes('postal') || lower.includes('poskod') || lower.includes('postcode') || lower.includes('postalcode')) {
        mapping.postalCode = header;
      } else if (lower.includes('appointment') || lower.includes('appt') || lower.includes('date') || lower.includes('tarikh') || lower.includes('temujanji')) {
        mapping.appointmentDate = header;
      } else if (lower.includes('remark') || lower.includes('status') || lower.includes('catatan status')) {
        mapping.remarks = header;
      } else if (lower.includes('time') || lower.includes('masa')) {
        mapping.time = header;
      } else if (lower.includes('note') || lower.includes('additional') || lower.includes('ulasan') || lower.includes('catatan')) {
        mapping.additionalNotes = header;
      } else if (lower.includes('branch') || lower.includes('cawangan') || lower.includes('klinik')) {
        mapping.branch = header;
      }
    });

    setColumnMapping(mapping);
  };

  const handleMappingChange = (field: keyof ColumnMapping, column: string | null) => {
    setColumnMapping(prev => ({ ...prev, [field]: column }));
  };

  const applyMappingAndPreview = async () => {
    if (!columnMapping.name) {
      toast.error("Please map the 'Name' column to proceed.");
      return;
    }
    if (!columnMapping.ic) {
      toast.error("Please map the 'IC' column to proceed.");
      return;
    }
    if (!columnMapping.phone) {
      toast.error("Please map the 'Handphone' column to proceed.");
      return;
    }

    setIsImporting(true);
    try {
      const existingIcs = new Set(patients.map(p => p.ic.trim().replace(/[-\s]/g, '')));
      const existingPhones = new Set(patients.map(p => p.phone.trim().replace(/[-\s]/g, '')));

      const parsed: ImportedPatient[] = csvData.map((row, index) => {
        const val = (field: keyof ColumnMapping) => {
          const mappedCol = columnMapping[field];
          return mappedCol ? String(row[mappedCol] || '').trim() : '';
        };

        const rawName = val('name');
        const rawIc = val('ic').replace(/[-\s]/g, '');
        const rawPhone = val('phone').replace(/[-\s]/g, '');

        const missingFields: string[] = [];
        if (!rawName) missingFields.push('Name');
        if (!val('ic')) missingFields.push('IC');
        if (!val('phone')) missingFields.push('Handphone');

        const isDuplicate = existingIcs.has(rawIc) || (rawPhone ? existingPhones.has(rawPhone) : false);

        return {
          patientId: val('patientId') || `PK-${Date.now().toString().slice(-4)}-${index + 1}`,
          name: rawName.toUpperCase(),
          ic: val('ic'),
          phone: val('phone'),
          address: val('address'),
          postalCode: val('postalCode'),
          appointmentDate: val('appointmentDate'),
          remarks: normalizeRemarks(val('remarks')),
          time: val('time'),
          additionalNotes: val('additionalNotes'),
          branch: val('branch') || currentUser.branch || 'Kajang',
          isValid: !missingFields.includes('Name') && !missingFields.includes('IC'),
          missingFields,
          isDuplicate,
          rawData: row
        };
      });

      setImportedPatients(parsed);
      
      const validNonDupIndices = parsed
        .map((p, idx) => (!p.isValid || p.isDuplicate) ? -1 : idx)
        .filter(idx => idx !== -1);
      
      setSelectedImportRows(new Set(validNonDupIndices));
      setImportStep('preview');

      const duplicatesCount = parsed.filter(p => p.isDuplicate).length;
      if (duplicatesCount > 0) {
        toast.warning(`Found ${duplicatesCount} patients with matching IC/Handphone already in database.`);
      } else {
        toast.success("Ready to import! Select rows and import below.");
      }
    } catch (e: any) {
      toast.error("Analysis failed: " + e.message);
    } finally {
      setIsImporting(false);
    }
  };

  const executeCsvBatchImport = async () => {
    const indicesToImport = Array.from(selectedImportRows);
    if (indicesToImport.length === 0) {
      toast.error("Please select at least 1 record to import.");
      return;
    }

    setIsImporting(true);
    let currentCount = 0;
    const totalToImport = indicesToImport.length;
    setImportProgress({ current: 0, total: totalToImport });

    try {
      const CHUNK_SIZE = 100;
      const chunks: number[][] = [];
      for (let i = 0; i < indicesToImport.length; i += CHUNK_SIZE) {
        chunks.push(indicesToImport.slice(i, i + CHUNK_SIZE));
      }

      let serialCounter = patients.length > 0
        ? Math.max(...patients.map(p => parseInt(p.no) || 0)) + 1
        : 1;

      for (const chunk of chunks) {
        const batch = writeBatch(db);

        chunk.forEach((idx) => {
          const patient = importedPatients[idx];
          const newDocRef = doc(collection(db, 'peka_b40_patients'));
          
          batch.set(newDocRef, {
            no: String(serialCounter++),
            patientId: patient.patientId,
            name: patient.name,
            ic: patient.ic,
            phone: patient.phone.replace(/\s+/g, ''),
            address: patient.address,
            postalCode: patient.postalCode,
            appointmentDate: patient.appointmentDate,
            remarks: normalizeRemarks(patient.remarks),
            time: patient.time,
            additionalNotes: patient.additionalNotes,
            branch: patient.branch,
            createdAt: new Date().toISOString()
          });
        });

        await batch.commit();
        currentCount += chunk.length;
        setImportProgress({ current: currentCount, total: totalToImport });
      }

      toast.success(`Success! Imported ${totalToImport} patient records.`);
      setShowCSVImportModal(false);
      loadFirestoreData();
    } catch (error: any) {
      console.error("Batch write failed:", error);
      toast.error("Failed to save records: " + error.message);
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "No.,ID,Name,IC,Handphone,Address,PostalCode,Next Appointment Date,Remarks,Time,Additional Notes,Cawangan\n"
      + "1,PK-001,MOHAMMAD BIN ALI,891102145311,0123456789,No 12 Jalan Kajang Perdana,43000,2026-06-15,Not contacted yet,10:00 AM,Ulasan tambahan,Kajang\n"
      + "2,PK-002,FATIMAH BINTI OTHMAN,920412105432,0198765432,Apartment Seri Kenanga,43300,2026-06-16,Appt date given,11:30 AM,WhatsApp sent,Seri Kembangan\n";
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "peka_b40_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statsBaseList = patients.filter(p => {
    const nameStr = String(p.name || '').toLowerCase();
    const icStr = String(p.ic || '');
    const phoneStr = String(p.phone || '');
    const patientIdStr = String(p.patientId || '').toLowerCase();
    const searchLower = (searchTerm || '').toLowerCase();

    const matchesSearch = 
      nameStr.includes(searchLower) ||
      icStr.includes(searchLower) ||
      phoneStr.includes(searchLower) ||
      patientIdStr.includes(searchLower);
      
    const matchesBranch = branchFilter === 'All' || p.branch === branchFilter;
    const matchesPostcode = postcodeFilter === 'All' || String(p.postalCode || '').trim() === postcodeFilter;
    
    return matchesSearch && matchesBranch && matchesPostcode;
  });

  const filteredPatients = patients.filter(p => {
    const nameStr = String(p.name || '').toLowerCase();
    const icStr = String(p.ic || '');
    const phoneStr = String(p.phone || '');
    const patientIdStr = String(p.patientId || '').toLowerCase();
    const searchLower = (searchTerm || '').toLowerCase();

    const matchesSearch = 
      nameStr.includes(searchLower) ||
      icStr.includes(searchLower) ||
      phoneStr.includes(searchLower) ||
      patientIdStr.includes(searchLower);
      
    const matchesBranch = branchFilter === 'All' || p.branch === branchFilter;
    const matchesRemarks = remarksFilter === 'All' || p.remarks === remarksFilter;
    const matchesPostcode = postcodeFilter === 'All' || String(p.postalCode || '').trim() === postcodeFilter;
    
    return matchesSearch && matchesBranch && matchesRemarks && matchesPostcode;
  });

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPatients = filteredPatients.slice(startIndex, startIndex + itemsPerPage);

  const uniquePostcodes = Array.from(
    new Set(
      patients
        .map(p => String(p.postalCode || '').trim())
        .filter(Boolean)
    )
  ).sort();

  const nearestAppointments = useMemo(() => {
    const todayStr = "2026-05-25";
    
    return patients
      .filter(p => {
        const matchesBranch = branchFilter === 'All' || p.branch === branchFilter;
        const matchesPostcode = postcodeFilter === 'All' || String(p.postalCode || '').trim() === postcodeFilter;
        return matchesBranch && matchesPostcode && p.appointmentDate && p.appointmentDate.trim() !== '';
      })
      .map(p => {
        const parts = p.appointmentDate.split('-');
        let timeVal = 0;
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          timeVal = new Date(y, m, d).getTime();
        } else {
          timeVal = new Date(p.appointmentDate || '').getTime() || 0;
        }
        return { ...p, timeVal };
      })
      .sort((a, b) => {
        const aIsUpcoming = a.appointmentDate >= todayStr;
        const bIsUpcoming = b.appointmentDate >= todayStr;
        
        if (aIsUpcoming && !bIsUpcoming) return -1;
        if (!aIsUpcoming && bIsUpcoming) return 1;
        
        if (aIsUpcoming && bIsUpcoming) {
          return a.timeVal - b.timeVal;
        } else {
          return b.timeVal - a.timeVal;
        }
      })
      .slice(0, 4);
  }, [patients, branchFilter, postcodeFilter]);

  const getStatusBadgeClass = (status: string) => {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'appt given' || s === 'appt date given') {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase';
    }
    if (s === 'done pekab40') {
      return 'bg-sky-50 text-sky-700 border border-sky-100 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase';
    }
    if (s === 'to call again' || s === 'whatsapp sent') {
      return 'bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase';
    }
    if (s === 'not contacted yet') {
      return 'bg-slate-50 text-slate-600 border border-slate-200 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase';
    }
    if (s === 'refuse') {
      return 'bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase';
    }
    return 'bg-slate-50 text-slate-600 border border-slate-200 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase';
  };

  return (
    <div className="space-y-6">
      {/* Upper Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-emerald-700" />
            PeKa B40 Patients
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time database tables for PeKa B40 with filters, manual management, and robust Excel/CSV file imports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadFirestoreData}
            disabled={isLoading}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl bg-white hover:bg-slate-50 text-xs font-bold transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            REFRESH
          </button>

          <button
            onClick={() => {
              setImportStep('upload');
              setCsvHeaders([]);
              setCsvData([]);
              setImportedPatients([]);
              setSelectedImportRows(new Set());
              setShowCSVImportModal(true);
            }}
            className="px-4 py-2 border border-emerald-200 text-emerald-800 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            IMPORT CSV
          </button>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-950 text-white rounded-xl font-bold text-xs hover:bg-indigo-900 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            ADD PATIENT
          </button>
        </div>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 md:grid-cols-3 gap-4">
        {/* Total Records */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">Total Records</span>
            <span className="text-3xl font-black text-slate-900 block mt-1">{statsBaseList.length}</span>
          </div>
          <div className="w-12 h-12 bg-slate-50 text-slate-750 border border-slate-100 rounded-xl flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Not Contacted Yet */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">Not Contacted Yet</span>
            <span className="text-3xl font-black text-slate-700 block mt-1">
              {statsBaseList.filter(p => p.remarks === 'not contacted yet').length}
            </span>
          </div>
          <div className="w-12 h-12 bg-slate-50 text-slate-650 border border-slate-100 rounded-xl flex items-center justify-center shrink-0">
            <User className="w-6 h-6" />
          </div>
        </div>

        {/* Appointments Set */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-widest block">Appointments Set</span>
            <span className="text-3xl font-black text-emerald-600 block mt-1">
              {statsBaseList.filter(p => p.remarks === 'appt given').length}
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        {/* To Call Again */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-widest block font-sans">To Call Again</span>
            <span className="text-3xl font-black text-indigo-600 block mt-1 font-sans">
              {statsBaseList.filter(p => p.remarks === 'to call again').length}
            </span>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-750 rounded-xl flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Closed / Refused */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between col-span-2 md:col-span-1">
          <div>
            <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-widest block">Closed / Refused</span>
            <span className="text-3xl font-black text-rose-600 block mt-1">
              {statsBaseList.filter(p => p.remarks === 'refuse').length}
            </span>
          </div>
          <div className="w-12 h-12 bg-rose-50 text-rose-700 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search PeKa patients by Name, IC, ID, Phone..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm rounded-xl placeholder-slate-400 font-semibold outline-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400 font-extrabold uppercase tracking-wider whitespace-nowrap hidden lg:inline">Cawangan:</span>
            <select
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-44 px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white text-xs font-bold rounded-xl outline-none transition-colors"
            >
              <option value="All">All Cawangan</option>
              <option value="Kajang">Kajang</option>
              <option value="Seri Kembangan">Seri Kembangan</option>
              <option value="Semenyih">Semenyih</option>
            </select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400 font-extrabold uppercase tracking-wider whitespace-nowrap hidden lg:inline">Status:</span>
            <select
              value={remarksFilter}
              onChange={(e) => {
                setRemarksFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white text-xs font-bold rounded-xl outline-none transition-colors"
            >
              <option value="All">All Statuses</option>
              {remarksOptions.map(option => (
                <option key={option} value={option}>{formatRemarkOption(option)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400 font-extrabold uppercase tracking-wider whitespace-nowrap hidden lg:inline">Poskod:</span>
            <select
              value={postcodeFilter}
              onChange={(e) => {
                setPostcodeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-36 px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white text-xs font-bold rounded-xl outline-none transition-colors"
            >
              <option value="All">All Poskod</option>
              {uniquePostcodes.map(pc => (
                <option key={pc} value={pc}>{pc}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Nearest Upcoming Appointments Box */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Nearest Upcoming Appointments</h3>
              <p className="text-[10px] text-slate-400 font-bold">Closest scheduled healthcare saringan slots for selected cawangan/poskod</p>
            </div>
          </div>
          <span className="text-[10px] font-extrabold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
            {nearestAppointments.length} Found
          </span>
        </div>

        {nearestAppointments.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
            <p className="text-xs text-slate-400 font-bold">No upcoming appointments found for the selected cawangan or poskod.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {nearestAppointments.map(p => {
              const formattedDate = p.appointmentDate
                ? p.appointmentDate.split('-').reverse().join('/')
                : '-';
              return (
                <div 
                  key={`nearest-appt-${p.id}`} 
                  className="p-4 bg-slate-50/50 hover:bg-slate-50 border border-slate-150 hover:border-indigo-300 rounded-2xl transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[9px] font-black text-indigo-800 uppercase bg-indigo-50 px-2 py-0.5 rounded-md tracking-wider">
                        {p.branch || 'Klinik ARA'}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 font-mono">
                        ID: {p.patientId || p.no || 'NA'}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-black text-slate-900 line-clamp-1 group-hover:text-indigo-950 font-sans" title={p.name}>
                        {p.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-bold mt-1 flex items-center gap-1 font-mono">
                        <Smartphone className="w-3 h-3 text-slate-400 shrink-0" />
                        {p.phone || '-'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-600 font-extrabold font-mono">
                      <span className="flex items-center gap-1 text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {formattedDate}
                      </span>
                      <span className="flex items-center gap-1 text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {p.time || '-'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 pt-2 border-t border-slate-200/60">
                    {p.phone ? (
                      <a
                        href={getWhatsAppLink(p.phone, getWhatsAppMessage(p))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1 text-[10px] font-extrabold cursor-pointer font-sans"
                        title="Send WhatsApp Message"
                      >
                        <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.703 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                      </a>
                    ) : (
                      <span className="flex-1 p-1.5 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center text-[10px] font-extrabold font-sans">
                        No Phone
                      </span>
                    )}
                    <button
                      onClick={() => handleOpenEdit(p)}
                      className="p-1.5 px-3 border border-slate-200 text-slate-600 hover:text-indigo-950 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-extrabold cursor-pointer font-sans"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Records Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-10 h-10 text-indigo-950 animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-semibold">Communicating with Firestore database...</p>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-100 text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-slate-900 font-bold text-base">No PeKa B40 Patients Found</p>
            <p className="text-slate-400 text-xs mt-1">You can add individual records on top, or click `Import CSV` on top to upload your file.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[1000px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200">
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Name</th>
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-32">IC</th>
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-24">PostalCode</th>
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-40">Next Appointment Date</th>
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-32">Remarks</th>
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-20">Time</th>
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Additional Notes</th>
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-28">Cawangan</th>
                  <th className="px-5 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedPatients.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-slate-900 uppercase truncate max-w-[160px]" title={p.name}>
                        {p.name}
                      </p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-600 font-mono">
                      {p.ic || '-'}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                      {p.postalCode || '-'}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <InlineDateCell
                        patientId={p.id}
                        initialValue={p.appointmentDate}
                        onSave={handleUpdateField}
                      />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <select
                        value={String(p.remarks || 'not contacted yet').trim().toLowerCase()}
                        onChange={(e) => handleUpdateRemarks(p.id, e.target.value)}
                        className={cn(
                          getStatusBadgeClass(p.remarks || 'not contacted yet'),
                          "cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-600 appearance-none pr-8 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_8px_center] bg-no-repeat transition-all font-bold tracking-wide"
                        )}
                      >
                        {remarksOptions.map(option => (
                          <option key={option} value={option} className="bg-white text-slate-800 normal-case font-semibold">
                            {formatRemarkOption(option)}
                          </option>
                        ))}
                        {p.remarks && !remarksOptions.includes(String(p.remarks).trim().toLowerCase()) && (
                          <option value={String(p.remarks).trim().toLowerCase()} className="bg-white text-slate-800 normal-case font-semibold">
                            {p.remarks}
                          </option>
                        )}
                      </select>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <InlineTimeCell
                        patientId={p.id}
                        initialValue={p.time}
                        onSave={handleUpdateField}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <InlineNotesCell
                        patientId={p.id}
                        initialValue={p.additionalNotes}
                        onSave={handleUpdateField}
                      />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <InlineBranchCell
                        patientId={p.id}
                        initialValue={p.branch}
                        onSave={handleUpdateField}
                      />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.phone && (
                          <a
                            href={getWhatsAppLink(p.phone, getWhatsAppMessage(p))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                            title="Send WhatsApp Message"
                          >
                            <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.703 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            WhatsApp
                          </a>
                        )}
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="p-1 px-2 border border-slate-200 text-slate-600 hover:text-indigo-950 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer font-sans"
                        >
                          <FileEdit className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePatient(p)}
                          className="p-1 text-rose-600 hover:text-rose-850 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold">
              Showing <b>{startIndex + 1}</b> - <b>{Math.min(startIndex + itemsPerPage, filteredPatients.length)}</b> of <b>{filteredPatients.length}</b> records
            </span>
            
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <span className="text-xs text-slate-700 font-bold flex items-center px-1">
                Page {currentPage} of {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {lastRefreshed && (
        <p className="text-[10px] text-slate-400 text-right italic font-semibold">
          Last updated: {lastRefreshed}
        </p>
      )}

      {/* MODAL: ADD PATIENT */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-indigo-950/2">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-950" />
                Add PeKa B40 Patient
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddPatient} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">IC No. *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 891122105432"
                    value={formIC}
                    onChange={(e) => setFormIC(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Handphone *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0123456789"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Patient ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="PK-001"
                    value={formCustomId}
                    onChange={(e) => setFormCustomId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Alamat Kediaman (Address)</label>
                <input
                  type="text"
                  placeholder="Street and house details"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">PostalCode</label>
                  <input
                    type="text"
                    placeholder="e.g. 43000"
                    value={formPostalCode}
                    onChange={(e) => setFormPostalCode(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cawangan *</label>
                  <select
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  >
                    <option value="Kajang">Kajang</option>
                    <option value="Seri Kembangan">Seri Kembangan</option>
                    <option value="Semenyih">Semenyih</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Remarks Status</label>
                  <select
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-55/60 border border-slate-200 text-xs font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  >
                    {remarksOptions.map(option => (
                      <option key={option} value={option}>{formatRemarkOption(option)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Next Appointment Date</label>
                  <input
                    type="date"
                    value={formApptDate}
                    onChange={(e) => setFormApptDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-55/60 border border-slate-200 text-xs font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 10:00 AM"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-55/60 border border-slate-200 text-xs font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Additional Notes</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Insert extra observations or details here..."
                  className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-xs font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 px-4 py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isUpdating ? "Saving..." : "Add Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PATIENT */}
      {isEditModalOpen && selectedPatient && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-indigo-950/2">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileEdit className="w-5 h-5 text-indigo-950" />
                Modify PeKa Patient
              </h3>
              <button 
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedPatient(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">IC No. *</label>
                  <input
                    type="text"
                    required
                    value={formIC}
                    onChange={(e) => setFormIC(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Handphone *</label>
                  <input
                    type="text"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Patient ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="PK-001"
                    value={formCustomId}
                    onChange={(e) => setFormCustomId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Alamat Kediaman (Address)</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">PostalCode</label>
                  <input
                    type="text"
                    value={formPostalCode}
                    onChange={(e) => setFormPostalCode(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cawangan</label>
                  <select
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-sm font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  >
                    <option value="Kajang">Kajang</option>
                    <option value="Seri Kembangan">Seri Kembangan</option>
                    <option value="Semenyih">Semenyih</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Remarks Status</label>
                  <select
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-55/60 border border-slate-200 text-xs font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  >
                    {remarksOptions.map(option => (
                      <option key={option} value={option}>{formatRemarkOption(option)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Next Appointment Date</label>
                  <input
                    type="date"
                    value={formApptDate}
                    onChange={(e) => setFormApptDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-55/60 border border-slate-200 text-xs font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Time</label>
                  <input
                    type="text"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-55/60 border border-slate-200 text-xs font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Additional Notes</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-55/60 border border-slate-200 text-xs font-semibold rounded-xl focus:bg-white focus:border-indigo-600 outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedPatient(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 px-4 py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isUpdating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCEL/CSV IMPORT FLOW */}
      {showCSVImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/20">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                  Import PeKa B40 Patients from CSV
                </h3>
                <p className="text-xs text-slate-500 mt-1">Upload files with corresponding patient values to perform bulk import.</p>
              </div>
              <button 
                onClick={() => setShowCSVImportModal(false)}
                className="p-1 px-2 text-slate-400 hover:text-slate-650 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Indicators */}
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-150 flex items-center gap-6">
              <span className={cn(
                "text-xs font-bold flex items-center gap-1.5",
                importStep === 'upload' ? "text-indigo-950" : "text-slate-400 font-semibold"
              )}>
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px]",
                  importStep === 'upload' ? "bg-indigo-950 text-white" : "bg-slate-200 text-slate-600"
                )}>1</span>
                Upload CSV
              </span>
              <span className="text-slate-350 select-none">/</span>
              <span className={cn(
                "text-xs font-bold flex items-center gap-1.5",
                importStep === 'mapping' ? "text-indigo-950" : "text-slate-400 font-semibold"
              )}>
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px]",
                  importStep === 'mapping' ? "bg-indigo-950 text-white" : "bg-slate-200 text-slate-600"
                )}>2</span>
                Match Columns
              </span>
              <span className="text-slate-350 select-none">/</span>
              <span className={cn(
                "text-xs font-bold flex items-center gap-1.5",
                importStep === 'preview' ? "text-indigo-950" : "text-slate-400 font-semibold"
              )}>
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px]",
                  importStep === 'preview' ? "bg-indigo-950 text-white" : "bg-slate-200 text-slate-600"
                )}>3</span>
                Cherry-pick & Import
              </span>
            </div>

            {/* Content body */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              
              {/* Step 1: Upload */}
              {importStep === 'upload' && (
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-slate-50 p-10 text-center transition-all relative flex flex-col items-center justify-center">
                    <div className="w-12 h-12 bg-white text-emerald-700 rounded-xl flex items-center justify-center shadow-xs mb-3 border border-slate-200/50">
                      <Upload className="w-6 h-6" />
                    </div>
                    
                    <p className="text-sm font-bold text-slate-800">Drag your patient CSV spreadsheet files here</p>
                    <p className="text-xs text-slate-400 mt-1 mb-4">Accepts spreadsheet CSV files</p>
                    
                    <button 
                      onClick={() => document.getElementById('peka-csv-uploader')?.click()}
                      className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-extrabold text-slate-705 rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      BROWSE FILES
                    </button>
                    
                    <input 
                      type="file" 
                      id="peka-csv-uploader" 
                      accept=".csv"
                      onChange={handleCSVFileUpload}
                      className="hidden" 
                    />
                  </div>

                  <div className="border border-slate-205 rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Need a format template file?</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">Download our preconfigured column blueprint to easily arrange your patient rows.</p>
                    </div>
                    <button
                      onClick={handleDownloadTemplate}
                      className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      DOWNLOAD TEMPLATE
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Mapping */}
              {importStep === 'mapping' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-800">Match columns precisely</h4>
                      <p className="text-[11px] text-amber-700/95 mt-0.5">Please map each PeKa B40 field to the header name from your uploaded file to ensure perfect data integrity. Fields with * are highly recommended.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.keys(columnMapping).map((key) => {
                      const field = key as keyof ColumnMapping;
                      const isRequired = field === 'name' || field === 'ic' || field === 'phone';
                      const label = field === 'patientId' ? 'ID / Patient ID' :
                                    field === 'name' ? 'Name *' :
                                    field === 'ic' ? 'IC / Identification *' :
                                    field === 'phone' ? 'Handphone / Phone *' :
                                    field === 'address' ? 'Address' :
                                    field === 'postalCode' ? 'PostalCode' :
                                    field === 'appointmentDate' ? 'Next Appointment Date' :
                                    field === 'remarks' ? 'Remarks Status' :
                                    field === 'time' ? 'Time' :
                                    field === 'additionalNotes' ? 'Additional Notes' : 'Cawangan (Branch)';
                      
                      return (
                        <div key={field} className="border border-slate-150 p-3 rounded-xl bg-slate-50/30 flex items-center justify-between gap-4">
                          <span className={cn("text-xs font-extrabold text-slate-700", isRequired && "text-slate-900 font-black")}>
                            {label}
                          </span>
                          <select
                            value={columnMapping[field] || ''}
                            onChange={(e) => handleMappingChange(field, e.target.value || null)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold w-48 outline-none"
                          >
                            <option value="">-- Ignored / Empty --</option>
                            {csvHeaders.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={() => setImportStep('upload')}
                      className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={applyMappingAndPreview}
                      disabled={isImporting}
                      className="px-5 py-2 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-55"
                    >
                      CONTINUE PREVIEW
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Selection Preview */}
              {importStep === 'preview' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        Patients Table Preview ({importedPatients.length} rows processed)
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">Check/uncheck rows below to control what actually gets written to the Live Database.</p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const allIdx = importedPatients.map((_, i) => i);
                          setSelectedImportRows(new Set(allIdx));
                        }}
                        className="text-xs text-indigo-900 hover:underline font-bold bg-none cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() => setSelectedImportRows(new Set())}
                        className="text-xs text-slate-500 hover:underline font-bold bg-none cursor-pointer"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider w-12 text-center">Import?</th>
                          <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Patient Name</th>
                          <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider w-32">IC</th>
                          <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider w-32">Handphone</th>
                          <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider w-52">Validation Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-155">
                        {importedPatients.map((patient, index) => {
                          const isSelected = selectedImportRows.has(index);
                          return (
                            <tr key={index} className={cn(
                              "hover:bg-slate-50/50",
                              !patient.isValid ? "bg-red-50/40" : "",
                              patient.isDuplicate ? "bg-amber-50/30" : ""
                            )}>
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!patient.name.trim()}
                                  checked={isSelected}
                                  onChange={() => {
                                    const next = new Set(selectedImportRows);
                                    if (next.has(index)) {
                                      next.delete(index);
                                    } else {
                                      next.add(index);
                                    }
                                    setSelectedImportRows(next);
                                  }}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                />
                              </td>
                              <td className="px-4 py-2.5 font-bold text-slate-900 uppercase">
                                {patient.name || <span className="text-red-500 font-semibold italic">Missing Full Name</span>}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-slate-650">
                                {patient.ic || <span className="text-red-500 font-semibold italic">Missing IC</span>}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-slate-650">
                                {patient.phone || <span className="text-red-500 font-semibold italic">Missing Handphone</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                {!patient.isValid ? (
                                  <span className="text-red-650 font-bold bg-red-100/50 border border-red-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Missing: {patient.missingFields.join(', ')}
                                  </span>
                                ) : patient.isDuplicate ? (
                                  <span className="text-amber-700 font-bold bg-amber-50 border border-amber-150 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Potential Duplicate
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-150 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    Valid Record
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Progress panel */}
                  {isImporting && importProgress.total > 0 && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
                        <span>Importing Records...</span>
                        <span>{importProgress.current} / {importProgress.total}</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-950 h-full transition-all duration-200"
                          style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={() => setImportStep('mapping')}
                      disabled={isImporting}
                      className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={executeCsvBatchImport}
                      disabled={isImporting || selectedImportRows.size === 0}
                      className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isImporting ? "Importing to Firestore..." : `IMPORT ${selectedImportRows.size} PATIENTS`}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
