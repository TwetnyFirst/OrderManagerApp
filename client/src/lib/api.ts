import axios from 'axios';
import type { OrdersResponse, Order, Sender } from '../types';

const api = axios.create({
  baseURL: '/api',
});

export const getOrders = async (page: number, limit: number, source: string, search?: string) => {
  const { data } = await api.get<OrdersResponse>('/orders', {
    params: { page, limit, source, search },
  });
  return data;
};

export const getSenders = async () => {
  const { data } = await api.get<Sender[]>('/senders');
  return data;
};

export const syncPrestaShop = async () => {
  const { data } = await api.post('/sync-prestashop');
  return data;
};

export const syncEmail = async () => {
  const { data } = await api.post('/sync-email');
  return data;
};

export const generateDPDLabel = async (orderId: number, senderId: number, packageCount: number) => {
  const { data } = await api.post(`/generate-label/${orderId}`, {
    senderId,
    packageCount,
  });
  return data;
};

export const generateAPaczkaLabel = async (orderId: number, senderFid: string) => {
  const { data } = await api.post(`/generate-apaczka-label/${orderId}`, {
    senderFid,
  });
  return data;
};

export const updateOrder = async (orderId: number, payload: Partial<Order>) => {
  const { data } = await api.post(`/update-order/${orderId}`, payload);
  return data;
};

export const deleteShipment = async (shipmentId: number) => {
  const { data } = await api.delete(`/shipments/${shipmentId}`);
  return data;
};

export default api;
