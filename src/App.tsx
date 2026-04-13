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
  FileSearch,
  Copy,
  CheckCircle2,
  Settings,
  X,
  Key,
  Sparkles,
  BrainCircuit
} from 'lucide-react';
import { cn } from './lib/utils';
import { GoogleGenAI } from '@google/genai';

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
  const [showAll, setShowAll] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResults, setAiResults] = useState<Record<string, { isBCTC: boolean, stockCode: string | null }>>({});
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [tempApiKey, setTempApiKey] = useState<string>('');

  // --- Logic: Load/Save API Key ---
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['gemini_api_key'], (result: any) => {
        if (result.gemini_api_key) {
          setApiKey(result.gemini_api_key);
          setTempApiKey(result.gemini_api_key);
        }
      });
    } else {
      const savedKey = localStorage.getItem('gemini_api_key');
      if (savedKey) {
        setApiKey(savedKey);
        setTempApiKey(savedKey);
      }
    }
  }, []);

  const saveApiKey = () => {
    const keyToSave = tempApiKey.trim();
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ gemini_api_key: keyToSave }, () => {
        setApiKey(keyToSave);
        setShowSettings(false);
      });
    } else {
      localStorage.setItem('gemini_api_key', keyToSave);
      setApiKey(keyToSave);
      setShowSettings(false);
    }
  };

  // --- Logic: AI Analysis ---
  const analyzeWithAI = async () => {
    if (allFilesToday.length === 0) return;
    
    setIsAnalyzing(true);
    setError(null);
    try {
      const currentKey = apiKey || process.env.GEMINI_API_KEY;
      if (!currentKey) {
        throw new Error("Vui lòng điền Gemini API Key trong phần Cài đặt.");
      }

      const ai = new GoogleGenAI({ apiKey: currentKey });

      const fileList = allFilesToday.map(f => `ID: ${f.id}, Name: ${f.name}`).join('\n');
      const prompt = `Bạn là chuyên gia phân tích chứng khoán Việt Nam. Hãy phân tích danh sách tên file sau đây và xác định xem file nào là Báo cáo tài chính (BCTC, báo cáo thường niên, nghị quyết ĐHĐCĐ, tài liệu họp...). 
      
      QUY TẮC QUAN TRỌNG:
      1. Chỉ xác định là BCTC nếu tên file có các từ khóa liên quan đến báo cáo tài chính, kiểm toán, đại hội cổ đông.
      2. Trích xuất mã chứng khoán (3 chữ cái in hoa). 
      3. KIỂM TRA TÍNH HỢP LỆ: Chỉ lấy các mã chứng khoán THẬT đang niêm yết trên sàn HOSE, HNX, UPCOM (ví dụ: VNM, HPG, ACB, VCB...). 
      4. LOẠI BỎ CÁC MÃ GIẢ: Tuyệt đối không lấy các từ 3 chữ cái nhưng không phải mã chứng khoán như: TAI (tải), BAO (báo), PDF, ZIP, XLS, DOC, IMG, APP, FIX, NEW, OLD, M88, FUN, WIN, v.v.
      
      Danh sách file:
      ${fileList}
      
      Trả về kết quả dưới dạng JSON array: [{"id": "ID_FILE", "isBCTC": true, "stockCode": "MÃ"}]
      Chỉ trả về JSON, không thêm văn bản khác.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      
      const text = response.text || '';
      
      // Clean JSON response if needed
      const jsonStr = text.replace(/```json|```/g, '').trim();
      let parsedResults;
      try {
        parsedResults = JSON.parse(jsonStr);
      } catch (e) {
        console.error("JSON Parse Error:", text);
        throw new Error("AI trả về dữ liệu không đúng định dạng.");
      }
      
      const newAiResults: Record<string, { isBCTC: boolean, stockCode: string | null }> = {};
      parsedResults.forEach((res: any) => {
        newAiResults[res.id] = { isBCTC: res.isBCTC, stockCode: res.stockCode };
      });
      
      setAiResults(newAiResults);
    } catch (err: any) {
      console.error('AI Analysis Error:', err);
      setError(err.message || "Có lỗi xảy ra khi gọi AI.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Logic: Extract Stock Code ---
  const extractStockCode = (filename: string): string | null => {
    // Keywords to ignore when looking for stock codes
    const ignoreList = ['BCTC', 'PDF', 'ZIP', 'XLS', 'DOC', 'TXT', 'IMG', 'PNG', 'JPG', 'Q1', 'Q2', 'Q3', 'Q4', 'BCQT'];
    
    // Normalize: replace underscores and non-alphanumeric with spaces to help regex
    const normalized = filename.toUpperCase().replace(/[^A-Z0-9]/g, ' ');
    const words = normalized.split(/\s+/);
    
    // Find words that are exactly 3 letters long
    const candidates = words.filter(w => w.length === 3 && /^[A-Z]+$/.test(w));
    
    // Return the first candidate that isn't in the ignore list
    return candidates.find(m => !ignoreList.includes(m)) || null;
  };

  // --- Logic: Fetch Downloads ---
  const fetchDownloads = async () => {
    setIsLoading(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.downloads) {
        chrome.downloads.search({
          limit: 1000,
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
  const allFilesToday = useMemo(() => {
    const targetDate = startOfDay(parseISO(selectedDate));
    return downloads
      .map(item => ({
        id: item.id,
        name: item.filename,
        date: new Date(item.startTime),
        stockCode: extractStockCode(item.filename),
        size: item.fileSize
      }))
      .filter(file => isSameDay(file.date, targetDate));
  }, [downloads, selectedDate]);

  const filteredFiles = useMemo(() => {
    if (showAll) return allFilesToday;

    // If AI has results, use them
    if (Object.keys(aiResults).length > 0) {
      return allFilesToday.filter(file => aiResults[file.id]?.isBCTC);
    }

    return allFilesToday.filter(file => {
      // Normalize name for keyword matching: remove underscores, dots, etc.
      const nameLower = file.name.toLowerCase();
      const normalizedName = nameLower.replace(/[_.]/g, ' ');
      
      const keywords = [
        'bctc', 'báo cáo tài chính', 'tài chính', 'bctc_hn',
        'financial', 'kiem toan', 'kiểm toán', 'hopnhat',
        'baocaotaichinh', 'taichinh', 'kiemtoan', 'chuakiemtoan',
        'Baocaotaichinh', 'bao_cao_tai_chinh', 'Soatxet'
      ];
      
      const matchesKeyword = keywords.some(k => 
        normalizedName.includes(k) || nameLower.includes(k.replace(/\s/g, ''))
      );
      
      const hasStockCode = file.stockCode !== null;
      // If it has a stock code and it's a PDF/Excel, it's likely a report
      const isReportType = /\.(pdf|xlsx|xls|doc|docx)$/i.test(file.name);
      
      return matchesKeyword || (hasStockCode && isReportType);
    });
  }, [allFilesToday, showAll]);

  const uniqueStockCodes = useMemo(() => {
    const codes = filteredFiles.map(file => {
      // Prefer AI stock code if available
      if (aiResults[file.id]?.stockCode) return aiResults[file.id].stockCode;
      return file.stockCode;
    }).filter(Boolean) as string[];
    return Array.from(new Set(codes)).sort();
  }, [filteredFiles, aiResults]);

  const handleCopy = () => {
    const text = uniqueStockCodes.join(', ');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "p-2 rounded-full transition-colors",
                showSettings ? "bg-blue-50 text-blue-600" : "hover:bg-slate-100 text-slate-500"
              )}
              title="Cài đặt"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowAll(!showAll)}
              className={cn(
                "text-[10px] font-bold px-2 py-1 rounded transition-colors",
                showAll ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              {showAll ? "HIỆN TẤT CẢ" : "CHỈ BCTC"}
            </button>
            <button 
              onClick={fetchDownloads}
              disabled={isLoading}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
              title="Làm mới"
            >
              <RefreshCw className={cn("w-4 h-4 text-slate-500", isLoading && "animate-spin")} />
            </button>
          </div>
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

        {/* Settings Panel */}
        {showSettings && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Key className="w-3 h-3" />
                Cấu hình API Key
              </h3>
              <button onClick={() => setShowSettings(false)}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">Gemini API Key</label>
                <input 
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="Dán API Key của bạn tại đây..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button 
                onClick={saveApiKey}
                className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                LƯU CẤU HÌNH
              </button>
              <p className="text-[10px] text-slate-400 leading-relaxed italic">
                * API Key được lưu an toàn trong bộ nhớ của trình duyệt. Bạn có thể lấy key miễn phí tại Google AI Studio.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto">
        {/* AI Action */}
        <div className="mb-4 space-y-2">
          <button
            onClick={analyzeWithAI}
            disabled={isAnalyzing || allFilesToday.length === 0}
            className={cn(
              "w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all shadow-sm",
              isAnalyzing 
                ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                : "bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700 active:scale-[0.98]"
            )}
          >
            {isAnalyzing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <BrainCircuit className="w-4 h-4" />
            )}
            {isAnalyzing ? "Đang phân tích AI..." : "Dùng AI Nhận Diện BCTC"}
          </button>
          
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 p-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
              <p className="text-[11px] text-red-700 font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Tổng số file</p>
            <p className="text-2xl font-bold text-blue-600">{filteredFiles.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Mã chứng khoán</p>
            <p className="text-2xl font-bold text-emerald-600">{uniqueStockCodes.length}</p>
          </div>
        </div>

        {/* Stock Codes List */}
        {uniqueStockCodes.length > 0 && (
          <div className="mb-6 bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Danh sách mã CK</h3>
              <button 
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "ĐÃ SAO CHÉP" : "SAO CHÉP"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {uniqueStockCodes.map(code => (
                <span key={code} className="bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold shadow-sm">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}

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
                        {aiResults[file.id]?.stockCode || file.stockCode ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide">
                            {aiResults[file.id]?.isBCTC && <Sparkles className="w-2.5 h-2.5" />}
                            {aiResults[file.id]?.stockCode || file.stockCode}
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
