import React, { useState } from 'react';
import { Upload, X, AlertCircle, CheckCircle, ArrowRight, FileText, Users, Settings, Tag, Building2, AlertTriangle } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, doc, setDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { FollowUpCase, UserProfile, ClinicBranch, FollowUpTag } from '../types';
import { normalizeBranch, cn } from '../lib/utils';

interface ImportedPatient {
  patientId: string;
  patientName: string;
  patientPhone?: string;
  diagnosis?: string;
  branch?: string;
  doctorInCharge?: string;
  lastVisitDate?: string;
  appointmentDate?: string;
  followUpDoneBy?: string;
  followUpTag?: string;
  remarks?: string;
  isValid: boolean;
  missingFields: string[];
  isDuplicate?: boolean;
  rawData: any;
}

interface ColumnMapping {
  patientId: string | null;
  patientName: string | null;
  patientPhone: string | null;
  diagnosis: string | null;
  doctorInCharge: string | null;
  branch: string | null;
  lastVisitDate: string | null;
  appointmentDate: string | null;
  followUpDoneBy: string | null;
  followUpTag: string | null;
  remarks: string | null;
}

interface CSVImportProps {
  onClose: () => void;
  onImportComplete: () => void;
  defaultBranch: string;
  currentUser: UserProfile;
  availableSystemTags: string[]; // Added to match dashboard
}

