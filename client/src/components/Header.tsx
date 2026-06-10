import React from 'react';
import { RefreshCw, Search, User, ChevronRight, Bell, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface HeaderProps {
  onSync: () => void;
  isSyncing: boolean;
  showSync: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  currentSource: 'Email' | 'PrestaShop';
  unreadNotifications?: any[];
  onNotificationClick: (orderId: number) => void;
  onMarkAsRead: (id: number) => void;
  onMarkAllAsRead: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSync,
  isSyncing,
  showSync,
  search,
  onSearchChange,
  currentSource,
  unreadNotifications = [],
  onNotificationClick,
  onMarkAsRead,
  onMarkAllAsRead,
}) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const unreadNotificationsCount = unreadNotifications.length;

  return (
    <header className="sticky top-0 z-40 w-full py-3.5 bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          
          {/* Logo & Status (Left) */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            <span className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
              <span className="text-2xl">📦</span> InstalSzop
            </span>
            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md mt-0.5">
              Zamówienia
            </span>
          </div>

          {/* Search Bar (Middle) */}
          <div className="flex-1 max-w-md mx-4 relative group hidden md:block">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400 group-focus-within:text-purple-600 transition-colors" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all duration-200 font-medium shadow-inner"
              placeholder="Szukaj zamówienia, klienta..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Actions (Right) */}
          <div className="flex items-center space-x-3.5 flex-shrink-0">
            {/* Search Input for Mobile/Tablet */}
            <div className="relative group md:hidden max-w-[180px]">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 transition-all duration-200 font-medium"
                placeholder="Szukaj..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>

            {showSync && (
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="group relative inline-flex items-center justify-center px-4 h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm cursor-pointer"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-2 transition-transform duration-700", isSyncing ? "animate-spin" : "group-hover:rotate-180")} />
                {currentSource === 'Email' ? 'Pobierz pocztę' : 'Synchronizuj API'}
              </button>
            )}

            <div className="h-6 w-[1px] bg-slate-200/80" />

            <div className="flex items-center space-x-3">
              {/* Notification Bell */}
              <div className="relative">
                <button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className={cn(
                    "h-[38px] w-[38px] rounded-xl transition-all cursor-pointer relative border flex items-center justify-center",
                    isNotificationsOpen 
                      ? "bg-slate-100 border-slate-350 text-slate-800" 
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-sm"
                  )}
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center bg-rose-500 text-white text-[9px] font-bold rounded-full ring-2 ring-white">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>

                {/* Dropdown Menu */}
                {isNotificationsOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10 backdrop-blur-[1px] transition-all duration-200" 
                      style={{ backgroundColor: 'rgba(15, 23, 42, 0.12)' }}
                      onClick={() => setIsNotificationsOpen(false)}
                    />
                    <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.15)] border border-slate-200/60 z-20 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ostatnie ({unreadNotificationsCount})</span>
                        {unreadNotificationsCount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkAllAsRead();
                            }}
                            className="text-[9px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                          >
                            Przeczytane wszystkie
                          </button>
                        )}
                      </div>
                      <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                        {unreadNotifications.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <Bell className="h-6 w-6 text-slate-200 mx-auto mb-1.5" />
                            <p className="text-xs font-semibold text-slate-400">Brak nowych powiadomień</p>
                          </div>
                        ) : (
                          unreadNotifications.map((n) => (
                            <div 
                              key={n.id} 
                              className="px-4 py-3 hover:bg-slate-50/80 border-b border-slate-100/60 last:border-0 transition-colors cursor-pointer group/notif"
                              onClick={() => {
                                onNotificationClick(n.order_id);
                                setIsNotificationsOpen(false);
                              }}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-bold text-purple-600">Zamówienie #{n.order_number}</span>
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {new Date(n.created_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onMarkAsRead(n.id);
                                    }}
                                    className="p-1 hover:bg-purple-50 rounded-lg text-slate-400 hover:text-purple-600 transition-all cursor-pointer flex items-center justify-center border border-transparent"
                                    title="Oznacz jako przeczytane"
                                  >
                                    <Check className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs font-semibold text-slate-700 truncate" title={n.subject}>
                                {n.subject}
                              </p>
                              
                              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100/50">
                                <span className="text-[9px] text-slate-400 truncate max-w-[130px] italic">
                                  Od: {n.from_email}
                                </span>
                                <button
                                  className="text-[10px] font-bold text-purple-700 hover:text-purple-900 flex items-center bg-purple-50 group-hover/notif:bg-purple-100/70 px-2.5 py-1 rounded-lg transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onNotificationClick(n.order_id);
                                    setIsNotificationsOpen(false);
                                  }}
                                >
                                  Zobacz historię <ChevronRight className="h-3 w-3 ml-0.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                        <p className="text-[9px] text-center font-medium text-slate-400">Kliknij w powiadomienie lub przycisk powyżej</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <div className="h-[38px] w-[38px] bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm text-slate-500">
                  <User className="h-4 w-4" />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};
