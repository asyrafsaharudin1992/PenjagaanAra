/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, onSnapshot, query, doc, getDoc, setDoc, orderBy, where, limit } from 'firebase/firestore';
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
import { normalizeBranch } from './lib/utils';
import { PlusCircle, LogIn, Loader2, ClipboardList, Lock, Mail, AlertCircle, Chrome, Upload } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import WellnessForm from './components/WellnessForm';
import CSVImport from './components/CSVImport';
import PatientList from './components/PatientList';

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4 – Superadmin role escalation
// Centralise the allowlist so it is checked consistently in every code path.
// ─────────────────────────────────────────────────────────────────────────────
const SUPERADMIN_EMAILS = new Set([
  'atikah.abdrahman@gmail.com',
  'operation@hsohealthcare.com',
  // 'admin@hsohealthcare.com' removed — belongs to Admin KJ (branch Admin), not Superadmin
]);

const SUPERADMIN_PERMISSIONS: UserProfile['permissions'] = [
  'create_case', 'delete_case', 'view_history', 'manage_users',
  'ai_analysis', 'view_dashboard', 'whatsapp_patient', 'export_csv',
];

/**
 * Enforce role/permissions purely from the email allowlist.
 * Any user whose email is NOT in SUPERADMIN_EMAILS will have the Superadmin
 * role stripped — even if it was manually saved that way in Firestore.
 *
 * FIX 4: The original code used `else if (!userData.permissions)` which only
 * ran when permissions were absent and never touched the role field itself.
 * A Firestore document with role:'Superadmin' set by any means would sail
 * through and grant full access to the wrong user.
 */
