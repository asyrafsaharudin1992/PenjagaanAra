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
  Check,
  Loader2,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { FollowUpCase, FollowUpTag, UserPermission, UserProfile, Patient } from '../types';
import { cn, normalizeTag } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';

interface CaseListProps {
  cases: FollowUpCase[];
  onViewCase: (caseId: string) => void;
  currentUser: UserProfile;
  tagFilter: string | null;
  setTagFilter: (tag: string | null) => void;
  caseLimit: number | null;
  setCaseLimit: (limit: number | null) => void;
}

const STATUS_OPTIONS = ['Active', 'Responded', 'No Response', 'To contact later', 'Defaulter'];
const STATUS_COLORS: Record<string, string> = {
  'Active': 'bg-[#E6F4EA] text-[#137333]',
  'Responded': 'bg-[#E8F0FE] text-[#1A73E8]',
  'No Response': 'bg-[#FEF7E0] text-[#B06000]',
  'To contact later': 'bg-[#F3E8FF] text-[#6B21A8]',
  'Defaulter': 'bg-[#FCE8E6] text-[#C5221F]',
};

const defaultTemplates: Record<string, string> = {
  'All Branches|arawellness': `Salam sejahtera {{nama}},\n\nSaya dari Klinik ARA 24 Jam. Terima kasih atas kepercayaan tuan/puan memilih kami untuk rawatan suntikan Mounjaro.\n\nBoleh tuan/puan isikan maklumat berat badan terkini dan kesan sampingan ubat (jika ada) melalui pautan rasmi berikut untuk semakan pihak doktor\n{{url}}\n\nTerima kasih 😊`,
  'All Branches|referral': `Salam tuan/puan, saya daripada Klinik ARA 24 Jam, terima kasih kerana mendapatkan perkhidmatan di klinik kami.\n\nBoleh saya tahu keadaan {{nama}} setelah dirujuk ke hospital tempoh hari?`,
  'All Branches|aramommy': `Salam puan {{nama}},\n\nIni adalah peringatan dari Klinik ARA 24 Jam berkenaan temu janji ARAMOMMY.`,
  'All Branches|arachronic': `Salam tuan/puan {{nama}},\n\nIni adalah peringatan dari Klinik ARA 24 Jam untuk pemeriksaan penyakit kronik.`,
  'All Branches|arasihat': `Salam tuan/puan {{nama}},\n\nIni meupakan peringatan dari Klinik ARA 24 Jam berkenaan pemeriksaan saringan kesihatan AraSihat anda.`,
  'All Branches|missed_appointment': `Salam Tuan/Puan {{nama}},\n\nKami dapati Tuan/Puan telah terlepas temu janji di Klinik ARA 24 Jam.\n\nSekiranya Tuan/Puan berhasrat untuk menjadualkan semula tarikh temu janji, sila maklumkan kepada pihak kami.\n\nTerima kasih,\nKlinik ARA 24 Jam`,
  'All Branches|others': `Salam tuan/puan {{nama}},\n\nIni adalah mesej susulan dari Klinik ARA 24 Jam.`,
};

