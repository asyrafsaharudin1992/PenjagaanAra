import React, { useState, useEffect } from 'react';
import { doc, updateDoc, deleteDoc, setDoc, query, collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, secondaryAuth, auth, createUserWithEmailAndPassword, sendPasswordResetEmail } from '../firebase';
import { UserProfile, UserRole, UserPermission } from '../types';
import { normalizeBranch } from '../lib/utils';
import { 
  User, 
  Mail, 
  Shield, 
  Trash2, 
  Search, 
  Loader2,
  AlertCircle,
  Lock,
  Plus,
  X,
  Check,
  ToggleLeft,
  ToggleRight,
  Key,
  Pencil
} from 'lucide-react';
import { cn } from '../lib/utils';

interface UserManagementProps {
  currentUser: UserProfile;
}

const ALL_PERMISSIONS: { id: UserPermission; label: string; description: string }[] = [
  { id: 'view_dashboard', label: 'View Dashboard', description: 'Access to the clinic overview and stats' },
  { id: 'create_case', label: 'Create Cases', description: 'Ability to add new follow-up records' },
  { id: 'delete_case', label: 'Delete Cases', description: 'Ability to remove follow-up records' },
  { id: 'view_history', label: 'View History', description: 'Access to patient past follow-up notes' },
  { id: 'ai_analysis', label: 'AI Analysis', description: 'Use Gemini AI for case summaries and urgency' },
  { id: 'manage_users', label: 'Manage Users', description: 'Access to this user management section' },
  { id: 'whatsapp_patient', label: 'WhatsApp Patient', description: 'Ability to message patients via WhatsApp' },
  { id: 'export_csv', label: 'Export CSV', description: 'Ability to export patient data to CSV' },
];

