import React, { useState, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  User,
  Clock,
  AlertCircle,
  X,
  MessageCircle,
  Upload,
  Copy,
  Undo2,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { FollowUpCase, FollowUpTag, UserPermission, UserProfile, Patient } from '../types';
import { cn } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';

interface CaseListProps {
  cases: FollowUpCase[];
  onViewCase: (caseId: string) => void;
  currentUser: UserProfile;
  tagFilter: string | null;
  setTagFilter: (tag: string | null) => void;
}

export default function CaseList({ cases, onViewCase, currentUser, tagFilter, setTagFilter }: CaseListProps) {
  const userPermissions = currentUser.permissions || [];
  const userRole = currentUser.role;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FollowUpTag | 'All'>(tagFilter ? (tagFilter as FollowUpTag) : 'All');
  const [branchFilter, setBranchFilter] = useState<string>('All');

  React.useEffect(() => {
    if (tagFilter) {
      setStatusFilter(tagFilter as FollowUpTag);
    }
  }, [tagFilter]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [historyPatientId, setHistoryPatientId] = useState<string | null>(null);
  // Derive available tags directly from cases prop so the dropdown always
  // reflects real data — no separate Firestore collection to maintain,
  // and new tags added to cases appear immediately.
  // canonicalizeTag collapses variants with different casing or spelling
  // (e.g. 'aramommy', 'AraMommy' → 'AraMommy') into a single entry.
  const availableTags = useMemo(() => {
    const seen = new Set<string>();
    cases.forEach(c => {
      if (c.followUpTag) seen.add(canonicalizeTag(c.followUpTag));
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [cases]);

  const [shareModal, setShareModal] = useState<{
    isOpen: boolean;
    caseData: FollowUpCase | null;
    text: string;
    isLoading: boolean;
    title?: string;
    instruction?: string;
  }>({ isOpen: false, caseData: null, text: '', isLoading: false });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    caseData: FollowUpCase | null;
    isProcessing: boolean;
  }>({
    isOpen: false,
    caseData: null,
    isProcessing: false
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canExportCSV = userPermissions.includes('export_csv');

  const handleExportCSV = () => {
    const csvData = filteredCases.map(c => ({
      DateKeyIn: new Date(c.createdAt).toLocaleDateString(),
      PatientName: c.patientName,
      PatientID: c.patientId,
      Branch: c.branch,
      Diagnosis: c.diagnosis,
      LastVisitDate: c.lastVisitDate,
      AppointmentDate: c.appointmentDate || '',
      DoctorInCharge: c.doctorInCharge,
      Tag: c.followUpTag,
      Phone: c.patientPhone || '',
      Remarks: c.remarks
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `follow_up_cases_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const executeReturn = async () => {
    if (!confirmModal.caseData) return;
    const c = confirmModal.caseData;
    
    setConfirmModal(prev => ({ ...prev, isProcessing: true }));
    try {
      const patientRef = doc(collection(db, 'patients'));
      const patientData: Patient = {
        id: patientRef.id,
        patientId: c.patientId || `P-${Date.now()}`,
        name: c.patientName,
        phone: c.patientPhone || '',
        branch: c.branch,
        tag: c.followUpTag || 'General',
        createdAt: new Date().toISOString(),
        createdByEmail: currentUser.email || 'system',
        createdByUid: currentUser.uid || 'system',
      };

      // 1. Create the patient in directory
      await setDoc(patientRef, patientData);

      // 2. Delete from cases collection
      await deleteDoc(doc(db, 'cases', c.id));

      toast.success(`${c.patientName} moved back to Patient Directory.`);
      setConfirmModal({ isOpen: false, caseData: null, isProcessing: false });
    } catch (error: any) {
      console.error("Error returning patient:", error);
      try {
        handleFirestoreError(error, OperationType.WRITE, `patients/cases - returning ${c.patientName}`);
      } catch (uiError: any) {
        toast.error(uiError.message);
      }
      setConfirmModal(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = (c.patientName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          (c.diagnosis?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (c.doctorInCharge?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (c.patientId?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (c.branch?.toLowerCase() || '').includes(searchTerm.toLowerCase());
                          
    let matchesStatus = true;
    if (statusFilter !== 'All') {
      const normalizedTag = (c.followUpTag || '').toLowerCase().trim();
      const filterLower = statusFilter.toLowerCase().trim();
      
      if (filterLower === 'referral') {
        matchesStatus = normalizedTag.includes('referral');
      } else if (filterLower.includes('arawellness')) {
        matchesStatus = normalizedTag.includes('arawellness');
      } else {
        matchesStatus = normalizedTag === filterLower;
      }
    }

    const matchesBranch = branchFilter === 'All' || c.branch === branchFilter;
    
    const caseDate = new Date(c.createdAt);
    caseDate.setHours(0, 0, 0, 0);
    
    const start = startDate ? new Date(startDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(0, 0, 0, 0);

    const matchesDate = (!start || caseDate >= start) &&
                        (!end || caseDate <= end);

    return matchesSearch && matchesStatus && matchesBranch && matchesDate;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredCases.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCases = filteredCases.slice(startIndex, startIndex + itemsPerPage);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
    if (statusFilter === 'All') setTagFilter(null);
  }, [searchTerm, statusFilter, startDate, endDate]);

  const patientHistory = historyPatientId 
    ? cases.filter(c => c.patientId === historyPatientId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  const historyPatientName = patientHistory[0]?.patientName || '';

  const formatWhatsAppLink = (phone?: string) => {
    if (!phone) return null;
    // Remove non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    // If it starts with '0', replace with '60' (Malaysia)
    const formatted = cleaned.startsWith('0') ? '60' + cleaned.substring(1) : cleaned;
    return `https://wa.me/${formatted}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
        <div className="shrink-0">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight whitespace-nowrap">Follow-up Cases</h2>
          <p className="text-slate-500 text-sm mt-1">Manage and track all patient follow-up requests.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <div className="relative group/search">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/search:text-indigo-950 transition-colors" />
            <input 
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-950/20 focus:border-indigo-950 w-full sm:w-64 transition-all"
            />
          </div>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="All">All Tags</option>
            {availableTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          {userRole === 'Superadmin' && (
            <select 
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="All">All Branches</option>
              <option value="Kajang">Kajang</option>
              <option value="Seri Kembangan">Seri Kembangan</option>
            </select>
          )}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          {canExportCSV && (
            <button 
              className="flex items-center gap-2 px-3 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors"
              onClick={handleExportCSV}
            >
              <Upload className="w-4 h-4" />
              EXPORT CSV
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Patient</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Diagnosis</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Visit Date</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Doctor</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tag</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedCases.map((c) => (
                <tr 
                  key={c.id} 
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                  onClick={() => onViewCase(c.id)}
                >
                  <td className="px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryPatientId(c.patientId);
                          }}
                          className="text-xs font-semibold text-slate-900 hover:text-indigo-600 hover:underline text-left whitespace-normal break-words"
                        >
                          {c.patientName}
                        </button>
                        {(c.followUpTag || '').toLowerCase().includes('referral') && c.remarks && c.remarks.trim() !== '' && !c.isNotesCopied && (
                          <span title="Remarks added. Please copy notes to clinic system." className="flex-shrink-0">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">ID: {c.patientId}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-md text-slate-600 whitespace-nowrap">
                      {c.branch}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-700 font-medium min-w-[200px] leading-relaxed whitespace-normal break-words">
                      {c.diagnosis}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
                      {c.lastVisitDate ? new Date(c.lastVisitDate).toLocaleDateString() : '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-600 whitespace-nowrap">
                    {c.doctorInCharge}
                  </td>
                  <td className="px-4 py-3">
                    <TagBadge tag={c.followUpTag} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {c.patientPhone && (
                        <div className="relative group/btn flex items-center justify-center">
                          <a 
                            href={formatWhatsAppLink(c.patientPhone) || '#'} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                          <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                            WhatsApp Patient
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                          </div>
                        </div>
                      )}
                      <div className="relative group/btn flex items-center justify-center">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            let wellnessText = '';
                            
                            if ((c.followUpTag || '').toLowerCase().includes('arawellness')) {
                              toast.loading('Mengambil data wellness...', { id: 'fetch-wellness' });
                              try {
                                const q = query(collection(db, 'wellness_updates'), where('caseId', '==', c.id));
                                const snapshot = await getDocs(q);
                                if (!snapshot.empty) {
                                  const updates = snapshot.docs.map(doc => doc.data() as any);
                                  updates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                                  
                                  // Group by date and keep only the latest for each date
                                  const uniqueUpdates = [];
                                  const seenDates = new Set();
                                  for (const update of updates) {
                                    const dateStr = new Date(update.createdAt).toLocaleDateString();
                                    if (!seenDates.has(dateStr)) {
                                      seenDates.add(dateStr);
                                      uniqueUpdates.push(update);
                                    }
                                  }

                                  wellnessText = '\nWellness Updates:\n' + uniqueUpdates.map(u => `- ${new Date(u.createdAt).toLocaleDateString()}: Berat ${u.weight}kg, Kesan Sampingan: ${u.sideEffects}`).join('\n');
                                }
                              } catch (err) {
                                console.error("Failed to fetch wellness updates", err);
                              } finally {
                                toast.dismiss('fetch-wellness');
                              }
                            }

                            const textToCopy = [
                              `"Follow up notes"`,
                              `Patient Name: ${c.patientName}`,
                              `Branch: ${c.branch}`,
                              `Doctor In Charge: ${c.doctorInCharge}`,
                              `Visit Date: ${c.lastVisitDate ? new Date(c.lastVisitDate).toLocaleDateString() : '-'}`,
                              `Remarks: ${c.remarks || 'None'}`,
                              wellnessText
                            ].filter(Boolean).join('\n');

                            try {
                              await navigator.clipboard.writeText(textToCopy);
                              toast.success('Notes copied to clipboard!');
                              
                              if ((c.followUpTag || '').toLowerCase().includes('referral') && c.remarks && c.remarks.trim() !== '' && !c.isNotesCopied) {
                                await updateDoc(doc(db, 'cases', c.id), { isNotesCopied: true });
                              }
                            } catch (err) {
                              setShareModal({ 
                                isOpen: true, 
                                caseData: c, 
                                text: textToCopy, 
                                isLoading: false,
                                title: 'Copy Notes',
                                instruction: 'Please copy the notes below:'
                              });
                              
                              if ((c.followUpTag || '').toLowerCase().includes('referral') && c.remarks && c.remarks.trim() !== '' && !c.isNotesCopied) {
                                await updateDoc(doc(db, 'cases', c.id), { isNotesCopied: true });
                              }
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors font-bold text-[10px] uppercase tracking-wider"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </button>
                        <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                          Copy Notes for Plato
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>
                      </div>
                      {(c.followUpTag || '').toLowerCase().includes('arawellness') && (
                        <div className="relative group/btn flex items-center justify-center">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setShareModal({ 
                                isOpen: true, 
                                caseData: c, 
                                text: '', 
                                isLoading: true,
                                title: 'Share Wellness Form',
                                instruction: 'Sila salin mesej di bawah dan hantar kepada pesakit melalui WhatsApp:'
                              });
                              
                              const longUrl = `${window.location.origin}/?form=wellness&caseId=${c.id}`;
                              let finalUrl = longUrl;
                              
                              try {
                                const tinyUrlApi = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`;
                                // Try primary proxy
                                let response = await fetch(`https://corsproxy.io/?${encodeURIComponent(tinyUrlApi)}`);
                                
                                if (!response.ok) {
                                  // Fallback proxy
                                  response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(tinyUrlApi)}`);
                                }
                                
                                if (response.ok) {
                                  const text = await response.text();
                                  if (text && text.startsWith('https://tinyurl.com/')) {
                                    finalUrl = text;
                                  }
                                }
                              } catch (err) {
                                console.error("Failed to shorten URL", err);
                              }

                              const message = `Salam sejahtera ${c.patientName},\n\nSaya dari Klinik ARA 24 Jam. Terima kasih atas kepercayaan tuan/puan memilih kami untuk rawatan suntikan Mounjaro.\n\nBoleh tuan/puan isikan maklumat berat badan terkini dan kesan sampingan ubat (jika ada) melalui pautan rasmi berikut untuk semakan pihak doktor\n${finalUrl}\n\nTerima kasih 😊`;
                              setShareModal({ 
                                isOpen: true, 
                                caseData: c, 
                                text: message, 
                                isLoading: false,
                                title: 'Share Wellness Form',
                                instruction: 'Sila salin mesej di bawah dan hantar kepada pesakit melalui WhatsApp:'
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors font-bold text-[10px] uppercase tracking-wider"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Share
                          </button>
                          <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                            Share Wellness Form Link
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                          </div>
                        </div>
                      )}
                      {(c.followUpTag || '').toLowerCase().includes('referral') && (
                        <div className="relative group/btn flex items-center justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const message = `Salam tuan/puan, saya daripada Klinik ARA 24 Jam, terima kasih kerana mendapatkan perkhidmatan di klinik kami.\n\nBoleh saya tahu keadaan ${c.patientName} setelah dirujuk ke hospital tempoh hari?`;
                              setShareModal({ 
                                isOpen: true, 
                                caseData: c, 
                                text: message, 
                                isLoading: false,
                                title: 'WhatsApp Referral Case',
                                instruction: 'Sila salin mesej di bawah dan hantar kepada pesakit melalui WhatsApp:'
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors font-bold text-[10px] uppercase tracking-wider"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Message
                          </button>
                          <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                            WhatsApp Referral Message
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                          </div>
                        </div>
                      )}
                      <div className="relative group/btn flex items-center justify-center">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewCase(c.id);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors font-bold text-[10px] uppercase tracking-wider"
                        >
                          View
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                          View Case Details
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>
                      </div>

                      {['Superadmin', 'Admin'].includes(userRole || '') && (
                        <div className="relative group/btn flex items-center justify-center">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmModal({
                                isOpen: true,
                                caseData: c,
                                isProcessing: false
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors font-bold text-[10px] uppercase tracking-wider"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            Return
                          </button>
                          <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                            Return to Directory
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredCases.length === 0 && (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 text-slate-400 mb-4">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-slate-900 font-medium">No cases found</h3>
            <p className="text-slate-500 text-sm mt-1">Try adjusting your search or filters.</p>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              Showing <span className="text-slate-900">{startIndex + 1}</span> to <span className="text-slate-900">{Math.min(startIndex + itemsPerPage, filteredCases.length)}</span> of <span className="text-slate-900">{filteredCases.length}</span> cases
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                      currentPage === page 
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" 
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Patient History Modal */}
      {historyPatientId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900">Patient History: {historyPatientName}</h3>
                <p className="text-xs text-slate-500">ID: {historyPatientId}</p>
              </div>
              <button onClick={() => setHistoryPatientId(null)} className="p-2 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Diagnosis</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Remarks</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Doctor</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patientHistory.map((h, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4 text-xs font-medium text-slate-600">
                        {new Date(h.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-900 font-semibold">
                        {h.diagnosis}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500 italic">
                        {h.remarks || '-'}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-600">
                        {h.doctorInCharge}
                      </td>
                      <td className="px-4 py-4">
                        <TagBadge tag={h.followUpTag} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setHistoryPatientId(null)}
                className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors"
              >
                CLOSE HISTORY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return to Directory Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Undo2 className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Return to Directory?</h3>
              <p className="text-sm text-slate-500 mb-6">
                Ini akan memindahkan pesakit <b>{confirmModal.caseData?.patientName}</b> kembali ke Tab Patients. Rekod follow-up semasa akan dipadamkan.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal({ isOpen: false, caseData: null, isProcessing: false })}
                  disabled={confirmModal.isProcessing}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={executeReturn}
                  disabled={confirmModal.isProcessing}
                  className="flex-1 px-4 py-2.5 bg-indigo-950 text-white rounded-xl text-sm font-bold hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {confirmModal.isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : <Check className="w-4 h-4" />}
                  Yes, Return
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900">{shareModal.title || 'Share'}</h3>
              <button onClick={() => setShareModal({ isOpen: false, caseData: null, text: '', isLoading: false })} className="p-2 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {shareModal.isLoading ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                  <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                  <p className="text-sm text-slate-500 font-medium">Generating short link...</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    {shareModal.instruction || 'Please copy the message below:'}
                  </p>
                  <div className="relative">
                    <textarea 
                      readOnly
                      value={shareModal.text}
                      className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none resize-none"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(shareModal.text);
                      toast.success('Message copied successfully!');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-950 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition-colors shadow-lg shadow-indigo-200"
                  >
                    <Copy className="w-4 h-4" />
                    COPY MESSAGE
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Collapses all known tag variants into one canonical display name so the
// dropdown shows each logical tag exactly once regardless of how it was typed.
function canonicalizeTag(tag: string): string {
  const t = (tag || '').toLowerCase().trim();
  if (t === 'aramommy')             return 'AraMommy';
  if (t === 'arachronic')           return 'AraChronic';
  if (t.includes('arawellness'))    return 'AraWellness (weight loss)';
  if (t.includes('referral'))       return 'Referral';
  if (t === 'others')               return 'Others';
  // Unknown tags: keep original but trimmed
  return tag.trim();
}

function TagBadge({ tag }: { tag: FollowUpTag }) {
  const normalizedTag = (tag || '').toLowerCase().trim();
  let styleKey = normalizedTag;
  let displayTag = tag || 'Unknown';

  if (normalizedTag.includes('referral')) {
    styleKey = 'referral';
    displayTag = 'Referral';
  } else if (normalizedTag.includes('arawellness')) {
    styleKey = 'arawellness';
    displayTag = 'AraWellness';
  } else if (normalizedTag === 'aramommy') {
    styleKey = 'aramommy';
    displayTag = 'AraMommy';
  } else if (normalizedTag === 'arachronic') {
    styleKey = 'arachronic';
    displayTag = 'AraChronic';
  }

  const styles: Record<string, string> = {
    'aramommy': "bg-pink-50 text-pink-700 border-pink-100",
    'arachronic': "bg-blue-50 text-blue-700 border-blue-100",
    'arawellness': "bg-emerald-50 text-emerald-700 border-emerald-100",
    'referral': "bg-indigo-50 text-indigo-950 border-indigo-100",
    'others': "bg-slate-50 text-slate-700 border-slate-100",
  };

  return (
    <span className={cn(
      "px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider",
      styles[styleKey] || styles['others']
    )}>
      {displayTag}
    </span>
  );
}