export default function CaseList({ cases, onViewCase, currentUser, tagFilter, setTagFilter, caseLimit, setCaseLimit }: CaseListProps) {
  const userPermissions = currentUser.permissions || [];
  const userRole = currentUser.role;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FollowUpTag | 'All'>(tagFilter ? (tagFilter as FollowUpTag) : 'All');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [patientStatusFilter, setPatientStatusFilter] = useState<string>('All');
  const [statusPopoverId, setStatusPopoverId] = useState<string | null>(null);

  // States for inline panel editing
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [editingPanelValue, setEditingPanelValue] = useState<string>('');
  const [isSavingPanel, setIsSavingPanel] = useState<boolean>(false);

  const handleSavePanelInline = async (caseId: string, value: string) => {
    setIsSavingPanel(true);
    try {
      const caseRef = doc(db, 'cases', caseId);
      await updateDoc(caseRef, { panel: value.trim() });
      toast.success('Panel updated successfully!');
      setEditingPanelId(null);
    } catch (error) {
      console.error('Error updating panel:', error);
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseId}`);
    } finally {
      setIsSavingPanel(false);
    }
  };

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.status-popover-container')) {
        setStatusPopoverId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (tagFilter) {
      setStatusFilter(tagFilter as FollowUpTag);
    }
  }, [tagFilter]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [historyPatientId, setHistoryPatientId] = useState<string | null>(null);

  // States for "Update Doctor" tab
  const [activeTab, setActiveTab] = useState<'all' | 'update_doctor'>('all');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('');
  const [doctorDateType, setDoctorDateType] = useState<'lastVisitDate' | 'createdAt'>('lastVisitDate');
  const [doctorStartDate, setDoctorStartDate] = useState<string>('');
  const [doctorEndDate, setDoctorEndDate] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  // Derive available tags directly from cases prop so the dropdown always
  // reflects real data — no separate Firestore collection to maintain,
  // and new tags added to cases appear immediately.
  // canonicalizeTag collapses variants with different casing or spelling
  // (e.g. 'aramommy', 'AraMommy' → 'AraMommy') into a single entry.
  const availableTags = useMemo(() => {
    const seen = new Set<string>();
    cases.forEach(c => {
      if (c.followUpTag) seen.add(normalizeTag(c.followUpTag));
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

  const [sortBy, setSortBy] = useState<'createdAt_desc' | 'nextFollowUpDate_desc' | 'nextFollowUpDate_asc' | 'appointmentDate_desc' | 'lastVisitDate_desc'>('createdAt_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canExportCSV = userPermissions.includes('export_csv');

  const [exportModal, setExportModal] = useState({ isOpen: false, startPage: 1, endPage: 1, isExporting: false });

  const [customTemplates, setCustomTemplates] = useState<Record<string, string>>(defaultTemplates);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplateBranch, setSelectedTemplateBranch] = useState<string>('All Branches');
  const [selectedTemplateTag, setSelectedTemplateTag] = useState<string>('arawellness');

  React.useEffect(() => {
    const saved = localStorage.getItem('followup_whatsapp_templates');
    if (saved) {
      try {
        setCustomTemplates(prev => ({ ...prev, ...JSON.parse(saved) }));
      } catch(e) {}
    }
  }, []);

  const saveTemplates = (newTemplates: Record<string, string>) => {
    setCustomTemplates(newTemplates);
    localStorage.setItem('followup_whatsapp_templates', JSON.stringify(newTemplates));
    if (typeof toast !== 'undefined' && toast.success) {
      toast.success('WhatsApp templates updated successfully');
    }
  };

  const getTemplateMessage = (branch: string, tag: string, p: FollowUpCase, finalUrl?: string) => {
    const t = (tag || 'others').toLowerCase().trim();
    // try exact match first
    let tmpl = customTemplates[`${branch}|${t}`];
    if (!tmpl) {
      tmpl = customTemplates[`All Branches|${t}`];
    }
    if (!tmpl) {
      tmpl = customTemplates[`All Branches|others`];
    }

    return (tmpl || '')
      .replace(/\{\{nama\}\}/g, p.patientName || 'Tuan/Puan')
      .replace(/\{\{url\}\}/g, finalUrl || '-');
  };

  const handleExportCSV = () => {
    setExportModal({
      isOpen: true,
      startPage: 1,
      endPage: Math.ceil(sortedFilteredCases.length / itemsPerPage) || 1,
      isExporting: false
    });
  };

  const handleProceedExport = async () => {
    setExportModal(prev => ({ ...prev, isExporting: true }));
    try {
      const startIndex = (exportModal.startPage - 1) * itemsPerPage;
      const endIndex = exportModal.endPage * itemsPerPage;
      const casesToExport = sortedFilteredCases.slice(Math.max(0, startIndex), Math.min(sortedFilteredCases.length, endIndex));

      const csvData = [];
      const total = casesToExport.length;
      let count = 0;

      for (const c of casesToExport) {
        count++;
        // We update a toast or something if this takes too long, but it should be fast enough.
        
        let wellnessText = '';
        if ((c.followUpTag || '').toLowerCase().includes('arawellness')) {
          try {
            const q = query(collection(db, 'wellness_updates'), where('caseId', '==', c.id));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              const updates = snapshot.docs.map(doc => doc.data() as any);
              updates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              const uniqueUpdates = [];
              const seenDates = new Set();
              for (const update of updates) {
                const dateStr = new Date(update.createdAt).toLocaleDateString();
                if (!seenDates.has(dateStr)) {
                  seenDates.add(dateStr);
                  uniqueUpdates.push(update);
                }
              }
              wellnessText = uniqueUpdates.map(u => `${new Date(u.createdAt).toLocaleDateString()}: Weight ${u.weight}kg, Side Effects: ${u.sideEffects}, Refill: ${u.needsRefill ? 'Yes' : 'No'}`).join(' | ');
            }
          } catch (e) {
            console.error(e);
          }
        }

        let parsedRegistry = null;
        if (c.registryData) {
          try {
            parsedRegistry = typeof c.registryData === 'string' ? JSON.parse(c.registryData) : c.registryData;
          } catch (e) {}
        }

        let combinedRemarks = c.remarks || '';
        if (parsedRegistry) {
          if (parsedRegistry?.type === 'NCD') {
            const ncdDetails = `[NCD] Last Blood Test: ${parsedRegistry.lastBloodTest || '-'} | Next: ${parsedRegistry.nextBloodTestDue || '-'} | Meds: ${parsedRegistry.medication || '-'} | Refill Status: ${parsedRegistry.refillStatus || '-'} | Refill Meds Date: ${parsedRegistry.refillMedsDate || '-'} | Compliance: ${parsedRegistry.compliance || '-'}`;
            combinedRemarks = combinedRemarks ? `${combinedRemarks}\n${ncdDetails}` : ncdDetails;
          } else if (parsedRegistry?.type === 'ANC') {
            const ancDetails = `[ANC] GA: ${parsedRegistry.gaWeeks || '-'} | Supplement: ${parsedRegistry.supplementGiven || '-'} | Compliance: ${parsedRegistry.compliance || '-'} | Risk: ${parsedRegistry.riskCategory || '-'}`;
            combinedRemarks = combinedRemarks ? `${combinedRemarks}\n${ancDetails}` : ancDetails;
          }
        }
        if (wellnessText) {
          const wellnessStr = `[Wellness] ${wellnessText}`;
          combinedRemarks = combinedRemarks ? `${combinedRemarks}\n${wellnessStr}` : wellnessStr;
        }

        csvData.push({
          DateKeyIn: new Date(c.createdAt).toLocaleDateString(),
          PatientName: c.patientName,
          PatientID: c.patientId,
          Branch: c.branch,
          Panel: c.panel || '',
          Diagnosis: c.diagnosis,
          LastVisitDate: c.lastVisitDate,
          AppointmentDate: c.appointmentDate || '',
          DoctorInCharge: c.doctorInCharge,
          Status: (c.status || []).join(', '),
          Tag: c.followUpTag,
          Phone: c.patientPhone || '',
          Remarks: combinedRemarks
        });
      }

      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `follow_up_cases_pages_${exportModal.startPage}-${exportModal.endPage}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV exported successfully!');
      setExportModal(prev => ({ ...prev, isOpen: false }));
    } catch (err) {
      console.error(err);
      toast.error('Failed to export CSV');
    } finally {
      setExportModal(prev => ({ ...prev, isExporting: false }));
    }
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

  const toggleStatus = async (caseId: string, currentStatuses: string[], toggledStatus: string) => {
    try {
      const dbRef = doc(db, 'cases', caseId);
      const newStatuses = currentStatuses.includes(toggledStatus)
        ? currentStatuses.filter(s => s !== toggledStatus)
        : [...currentStatuses, toggledStatus];
      await updateDoc(dbRef, { status: newStatuses });
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = (c.patientName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          (c.diagnosis?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (c.doctorInCharge?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (c.patientId?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (c.branch?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (c.panel?.toLowerCase() || '').includes(searchTerm.toLowerCase());
                          
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
    
    let matchesPatientStatus = true;
    if (patientStatusFilter !== 'All') {
      matchesPatientStatus = c.status && c.status.includes(patientStatusFilter) ? true : false;
    }
    
    const caseDate = new Date(c.createdAt);
    caseDate.setHours(0, 0, 0, 0);
    
    const start = startDate ? new Date(startDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(0, 0, 0, 0);

    const matchesDate = (!start || caseDate >= start) &&
                        (!end || caseDate <= end);

    return matchesSearch && matchesStatus && matchesBranch && matchesPatientStatus && matchesDate;
  });

  // Sort logic based on selected sortBy option
  const sortedFilteredCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => {
      if (sortBy === 'createdAt_desc') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortBy === 'nextFollowUpDate_desc') {
        return new Date(b.nextFollowUpDate || 0).getTime() - new Date(a.nextFollowUpDate || 0).getTime();
      }
      if (sortBy === 'nextFollowUpDate_asc') {
        return new Date(a.nextFollowUpDate || 0).getTime() - new Date(b.nextFollowUpDate || 0).getTime();
      }
      if (sortBy === 'appointmentDate_desc') {
        return new Date(b.appointmentDate || 0).getTime() - new Date(a.appointmentDate || 0).getTime();
      }
      if (sortBy === 'lastVisitDate_desc') {
        return new Date(b.lastVisitDate || 0).getTime() - new Date(a.lastVisitDate || 0).getTime();
      }
      return 0;
    });
  }, [filteredCases, sortBy]);

  // Pagination logic
  const totalPages = Math.ceil(sortedFilteredCases.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCases = sortedFilteredCases.slice(startIndex, startIndex + itemsPerPage);

  // Reset to page 1 when filters or sort change
  React.useEffect(() => {
    setCurrentPage(1);
    if (statusFilter === 'All') setTagFilter(null);
  }, [searchTerm, statusFilter, startDate, endDate, sortBy]);

  const patientHistory = historyPatientId 
    ? cases.filter(c => c.patientId === historyPatientId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  const historyPatientName = patientHistory[0]?.patientName || '';

  const uniqueDoctors = useMemo(() => {
    const doctors = new Set<string>();
    cases.forEach(c => {
      if (c.doctorInCharge && c.doctorInCharge.trim() !== '') {
        const parsed = c.doctorInCharge.split(/[\/\\,&]|\band\b/i).map(d => d.trim()).filter(d => d.length > 0);
        parsed.forEach(doc => {
          // Exclude names that start with "Dr" or "Dr."
          if (/^(dr\b|dr\.)/i.test(doc)) {
            return;
          }
          const formatted = doc.replace(/\b\w/g, l => l.toUpperCase());
          doctors.add(formatted);
        });
      }
    });
    return Array.from(doctors).sort((a, b) => a.localeCompare(b));
  }, [cases]);

  const doctorPatients = useMemo(() => {
    if (!selectedDoctor) return [];
    
    return cases.filter(c => {
      if (!c.doctorInCharge || c.doctorInCharge.trim() === '') {
        return false;
      }
      
      const parsed = c.doctorInCharge.split(/[\/\\,&]|\band\b/i).map(d => d.trim()).filter(d => d.length > 0);
      const isMatch = parsed.some(doc => {
        if (/^(dr\b|dr\.)/i.test(doc)) {
          return false;
        }
        const formatted = doc.replace(/\b\w/g, l => l.toUpperCase());
        return formatted.toLowerCase() === selectedDoctor.toLowerCase();
      });
      
      if (!isMatch) {
        return false;
      }
      
      // Must have remarks (update taken from remarks box)
      if (!c.remarks || c.remarks.trim() === '') {
        return false;
      }
      
      const targetDate = doctorDateType === 'lastVisitDate' ? c.lastVisitDate : c.createdAt;
      if (!targetDate) return false;
      
      const dateObj = new Date(targetDate);
      if (isNaN(dateObj.getTime())) return false;
      
      if (doctorStartDate) {
        const start = new Date(doctorStartDate);
        start.setHours(0, 0, 0, 0);
        if (dateObj < start) return false;
      }
      
      if (doctorEndDate) {
        const end = new Date(doctorEndDate);
        end.setHours(23, 59, 59, 999);
        if (dateObj > end) return false;
      }
      
      return true;
    }).sort((a, b) => {
      const timeA = new Date(doctorDateType === 'lastVisitDate' ? (a.lastVisitDate || a.createdAt) : a.createdAt).getTime();
      const timeB = new Date(doctorDateType === 'lastVisitDate' ? (b.lastVisitDate || b.createdAt) : b.createdAt).getTime();
      return timeB - timeA;
    });
  }, [cases, selectedDoctor, doctorDateType, doctorStartDate, doctorEndDate]);

  const generatedReportText = useMemo(() => {
    if (!selectedDoctor || doctorPatients.length === 0) return '';
    
    let reportText = `*PATIENT UPDATES FOR DR. ${selectedDoctor.toUpperCase()}*\n`;
    if ((doctorStartDate || doctorEndDate) && doctorDateType === 'lastVisitDate') {
      const startStr = doctorStartDate ? new Date(doctorStartDate).toLocaleDateString('en-GB') : 'Start';
      const endStr = doctorEndDate ? new Date(doctorEndDate).toLocaleDateString('en-GB') : 'End';
      reportText += `Period (Last Visit): ${startStr} to ${endStr}\n`;
    }
    reportText += `\nWe have been following up on our referred cases, and these are the updates from your patients who responded. Please note that this information comes directly from them, so it may be incomplete.\n`;
    reportText += `\n[⚠️ DISCLAIMER: This update is from patient only, so the information may be inadequate.]\n\n`;
    
    doctorPatients.forEach((p, idx) => {
      const visitDateStr = p.lastVisitDate ? new Date(p.lastVisitDate).toLocaleDateString('en-GB') : '-';
      const followUpDateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB') : '-';
      reportText += `${idx + 1}. *${p.patientName}* (ID: ${p.patientId})\n`;
      reportText += `   - Last Visit Date: ${visitDateStr}\n`;
      reportText += `   - Follow Up Date: ${followUpDateStr}\n`;
      if (p.diagnosis) {
        reportText += `   - Diagnosis during referral: ${p.diagnosis}\n`;
      }
      reportText += `   - Follow up remarks: ${p.remarks}\n\n`;
    });
    
    return reportText.trim();
  }, [doctorPatients, selectedDoctor, doctorDateType, doctorStartDate, doctorEndDate]);

  const copyReportToClipboard = () => {
    const reportText = generatedReportText;
    if (!reportText) return;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(reportText);
      toast.success("Report copied to clipboard!");
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = reportText;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success("Report copied to clipboard!");
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        toast.error("Failed to copy report. Please copy manually.");
      }
      document.body.removeChild(textArea);
    }
  };

  const formatWhatsAppLink = (phone?: string, message?: string) => {
    if (!phone) return null;
    // Remove non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    // If it starts with '0', replace with '60' (Malaysia)
    const formatted = cleaned.startsWith('0') ? '60' + cleaned.substring(1) : cleaned;
    
    let url = `https://wa.me/${formatted}`;
    if (message) {
      url += `?text=${encodeURIComponent(message)}`;
    }
    return url;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight whitespace-nowrap">Follow-up Cases</h2>
          <p className="text-slate-500 text-sm mt-1">Manage and track all patient follow-up requests.</p>
        </div>
        
        {/* Modern Tab Switcher */}
        <div className="bg-slate-100 p-1 rounded-xl flex self-start md:self-auto shrink-0 border border-slate-200/50">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
              activeTab === 'all'
                ? "bg-white text-indigo-950 shadow-sm"
                : "text-slate-600 hover:text-slate-950"
            )}
          >
            All Cases
          </button>
          <button
            onClick={() => setActiveTab('update_doctor')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider flex items-center gap-1.5",
              activeTab === 'update_doctor'
                ? "bg-white text-indigo-950 shadow-sm"
                : "text-slate-600 hover:text-slate-950"
            )}
          >
            Update Doctor
          </button>
        </div>
      </div>

      {activeTab === 'all' ? (
        <>
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
          <select 
            value={patientStatusFilter}
            onChange={(e) => setPatientStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="All">All Statuses</option>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="createdAt_desc">Sort: Newest Key-in</option>
            <option value="nextFollowUpDate_desc">Sort: Newest Follow-up</option>
            <option value="nextFollowUpDate_asc">Sort: Upcoming Follow-up</option>
            <option value="appointmentDate_desc">Sort: Newest Appt Date</option>
            <option value="lastVisitDate_desc">Sort: Newest Last Visit</option>
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
            <span className="text-sm font-bold text-slate-500 hidden sm:inline-block">Key-in date:</span>
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
          
          <button 
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
            onClick={() => setIsTemplateModalOpen(true)}
          >
            <MessageCircle className="w-4 h-4" />
            TEMPLATES
          </button>
        </div>

      {caseLimit ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0 mt-0.5">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Viewing Window: Last 500 cases</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Only the 500 most recent cases are loaded by default to maintain lightning-fast performance.
              </p>
            </div>
          </div>
          <button
            onClick={() => setCaseLimit(null)}
            className="self-start sm:self-center px-4 py-2 bg-indigo-950 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-900 transition-all active:scale-95 whitespace-nowrap shrink-0 shadow-sm"
          >
            Load All Cases
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50/50 border border-emerald-200/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl shrink-0 mt-0.5">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-emerald-900 text-sm">Full Database Loaded</h4>
              <p className="text-xs text-emerald-600 mt-0.5">
                All historical processed cases are loaded. CSV exports will contain the entire lifetime database.
              </p>
            </div>
          </div>
          <button
            onClick={() => setCaseLimit(500)}
            className="self-start sm:self-center px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 whitespace-nowrap shrink-0"
          >
            Restore 500 Limit
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="w-full">
          <table className="w-full text-left border-collapse table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-2 xl:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Patient</th>
                <th className="px-2 xl:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Branch / Panel</th>
                <th className="px-2 xl:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Diagnosis</th>
                <th className="px-2 xl:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Visit Date</th>
                <th className="px-2 xl:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Appt Date</th>
                <th className="px-2 xl:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Doctor</th>
                <th className="px-2 xl:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Tag</th>
                <th className="px-2 xl:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right truncate">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedCases.map((c) => (
                <tr 
                  key={c.id} 
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                  onClick={() => onViewCase(c.id)}
                >
                  <td className="px-2 xl:px-4 py-3 align-top min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-start gap-1.5 h-full">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryPatientId(c.patientId);
                          }}
                          className="font-semibold text-slate-800 whitespace-normal break-words leading-snug hover:text-indigo-600 hover:underline text-left text-xs xl:text-sm"
                        >
                          {c.patientName}
                        </button>
                        {(c.followUpTag || '').toLowerCase().includes('referral') && c.remarks && c.remarks.trim() !== '' && !c.isNotesCopied && (
                          <span title="Remarks added. Please copy notes to clinic system." className="flex-shrink-0 mt-0.5">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] xl:text-xs text-slate-400 mt-1">ID: {c.patientId}</p>
                      <div className="status-popover-container relative mt-1.5" onClick={(e) => e.stopPropagation()}>
                        <div 
                          className="flex flex-wrap gap-1 cursor-pointer min-h-[20px] items-center" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatusPopoverId(statusPopoverId === c.id ? null : c.id);
                          }}
                        >
                          {(c.status || []).length > 0 ? (
                            (c.status || []).map(status => (
                              <span 
                                key={status} 
                                className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}
                              >
                                {status}
                              </span>
                            ))
                          ) : (
                            <span className="text-[9px] text-slate-400 italic">No Status</span>
                          )}
                        </div>
                        {statusPopoverId === c.id && (
                          <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-slate-200 z-50 p-2 py-1.5">
                            {STATUS_OPTIONS.map(opt => {
                              const isActive = (c.status || []).includes(opt);
                              return (
                                <label key={opt} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 cursor-pointer rounded">
                                  <div className="relative flex items-center justify-center">
                                    <input 
                                      type="checkbox" 
                                      className="peer appearance-none w-4 h-4 border border-slate-300 rounded bg-white checked:bg-indigo-600 checked:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors cursor-pointer"
                                      checked={isActive}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleStatus(c.id, c.status || [], opt);
                                      }}
                                    />
                                    <Check className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                                  </div>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap ${STATUS_COLORS[opt]}`}>
                                    {opt}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 xl:px-4 py-3 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[9px] xl:text-[10px] font-bold px-1.5 xl:px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 truncate max-w-full inline-block">
                        {c.branch}
                      </span>

                      {editingPanelId === c.id ? (
                        <div className="flex items-center gap-1 mt-0.5 w-full max-w-[130px]">
                          <input
                            type="text"
                            autoFocus
                            value={editingPanelValue}
                            onChange={(e) => setEditingPanelValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePanelInline(c.id, editingPanelValue);
                              if (e.key === 'Escape') setEditingPanelId(null);
                            }}
                            placeholder="Panel name"
                            className="w-full text-[10px] px-1.5 py-0.5 border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white text-slate-800"
                          />
                          <button
                            disabled={isSavingPanel}
                            onClick={() => handleSavePanelInline(c.id, editingPanelValue)}
                            className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Save Panel"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingPanelId(null)}
                            className="p-0.5 text-slate-400 hover:bg-slate-100 rounded"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div 
                          className="flex items-center gap-1 cursor-pointer group/panel" 
                          onClick={() => {
                            setEditingPanelId(c.id);
                            setEditingPanelValue(c.panel || '');
                          }}
                          title="Click to edit panel"
                        >
                          {c.panel ? (
                            <span className="text-[9px] xl:text-[10px] font-bold px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/80 rounded-md truncate max-w-full inline-flex items-center gap-1 hover:bg-purple-100 transition-colors">
                              {c.panel}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-400 hover:text-purple-600 italic px-1 py-0.5 rounded hover:bg-purple-50 transition-colors flex items-center gap-0.5">
                              + Panel
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-2 xl:px-4 py-3 min-w-0">
                    <p className="text-[10px] xl:text-xs text-slate-700 font-medium leading-relaxed truncate" title={c.diagnosis || '-'}>
                      {c.diagnosis || '-'}
                    </p>
                  </td>
                  <td className="px-2 xl:px-4 py-3 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] xl:text-xs font-medium text-slate-600 truncate">
                      {c.lastVisitDate ? new Date(c.lastVisitDate).toLocaleDateString() : '-'}
                    </div>
                  </td>
                  <td className="px-2 xl:px-4 py-3 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] xl:text-xs font-bold text-indigo-700 truncate bg-indigo-50/50 px-1.5 xl:px-2 py-1 rounded border border-indigo-100">
                      {c.appointmentDate ? new Date(c.appointmentDate).toLocaleDateString() : '-'}
                    </div>
                  </td>
                  <td className="px-2 xl:px-4 py-3 text-[10px] xl:text-xs font-medium text-slate-600 truncate min-w-0">
                    {c.doctorInCharge}
                  </td>
                  <td className="px-2 xl:px-4 py-3 align-top min-w-0">
                    <TagBadge tag={c.followUpTag} />
                  </td>
                  <td className="px-2 xl:px-4 py-3 align-top text-right">
                    <div className="grid grid-cols-3 gap-1 w-fit ml-auto">
                      {c.patientPhone && (
                        <div className="relative group/btn flex items-center justify-center">
                          <a 
                            href={formatWhatsAppLink(c.patientPhone, getTemplateMessage(c.branch || 'All Branches', c.followUpTag || 'others', c)) || '#'} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors"
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
                          className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                          <Copy className="w-4 h-4 shrink-0" />
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

                              const message = getTemplateMessage(c.branch || 'All Branches', 'arawellness', c, finalUrl);
                              setShareModal({ 
                                isOpen: true, 
                                caseData: c, 
                                text: message, 
                                isLoading: false,
                                title: 'Share Wellness Form',
                                instruction: 'Sila salin mesej di bawah dan hantar kepada pesakit melalui WhatsApp:'
                              });
                            }}
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 shrink-0" />
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
                              const message = getTemplateMessage(c.branch || 'All Branches', 'referral', c);
                              setShareModal({ 
                                isOpen: true, 
                                caseData: c, 
                                text: message, 
                                isLoading: false,
                                title: 'WhatsApp Referral Case',
                                instruction: 'Sila salin mesej di bawah dan hantar kepada pesakit melalui WhatsApp:'
                              });
                            }}
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                          >
                            <MessageCircle className="w-4 h-4 shrink-0" />
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
                          className="flex items-center justify-center w-7 h-7 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4 shrink-0" />
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
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors"
                          >
                            <Undo2 className="w-4 h-4 shrink-0" />
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
    </>
  ) : (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Controls Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Generate Doctor Patient Updates</h3>
            <p className="text-slate-500 text-xs mt-0.5">Filter patients with follow-up remarks by doctor and selected date filter range.</p>
          </div>
          
          {doctorPatients.length > 0 && (
            <button
              onClick={copyReportToClipboard}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm self-stretch md:self-auto justify-center",
                isCopied 
                  ? "bg-emerald-600 text-white" 
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              )}
            >
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {isCopied ? "COPIED!" : "COPY REPORT"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select Doctor</label>
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            >
              <option value="">-- Choose a Doctor --</option>
              {uniqueDoctors.map(docName => (
                <option key={docName} value={docName}>{docName}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filter Date By</label>
            <select
              value={doctorDateType}
              onChange={(e) => setDoctorDateType(e.target.value as 'lastVisitDate' | 'createdAt')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            >
              <option value="lastVisitDate">Last Visit Date</option>
              <option value="createdAt">Date of Key In</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Start Date ({doctorDateType === 'lastVisitDate' ? 'Last Visit' : 'Key In'})
            </label>
            <input
              type="date"
              value={doctorStartDate}
              onChange={(e) => setDoctorStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              End Date ({doctorDateType === 'lastVisitDate' ? 'Last Visit' : 'Key In'})
            </label>
            <input
              type="date"
              value={doctorEndDate}
              onChange={(e) => setDoctorEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Disclaimer Alert Box */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5 text-amber-700">
          <Info className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Disclaimer</h4>
          <p className="text-xs text-amber-800 leading-relaxed mt-1">
            This update is from patient only, so the information may be inadequate.
          </p>
        </div>
      </div>

      {/* Compiled Copy-Paste Block */}
      {selectedDoctor && doctorPatients.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                📋 WhatsApp-Ready Compiled Report
              </h4>
            </div>
            <button
              onClick={copyReportToClipboard}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm",
                isCopied 
                  ? "bg-emerald-600 text-white" 
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              )}
            >
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {isCopied ? "COPIED!" : "COPY ENTIRE MESSAGE"}
            </button>
          </div>
          <div className="relative">
            <textarea
              readOnly
              value={generatedReportText}
              className="w-full h-64 p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none leading-relaxed"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-medium bg-slate-800/85 px-2.5 py-1 rounded-md backdrop-blur-sm pointer-events-none border border-slate-700/50">
              Click inside to select all
            </div>
          </div>
        </div>
      )}

      {/* Report Results */}
      {!selectedDoctor ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-700">No Doctor Selected</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Please choose a doctor in charge from the dropdown above to generate patient updates.</p>
        </div>
      ) : doctorPatients.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-700">No Patient Updates Found</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            There are no patients assigned to <strong className="text-slate-700">{selectedDoctor}</strong> who match this date period ({doctorDateType === 'lastVisitDate' ? 'Last Visit Date' : 'Date of Key In'}) with follow-up remarks.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Showing {doctorPatients.length} patient {doctorPatients.length === 1 ? 'update' : 'updates'}
            </span>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
              {selectedDoctor}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {doctorPatients.map((p) => (
              <div 
                key={p.id} 
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                onClick={() => onViewCase(p.id)}
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 group-hover:underline text-sm leading-tight transition-colors">
                        {p.patientName}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5 font-mono">ID: {p.patientId}</p>
                    </div>
                    <TagBadge tag={p.followUpTag} />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] border-b border-slate-100 pb-3 mb-3">
                    <div>
                      <span className="text-slate-400 font-bold uppercase tracking-wider block">Last Visit Date</span>
                      <span className="text-slate-700 font-bold mt-0.5 block">
                        {p.lastVisitDate ? new Date(p.lastVisitDate).toLocaleDateString('en-GB') : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold uppercase tracking-wider block">Follow Up Date</span>
                      <span className="text-slate-700 font-bold mt-0.5 block">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB') : '-'}
                      </span>
                    </div>
                    {p.appointmentDate ? (
                      <div>
                        <span className="text-indigo-400 font-bold uppercase tracking-wider block">Appt Date</span>
                        <span className="text-indigo-700 font-bold mt-0.5 block">
                          {new Date(p.appointmentDate).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Diagnosis</span>
                      <p className="text-xs text-slate-700 font-medium mt-0.5 line-clamp-2">{p.diagnosis || '-'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block">Patient Update / Remarks</span>
                      <div className="mt-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100 relative">
                        <p className="text-xs text-slate-800 font-medium leading-relaxed italic whitespace-pre-wrap text-left">
                          "{p.remarks}"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Branch: <strong className="text-slate-600">{p.branch}</strong></span>
                  <span className="text-indigo-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                    View Details <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )}

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

      {/* Export CSV Modal */}
      {exportModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                Export CSV
              </h3>
              <button 
                onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))} 
                className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors"
                disabled={exportModal.isExporting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm border border-indigo-100 bg-indigo-50 text-indigo-700 p-3 rounded-lg font-medium mb-6">
                Total available pages: <span className="font-bold text-lg">{Math.ceil(filteredCases.length / itemsPerPage) || 1}</span>
              </p>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Start Page</label>
                  <input 
                    type="number"
                    min="1"
                    max={Math.ceil(filteredCases.length / itemsPerPage) || 1}
                    value={exportModal.startPage}
                    onChange={(e) => setExportModal(prev => ({ ...prev, startPage: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">End Page</label>
                  <input 
                    type="number"
                    min={exportModal.startPage}
                    max={Math.ceil(filteredCases.length / itemsPerPage) || 1}
                    value={exportModal.endPage}
                    onChange={(e) => setExportModal(prev => ({ ...prev, endPage: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold"
                  />
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded text-center">
                This will export data including <b>Wellness Updates</b> and <b>Registry Data (NCD/ANC)</b> for the selected pages.
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                disabled={exportModal.isExporting}
              >
                CANCEL
              </button>
              <button 
                onClick={handleProceedExport}
                className="px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
                disabled={exportModal.isExporting || exportModal.startPage > exportModal.endPage}
              >
                {exportModal.isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    EXPORTING...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    DOWNLOAD CSV
                  </>
                )}
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

      {/* WHATSAPP MANAGE TEMPLATES MODAL */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  Manage WhatsApp Templates
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Editing these templates will change the default message prefilled for patients.</p>
              </div>
              <button 
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto min-h-0 flex-1">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Select Branch</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    value={selectedTemplateBranch}
                    onChange={(e) => setSelectedTemplateBranch(e.target.value)}
                  >
                    <option value="All Branches">All Branches (Default)</option>
                    <option value="Kajang">Kajang</option>
                    <option value="Seri Kembangan">Seri Kembangan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Select Tag</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    value={selectedTemplateTag}
                    onChange={(e) => setSelectedTemplateTag(e.target.value)}
                  >
                    <option value="arawellness">ARAWELLNESS</option>
                    <option value="referral">REFERRAL</option>
                    <option value="aramommy">ARAMOMMY</option>
                    <option value="arachronic">ARACHRONIC</option>
                    <option value="arasihat">ARASIHAT</option>
                    <option value="missed_appointment">MISSED APPOINTMENT</option>
                    <option value="others">OTHERS</option>
                  </select>
                </div>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 md:p-4 mb-4">
                <div className="flex gap-2.5">
                  <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Info className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-blue-900 mb-1">Available Variables</h4>
                    <p className="text-[10px] md:text-xs text-blue-800/80 leading-relaxed">
                      You can use <code className="bg-blue-100/50 px-1 py-0.5 rounded font-mono font-bold text-blue-700">{'{{nama}}'}</code> to insert the patient's name, and <code className="bg-blue-100/50 px-1 py-0.5 rounded font-mono font-bold text-blue-700">{'{{url}}'}</code> to insert the wellness form link (only applicable for ARAWELLNESS).
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Message Template</label>
                  <textarea 
                    value={customTemplates[`${selectedTemplateBranch}|${selectedTemplateTag}`] ?? customTemplates[`All Branches|${selectedTemplateTag}`] ?? ''}
                    onChange={(e) => {
                      setCustomTemplates(prev => ({
                        ...prev,
                        [`${selectedTemplateBranch}|${selectedTemplateTag}`]: e.target.value
                      }));
                    }}
                    className="w-full h-32 p-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 max-h-64"
                    placeholder="Type your message template here..."
                  />
                  {selectedTemplateBranch !== 'All Branches' && customTemplates[`${selectedTemplateBranch}|${selectedTemplateTag}`] === undefined && (
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Currently using the "All Branches" default. Editing will overwrite for this branch.
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex gap-3">
              <button 
                onClick={() => setIsTemplateModalOpen(false)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                   saveTemplates(customTemplates);
                   setIsTemplateModalOpen(false);
                }}
                className="flex-[2] px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-indigo-950 transition-colors shadow-lg shadow-slate-200"
              >
                Save Templates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TagBadge({ tag }: { tag: string }) {
  const t = normalizeTag(tag);
  let styleKey = t.toLowerCase();
  let displayTag = t;

  const styles: Record<string, string> = {
    'aramommy': "bg-pink-50 text-pink-700 border-pink-100",
    'arachronic': "bg-blue-50 text-blue-700 border-blue-100",
    'arasihat': "bg-teal-50 text-teal-700 border-teal-100",
    'arawellness': "bg-emerald-50 text-emerald-700 border-emerald-100",
    'referral': "bg-indigo-50 text-indigo-950 border-indigo-100",
    'others': "bg-slate-50 text-slate-700 border-slate-100",
  };

  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-normal break-words text-center",
      styles[styleKey] || styles['others']
    )}>
      {displayTag}
    </span>
  );
}
