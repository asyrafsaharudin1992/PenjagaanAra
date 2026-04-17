import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, where, setDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { User, Calendar, Stethoscope, MessageSquare, Trash2, CheckCircle, Clock, Loader2, Edit2, X, Save, Building2, Bell, PlusCircle, ClipboardList, StickyNote, RefreshCw, Plus } from 'lucide-react';
import { cn, normalizeBranch } from '../lib/utils';
import { toast } from 'sonner';
import { UserProfile } from '../types';

interface BranchNote {
  id: string;
  patientNames: string;
  remarks: string;
  reminderDate?: string;
  branch: string;
  createdByEmail: string;
  createdAt: string;
}

interface TodoReminder {
  id: string;
  text: string;
  date: string;
  createdByEmail: string;
  branch: string;
  createdAt: string;
}

interface TodoItem {
  id: string;
  patientName: string;
  visitDate?: string;
  date: string;
  doctorName: string;
  branch: string;
  status: 'pending' | 'completed';
  reason: string;
  createdAt: string;
  reminders?: TodoReminder[];
}

interface TodoListProps {
  user: UserProfile;
}

export default function TodoList({ user }: TodoListProps) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [editForm, setEditForm] = useState<Partial<TodoItem>>({});
  
  // Reminder States
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTodoId, setReminderTodoId] = useState<string | null>(null);
  const [reminderText, setReminderText] = useState('');
  const [reminderDate, setReminderDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmittingReminder, setIsSubmittingReminder] = useState(false);

  // Branch Notes States
  const [branchNotes, setBranchNotes] = useState<BranchNote[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [isDataLazyLoading, setIsDataLazyLoading] = useState(true);

  // Lazy load effect for component mounting
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDataLazyLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const [noteForm, setNoteForm] = useState({
    patientNames: '',
    remarks: '',
    reminderDate: '',
    branch: user.branch || 'Kajang'
  });
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  useEffect(() => {
    // Sync branch with user if it changes
    setNoteForm(prev => ({ ...prev, branch: normalizeBranch(user.branch) as any }));
  }, [user.branch]);

  useEffect(() => {
    if (!user.email || isDataLazyLoading) return;

    let q;
    if (user.role === 'Superadmin') {
      q = query(
        collection(db, 'branch_notes'), 
        orderBy('createdAt', 'desc'),
        limit(20)
      );
    } else {
      if (!user.branch) {
        setBranchNotes([]);
        return;
      }
      q = query(
        collection(db, 'branch_notes'), 
        where('branch', '==', user.branch),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as BranchNote[];
      setBranchNotes(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'branch_notes');
    });

    return () => unsubscribe();
  // FIX 2: isDataLazyLoading was missing from the dependency array.
  // When it flipped false after 300ms the effect never re-ran, so the
  // branch_notes query never started and the panel stayed empty.
  }, [user.email, user.branch, user.role, isDataLazyLoading]);

  useEffect(() => {
    if (isDataLazyLoading) return;

    let q;
    if (user.role === 'Superadmin') {
      q = query(collection(db, 'todo'), orderBy('createdAt', 'desc'), limit(25));
    } else {
      if (!user.branch) {
        setTodos([]);
        setLoading(false);
        return;
      }
      q = query(
        collection(db, 'todo'), 
        where('branch', '==', user.branch),
        orderBy('createdAt', 'desc'),
        limit(25)
      );
    }

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
  // FIX 2: isDataLazyLoading was missing from the dependency array.
  // Without it, the todo query never fired after the 300ms guard lifted,
  // leaving `loading` permanently true — the white/blank screen.
  }, [user.branch, user.role, isDataLazyLoading]);

  const handleDelete = async (id: string) => {
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

  const startEdit = (todo: TodoItem) => {
    setEditingTodo(todo);
    setEditForm(todo);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTodo) return;
    try {
      await updateDoc(doc(db, 'todo', editingTodo.id), {
        patientName: editForm.patientName,
        visitDate: editForm.visitDate,
        date: editForm.date,
        doctorName: editForm.doctorName,
        branch: editForm.branch,
        reason: editForm.reason,
      });
      toast.success("Item updated successfully.");
      setEditingTodo(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `todo/${editingTodo.id}`);
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTodoId || !reminderText || !reminderDate) return;
    
    setIsSubmittingReminder(true);
    try {
      const todo = todos.find(t => t.id === reminderTodoId);
      if (!todo) return;

      const newReminder: TodoReminder = {
        id: crypto.randomUUID(),
        text: reminderText,
        date: reminderDate,
        createdByEmail: user.email,
        branch: normalizeBranch(user.branch) as any,
        createdAt: new Date().toISOString()
      };

      const updatedReminders = [...(todo.reminders || []), newReminder];
      await updateDoc(doc(db, 'todo', reminderTodoId), {
        reminders: updatedReminders
      });

      toast.success("Reminder added successfully.");
      setShowReminderModal(false);
      setReminderText('');
      setReminderDate(new Date().toISOString().split('T')[0]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `todo/${reminderTodoId}`);
    } finally {
      setIsSubmittingReminder(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.patientNames.trim() || !noteForm.remarks.trim()) {
      toast.error("Please fill in Patient Names and Remarks.");
      return;
    }

    setIsSubmittingNote(true);
    try {
      await setDoc(doc(collection(db, 'branch_notes')), {
        patientNames: noteForm.patientNames,
        remarks: noteForm.remarks,
        reminderDate: noteForm.reminderDate || null,
        branch: normalizeBranch(noteForm.branch),
        createdByEmail: user.email,
        createdAt: new Date().toISOString()
      });
      toast.success("Note added successfully.");
      setNoteForm({ 
        patientNames: '', 
        remarks: '', 
        reminderDate: '',
        branch: normalizeBranch(user.branch) as any
      });
      setShowNoteModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'branch_notes');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'branch_notes', id));
      toast.success("Note deleted.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `branch_notes/${id}`);
    }
  };

  const checkReminderStatus = (reminders?: TodoReminder[]) => {
    if (!reminders || reminders.length === 0) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let hasOverdue = false;
    let hasToday = false;

    reminders.forEach(r => {
      const rDate = new Date(r.date);
      rDate.setHours(0, 0, 0, 0);
      
      if (rDate < today) hasOverdue = true;
      if (rDate.getTime() === today.getTime()) hasToday = true;
    });

    if (hasOverdue) return 'overdue';
    if (hasToday) return 'today';
    return 'upcoming';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">To Do List</h2>
              <p className="text-slate-500 font-medium">Track patient follow-ups and reminders.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex px-4 py-2 bg-white border border-slate-200 rounded-2xl shadow-sm text-xs font-bold text-slate-600 items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                {user.branch || 'All Branches'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {todos.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white rounded-[32px] border-2 border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <ClipboardList className="w-8 h-8" />
                </div>
                <h3 className="text-slate-900 font-bold text-lg">Empty Queue</h3>
                <p className="text-slate-500 mt-1 max-w-xs mx-auto">No follow-up items found for your current branch or role.</p>
              </div>
            ) : (
              todos.map((todo) => {
                const status = checkReminderStatus(todo.reminders);
                const isAlert = status === 'overdue' || status === 'today';

                return (
                  <div 
                    key={todo.id}
                    className={cn(
                      "bg-white p-5 rounded-3xl border transition-all shadow-sm hover:shadow-lg relative overflow-hidden group",
                      todo.status === 'completed' ? "border-slate-100 opacity-75" : "border-slate-200",
                      isAlert && todo.status !== 'completed' && "border-red-200 ring-2 ring-red-50"
                    )}
                  >
                    {/* Reminder Alert Badge */}
                    {isAlert && todo.status !== 'completed' && (
                      <div className="absolute top-0 right-0 px-3 py-1 bg-red-500 text-white text-[10px] font-bold rounded-bl-xl flex items-center gap-1 shadow-sm">
                        <Bell className="w-3 h-3 animate-bounce" />
                        {status?.toUpperCase()} REMINDER
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-4">
                      <div className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                        todo.status === 'completed' ? "bg-slate-100 text-slate-500" : "bg-indigo-50 text-indigo-700"
                      )}>
                        {todo.status === 'completed' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        {todo.status}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setReminderTodoId(todo.id);
                            setShowReminderModal(true);
                          }}
                          title="Add Reminder"
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                        >
                          <Bell className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => startEdit(todo)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(todo.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Patient Name</p>
                        <p className="text-base font-bold text-slate-900 leading-tight">{todo.patientName}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Visit Date</p>
                          <p className="text-sm font-semibold text-slate-700">{todo.visitDate || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Suggested Date</p>
                          <p className="text-sm font-semibold text-slate-700">{todo.date}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Branch & Doctor</p>
                        <div className="flex items-center gap-2 group/info">
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{todo.branch}</span>
                          <span className="text-xs font-medium text-slate-500">Dr. {todo.doctorName}</span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                          <p className="text-sm text-slate-600 leading-relaxed italic line-clamp-2">"{todo.reason}"</p>
                        </div>
                      </div>

                      {/* Reminders List */}
                      {todo.reminders && todo.reminders.length > 0 && (
                        <div className="space-y-2 mt-4">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Reminders</p>
                          {todo.reminders.map((r) => (
                            <div key={r.id} className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-start gap-3">
                              <Bell className="w-3.5 h-3.5 text-indigo-500 mt-0.5" />
                              <div>
                                <p className="text-xs font-bold text-indigo-900">{r.text}</p>
                                <p className="text-[10px] text-indigo-600 font-medium">Due: {new Date(r.date).toLocaleDateString()}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-6">
                      <button 
                        onClick={() => toggleStatus(todo.id, todo.status)}
                        className={cn(
                          "w-full py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 tracking-widest uppercase",
                          todo.status === 'completed' 
                            ? "bg-slate-100 text-slate-400 hover:bg-slate-200" 
                            : "bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-200 active:scale-95"
                        )}
                      >
                        {todo.status === 'completed' ? "REOPEN TASK" : "MARK DONE"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Add Notes Section */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm sticky top-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-slate-900">
                <StickyNote className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-sm uppercase tracking-widest">Add Notes</h3>
              </div>
              <button 
                onClick={() => setShowNoteModal(true)}
                className="p-2 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-100 transition-all active:scale-95 flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-6 max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar pr-1">
              {branchNotes.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Notes Yet</p>
                </div>
              ) : (
                branchNotes.map((note) => (
                  <div 
                    key={note.id} 
                    className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg relative overflow-hidden group transition-all"
                  >
                    {/* Note Badge */}
                    <div className="absolute top-0 right-0 px-3 py-1 bg-teal-500 text-white text-[10px] font-bold rounded-bl-xl shadow-sm z-10">
                      NOTE
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Patient Name</p>
                        <p className="text-base font-bold text-slate-900 leading-tight">{note.patientNames}</p>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Branch & Staff</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg">
                            {note.branch}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            {note.createdByEmail.split('@')[0]}
                          </span>
                        </div>
                      </div>

                      {note.reminderDate && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Follow-up Date</p>
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <p className="text-xs font-semibold">{new Date(note.reminderDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>
                      )}

                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                          <p className="text-sm text-slate-600 leading-relaxed italic line-clamp-3">"{note.remarks}"</p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <button 
                          onClick={() => handleDeleteNote(note.id)}
                          className="w-full py-3 bg-rose-50 text-rose-600 rounded-2xl text-[10px] font-bold hover:bg-rose-100 transition-all active:scale-95 uppercase tracking-[0.1em] shadow-sm flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          DELETE NOTE
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {editingTodo && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center text-slate-900">
              <div>
                <h2 className="text-2xl font-bold">Edit Task</h2>
                <p className="text-slate-500 text-sm font-medium">Update patient follow-up details</p>
              </div>
              <button onClick={() => setEditingTodo(null)} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all">
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Patient Name</label>
                <input 
                  required
                  type="text"
                  value={editForm.patientName || ''}
                  onChange={(e) => setEditForm({...editForm, patientName: e.target.value})}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Visit Date</label>
                  <input 
                    type="date"
                    value={editForm.visitDate || ''}
                    onChange={(e) => setEditForm({...editForm, visitDate: e.target.value})}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Follow-up Date</label>
                  <input 
                    required
                    type="date"
                    value={editForm.date || ''}
                    onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Doctor Name</label>
                  <input 
                    required
                    type="text"
                    value={editForm.doctorName || ''}
                    onChange={(e) => setEditForm({...editForm, doctorName: e.target.value})}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Branch</label>
                  <select 
                    required
                    value={editForm.branch || ''}
                    onChange={(e) => setEditForm({...editForm, branch: e.target.value})}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="Kajang">Kajang</option>
                    <option value="Seri Kembangan">Seri Kembangan</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Reason</label>
                <textarea 
                  required
                  rows={4}
                  value={editForm.reason || ''}
                  onChange={(e) => setEditForm({...editForm, reason: e.target.value})}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-5 bg-slate-900 text-white rounded-[32px] font-bold text-base hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95 flex items-center justify-center gap-3"
              >
                <Save className="w-5 h-5" />
                UPDATE TASK
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center text-slate-900">
              <div>
                <h2 className="text-2xl font-bold">New Note</h2>
                <p className="text-slate-500 text-sm font-medium">Create a branch reminder for follow-ups</p>
              </div>
              <button 
                onClick={() => {
                  setShowNoteModal(false);
                  setNoteForm({ 
                    patientNames: '', 
                    remarks: '', 
                    reminderDate: '',
                    branch: user.branch || 'Kajang'
                  });
                }} 
                className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all"
              >
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleAddNote} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Patients Names</label>
                <textarea 
                  required
                  rows={2}
                  value={noteForm.patientNames}
                  onChange={(e) => setNoteForm({...noteForm, patientNames: e.target.value})}
                  placeholder="e.g., Sarah & John Smith"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none font-sans"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Remarks</label>
                <textarea 
                  required
                  rows={3}
                  value={noteForm.remarks}
                  onChange={(e) => setNoteForm({...noteForm, remarks: e.target.value})}
                  placeholder="Action items or specific patient notes..."
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Branch</label>
                  <select 
                    required
                    value={noteForm.branch}
                    onChange={(e) => setNoteForm({...noteForm, branch: e.target.value as any})}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="Kajang">Kajang</option>
                    <option value="Seri Kembangan">Seri Kembangan</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Reminder Date (Optional)</label>
                  <div className="relative">
                    <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="date"
                      value={noteForm.reminderDate}
                      onChange={(e) => setNoteForm({...noteForm, reminderDate: e.target.value})}
                      className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <button
                disabled={isSubmittingNote}
                type="submit"
                className="w-full py-5 bg-teal-600 text-white rounded-[32px] font-bold text-base hover:bg-teal-700 transition-all shadow-xl shadow-teal-100 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSubmittingNote ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    <PlusCircle className="w-5 h-5" />
                    SAVE NOTE
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center text-slate-900">
              <div>
                <h2 className="text-2xl font-bold">Add Reminder</h2>
                <p className="text-slate-500 text-sm font-medium">Set a follow-up alert for this task</p>
              </div>
              <button 
                onClick={() => {
                  setShowReminderModal(false);
                  setReminderText('');
                }} 
                className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all"
              >
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleAddReminder} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Reminder Message</label>
                <textarea 
                  required
                  rows={3}
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                  placeholder="e.g., Follow up 3 days later regarding referral status"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Alert Date</label>
                <div className="relative">
                  <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    required
                    type="date"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <button
                disabled={isSubmittingReminder}
                type="submit"
                className="w-full py-5 bg-emerald-600 text-white rounded-[32px] font-bold text-base hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSubmittingReminder ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    <PlusCircle className="w-5 h-5" />
                    ADD REMINDER
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
