import React from 'react';
import type { Order, Sender, OrderItem } from '../types';
import { formatDate, formatCurrency, cn } from '../lib/utils';
import { ChevronRight, Mail, Trash2, Package, FileText } from 'lucide-react';
import { getOrderItems } from '../lib/api';

interface OrderTableProps {
  orders: Order[];
  senders: Sender[];
  orderSenders: Record<number, number>;
  onOrderSenderChange: (orderId: number, senderId: number) => void;
  onGenerateDPD: (order: Order, senderId: number, pkgCount: number) => void;
  onGenerateAPaczka: (order: Order, senderId: number) => void;
  onDeleteShipment: (id: number) => void;
  onUpdateOrder: (id: number, data: any) => void;
  onOpenEmail: (order: Order) => void;
  isGenerating: Record<number, boolean>;
}

export const OrderTable: React.FC<OrderTableProps> = ({
  orders,
  senders,
  orderSenders,
  onOrderSenderChange,
  onGenerateDPD,
  onGenerateAPaczka,
  onDeleteShipment,
  onUpdateOrder,
  onOpenEmail,
  isGenerating,
}) => {
  const [expandedIds, setExpandedIds] = React.useState<Record<number, boolean>>({});
  const [orderItems, setOrderItems] = React.useState<Record<number, OrderItem[]>>({});
  const [loadingIds, setLoadingIds] = React.useState<Record<number, boolean>>({});

  const handleToggleExpand = async (orderId: number) => {
    const isExpanding = !expandedIds[orderId];
    setExpandedIds(prev => ({ ...prev, [orderId]: isExpanding }));

    if (isExpanding && !orderItems[orderId]) {
      setLoadingIds(prev => ({ ...prev, [orderId]: true }));
      try {
        const items = await getOrderItems(orderId);
        setOrderItems(prev => ({ ...prev, [orderId]: items }));
      } catch (err) {
        console.error('Failed to load items:', err);
      } finally {
        setLoadingIds(prev => ({ ...prev, [orderId]: false }));
      }
    }
  };
  return (
    <div className="overflow-x-auto w-full">
      <table className="orders-table">
        <thead>
          <tr>
            <th style={{ width: '10%' }}>Заказ</th>
            <th style={{ width: '10%' }}>Статус</th>
            <th style={{ width: '18%' }}>Клиент</th>
            <th style={{ width: '22%' }}>Адрес доставки</th>
            <th style={{ width: '12%' }}>Оплата</th>
            <th style={{ width: '28%' }}>Этикетка / Действия</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const isPaczkomat = order.delivery_method?.toLowerCase().includes('paczkomat');
            const isCod = order.payment_method?.toLowerCase().includes('pobranie') || order.payment_method?.toLowerCase().includes('cod');
            const isExpanded = !!expandedIds[order.id];
            const items = orderItems[order.id] || [];
            const isLoadingItems = !!loadingIds[order.id];
            
            return (
              <React.Fragment key={order.id}>
                <tr className={cn("order-row", isExpanded && "is-expanded")}>
                  {/* Заказ */}
                  <td>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleExpand(order.id)}
                        className="p-1 hover:bg-purple-50 rounded-lg text-slate-405 hover:text-purple-600 transition-colors cursor-pointer flex items-center justify-center flex-shrink-0"
                        title="Pokaż szczegóły zamówienia"
                      >
                        <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-90 text-purple-600")} />
                      </button>
                      <div>
                        <div className="flex items-center space-x-1">
                          <div className="order-id">#{order.order_number}</div>
                          {order.unread_notifications && order.unread_notifications > 0 ? (
                            <span className="flex h-1.5 w-1.5 relative mb-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                            </span>
                          ) : null}
                        </div>
                        <div className="order-date">{formatDate(order.created_at)}</div>
                      </div>
                    </div>
                  </td>

                  {/* Статус */}
                  <td>
                    <span className={cn(
                      "status-badge",
                      order.status === 'Label Created' ? "status-ready" : "status-new"
                    )}>
                      {order.status === 'Label Created' ? 'Готов к отправке' : 'Новый'}
                    </span>
                  </td>

                  {/* Клиент */}
                  <td>
                    <div className="client-name">{order.customer_name}</div>
                    <div className="client-email truncate max-w-[180px]" title={order.email}>{order.email}</div>
                    {order.nip && order.nip !== 'Paragon' && (
                      <div className="client-nip">NIP: {order.nip}</div>
                    )}
                  </td>

                  {/* Адрес доставки */}
                  <td>
                    <div className="address-text">
                      {order.street}<br />
                      {order.zip_code} {order.city}
                    </div>
                    {isPaczkomat ? (
                      <span className="courier-tag paczkomat-tag">
                        INPOST PACZKOMAT
                      </span>
                    ) : (
                      <span className="courier-tag">
                        KURIER DPD
                      </span>
                    )}
                  </td>

                  {/* Оплата */}
                  <td>
                    <div className="price-amount">{formatCurrency(order.total_price)}</div>
                    <span className={cn(
                      "payment-method",
                      isCod && "text-[#9a3412] bg-[#fff7ed] border-[#ffedd5]"
                    )}>
                      {isCod ? 'Pobranie' : 'Predpłata'}
                    </span>
                  </td>

                  {/* Этикетка / Действия */}
                  <td>
                    <div className="flex flex-col gap-2">
                      {/* List of existing shipments */}
                      {order.shipments && order.shipments.length > 0 && (
                        <div className="flex flex-col gap-1 border-b border-slate-100 pb-1.5">
                          {order.shipments.map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-1 bg-purple-50/50 border border-purple-100/30 p-1 px-2 rounded-lg">
                              <a 
                                href={s.label_path} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span className="capitalize">{s.provider}:</span> {s.waybill.slice(0, 8)}...
                              </a>
                              <button 
                                onClick={() => onDeleteShipment(s.id)} 
                                className="text-slate-400 hover:text-rose-600 transition-colors p-0.5" 
                                title="Usuń"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sender Selector and Contact Button */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider min-w-[50px]">Nadawca:</span>
                          <div className="relative flex-1">
                            <select
                              value={orderSenders[order.id] || (senders[0]?.id || '')}
                              onChange={(e) => onOrderSenderChange(order.id, Number(e.target.value))}
                              className="input-field w-full pl-2 pr-7 text-[11px] bg-white cursor-pointer appearance-none font-semibold text-slate-700 border-[#e2e8f0] h-[34px] py-0"
                            >
                              <option value="" disabled>Wybierz nadawcę</option>
                              {senders.map((sender) => (
                                <option key={sender.id} value={sender.id}>
                                  {sender.company || sender.name}
                                </option>
                              ))}
                            </select>
                            <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
                              <ChevronRight className="h-3 w-3 rotate-90" />
                            </div>
                          </div>
                          <button 
                            onClick={() => onOpenEmail(order)} 
                            className="btn btn-secondary h-[34px] w-[34px] p-0 flex items-center justify-center" 
                            title="Kontakt"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* InPost / DPD Controls and Trigger button */}
                        {isPaczkomat ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              className="input-field w-12 text-center text-xs h-[34px] p-0"
                              defaultValue={order.paczkomat_id || ''}
                              onBlur={(e) => onUpdateOrder(order.id, { paczkomat_id: e.target.value })}
                              placeholder="KOD"
                            />
                            <div className="relative">
                              <select
                                className="input-field pl-2 pr-6 text-xs bg-white cursor-pointer appearance-none font-semibold text-slate-700 h-[34px] py-0"
                                defaultValue={order.parcel_size || 'C'}
                                onChange={(e) => onUpdateOrder(order.id, { parcel_size: e.target.value })}
                              >
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                              </select>
                              <div className="absolute inset-y-0 right-1.5 flex items-center pointer-events-none text-slate-400">
                                <ChevronRight className="h-3 w-3 rotate-90" />
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                const activeSenderId = orderSenders[order.id] || senders[0]?.id;
                                if (activeSenderId) onGenerateAPaczka(order, activeSenderId);
                              }} 
                              disabled={isGenerating[order.id] || (!orderSenders[order.id] && !senders[0]?.id)} 
                              className="btn btn-primary paczkomat-btn h-[34px] py-0 px-2 flex-1 justify-center text-xs font-bold"
                            >
                              <Package className="h-3.5 w-3.5" />
                              InPost
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <select
                                id={`pkg-${order.id}`}
                                className="input-field bg-white cursor-pointer pl-2 pr-6 text-xs appearance-none font-semibold text-slate-700 h-[34px] py-0"
                                defaultValue={order.packages_count || 1}
                              >
                                <option value="1">1 Paczka</option>
                                <option value="2">2 Paczki</option>
                                <option value="3">3 Paczki</option>
                              </select>
                              <div className="absolute inset-y-0 right-1.5 flex items-center pointer-events-none text-slate-400">
                                <ChevronRight className="h-3 w-3 rotate-90" />
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                const activeSenderId = orderSenders[order.id] || senders[0]?.id;
                                const pkgSelect = document.getElementById(`pkg-${order.id}`) as HTMLSelectElement;
                                if (activeSenderId) {
                                  onGenerateDPD(order, activeSenderId, parseInt(pkgSelect?.value || '1'));
                                }
                              }} 
                              disabled={isGenerating[order.id] || (!orderSenders[order.id] && !senders[0]?.id)} 
                              className="btn btn-primary h-[34px] py-0 px-2 flex-1 justify-center text-xs font-bold"
                            >
                              <Package className="h-3.5 w-3.5" />
                              DPD
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="details-row bg-slate-50/10">
                    <td colSpan={6} className="px-4 pb-4 pt-1.5 border-t-0">
                      <div className="bg-[#f8fafc] border border-slate-200/50 rounded-2xl p-5 shadow-inner animate-in fade-in slide-in-from-top-1 duration-200 text-left">
                        <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-200/40">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            📦 Szczegóły zamówienia #{order.order_number}
                          </h4>
                          <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full">
                            {isLoadingItems ? 'Pobieranie...' : `${items.length} pozycji`}
                          </span>
                        </div>
                        {isLoadingItems ? (
                          <div className="flex items-center space-x-2 py-6 justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent"></div>
                            <span className="text-xs font-semibold text-slate-400">Pobieranie produktów...</span>
                          </div>
                        ) : items.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-400 italic font-medium">
                            Brak szczegółowych danych o produktach dla tego zamówienia
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200/60 text-slate-400 font-bold">
                                  <th className="pb-2 font-bold text-[11px] uppercase tracking-wider" style={{ width: '45%' }}>Nazwa produktu</th>
                                  <th className="pb-2 font-bold text-[11px] uppercase tracking-wider" style={{ width: '20%' }}>Symbol</th>
                                  <th className="pb-2 text-right font-bold text-[11px] uppercase tracking-wider" style={{ width: '12%' }}>Cena</th>
                                  <th className="pb-2 text-center font-bold text-[11px] uppercase tracking-wider" style={{ width: '10%' }}>Ilość</th>
                                  <th className="pb-2 text-right font-bold text-[11px] uppercase tracking-wider" style={{ width: '13%' }}>Wartość</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, idx) => (
                                  <tr key={idx} className="border-b border-slate-100/50 last:border-0 hover:bg-slate-100/20 transition-colors">
                                    <td className="py-2.5 font-semibold text-slate-700 pr-4">{item.name}</td>
                                    <td className="py-2.5 font-mono text-[11px] text-slate-500 font-bold">{item.reference || '-'}</td>
                                    <td className="py-2.5 text-right font-medium text-slate-600">{formatCurrency(item.price)}</td>
                                    <td className="py-2.5 text-center"><span className="font-bold text-slate-750 bg-slate-150 px-2 py-0.5 rounded">{item.quantity}</span></td>
                                    <td className="py-2.5 text-right font-bold text-slate-900">{formatCurrency(item.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="mt-4 pt-3.5 border-t border-slate-200/60 flex justify-end items-center gap-3">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Suma całkowita:</span>
                              <span className="text-[16px] font-black text-purple-700 bg-purple-50 border border-purple-100/50 px-3.5 py-1 rounded-xl shadow-sm">
                                {formatCurrency(order.total_price)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-slate-100 rounded-xl mt-4">
          <p className="text-slate-500 text-xs font-semibold">Brak zamówień</p>
          <p className="text-slate-450 text-[10px] mt-0.5">Zmień słowo kluczowe wyszukiwania</p>
        </div>
      )}
    </div>
  );
};
