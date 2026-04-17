import React from 'react';
import { LayoutDashboard, Users, ClipboardList, Settings, LogOut, User as UserIcon, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile, UserPermission } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: UserProfile;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' as UserPermission },
    { id: 'cases', label: 'Follow-up Cases', icon: ClipboardList, permission: 'view_history' as UserPermission },
    { id: 'todo', label: 'To Do List', icon: ClipboardList, permission: 'view_history' as UserPermission },
    { id: 'patients', label: 'Patients', icon: Users, permission: 'view_history' as UserPermission },
    { id: 'users', label: 'Users', icon: UserIcon, permission: 'manage_users' as UserPermission },
  ];

  return (
    <div className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col sticky top-0">
      <div className="p-6 flex-1">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <ClipboardList className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">AraCare</h1>
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === item.id
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-indigo-600" : "text-slate-400")} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6 border-t border-slate-100 space-y-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 border border-slate-200">
            <UserIcon className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-slate-900 truncate">{user.displayName}</p>
            <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">{user.role}</p>
          </div>
        </div>
        
        <div className="space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            <Settings className="w-4 h-4 text-slate-400" />
            Settings
          </button>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
