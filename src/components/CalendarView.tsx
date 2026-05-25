import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Activity, StickyNote, CheckSquare, Stethoscope } from 'lucide-react';
import { cn } from '../lib/utils';

interface CalendarViewProps {
  user: UserProfile;
}

interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  subtitle: string;
  type: 'appointment' | 'blood_test' | 'todo' | 'note' | 'refill_meds';
  originalDate: Date;
}

export default function CalendarView({ user }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  
  const [caseEvents, setCaseEvents] = useState<CalendarEvent[]>([]);
  const [todoEvents, setTodoEvents] = useState<CalendarEvent[]>([]);
  const [noteEvents, setNoteEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch Cases (Appt & Blood taking)
  useEffect(() => {
    if (!user) return;
    const q = user.role === 'Superadmin' 
      ? query(collection(db, 'cases')) 
      : (user.branch ? query(collection(db, 'cases'), where('branch', '==', user.branch)) : null);

    if (!q) return;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const events: CalendarEvent[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as any;
        const caseId = doc.id;
        const patientName = data.patientName || 'Unknown Patient';
        
        if (data.appointmentDate) {
          events.push({
            id: `appt-${caseId}`,
            date: data.appointmentDate,
            title: `Appointment: ${patientName} (${data.branch || '-'})`,
            subtitle: `Diagnosis: ${data.diagnosis || '-'}`,
            type: 'appointment',
            originalDate: new Date(data.appointmentDate)
          });
        }
        
        if (data.registryData) {
          try {
            const parsed = typeof data.registryData === 'string' ? JSON.parse(data.registryData) : data.registryData;
            if (parsed && parsed.type === 'NCD') {
              if (parsed.nextBloodTestDue) {
                 events.push({
                   id: `blood-${caseId}`,
                   date: parsed.nextBloodTestDue,
                   title: `Blood Test: ${patientName} (${data.branch || '-'})`,
                   subtitle: `Diagnosis: ${data.diagnosis || '-'}`,
                   type: 'blood_test',
                   originalDate: new Date(parsed.nextBloodTestDue)
                 });
              }
              if (parsed.refillMedsDate) {
                 events.push({
                   id: `refill-${caseId}`,
                   date: parsed.refillMedsDate,
                   title: `Refill Meds: ${patientName} (${data.branch || '-'})`,
                   subtitle: `Medication: ${parsed.medication || '-'}`,
                   type: 'refill_meds',
                   originalDate: new Date(parsed.refillMedsDate)
                 });
              }
            }
          } catch(e) { }
        }
      });
      setCaseEvents(events);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Todos
  useEffect(() => {
    if (!user) return;
    const q = user.role === 'Superadmin' 
      ? query(collection(db, 'todo')) 
      : (user.branch ? query(collection(db, 'todo'), where('branch', '==', user.branch)) : null);

    if (!q) return;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const events: CalendarEvent[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as any;
        if (data.date) {
          events.push({
            id: `todo-${doc.id}`,
            date: data.date,
            title: `Todo pending: ${data.patientName || 'Task'} (${data.branch || '-'})`,
            subtitle: data.reason || 'No description',
            type: 'todo',
            originalDate: new Date(data.date)
          });
        }
      });
      setTodoEvents(events);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Branch Notes
  useEffect(() => {
    if (!user) return;
    const q = user.role === 'Superadmin' 
      ? query(collection(db, 'branch_notes')) 
      : (user.branch ? query(collection(db, 'branch_notes'), where('branch', '==', user.branch)) : null);

    if (!q) return;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const events: CalendarEvent[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as any;
        if (data.reminderDate) {
          events.push({
            id: `note-${doc.id}`,
            date: data.reminderDate,
            title: `Note Reminder: ${data.patientNames || 'General'} (${data.branch || '-'})`,
            subtitle: data.remarks || '',
            type: 'note',
            originalDate: new Date(data.reminderDate)
          });
        }
      });
      setNoteEvents(events);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const allEvents = useMemo(() => {
    return [...caseEvents, ...todoEvents, ...noteEvents].sort((a, b) => a.originalDate.getTime() - b.originalDate.getTime());
  }, [caseEvents, todoEvents, noteEvents]);

  // Calendar logic
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  const goToToday = () => {
    const today = new Date();
    today.setHours(0,0,0,0);
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const currentYear = currentDate.getFullYear();
  const currentMth = currentDate.getMonth();
  const daysCount = daysInMonth(currentYear, currentMth);
  const firstDay = firstDayOfMonth(currentYear, currentMth);

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysCount; i++) {
    days.push(new Date(currentYear, currentMth, i));
  }

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const getDayEvents = (d: Date) => {
    // compare YYYY-MM-DD
    const isoDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    return allEvents.filter(e => e.date === isoDate);
  };

  const upcomingSelectedEvents = useMemo(() => {
    if (!selectedDate) {
      // If no day selected (shouldn't happen with our UI), show all upcoming
      const todayIso = new Date().toISOString().split('T')[0];
      return allEvents.filter(e => e.date >= todayIso);
    }
    const isoDate = new Date(selectedDate.getTime() - (selectedDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    return allEvents.filter(e => e.date === isoDate);
  }, [allEvents, selectedDate]);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const EventIcon = ({ type }: { type: CalendarEvent['type'] }) => {
    switch (type) {
      case 'appointment': return <Stethoscope className="w-4 h-4 text-indigo-500" />;
      case 'blood_test': return <Activity className="w-4 h-4 text-rose-500" />;
      case 'refill_meds': return <Activity className="w-4 h-4 text-sky-500" />;
      case 'todo': return <CheckSquare className="w-4 h-4 text-amber-500" />;
      case 'note': return <StickyNote className="w-4 h-4 text-teal-500" />;
      default: return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* LEFT: Calendar */}
      <div className="flex-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-indigo-600" />
            Calendar
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={goToToday} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Today</button>
            <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 ml-2">
              <button onClick={prevMonth} className="p-2 hover:bg-slate-100 text-slate-600 rounded-l-lg transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <div className="w-32 text-center font-bold text-sm text-slate-700">
                {monthNames[currentMth]} {currentYear}
              </div>
              <button onClick={nextMonth} className="p-2 hover:bg-slate-100 text-slate-600 rounded-r-lg transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="h-16 rounded-xl bg-slate-50/50" />;
            
            const isToday = isSameDay(day, new Date());
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const dayEvents = getDayEvents(day);
            const hasAppt = dayEvents.some(e => e.type === 'appointment');
            const hasBlood = dayEvents.some(e => e.type === 'blood_test');
            const hasRefill = dayEvents.some(e => e.type === 'refill_meds');
            const hasTodo = dayEvents.some(e => e.type === 'todo');
            const hasNote = dayEvents.some(e => e.type === 'note');

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "h-16 md:h-20 flex flex-col items-center justify-start p-2 rounded-xl transition-all border",
                  isSelected 
                    ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                    : isToday 
                      ? "bg-amber-50/30 border-amber-200" 
                      : "bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span className={cn(
                  "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1",
                  isToday ? "bg-amber-500 text-white" : isSelected ? "text-indigo-700" : "text-slate-700"
                )}>
                  {day.getDate()}
                </span>
                
                <div className="flex flex-wrap justify-center gap-1 mt-auto">
                  {hasAppt && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" title="Appointment"></div>}
                  {hasBlood && <div className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Blood Test"></div>}
                  {hasRefill && <div className="w-1.5 h-1.5 rounded-full bg-sky-500" title="Refill Meds"></div>}
                  {hasTodo && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Todo"></div>}
                  {hasNote && <div className="w-1.5 h-1.5 rounded-full bg-teal-500" title="Note"></div>}
                </div>
              </button>
            );
          })}
        </div>
        
        <div className="mt-8 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 pt-6 border-t border-slate-100">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Appointment</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Blood Test</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-sky-500"></div> Refill Meds</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Todo List</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-teal-500"></div> Note Reminder</div>
        </div>
      </div>

      {/* RIGHT: Upcoming / Selected Day list */}
      <div className="w-full lg:w-96 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col h-[500px] lg:h-auto overflow-hidden">
        <h3 className="text-lg font-bold text-slate-900 mb-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <span>{selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric'}) : 'Upcoming'}</span>
          <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded-lg">{upcomingSelectedEvents.length} Events</span>
        </h3>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
          {upcomingSelectedEvents.length === 0 ? (
             <div className="text-center py-12 px-4">
               <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                 <Clock className="w-6 h-6 text-slate-300" />
               </div>
               <p className="text-sm font-semibold text-slate-500">No events for this date</p>
             </div>
          ) : (
            upcomingSelectedEvents.map(event => (
              <div key={event.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all group">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <EventIcon type={event.type} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{event.title}</h4>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{event.subtitle}</p>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3">
                      {event.type.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
