import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from './ui/Modal';
import type { Order, Sender } from '../types';
import { Mail, Send, User, ChevronRight, Info, History, MessageSquare } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { getOrderNotifications, markNotificationAsRead } from '../lib/api';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onSend: (data: any) => Promise<void>;
  selectedSender: Sender | null;
}

export const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  order,
  onSend,
  selectedSender,
}) => {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'templates' | 'history'>('templates');
  const [target, setTarget] = useState<'customer' | 'sender'>('customer');
  const [template, setTemplate] = useState<string>('missing_payment');
  const [productName, setProductName] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && order) {
      loadHistory();
      if (order.unread_notifications && order.unread_notifications > 0) {
        setView('history');
      } else {
        setView('templates');
      }
    }
  }, [isOpen, order?.id]);

  const loadHistory = async () => {
    if (!order) return;
    setIsLoadingHistory(true);
    try {
      const data = await getOrderNotifications(order.id);
      setNotifications(data);
      
      const unread = data.filter((n: any) => n.is_read === 0);
      if (unread.length > 0) {
        for (const n of unread) {
          await markNotificationAsRead(n.id);
        }
        // Refresh orders list to clear red dots
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  if (!order) return null;

  const handleSend = async () => {
    setIsSending(true);
    try {
      await onSend({
        orderId: order.id,
        target,
        template,
        productName: template === 'out_of_stock' ? productName : undefined,
        customSubject: template === 'custom' ? customSubject : undefined,
        customBody: template === 'custom' ? customBody : undefined,
        senderId: target === 'sender' ? selectedSender?.id : undefined,
      });
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Korespondencja: Zamówienie #${order.order_number}`}>
      <div className="space-y-5">
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setView('templates')}
            className={cn(
              "flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 border-b-2 transition-all duration-200 outline-none",
              view === 'templates' 
                ? "border-purple-600 text-purple-700" 
                : "border-transparent text-slate-400 hover:text-slate-700"
            )}
          >
            <Send className="h-4 w-4" />
            <span>Wyślij email</span>
          </button>
          <button
            onClick={() => setView('history')}
            className={cn(
              "flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 border-b-2 transition-all duration-200 relative outline-none",
              view === 'history' 
                ? "border-purple-600 text-purple-700" 
                : "border-transparent text-slate-400 hover:text-slate-700"
            )}
          >
            <History className="h-4 w-4" />
            <span>Odebrane / Historia</span>
            {order.unread_notifications && order.unread_notifications > 0 && view !== 'history' && (
              <span className="absolute top-2.5 right-6 h-2 w-2 bg-rose-500 rounded-full ring-2 ring-white animate-pulse" />
            )}
          </button>
        </div>

        {view === 'templates' ? (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Odbiorca</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/60 border border-slate-200/40 rounded-xl">
                <button
                  onClick={() => { setTarget('customer'); setTemplate('missing_payment'); }}
                  className={cn(
                    "flex items-center justify-center py-2.5 text-xs font-bold rounded-lg transition-all duration-200",
                    target === 'customer' 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" 
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                  )}
                >
                  <User className="h-4 w-4 mr-1.5" />
                  Klient ({order.customer_name})
                </button>
                <button
                  onClick={() => { setTarget('sender'); setTemplate('new_order'); }}
                  className={cn(
                    "flex items-center justify-center py-2.5 text-xs font-bold rounded-lg transition-all duration-200",
                    target === 'sender' 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" 
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                  )}
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Nadawca paczki
                </button>
              </div>
            </div>

            <div className="animate-in fade-in slide-in-from-top-1 duration-150">
              {target === 'customer' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Szablon wiadomości</label>
                    <div className="grid grid-cols-1 gap-2.5">
                      {[
                        { id: 'missing_payment', label: 'Brak wpłaty (Przypomnienie)', desc: 'Informacja o braku przelewu i prośba o potwierdzenie.' },
                        { id: 'out_of_stock', label: 'Brak towaru na stanie', desc: 'Powiadomienie o braku produktów u producenta (2-3 tyg).' },
                        { id: 'order_shipped', label: 'Powiadomienie o wysyłce', desc: 'Informacja o wysłaniu paczki wraz с numerem listu.' },
                        { id: 'custom', label: 'Własna treść wiadomości', desc: 'Napisz i wyślij niestandardową wiadomość email.' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setTemplate(t.id)}
                          className={cn(
                            "group flex items-start text-left px-4 py-3.5 border rounded-2xl transition-all duration-200",
                            template === t.id 
                              ? "border-purple-500 bg-purple-50/20 shadow-sm ring-1 ring-purple-500/15" 
                              : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/30"
                          )}
                        >
                          <div className="flex-1">
                            <div className={cn(
                              "text-xs font-semibold transition-colors duration-250",
                              template === t.id ? "text-purple-900 font-bold" : "text-slate-800"
                            )}>
                              {t.label}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{t.desc}</div>
                          </div>
                          <ChevronRight className={cn("h-4 w-4 mt-1 transition-transform group-hover:translate-x-0.5", template === t.id ? "text-purple-600" : "text-slate-350")} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {template === 'out_of_stock' && (
                    <div className="space-y-2 pt-2 border-t border-slate-50 animate-in slide-in-from-top-2 duration-150">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nazwa brakującego towaru</label>
                      <input
                        type="text"
                        placeholder="np. Zawór termostatyczny Danfoss..."
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 outline-none transition-all font-medium placeholder-slate-400"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                      />
                    </div>
                  )}

                  {template === 'custom' && (
                    <div className="space-y-3 pt-2 border-t border-slate-50 animate-in slide-in-from-top-2 duration-150">
                      <div>
                        <input
                          type="text"
                          placeholder="Temat wiadomości"
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 outline-none transition-all font-medium placeholder-slate-400"
                          value={customSubject}
                          onChange={(e) => setCustomSubject(e.target.value)}
                        />
                      </div>
                      <div>
                        <textarea
                          placeholder="Treść Twojej wiadomości..."
                          rows={4}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 outline-none resize-none transition-all font-medium placeholder-slate-400"
                          value={customBody}
                          onChange={(e) => setCustomBody(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 flex items-start space-x-3.5">
                  <div className="p-1.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-655">
                    <Info className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 mb-0.5">Zlecenie wysyłki do nadawcy</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Zostanie wysłana wiadomość z prośbą o spakowanie paczki na poniższy adres e-mail:
                    </p>
                    <div className="mt-2.5 px-3 py-1 bg-white border border-slate-200/60 rounded-md w-fit text-[11px] font-semibold text-slate-700">
                      {selectedSender?.email || 'Brak skonfigurowanego adresu e-mail'}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="pt-4 flex items-center space-x-2.5 border-t border-slate-100">
              <button
                onClick={onClose}
                className="btn btn-secondary bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-bold text-xs h-[38px] px-5 flex items-center justify-center transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSend}
                disabled={isSending || (target === 'sender' && !selectedSender?.email)}
                className="flex-1 inline-flex items-center justify-center px-4 h-[38px] bg-[#fec22a] hover:bg-[#e5af22] text-[#452a00] rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-900/20 border-t-amber-950 mr-1.5" />
                    Wysyłanie...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-1.5" />
                    Wyślij e-mail
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar animate-in fade-in duration-150">
            {isLoadingHistory ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-800"></div>
                <p className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ładowanie historii...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-slate-50 border border-slate-100 rounded-2xl">
                <MessageSquare className="h-6 w-6 text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-400">Brak historii korespondencji</p>
                <p className="text-[10px] text-slate-350 mt-0.5">Wszystkie e-maile i odpowiedzi pojawią się tutaj</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div 
                  key={n.id} 
                  className={cn(
                    "p-4 rounded-2xl border transition-all duration-200 shadow-sm",
                    n.type === 'REPLY' 
                      ? "bg-purple-50/30 border-purple-100 ml-6 rounded-tl-none" 
                      : "bg-slate-50/50 border-slate-200/80 mr-6 rounded-tr-none"
                  )}
                >
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100/50">
                    <div className="flex items-center space-x-2">
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md",
                        n.type === 'REPLY' ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"
                      )}>
                        {n.type === 'REPLY' ? 'Odebrana' : 'Wysłana'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">{formatDate(n.created_at)}</span>
                    </div>
                    {n.is_read === 0 && <span className="h-2 w-2 bg-rose-500 rounded-full animate-pulse" />}
                  </div>
                  <div className="text-xs font-bold text-slate-800 mb-1.5">{n.subject}</div>
                  <div className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed bg-white/80 p-3.5 border border-slate-100/60 rounded-xl">
                    {n.body}
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400 italic">
                    Nadawca: {n.from_email}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
