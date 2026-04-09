/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, onSnapshot, query, doc, getDoc, setDoc, orderBy } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CaseList from './components/CaseList';
import TodoList from './components/TodoList';
import CaseForm from './components/CaseForm';
import CaseDetails from './components/CaseDetails';
import UserManagement from './components/UserManagement';
import PublicFollowUpForm from './components/PublicFollowUpForm';
import PublicRequestsList from './components/PublicRequestsList';
import ErrorBoundary from './components/ErrorBoundary';
import { FollowUpCase, UserProfile, UserRole } from './types';
import { PlusCircle, LogIn, Loader2, ClipboardList, Lock, Mail, AlertCircle } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import WellnessForm from './components/WellnessForm';

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isWellnessForm = searchParams.get('form') === 'wellness';

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<FollowUpCase[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isPublicFormOpen, setIsPublicFormOpen] = useState(false);
  
  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Mobile check
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data() as UserProfile;
            // Force Superadmin role if email matches
            if (firebaseUser.email === 'atikah.abdrahman@gmail.com' || firebaseUser.email === 'operation@hsohealthcare.com') {
              userData.role = 'Superadmin';
              // Ensure Superadmin has all permissions
              userData.permissions = ['create_case', 'delete_case', 'view_history', 'manage_users', 'ai_analysis', 'view_dashboard', 'whatsapp_patient', 'export_csv'];
            } else if (!userData.permissions) {
              // Default permissions for existing users who don't have them yet
              userData.permissions = userData.role === 'Admin'
                ? ['create_case', 'delete_case', 'view_history', 'ai_analysis', 'view_dashboard', 'whatsapp_patient']
                : ['create_case', 'view_history', 'ai_analysis', 'view_dashboard'];
            }
            setUser(userData);
          } else {
            // Check if this is a superadmin email
            const isSuperEmail = firebaseUser.email === 'atikah.abdrahman@gmail.com' || firebaseUser.email === 'operation@hsohealthcare.com';
            
            if (!isSuperEmail) {
              // If not superadmin and no profile exists, they might have been deleted
              // or they are a new user who hasn't been "added" yet.
              // For now, we'll allow them to create a basic profile if they can log in,
              // but you might want to restrict this.
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || 'Staff Member',
                role: 'Doctor',
                permissions: ['create_case', 'view_history', 'ai_analysis', 'view_dashboard'],
                createdAt: new Date().toISOString(),
              };
              await setDoc(userDocRef, newProfile);
              setUser(newProfile);
            } else {
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || 'Staff Member',
                role: 'Superadmin',
                permissions: ['create_case', 'delete_case', 'view_history', 'manage_users', 'ai_analysis', 'view_dashboard', 'whatsapp_patient', 'export_csv'],
                createdAt: new Date().toISOString(),
              };
              await setDoc(userDocRef, newProfile);
              setUser(newProfile);
            }
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Firestore Cases Listener
  useEffect(() => {
    if (!user) {
      setCases([]);
      return;
    }

    const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as FollowUpCase[];
      setCases(casesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });

    return () => unsubscribe();
  }, [user]);

  if (isWellnessForm) {
    return <WellnessForm />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobile) {
      setLoginError("Please sign in using desktop.");
      return;
    }
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setLoginError("Invalid email or password. Please check your credentials.");
      } else if (error.code === 'auth/too-many-requests') {
        setLoginError("Too many failed attempts. Account temporarily disabled. Please try again later or reset your password.");
      } else {
        setLoginError("A system error occurred. Please try again later.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleAddCase = async (newCase: Partial<FollowUpCase>) => {
    try {
      const caseRef = doc(collection(db, 'cases'));
      await setDoc(caseRef, { ...newCase, id: caseRef.id });
      setIsFormOpen(false);
      toast.success("Case successfully saved!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'cases');
    }
  };

  const handleUpdateCase = async (caseId: string, updates: Partial<FollowUpCase>) => {
    try {
      const caseRef = doc(db, 'cases', caseId);
      await setDoc(caseRef, updates, { merge: true });
      toast.success("Case updated successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseId}`);
    }
  };

  const selectedCase = cases.find(c => c.id === selectedCaseId);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md w-full space-y-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
              <ClipboardList className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">AraCare Staff Login</h1>
              <p className="text-slate-500 mt-2">Enter your clinic credentials to continue.</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@clinic.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
                <button 
                  type="button"
                  onClick={async () => {
                    if (!email) {
                      setLoginError("Please enter your email address first.");
                      return;
                    }
                    try {
                      await sendPasswordResetEmail(auth, email);
                      setLoginError("Password reset email sent! Please check your inbox.");
                    } catch (error: any) {
                      setLoginError("Failed to send reset email. Check if the email is correct.");
                    }
                  }}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  FORGOT PASSWORD?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {loginError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold uppercase tracking-tight">Login Restricted</p>
                  <p className="opacity-90 leading-relaxed">{loginError}</p>
                </div>
              </div>
            )}

            <button
              disabled={isLoggingIn}
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 disabled:opacity-50"
            >
              {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              Sign In
            </button>
          </form>
          
          <div className="pt-6 border-t border-slate-100 text-center">
            <button 
              onClick={() => setIsPublicFormOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              I'm a doctor and I want to submit names for follow-up
            </button>
          </div>
          
          <p className="text-center text-[10px] text-slate-400">
            Forgot your password? Please contact your Superadmin.
          </p>
        </div>

        {isPublicFormOpen && (
          <PublicFollowUpForm onClose={() => setIsPublicFormOpen(false)} />
        )}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-sm">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Desktop Only</h1>
          <p className="text-slate-500 mt-2 text-sm leading-relaxed">
            Sila log masuk menggunakan komputer (Desktop) untuk mengakses sistem pengurusan klinik ini.
          </p>
          <button 
            onClick={handleLogout}
            className="mt-6 w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors"
          >
            LOG KELUAR
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} user={user} onLogout={handleLogout} />
        
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-end mb-6">
              {activeTab === 'cases' && user.permissions?.includes('create_case') && (
                <button 
                  onClick={() => setIsFormOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                >
                  <PlusCircle className="w-4 h-4" />
                  NEW FOLLOW-UP
                </button>
              )}
            </div>

            {activeTab === 'dashboard' && <Dashboard cases={cases} userName={user.displayName} onFilterByTag={(tag) => { setTagFilter(tag); setActiveTab('cases'); }} />}
            {activeTab === 'cases' && <CaseList cases={cases} onViewCase={setSelectedCaseId} userPermissions={user.permissions || []} tagFilter={tagFilter} setTagFilter={setTagFilter} />}
            {activeTab === 'todo' && <TodoList />}
            {activeTab === 'patients' && (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <h2 className="text-xl font-bold text-slate-900">Patient Directory</h2>
                <p className="text-slate-500 mt-2">This feature is coming soon. You can currently manage patients through individual cases.</p>
              </div>
            )}
            {activeTab === 'public_requests' && <PublicRequestsList />}
            {activeTab === 'users' && <UserManagement currentUser={user} />}
          </div>
        </main>

        {isFormOpen && (
          <CaseForm 
            onClose={() => setIsFormOpen(false)} 
            onSubmit={handleAddCase} 
            existingCases={cases}
          />
        )}

        {selectedCase && (
          <CaseDetails 
            caseData={selectedCase} 
            onClose={() => setSelectedCaseId(null)} 
            onUpdate={handleUpdateCase}
            userRole={user.role}
            userPermissions={user.permissions || []}
            allCases={cases}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}


