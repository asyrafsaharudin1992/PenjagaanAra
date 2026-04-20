import React, { useState, useMemo } from 'react';
import { Search, Filter, User, Phone, MapPin, Tag, Calendar, MoreVertical, Trash2, ExternalLink, ClipboardList, MessageCircle, AlertTriangle, X, Check } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit, setDoc } from 'firebase/firestore';
import { Patient, UserProfile, FollowUpCase } from '../types';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface PatientListProps {
  currentUser: UserProfile;
}

export default function PatientList({ currentUser }: PatientListProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [tagFilter, setTagFilter] = useState<string>('All');
  
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
  React.useEffect(() => {
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

  const filteredPatients = patients.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm);
      
    const matchesBranch = branchFilter === 'All' || p.branch === branchFilter;
    const matchesTag = tagFilter === 'All' || p.tag === tagFilter;

    return matchesSearch && matchesBranch && matchesTag;
  });

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
        diagnosis: 'New Import (Transferred)', 
        lastVisitDate: new Date().toISOString().split('T')[0],
        nextFollowUpDate: '',
        doctorInCharge: 'To be assigned',
        remarks: 'Transferred from Patient Directory',
        followUpDoneBy: '',
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
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Patient Directory</h2>
          <p className="text-slate-500 text-sm">Manage centralized patient profiles imported from CSV.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Patient Details</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Import Tag</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Added On</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPatients.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{p.name}</p>
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
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 rounded-lg text-[10px] font-bold text-indigo-600 uppercase border border-indigo-100">
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-all uppercase tracking-wider"
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
              ))}
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
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && confirmModal.patient && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
                confirmModal.type === 'delete' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"
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
                      : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100"
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
    </div>
  );
}
