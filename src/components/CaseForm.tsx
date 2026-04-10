import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { FollowUpCase, FollowUpTag, ClinicBranch } from '../types';
import { suggestUrgency } from '../services/gemini';
import { cn } from '../lib/utils';

interface CaseFormProps {
  onClose: () => void;
  onSubmit: (newCase: Partial<FollowUpCase>) => void;
  existingCases: FollowUpCase[];
}

export default function CaseForm({ onClose, onSubmit, existingCases }: CaseFormProps) {
  const [formData, setFormData] = useState({
    patientId: '',
    patientName: '',
    patientPhone: '',
    branch: 'Kajang' as ClinicBranch,
    diagnosis: '',
    lastVisitDate: '',
    appointmentDate: '',
    doctorInCharge: '',
    remarks: '',
    followUpDoneBy: '',
    followUpTag: 'others' as FollowUpTag,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');

  const defaultTags = ['AraMommy', 'AraHaji', 'AraWellness (weight loss)', 'Referral', 'others'];

  const patientHistory = existingCases
    .filter(c => c.patientId === formData.patientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Check if patient is new when ID changes
  useEffect(() => {
    if (!formData.patientId) {
      setIsNewPatient(false);
      return;
    }
    const exists = existingCases.some(c => c.patientId === formData.patientId);
    setIsNewPatient(!exists);
    
    // If patient exists, try to find their name and phone to auto-fill
    if (exists) {
      const previousCase = existingCases.find(c => c.patientId === formData.patientId);
      if (previousCase) {
        setFormData(prev => ({
          ...prev,
          patientName: previousCase.patientName,
          patientPhone: previousCase.patientPhone || ''
        }));
      }
    } else {
      // If patient ID doesn't match any existing record, clear the auto-filled fields
      setFormData(prev => ({
        ...prev,
        patientName: '',
        patientPhone: ''
      }));
    }
  }, [formData.patientId, existingCases]);

  const handleSuggestUrgency = async () => {
    if (!formData.diagnosis) return;
    setIsAnalyzing(true);
    const suggestion = await suggestUrgency(formData.diagnosis);
    setFormData(prev => ({ ...prev, followUpTag: suggestion }));
    setIsAnalyzing(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-900">New Follow-up Case</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Existing Patient Alert */}
          {!isNewPatient && formData.patientId && (
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-indigo-900">Existing Patient Detected</p>
                <p className="text-xs text-indigo-700 mt-0.5">Would you like to have a look at previous follow-up notes for this patient?</p>
                <button 
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="mt-2 text-xs font-bold text-indigo-600 underline hover:text-indigo-800"
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
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Patient ID</label>
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
                onChange={e => setFormData({...formData, branch: e.target.value as any})}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                  {defaultTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                  {!defaultTags.includes(formData.followUpTag) && formData.followUpTag && (
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
                          setFormData({...formData, followUpTag: newTagValue.trim()});
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
                        setFormData({...formData, followUpTag: newTagValue.trim()});
                        setShowNewTagInput(false);
                        setNewTagValue('');
                      }
                    }}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold"
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
                className="text-[10px] font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-700 disabled:opacity-50"
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
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
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
            <textarea 
              rows={2}
              value={formData.remarks}
              onChange={e => setFormData({...formData, remarks: e.target.value})}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
              placeholder="Additional remarks..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Follow up done by</label>
            <input 
              type="text"
              value={formData.followUpDoneBy}
              onChange={e => setFormData({...formData, followUpDoneBy: e.target.value})}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
            >
              Create Case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

