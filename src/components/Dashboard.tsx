import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp,
  Calendar as CalendarIcon,
  ClipboardList,
  ChevronDown,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';
import { FollowUpCase, DashboardStats } from '../types';
import { cn } from '../lib/utils';

interface DashboardProps {
  cases: FollowUpCase[];
  userName?: string;
  onFilterByTag: (tag: string) => void;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const BAR_COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const BAR_COLORS_LIGHT = ['#a5b4fc', '#fda4af', '#6ee7b7', '#fcd34d', '#c4b5fd', '#f9a8d4'];

export default function Dashboard({ cases, userName, onFilterByTag }: DashboardProps) {

  // ── Derive available years from actual case data ──
  const availableYears = useMemo(() => {
    const years = new Set(cases.map(c => new Date(c.createdAt).getFullYear()));
    return Array.from(years).sort((a, b) => b - a); // newest first
  }, [cases]);

  // ── Filter state ──
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all'); // 0-11
  const [selectedTag, setSelectedTag] = useState<string>('all');

  // ── Derive available tags from case data ──
  const availableTags = useMemo(() => {
    const tags = new Set(cases.map(c => normalizeTag(c.followUpTag || 'Others')));
    return Array.from(tags).sort();
  }, [cases]);

  // ── Apply filters to cases for the chart ──
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const date = new Date(c.createdAt);
      if (selectedYear !== 'all' && date.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== 'all' && date.getMonth() !== selectedMonth) return false;
      if (selectedTag !== 'all' && normalizeTag(c.followUpTag || 'Others') !== selectedTag) return false;
      return true;
    });
  }, [cases, selectedYear, selectedMonth, selectedTag]);

  // ── Build chart data from filtered cases ──
  const tagCounts = useMemo(() => {
    return filteredCases.reduce((acc, c) => {
      const tag = normalizeTag(c.followUpTag || 'Others');
      const branch = c.branch || 'Unknown';
      if (!acc[tag]) acc[tag] = { total: 0, branches: {} };
      acc[tag].total += 1;
      acc[tag].branches[branch] = (acc[tag].branches[branch] || 0) + 1;
      return acc;
    }, {} as Record<string, { total: number; branches: Record<string, number> }>);
  }, [filteredCases]);

  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1].total - a[1].total);

  const chartData = sortedTags
    .map(([name, data]) => ({ name, ...data.branches, total: data.total }))
    .slice(0, 6);

  // ── Stats always based on full (unfiltered) cases ──
  const allTagCounts = useMemo(() => {
    return cases.reduce((acc, c) => {
      const tag = normalizeTag(c.followUpTag || 'Others');
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [cases]);

  const allSortedTags = Object.entries(allTagCounts).sort((a, b) => b[1] - a[1]);

  const recentCases = [...cases]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const hasActiveFilter = selectedYear !== 'all' || selectedMonth !== 'all' || selectedTag !== 'all';

  const filterLabel = () => {
    const parts = [];
    if (selectedYear !== 'all') parts.push(String(selectedYear));
    if (selectedMonth !== 'all') parts.push(MONTHS[selectedMonth as number]);
    if (selectedTag !== 'all') parts.push(selectedTag);
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Clinic Overview</h2>
        <p className="text-slate-500 text-sm">Welcome back, {userName || 'staff member'}. Here's what's happening today.</p>
      </div>

      {/* Stats Grid — always full data */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard 
          title="TOTAL CASES" 
          value={cases.length} 
          icon={ClipboardList} 
          color="indigo" 
          trend="All active cases"
        />
        {allSortedTags.map(([tag, count]) => (
          <StatCard 
            key={tag}
            title={tag} 
            value={count} 
            icon={getTagIcon(tag)} 
            color={getTagColor(tag)} 
            trend={`Total ${tag} cases`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          
          {/* Chart Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="font-semibold text-slate-900">Case Distribution</h3>
              {hasActiveFilter && (
                <p className="text-xs text-indigo-600 font-medium mt-0.5">
                  Filtered: {filterLabel()} · {filteredCases.length} cases
                </p>
              )}
            </div>
            <TrendingUp className="w-4 h-4 text-slate-400 mt-1" />
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
              <Filter className="w-3 h-3" />
              Filter
            </div>

            {/* Year Filter */}
            <div className="relative">
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className={cn(
                  "appearance-none pl-3 pr-7 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all outline-none",
                  selectedYear !== 'all'
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                )}
              >
                <option value="all">All Years</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none",
                selectedYear !== 'all' ? "text-white" : "text-slate-400"
              )} />
            </div>

            {/* Month Filter */}
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className={cn(
                  "appearance-none pl-3 pr-7 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all outline-none",
                  selectedMonth !== 'all'
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                )}
              >
                <option value="all">All Months</option>
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <ChevronDown className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none",
                selectedMonth !== 'all' ? "text-white" : "text-slate-400"
              )} />
            </div>

            {/* Tag / Case Type Filter */}
            <div className="relative">
              <select
                value={selectedTag}
                onChange={e => setSelectedTag(e.target.value)}
                className={cn(
                  "appearance-none pl-3 pr-7 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all outline-none",
                  selectedTag !== 'all'
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                )}
              >
                <option value="all">All Cases</option>
                {availableTags.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none",
                selectedTag !== 'all' ? "text-white" : "text-slate-400"
              )} />
            </div>

            {/* Clear Filters */}
            {hasActiveFilter && (
              <button
                onClick={() => {
                  setSelectedYear('all');
                  setSelectedMonth('all');
                  setSelectedTag('all');
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-all"
              >
                Clear
              </button>
            )}
          </div>

          {/* Chart */}
          <div className="h-64 w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <ClipboardList className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-medium">No cases match this filter</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} onClick={(d: any) => d?.activePayload && onFilterByTag(d.activePayload[0]?.payload?.name)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11 }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  />
                  <Bar dataKey="Kajang" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} barSize={40} />
                  <Bar dataKey="Seri Kembangan" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900">Recent Follow-ups</h3>
            <CalendarIcon className="w-4 h-4 text-slate-400" />
          </div>
          <div className="space-y-4">
            {recentCases.map((c) => (
              <div key={c.id} className="flex items-start gap-3 pb-4 border-bottom border-slate-50 last:border-0">
                <div className={cn(
                  "mt-1 w-2 h-2 rounded-full shrink-0",
                  c.followUpTag === 'AraMommy' ? "bg-pink-500" : 
                  c.followUpTag === 'AraWellness (weight loss)' ? "bg-emerald-500" : 
                  c.followUpTag === 'Referral' ? "bg-indigo-500" : "bg-slate-400"
                )} />
                <div>
                  <p className="text-sm font-medium text-slate-900">{c.patientName}</p>
                  <p className="text-xs text-slate-500 line-clamp-1">{c.diagnosis}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(c.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTag(tag: string): string {
  const t = tag.toLowerCase().trim();
  if (t === 'aramommy') return 'AraMommy';
  if (t === 'arachronic') return 'AraChronic';
  if (t.includes('arawellness')) return 'AraWellness';
  if (t.includes('referral')) return 'Referral';
  return tag;
}

function getTagColor(tag: string): string {
  if (tag === 'AraMommy') return 'pink';
  if (tag === 'AraWellness' || tag.includes('wellness')) return 'emerald';
  if (tag === 'Referral') return 'indigo';
  return 'slate';
}

function getTagIcon(tag: string) {
  if (tag === 'AraMommy') return Users;
  if (tag === 'AraWellness' || tag.includes('wellness')) return TrendingUp;
  if (tag === 'Referral') return AlertCircle;
  return CheckCircle2;
}

function StatCard({ title, value, icon: Icon, color, trend }: any) {
  const colors: any = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    pink: "bg-pink-50 text-pink-600 border-pink-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    slate: "bg-slate-50 text-slate-600 border-slate-100",
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-xl border", colors[color])}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-slate-900">{value}</span>
      </div>
      <p className="text-xs text-slate-500 mt-2">{trend}</p>
    </div>
  );
}
