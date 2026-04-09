import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { User, Calendar, Stethoscope, MessageSquare, Trash2, CheckCircle, Clock, Loader2, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface PublicRequest {
  id: string;
  patientName: string;
  date: string;
  doctorName: string;
  reason: string;
  status: 'pending' | 'completed';
  createdAt: string;
}

export default function PublicRequestsList() {
  const [requests, setRequests] = useState<PublicRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'public_followups'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as PublicRequest[];
      setRequests(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'public_followups');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Padam permohonan ini?")) return;
    try {
      await deleteDoc(doc(db, 'public_followups', id));
      toast.success("Permohonan dipadam.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `public_followups/${id}`);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'public_followups', id), {
        status: currentStatus === 'pending' ? 'completed' : 'pending'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `public_followups/${id}`);
    }
  };

  const filteredRequests = requests.filter(r => 
    r.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.doctorName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Public Follow-up Requests</h2>
          <p className="text-slate-500 text-sm">Senarai permohonan follow-up yang dihantar dari luar sistem.</p>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Cari pesakit/doktor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRequests.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <p className="text-slate-400">Tiada permohonan ditemui.</p>
          </div>
        ) : (
          filteredRequests.map((request) => (
            <div 
              key={request.id}
              className={cn(
                "bg-white p-5 rounded-2xl border transition-all shadow-sm hover:shadow-md",
                request.status === 'completed' ? "border-green-100 bg-green-50/10" : "border-slate-200"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
                  request.status === 'completed' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                )}>
                  {request.status === 'completed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {request.status}
                </div>
                <button 
                  onClick={() => handleDelete(request.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Patient Name</p>
                    <p className="text-sm font-bold text-slate-900">{request.patientName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Follow-up Date</p>
                    <p className="text-sm font-medium text-slate-700">{request.date}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Stethoscope className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Doctor</p>
                    <p className="text-sm font-medium text-slate-700">{request.doctorName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Reason</p>
                    <p className="text-sm text-slate-600 leading-relaxed italic">"{request.reason}"</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => toggleStatus(request.id, request.status)}
                  className={cn(
                    "w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                    request.status === 'completed' 
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200" 
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  )}
                >
                  {request.status === 'completed' ? "MARK AS PENDING" : "MARK AS COMPLETED"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
