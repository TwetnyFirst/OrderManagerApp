import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Toaster, toast } from 'react-hot-toast';
import { 
  getOrders, 
  getSenders, 
  syncPrestaShop, 
  syncEmail,
  generateDPDLabel, 
  generateAPaczkaLabel, 
  deleteShipment, 
  updateOrder,
  sendEmail,
  getUnreadNotifications,
  getOrderById
} from './lib/api';
import { Header } from './components/Header';
import { OrderTable } from './components/OrderTable';
import { EmailModal } from './components/EmailModal';
import { ShoppingBag, Mail, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './lib/utils';
import type { Order, Sender, OrdersResponse } from './types';

function App() {
  const queryClient = useQueryClient();
  const [source, setSource] = useState<'Email' | 'PrestaShop'>('Email');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Record<number, boolean>>({});
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const limit = 50;

  // Queries
  const { data: unreadNotifications = [] } = useQuery({
    queryKey: ['unread-notifications'],
    queryFn: getUnreadNotifications,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: senders = [] } = useQuery<Sender[]>({
    queryKey: ['senders'],
    queryFn: getSenders,
  });

  // Set initial sender
  useEffect(() => {
    if (senders.length > 0 && !selectedSenderId) {
      setSelectedSenderId(senders[0].id);
    }
  }, [senders, selectedSenderId]);

  const { data: ordersData, isLoading, isFetching } = useQuery<OrdersResponse>({
    queryKey: ['orders', source, page, search],
    queryFn: () => getOrders(page, limit, source, search),
    placeholderData: (previousData) => previousData,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Mutations
  const syncMutation = useMutation({
    mutationFn: syncPrestaShop,
    onSuccess: () => {
      toast.success('Zsynchronizowano zamówienia PrestaShop');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => toast.error(`Błąd synchronizacji: ${error.message}`),
  });

  const syncEmailMutation = useMutation({
    mutationFn: syncEmail,
    onSuccess: (data: any) => {
      toast.success(`Zsynchronizowano Email. Dodano ${data.count} nowych zamówień.`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => toast.error(`Błąd synchronizacji Email: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteShipment,
    onSuccess: () => {
      toast.success('Etykieta została usunięta');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => toast.error(`Błąd usuwania: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateOrder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const generateDPD = async (orderId: number, packageCount: number) => {
    if (!selectedSenderId) return toast.error('Wybierz nadawcę в nagłówku!');
    
    setGeneratingIds(prev => ({ ...prev, [orderId]: true }));
    try {
      await generateDPDLabel(orderId, selectedSenderId, packageCount);
      toast.success(`Wygenerowano etykietę DPD dla zamówienia #${orderId}`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      toast.error(`Błąd DPD: ${error.response?.data?.error || error.message}`);
    } finally {
      setGeneratingIds(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const generateAPaczka = async (orderId: number) => {
    if (!selectedSenderId) return toast.error('Wybierz nadawcę в nagłówku!');
    const sender = senders.find((s: Sender) => s.id === selectedSenderId);
    if (!sender) return;

    setGeneratingIds(prev => ({ ...prev, [orderId]: true }));
    try {
      await generateAPaczkaLabel(orderId, sender.fid);
      toast.success(`Wygenerowano etykietę APaczka dla zamówienia #${orderId}`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      toast.error(`Błąd APaczka: ${error.response?.data?.error || error.message}`);
    } finally {
      setGeneratingIds(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handleSendEmail = async (data: any) => {
    try {
      await sendEmail(data);
      toast.success('Wiadomość została wysłana');
    } catch (error: any) {
      toast.error(`Błąd wysyłania email: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleOpenEmailHistoryForOrderId = async (orderId: number) => {
    try {
      let order = ordersData?.orders.find(o => o.id === orderId);
      if (!order) {
        order = await getOrderById(orderId);
      }
      if (order) {
        setSelectedOrder(order);
        setIsEmailModalOpen(true);
      }
    } catch (err) {
      toast.error('Nie udało się załadować danych zamówienia');
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (ordersData?.totalPages || 1)) {
      setPage(newPage);
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col">
      <Toaster position="top-right" />
      
      <EmailModal 
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        order={selectedOrder}
        onSend={handleSendEmail}
        selectedSender={senders.find(s => s.id === selectedSenderId) || null}
      />

      <Header 
        senders={senders}
        selectedSenderId={selectedSenderId}
        onSenderChange={setSelectedSenderId}
        onSync={() => {
          if (source === 'PrestaShop') syncMutation.mutate();
          else syncEmailMutation.mutate();
        }}
        isSyncing={syncMutation.isPending || syncEmailMutation.isPending}
        showSync={true}
        search={search}
        onSearchChange={(val) => { setSearch(val); setPage(1); }}
        currentSource={source}
        unreadNotifications={unreadNotifications}
        onNotificationClick={handleOpenEmailHistoryForOrderId}
      />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 border-b border-slate-100">
          <nav className="-mb-px flex space-x-10">
            <button
              onClick={() => { setSource('Email'); setPage(1); }}
              className={cn(
                "group inline-flex items-center py-4 px-1 border-b-2 font-bold text-xs uppercase tracking-wider transition-all outline-none",
                source === 'Email'
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200"
              )}
            >
              <Mail className={cn("mr-2.5 h-4.5 w-4.5", source === 'Email' ? "text-purple-600" : "text-slate-400 group-hover:text-slate-500")} />
              <span>Poczta (Zamówienia)</span>
            </button>
            <button
              onClick={() => { setSource('PrestaShop'); setPage(1); }}
              className={cn(
                "group inline-flex items-center py-4 px-1 border-b-2 font-bold text-xs uppercase tracking-wider transition-all outline-none",
                source === 'PrestaShop'
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200"
              )}
            >
              <ShoppingBag className={cn("mr-2.5 h-4.5 w-4.5", source === 'PrestaShop' ? "text-purple-600" : "text-slate-400 group-hover:text-slate-500")} />
              <span>PrestaShop API</span>
            </button>
          </nav>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800"></div>
            <p className="mt-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ładowanie zamówień...</p>
          </div>
        ) : (
          <>
            <div className={cn("transition-opacity duration-150", isFetching ? "opacity-50" : "opacity-100")}>
              <OrderTable 
                orders={ordersData?.orders || []}
                onGenerateDPD={(order: Order, count: number) => generateDPD(order.id, count)}
                onGenerateAPaczka={(order: Order) => generateAPaczka(order.id)}
                onDeleteShipment={(id: number) => deleteMutation.mutate(id)}
                onUpdateOrder={(id: number, data: any) => updateMutation.mutate({ id, data })}
                onOpenEmail={(order: Order) => {
                  setSelectedOrder(order);
                  setIsEmailModalOpen(true);
                }}
                isGenerating={generatingIds}
              />
            </div>

            {/* Pagination */}
            {ordersData && ordersData.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between bg-white border border-slate-100 px-4 py-3 sm:px-6 rounded-xl shadow-sm">
                <div className="flex flex-1 justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-605 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Poprzednia
                  </button>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === ordersData.totalPages}
                    className="relative ml-3 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-605 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Następna
                  </button>
                </div>
                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium">
                      Pozycje <span className="font-semibold text-slate-800">{(page - 1) * limit + 1}</span> - <span className="font-semibold text-slate-800">{Math.min(page * limit, ordersData.totalCount)}</span> z <span className="font-semibold text-slate-800">{ordersData.totalCount}</span> zamówień
                    </p>
                  </div>
                  <div>
                    <nav className="isolate inline-flex space-x-1.5" aria-label="Pagination">
                      <button
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page === 1}
                        className="relative inline-flex items-center rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      
                      {[...Array(Math.min(5, ordersData.totalPages))].map((_, i) => {
                        let pageNum = page;
                        if (page <= 3) pageNum = i + 1;
                        else if (page >= ordersData.totalPages - 2) pageNum = ordersData.totalPages - 4 + i;
                        else pageNum = page - 2 + i;

                        if (pageNum <= 0 || pageNum > ordersData.totalPages) return null;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={cn(
                              "relative inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                              page === pageNum
                                ? "z-10 bg-slate-900 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page === ordersData.totalPages}
                        className="relative inline-flex items-center rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
