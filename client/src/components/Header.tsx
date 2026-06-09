import React from 'react';
import { Package, RefreshCw, Search, User, ChevronRight } from 'lucide-react';
import type { Sender } from '../types';
import { cn } from '../lib/utils';

interface HeaderProps {
  senders: Sender[];
  selectedSenderId: number | null;
  onSenderChange: (id: number) => void;
  onSync: () => void;
  isSyncing: boolean;
  showSync: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  currentSource: 'Email' | 'PrestaShop';
}

export const Header: React.FC<HeaderProps> = ({
  senders,
  selectedSenderId,
  onSenderChange,
  onSync,
  isSyncing,
  showSync,
  search,
  onSearchChange,
  currentSource,
}) => {
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo & Status */}
          <div className="flex items-center space-x-4">
            <div className="bg-primary-600 p-2.5 rounded-2xl shadow-lg shadow-primary-600/20">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black text-slate-900 tracking-tight leading-none">InstalSzop</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Order Manager</span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-xl mx-12">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
              </div>
              <input
                type="text"
                className="block w-full pl-12 pr-4 py-3 bg-slate-100/50 border border-transparent rounded-2xl leading-5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent sm:text-sm transition-all duration-200 shadow-sm"
                placeholder="Szukaj zamówienia, klienta, Email или miasta..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-6">
            {showSync && (
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="group relative inline-flex items-center px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2 transition-transform duration-700", isSyncing ? "animate-spin" : "group-hover:rotate-180")} />
                {currentSource === 'Email' ? 'POBIERZ POCZTĘ' : 'SYNCHRONIZUJ API'}
              </button>
            )}

            <div className="h-10 w-[1px] bg-slate-200" />

            <div className="flex items-center space-x-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Aktualny nadawca</span>
                <div className="relative mt-1">
                  <select
                    value={selectedSenderId || ''}
                    onChange={(e) => onSenderChange(Number(e.target.value))}
                    className="appearance-none bg-transparent text-sm font-black text-slate-800 focus:outline-none pr-8 cursor-pointer hover:text-primary-600 transition-colors"
                  >
                    <option value="" disabled>Wybierz nadawcę</option>
                    {senders.map((sender) => (
                      <option key={sender.id} value={sender.id}>
                        {sender.company || sender.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pointer-events-none text-slate-400">
                    <ChevronRight className="h-4 w-4 rotate-90" />
                  </div>
                </div>
              </div>
              <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-slate-100">
                <User className="h-5 w-5 text-slate-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
