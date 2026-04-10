import React from 'react';
import { 
  Users, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp,
  Calendar as CalendarIcon,
  ClipboardList
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { FollowUpCase, DashboardStats } from '../types';
import { cn } from '../lib/utils';

interface DashboardProps {
  cases: FollowUpCase[];
  userName?: string;
  onFilterByTag: (tag: string) => void;
}

export default function Dashboard({ cases, userName, onFilterByTag }: DashboardProps) {
  // Dynamic stats based on actual tags in the system
  const normalizeTag = (tag: string) => {
    const lowerTag = tag.toLowerCase().trim();
    if (lowerTag === 'aramommy') return 'AraMommy';
    if (lowerTag === 'arachronic') return 'AraChronic';
    if (lowerTag === 'arahaji') return 'AraHaji';
    if (lowerTag.includes('arawellness')) return 'AraWellness';
    if (lowerTag.includes('referral')) return 'Referral';
    return tag;
  };

  const tagCounts = cases.reduce((acc, c) => {
    const tag = normalizeTag(c.followUpTag || 'others');
    const branch = c.branch || 'Unknown';
    if (!acc[tag]) acc[tag] = { total: 0, branches: {} };
    acc[tag].total += 1;
    acc[tag].branches[branch] = (acc[tag].branches[branch] || 0) + 1;
    return acc;
  }, {} as Record<string, { total: number; branches: Record<string, number> }>);

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1].total - a[1].total);

  const chartData = sortedTags
    .map(([name, data]) => ({ 
      name, 
      ...data.branches,
      total: data.total
    }))
    .slice(0, 6);

  const handleBarClick = (data: any) => {
    if (data && data.name) {
      onFilterByTag(data.name);
    }
  };

  const recentCases = [...cases]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const getTagColor = (tag: string) => {
    if (tag === 'AraMommy') return 'pink';
    if (tag === 'AraHaji') return 'blue';
    if (tag === 'AraWellness (weight loss)') return 'emerald';
    if (tag === 'Referral') return 'indigo';
    return 'slate';
  };

  const getTagIcon = (tag: string) => {
    if (tag === 'AraMommy') return Users;
    if (tag === 'AraHaji') return Clock;
    if (tag === 'AraWellness (weight loss)') return TrendingUp;
    if (tag === 'Referral') return AlertCircle;
    return CheckCircle2;
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Clinic Overview</h2>
        <p className="text-slate-500 text-sm">Welcome back, {userName || 'staff member'}. Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard 
          title="TOTAL CASES" 
          value={cases.length} 
          icon={ClipboardList} 
          color="indigo" 
          trend="All active cases"
        />
        {sortedTags.map(([tag, data]) => (
          <StatCard 
            key={tag}
            title={tag} 
            value={data.total} 
            icon={getTagIcon(tag)} 
            color={getTagColor(tag)} 
            trend={`Total ${tag} cases`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900">Case Distribution</h3>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="Kajang" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][index % 6]} />
                  ))}
                </Bar>
                <Bar dataKey="Seri Kembangan" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#60a5fa', '#fb7185', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'][index % 6]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
                  c.followUpTag === 'AraHaji' ? "bg-blue-500" : 
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
