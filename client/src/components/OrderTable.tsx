import React from 'react';
import type { Order } from '../types';
import { formatDate, formatCurrency, cn } from '../lib/utils';
import { ChevronRight, Mail, Trash2, Package, FileText } from 'lucide-react';

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
            
            return (
              <tr key={order.id} className="order-row">
                {/* Заказ */}
                <td>
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
                  <div className="actions-cell">
                    {order.shipments.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5">
                        <a 
                          href={s.label_path} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="tracking-link"
                        >
                          <FileText className="h-4 w-4" />
                          {s.waybill.slice(0, 10)}...
                        </a>
                        <button 
                          onClick={() => onDeleteShipment(s.id)} 
                          className="btn btn-danger" 
                          title="Usuń"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    {order.shipments.length === 0 && (
                      <>
                        <button 
                          onClick={() => onOpenEmail(order)} 
                          className="btn btn-secondary" 
                          title="Kontakt"
                        >
                          <Mail className="h-4 w-4" />
                        </button>

                        {isPaczkomat ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              className="input-field w-12 text-center text-xs"
                              defaultValue={order.paczkomat_id || ''}
                              onBlur={(e) => onUpdateOrder(order.id, { paczkomat_id: e.target.value })}
                              placeholder="KOD"
                            />
                            <div className="relative">
                              <select
                                className="input-field pl-2 pr-7 text-xs bg-white cursor-pointer appearance-none font-semibold text-slate-700"
                                defaultValue={order.parcel_size || 'C'}
                                onChange={(e) => onUpdateOrder(order.id, { parcel_size: e.target.value })}
                              >
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                              </select>
                              <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
                                <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                              </div>
                            </div>
                            <button 
                              onClick={() => onGenerateAPaczka(order)} 
                              disabled={isGenerating[order.id]} 
                              className="btn btn-primary paczkomat-btn"
                            >
                              <Package className="h-4 w-4" />
                              Generuj InPost
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <select
                                id={`pkg-${order.id}`}
                                className="input-field bg-white cursor-pointer pl-3 pr-7 text-xs appearance-none font-semibold text-slate-700"
                                defaultValue={order.packages_count || 1}
                              >
                                <option value="1">1 Paczka</option>
                                <option value="2">2 Paczki</option>
                                <option value="3">3 Paczki</option>
                              </select>
                              <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
                                <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                const pkgSelect = document.getElementById(`pkg-${order.id}`) as HTMLSelectElement;
                                onGenerateDPD(order, parseInt(pkgSelect?.value || '1'));
                              }} 
                              disabled={isGenerating[order.id]} 
                              className="btn btn-primary"
                            >
                              <Package className="h-4 w-4" />
                              Generuj DPD
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
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
