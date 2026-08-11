import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Calendar, 
  Clock, 
  MessageSquare, 
  Send, 
  Sparkles, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  MessageCircle,
  Activity,
  Baby,
  Stethoscope,
  Undo2,
  Check
} from 'lucide-react';
import { FollowUpCase, FollowUpTag, UserRole, UserPermission, ClinicBranch, Patient, UserProfile } from '../types';
import { summarizeCase } from '../services/gemini';
import { cn, normalizeTag } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { deleteDoc, doc, collection, query, where, onSnapshot, orderBy, getDocs, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';

interface WellnessUpdate {
  id: string;
  weight: number;
  sideEffects: string;
  createdAt: string;
}

interface CaseDetailsProps {
  caseData: FollowUpCase;
  onClose: () => void;
  onUpdate: (caseId: string, updates: Partial<FollowUpCase>) => void;
  currentUser: UserProfile;
  allCases: FollowUpCase[];
}

// --- ADDED: ANC and NCD field types ---
interface ANCFields {
  gaWeeks: string;
  supplementGiven: string;
  compliance: string;
  riskCategory: string;
}

interface NCDFields {
  lastBloodTest: string;
  nextBloodTestDue: string;
  medication: string;
  refillStatus: string;
  compliance: string;
  refillMedsDate?: string;
}

const defaultANCFields: ANCFields = {
  gaWeeks: '',
  supplementGiven: '',
  compliance: '',
  riskCategory: '',
};

const defaultNCDFields: NCDFields = {
  lastBloodTest: '',
  nextBloodTestDue: '',
  medication: '',
  refillStatus: '',
  compliance: '',
  refillMedsDate: '',
};

function parseRegistryData(raw: any): { type: string } & (ANCFields | NCDFields) | null {
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data && data.type) return data;
  } catch {}
  return null;
}
// --- END ADDED ---

