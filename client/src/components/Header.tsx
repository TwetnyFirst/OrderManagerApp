import React from 'react';
import { Package, RefreshCw, Search, User } from 'lucide-react';
import type { Sender } from '../types';

interface HeaderProps {
  senders: Sender[];
  selectedSenderId: number | null;
  onSenderChange: (id: number) => void;
  onSync: () => void;
  isSyncing: boolean;
  showSync: boolean;
  search: string;
  onSearchChange: (val: string) => void;
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
}) => {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Package className="h-8 w-8 text-primary-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">OrderManager</span>
          </div>

          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm transition-all"
                placeholder="Szukaj zamówienia, klienta, miasta..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {showSync && (
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                Synchronizuj
              </button>
            )}

            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <div className="p-1.5">
                <User className="h-4 w-4 text-gray-500" />
              </div>
              <select
                value={selectedSenderId || ''}
                onChange={(e) => onSenderChange(Number(e.target.value))}
                className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none pr-8 border-none ring-0 focus:ring-0 cursor-pointer"
              >
                <option value="" disabled>Wybierz nadawcę</option>
                {senders.map((sender) => (
                  <option key={sender.id} value={sender.id}>
                    {sender.company || sender.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
