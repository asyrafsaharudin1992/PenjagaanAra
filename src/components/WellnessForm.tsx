import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle2, Loader2, Activity, Scale, AlertCircle } from 'lucide-react';

export default function WellnessForm() {
  const [weight, setWeight] = useState('');
  const [sideEffects, setSideEffects] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get caseId from URL
  const searchParams = new URLSearchParams(window.location.search);
  const caseId = searchParams.get('caseId');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) {
      setError("Invalid link. Missing case reference.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const today = new Date();
      const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const docId = `${caseId}_${dateStr}`;

      await setDoc(doc(db, 'wellness_updates', docId), {
        caseId,
        weight: parseFloat(weight),
        sideEffects,
        createdAt: today.toISOString(),
        date: dateStr
      });
      setIsSuccess(true);
    } catch (err) {
      console.error("Error submitting form:", err);
      setError("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Thank You!</h2>
          <p className="text-slate-500">Your wellness update has been submitted successfully to your doctor.</p>
          <p className="text-sm text-slate-400 mt-4">You may now close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
            <Activity className="text-white w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AraWellness Update</h1>
            <p className="text-slate-500 mt-2">Please provide your latest progress.</p>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-600" />
              Current Weight (kg)
            </label>
            <input 
              required
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 65.5"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-emerald-600" />
              Any Side Effects?
            </label>
            <textarea 
              required
              value={sideEffects}
              onChange={(e) => setSideEffects(e.target.value)}
              placeholder="e.g. Nausea, headache, or 'None'"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 min-h-[120px] resize-none"
            />
          </div>

          <button
            disabled={isSubmitting || !caseId}
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            SUBMIT UPDATE
          </button>
        </form>
      </div>
    </div>
  );
}
