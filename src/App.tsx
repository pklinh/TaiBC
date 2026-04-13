import { useState, useEffect, useMemo } from 'react';
import { format, isSameDay, parseISO, startOfDay } from 'date-fns';
import { 
  FileText, 
  Search, 
  Calendar as CalendarIcon, 
  Download, 
  Filter, 
  RefreshCw,
  AlertCircle,
  FileSearch
} from 'lucide-react';
import { cn } from './lib/utils';

// Declare chrome for TypeScript
declare const chrome: any;

// --- Types ---
interface DownloadItem {
  id: string;
  filename: string;
  startTime: string;
  fileSize: number;
  state: string;
}

interface ProcessedFile {
  id: string;
  name: string;
  date: Date;
  stockCode: string | null;
  size: number;
}

// --- Mock Data for Preview ---
const MOCK_DOWNLOADS: DownloadItem[] = [
  { id: '1', filename: 'BCTC_VNM_Q4_2023.pdf', startTime: new Date().toISOString(), fileSize: 1024 * 500, state: 'complete' },
  { id: '2', filename: 'Bao_cao_tai_chinh_HPG_2023.xlsx', startTime: new Date().toISOString(), fileSize: 1024 * 200, state: 'complete' },
  { id: '3', filename: 'VIC_BCTC_Hop_nhat_2024.pdf', startTime: new Date().toISOString(), fileSize: 1024 * 800, state: 'complete' },
  { id: '4', filename: 'Tai_lieu_hop_DHDCD_FPT.pdf', startTime: new Date().toISOString(), fileSize: 1024 * 300, state: 'complete' },
  { id: '5', filename: 'BCTC_TCB_2023_Kiem_toan.pdf', startTime: new Date(Date.now() - 86400000).toISOString(), fileSize: 1024 * 600, state: 'complete' },
];

export default function App() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isLoading, setIsLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  // --- Logic: Extract Stock Code ---
  const extractStockCode = (filename: string): string | null => {
    // Keywords to ignore when looking for stock codes
    const ignoreList = ['BCTC', 'PDF', 'ZIP', 'XLS', 'DOC', 'TXT', 'IMG', 'PNG', 'JPG', 'Q1', 'Q2', 'Q3', 'Q4'];
    
    // Find all 3-letter uppercase words
    const matches = filename.match(/\b[A-Z]{3}\b/g);
    if (!matches) return null;
    
    // Return the first match that isn't in the ignore list
    return matches.find(m => !ignoreList.includes(m)) || null;
  };

  // --- Logic: Fetch Downloads ---
  const fetchDownloads = async () => {
    setIsLoading(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.downloads) {
        // Real Chrome Extension environment
        chrome.downloads.search({
          limit: 1000, // Increased limit to find older files
          orderBy: ['-startTime']
        }, (items) => {
          if (chrome.runtime.lastError) {
            console.error('Chrome Search Error:', chrome.runtime.lastError);
            setIsLoading(false);
            return;
          }
          const mapped = items.map(item => ({
            id: item.id.toString(),
            filename: item.filename.split(/[\\/]/).pop() || item.filename,
            startTime: item.startTime,
            fileSize: item.fileSize,
            state: item.state
          }));
          setDownloads(mapped);
          setIsLoading(false);
          setIsMock(false);
        });
      } else {
        // Preview mode / Mock
        console.warn('Chrome Downloads API not available, using mock data.');
        setTimeout(() => {
          setDownloads(MOCK_DOWNLOADS);
          setIsLoading(false);
          setIsMock(true);
        }, 800);
      }
    } catch (error) {
      console.error('Error fetching downloads:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDownloads();
  }, []);

  // --- Logic: Filter and Process ---
  const filteredFiles = useMemo(() => {
    const targetDate = startOfDay(parseISO(selectedDate));
    
    return downloads
      .map(item => ({
        id: item.id,
        name: item.filename,
        date: new Date(item.startTime),
        stockCode: extractStockCode(item.filename),
        size: item.fileSize
      }))
      .filter(file => {
        // Filter by date
        const isSameDayVal = isSameDay(file.date, targetDate);
        
        // Broader keywords for BCTC
        const keywords = [
          'bctc', 'bao cao', 'báo cáo', 'tai chinh', 'tài chính', 
          'financial', 'report', 'annual', 'kiem toan', 'kiểm toán',
          'nghi quyet', 'nghị quyết', 'dhdcd', 'đhđcđ'
        ];
        const nameLower = file.name.toLowerCase();
        const matchesKeyword = keywords.some(k => nameLower.includes(k));
        
        // Also include if it looks like a stock code + date pattern (e.g. VNM 2023)
        const hasStockCode = file.stockCode !== null;
        const hasYear = /\b(20\d{2})\b/.test(file.name);
        
        return isSameDayVal && (matchesKeyword || (hasStockCode && hasYear));
      });
  }, [downloads, selectedDate]);

  const uniqueStockCodes = useMemo(() => {
    const codes = filteredFiles.map(f => f.stockCode).filter(Boolean) as string[];
    return Array.from(new Set(codes));
  }, [filteredFiles]);

  return (
    <div className="w-[400px] min-h-[500px] bg-[#F8FAFC] text-slate-900 font-sans flex flex-col shadow-xl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <FileSearch className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">Quản Lý BCTC</h1>
          </div>
          <button 
            onClick={fetchDownloads}
            disabled={isLoading}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw className={cn("w-4 h-4 text-slate-500", isLoading && "animate-spin")} />
          </button>
        </div>
        
        {isMock && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 p-2 rounded-md mb-3">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <p className="text-[11px] text-amber-700 leading-tight">
              Đang ở chế độ Xem trước. Cài đặt extension để đọc dữ liệu thật.
            </p>
          </div>
        )}

        {/* Date Filter */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <CalendarIcon className="w-4 h-4 text-slate-400" />
          </div>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Tổng số file</p>
            <p className="text-2xl font-bold text-blue-600">{filteredFiles.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Mã chứng khoán</p>
            <p className="text-2xl font-bold text-emerald-600">{uniqueStockCodes.length}</p>
          </div>
        </div>

        {/* File List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5" />
              Danh sách file
            </h2>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              {format(parseISO(selectedDate), 'dd/MM/yyyy')}
            </span>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mb-2 opacity-20" />
              <p className="text-sm">Đang tải dữ liệu...</p>
            </div>
          ) : filteredFiles.length > 0 ? (
            <div className="space-y-2">
              {filteredFiles.map((file) => (
                <div 
                  key={file.id} 
                  className="group bg-white p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-default"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 bg-slate-50 p-2 rounded-lg group-hover:bg-blue-50 transition-colors">
                      <FileText className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate mb-1" title={file.name}>
                        {file.name}
                      </p>
                      <div className="flex items-center gap-3">
                        {file.stockCode ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide">
                            {file.stockCode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                            Không rõ mã
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
              <div className="bg-slate-50 p-4 rounded-full mb-3">
                <Search className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm text-slate-500 font-medium">Không tìm thấy file nào</p>
              <p className="text-xs text-slate-400 mt-1">Thử chọn ngày khác hoặc tải thêm file</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 bg-white border-t border-slate-100 text-center">
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
          BCTC Downloader Manager • v1.0
        </p>
      </footer>
    </div>
  );
}
