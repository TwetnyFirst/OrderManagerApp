import React from 'react';
import type { Order } from '../types';
import { formatDate, formatCurrency, cn } from '../lib/utils';
import { FileText, Trash2, Truck, Box, Mail, ExternalLink, ChevronRight } from 'lucide-react';

interface OrderTableProps {
  orders: Order[];
  onGenerateDPD: (order: Order, pkgCount: number) => void;
  onGenerateAPaczka: (order: Order) => void;
  onDeleteShipment: (id: number) => void;
  onUpdateOrder: (id: number, data: any) => void;
  onOpenEmail: (order: Order) => void;
  isGenerating: Record<number, boolean>;
}

export const OrderTable: React.FC<OrderTableProps> = ({
  orders,
  onGenerateDPD,
  onGenerateAPaczka,
  onDeleteShipment,
  onUpdateOrder,
  onOpenEmail,
  isGenerating,
}) => {
  return (
    <div className="overflow-hidden bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 border-collapse">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Zamówienie</th>
              <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Klient</th>
              <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Adres / Dostawa</th>
              <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Metoda / Płatność</th>
              <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Paczki / Kod</th>
              <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Etykiety</th>
              <th className="px-5 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Akcje</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {orders.map((order) => {
              const isPaczkomat = order.delivery_method?.toLowerCase().includes('paczkomat');
              const isCod = order.payment_method?.toLowerCase().includes('pobranie') || order.payment_method?.toLowerCase().includes('cod');
              const hasLabels = order.shipments.length > 0;
              
              return (
                <tr key={order.id} className={cn(
                  "group transition-all duration-200 hover:bg-slate-50/50",
                  hasLabels && "bg-emerald-50/10"
                )}>
                  <td className="px-5 py-5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-900 leading-tight">#{order.order_number}</span>
                      <span className="text-[11px] font-medium text-slate-400 mt-1">{formatDate(order.created_at)}</span>
                      <div className="mt-2">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset",
                          order.status === 'Label Created' 
                            ? "bg-emerald-100 text-emerald-700 ring-emerald-600/20" 
                            : "bg-blue-100 text-blue-700 ring-blue-600/20"
                        )}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-5">
                    <div className="flex flex-col max-w-[180px]">
                      <span className="text-sm font-bold text-slate-800 truncate" title={order.customer_name}>{order.customer_name}</span>
                      <span className="text-xs text-slate-500 truncate mt-0.5">{order.email}</span>
                      {order.nip && (
                        <span className="inline-flex items-center mt-1.5 text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded w-fit">
                          NIP: {order.nip}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-5 py-5">
                    <div className="flex flex-col text-xs font-medium text-slate-600 space-y-1">
                      <div className="flex items-center text-slate-900 font-bold">
                        <span className="truncate">{order.street}</span>
                      </div>
                      <span className="text-slate-500">{order.zip_code} {order.city}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate max-w-[140px]">
                        {order.delivery_method}
                      </span>
                    </div>
                  </td>

                  <td className="px-5 py-5">
                    <div className="flex flex-col space-y-2">
                      <span className={cn(
                        "inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black uppercase w-fit tracking-tighter",
                        isCod ? "bg-amber-100 text-amber-700 ring-1 ring-amber-600/20" : "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-600/20"
                      )}>
                        {order.payment_method}
                      </span>
                      {isCod ? (
                        <span className="text-sm font-black text-rose-600 tabular-nums">
                          {formatCurrency(order.total_price)}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 tabular-nums">
                          {formatCurrency(order.total_price)}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-5 py-5">
                    <div className="flex flex-col space-y-2">
                      {isPaczkomat ? (
                        <div className="flex flex-col space-y-1.5">
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              className="w-16 px-2 py-1 text-[11px] font-bold border border-slate-200 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm transition-all"
                              defaultValue={order.paczkomat_id || ''}
                              onBlur={(e) => onUpdateOrder(order.id, { paczkomat_id: e.target.value })}
                              placeholder="KOD"
                            />
                            <select
                              className="px-1 py-1 text-[11px] font-bold border border-slate-200 rounded-md focus:ring-2 focus:ring-primary-500 bg-white shadow-sm"
                              defaultValue={order.parcel_size || 'C'}
                              onChange={(e) => onUpdateOrder(order.id, { parcel_size: e.target.value })}
                            >
                              <option value="A">A</option>
                              <option value="B">B</option>
                              <option value="C">C</option>
                            </select>
                          </div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">InPost API</span>
                        </div>
                      ) : (
                        <div className="relative group/sel">
                          <select
                            id={`pkg-${order.id}`}
                            className="w-full px-2 py-1 text-[11px] font-bold border border-slate-200 rounded-md focus:ring-2 focus:ring-primary-500 bg-white shadow-sm cursor-pointer appearance-none pr-6"
                            defaultValue={order.packages_count || 1}
                          >
                            <option value="1">1 PACZKA</option>
                            <option value="2">2 PACZKI</option>
                            <option value="3">3 PACZKI</option>
                          </select>
                          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
                             <ChevronRight className="h-3 w-3 rotate-90" />
                          </div>
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-5 py-5">
                    <div className="flex flex-col space-y-1.5 min-w-[120px]">
                      {order.shipments.map((s) => (
                        <div key={s.id} className="group/item flex items-center justify-between bg-slate-100 hover:bg-primary-50 px-2 py-1 rounded-lg border border-slate-200 transition-colors">
                          <a
                            href={s.label_path}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-black font-mono text-primary-700 hover:text-primary-900 truncate mr-2 flex items-center"
                          >
                            {s.waybill}
                            <ExternalLink className="h-2.5 w-2.5 ml-1 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                          </a>
                          <button
                            onClick={() => onDeleteShipment(s.id)}
                            className="text-slate-400 hover:text-rose-500 transition-all active:scale-90"
                            title="Usuń etykietę"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {order.shipments.length === 0 && (
                        <span className="text-[10px] font-bold text-slate-300 italic tracking-wide uppercase">Brak etykiet</span>
                      )}
                    </div>
                  </td>

                  <td className="px-5 py-5 text-right whitespace-nowrap">
                    <div className="flex flex-col space-y-2 items-end">
                      <div className="flex space-x-1.5">
                        <button
                          onClick={() => onOpenEmail(order)}
                          className="inline-flex items-center px-3 py-1.5 bg-slate-100 hover:bg-primary-100 text-slate-700 hover:text-primary-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-all active:scale-95"
                        >
                          <Mail className="h-3.5 w-3.5 mr-1.5" />
                          EMAIL
                        </button>
                        
                        {order.shipments.length > 0 && (
                          <a
                            href={order.shipments[0].label_path}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg border border-emerald-200 transition-all active:scale-95 shadow-sm shadow-emerald-600/10"
                            title="Pobierz PDF"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        )}
                      </div>

                      {isPaczkomat ? (
                        <button
                          onClick={() => onGenerateAPaczka(order)}
                          disabled={isGenerating[order.id]}
                          className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-[11px] font-black rounded-lg shadow-lg shadow-amber-500/20 text-white bg-amber-500 hover:bg-amber-600 transition-all active:scale-[0.98] disabled:opacity-50 tracking-wider"
                        >
                          <Box className={cn("h-4 w-4 mr-2", isGenerating[order.id] && "animate-pulse")} />
                          APaczka (InPost)
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const pkgSelect = document.getElementById(`pkg-${order.id}`) as HTMLSelectElement;
                            onGenerateDPD(order, parseInt(pkgSelect?.value || '1'));
                          }}
                          disabled={isGenerating[order.id]}
                          className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-[11px] font-black rounded-lg shadow-lg shadow-primary-600/20 text-white bg-primary-600 hover:bg-primary-700 transition-all active:scale-[0.98] disabled:opacity-50 tracking-wider"
                        >
                          <Truck className={cn("h-4 w-4 mr-2", isGenerating[order.id] && "animate-pulse")} />
                          GENERUJ DPD
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white">
          <div className="p-4 bg-slate-50 rounded-full mb-4">
            <Box className="h-10 w-10 text-slate-300" />
          </div>
          <p className="text-slate-500 font-bold tracking-tight">Nie znaleziono żadnych zamówień</p>
          <p className="text-slate-400 text-xs mt-1">Zmień filtry lub słowo kluczowe</p>
        </div>
      )}
    </div>
  );
};
