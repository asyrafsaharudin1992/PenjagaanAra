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
  Activity
} from 'lucide-react';
import { FollowUpCase, FollowUpTag, UserRole, UserPermission, ClinicBranch } from '../types';
import { summarizeCase } from '../services/gemini';
import { cn } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { deleteDoc, doc, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';

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
  userRole: UserRole;
  userPermissions: UserPermission[];
  allCases: FollowUpCase[];
}

export default function CaseDetails({ 
  caseData, 
  onClose, 
  onUpdate, 
  userRole, 
  userPermissions,
  allCases 
}: CaseDetailsProps) {
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');
  const [wellnessUpdates, setWellnessUpdates] = useState<WellnessUpdate[]>([]);

  const [editedRemarks, setEditedRemarks] = useState(caseData.remarks || '');
  const [editedDiagnosis, setEditedDiagnosis] = useState(caseData.diagnosis || '');
  const [editedTag, setEditedTag] = useState(caseData.followUpTag);
  const [editedBranch, setEditedBranch] = useState(caseData.branch || 'Kajang');
  const [editedDoctorInCharge, setEditedDoctorInCharge] = useState(caseData.doctorInCharge || '');

  useEffect(() => {
    if (caseData.followUpTag.toLowerCase() !== 'arawellness (weight loss)') return;

    const q = query(
      collection(db, 'wellness_updates'),
      where('caseId', '==', caseData.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updates = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WellnessUpdate[];
      
      // Sort client side since we might not have a composite index
      updates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Group by date and keep only the latest for each date (handles legacy data)
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

  const defaultTags = ['aramommy', 'arachronic', 'arawellness (weight loss)', 'referral', 'others'];
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

  const patientHistory = allCases
    .filter(c => c.patientId === caseData.patientId && c.id !== caseData.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
      await onUpdate(caseData.id, { 
        followUpTag: editedTag,
        remarks: editedRemarks,
        diagnosis: editedDiagnosis,
        branch: editedBranch as ClinicBranch,
        doctorInCharge: editedDoctorInCharge
      });
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

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-end z-50">
      <div className="bg-white h-full w-full max-w-2xl shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600"
            )}>
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">{caseData.patientName}</h3>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500">{caseData.patientPhone || 'No phone recorded'} • ID: {caseData.patientId}</p>
                {caseData.patientPhone && (
                  <a 
                    href={formatWhatsAppLink(caseData.patientPhone) || '#'} 
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
                  <select 
                    value={editedBranch}
                    onChange={(e) => setEditedBranch(e.target.value as ClinicBranch)}
                    className="mt-1 text-[10px] font-bold px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full uppercase tracking-wider border-none focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    <option value="Kajang">Kajang Branch</option>
                    <option value="Seri Kembangan">Seri Kembangan Branch</option>
                  </select>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Appointment Date</p>
                <p className="text-sm font-bold text-indigo-600">{caseData.appointmentDate ? new Date(caseData.appointmentDate).toLocaleDateString() : '-'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200/60">
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
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Last Visit</p>
                <p className="text-sm font-medium text-slate-700">{caseData.lastVisitDate ? new Date(caseData.lastVisitDate).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Follow Up Tag Selector */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Update Follow Up Tag</label>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {defaultTags.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all uppercase tracking-wider",
                      caseData.followUpTag === s
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30",
                      editedTag === s && caseData.followUpTag !== s && "ring-2 ring-indigo-500 ring-offset-2"
                    )}
                  >
                    {s}
                  </button>
                ))}
                {!defaultTags.includes(caseData.followUpTag) && (
                  <button
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 uppercase tracking-wider",
                      editedTag === caseData.followUpTag ? "opacity-100" : "opacity-50"
                    )}
                  >
                    {caseData.followUpTag}
                  </button>
                )}
                {editedTag && !defaultTags.includes(editedTag) && editedTag !== caseData.followUpTag && (
                  <button
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold border bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 uppercase tracking-wider ring-2 ring-indigo-500 ring-offset-2"
                  >
                    {editedTag}
                  </button>
                )}
                <button
                  onClick={() => setShowNewTagInput(!showNewTagInput)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all uppercase tracking-wider",
                    showNewTagInput 
                      ? "bg-indigo-50 text-indigo-600 border-indigo-200" 
                      : "bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50"
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
                          handleStatusChange(newTagValue.trim());
                          setNewTagValue('');
                          setShowNewTagInput(false);
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      if (newTagValue.trim()) {
                        handleStatusChange(newTagValue.trim());
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
              className="w-full text-sm text-slate-700 leading-relaxed bg-white border border-slate-200 p-4 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[100px] resize-none"
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
                  className="text-xs font-bold text-indigo-600 flex items-center gap-1.5 hover:text-indigo-700 disabled:opacity-50"
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
              <textarea 
                value={editedRemarks}
                onChange={(e) => setEditedRemarks(e.target.value)}
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 min-h-[100px] text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                placeholder="Enter remarks..."
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Follow up done by</label>
              <div className="bg-white border border-slate-200 px-4 py-3 rounded-xl flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <User className="w-4 h-4" />
                </div>
                <p className="text-sm font-medium text-slate-700">{caseData.followUpDoneBy || 'Not specified'}</p>
              </div>
            </div>

            {/* Patient History Section */}
            {canViewHistory && patientHistory.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Past Follow-up History ({patientHistory.length})
                </label>
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
              </div>
            )}

            {/* Wellness Updates Section */}
            {caseData.followUpTag.toLowerCase() === 'arawellness (weight loss)' && wellnessUpdates.length > 0 && (
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

