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
  sendEmail
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

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (ordersData?.totalPages || 1)) {
      setPage(newPage);
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
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
      />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 border-b border-slate-200">
          <nav className="-mb-px flex space-x-12">
            <button
              onClick={() => { setSource('Email'); setPage(1); }}
              className={cn(
                "group inline-flex items-center py-5 px-1 border-b-4 font-black text-xs uppercase tracking-[0.15em] transition-all",
                source === 'Email'
                  ? "border-primary-600 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300"
              )}
            >
              <Mail className={cn("mr-3 h-5 w-5", source === 'Email' ? "text-primary-600" : "text-slate-400 group-hover:text-slate-500")} />
              <span>InstalSzop (Email)</span>
            </button>
            <button
              onClick={() => { setSource('PrestaShop'); setPage(1); }}
              className={cn(
                "group inline-flex items-center py-5 px-1 border-b-4 font-black text-xs uppercase tracking-[0.15em] transition-all",
                source === 'PrestaShop'
                  ? "border-primary-600 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300"
              )}
            >
              <ShoppingBag className={cn("mr-3 h-5 w-5", source === 'PrestaShop' ? "text-primary-600" : "text-slate-400 group-hover:text-gray-500")} />
              <span>PrestaShop API</span>
            </button>
          </nav>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-gray-500 font-medium">Ładowanie zamówień...</p>
          </div>
        ) : (
          <>
            <div className={cn("transition-opacity duration-200", isFetching ? "opacity-50" : "opacity-100")}>
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
              <div className="mt-8 flex items-center justify-between bg-white px-4 py-3 sm:px-6 rounded-lg shadow">
                <div className="flex flex-1 justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Poprzednia
                  </button>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === ordersData.totalPages}
                    className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Następna
                  </button>
                </div>
                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Pokazywanie <span className="font-medium">{(page - 1) * limit + 1}</span> do <span className="font-medium">{Math.min(page * limit, ordersData.totalCount)}</span> z{' '}
                      <span className="font-medium">{ordersData.totalCount}</span> zamówień
                    </p>
                  </div>
                  <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                      <button
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page === 1}
                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      
                      {[...Array(Math.min(5, ordersData.totalPages))].map((_, i) => {
                        // Simple sliding window for pagination
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
                              "relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20",
                              page === pageNum
                                ? "z-10 bg-primary-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                                : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page === ordersData.totalPages}
                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                      >
                        <ChevronRight className="h-5 w-5" />
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
