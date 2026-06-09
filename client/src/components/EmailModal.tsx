import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import type { Order, Sender } from '../types';
import { Mail, Send, User, ChevronRight, Info } from 'lucide-react';
import { cn } from '../lib/utils';

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
  const [target, setTarget] = useState<'customer' | 'sender'>('customer');
  const [template, setTemplate] = useState<string>('missing_payment');
  const [productName, setProductName] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [isSending, setIsSending] = useState(false);

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
    <Modal isOpen={isOpen} onClose={onClose} title="Panel Komunikacji">
      <div className="space-y-6">
        {/* Recipient Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Odbiorca wiadomości</label>
          <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => { setTarget('customer'); setTemplate('missing_payment'); }}
              className={cn(
                "flex items-center justify-center py-2.5 text-sm font-semibold rounded-lg transition-all",
                target === 'customer' 
                  ? "bg-white text-primary-600 shadow-sm ring-1 ring-slate-200" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
              )}
            >
              <User className="h-4 w-4 mr-2" />
              Klient
            </button>
            <button
              onClick={() => { setTarget('sender'); setTemplate('new_order'); }}
              className={cn(
                "flex items-center justify-center py-2.5 text-sm font-semibold rounded-lg transition-all",
                target === 'sender' 
                  ? "bg-white text-primary-600 shadow-sm ring-1 ring-slate-200" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
              )}
            >
              <Send className="h-4 w-4 mr-2" />
              Nadawca
            </button>
          </div>
        </div>

        {/* Dynamic Content */}
        <div className="animate-in fade-in slide-in-from-top-1 duration-300">
          {target === 'customer' ? (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Wybierz gotowy szablon</label>
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { id: 'missing_payment', label: 'Brak wpłaty (Przypomnienie)', desc: 'Prośba o przesłanie potwierdzenia przelewu' },
                    { id: 'out_of_stock', label: 'Brak towaru na stanie', desc: 'Informacja o czasie oczekiwania (2-3 tyg)' },
                    { id: 'order_shipped', label: 'Powiadomienie o wysyłce', desc: 'Informacja z numerem listu przewozowego' },
                    { id: 'custom', label: 'Własna treść wiadomości', desc: 'Napisz wiadomość od podstaw' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTemplate(t.id)}
                      className={cn(
                        "group flex items-start text-left px-4 py-3 border-2 rounded-xl transition-all",
                        template === t.id 
                          ? "border-primary-500 bg-primary-50/50 shadow-sm ring-4 ring-primary-500/10" 
                          : "border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white"
                      )}
                    >
                      <div className="flex-1">
                        <div className={cn("text-sm font-bold mb-0.5", template === t.id ? "text-primary-900" : "text-slate-700")}>
                          {t.label}
                        </div>
                        <div className="text-xs text-slate-500 leading-relaxed">{t.desc}</div>
                      </div>
                      <ChevronRight className={cn("h-5 w-5 mt-1 transition-transform group-hover:translate-x-1", template === t.id ? "text-primary-500" : "text-slate-300")} />
                    </button>
                  ))}
                </div>
              </div>

              {template === 'out_of_stock' && (
                <div className="space-y-3 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest">Nazwa brakującego towaru</label>
                  <input
                    type="text"
                    placeholder="np. Zawór termostatyczny Danfoss..."
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 transition-all outline-none"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>
              )}

              {template === 'custom' && (
                <div className="space-y-4 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">
                  <div>
                    <input
                      type="text"
                      placeholder="Temat wiadomości"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all outline-none"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <textarea
                      placeholder="Treść Twojej wiadomości..."
                      rows={5}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all outline-none resize-none"
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 flex items-start space-x-4">
              <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-900 mb-1">Informacja dla nadawcy</h4>
                <p className="text-sm text-indigo-700 leading-relaxed mb-3">
                  Wiadomość z prośbą o przygotowanie paczki zostanie wysłana na adres:
                </p>
                <div className="inline-flex items-center px-3 py-1 bg-white border border-indigo-200 rounded-lg shadow-sm">
                  <span className="text-xs font-bold text-indigo-900 truncate max-w-[250px]">
                    {selectedSender?.email || '⚠️ BRAK ADRESU EMAIL'}
                  </span>
                </div>
                {!selectedSender?.email && (
                  <p className="text-[10px] text-red-500 font-bold mt-2 uppercase tracking-tight">
                    * Uzupełnij kolumnę Email w pliku Senders.xlsx
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-6 flex items-center space-x-3 border-t border-slate-50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            Anuluj
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || (target === 'sender' && !selectedSender?.email)}
            className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl shadow-lg shadow-primary-500/30 text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white mr-2" />
                Przetwarzanie...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Wyślij teraz
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