export default function CaseDetails({ 
  caseData, 
  onClose, 
  onUpdate, 
  currentUser,
  allCases 
}: CaseDetailsProps) {
  const userRole = currentUser.role;
  const userPermissions = currentUser.permissions || [];
  const currentUserEmail = currentUser.email;
  const currentUserUid = currentUser.uid;
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');
  const [wellnessUpdates, setWellnessUpdates] = useState<WellnessUpdate[]>([]);

  const [editedRemarks, setEditedRemarks] = useState(caseData.remarks || '');
  const [editedDiagnosis, setEditedDiagnosis] = useState(caseData.diagnosis || '');
  const [editedTag, setEditedTag] = useState(caseData.followUpTag);
  const [editedBranch, setEditedBranch] = useState(caseData.branch || 'Kajang');
  const [editedPanel, setEditedPanel] = useState(caseData.panel || '');
  const [editedDoctorInCharge, setEditedDoctorInCharge] = useState(caseData.doctorInCharge || '');
  const [editedFollowUpDoneBy, setEditedFollowUpDoneBy] = useState(caseData.followUpDoneBy || '');
  const [editedAppointmentDate, setEditedAppointmentDate] = useState(caseData.appointmentDate || '');
  const [editedLastVisitDate, setEditedLastVisitDate] = useState(caseData.lastVisitDate || '');
  const [editedKeyInDate, setEditedKeyInDate] = useState(caseData.createdAt ? caseData.createdAt.split('T')[0] : '');
  const [editedPatientPhone, setEditedPatientPhone] = useState(caseData.patientPhone || '');
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Reset states when caseId changes (handles cases where component stays mounted)
  useEffect(() => {
    setEditedRemarks(caseData.remarks || '');
    setEditedDiagnosis(caseData.diagnosis || '');
    setEditedTag(caseData.followUpTag);
    setEditedBranch(caseData.branch || 'Kajang');
    setEditedPanel(caseData.panel || '');
    setEditedDoctorInCharge(caseData.doctorInCharge || '');
    setEditedFollowUpDoneBy(caseData.followUpDoneBy || '');
    setEditedAppointmentDate(caseData.appointmentDate || '');
    setEditedLastVisitDate(caseData.lastVisitDate || '');
    setEditedKeyInDate(caseData.createdAt ? caseData.createdAt.split('T')[0] : '');
    setEditedPatientPhone(caseData.patientPhone || '');
  }, [caseData.id, caseData.createdAt, caseData.patientPhone, caseData.panel]);

  // --- ADDED: ANC and NCD field state ---
  const [ancFields, setAncFields] = useState<ANCFields>(defaultANCFields);
  const [ncdFields, setNcdFields] = useState<NCDFields>(defaultNCDFields);
  // --- END ADDED ---

  // Fetch tags dynamically
  useEffect(() => {
    const defaultTags = ['AraMommy', 'AraChronic', 'AraSihat', 'AraWellness', 'Referral', 'Others'];
    
    const q = query(collection(db, 'tags'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreTags = snapshot.docs.map(doc => doc.data().name as string);
      
      const distinctNormalized = new Set<string>();
      const result: string[] = [];

      [...defaultTags, ...firestoreTags].forEach(tag => {
        const normalized = normalizeTag(tag);
        if (!distinctNormalized.has(normalized)) {
          distinctNormalized.add(normalized);
          result.push(normalized);
        }
      });
      
      const sortedTags = result.sort((a, b) => a.localeCompare(b));
      setAvailableTags(sortedTags);
    }, (error) => {
      console.error('Error fetching tags:', error);
      setAvailableTags(defaultTags);
    });
    return () => unsubscribe();
  }, []);

  // --- ADDED: Load registry data when case loads ---
  useEffect(() => {
    const raw = (caseData as any).registryData;
    const parsed = parseRegistryData(raw);
    if (parsed) {
      if (parsed.type === 'ANC') {
        const anc = parsed as ANCFields;
        setAncFields({
          gaWeeks: anc.gaWeeks || '',
          supplementGiven: anc.supplementGiven || '',
          compliance: anc.compliance || '',
          riskCategory: anc.riskCategory || '',
        });
      } else if (parsed.type === 'NCD') {
        const ncd = parsed as NCDFields;
        setNcdFields({
          lastBloodTest: ncd.lastBloodTest || '',
          nextBloodTestDue: ncd.nextBloodTestDue || '',
          medication: ncd.medication || '',
          refillStatus: ncd.refillStatus || '',
          compliance: ncd.compliance || '',
          refillMedsDate: ncd.refillMedsDate || '',
        });
      }
    } else {
      setAncFields(defaultANCFields);
      setNcdFields(defaultNCDFields);
    }
  }, [caseData.id]);
  // --- END ADDED ---

  useEffect(() => {
    if (!(caseData.followUpTag || '').toLowerCase().includes('arawellness')) return;

    const q = query(
      collection(db, 'wellness_updates'),
      where('caseId', '==', caseData.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updates = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WellnessUpdate[];
      
      updates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      const uniqueUpdates: WellnessUpdate[] = [];
      const seenDates = new Set();
      for (const update of updates) {
        const dateStr = new Date(update.createdAt).toLocaleDateString();
        if (!seenDates.has(dateStr)) {
          seenDates.add(dateStr);
          uniqueUpdates.push(update);
        }
      }
      
      setWellnessUpdates(uniqueUpdates);
    });

    return () => unsubscribe();
  }, [caseData.id, caseData.followUpTag]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canDelete = userPermissions.includes('delete_case');
  const canViewHistory = userPermissions.includes('view_history');
  const canUseAI = userPermissions.includes('ai_analysis');

  const formatWhatsAppLink = (phone?: string) => {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, '');
    const formatted = cleaned.startsWith('0') ? '60' + cleaned.substring(1) : cleaned;
    return `https://wa.me/${formatted}`;
  };

  const [patientHistory, setPatientHistory] = useState<FollowUpCase[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!caseData.patientId) return;

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const q = query(
          collection(db, 'cases'),
          where('patientId', '==', caseData.patientId)
        );
        const snapshot = await getDocs(q);
        const history = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as FollowUpCase))
          .filter(c => c.id !== caseData.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        setPatientHistory(history);
      } catch (error) {
        console.error("Error fetching patient history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [caseData.patientId, caseData.id]);

  const handleReturn = async () => {
    setIsReturning(true);
    try {
      const patientRef = doc(collection(db, 'patients'));
      const patientData: Patient = {
        id: patientRef.id,
        patientId: caseData.patientId || `P-${Date.now()}`,
        name: caseData.patientName,
        phone: caseData.patientPhone || '',
        branch: caseData.branch,
        tag: caseData.followUpTag || 'General',
        createdAt: new Date().toISOString(),
        createdByEmail: currentUserEmail || 'system',
        createdByUid: currentUserUid || 'system',
      };

      // 1. Create the patient in directory
      await setDoc(patientRef, patientData);

      // 2. Delete from cases collection
      await deleteDoc(doc(db, 'cases', caseData.id));

      toast.success(`${caseData.patientName} moved back to Patient Directory.`);
      onClose();
    } catch (error: any) {
      console.error("Error returning patient:", error);
      try {
        handleFirestoreError(error, OperationType.WRITE, `patients/cases - returning ${caseData.patientName}`);
      } catch (uiError: any) {
        toast.error(uiError.message);
      }
    } finally {
      setIsReturning(false);
      setShowReturnConfirm(false);
    }
  };

  const handleSummarize = async () => {
    setIsSummarizing(true);
    const summary = await summarizeCase(caseData.diagnosis, [caseData.remarks]);
    setAiSummary(summary);
    setIsSummarizing(false);
  };

  const handleStatusChange = (newTag: string) => {
    setEditedTag(newTag);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (editedTag && !availableTags.includes(editedTag)) {
        const tagRef = doc(collection(db, 'tags'), editedTag.toLowerCase().replace(/\s+/g, '_'));
        await setDoc(tagRef, { name: editedTag });
      }

      let newCreatedAt = caseData.createdAt;
      if (editedKeyInDate) {
        const currentIsoDate = caseData.createdAt ? caseData.createdAt.split('T')[0] : '';
        if (editedKeyInDate !== currentIsoDate) {
           newCreatedAt = new Date(editedKeyInDate).toISOString();
        }
      }

      const updates: Partial<FollowUpCase> = {
        followUpTag: editedTag,
        remarks: editedRemarks,
        diagnosis: editedDiagnosis,
        branch: editedBranch as ClinicBranch,
        panel: editedPanel.trim(),
        doctorInCharge: editedDoctorInCharge,
        followUpDoneBy: editedFollowUpDoneBy,
        appointmentDate: editedAppointmentDate,
        lastVisitDate: editedLastVisitDate,
        createdAt: newCreatedAt,
        patientPhone: editedPatientPhone
      };

      if (editedRemarks !== caseData.remarks) {
        updates.isNotesCopied = false;
      }

      // --- ADDED: Save registry data based on tag ---
      const tagLower = (editedTag || '').toLowerCase();
      if (tagLower === 'aramommy') {
        (updates as any).registryData = JSON.stringify({ type: 'ANC', ...ancFields });
      } else if (tagLower === 'arachronic') {
        (updates as any).registryData = JSON.stringify({ type: 'NCD', ...ncdFields });
      } else {
        (updates as any).registryData = null;
      }
      // --- END ADDED ---

      // Update patients collection if patientId exists
      if (caseData.patientId && editedPatientPhone !== caseData.patientPhone) {
        try {
          await setDoc(doc(db, 'patients', caseData.patientId), { phone: editedPatientPhone }, { merge: true });
        } catch (err) {
          console.error("Failed to update patient phone in patients collection:", err);
        }
      }

      await onUpdate(caseData.id, updates);
      onClose();
    } catch (error) {
      console.error("Failed to save changes:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'cases', caseData.id));
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cases/${caseData.id}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // --- ADDED: Determine which registry section to show ---
  const tagLower = (editedTag || '').toLowerCase();
  const showANC = tagLower === 'aramommy';
  const showNCD = tagLower === 'arachronic';
  // --- END ADDED ---

  // --- ADDED: Pill button component for selectable options ---
  const PillSelect = ({ options, value, onChange, colorScheme }: {
    options: string[];
    value: string;
    onChange: (val: string) => void;
    colorScheme: 'rose' | 'teal';
  }) => {
    const colors = colorScheme === 'rose'
      ? {
          active: 'bg-rose-100 text-rose-700 border-rose-300',
          inactive: 'bg-white text-slate-500 border-slate-200 hover:border-rose-200 hover:text-rose-600',
        }
      : {
          active: 'bg-teal-100 text-teal-700 border-teal-300',
          inactive: 'bg-white text-slate-500 border-slate-200 hover:border-teal-200 hover:text-teal-600',
        };

    return (
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? '' : opt)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all uppercase tracking-wider",
              value === opt ? colors.active : colors.inactive
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  };
  // --- END ADDED ---

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-end z-50">
      <div className="bg-white h-full w-full max-w-2xl shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-950"
            )}>
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">{caseData.patientName}</h3>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500">{editedPatientPhone || 'No phone recorded'} • ID: {caseData.patientId}</p>
                {editedPatientPhone && (
                  <a 
                    href={formatWhatsAppLink(editedPatientPhone) || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:text-emerald-700 transition-colors"
                    title="WhatsApp Patient"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canDelete && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button 
                    disabled={isReturning}
                    onClick={() => setShowReturnConfirm(!showReturnConfirm)}
                    className="p-2 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-500 transition-colors"
                    title="Return to Patient Directory"
                  >
                    {isReturning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Undo2 className="w-5 h-5" />}
                  </button>
                  
                  {showReturnConfirm && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 animate-in fade-in slide-in-from-top-2">
                      <p className="text-xs font-bold text-slate-900 mb-3">Return to Patients?</p>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowReturnConfirm(false)}
                          className="flex-1 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200"
                        >
                          CANCEL
                        </button>
                        <button 
                          onClick={handleReturn}
                          disabled={isReturning}
                          className="flex-1 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-bold hover:bg-amber-700 flex items-center justify-center gap-2"
                        >
                          RETURN
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                    title="Delete Case"
                  >
                    {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  </button>
                  
                  {showDeleteConfirm && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-20 animate-in fade-in slide-in-from-top-2">
                      <p className="text-xs font-bold text-slate-900 mb-3">Delete this case?</p>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200"
                        >
                          CANCEL
                        </button>
                        <button 
                          onClick={handleDelete}
                          className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Patient Info Card */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 font-bold">
                  {caseData.patientName.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">{caseData.patientName}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <select 
                      value={editedBranch}
                      onChange={(e) => setEditedBranch(e.target.value as ClinicBranch)}
                      className="text-[10px] font-bold px-2 py-1 bg-indigo-50 text-indigo-950 rounded-full uppercase tracking-wider border-none focus:ring-2 focus:ring-indigo-950 outline-none cursor-pointer"
                    >
                      <option value="Kajang">Kajang Branch</option>
                      <option value="Seri Kembangan">Seri Kembangan Branch</option>
                    </select>
                    <div className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Panel:</span>
                      <input 
                        type="text"
                        value={editedPanel}
                        onChange={(e) => setEditedPanel(e.target.value)}
                        placeholder="e.g. AIA, PMCare"
                        className="text-xs font-medium text-slate-700 bg-transparent outline-none max-w-[130px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Appointment Date</p>
                <input 
                  type="date"
                  value={editedAppointmentDate}
                  onChange={(e) => setEditedAppointmentDate(e.target.value)}
                  className="text-sm font-bold text-indigo-600 bg-white border border-slate-200 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200/60">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Phone Number</p>
                <input 
                  type="text"
                  value={editedPatientPhone}
                  onChange={(e) => setEditedPatientPhone(e.target.value)}
                  className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Phone Number"
                />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Doctor In Charge</p>
                <input 
                  type="text"
                  value={editedDoctorInCharge}
                  onChange={(e) => setEditedDoctorInCharge(e.target.value)}
                  className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Doctor Name"
                />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Last Visit</p>
                <input 
                  type="date"
                  value={editedLastVisitDate}
                  onChange={(e) => setEditedLastVisitDate(e.target.value)}
                  className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Follow Up Tag Selector */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Update Follow Up Tag</label>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {availableTags.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all uppercase tracking-wider",
                      caseData.followUpTag === s
                        ? "bg-indigo-950 text-white border-indigo-950 shadow-md shadow-indigo-100"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-950 hover:bg-indigo-50/30",
                      editedTag === s && caseData.followUpTag !== s && "ring-2 ring-indigo-950 ring-offset-2"
                    )}
                  >
                    {s}
                  </button>
                ))}
                {!availableTags.includes(caseData.followUpTag) && (
                  <button
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border bg-indigo-950 text-white border-indigo-950 shadow-md shadow-indigo-100 uppercase tracking-wider",
                      editedTag === caseData.followUpTag ? "opacity-100" : "opacity-50"
                    )}
                  >
                    {caseData.followUpTag}
                  </button>
                )}
                {editedTag && !availableTags.includes(editedTag) && editedTag !== caseData.followUpTag && (
                  <button
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold border bg-indigo-950 text-white border-indigo-950 shadow-md shadow-indigo-100 uppercase tracking-wider ring-2 ring-indigo-950 ring-offset-2"
                  >
                    {editedTag}
                  </button>
                )}
                <button
                  onClick={() => setShowNewTagInput(!showNewTagInput)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all uppercase tracking-wider",
                    showNewTagInput 
                      ? "bg-indigo-50 text-indigo-950 border-indigo-200" 
                      : "bg-white text-indigo-950 border-indigo-100 hover:bg-indigo-50"
                  )}
                >
                  + CREATE NEW TAG
                </button>
              </div>
              
              {showNewTagInput && (
                <div className="flex gap-2 animate-in slide-in-from-top-2 duration-200">
                  <input 
                    autoFocus
                    type="text"
                    value={newTagValue}
                    onChange={(e) => setNewTagValue(e.target.value)}
                    placeholder="Enter new tag name..."
                    className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (newTagValue.trim()) {
                          handleStatusChange(normalizeTag(newTagValue.trim()));
                          setNewTagValue('');
                          setShowNewTagInput(false);
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      if (newTagValue.trim()) {
                        handleStatusChange(normalizeTag(newTagValue.trim()));
                        setNewTagValue('');
                        setShowNewTagInput(false);
                      }
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"
                  >
                    ADD
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Diagnosis */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Diagnosis</label>
            <textarea 
              value={editedDiagnosis}
              onChange={(e) => setEditedDiagnosis(e.target.value)}
              className="w-full text-sm text-slate-700 leading-relaxed bg-white border border-slate-300 p-4 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 min-h-[100px] resize-none transition-all"
              placeholder="Enter diagnosis..."
            />
          </div>

          {/* AI Summary Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Insights</label>
              {canUseAI && (
                  <button 
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                    className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 hover:text-slate-900 disabled:opacity-50"
                  >
                    {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {aiSummary ? 'RE-ANALYZE' : 'GENERATE SUMMARY'}
                  </button>
              )}
            </div>
            {aiSummary && (
              <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2">
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                </div>
                <div className="text-sm text-indigo-900 prose prose-sm max-w-none">
                  {aiSummary.split('\n').map((line, i) => (
                    <p key={i} className="mb-1">{line}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Remarks & Follow up done by */}
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" />
                Remarks
              </label>

              {/* --- ADDED: ANC Registry Fields (AraMommy) --- */}
              {showANC && (
                <div className="bg-rose-50/60 border border-rose-200/70 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-rose-100 flex items-center justify-center">
                      <Baby className="w-3.5 h-3.5 text-rose-600" />
                    </div>
                    <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">ANC Registry Fields</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-rose-600/80 uppercase tracking-wider">GA (weeks)</p>
                      <input
                        type="text"
                        value={ancFields.gaWeeks}
                        onChange={(e) => setAncFields({ ...ancFields, gaWeeks: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                        placeholder="e.g. 32"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-rose-600/80 uppercase tracking-wider">Supplement Given</p>
                      <input
                        type="text"
                        value={ancFields.supplementGiven}
                        onChange={(e) => setAncFields({ ...ancFields, supplementGiven: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                        placeholder="e.g. FA + Calcium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-rose-600/80 uppercase tracking-wider">Risk Category</p>
                    <PillSelect
                      options={['Low', 'Moderate', 'High']}
                      value={ancFields.riskCategory}
                      onChange={(val) => setAncFields({ ...ancFields, riskCategory: val })}
                      colorScheme="rose"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-rose-600/80 uppercase tracking-wider">Compliance</p>
                    <PillSelect
                      options={['Y', 'N']}
                      value={ancFields.compliance}
                      onChange={(val) => setAncFields({ ...ancFields, compliance: val })}
                      colorScheme="rose"
                    />
                  </div>
                </div>
              )}
              {/* --- END ADDED --- */}

              {/* --- ADDED: NCD Registry Fields (AraChronic) --- */}
              {showNCD && (
                <div className="bg-teal-50/60 border border-teal-200/70 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-teal-100 flex items-center justify-center">
                      <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                    </div>
                    <p className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">NCD Registry Fields</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-teal-600/80 uppercase tracking-wider">Last Blood Test</p>
                      <input
                        type="date"
                        value={ncdFields.lastBloodTest}
                        onChange={(e) => setNcdFields({ ...ncdFields, lastBloodTest: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-teal-600/80 uppercase tracking-wider">Next Blood Test Due</p>
                      <input
                        type="date"
                        value={ncdFields.nextBloodTestDue}
                        onChange={(e) => setNcdFields({ ...ncdFields, nextBloodTestDue: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-teal-600/80 uppercase tracking-wider">Medication</p>
                    <input
                      type="text"
                      value={ncdFields.medication}
                      onChange={(e) => setNcdFields({ ...ncdFields, medication: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                      placeholder="e.g. Metformin 500mg BD"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-teal-600/80 uppercase tracking-wider">Refill Status</p>
                      <PillSelect
                        options={['Done', 'Pending', 'Overdue']}
                        value={ncdFields.refillStatus}
                        onChange={(val) => setNcdFields({ ...ncdFields, refillStatus: val })}
                        colorScheme="teal"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-teal-600/80 uppercase tracking-wider">Refill Meds Date (Optional)</p>
                      <input
                        type="date"
                        value={ncdFields.refillMedsDate || ''}
                        onChange={(e) => setNcdFields({ ...ncdFields, refillMedsDate: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-teal-600/80 uppercase tracking-wider">Compliance</p>
                    <PillSelect
                      options={['Y', 'N']}
                      value={ncdFields.compliance}
                      onChange={(val) => setNcdFields({ ...ncdFields, compliance: val })}
                      colorScheme="teal"
                    />
                  </div>
                </div>
              )}
              {/* --- END ADDED --- */}

              <textarea 
                value={editedRemarks}
                onChange={(e) => setEditedRemarks(e.target.value)}
                className="w-full bg-white p-4 rounded-xl border border-slate-300 min-h-[100px] text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none transition-all shadow-sm"
                placeholder="Enter remarks..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Follow up done by</label>
                <div className="bg-white border border-slate-300 px-4 py-2 rounded-xl flex items-center gap-3 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-600 transition-all shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <User className="w-4 h-4" />
                  </div>
                  <input 
                    type="text"
                    value={editedFollowUpDoneBy}
                    onChange={(e) => setEditedFollowUpDoneBy(e.target.value)}
                    className="flex-1 text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 outline-none p-0"
                    placeholder="Enter staff name..."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Key-in Date</label>
                <div className="bg-white border border-slate-300 px-4 py-2 rounded-xl flex items-center gap-3 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-600 transition-all shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <input 
                    type="date"
                    value={editedKeyInDate}
                    onChange={(e) => setEditedKeyInDate(e.target.value)}
                    className="flex-1 text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 outline-none p-0"
                  />
                </div>
              </div>
            </div>

            {/* Patient History Section */}
            {canViewHistory && (patientHistory.length > 0 || isLoadingHistory) && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Past Follow-up History {isLoadingHistory ? '' : `(${patientHistory.length})`}
                  {isLoadingHistory && <Loader2 className="w-3 h-3 animate-spin ml-2" />}
                </label>
                {!isLoadingHistory && (
                  <div className="space-y-3">
                    {patientHistory.map((pastCase, idx) => (
                      <div key={idx} className="bg-slate-50/50 border border-slate-100 p-4 rounded-xl space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {new Date(pastCase.createdAt).toLocaleDateString()}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full uppercase tracking-wider">
                            {pastCase.followUpTag}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">{pastCase.diagnosis}</p>
                        {pastCase.remarks && (
                          <p className="text-xs text-slate-500 italic">"{pastCase.remarks}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Wellness Updates Section */}
            {(caseData.followUpTag || '').toLowerCase() === 'arawellness (weight loss)' && wellnessUpdates.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <label className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Patient Wellness Updates ({wellnessUpdates.length})
                </label>
                <div className="space-y-3">
                  {wellnessUpdates.map((update) => (
                    <div key={update.id} className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                          {new Date(update.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-semibold text-emerald-600/70 uppercase tracking-wider">Weight</p>
                          <p className="text-sm font-bold text-emerald-900">{update.weight} kg</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-emerald-600/70 uppercase tracking-wider">Side Effects</p>
                          <p className="text-sm font-medium text-emerald-900">{update.sideEffects}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            SAVE CHANGES
          </button>
        </div>
      </div>
    </div>
  );
}