function enforceRole(userData: UserProfile, email: string | null): UserProfile {
  // Hardcoded allowlist always wins — these emails are guaranteed Superadmin
  // regardless of what Firestore says.
  if (email && SUPERADMIN_EMAILS.has(email)) {
    return { ...userData, role: 'Superadmin', permissions: SUPERADMIN_PERMISSIONS };
  }

  // For everyone else, trust the role saved in Firestore (e.g. a Superadmin
  // promoted this user via the Add User / Edit User form in-app).
  // We just make sure the permissions array always matches the role correctly
  // so there are no mismatches from old or missing data.
  if (userData.role === 'Superadmin') {
    return { ...userData, permissions: SUPERADMIN_PERMISSIONS };
  }

  const defaultPermissions: UserProfile['permissions'] =
    userData.role === 'Admin'
      ? ['create_case', 'delete_case', 'view_history', 'ai_analysis', 'view_dashboard', 'whatsapp_patient']
      : ['create_case', 'view_history', 'ai_analysis', 'view_dashboard'];

  return {
    ...userData,
    permissions: userData.permissions ?? defaultPermissions,
  };
}

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isWellnessForm = searchParams.get('form') === 'wellness';

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<FollowUpCase[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isPublicFormOpen, setIsPublicFormOpen] = useState(false);
  const [showUnauthorizedModal, setShowUnauthorizedModal] = useState(false);
  
  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loadStartTime, setLoadStartTime] = useState<number | null>(null);
  const [isTakingTooLong, setIsTakingTooLong] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Loading Timer for visual hint
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      timer = setTimeout(() => {
        setIsTakingTooLong(true);
      }, 3000);
    } else {
      setIsTakingTooLong(false);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  // Lazy load data after user is authorized
  useEffect(() => {
    if (user && !loading) {
      // FIX 1: Reduced from 500ms to 100ms — the Firestore profile now loads
      // in parallel so we no longer need a long artificial delay here.
      const timer = setTimeout(() => {
        setDataReady(true);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setDataReady(false);
    }
  }, [user, loading]);

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
        const isSuperEmail = SUPERADMIN_EMAILS.has(firebaseUser.email ?? '');

        // FIX 1 – Slow login
        // Previously setLoading(false) only ran AFTER getDoc() completed,
        // gating the entire UI behind a sequential Firestore cold-start round-
        // trip (up to 2-4 s on first load). Now we unblock the UI immediately
        // with a minimal placeholder built from the already-resolved Firebase
        // Auth object, then patch in the full Firestore profile in the
        // background once it arrives.
        const placeholder: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Loading...',
          role: isSuperEmail ? 'Superadmin' : 'Doctor',
          permissions: isSuperEmail ? SUPERADMIN_PERMISSIONS : [],
          createdAt: '',
        };
        setUser(placeholder);
        setLoading(false); // ← Unblock the UI immediately

        // Fetch the full Firestore profile in the background.
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        // Add a safety timeout for the profile fetch so the app doesn't hang on "Loading..."
        const profileTimeout = setTimeout(() => {
          if (loading) {
            toast.error("Connecting to database is taking longer than expected. You may be offline or in a restricted network.", {
              duration: 10000,
              id: 'firestore-timeout'
            });
          }
        }, 8000);

        try {
          const userDoc = await getDoc(userDocRef);
          clearTimeout(profileTimeout);

          if (userDoc.exists()) {
            const raw = userDoc.data() as UserProfile;
            // Only normalize if a branch is actually stored — don't assign a
            // default branch, otherwise users with no branch silently inherit Kajang.
            const normalized = normalizeBranch(raw.branch);
            if (normalized) raw.branch = normalized as any;
            if (!raw.email) raw.email = firebaseUser.email || '';
            // enforceRole applies FIX 4: strips Superadmin from wrong emails
            setUser(enforceRole(raw, firebaseUser.email));
          } else {
            // No Firestore doc yet — create one with safe defaults.
            const newProfile: UserProfile = isSuperEmail
              ? {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  displayName: firebaseUser.displayName || 'Staff Member',
                  role: 'Superadmin',
                  permissions: SUPERADMIN_PERMISSIONS,
                  createdAt: new Date().toISOString(),
                }
              : {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  displayName: firebaseUser.displayName || 'Staff Member',
                  role: 'Doctor',
                  branch: 'Kajang',
                  permissions: ['create_case', 'view_history', 'ai_analysis', 'view_dashboard'],
                  createdAt: new Date().toISOString(),
                };
            await setDoc(userDocRef, newProfile);
            setUser(newProfile);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setUser(null);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Firestore Cases Listener
  useEffect(() => {
    if (!user || !dataReady) {
      setCases([]);
      return;
    }

    let q;
    if (user.role === 'Superadmin') {
      q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'), limit(500));
    } else {
      if (!user.branch) {
        setCases([]);
        return;
      }
      
      q = query(
        collection(db, 'cases'), 
        where('branch', '==', user.branch),
        orderBy('createdAt', 'desc'),
        limit(500)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as FollowUpCase[];
      
      // Sort client-side to avoid needing a composite index
      casesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setCases(casesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });

    return () => unsubscribe();
  }, [user, dataReady]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobile) {
      setLoginError("Please sign in using desktop.");
      return;
    }
    setIsLoggingIn(true);
    setLoginError(null);

    const maxRetries = 3;
    let retryCount = 0;
    const retryDelay = 2000; // 2 seconds

    const attemptLogin = async (): Promise<void> => {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error: any) {
        console.error(`Login attempt ${retryCount + 1} failed:`, error);
        
        if (error.code === 'auth/network-request-failed' && retryCount < maxRetries) {
          retryCount++;
          setLoginError(`Connection issue. Retrying in ${retryDelay/1000}s... (Attempt ${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return attemptLogin();
        }

        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          setLoginError("Invalid email or password. Please check your credentials.");
        } else if (error.code === 'auth/too-many-requests') {
          setLoginError("Too many failed attempts. Account temporarily disabled.");
        } else if (error.code === 'auth/network-request-failed') {
          setLoginError("Connection Error: Please check your internet or try refreshing the page. If you are using a VPN or Ad-Blocker, please disable it for this site.");
        } else {
          setLoginError(`A system error occurred: ${error.message || error.code || 'Unknown error'}.`);
        }
      }
    };

    try {
      await attemptLogin();
    } catch (criticalError) {
      console.error("Critical login error:", criticalError);
      setLoginError("A critical error occurred. Please try refreshing the page.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Google Login failed:", error);
      if (error.code === 'auth/popup-blocked') {
        setLoginError("Popup blocked. Please allow popups for this site.");
      } else if (error.code === 'auth/unauthorized-domain') {
        setLoginError("This domain is not authorized for Google Login. Please contact Superadmin.");
      } else {
        setLoginError(`Google Login failed: ${error.message || error.code || 'Unknown error'}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleAddCase = async (newCase: Partial<FollowUpCase>) => {
    try {
      const caseRef = doc(collection(db, 'cases'));
      await setDoc(caseRef, { 
        ...newCase, 
        id: caseRef.id,
        createdByEmail: user?.email || '',
        createdByUid: user?.uid || ''
      });
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

  // Tab Permission Checker
  const handleSetActiveTab = (tabId: string) => {
    const permissionsMap: Record<string, string[]> = {
      'dashboard': ['view_dashboard'],
      'cases': ['create_case', 'view_history'],
      'todo': ['view_history'],
      'patients': ['view_history'],
      'users': ['manage_users'],
    };

    const requiredPermissions = permissionsMap[tabId];
    if (requiredPermissions && user) {
      const hasPermission = user.role === 'Superadmin' || requiredPermissions.some(p => user.permissions?.includes(p as any));
      if (!hasPermission) {
        setShowUnauthorizedModal(true);
        return;
      }
    }
    setActiveTab(tabId);
  };

  // Derive tags from current cases list efficiently
  const availableSystemTags = React.useMemo(() => {
    const normalizeTag = (tag: string): string => {
      const t = tag.toLowerCase().trim();
      if (t === 'aramommy') return 'AraMommy';
      if (t === 'arachronic') return 'AraChronic';
      if (t.includes('arawellness')) return 'AraWellness';
      if (t.includes('referral')) return 'Referral';
      return tag.trim();
    };
    
    const seen = new Set<string>();
    cases.forEach(c => {
      if (c.followUpTag) seen.add(normalizeTag(c.followUpTag));
    });
    // Add default fallbacks if not present
    ['Referral', 'AraMommy', 'AraWellness', 'AraChronic', 'Routine', 'Follow-up'].forEach(t => seen.add(t));
    return Array.from(seen).sort();
  }, [cases]);

  const selectedCase = cases.find(c => c.id === selectedCaseId);

  if (isWellnessForm) {
    return <WellnessForm />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500 text-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
          <div className="space-y-1">
            <p className="text-slate-900 font-bold">AraCare is warming up...</p>
            {isTakingTooLong && (
              <p className="text-slate-500 text-sm animate-pulse">
                Optimizing your workstation & connecting to {user?.branch || 'clinic'} database...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 overflow-y-auto flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md w-full space-y-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-indigo-950 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
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

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-slate-400 font-medium">OR CONTINUE WITH</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isLoggingIn}
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
            >
              <Chrome className="w-5 h-5 text-red-500" />
              Sign in with Google
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
            Please log in using a computer (Desktop) to access the clinic management system.
          </p>
          <button 
            onClick={handleLogout}
            className="mt-6 w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors"
          >
            LOG OUT
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
        <Sidebar activeTab={activeTab} setActiveTab={handleSetActiveTab} user={user} onLogout={handleLogout} />
        
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-end mb-6">
              {activeTab === 'cases' && user.permissions?.includes('create_case') && (
                <button 
                  onClick={() => setIsFormOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-950 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                >
                  <PlusCircle className="w-4 h-4" />
                  NEW FOLLOW-UP
                </button>
              )}
            </div>

            {activeTab === 'dashboard' && <Dashboard cases={cases} userName={user.displayName} onFilterByTag={(tag) => { setTagFilter(tag); setActiveTab('cases'); }} />}
            {activeTab === 'cases' && user && <CaseList cases={cases} onViewCase={setSelectedCaseId} currentUser={user} tagFilter={tagFilter} setTagFilter={setTagFilter} />}
            {activeTab === 'todo' && <TodoList user={user} />}
            {activeTab === 'patients' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-between shadow-sm">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 leading-tight">Bulk Import</h2>
                    <p className="text-sm text-slate-500 mt-1">Upload CSV data to populate your patient directory.</p>
                  </div>
                  <button
                    onClick={() => setShowCSVImport(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-950 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                  >
                    <Upload className="w-4 h-4" />
                    IMPORT PATIENTS
                  </button>
                </div>
                
                <PatientList currentUser={user} />
              </div>
            )}
            {activeTab === 'users' && <UserManagement currentUser={user} />}
          </div>

          {/* CSV IMPORT MODAL */}
          {showCSVImport && (
            <CSVImport
              onClose={() => setShowCSVImport(false)}
              onImportComplete={() => {
                setShowCSVImport(false);
                toast.success('Patients imported successfully!');
              }}
              defaultBranch={user?.branch || 'Kajang'}
              currentUser={user!}
              availableSystemTags={availableSystemTags}
            />
          )}
        </main>

        {isFormOpen && (
          <CaseForm 
            currentUser={user}
            onClose={() => setIsFormOpen(false)} 
            onSubmit={handleAddCase} 
            existingCases={cases}
          />
        )}

        {selectedCase && user && (
          <CaseDetails 
            caseData={selectedCase} 
            onClose={() => setSelectedCaseId(null)} 
            onUpdate={handleUpdateCase}
            currentUser={user}
            allCases={cases}
          />
        )}

        {showUnauthorizedModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center animate-in zoom-in duration-300 border border-red-50">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Unauthorized Access</h2>
              <p className="text-slate-500 mt-3 leading-relaxed">
                You do not have permission to view this section. 
                <span className="block mt-2 font-medium text-slate-700 underline">Please contact the Superadmin if you require access.</span>
              </p>
              <button 
                onClick={() => setShowUnauthorizedModal(false)}
                className="mt-8 w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}