export default function UserManagement({ currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<{ id: string; type: 'success' | 'error' | 'loading'; message?: string } | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // New User Form State
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'Doctor' as UserRole,
    branch: 'Kajang' as any
  });

  const isSuperadmin = currentUser.role === 'Superadmin';

  useEffect(() => {
    if (!isSuperadmin && currentUser.role !== 'Admin') return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isSuperadmin, currentUser.role]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!isSuperadmin) return;
    setUpdatingId(userId);
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const togglePermission = async (user: UserProfile, permission: UserPermission) => {
    if (!isSuperadmin) return;
    setUpdatingId(user.uid);
    const currentPermissions = user.permissions || [];
    const newPermissions = currentPermissions.includes(permission)
      ? currentPermissions.filter(p => p !== permission)
      : [...currentPermissions, permission];
    
    try {
      await updateDoc(doc(db, 'users', user.uid), { permissions: newPermissions });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleResetPassword = async (email: string, userId: string) => {
    if (!isSuperadmin) return;
    setResetStatus({ id: userId, type: 'loading' });
    try {
      // Use main auth instance for reset emails
      await sendPasswordResetEmail(auth, email);
      setResetStatus({ id: userId, type: 'success' });
      setTimeout(() => setResetStatus(null), 5000);
    } catch (error: any) {
      console.error("Error sending reset email:", error);
      let message = "Failed to send email.";
      if (error.code === 'auth/user-not-found') message = "User not found in Auth.";
      if (error.code === 'auth/unauthorized-domain') message = "Domain not authorized in Firebase.";
      
      setResetStatus({ id: userId, type: 'error', message });
      setTimeout(() => setResetStatus(null), 5000);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!isSuperadmin) return;
    if (userId === currentUser.uid) return;
    
    setUpdatingId(userId);
    try {
      await deleteDoc(doc(db, 'users', userId));
      setDeleteConfirmId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !isSuperadmin) return;
    
    setIsUpdatingUser(true);
    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        displayName: editingUser.displayName,
        email: editingUser.email,
        role: editingUser.role,
        branch: (normalizeBranch(editingUser.branch) || 'Kajang') as any,
        permissions: editingUser.permissions
      });
      setIsEditModalOpen(false);
      setEditingUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUser.uid}`);
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingUser(true);
    setAddError(null);

    try {
      // 1. Create the Auth account using secondary auth instance
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth, 
        newUser.email, 
        newUser.password
      );
      
      // 2. Create the Firestore profile
      const defaultPermissions: UserPermission[] = newUser.role === 'Superadmin' 
        ? ['create_case', 'delete_case', 'view_history', 'manage_users', 'ai_analysis', 'view_dashboard']
        : newUser.role === 'Admin'
        ? ['create_case', 'delete_case', 'view_history', 'ai_analysis', 'view_dashboard']
        : ['create_case', 'view_history', 'ai_analysis', 'view_dashboard'];

      const profile: UserProfile = {
        uid: userCredential.user.uid,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        branch: (normalizeBranch(newUser.branch) || 'Kajang') as any,
        permissions: defaultPermissions,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), profile);
      
      // 3. Success!
      setIsAddModalOpen(false);
      setNewUser({ email: '', password: '', displayName: '', role: 'Doctor', branch: 'Kajang' });
    } catch (error: any) {
      console.error("Error adding user:", error);
      setAddError(error.message || "Failed to create user account.");
    } finally {
      setIsAddingUser(false);
    }
  };

  if (!isSuperadmin && currentUser.role !== 'Admin') {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2">You're not authorized to open/use this section. Please contact your Superadmin for access.</p>
      </div>
    );
  }

  if (currentUser.role === 'Admin') {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Unauthorized Access</h2>
        <p className="text-slate-500 mt-2">You're not authorized to open/use this user management section. This is restricted to Superadmins only.</p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
          <p className="text-slate-500 text-sm">Manage staff access and roles for the clinic.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full sm:w-64"
            />
          </div>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-950 text-white rounded-lg font-bold text-sm hover:bg-slate-900 transition-all shadow-md shadow-indigo-200"
          >
            <Plus className="w-4 h-4" />
            ADD USER
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff Member ({filteredUsers.length})</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <User className="w-8 h-8 opacity-20" />
                      <p className="text-sm font-medium">No staff members found.</p>
                      <p className="text-xs">New users appear here after their first login or when added via the button above.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm border border-slate-200">
                        {u.displayName.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{u.displayName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-md border uppercase tracking-wider inline-block",
                      u.role === 'Superadmin' ? "bg-purple-50 text-purple-700 border-purple-100" :
                      u.role === 'Admin' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                      "bg-slate-50 text-slate-700 border-slate-200"
                    )}>
                      {u.role}
                    </span>
                    {u.branch && (
                      <span className="ml-2 text-[10px] font-bold px-2.5 py-1 rounded-md border bg-blue-50 text-blue-700 border-blue-100 uppercase tracking-wider inline-block">
                        {u.branch}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingUser({ ...u });
                          setIsEditModalOpen(true);
                        }}
                        disabled={updatingId === u.uid}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all active:scale-90 disabled:opacity-30"
                        title="Edit User"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setResetConfirmId(u.uid)}
                        disabled={updatingId === u.uid || resetStatus?.id === u.uid}
                        className={cn(
                          "p-2 rounded-lg transition-all active:scale-90 disabled:opacity-30",
                          resetStatus?.id === u.uid && resetStatus.type === 'success' ? "text-emerald-600 bg-emerald-50" :
                          resetStatus?.id === u.uid && resetStatus.type === 'error' ? "text-red-600 bg-red-50" :
                          "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                        )}
                        title={resetStatus?.id === u.uid && resetStatus.type === 'error' ? resetStatus.message : "Send Password Reset Email"}
                      >
                        {resetStatus?.id === u.uid && resetStatus.type === 'loading' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : resetStatus?.id === u.uid && resetStatus.type === 'success' ? (
                          <Check className="w-4 h-4" />
                        ) : resetStatus?.id === u.uid && resetStatus.type === 'error' ? (
                          <AlertCircle className="w-4 h-4" />
                        ) : (
                          <Key className="w-4 h-4" />
                        )}
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmId(u.uid)}
                        disabled={updatingId === u.uid || u.uid === currentUser.uid}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-90 disabled:opacity-30"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Modal */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900">Edit Staff Profile</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Name</label>
                  <input 
                    required
                    type="text"
                    value={editingUser.displayName}
                    onChange={e => setEditingUser({...editingUser, displayName: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</label>
                  <input 
                    required
                    type="email"
                    value={editingUser.email}
                    onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</label>
                  <select 
                    value={editingUser.role}
                    onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Doctor">Doctor</option>
                    <option value="Admin">Admin</option>
                    <option value="Superadmin">Superadmin</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Branch</label>
                  <select 
                    value={editingUser.branch || 'Kajang'}
                    onChange={e => setEditingUser({...editingUser, branch: e.target.value as any})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Kajang">Kajang</option>
                    <option value="Seri Kembangan">Seri Kembangan</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Permissions</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map(p => {
                    const hasPermission = editingUser.permissions?.includes(p.id);
                    const isSelf = editingUser.uid === currentUser.uid;
                    const isManageUsers = p.id === 'manage_users';

                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const current = editingUser.permissions || [];
                          const next = current.includes(p.id)
                            ? current.filter(id => id !== p.id)
                            : [...current, p.id];
                          setEditingUser({ ...editingUser, permissions: next });
                        }}
                        disabled={isSelf && isManageUsers}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                          hasPermission 
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700" 
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-md flex items-center justify-center border",
                          hasPermission ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300"
                        )}>
                          {hasPermission && <Check className="w-3 h-3" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold">{p.label}</p>
                          <p className="text-[10px] opacity-70 leading-tight">{p.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isUpdatingUser}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUpdatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  SAVE CHANGES
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900">Add New Staff Member</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Name</label>
                <input 
                  required
                  type="text"
                  value={newUser.displayName}
                  onChange={e => setNewUser({...newUser, displayName: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="e.g. Dr. Sarah Smith"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</label>
                <input 
                  required
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="staff@clinic.com"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Initial Password</label>
                <input 
                  required
                  type="password"
                  minLength={6}
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Min 6 characters"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Initial Role</label>
                  <select 
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Doctor">Doctor</option>
                    <option value="Admin">Admin</option>
                    <option value="Superadmin">Superadmin</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Branch</label>
                  <select 
                    value={newUser.branch}
                    onChange={e => setNewUser({...newUser, branch: e.target.value as any})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Kajang">Kajang</option>
                    <option value="Seri Kembangan">Seri Kembangan</option>
                  </select>
                </div>
              </div>

              {addError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {addError}
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isAddingUser}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAddingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  CREATE ACCOUNT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Reset Password Confirmation Modal */}
      {resetConfirmId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Set Semula Kata Laluan?</h3>
              <p className="text-slate-500 text-sm mt-2">
                Adakah anda pasti? Emel akan dihantar kepada pengguna ini untuk menetapkan semula kata laluan mereka.
              </p>
              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setResetConfirmId(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
                >
                  Batal
                </button>
                <button 
                  onClick={() => {
                    const user = users.find(u => u.uid === resetConfirmId);
                    if (user) handleResetPassword(user.email, user.uid);
                    setResetConfirmId(null);
                  }}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
                >
                  Ya, Hantar Emel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Padam Profil Pengguna?</h3>
              <p className="text-slate-500 text-sm mt-2">
                Pengguna ini tidak lagi boleh mengakses data klinik. 
                <span className="block mt-2 font-semibold text-red-600">
                  Nota: Akaun log masuk mereka mesti dipadam secara manual dari Firebase Console.
                </span>
              </p>
              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
                >
                  Batal
                </button>
                <button 
                  onClick={() => handleDeleteUser(deleteConfirmId)}
                  disabled={updatingId === deleteConfirmId}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {updatingId === deleteConfirmId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Ya, Padam
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