export default function CSVImport({ onClose, onImportComplete, defaultBranch, currentUser, availableSystemTags }: CSVImportProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    patientId: null,
    patientName: null,
    patientPhone: null,
    diagnosis: null,
    doctorInCharge: null,
    branch: null,
    lastVisitDate: null,
    appointmentDate: null,
    followUpDoneBy: null,
    followUpTag: null,
    remarks: null,
  });
  const [importedData, setImportedData] = useState<ImportedPatient[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedBranch, setSelectedBranch] = useState<ClinicBranch>((currentUser.role === 'Superadmin' ? 'Kajang' : (normalizeBranch(currentUser.branch) as ClinicBranch || 'Kajang')));
  const [branchSource, setBranchSource] = useState<'fixed' | 'csv'>('fixed');
  const [selectedTag, setSelectedTag] = useState<string>('Follow-up');
  const [availableBranches, setAvailableBranches] = useState<string[]>(['Kajang', 'Seri Kembangan']);
  const [availableTags, setAvailableTags] = useState<string[]>(availableSystemTags.length > 0 ? availableSystemTags : [
    'Referral', 'AraMommy', 'AraWellness', 'AraChronic', 'Follow-up', 'Routine', 'Emergency', 'Others'
  ]);

  // Fetch real branches and tags from Firestore
  React.useEffect(() => {
    async function fetchOptions() {
      try {
        // Try fetching tags from a dedicated collection if it exists
        const tagsSnapshot = await getDocs(collection(db, 'tags'));
        const dbTags = !tagsSnapshot.empty ? tagsSnapshot.docs.map(d => d.data().name).filter(Boolean) : [];
        
        // Merge system tags with dashboard/database tags (ensure uniqueness)
        const allTags = new Set([...availableSystemTags, ...dbTags]);
        if (allTags.size > 0) {
          setAvailableTags(Array.from(allTags).sort());
        }

        // Try fetching branches
        const branchesSnapshot = await getDocs(collection(db, 'branches'));
        if (!branchesSnapshot.empty) {
          const branches = branchesSnapshot.docs.map(d => d.data().name).filter(Boolean);
          if (branches.length > 0) setAvailableBranches(branches);
        }
      } catch (error) {
        console.error("Error fetching import options:", error);
      }
    }
    fetchOptions();
  }, [availableSystemTags]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSVHeaders(text);
    };
    reader.readAsText(file);
  };

  const parseCSVHeaders = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      toast.error('CSV file is empty or invalid');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim());
    setCsvHeaders(headers);

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }
    setCsvData(rows);
    autoDetectMapping(headers);
    setStep('mapping');
    toast.success(`Loaded ${rows.length} rows from CSV`);
  };

  const autoDetectMapping = (headers: string[]) => {
    const mapping: ColumnMapping = {
      patientId: null,
      patientName: null,
      patientPhone: null,
      diagnosis: null,
      doctorInCharge: null,
      branch: null,
      lastVisitDate: null,
      appointmentDate: null,
      followUpDoneBy: null,
      followUpTag: null,
      remarks: null,
    };

    headers.forEach(header => {
      const lower = header.toLowerCase();
      
      if ((lower.includes('patient') && lower.includes('id')) || lower === 'id' || lower === 'patientid') {
        mapping.patientId = header;
      } else if ((lower.includes('patient') && lower.includes('name')) || lower === 'name' || lower === 'patientname') {
        mapping.patientName = header;
      } else if (lower.includes('phone') || lower.includes('tel') || lower.includes('mobile')) {
        mapping.patientPhone = header;
      } else if (lower.includes('diagnosis') || lower.includes('condition')) {
        mapping.diagnosis = header;
      } else if (lower.includes('doctor') || lower.includes('dr')) {
        mapping.doctorInCharge = header;
      } else if (lower.includes('branch') || lower.includes('clinic')) {
        mapping.branch = header;
      } else if (lower.includes('last') && lower.includes('visit')) {
        mapping.lastVisitDate = header;
      } else if (lower.includes('appointment') || lower.includes('next')) {
        mapping.appointmentDate = header;
      } else if (lower.includes('staff') || lower.includes('done by') || lower.includes('followupdonby') || lower.includes('staffname')) {
        mapping.followUpDoneBy = header;
      } else if (lower.includes('tag') || lower.includes('category')) {
        mapping.followUpTag = header;
      } else if (lower.includes('remark') || lower.includes('note')) {
        mapping.remarks = header;
      }
    });

    setColumnMapping(mapping);
  };

  const handleMappingChange = (field: keyof ColumnMapping, csvColumn: string | null) => {
    setColumnMapping(prev => ({ ...prev, [field]: csvColumn }));
  };

  const handleApplyMapping = async () => {
    if (!columnMapping.patientName) {
      toast.error('Patient Name column is required');
      return;
    }
    if (!columnMapping.patientPhone) {
      toast.error('Phone Number column is required');
      return;
    }

    setIsProcessing(true);
    try {
      // Fetch existing patients to check for duplicates
      const patientsSnapshot = await getDocs(collection(db, 'patients'));
      const existingIds = new Set(patientsSnapshot.docs.map(d => String(d.data().patientId || '').trim()));
      const existingNames = new Set(patientsSnapshot.docs.map(d => String(d.data().name || '').trim().toLowerCase()));

      const patients: ImportedPatient[] = csvData.map((row, index) => {
        const patient: any = {
          patientId: columnMapping.patientId ? String(row[columnMapping.patientId] || '').trim() : `AUTO-${Date.now()}-${index}`,
          patientName: columnMapping.patientName ? String(row[columnMapping.patientName] || '').trim() : '',
          patientPhone: columnMapping.patientPhone ? String(row[columnMapping.patientPhone] || '').trim() : '',
          diagnosis: columnMapping.diagnosis ? row[columnMapping.diagnosis] : 'To be determined',
          doctorInCharge: columnMapping.doctorInCharge ? row[columnMapping.doctorInCharge] : 'To be assigned',
          branch: branchSource === 'csv' && columnMapping.branch 
            ? (normalizeBranch(row[columnMapping.branch]) as ClinicBranch || selectedBranch)
            : selectedBranch,
          lastVisitDate: columnMapping.lastVisitDate ? row[columnMapping.lastVisitDate] : '',
          appointmentDate: columnMapping.appointmentDate ? row[columnMapping.appointmentDate] : '',
          followUpDoneBy: columnMapping.followUpDoneBy ? row[columnMapping.followUpDoneBy] : '',
          followUpTag: columnMapping.followUpTag ? row[columnMapping.followUpTag] : 'others',
          remarks: columnMapping.remarks ? row[columnMapping.remarks] : 'Imported from CSV - pending details',
          rawData: row,
        };

        const missingFields: string[] = [];
        if (!patient.patientName) missingFields.push('Patient Name');
        if (!patient.patientPhone) missingFields.push('Phone Number');

        const isDuplicate = existingIds.has(patient.patientId) || existingNames.has(patient.patientName.toLowerCase());

        return {
          ...patient,
          isDuplicate,
          isValid: missingFields.length === 0,
          missingFields,
        };
      });

      setImportedData(patients);
      
      // Auto-select ONLY non-duplicates by default
      const nonDuplicateIndices = patients
        .map((p, idx) => p.isDuplicate ? -1 : idx)
        .filter(idx => idx !== -1);
      
      setSelectedRows(new Set(nonDuplicateIndices));
      
      setStep('preview');
      const duplicateCount = patients.filter(p => p.isDuplicate).length;
      if (duplicateCount > 0) {
        toast.warning(`Detected ${duplicateCount} potential duplicates. They have been unselected by default.`);
      } else {
        toast.success('Column mapping applied! Review data below.');
      }
    } catch (error) {
      console.error("Mapping error:", error);
      toast.error("Failed to process mapping. Check connection.");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleRowSelection = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === importedData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(importedData.map((_, idx) => idx)));
    }
  };

  const handleImportPatients = async () => {
    const selectedPatients = Array.from(selectedRows).map(idx => importedData[idx]);
    const validPatients = selectedPatients.filter(p => p.isValid);
    const invalidCount = selectedPatients.length - validPatients.length;

    if (validPatients.length === 0) {
      toast.error('No valid patients to import.');
      return;
    }

    if (invalidCount > 0) {
      toast.warning(`${invalidCount} patient(s) skipped due to missing fields.`);
    }

    setIsProcessing(true);

    try {
      let successCount = 0;
      let errorCount = 0;

      // Force a quick re-verification or retrieval of the current user's session token 
      // to ensure the active connection does not drop or time out while processing large amounts of data.
      if (auth.currentUser) {
        try {
          await auth.currentUser.getIdToken(true);
        } catch (err) {
          console.warn('Failed to refresh token before import, proceeding anyway...', err);
        }
      }

      // 1. Implement Smart Chunking (Batch Splitting)
      // 2. Optimize Write Operations (currently 1 write per patient, limit to 50 for safety)
      const MAX_BATCH_SIZE = 50;

      // Loop through these chunks sequentially
      for (let i = 0; i < validPatients.length; i += MAX_BATCH_SIZE) {
        const chunk = validPatients.slice(i, i + MAX_BATCH_SIZE);
        const batch = writeBatch(db);
        let chunkCount = 0;

        for (const patient of chunk) {
          try {
            const patientRef = doc(collection(db, 'patients'));
            const patientData = {
              id: patientRef.id,
              patientId: String(patient.patientId || `P-${Date.now()}`),
              name: String(patient.patientName || 'Unknown'),
              phone: String(patient.patientPhone || '').replace(/\s+/g, ''),
              branch: (patient.branch as ClinicBranch) || selectedBranch,
              tag: selectedTag,
              lastVisitDate: patient.lastVisitDate || '',
              appointmentDate: patient.appointmentDate || '',
              followUpDoneBy: patient.followUpDoneBy || '',
              diagnosis: patient.diagnosis || '',
              doctorInCharge: patient.doctorInCharge || '',
              createdAt: new Date().toISOString(),
              createdByEmail: currentUser?.email || '',
              createdByUid: currentUser?.uid || '',
            };

            batch.set(patientRef, patientData);
            chunkCount++;
          } catch (error) {
            console.error(`[IMPORT] Local error preparing data for ${patient.patientName}:`, error);
            errorCount++;
          }
        }
        
        // Wrap the chunking loop in a proper try-catch block
        try {
          // Resolve it using await batch.commit() before moving to the next chunk
          await batch.commit();
          successCount += chunkCount;
        } catch (batchError) {
          console.error(`[IMPORT] Batch commit failed for rows ${i} to ${i + chunk.length - 1}:`, batchError);
          // If a specific chunk fails, catch the error gracefully instead of crashing the entire import process.
          errorCount += chunkCount;
        }
      }

      // 4. Summary Notification
      if (successCount > 0) {
        toast.success(`Import Complete: ${successCount} rows successfully imported. ${errorCount} rows skipped/failed.`);
        onImportComplete();
        onClose();
      } else {
        toast.error(`All imports failed. Check console for details.`);
      }
      
    } catch (error) {
      console.error('[IMPORT] Major Error:', error);
      toast.error('Failed to import patients');
    } finally {
      setIsProcessing(false);
    }
  };

  const ColumnMappingSelector = ({ field, label, required }: { field: keyof ColumnMapping, label: string, required: boolean }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={columnMapping[field] || ''}
        onChange={(e) => handleMappingChange(field, e.target.value || null)}
        className={`w-full px-3 py-2 border rounded-lg text-sm ${
          required && !columnMapping[field] 
            ? 'border-red-300 bg-red-50' 
            : 'border-slate-200 bg-white'
        }`}
      >
        <option value="">-- Select Column --</option>
        {csvHeaders.map(header => (
          <option key={header} value={header}>{header}</option>
        ))}
      </select>
    </div>
  );

  // Kira berapa row yang valid untuk butang "Create X/Y Cases"
  const validSelectedCount = Array.from(selectedRows).filter(idx => importedData[idx]?.isValid).length;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              {step === 'upload' && <Upload className="w-5 h-5 text-indigo-950" />}
              {step === 'mapping' && <Settings className="w-5 h-5 text-indigo-950" />}
              {step === 'preview' && <Users className="w-5 h-5 text-indigo-950" />}
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight whitespace-nowrap">
                {step === 'upload' && 'Import Patient Directory'}
                {step === 'mapping' && 'Field Mapping'}
                {step === 'preview' && 'Review & Import Patients'}
              </h3>
              <p className="text-xs text-slate-500">
                {step === 'upload' && 'Step 1 of 3: Choose your CSV file'}
                {step === 'mapping' && 'Step 2 of 3: Match your columns to our fields'}
                {step === 'preview' && 'Step 3 of 3: Confirm and import patients'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="text-center py-12">
              <div className="mx-auto w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                <FileText className="w-10 h-10 text-indigo-500" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Upload Any CSV Format</h4>
              <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                Your CSV can have any column names. We'll help you map them in the next step!
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-950 text-white rounded-lg font-medium hover:bg-slate-900 transition-colors cursor-pointer shadow-lg shadow-indigo-200">
                <Upload className="w-5 h-5" />
                Choose CSV File
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {step === 'mapping' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="text-sm font-bold text-blue-900 mb-2">📊 Detected {csvHeaders.length} columns in your CSV</h4>
                <p className="text-xs text-blue-700">
                  Map your CSV columns to our required fields below. Fields marked with * are required.
                </p>
              </div>

              <div>
                <h5 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Required Fields</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ColumnMappingSelector field="patientName" label="Patient Name" required />
                  <ColumnMappingSelector field="patientPhone" label="Phone Number" required />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5" />
                  Global Import Settings (Apply to all rows)
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        Branch (Cawangan)
                      </label>
                      <div className="flex bg-slate-200 p-0.5 rounded-lg border border-slate-300">
                        <button 
                          onClick={() => setBranchSource('fixed')}
                          className={cn(
                            "px-2 py-0.5 rounded-md text-[9px] font-bold uppercase transition-all",
                            branchSource === 'fixed' ? "bg-white text-indigo-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          Fixed
                        </button>
                        <button 
                          onClick={() => setBranchSource('csv')}
                          className={cn(
                            "px-2 py-0.5 rounded-md text-[9px] font-bold uppercase transition-all",
                            branchSource === 'csv' ? "bg-white text-indigo-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          CSV
                        </button>
                      </div>
                    </div>
                    
                    {branchSource === 'fixed' ? (
                      <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value as ClinicBranch)}
                        disabled={currentUser.role !== 'Superadmin'}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 outline-none disabled:bg-slate-100 disabled:text-slate-500 transition-all shadow-sm"
                      >
                        {currentUser.role === 'Superadmin' ? (
                          availableBranches.map(branch => (
                            <option key={branch} value={branch}>{branch}</option>
                          ))
                        ) : (
                          <option value={selectedBranch}>{selectedBranch}</option>
                        )}
                      </select>
                    ) : (
                      <div className="animate-in slide-in-from-left-2 duration-300">
                        <ColumnMappingSelector field="branch" label="Branch Column from CSV" required />
                        <p className="text-[9px] text-slate-400 mt-1 italic">Normalized to: Kajang or Seri Kembangan</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      Tagging Category
                    </label>
                    <select
                      value={selectedTag}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 outline-none"
                    >
                      {availableTags.map(tag => (
                        <option key={tag} value={tag}>{tag}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Other Optional Fields (CSV Mapping)</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ColumnMappingSelector field="patientId" label="Patient ID (auto-generated if empty)" required={false} />
                  {branchSource === 'fixed' && <div />} {/* Placeholder to keep grid balanced if mapping branch is not here */}
                  <ColumnMappingSelector field="diagnosis" label="Diagnosis (default: 'To be determined')" required={false} />
                  <ColumnMappingSelector field="doctorInCharge" label="Doctor (default: 'To be assigned')" required={false} />
                  <ColumnMappingSelector field="lastVisitDate" label="Last Visit Date" required={false} />
                  <ColumnMappingSelector field="appointmentDate" label="Appointment Date" required={false} />
                  <ColumnMappingSelector field="followUpDoneBy" label="Staff (Follow up done by)" required={false} />
                  <ColumnMappingSelector field="remarks" label="Remarks/Notes" required={false} />
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <h5 className="text-sm font-bold text-slate-900 mb-3">Sample Preview (First Row)</h5>
                {csvData.length > 0 && (
                  <div className="space-y-2 text-xs">
                    {Object.entries(csvData[0]).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="font-bold text-slate-600 min-w-[150px]">{key}:</span>
                        <span className="text-slate-900">{value as string}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & IMPORT */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-indigo-600 uppercase">Total</span>
                  </div>
                  <p className="text-2xl font-bold text-indigo-900">{importedData.length}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-bold text-green-600 uppercase">Valid</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">
                    {importedData.filter(p => p.isValid).length}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-600 uppercase">Incomplete</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-900">
                    {importedData.filter(p => !p.isValid).length}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <input
                  type="checkbox"
                  checked={selectedRows.size === importedData.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">
                  Select All ({selectedRows.size} selected)
                </span>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {importedData.map((patient, index) => (
                  <div
                    key={index}
                    className={`border rounded-xl p-4 transition-all ${
                      selectedRows.has(index)
                        ? 'border-indigo-300 bg-indigo-50/50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(index)}
                        onChange={() => toggleRowSelection(index)}
                        className="mt-1 w-4 h-4 rounded border-slate-300"
                      />
                      
                      <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {patient.isValid ? (
                              patient.isDuplicate ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">
                                  <AlertTriangle className="w-3 h-3" />
                                  DUPLICATE
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold">
                                  <CheckCircle className="w-3 h-3" />
                                  READY
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold">
                                <X className="w-3 h-3" />
                                INCOMPLETE
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">Row {index + 1}</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                          <div>
                            <span className="text-xs text-slate-500">ID:</span>
                            <p className="font-semibold text-slate-900 truncate">{patient.patientId || '-'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500">Name:</span>
                            <p className="font-semibold text-slate-900 truncate">{patient.patientName || '-'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500">Phone:</span>
                            <p className="font-semibold text-slate-900">{patient.patientPhone || '-'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500">Branch:</span>
                            <p className="font-semibold text-indigo-600">{patient.branch || '-'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500">Doctor:</span>
                            <p className="font-semibold text-slate-900 truncate">{patient.doctorInCharge || '-'}</p>
                          </div>
                        </div>

                        {!patient.isValid && (
                          <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-amber-900">Missing: {patient.missingFields.join(', ')}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            {step === 'mapping' && (
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                ← Back
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={() => setStep('mapping')}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                ← Back to Mapping
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 'mapping' && (
              <button
                onClick={handleApplyMapping}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-950 text-white rounded-lg font-medium hover:bg-slate-900 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Checking Duplicates...
                  </>
                ) : (
                  <>
                    Continue to Preview
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
            {step === 'preview' && (
              <>
                <span className="text-sm text-slate-600">
                  {selectedRows.size} selected
                </span>
                <button
                  onClick={handleImportPatients}
                  disabled={validSelectedCount === 0 || isProcessing}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-950 text-white rounded-lg font-medium hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      Import {validSelectedCount}/{selectedRows.size} Patients
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}