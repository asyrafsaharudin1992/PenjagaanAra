import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { User, Calendar, Stethoscope, MessageSquare, Trash2, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface TodoItem {
  id: string;
  patientName: string;
  visitDate?: string;
  date: string;
  doctorName: string;
  branch: string;
  reason: string;
  status: 'pending' | 'completed';
  createdAt: string;
}

export default function TodoList() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'todo'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as TodoItem[];
      setTodos(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'todo');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      await deleteDoc(doc(db, 'todo', id));
      toast.success("Item deleted.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `todo/${id}`);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'todo', id), {
        status: currentStatus === 'pending' ? 'completed' : 'pending'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `todo/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">To Do List</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {todos.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <p className="text-slate-400">No items in To Do list.</p>
          </div>
        ) : (
          todos.map((todo) => (
            <div 
              key={todo.id}
              className={cn(
                "bg-white p-5 rounded-2xl border transition-all shadow-sm hover:shadow-md",
                todo.status === 'completed' ? "border-green-100 bg-green-50/10" : "border-slate-200"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
                  todo.status === 'completed' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                )}>
                  {todo.status === 'completed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {todo.status}
                </div>
                <button 
                  onClick={() => handleDelete(todo.id)}
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
                    <p className="text-sm font-bold text-slate-900">{todo.patientName}</p>
                  </div>
                </div>

                {todo.visitDate && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-slate-400 mt-1" />
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Visit Date</p>
                      <p className="text-sm font-medium text-slate-700">{todo.visitDate}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Suggested Follow-up</p>
                    <p className="text-sm font-medium text-slate-700">{todo.date}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Stethoscope className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Doctor</p>
                    <p className="text-sm font-medium text-slate-700">{todo.doctorName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Branch</p>
                    <p className="text-sm font-medium text-slate-700">{todo.branch}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Reason</p>
                    <p className="text-sm text-slate-600 leading-relaxed italic">"{todo.reason}"</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => toggleStatus(todo.id, todo.status)}
                  className={cn(
                    "w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                    todo.status === 'completed' 
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200" 
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  )}
                >
                  {todo.status === 'completed' ? "MARK AS PENDING" : "MARK AS COMPLETED"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
