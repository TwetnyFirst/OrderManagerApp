import React from 'react';
import type { Order } from '../types';
import { formatDate, formatCurrency, cn } from '../lib/utils';
import { FileText, Trash2, Truck, Box } from 'lucide-react';

interface OrderTableProps {
  orders: Order[];
  onGenerateDPD: (order: Order, pkgCount: number) => void;
  onGenerateAPaczka: (order: Order) => void;
  onDeleteShipment: (id: number) => void;
  onUpdateOrder: (id: number, data: any) => void;
  isGenerating: Record<number, boolean>;
}

export const OrderTable: React.FC<OrderTableProps> = ({
  orders,
  onGenerateDPD,
  onGenerateAPaczka,
  onDeleteShipment,
  onUpdateOrder,
  isGenerating,
}) => {
  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zamówienie</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Klient</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adres</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dostawa / Płatność</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">InPost / Paczki</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etykiety</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {orders.map((order) => {
            const isPaczkomat = order.delivery_method?.toLowerCase().includes('paczkomat');
            const isCod = order.payment_method?.toLowerCase().includes('pobranie') || order.payment_method?.toLowerCase().includes('cod');
            
            return (
              <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900">{order.order_number}</div>
                  <div className="text-xs text-gray-500">{formatDate(order.created_at)}</div>
                  <div className="mt-1">
                    <span className={cn(
                      "px-2 inline-flex text-xs leading-5 font-semibold rounded-full",
                      order.status === 'Label Created' ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
                    )}>
                      {order.status}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm font-medium text-gray-900">{order.customer_name}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[150px]">{order.email}</div>
                  {order.nip && <div className="text-xs text-gray-400 mt-1">NIP: {order.nip}</div>}
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-900">{order.street}</div>
                  <div className="text-sm text-gray-500">{order.zip_code} {order.city}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col space-y-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {order.delivery_method}
                    </span>
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      isCod ? "bg-amber-100 text-amber-800" : "bg-cyan-100 text-cyan-800"
                    )}>
                      {order.payment_method}
                    </span>
                    {isCod && (
                      <div className="text-sm font-bold text-red-600">
                        {formatCurrency(order.total_price)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  {isPaczkomat ? (
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500"
                          defaultValue={order.paczkomat_id || ''}
                          onBlur={(e) => onUpdateOrder(order.id, { paczkomat_id: e.target.value })}
                          placeholder="KOD"
                        />
                        <select
                          className="px-1 py-1 text-xs border border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500"
                          defaultValue={order.parcel_size || 'C'}
                          onChange={(e) => onUpdateOrder(order.id, { parcel_size: e.target.value })}
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <select
                      id={`pkg-${order.id}`}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500"
                      defaultValue={order.packages_count || 1}
                    >
                      <option value="1">1 paczka</option>
                      <option value="2">2 paczki</option>
                      <option value="3">3 paczki</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col space-y-1">
                    {order.shipments.map((s) => (
                      <div key={s.id} className="group flex items-center justify-between bg-gray-50 px-2 py-1 rounded border border-gray-200">
                        <a
                          href={s.label_path}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-mono font-bold text-primary-700 hover:underline truncate mr-2"
                        >
                          {s.waybill}
                        </a>
                        <button
                          onClick={() => onDeleteShipment(s.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {order.shipments.length === 0 && <span className="text-xs text-gray-400 italic">Brak etykiet</span>}
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex flex-col space-y-2 items-end">
                    {isPaczkomat ? (
                      <button
                        onClick={() => onGenerateAPaczka(order)}
                        disabled={isGenerating[order.id]}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-amber-500 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
                      >
                        <Box className={cn("h-3.5 w-3.5 mr-1", isGenerating[order.id] && "animate-pulse")} />
                        APaczka
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const pkgSelect = document.getElementById(`pkg-${order.id}`) as HTMLSelectElement;
                          onGenerateDPD(order, parseInt(pkgSelect?.value || '1'));
                        }}
                        disabled={isGenerating[order.id]}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <Truck className={cn("h-3.5 w-3.5 mr-1", isGenerating[order.id] && "animate-pulse")} />
                        DPD
                      </button>
                    )}
                    
                    <div className="flex space-x-1">
                      {order.shipments.map((s, idx) => (
                        <a
                          key={s.id}
                          href={s.label_path}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center p-1.5 border border-gray-300 rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none"
                          title={`Etykieta ${idx + 1}`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </a>
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
