import React, { useState, useMemo, useEffect } from 'react';
import { Search, Filter, User, Phone, MapPin, Tag, Calendar, MoreVertical, Trash2, ExternalLink, ClipboardList, MessageCircle, AlertTriangle, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit, setDoc } from 'firebase/firestore';
import { Patient, UserProfile, FollowUpCase } from '../types';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PatientListProps {
  currentUser: UserProfile;
}

export default function PatientList({ currentUser }: PatientListProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [tagFilter, setTagFilter] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Modal states
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'delete' | 'move';
    patient: Patient | null;
    isProcessing: boolean;
  }>({
    isOpen: false,
    type: 'delete',
    patient: null,
    isProcessing: false
  });

  // Fetch patients
  useEffect(() => {
    let q = query(collection(db, 'patients'), orderBy('createdAt', 'desc'), limit(1000));
    
    // If not superadmin, maybe limit by branch if that's the policy?
    // User instruction didn't specify branch filtering for patients yet, but let's assume it should follow access.
    if (currentUser.role !== 'Superadmin' && currentUser.branch) {
      // In a real app we'd add where('branch', '==', currentUser.branch) here
      // But let's see if we can do client-side filtering for now or just show all for Doctors as well.
      // Usually patient directory is shared across branches if staff rotate? 
      // Instructions said: "Redirect CSV Import to 'Patients' Tab"
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const patientData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Patient[];
      setPatients(patientData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching patients:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    patients.forEach(p => {
      if (p.tag) tags.add(p.tag);
    });
    return Array.from(tags).sort();
  }, [patients]);

  const getTagColorHex = (tag: string) => {
    const t = tag.toLowerCase().trim();
    if (t === 'aramommy') return '#ec4899'; // pink-500
    if (t.includes('wellness') || t === 'arawellness') return '#10b981'; // emerald-500
    if (t.includes('referral')) return '#6366f1'; // indigo-500
    return '#94a3b8'; // slate-400 default
  };

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    patients.forEach(p => {
      const t = p.tag || 'Others';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [patients]);

  const filteredPatients = patients.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm);
      
    const matchesBranch = branchFilter === 'All' || p.branch === branchFilter;
    const matchesTag = tagFilter === 'All' || p.tag === tagFilter;

    return matchesSearch && matchesBranch && matchesTag;
  });

  // Reset page and selections when filters change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedPatientIds([]);
  }, [searchTerm, branchFilter, tagFilter]);

  // Reset selections when currentPage changes
  useEffect(() => {
    setSelectedPatientIds([]);
  }, [currentPage]);

  // Pagination logic
  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPatients = filteredPatients.slice(startIndex, startIndex + itemsPerPage);

  const renderPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }

    return pages.map((page, index) => (
      <button
        key={index}
        disabled={page === '...'}
        onClick={() => typeof page === 'number' && setCurrentPage(page)}
        className={cn(
          "w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors border",
          page === currentPage
            ? "bg-indigo-950 text-white border-indigo-950"
            : page === '...'
            ? "text-slate-400 cursor-default border-transparent"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 bg-white border-slate-200"
        )}
      >
        {page}
      </button>
    ));
  };

  const handleDeletePatient = async (id: string, name: string) => {
    if (!['Superadmin', 'Admin'].includes(currentUser.role)) {
      toast.error("You don't have permission to delete patients.");
      return;
    }

    const patient = patients.find(p => p.id === id);
    if (!patient) return;
    
    setConfirmModal({
      isOpen: true,
      type: 'delete',
      patient,
      isProcessing: false
    });
  };

  const executeDelete = async () => {
    if (!confirmModal.patient) return;
    
    setConfirmModal(prev => ({ ...prev, isProcessing: true }));
    try {
      console.log("Executing delete for patient:", confirmModal.patient.id);
      await deleteDoc(doc(db, 'patients', confirmModal.patient.id));
      toast.success("Patient deleted successfully");
      setConfirmModal({ isOpen: false, type: 'delete', patient: null, isProcessing: false });
    } catch (error: any) {
      console.error("Delete error:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `patients/${confirmModal.patient.id}`);
      } catch (uiError: any) {
        toast.error(uiError.message);
      }
      setConfirmModal(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const handleBulkDelete = () => {
    if (!['Superadmin', 'Admin'].includes(currentUser.role)) {
      toast.error("You don't have permission to delete patients.");
      return;
    }
    setBulkDeleteModalOpen(true);
  };

  const executeBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      await Promise.all(
        selectedPatientIds.map(id => deleteDoc(doc(db, 'patients', id)))
      );
      toast.success(`${selectedPatientIds.length} patients deleted successfully`);
      setSelectedPatientIds([]);
      setBulkDeleteModalOpen(false);
    } catch (error: any) {
      console.error("Bulk delete error:", error);
      toast.error("Failed to delete some patients. Please try again.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleMoveToFollowUp = async (patient: Patient) => {
    setConfirmModal({
      isOpen: true,
      type: 'move',
      patient,
      isProcessing: false
    });
  };

  const executeMove = async () => {
    if (!confirmModal.patient) return;
    const patient = confirmModal.patient;
    
    setConfirmModal(prev => ({ ...prev, isProcessing: true }));
    try {
      console.log("Executing move to follow-up for patient:", patient.id);
      const caseRef = doc(collection(db, 'cases'));
      const caseData: FollowUpCase = {
        id: caseRef.id,
        patientId: patient.patientId || `P-${Date.now()}`,
        patientName: patient.name,
        patientPhone: patient.phone,
        branch: patient.branch || 'Kajang',
        followUpTag: patient.tag || 'Follow-up',
        diagnosis: patient.diagnosis || 'New Import (Transferred)', 
        lastVisitDate: patient.lastVisitDate || new Date().toISOString().split('T')[0],
        nextFollowUpDate: '',
        appointmentDate: patient.appointmentDate || '',
        doctorInCharge: patient.doctorInCharge || 'To be assigned',
        remarks: 'Transferred from Patient Directory',
        followUpDoneBy: patient.followUpDoneBy || '',
        createdAt: new Date().toISOString(),
        createdByEmail: currentUser.email || 'system',
        createdByUid: currentUser.uid || 'system',
      };

      // 1. Create the case entry
      await setDoc(caseRef, caseData);

      // 2. Delete from patients collection
      await deleteDoc(doc(db, 'patients', patient.id));

      toast.success(`${patient.name} moved to Follow-up Cases.`);
      setConfirmModal({ isOpen: false, type: 'move', patient: null, isProcessing: false });
    } catch (error: any) {
      console.error("Error moving patient:", error);
      try {
        handleFirestoreError(error, OperationType.WRITE, `cases/patients - moving ${patient.name}`);
      } catch (uiError: any) {
        toast.error(uiError.message);
      }
      setConfirmModal(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const formatWhatsAppLink = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    const formatted = cleaned.startsWith('0') ? '60' + cleaned.substring(1) : cleaned;
    return `https://wa.me/${formatted}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-100 border-t-indigo-950 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
        <div className="shrink-0">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight whitespace-nowrap">Patient Directory</h2>
          <p className="text-slate-500 text-sm mt-1">Manage centralized patient profiles imported from CSV.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search name, ID or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full sm:w-64"
            />
          </div>
          
          <select 
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="All">All Branches</option>
            <option value="Kajang">Kajang</option>
            <option value="Seri Kembangan">Seri Kembangan</option>
          </select>

          <select 
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="All">All Tags</option>
            {availableTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Patient Distribution by Tag</h3>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Total limit: 1000</span>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }} 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getTagColorHex(entry.name)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {['Superadmin', 'Admin'].includes(currentUser.role) && selectedPatientIds.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 px-6 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-wrap items-center gap-2 text-rose-800 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Selected <b>{selectedPatientIds.length}</b> patients.</span>
            {selectedPatientIds.length < filteredPatients.length && (
              <button 
                onClick={() => setSelectedPatientIds(filteredPatients.map(p => p.id))}
                className="text-indigo-600 hover:text-indigo-800 hover:underline font-bold text-xs"
              >
                Select all {filteredPatients.length} patients in list
              </button>
            )}
          </div>
          <button
            onClick={handleBulkDelete}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm uppercase tracking-wider self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            BULK DELETE
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                {['Superadmin', 'Admin'].includes(currentUser.role) && (
                  <th className="w-12 px-6 py-4">
                    <input 
                      type="checkbox"
                      checked={paginatedPatients.length > 0 && paginatedPatients.every(p => selectedPatientIds.includes(p.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const currentPageIds = paginatedPatients.map(p => p.id);
                          setSelectedPatientIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
                        } else {
                          const currentPageIds = paginatedPatients.map(p => p.id);
                          setSelectedPatientIds(prev => prev.filter(id => !currentPageIds.includes(id)));
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Patient Details</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Import Tag</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Added On</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedPatients.map((p) => {
                const isSelected = selectedPatientIds.includes(p.id);
                return (
                  <tr key={p.id} className={cn("hover:bg-slate-50/50 transition-colors", isSelected && "bg-slate-50/80")}>
                    {['Superadmin', 'Admin'].includes(currentUser.role) && (
                      <td className="px-6 py-4 w-12">
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPatientIds(prev => [...prev, p.id]);
                            } else {
                              setSelectedPatientIds(prev => prev.filter(id => id !== p.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-950">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400 font-medium">ID: {p.patientId}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {p.phone}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 uppercase">
                      <MapPin className="w-3 h-3" />
                      {p.branch}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 rounded-lg text-[10px] font-bold text-indigo-950 uppercase border border-indigo-100">
                      <Tag className="w-3 h-3" />
                      {p.tag}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleMoveToFollowUp(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950 text-white rounded-lg text-[10px] font-bold hover:bg-slate-900 transition-all uppercase tracking-wider"
                        title="Move to Follow-up Cases"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        MOVE
                      </button>
                      
                      <a 
                        href={formatWhatsAppLink(p.phone)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-all uppercase tracking-wider shadow-sm shadow-emerald-100/50"
                        title="WhatsApp Patient"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WHATSAPP
                      </a>

                      {['Superadmin', 'Admin'].includes(currentUser.role) && (
                        <button 
                          onClick={() => handleDeletePatient(p.id, p.name)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                          title="Delete Patient"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          
          {filteredPatients.length === 0 && (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 text-slate-400 mb-4">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-slate-900 font-medium font-bold uppercase tracking-tight text-sm">No Patients Found</h3>
              <p className="text-slate-500 text-xs mt-1">Try searching for a different name, ID, or phone number.</p>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {filteredPatients.length > itemsPerPage && (
          <div className="px-6 py-4 flex items-center justify-between border-t border-slate-200 bg-slate-50/50">
            <span className="text-sm text-slate-500 font-medium">
              Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredPatients.length)} of {filteredPatients.length} patients
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-1">
                {renderPageNumbers()}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Next Page"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && confirmModal.patient && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
                confirmModal.type === 'delete' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-950"
              )}>
                {confirmModal.type === 'delete' ? <Trash2 className="w-8 h-8" /> : <ClipboardList className="w-8 h-8" />}
              </div>
              
              <h3 className="text-xl font-bold text-slate-900">
                {confirmModal.type === 'delete' ? 'Delete Patient?' : 'Move to Follow-up?'}
              </h3>
              
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                {confirmModal.type === 'delete' 
                  ? `Are you sure you want to permanently delete ${confirmModal.patient.name}? This action cannot be undone.`
                  : `This will move ${confirmModal.patient.name} into the active Follow-up Cases list and remove them from the directory.`
                }
              </p>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setConfirmModal({ isOpen: false, type: 'delete', patient: null, isProcessing: false })}
                  disabled={confirmModal.isProcessing}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmModal.type === 'delete' ? executeDelete : executeMove}
                  disabled={confirmModal.isProcessing}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50",
                    confirmModal.type === 'delete' 
                      ? "bg-red-600 hover:bg-red-700 shadow-red-100" 
                      : "bg-indigo-950 hover:bg-slate-900 shadow-indigo-100"
                  )}
                >
                  {confirmModal.isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : <Check className="w-4 h-4" />}
                  {confirmModal.type === 'delete' ? 'Yes, Delete' : 'Yes, Move'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-50 text-red-600">
                <Trash2 className="w-8 h-8" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-900">
                Permanently Delete {selectedPatientIds.length} Patients?
              </h3>
              
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                Are you sure you want to permanently delete these {selectedPatientIds.length} patients? All selected directory profiles will be deleted, and this action cannot be undone.
              </p>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setBulkDeleteModalOpen(false)}
                  disabled={isBulkDeleting}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={executeBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 bg-red-600 hover:bg-red-700 shadow-red-100"
                >
                  {isBulkDeleting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : <Check className="w-4 h-4" />}
                  Yes, Delete All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
