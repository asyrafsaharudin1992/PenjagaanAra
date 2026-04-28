import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, AlertCircle, Baby, Stethoscope } from 'lucide-react';
import { FollowUpCase, FollowUpTag, ClinicBranch, UserProfile } from '../types';
import { suggestUrgency } from '../services/gemini';
import { cn, normalizeBranch, normalizeTag } from '../lib/utils';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore';

interface CaseFormProps {
  onClose: () => void;
  onSubmit: (newCase: Partial<FollowUpCase>) => void;
  existingCases: FollowUpCase[];
  currentUser: UserProfile;
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
};
// --- END ADDED ---

export default function CaseForm({ onClose, onSubmit, existingCases, currentUser }: CaseFormProps) {
  const [formData, setFormData] = useState({
    patientId: '',
    patientName: '',
    patientPhone: '',
    branch: (normalizeBranch(currentUser.branch) || 'Kajang') as ClinicBranch,
    diagnosis: '',
    lastVisitDate: '',
    appointmentDate: '',
    doctorInCharge: '',
    remarks: '',
    followUpDoneBy: '',
    followUpTag: 'Others' as FollowUpTag,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');
  const [patientHistory, setPatientHistory] = useState<FollowUpCase[]>([]);
  const [isSearchingHistory, setIsSearchingHistory] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // --- ADDED: ANC and NCD field state ---
  const [ancFields, setAncFields] = useState<ANCFields>(defaultANCFields);
  const [ncdFields, setNcdFields] = useState<NCDFields>(defaultNCDFields);
  // --- END ADDED ---

  // Fetch tags dynamically with error handling - MERGE with defaults
  useEffect(() => {
    const defaultTags = ['AraMommy', 'AraChronic', 'AraWellness', 'Referral', 'Others'];
    
    try {
      // Try to fetch from Firestore, but don't use orderBy to avoid index requirement
      const q = query(collection(db, 'tags'));
      const unsubscribe = onSnapshot(
        q, 
        (snapshot) => {
          const firestoreTags = snapshot.docs.map(doc => doc.data().name as string);
          
          // MERGE Firestore tags with default tags (remove duplicates using normalization)
          const distinctNormalized = new Set<string>();
          const result: string[] = [];

          [...defaultTags, ...firestoreTags].forEach(tag => {
            const normalized = normalizeTag(tag);
            if (!distinctNormalized.has(normalized)) {
              distinctNormalized.add(normalized);
              result.push(normalized);
            }
          });
          
          // Sort tags alphabetically
          const sortedTags = result.sort((a, b) => a.localeCompare(b));
          setAvailableTags(sortedTags);
        },
        (error) => {
          // If Firestore fails, use default tags
          console.error('Error fetching tags from Firestore:', error);
          setAvailableTags(defaultTags);
        }
      );
      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up tags query:', error);
      setAvailableTags(defaultTags);
    }
  }, []);

  // Check if patient is new when ID changes
  useEffect(() => {
    const searchPatient = async () => {
      if (!formData.patientId || formData.patientId.length < 3) {
        setIsNewPatient(false);
        setPatientHistory([]);
        return;
      }

      setIsSearchingHistory(true);
      try {
        const q = query(
          collection(db, 'cases'),
          where('patientId', '==', formData.patientId)
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowUpCase));
          history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          setPatientHistory(history);
          setIsNewPatient(false);
          
          const previousCase = history[0];
          setFormData(prev => ({
            ...prev,
            patientName: previousCase.patientName || prev.patientName,
            patientPhone: previousCase.patientPhone || prev.patientPhone
          }));
        } else {
          setPatientHistory([]);
          setIsNewPatient(true);
          setFormData(prev => ({
            ...prev,
            patientName: '',
            patientPhone: ''
          }));
        }
      } catch (error) {
        console.error("Error fetching patient history:", error);
      } finally {
        setIsSearchingHistory(false);
      }
    };

    const timeoutId = setTimeout(searchPatient, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.patientId]);

  // --- ADDED: Reset registry fields when tag changes ---
  useEffect(() => {
    const tagLower = (formData.followUpTag || '').toLowerCase();
    if (tagLower !== 'aramommy') {
      setAncFields(defaultANCFields);
    }
    if (tagLower !== 'arachronic') {
      setNcdFields(defaultNCDFields);
    }
  }, [formData.followUpTag]);
  // --- END ADDED ---

  const handleSuggestUrgency = async () => {
    if (!formData.diagnosis) return;
    setIsAnalyzing(true);
    const suggestion = await suggestUrgency(formData.diagnosis);
    setFormData(prev => ({ ...prev, followUpTag: suggestion }));
    setIsAnalyzing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.followUpTag && !availableTags.includes(formData.followUpTag)) {
      try {
        const tagRef = doc(collection(db, 'tags'), formData.followUpTag.toLowerCase().replace(/\s+/g, '_'));
        await setDoc(tagRef, { name: formData.followUpTag });
      } catch (error) {
        console.error("Error saving new tag:", error);
      }
    }

    const tagLower = (formData.followUpTag || '').toLowerCase();

    // --- ADDED: Include registry data in submission ---
    let registryData: any = null;
    if (tagLower === 'aramommy') {
      registryData = JSON.stringify({ type: 'ANC', ...ancFields });
    } else if (tagLower === 'arachronic') {
      registryData = JSON.stringify({ type: 'NCD', ...ncdFields });
    }
    // --- END ADDED ---

    onSubmit({
      ...formData,
      createdAt: new Date().toISOString(),
      ...(registryData ? { registryData } : {}),
    });
  };

  // --- ADDED: Determine which registry section to show ---
  const tagLower = (formData.followUpTag || '').toLowerCase();
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">New Follow-up Case</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Existing Patient Alert */}
          {!isNewPatient && formData.patientId && (
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-5 h-5 text-indigo-950 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">Existing Patient Detected</p>
                <p className="text-xs text-slate-600 mt-0.5">Would you like to have a look at previous follow-up notes for this patient?</p>
                <button 
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="mt-2 text-xs font-bold text-indigo-950 underline hover:text-slate-900"
                >
                  {showHistory ? "Hide History" : "View History Notes"}
                </button>
              </div>
            </div>
          )}

          {/* History Notes View */}
          {showHistory && patientHistory.length > 0 && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in fade-in duration-300">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Previous Notes</h4>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                {patientHistory.map((past, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold text-slate-400">{new Date(past.createdAt).toLocaleDateString()}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded uppercase">{past.followUpTag}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800">{past.diagnosis}</p>
                    {past.remarks && <p className="text-[11px] text-slate-500 mt-1 italic">"{past.remarks}"</p>}
                    <div className="mt-2 pt-2 border-t border-slate-50 grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-400 font-medium uppercase">Branch:</span>
                        <span className="ml-1 text-slate-600 font-bold">{past.branch}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium uppercase">Doctor:</span>
                        <span className="ml-1 text-slate-600 font-bold">{past.doctorInCharge}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium uppercase">Staff:</span>
                        <span className="ml-1 text-slate-600 font-bold">{past.followUpDoneBy || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium uppercase">Appointment:</span>
                        <span className="ml-1 text-indigo-600 font-bold">{past.appointmentDate ? new Date(past.appointmentDate).toLocaleDateString() : '-'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Patient ID</label>
                {isSearchingHistory && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
              </div>
              <input 
                required
                type="text"
                value={formData.patientId}
                onChange={e => setFormData({...formData, patientId: e.target.value})}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="e.g. P-12345"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Patient Name</label>
                <input 
                  required
                  type="text"
                  value={formData.patientName}
                  onChange={e => setFormData({...formData, patientName: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="space-y-1">
                <label className={cn(
                  "text-xs font-semibold uppercase tracking-wider",
                  isNewPatient ? "text-indigo-600" : "text-slate-500"
                )}>
                  Phone Number {isNewPatient && "(New Patient)"}
                </label>
                <input 
                  required
                  type="tel"
                  value={formData.patientPhone}
                  onChange={e => setFormData({...formData, patientPhone: e.target.value})}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                    isNewPatient ? "bg-indigo-50/50 border-indigo-100" : "bg-slate-50 border-slate-200"
                  )}
                  placeholder="e.g. 012-3456789"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Clinic Branch</label>
              <select 
                value={formData.branch}
                disabled={currentUser.role !== 'Superadmin'}
                onChange={e => setFormData({...formData, branch: normalizeBranch(e.target.value) as any})}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              >
                <option value="Kajang">Kajang</option>
                <option value="Seri Kembangan">Seri Kembangan</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Follow Up Tag</label>
              {!showNewTagInput ? (
                <select 
                  value={formData.followUpTag}
                  onChange={e => {
                    if (e.target.value === 'CREATE_NEW') {
                      setShowNewTagInput(true);
                    } else {
                      setFormData({...formData, followUpTag: e.target.value});
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  {availableTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                  {!availableTags.includes(formData.followUpTag) && formData.followUpTag && (
                    <option value={formData.followUpTag}>{formData.followUpTag}</option>
                  )}
                  <option value="CREATE_NEW" className="font-bold text-indigo-600">+ Create New Tag...</option>
                </select>
              ) : (
                <div className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
                  <input 
                    autoFocus
                    type="text"
                    value={newTagValue}
                    onChange={e => setNewTagValue(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="Enter new tag name..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newTagValue.trim()) {
                          setFormData({...formData, followUpTag: normalizeTag(newTagValue.trim())});
                          setShowNewTagInput(false);
                          setNewTagValue('');
                        }
                      }
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      if (newTagValue.trim()) {
                        setFormData({...formData, followUpTag: normalizeTag(newTagValue.trim())});
                        setShowNewTagInput(false);
                        setNewTagValue('');
                      }
                    }}
                    className="px-3 py-2 bg-indigo-950 text-white rounded-lg text-xs font-bold"
                  >
                    ADD
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowNewTagInput(false)}
                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold"
                  >
                    CANCEL
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Diagnosis</label>
              <button 
                type="button"
                onClick={handleSuggestUrgency}
                disabled={!formData.diagnosis || isAnalyzing}
                className="text-[10px] font-bold text-indigo-950 flex items-center gap-1 hover:text-slate-900 disabled:opacity-50"
              >
                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI SUGGEST TAG
              </button>
            </div>
            <textarea 
              required
              rows={2}
              value={formData.diagnosis}
              onChange={e => setFormData({...formData, diagnosis: e.target.value})}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none transition-all"
              placeholder="Enter patient diagnosis..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Visit Date</label>
              <input 
                type="date"
                value={formData.lastVisitDate}
                onChange={e => setFormData({...formData, lastVisitDate: e.target.value})}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Appointment Date</label>
              <input 
                type="date"
                value={formData.appointmentDate}
                onChange={e => setFormData({...formData, appointmentDate: e.target.value})}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Doctor In Charge</label>
              <input 
                required
                type="text"
                value={formData.doctorInCharge}
                onChange={e => setFormData({...formData, doctorInCharge: e.target.value})}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="Dr. Name"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</label>

            {/* --- ADDED: ANC Registry Fields (AraMommy) --- */}
            {showANC && (
              <div className="bg-rose-50/60 border border-rose-200/70 rounded-xl p-4 space-y-4 mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
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
              <div className="bg-teal-50/60 border border-teal-200/70 rounded-xl p-4 space-y-4 mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
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
              rows={2}
              value={formData.remarks}
              onChange={e => setFormData({...formData, remarks: e.target.value})}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none transition-all shadow-sm"
              placeholder="Additional remarks..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Follow up done by</label>
            <input 
              type="text"
              value={formData.followUpDoneBy}
              onChange={e => setFormData({...formData, followUpDoneBy: e.target.value})}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-bold transition-all"
              placeholder="Staff Name"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-950 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors shadow-sm shadow-indigo-200"
            >
              Create Case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}