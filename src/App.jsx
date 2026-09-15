import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  Cpu,
  Plus,
  X,
  LayoutDashboard,
  ClipboardList,
  Truck,
  Boxes,
  History,
  Pencil,
  Trash2,
  RefreshCw,
  CircleDot,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Check,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Factory,
  TrendingUp,
  Landmark,
} from "lucide-react";

/* =========================================================================
   Supabase 클라이언트 설정
   ⚠️ URL / ANON KEY는 하드코딩하지 않고 Vite 환경변수로 주입받습니다.
   ========================================================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error(
    "[Supabase] 환경변수가 설정되지 않았습니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 확인하세요."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================================================================
   토스트 알림
   ========================================================================= */
let toastListeners = [];
function notifyToast(type, message) {
  toastListeners.forEach((l) => l(type, message));
}
function useToastState() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    const listener = (type, message) => setToast({ type, message, key: Date.now() + Math.random() });
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return toast;
}
function ToastHost() {
  const toast = useToastState();
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className="fixed bottom-5 right-5 z-[100] max-w-sm">
      <div
        className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-2xl ${
          isError
            ? "border-red-800 bg-red-950/95 text-red-200"
            : "border-emerald-800 bg-emerald-950/95 text-emerald-200"
        }`}
      >
        {isError ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
        <span className="break-words">{toast.message}</span>
      </div>
    </div>
  );
}

function handleSupabaseError(error, actionLabel) {
  if (!error) return false;
  // eslint-disable-next-line no-console
  console.error(`[Supabase] ${actionLabel} 실패:`, error);
  notifyToast("error", `${actionLabel} 실패: ${error.message || "알 수 없는 오류"}`);
  return true;
}

/* =========================================================================
   포맷 / 공용 유틸
   ========================================================================= */
const CURRENCY_SYMBOL = { KRW: "₩", USD: "$" };
const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" };
const TYPE_ORDER = { sample: 0, mp: 1 };
const TYPE_LABEL = { sample: "Sample", mp: "MP" };

function formatPrice(value, currency) {
  if (value === null || value === undefined || value === "") return "-";
  const symbol = CURRENCY_SYMBOL[currency] || "";
  const num = Number(value ?? 0);
  const fixed = num.toFixed(5);
  const [intPart, decPart] = fixed.split(".");
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${symbol}${withComma}.${decPart}`;
}

function formatQty(value) {
  return Number(value ?? 0).toLocaleString("ko-KR");
}

function formatDate(d) {
  if (!d) return "-";
  return d;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

async function deleteRecord(table, id, confirmMessage) {
  const ok = window.confirm(confirmMessage || "정말 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.");
  if (!ok) return false;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (handleSupabaseError(error, "삭제")) return false;
  notifyToast("success", "삭제되었습니다.");
  return true;
}

// 고객사 → 구분(Sample/MP) → 모델명 → (옵션) 최신 날짜순 정렬로 그룹핑 (4단계 아코디언용)
function groupByCustomerTypeModel(rows, dateField) {
  const byCustomer = new Map();
  for (const r of rows) {
    const type = r.product_type || "mp";
    if (!byCustomer.has(r.customer)) byCustomer.set(r.customer, new Map());
    const typeMap = byCustomer.get(r.customer);
    if (!typeMap.has(type)) typeMap.set(type, new Map());
    const modelMap = typeMap.get(type);
    if (!modelMap.has(r.model_name)) modelMap.set(r.model_name, []);
    modelMap.get(r.model_name).push(r);
  }

  return Array.from(byCustomer.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([customer, typeMap]) => {
      const types = Array.from(typeMap.entries())
        .sort((a, b) => (TYPE_ORDER[a[0]] ?? 9) - (TYPE_ORDER[b[0]] ?? 9))
        .map(([type, modelMap]) => {
          const models = Array.from(modelMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0], "ko"))
            .map(([model_name, modelRows]) => {
              const sorted = dateField
                ? [...modelRows].sort((a, b) => (b[dateField] || "").localeCompare(a[dateField] || ""))
                : modelRows;
              return { model_name, rows: sorted };
            });
          const totalRows = models.reduce((sum, m) => sum + m.rows.length, 0);
          return { type, models, totalRows };
        });
      const totalRows = types.reduce((sum, t) => sum + t.totalRows, 0);
      return { customer, types, totalRows };
    });
}

function flattenGroupedTyped(grouped) {
  return grouped.flatMap((g) => g.types.flatMap((t) => t.models.flatMap((m) => m.rows)));
}

function exportToExcel(filename, rows, columns) {
  if (!rows || rows.length === 0) {
    window.alert("내보낼 데이터가 없습니다.");
    return;
  }
  const data = rows.map((r) => {
    const obj = {};
    columns.forEach((c) => {
      obj[c.header] = c.accessor(r);
    });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}

function filterRowsByDateRange(rows, dateField, start, end) {
  if (!start && !end) return rows;
  return rows.filter((r) => {
    const raw = r[dateField];
    const d = raw ? String(raw).slice(0, 10) : null;
    if (!d) return true;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

/* =========================================================================
   공용 UI 조각
   ========================================================================= */
function TraceHeaderPattern() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
      viewBox="0 0 800 120"
      preserveAspectRatio="none"
      fill="none"
    >
      <path d="M0 20 H120 L140 40 H300 L320 20 H500 L520 40 H700 L720 20 H800" stroke="#22d3ee" strokeWidth="1.5" />
      <path d="M0 90 H180 L200 70 H360 L380 90 H560 L580 70 H800" stroke="#f59e0b" strokeWidth="1.5" />
      {[120, 300, 500, 700, 180, 360, 560].map((x, i) => (
        <circle key={i} cx={x} cy={i % 2 === 0 ? 20 : 90} r="3" fill="#22d3ee" />
      ))}
    </svg>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="mb-3 block w-full">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500";

// 화폐 선택(3) : 금액 입력(7) 비율 고정 그리드
function CurrencyPriceInput({ price, currency, onPriceChange, onCurrencyChange }) {
  return (
    <div className="grid w-full grid-cols-10 gap-2">
      <select
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value)}
        className={`${inputClass} col-span-3 px-1.5 text-xs sm:text-sm`}
      >
        <option value="KRW">KRW (₩)</option>
        <option value="USD">USD ($)</option>
      </select>
      <input
        type="number"
        step="0.00001"
        min="0"
        placeholder="0.00000"
        value={price}
        onChange={(e) => onPriceChange(e.target.value)}
        className={`${inputClass} col-span-7 text-right font-mono`}
      />
    </div>
  );
}

// 드롭다운 선택 + 직접 입력을 모두 지원하는 계층형 셀렉트
// options가 바뀌는 시점(resetKey)에 맞춰 선택모드/직접입력모드를 다시 판단합니다.
function HierarchicalSelect({ value, onChange, options, addLabel, resetKey }) {
  const [customMode, setCustomMode] = useState(options.length === 0);

  useEffect(() => {
    setCustomMode(options.length === 0 || !options.includes(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (customMode) {
    return (
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={addLabel}
          autoFocus
        />
        {options.length > 0 && (
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="shrink-0 rounded-md border border-slate-700 px-2 text-xs text-slate-300 hover:bg-slate-800"
          >
            목록
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      value={options.includes(value) ? value : ""}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          setCustomMode(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      className={inputClass}
    >
      <option value="" disabled>
        선택하세요
      </option>
      <option value="__add__">{addLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// Sample / MP 선택 토글
function ProductTypeToggle({ value, onChange }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-800/60 p-1">
      <button
        type="button"
        onClick={() => onChange("sample")}
        className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-bold transition-colors ${
          value === "sample" ? "bg-purple-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <FlaskConical size={14} />
        Sample
      </button>
      <button
        type="button"
        onClick={() => onChange("mp")}
        className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-bold transition-colors ${
          value === "mp" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <Factory size={14} />
        MP (양산)
      </button>
    </div>
  );
}

function TypeBadge({ type, className = "" }) {
  const isSample = type === "sample";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
        isSample ? "bg-purple-500/20 text-purple-300" : "bg-cyan-500/20 text-cyan-300"
      } ${className}`}
    >
      {isSample ? <FlaskConical size={10} /> : <Factory size={10} />}
      {TYPE_LABEL[type] || type}
    </span>
  );
}

function PrimaryButton({ children, onClick, icon: Icon, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 active:bg-cyan-600 ${className}`}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function ExportButton({ onClick, label = "엑셀 내보내기" }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
    >
      <Download size={13} />
      {label}
    </button>
  );
}

function ExportRangeModal({ open, onClose, onConfirm, dateHint }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (open) {
      setStart("");
      setEnd("");
    }
  }, [open]);

  const confirm = () => {
    if (start && end && start > end) {
      notifyToast("error", "시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }
    onConfirm(start || null, end || null);
    onClose();
  };

  return (
    <Modal open={open} title="엑셀 내보내기 — 기간 선택" onClose={onClose}>
      {dateHint && <p className="mb-3 rounded-md bg-slate-800/60 p-2.5 text-xs text-slate-400">{dateHint}</p>}
      <Field label="시작일 (비워두면 전체 기간)">
        <input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="종료일 (비워두면 전체 기간)">
        <input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          취소
        </button>
        <PrimaryButton icon={Download} onClick={confirm}>
          엑셀로 내보내기
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        onClick={onEdit}
        title="수정"
        className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
      >
        <Pencil size={12} />
        수정
      </button>
      <button
        onClick={onDelete}
        title="삭제"
        className="inline-flex items-center gap-1 rounded-md border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
      >
        <Trash2 size={12} />
        삭제
      </button>
    </div>
  );
}

// 1단계: 고객사
function GroupHeader({ label, count, collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between bg-slate-800/70 px-4 py-2.5 text-left hover:bg-slate-800"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <Building2 size={15} className="text-cyan-400" />
        {label}
        <span className="text-xs font-normal text-slate-500">({count}건)</span>
      </span>
      {collapsed ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronUp size={16} className="text-slate-400" />}
    </button>
  );
}

// 2단계: Sample / MP 구분
function TypeGroupHeader({ type, count, collapsed, onToggle }) {
  const isSample = type === "sample";
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center justify-between border-t border-slate-800/60 px-4 py-2 pl-8 text-left ${
        isSample ? "bg-purple-500/5 hover:bg-purple-500/10" : "bg-cyan-500/5 hover:bg-cyan-500/10"
      }`}
    >
      <span className="flex items-center gap-2">
        <TypeBadge type={type} />
        <span className="text-xs font-normal text-slate-500">({count}건)</span>
      </span>
      {collapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
    </button>
  );
}

// 3단계: 모델명 — 굵고 크게 강조 + 핵심 수치(발주잔량/재공/재고) 표시
function ModelGroupHeader({ label, count, stats, revisions, collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 border-t border-slate-800/60 bg-slate-900/70 px-4 py-2.5 pl-12 text-left hover:bg-slate-800/60"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-base font-bold text-slate-50 sm:text-lg">{label}</span>
        {revisions && revisions.length > 0 && (
          <span className="shrink-0 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
            {revisions.join(" · ")}
          </span>
        )}
        {count !== undefined && <span className="shrink-0 text-xs font-normal text-slate-500">({count}건)</span>}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {stats && (
          <span className="hidden gap-3 whitespace-nowrap font-mono text-xs text-slate-400 sm:flex">
            <span>
              발주잔량 <b className="text-amber-400">{formatQty(stats.order_balance)}</b>
            </span>
            <span>
              재공 <b className="text-cyan-300">{formatQty(stats.wip_qty)}</b>
            </span>
            <span>
              재고 <b className="text-slate-200">{formatQty(stats.product_stock)}</b>
            </span>
          </span>
        )}
        {collapsed ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronUp size={15} className="text-slate-400" />}
      </span>
    </button>
  );
}

/* =========================================================================
   메인 앱
   ========================================================================= */
export default function App() {
  const [tab, setTab] = useState("dashboard");

  const [dashboardRows, setDashboardRows] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [shipmentRows, setShipmentRows] = useState([]);
  const [materialRows, setMaterialRows] = useState([]);
  const [priceHistoryRows, setPriceHistoryRows] = useState([]);
  const [profitRows, setProfitRows] = useState([]);
  const [tradeConditions, setTradeConditions] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  const [modal, setModal] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);

  const openCreate = (type) => {
    setEditingRecord(null);
    setModal(type);
  };
  const openEdit = (type, record) => {
    setEditingRecord(record);
    setModal(type);
  };
  const closeModal = () => {
    setModal(null);
    setEditingRecord(null);
  };

  const fetchDashboard = useCallback(async () => {
    const { data, error } = await supabase
      .from("dashboard_view")
      .select("*")
      .order("customer", { ascending: true })
      .order("model_name", { ascending: true });
    if (handleSupabaseError(error, "대시보드 조회")) return;
    setDashboardRows(data || []);
    setLastSync(new Date());
  }, []);

  const fetchSales = useCallback(async () => {
    const { data, error } = await supabase
      .from("sales_orders")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (handleSupabaseError(error, "수주 내역 조회")) return;
    setSalesRows(data || []);
  }, []);

  const fetchShipments = useCallback(async () => {
    const { data, error } = await supabase
      .from("shipments")
      .select("*")
      .order("shipment_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (handleSupabaseError(error, "출고 내역 조회")) return;
    setShipmentRows(data || []);
  }, []);

  const fetchMaterials = useCallback(async () => {
    const { data, error } = await supabase
      .from("material_orders")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (handleSupabaseError(error, "원자재 발주 내역 조회")) return;
    setMaterialRows(data || []);
  }, []);

  const fetchPriceHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("price_history")
      .select("*")
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (handleSupabaseError(error, "단가 이력 조회")) return;
    setPriceHistoryRows(data || []);
  }, []);

  const fetchProfit = useCallback(async () => {
    const { data, error } = await supabase
      .from("profit_view")
      .select("*")
      .order("shipment_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (handleSupabaseError(error, "이익 현황 조회")) return;
    setProfitRows(data || []);
  }, []);

  const fetchTradeConditions = useCallback(async () => {
    const { data, error } = await supabase
      .from("trade_conditions")
      .select("*")
      .order("subject_type", { ascending: true })
      .order("subject_name", { ascending: true });
    if (handleSupabaseError(error, "업체별 거래조건 조회")) return;
    setTradeConditions(data || []);
  }, []);

  const fetchExchangeRates = useCallback(async () => {
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("*")
      .order("rate_date", { ascending: false });
    if (handleSupabaseError(error, "환율 조회")) return;
    setExchangeRates(data || []);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchDashboard(),
      fetchSales(),
      fetchShipments(),
      fetchMaterials(),
      fetchPriceHistory(),
      fetchProfit(),
      fetchTradeConditions(),
      fetchExchangeRates(),
    ]);
    setLoading(false);
  }, [
    fetchDashboard,
    fetchSales,
    fetchShipments,
    fetchMaterials,
    fetchPriceHistory,
    fetchProfit,
    fetchTradeConditions,
    fetchExchangeRates,
  ]);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("pcb-realtime-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => fetchDashboard())
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_orders" }, () => {
        fetchDashboard();
        fetchSales();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, () => {
        fetchDashboard();
        fetchShipments();
        fetchProfit();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "material_orders" }, () => {
        fetchDashboard();
        fetchMaterials();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "price_history" }, () => fetchPriceHistory())
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_conditions" }, () => {
        fetchTradeConditions();
        fetchProfit();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "exchange_rates" }, () => {
        fetchExchangeRates();
        fetchProfit();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- 고객사별 요약 (Sample+MP 통합, 모델명 breakdown) ---------------- */
  const summaryByCustomer = useMemo(() => {
    const map = new Map();
    for (const row of dashboardRows) {
      let cur = map.get(row.customer);
      if (!cur) {
        cur = { customer: row.customer, totalOrder: 0, delivered: 0, balance: 0, models: [] };
        map.set(row.customer, cur);
      }
      cur.totalOrder += Number(row.total_order_qty || 0);
      cur.delivered += Number(row.delivered_qty || 0);
      cur.balance += Number(row.order_balance || 0);
      cur.models.push({
        model_name: row.model_name,
        product_type: row.product_type,
        totalOrder: Number(row.total_order_qty || 0),
        delivered: Number(row.delivered_qty || 0),
        balance: Number(row.order_balance || 0),
        materialStock: Number(row.material_stock || 0),
        materialWaiting: Number(row.material_waiting || 0),
        productStock: Number(row.product_stock || 0),
        wipQty: Number(row.wip_qty || 0),
      });
    }
    return Array.from(map.values()).sort((a, b) => a.customer.localeCompare(b.customer, "ko"));
  }, [dashboardRows]);

  // 고객사+구분+모델명 → 발주잔량/재공/재고 조회용
  const productLookup = useMemo(() => {
    const map = new Map();
    for (const r of dashboardRows) {
      map.set(`${r.customer}::${r.product_type}::${r.model_name}`, {
        order_balance: r.order_balance,
        wip_qty: r.wip_qty,
        product_stock: r.product_stock,
      });
    }
    return map;
  }, [dashboardRows]);

  // 고객사 → 제조사 → 모델명 계층형 카탈로그 (드롭다운용, dashboardRows에서 파생)
  const catalog = useMemo(
    () =>
      dashboardRows.map((r) => ({
        customer: r.customer,
        manufacturer: r.manufacturer || "",
        model_name: r.model_name,
        product_type: r.product_type,
      })),
    [dashboardRows]
  );

  // Sample 모델의 리비전 목록 (수주+출고 이력에서 파생, 대시보드 표시용)
  const revisionsByModel = useMemo(() => {
    const sets = new Map();
    const addRev = (r) => {
      if (r.product_type !== "sample" || !r.revision) return;
      const key = `${r.customer}::${r.product_type}::${r.model_name}`;
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(r.revision);
    };
    salesRows.forEach(addRev);
    shipmentRows.forEach(addRev);
    const result = new Map();
    for (const [k, set] of sets) result.set(k, Array.from(set).sort((a, b) => a.localeCompare(b, "ko")));
    return result;
  }, [salesRows, shipmentRows]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="relative overflow-hidden border-b border-slate-800 bg-slate-900">
        <TraceHeaderPattern />
        <div className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30">
              <Cpu size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-50">PCB 제품 · 원자재 통합 현황판</h1>
              <p className="text-xs text-slate-400">실시간 동기화 · 담당자 2인 공용</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {lastSync ? `마지막 갱신 ${lastSync.toLocaleTimeString("ko-KR")}` : "동기화 중..."}
          </div>
        </div>

        <nav className="relative mx-auto flex max-w-7xl flex-wrap gap-1 px-6">
          {[
            { key: "dashboard", label: "실시간 대시보드", icon: LayoutDashboard },
            { key: "sales", label: "수주 내역", icon: ClipboardList },
            { key: "shipment", label: "출고 내역", icon: Truck },
            { key: "material", label: "원자재 발주 내역", icon: Boxes },
            { key: "price_history", label: "단가 이력", icon: History },
            { key: "profit", label: "이익 현황", icon: TrendingUp },
            { key: "trade_conditions", label: "업체별 거래조건", icon: Landmark },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-6 pt-5">
        <PrimaryButton icon={Plus} onClick={() => openCreate("sales")}>
          수주 입력
        </PrimaryButton>
        <PrimaryButton icon={Plus} onClick={() => openCreate("shipment")}>
          출고 입력
        </PrimaryButton>
        <PrimaryButton icon={Plus} onClick={() => openCreate("material")}>
          원자재 발주 입력
        </PrimaryButton>
        <PrimaryButton icon={Plus} onClick={() => openCreate("price")}>
          단가 이력 추가
        </PrimaryButton>
        <PrimaryButton icon={Plus} onClick={() => openCreate("trade_condition")}>
          거래조건 입력
        </PrimaryButton>
        <button
          onClick={() => openCreate("stock")}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
        >
          <Pencil size={16} />
          재공/재고 수정
        </button>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {tab === "dashboard" && (
          <DashboardTab
            rows={dashboardRows}
            summary={summaryByCustomer}
            shipmentRows={shipmentRows}
            profitRows={profitRows}
            revisionsByModel={revisionsByModel}
          />
        )}
        {tab === "sales" && (
          <SalesHistoryTab
            rows={salesRows}
            productLookup={productLookup}
            onEdit={(row) => openEdit("sales", row)}
            onRefresh={fetchSales}
          />
        )}
        {tab === "shipment" && (
          <ShipmentHistoryTab
            rows={shipmentRows}
            productLookup={productLookup}
            onEdit={(row) => openEdit("shipment", row)}
            onRefresh={fetchShipments}
          />
        )}
        {tab === "material" && (
          <MaterialHistoryTab
            rows={materialRows}
            productLookup={productLookup}
            onEdit={(row) => openEdit("material", row)}
            onRefresh={fetchMaterials}
          />
        )}
        {tab === "price_history" && (
          <PriceHistoryTab
            rows={priceHistoryRows}
            productLookup={productLookup}
            onEdit={(row) => openEdit("price", row)}
            onRefresh={fetchPriceHistory}
          />
        )}
        {tab === "profit" && <ProfitTab rows={profitRows} />}
        {tab === "trade_conditions" && (
          <TradeConditionsTab
            tradeConditions={tradeConditions}
            exchangeRates={exchangeRates}
            onEdit={(row) => openEdit("trade_condition", row)}
            onRefreshConditions={fetchTradeConditions}
            onRefreshRates={fetchExchangeRates}
          />
        )}
      </main>

      <SalesOrderModal open={modal === "sales"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <ShipmentModal open={modal === "shipment"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <MaterialOrderModal open={modal === "material"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <PriceHistoryModal open={modal === "price"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <TradeConditionModal open={modal === "trade_condition"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <StockEditModal open={modal === "stock"} onClose={closeModal} products={dashboardRows} initial={editingRecord} />

      <ToastHost />
    </div>
  );
}

/* =========================================================================
   대시보드 탭 (고객사 → 구분 → 모델명 3단계 아코디언 + 기간필터 엑셀)
   ========================================================================= */
function DashboardTab({ rows, summary, shipmentRows, profitRows, revisionsByModel }) {
  const grouped = useMemo(() => groupByCustomerTypeModel(rows), [rows]);
  const [collapsedCustomers, setCollapsedCustomers] = useState(() => new Set());
  const [collapsedTypes, setCollapsedTypes] = useState(() => new Set());
  const [collapsedModels, setCollapsedModels] = useState(() => new Set());
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const yearOptions = useMemo(() => {
    const years = new Set([currentYear]);
    shipmentRows.forEach((r) => {
      const y = Number((r.shipment_date || "").slice(0, 4));
      if (y) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentRows]);

  // 통화별로 분리된 매입/판매/부대비용 합계 (USD 거래분과 KRW 거래분을 섞지 않음)
  const profitByCustomer = useMemo(() => {
    const map = new Map();
    for (const r of shipmentRows) {
      const y = Number((r.shipment_date || "").slice(0, 4));
      if (y !== selectedYear) continue;
      if (!map.has(r.customer)) {
        map.set(r.customer, {
          purchaseUSD: 0,
          purchaseKRW: 0,
          saleUSD: 0,
          saleKRW: 0,
          extraUSD: 0,
          extraKRW: 0,
        });
      }
      const cur = map.get(r.customer);
      const totalPurchase = Number(r.quantity || 0) * Number(r.purchase_price || 0);
      const totalSale = Number(r.quantity || 0) * Number(r.sale_price || 0);
      const extra = Number(r.extra_cost || 0);

      if (r.purchase_currency === "USD") cur.purchaseUSD += totalPurchase;
      else cur.purchaseKRW += totalPurchase;

      if (r.sale_currency === "USD") {
        cur.saleUSD += totalSale;
        cur.extraUSD += extra;
      } else {
        cur.saleKRW += totalSale;
        cur.extraKRW += extra;
      }
    }
    return map;
  }, [shipmentRows, selectedYear]);

  // 총 이익(KRW 환산, 통화 무관 단일 통합값) — profit_view의 margin_krw를 그대로 합산
  const marginKrwByCustomer = useMemo(() => {
    const map = new Map();
    for (const r of profitRows) {
      const y = Number((r.shipment_date || "").slice(0, 4));
      if (y !== selectedYear) continue;
      const cur = map.get(r.customer) || { marginKrw: 0, hasNull: false };
      if (r.margin_krw === null || r.margin_krw === undefined) {
        cur.hasNull = true;
      } else {
        cur.marginKrw += Number(r.margin_krw);
      }
      map.set(r.customer, cur);
    }
    return map;
  }, [profitRows, selectedYear]);

  const toggleCustomer = (customer) =>
    setCollapsedCustomers((prev) => {
      const next = new Set(prev);
      next.has(customer) ? next.delete(customer) : next.add(customer);
      return next;
    });
  const toggleType = (key) =>
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const toggleModel = (key) =>
    setCollapsedModels((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const DASHBOARD_EXPORT_COLUMNS = [
    { header: "고객사", accessor: (r) => r.customer },
    { header: "구분", accessor: (r) => TYPE_LABEL[r.product_type] || r.product_type },
    { header: "모델명", accessor: (r) => r.model_name },
    { header: "총수주량", accessor: (r) => r.total_order_qty },
    { header: "제품재고", accessor: (r) => r.product_stock },
    { header: "재공", accessor: (r) => r.wip_qty },
    { header: "납품완료", accessor: (r) => r.delivered_qty },
    { header: "발주잔량", accessor: (r) => r.order_balance },
    { header: "원자재재고", accessor: (r) => r.material_stock },
    { header: "원자재대기", accessor: (r) => r.material_waiting },
  ];

  const handleExport = (start, end) => {
    const filtered = filterRowsByDateRange(rows, "updated_at", start, end);
    const filteredGrouped = groupByCustomerTypeModel(filtered);
    exportToExcel("대시보드_현황.xlsx", flattenGroupedTyped(filteredGrouped), DASHBOARD_EXPORT_COLUMNS);
  };

  return (
    <div className="space-y-6">
      {/* 상단 요약 카드 (고객사별, 이익현황 기준 + 2-Track 재고 전환) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">고객사별 요약 ({selectedYear}년 기준)</h2>
          <Field label="">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className={`${inputClass} w-32`}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {summary.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
              아직 등록된 데이터가 없습니다. 상단 버튼으로 수주/출고/원자재 발주를 입력해보세요.
            </div>
          )}
          {summary.map((s) => (
            <CustomerSummaryCard
              key={s.customer}
              summary={s}
              profit={profitByCustomer.get(s.customer)}
              marginKrw={marginKrwByCustomer.get(s.customer)}
              revisionsByModel={revisionsByModel}
            />
          ))}
        </div>
      </div>

      {/* 메인 현황 테이블 : 고객사 → 구분(Sample/MP) → 모델명 3단계 아코디언 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">모델별 실시간 현황</h2>
          <ExportButton onClick={() => setExportModalOpen(true)} />
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left">구분</th>
                  <th className="px-4 py-3 text-right">총수주량</th>
                  <th className="px-4 py-3 text-right">제품재고</th>
                  <th className="px-4 py-3 text-right">재공</th>
                  <th className="px-4 py-3 text-right">납품완료</th>
                  <th className="px-4 py-3 text-right">발주잔량</th>
                  <th className="px-4 py-3 text-right">원자재재고</th>
                  <th className="px-4 py-3 text-right">원자재대기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono">
                {grouped.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center font-sans text-slate-500">
                      표시할 모델 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  grouped.map((g) => (
                    <React.Fragment key={g.customer}>
                      <tr>
                        <td colSpan={8} className="p-0">
                          <GroupHeader
                            label={g.customer}
                            count={g.totalRows}
                            collapsed={collapsedCustomers.has(g.customer)}
                            onToggle={() => toggleCustomer(g.customer)}
                          />
                        </td>
                      </tr>
                      {!collapsedCustomers.has(g.customer) &&
                        g.types.map((t) => {
                          const typeKey = `${g.customer}::${t.type}`;
                          const typeCollapsed = collapsedTypes.has(typeKey);
                          return (
                            <React.Fragment key={typeKey}>
                              <tr>
                                <td colSpan={8} className="p-0">
                                  <TypeGroupHeader
                                    type={t.type}
                                    count={t.totalRows}
                                    collapsed={typeCollapsed}
                                    onToggle={() => toggleType(typeKey)}
                                  />
                                </td>
                              </tr>
                              {!typeCollapsed &&
                                t.models.map((m) => {
                                  const r = m.rows[0];
                                  const modelKey = `${typeKey}::${m.model_name}`;
                                  const modelCollapsed = collapsedModels.has(modelKey);
                                  return (
                                    <React.Fragment key={modelKey}>
                                      <tr>
                                        <td colSpan={8} className="p-0">
                                          <ModelGroupHeader
                                            label={m.model_name}
                                            revisions={t.type === "sample" ? revisionsByModel?.get(modelKey) : undefined}
                                            stats={{
                                              order_balance: r.order_balance,
                                              wip_qty: r.wip_qty,
                                              product_stock: r.product_stock,
                                            }}
                                            collapsed={modelCollapsed}
                                            onToggle={() => toggleModel(modelKey)}
                                          />
                                        </td>
                                      </tr>
                                      {!modelCollapsed && <DashboardDetailRow row={r} />}
                                    </React.Fragment>
                                  );
                                })}
                            </React.Fragment>
                          );
                        })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ExportRangeModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onConfirm={handleExport}
        dateHint="최종 갱신일(재공/재고 최종 수정 시각) 기준으로 필터링합니다."
      />
    </div>
  );
}

// 고객사 요약 카드: 상단 이익현황(매입/판매/부대비용/이익) + 하단 [원자재 현황]/[발주잔량 현황] 2-Track 전환
function CustomerSummaryCard({ summary: s, profit, marginKrw, revisionsByModel }) {
  const [viewMode, setViewMode] = useState("material"); // 'material' | 'balance'

  const sortedModels = useMemo(
    () =>
      s.models
        .slice()
        .sort(
          (a, b) =>
            (TYPE_ORDER[a.product_type] ?? 9) - (TYPE_ORDER[b.product_type] ?? 9) ||
            a.model_name.localeCompare(b.model_name, "ko")
        ),
    [s.models]
  );

  const p = profit || { purchaseUSD: 0, purchaseKRW: 0, saleUSD: 0, saleKRW: 0, extraUSD: 0, extraKRW: 0 };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-300">
          <Building2 size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold">{s.customer}</span>
        </div>
        <div className="flex shrink-0 gap-1 rounded-md border border-slate-700 bg-slate-800/60 p-0.5 text-xs">
          <button
            onClick={() => setViewMode("material")}
            className={`rounded px-2 py-1 font-medium transition-colors ${
              viewMode === "material" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            원자재 현황
          </button>
          <button
            onClick={() => setViewMode("balance")}
            className={`rounded px-2 py-1 font-medium transition-colors ${
              viewMode === "balance" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            발주잔량 현황
          </button>
        </div>
      </div>

      {/* 매입/판매/부대비용 (USD·KRW 2줄 분리) + 총이익 (KRW 단일 병합) */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <div className="text-center">
          <div className="text-[11px] text-slate-500">총 매입가</div>
          <div className="mt-1 font-mono text-xs font-semibold text-slate-300">
            <span className="text-slate-500">$</span> {formatQty(Math.round(p.purchaseUSD))}
          </div>
          <div className="font-mono text-xs font-semibold text-slate-300">
            <span className="text-slate-500">₩</span> {formatQty(Math.round(p.purchaseKRW))}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[11px] text-slate-500">총 판매가</div>
          <div className="mt-1 font-mono text-xs font-semibold text-cyan-300">
            <span className="text-slate-500">$</span> {formatQty(Math.round(p.saleUSD))}
          </div>
          <div className="font-mono text-xs font-semibold text-cyan-300">
            <span className="text-slate-500">₩</span> {formatQty(Math.round(p.saleKRW))}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[11px] text-slate-500">총 부대비용</div>
          <div className="mt-1 font-mono text-xs font-semibold text-amber-400">
            <span className="text-slate-500">$</span> {formatQty(Math.round(p.extraUSD))}
          </div>
          <div className="font-mono text-xs font-semibold text-amber-400">
            <span className="text-slate-500">₩</span> {formatQty(Math.round(p.extraKRW))}
          </div>
        </div>
        <div className="col-span-3 flex flex-col items-center justify-center rounded-lg bg-slate-800/40 py-2 sm:col-span-1">
          <div className="text-[11px] text-slate-500">총 이익 (KRW)</div>
          <div
            className={`mt-1 font-mono text-lg font-bold ${
              (marginKrw?.marginKrw || 0) >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            ₩ {formatQty(Math.round(marginKrw?.marginKrw || 0))}
          </div>
          {marginKrw?.hasNull && <div className="mt-0.5 text-[10px] text-amber-400">일부 환율 미입력</div>}
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-600">
        선택 연도 출고 기준 · 총 이익은 업체별 거래조건 환율로 원화 환산된 통합값입니다
      </p>

      <div className="mt-4 space-y-1.5 border-t border-slate-800 pt-3">
        {sortedModels.map((m) => {
          const revisions = m.product_type === "sample" ? revisionsByModel?.get(`${s.customer}::${m.product_type}::${m.model_name}`) : null;
          return (
            <div key={`${m.product_type}-${m.model_name}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <TypeBadge type={m.product_type} />
                <span className="truncate font-sans text-sm font-bold text-slate-100">{m.model_name}</span>
                {revisions && revisions.length > 0 && (
                  <span className="shrink-0 rounded bg-purple-500/10 px-1 py-0.5 text-[10px] font-medium text-purple-300">
                    {revisions.join(" · ")}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-slate-500">
                {viewMode === "material" ? (
                  <>
                    재고 <b className="text-slate-200">{formatQty(m.materialStock)}</b> · 대기{" "}
                    <b className="text-amber-400">{formatQty(m.materialWaiting)}</b>
                  </>
                ) : (
                  <>
                    재고 <b className="text-slate-200">{formatQty(m.productStock)}</b> · 재공{" "}
                    <b className="text-cyan-300">{formatQty(m.wipQty)}</b> · 잔량{" "}
                    <b className="text-amber-400">{formatQty(m.balance)}</b>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 메인 현황 테이블의 모델별 "상세 지표" 행 — 원자재재고 직접수정 + 대기→재고 FIFO 전환 인라인 편집
function DashboardDetailRow({ row }) {
  const [editingStock, setEditingStock] = useState(false);
  const [stockInput, setStockInput] = useState(String(row.material_stock ?? 0));
  const [editingWaiting, setEditingWaiting] = useState(false);
  const [convertQty, setConvertQty] = useState("");
  const [editingProductStock, setEditingProductStock] = useState(false);
  const [productStockInput, setProductStockInput] = useState(String(row.product_stock ?? 0));
  const [editingWip, setEditingWip] = useState(false);
  const [wipInput, setWipInput] = useState(String(row.wip_qty ?? 0));

  useEffect(() => {
    setStockInput(String(row.material_stock ?? 0));
  }, [row.material_stock]);
  useEffect(() => {
    setProductStockInput(String(row.product_stock ?? 0));
  }, [row.product_stock]);
  useEffect(() => {
    setWipInput(String(row.wip_qty ?? 0));
  }, [row.wip_qty]);

  const saveMaterialStock = async () => {
    const { error } = await supabase.rpc("set_material_stock", {
      p_product_id: row.id,
      p_new_value: Number(stockInput) || 0,
    });
    if (handleSupabaseError(error, "원자재재고 수정")) return;
    notifyToast("success", "원자재재고가 수정되었습니다.");
    setEditingStock(false);
  };

  // 제품재고 / 재공은 같은 adjust_stock RPC를 공유합니다 — 수정하지 않는 쪽은
  // 현재 값을 그대로 넘겨서, 재공 증가 시의 원자재 자동 소모 로직은 그대로 유지됩니다.
  const saveProductStock = async () => {
    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: row.id,
      p_new_wip: Number(row.wip_qty) || 0,
      p_new_product_stock: Number(productStockInput) || 0,
    });
    if (handleSupabaseError(error, "제품재고 수정")) return;
    notifyToast("success", "제품재고가 수정되었습니다.");
    setEditingProductStock(false);
  };

  const saveWip = async () => {
    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: row.id,
      p_new_wip: Number(wipInput) || 0,
      p_new_product_stock: Number(row.product_stock) || 0,
    });
    if (handleSupabaseError(error, "재공 수정")) return;
    notifyToast("success", "재공 수량이 수정되었습니다 (증가분만큼 원자재재고에서 자동 차감됩니다).");
    setEditingWip(false);
  };

  const convertWaitingToStock = async () => {
    const qty = Number(convertQty) || 0;
    if (qty <= 0) {
      notifyToast("error", "전환할 수량을 입력하세요.");
      return;
    }
    const { error } = await supabase.rpc("convert_material_waiting_to_stock", {
      p_customer: row.customer,
      p_model: row.model_name,
      p_type: row.product_type,
      p_qty: qty,
    });
    if (handleSupabaseError(error, "원자재 대기→재고 전환")) return;
    notifyToast("success", `${formatQty(qty)}개를 원자재재고로 전환했습니다 (원자재 발주 내역에 FIFO로 반영됨).`);
    setConvertQty("");
    setEditingWaiting(false);
  };

  return (
    <tr className="hover:bg-slate-800/40">
      <td className="px-4 py-3 pl-16 font-sans text-xs text-slate-500">상세 지표</td>
      <td className="px-4 py-3 text-right">{formatQty(row.total_order_qty)}</td>
      <td className="px-4 py-3 text-right">
        {editingProductStock ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              min="0"
              value={productStockInput}
              onChange={(e) => setProductStockInput(e.target.value)}
              className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
            />
            <button onClick={saveProductStock} className="rounded bg-cyan-500 px-1 py-0.5 text-slate-950 hover:bg-cyan-400">
              <Check size={11} />
            </button>
            <button
              onClick={() => setEditingProductStock(false)}
              className="rounded border border-slate-700 px-1 py-0.5 text-slate-400 hover:bg-slate-800"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingProductStock(true)}
            className="inline-flex items-center gap-1 font-sans text-slate-100 hover:text-cyan-300"
            title="제품재고 직접 수정"
          >
            <span className="font-mono">{formatQty(row.product_stock)}</span>
            <Pencil size={10} />
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-right text-cyan-300">
        {editingWip ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              min="0"
              value={wipInput}
              onChange={(e) => setWipInput(e.target.value)}
              className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
            />
            <button onClick={saveWip} className="rounded bg-cyan-500 px-1 py-0.5 text-slate-950 hover:bg-cyan-400">
              <Check size={11} />
            </button>
            <button
              onClick={() => setEditingWip(false)}
              className="rounded border border-slate-700 px-1 py-0.5 text-slate-400 hover:bg-slate-800"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingWip(true)}
            className="inline-flex items-center gap-1 font-sans text-cyan-300 hover:text-cyan-200"
            title="재공 직접 수정 (증가분만큼 원자재재고 자동 차감)"
          >
            <span className="font-mono">{formatQty(row.wip_qty)}</span>
            <Pencil size={10} />
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-right text-emerald-400">{formatQty(row.delivered_qty)}</td>
      <td className="px-4 py-3 text-right text-amber-400">{formatQty(row.order_balance)}</td>
      <td className="px-4 py-3 text-right">
        {editingStock ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              min="0"
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
            />
            <button onClick={saveMaterialStock} className="rounded bg-cyan-500 px-1 py-0.5 text-slate-950 hover:bg-cyan-400">
              <Check size={11} />
            </button>
            <button
              onClick={() => setEditingStock(false)}
              className="rounded border border-slate-700 px-1 py-0.5 text-slate-400 hover:bg-slate-800"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingStock(true)}
            className="inline-flex items-center gap-1 font-sans text-slate-100 hover:text-cyan-300"
            title="원자재재고 직접 수정"
          >
            <span className="font-mono">{formatQty(row.material_stock)}</span>
            <Pencil size={10} />
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-right text-amber-400">
        {editingWaiting ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              min="0"
              max={row.material_waiting}
              placeholder="전환수량"
              value={convertQty}
              onChange={(e) => setConvertQty(e.target.value)}
              className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
            />
            <button onClick={convertWaitingToStock} className="rounded bg-cyan-500 px-1 py-0.5 text-slate-950 hover:bg-cyan-400">
              <Check size={11} />
            </button>
            <button
              onClick={() => {
                setEditingWaiting(false);
                setConvertQty("");
              }}
              className="rounded border border-slate-700 px-1 py-0.5 text-slate-400 hover:bg-slate-800"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingWaiting(true)}
            className="inline-flex items-center gap-1 font-sans hover:text-cyan-300"
            title="대기 수량을 재고로 전환 (FIFO)"
          >
            <span className="font-mono">{formatQty(row.material_waiting)}</span>
            <Pencil size={10} />
          </button>
        )}
      </td>
    </tr>
  );
}

/* =========================================================================
   내역 조회 탭 공용: 고객사(1) → 구분(2) → 모델명(3) 아코디언 + 기간필터 엑셀
   ========================================================================= */
function GroupedHistoryTable({ columns, rows, dateField, renderRow, emptyLabel, exportConfig, productLookup }) {
  const grouped = useMemo(() => groupByCustomerTypeModel(rows, dateField), [rows, dateField]);
  const [collapsedCustomers, setCollapsedCustomers] = useState(() => new Set());
  const [collapsedTypes, setCollapsedTypes] = useState(() => new Set());
  const [collapsedModels, setCollapsedModels] = useState(() => new Set());
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const toggleCustomer = (customer) =>
    setCollapsedCustomers((prev) => {
      const next = new Set(prev);
      next.has(customer) ? next.delete(customer) : next.add(customer);
      return next;
    });
  const toggleType = (key) =>
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const toggleModel = (key) =>
    setCollapsedModels((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleExport = (start, end) => {
    const filtered = filterRowsByDateRange(rows, dateField, start, end);
    const filteredGrouped = groupByCustomerTypeModel(filtered, dateField);
    exportToExcel(exportConfig.filename, flattenGroupedTyped(filteredGrouped), exportConfig.columns);
  };

  return (
    <div>
      {exportConfig && (
        <div className="mb-3 flex justify-end">
          <ExportButton onClick={() => setExportModalOpen(true)} />
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50 text-xs font-medium uppercase tracking-wide text-slate-400">
                {columns.map((c) => (
                  <th key={c.label} className={`px-4 py-3 ${ALIGN_CLASS[c.align] || "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                grouped.map((g) => (
                  <React.Fragment key={g.customer}>
                    <tr>
                      <td colSpan={columns.length} className="p-0">
                        <GroupHeader
                          label={g.customer}
                          count={g.totalRows}
                          collapsed={collapsedCustomers.has(g.customer)}
                          onToggle={() => toggleCustomer(g.customer)}
                        />
                      </td>
                    </tr>
                    {!collapsedCustomers.has(g.customer) &&
                      g.types.map((t) => {
                        const typeKey = `${g.customer}::${t.type}`;
                        const typeCollapsed = collapsedTypes.has(typeKey);
                        return (
                          <React.Fragment key={typeKey}>
                            <tr>
                              <td colSpan={columns.length} className="p-0">
                                <TypeGroupHeader
                                  type={t.type}
                                  count={t.totalRows}
                                  collapsed={typeCollapsed}
                                  onToggle={() => toggleType(typeKey)}
                                />
                              </td>
                            </tr>
                            {!typeCollapsed &&
                              t.models.map((m) => {
                                const modelKey = `${typeKey}::${m.model_name}`;
                                const modelCollapsed = collapsedModels.has(modelKey);
                                const stats = productLookup?.get(modelKey);
                                return (
                                  <React.Fragment key={modelKey}>
                                    <tr>
                                      <td colSpan={columns.length} className="p-0">
                                        <ModelGroupHeader
                                          label={m.model_name}
                                          count={m.rows.length}
                                          stats={stats}
                                          collapsed={modelCollapsed}
                                          onToggle={() => toggleModel(modelKey)}
                                        />
                                      </td>
                                    </tr>
                                    {!modelCollapsed && m.rows.map(renderRow)}
                                  </React.Fragment>
                                );
                              })}
                          </React.Fragment>
                        );
                      })}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {exportConfig && (
        <ExportRangeModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          onConfirm={handleExport}
          dateHint={exportConfig.dateHint}
        />
      )}
    </div>
  );
}

function SalesHistoryTab({ rows, productLookup, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord("sales_orders", row.id, `${row.customer} / ${row.model_name} 수주 내역을 삭제할까요?`);
    if (ok) onRefresh();
  };

  return (
    <GroupedHistoryTable
      columns={[
        { label: "제조사", align: "left" },
        { label: "리비전", align: "left" },
        { label: "수주일", align: "center" },
        { label: "수량", align: "right" },
        { label: "작업", align: "center" },
      ]}
      rows={rows}
      dateField="order_date"
      productLookup={productLookup}
      emptyLabel="수주 내역이 없습니다."
      exportConfig={{
        filename: "수주내역.xlsx",
        dateHint: "수주일 기준으로 필터링합니다.",
        columns: [
          { header: "고객사", accessor: (r) => r.customer },
          { header: "구분", accessor: (r) => TYPE_LABEL[r.product_type] || r.product_type },
          { header: "모델명", accessor: (r) => r.model_name },
          { header: "리비전", accessor: (r) => r.revision || "" },
          { header: "제조사", accessor: (r) => r.manufacturer || "" },
          { header: "수량", accessor: (r) => r.quantity },
          { header: "수주일", accessor: (r) => r.order_date },
        ],
      }}
      renderRow={(r) => (
        <tr key={r.id} className="hover:bg-slate-800/40">
          <td className="px-4 py-3 text-left text-slate-400">{r.manufacturer || "-"}</td>
          <td className="px-4 py-3 text-left text-slate-400">{r.revision || "-"}</td>
          <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(r.order_date)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatQty(r.quantity)}</td>
          <td className="px-4 py-3 text-center">
            <RowActions onEdit={() => onEdit(r)} onDelete={() => handleDelete(r)} />
          </td>
        </tr>
      )}
    />
  );
}

function ShipmentRowCells({ row, onSaveExtraCost, onEdit, onDelete }) {
  const [extraCostInput, setExtraCostInput] = useState(String(row.extra_cost ?? 0));

  useEffect(() => {
    setExtraCostInput(String(row.extra_cost ?? 0));
  }, [row.extra_cost]);

  const dirty = Number(extraCostInput || 0) !== Number(row.extra_cost || 0);

  const save = async () => {
    const val = Math.max(0, Number(extraCostInput) || 0);
    await onSaveExtraCost(row, val);
  };

  return (
    <tr className="hover:bg-slate-800/40">
      <td className="px-4 py-3 text-left text-slate-400">{row.manufacturer || "-"}</td>
      <td className="px-4 py-3 text-left text-slate-400">{row.revision || "-"}</td>
      <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(row.shipment_date)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatQty(row.quantity)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatPrice(row.purchase_price, row.purchase_currency)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatPrice(row.sale_price, row.sale_currency)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            min="0"
            step="0.01"
            value={extraCostInput}
            onChange={(e) => setExtraCostInput(e.target.value)}
            className="w-20 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
          />
          {dirty && (
            <button
              onClick={save}
              title="부대비용 저장"
              className="inline-flex items-center rounded-md bg-cyan-500 px-1.5 py-1 text-slate-950 hover:bg-cyan-400"
            >
              <Check size={12} />
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
      </td>
    </tr>
  );
}

function ShipmentHistoryTab({ rows, productLookup, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord(
      "shipments",
      row.id,
      `${row.customer} / ${row.model_name} 출고 내역을 삭제할까요?\n(이 출고에서 자동 기록된 단가 이력도 함께 삭제됩니다)`
    );
    if (ok) onRefresh();
  };

  const handleSaveExtraCost = async (row, extraCost) => {
    const { error } = await supabase.from("shipments").update({ extra_cost: extraCost }).eq("id", row.id);
    if (handleSupabaseError(error, "부대비용 저장")) return;
    notifyToast("success", "부대비용이 저장되었습니다.");
    onRefresh();
  };

  return (
    <GroupedHistoryTable
      columns={[
        { label: "제조사", align: "left" },
        { label: "리비전", align: "left" },
        { label: "출고일", align: "center" },
        { label: "수량", align: "right" },
        { label: "매입가", align: "right" },
        { label: "판매가", align: "right" },
        { label: "부대비용", align: "right" },
        { label: "작업", align: "center" },
      ]}
      rows={rows}
      dateField="shipment_date"
      productLookup={productLookup}
      emptyLabel="출고 내역이 없습니다."
      exportConfig={{
        filename: "출고내역.xlsx",
        dateHint: "출고일 기준으로 필터링합니다.",
        columns: [
          { header: "고객사", accessor: (r) => r.customer },
          { header: "구분", accessor: (r) => TYPE_LABEL[r.product_type] || r.product_type },
          { header: "모델명", accessor: (r) => r.model_name },
          { header: "리비전", accessor: (r) => r.revision || "" },
          { header: "제조사", accessor: (r) => r.manufacturer || "" },
          { header: "수량", accessor: (r) => r.quantity },
          { header: "매입가", accessor: (r) => r.purchase_price },
          { header: "매입통화", accessor: (r) => r.purchase_currency },
          { header: "판매가", accessor: (r) => r.sale_price },
          { header: "판매통화", accessor: (r) => r.sale_currency },
          { header: "부대비용", accessor: (r) => r.extra_cost || 0 },
          { header: "출고일", accessor: (r) => r.shipment_date },
        ],
      }}
      renderRow={(r) => (
        <ShipmentRowCells key={r.id} row={r} onSaveExtraCost={handleSaveExtraCost} onEdit={onEdit} onDelete={handleDelete} />
      )}
    />
  );
}

function MaterialRowCells({ row, onSaveReceived, onEdit, onDelete }) {
  const [receivedInput, setReceivedInput] = useState(String(row.received_qty ?? 0));

  useEffect(() => {
    setReceivedInput(String(row.received_qty ?? 0));
  }, [row.received_qty]);

  const pending = Math.max(0, Number(row.quantity || 0) - Number(row.received_qty || 0));
  const dirty = Number(receivedInput || 0) !== Number(row.received_qty || 0);

  const save = async () => {
    const clamped = Math.min(Math.max(0, Number(receivedInput) || 0), Number(row.quantity || 0));
    await onSaveReceived(row, clamped);
  };

  const statusStyle =
    row.status === "완료"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : row.status === "부분입고"
      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-400";

  return (
    <tr className="hover:bg-slate-800/40">
      <td className="px-4 py-3 text-left text-slate-400">{row.material_maker || "-"}</td>
      <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(row.order_date)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatQty(row.quantity)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            min="0"
            max={row.quantity}
            value={receivedInput}
            onChange={(e) => setReceivedInput(e.target.value)}
            className="w-24 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
          />
          {dirty && (
            <button
              onClick={save}
              title="입고수량 저장"
              className="inline-flex items-center rounded-md bg-cyan-500 px-1.5 py-1 text-slate-950 hover:bg-cyan-400"
            >
              <Check size={12} />
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-amber-400">{formatQty(pending)}</td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
          <CircleDot size={10} />
          {row.status}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
      </td>
    </tr>
  );
}

function MaterialHistoryTab({ rows, productLookup, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord(
      "material_orders",
      row.id,
      `${row.customer} / ${row.model_name} 원자재 발주 내역을 삭제할까요?`
    );
    if (ok) onRefresh();
  };

  const handleSaveReceived = async (row, receivedQty) => {
    const { error } = await supabase.from("material_orders").update({ received_qty: receivedQty }).eq("id", row.id);
    if (handleSupabaseError(error, "입고수량 저장")) return;
    notifyToast("success", "입고수량이 저장되었습니다.");
    onRefresh();
  };

  return (
    <GroupedHistoryTable
      columns={[
        { label: "원자재 Maker", align: "left" },
        { label: "발주일", align: "center" },
        { label: "발주수량", align: "right" },
        { label: "입고수량", align: "right" },
        { label: "대기수량", align: "right" },
        { label: "상태", align: "center" },
        { label: "작업", align: "center" },
      ]}
      rows={rows}
      dateField="order_date"
      productLookup={productLookup}
      emptyLabel="원자재 발주 내역이 없습니다."
      exportConfig={{
        filename: "원자재발주내역.xlsx",
        dateHint: "발주일 기준으로 필터링합니다.",
        columns: [
          { header: "고객사", accessor: (r) => r.customer },
          { header: "구분", accessor: (r) => TYPE_LABEL[r.product_type] || r.product_type },
          { header: "모델명", accessor: (r) => r.model_name },
          { header: "원자재 Maker", accessor: (r) => r.material_maker || "" },
          { header: "발주일", accessor: (r) => r.order_date },
          { header: "발주수량", accessor: (r) => r.quantity },
          { header: "입고수량", accessor: (r) => r.received_qty },
          { header: "대기수량", accessor: (r) => Math.max(0, r.quantity - (r.received_qty || 0)) },
          { header: "상태", accessor: (r) => r.status },
        ],
      }}
      renderRow={(r) => (
        <MaterialRowCells key={r.id} row={r} onSaveReceived={handleSaveReceived} onEdit={onEdit} onDelete={handleDelete} />
      )}
    />
  );
}

function PriceHistoryTab({ rows, productLookup, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const message =
      row.source === "shipment"
        ? `${row.customer} / ${row.model_name} 단가 이력을 삭제할까요?\n(출고 내역에서 자동 기록된 이력이라, 연결된 출고 내역도 함께 삭제됩니다)`
        : `${row.customer} / ${row.model_name} 단가 이력을 삭제할까요?`;
    const ok = await deleteRecord("price_history", row.id, message);
    if (ok) onRefresh();
  };

  return (
    <GroupedHistoryTable
      columns={[
        { label: "리비전", align: "left" },
        { label: "적용일", align: "center" },
        { label: "매입가", align: "right" },
        { label: "판매가", align: "right" },
        { label: "등록경로", align: "center" },
        { label: "작업", align: "center" },
      ]}
      rows={rows}
      dateField="effective_date"
      productLookup={productLookup}
      emptyLabel="단가 변동 이력이 없습니다."
      exportConfig={{
        filename: "단가이력.xlsx",
        dateHint: "적용일 기준으로 필터링합니다.",
        columns: [
          { header: "고객사", accessor: (r) => r.customer },
          { header: "구분", accessor: (r) => TYPE_LABEL[r.product_type] || r.product_type },
          { header: "모델명", accessor: (r) => r.model_name },
          { header: "리비전", accessor: (r) => r.revision || "" },
          { header: "적용일", accessor: (r) => r.effective_date },
          { header: "매입가", accessor: (r) => r.purchase_price },
          { header: "매입통화", accessor: (r) => r.purchase_currency },
          { header: "판매가", accessor: (r) => r.sale_price },
          { header: "판매통화", accessor: (r) => r.sale_currency },
          { header: "등록경로", accessor: (r) => (r.source === "shipment" ? "출고 자동기록" : "수동 입력") },
        ],
      }}
      renderRow={(r) => (
        <tr key={r.id} className="hover:bg-slate-800/40">
          <td className="px-4 py-3 text-left text-slate-400">{r.revision || "-"}</td>
          <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(r.effective_date)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.purchase_price, r.purchase_currency)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.sale_price, r.sale_currency)}</td>
          <td className="px-4 py-3 text-center">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                r.source === "shipment"
                  ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/30"
                  : "bg-slate-700/40 text-slate-300 ring-1 ring-slate-600/50"
              }`}
            >
              <CircleDot size={10} />
              {r.source === "shipment" ? "출고 자동기록" : "수동 입력"}
            </span>
          </td>
          <td className="px-4 py-3 text-center">
            <RowActions onEdit={() => onEdit(r)} onDelete={() => handleDelete(r)} />
          </td>
        </tr>
      )}
    />
  );
}

/* =========================================================================
   이익 현황 탭 — 출고 건별 마진(총판매가-총매입가-부대비용), 최신순, 기간 필터
   ========================================================================= */
function ProfitTab({ rows }) {
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (b.shipment_date || "").localeCompare(a.shipment_date || "") || (b.created_at || "").localeCompare(a.created_at || "")
      ),
    [rows]
  );

  const filtered = useMemo(
    () => filterRowsByDateRange(sorted, "shipment_date", filterStart || null, filterEnd || null),
    [sorted, filterStart, filterEnd]
  );

  const handleExport = () => {
    exportToExcel("이익현황.xlsx", filtered, [
      { header: "고객사", accessor: (r) => r.customer },
      { header: "구분", accessor: (r) => TYPE_LABEL[r.product_type] || r.product_type },
      { header: "모델명", accessor: (r) => r.model_name },
      { header: "리비전", accessor: (r) => r.revision || "" },
      { header: "출고일", accessor: (r) => r.shipment_date },
      { header: "수량", accessor: (r) => r.quantity },
      { header: "총판매가", accessor: (r) => r.total_sale },
      { header: "판매통화", accessor: (r) => r.sale_currency },
      { header: "총부대비용", accessor: (r) => r.total_extra_cost },
      { header: "총마진(이익)", accessor: (r) => r.margin },
      { header: "총마진(KRW)", accessor: (r) => r.margin_krw },
      { header: "적용 거래조건", accessor: (r) => r.applied_rate_basis },
      { header: "임시환율여부", accessor: (r) => (r.margin_krw_is_temp ? "임시" : "") },
    ]);
  };

  return (
    <div>
      <p className="mb-3 rounded-md bg-slate-800/60 p-2.5 text-xs text-slate-400">
        이익 = (수량 × 판매가) − (수량 × 매입가) − 부대비용. 총마진(KRW)은 KRW 결제 건은 그대로, USD 결제 건은 거래처별
        거래조건(업체별 거래조건 탭)에 등록된 환율 기준으로 원화 환산한 값입니다. 환율 데이터가 없으면 "-"로 표시됩니다.
      </p>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="시작일">
            <input type="date" className={inputClass} value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
          </Field>
          <Field label="종료일">
            <input type="date" className={inputClass} value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
          </Field>
          {(filterStart || filterEnd) && (
            <button
              onClick={() => {
                setFilterStart("");
                setFilterEnd("");
              }}
              className="mb-3 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              필터 초기화
            </button>
          )}
        </div>
        <ExportButton onClick={handleExport} label="현재 화면 엑셀로 내보내기" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 text-left">고객사</th>
                <th className="px-4 py-3 text-left">모델명</th>
                <th className="px-4 py-3 text-center">출고일</th>
                <th className="px-4 py-3 text-right">수량</th>
                <th className="px-4 py-3 text-right">총 판매가</th>
                <th className="px-4 py-3 text-right">총 부대비용</th>
                <th className="px-4 py-3 text-right">총 마진(이익)</th>
                <th className="px-4 py-3 text-right">총 마진(KRW)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    표시할 이익 현황 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-left">{r.customer}</td>
                    <td className="px-4 py-3 text-left">
                      <span className="flex items-center gap-1.5">
                        <TypeBadge type={r.product_type} />
                        <span className="font-bold text-slate-100">{r.model_name}</span>
                        {r.revision && (
                          <span className="rounded bg-purple-500/10 px-1 py-0.5 text-[10px] font-medium text-purple-300">
                            {r.revision}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(r.shipment_date)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatQty(r.quantity)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatPrice(r.total_sale, r.sale_currency)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatPrice(r.total_extra_cost, r.sale_currency)}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono text-base font-bold ${
                        r.margin >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatPrice(r.margin, r.sale_currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.margin_krw === null || r.margin_krw === undefined ? (
                        <span className="font-mono text-slate-600">-</span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={`font-mono text-base font-bold ${
                              r.margin_krw >= 0 ? "text-blue-400" : "text-red-400"
                            }`}
                          >
                            {formatPrice(r.margin_krw, "KRW")}
                          </span>
                          {r.margin_krw_is_temp && (
                            <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[10px] font-medium text-amber-400">
                              (임시환율 적용)
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function useCatalogOptions(catalog, customer, manufacturer, productType) {
  const customerOptions = useMemo(
    () => Array.from(new Set(catalog.map((c) => c.customer))).sort((a, b) => a.localeCompare(b, "ko")),
    [catalog]
  );
  const manufacturerOptions = useMemo(
    () =>
      Array.from(new Set(catalog.filter((c) => c.customer === customer && c.manufacturer).map((c) => c.manufacturer))).sort(
        (a, b) => a.localeCompare(b, "ko")
      ),
    [catalog, customer]
  );
  const modelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          catalog
            .filter(
              (c) =>
                c.customer === customer &&
                c.product_type === productType &&
                (!manufacturer || c.manufacturer === manufacturer)
            )
            .map((c) => c.model_name)
        )
      ).sort((a, b) => a.localeCompare(b, "ko")),
    [catalog, customer, manufacturer, productType]
  );
  return { customerOptions, manufacturerOptions, modelOptions };
}

/* =========================================================================
   ① 수주 입력 / 수정 모달
   ========================================================================= */
function SalesOrderModal({ open, onClose, editing, catalog }) {
  const emptyForm = {
    product_type: "mp",
    model_name: "",
    customer: "",
    manufacturer: "",
    revision: "",
    quantity: "",
    order_date: todayStr(),
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        product_type: editing.product_type || "mp",
        model_name: editing.model_name || "",
        customer: editing.customer || "",
        manufacturer: editing.manufacturer || "",
        revision: editing.revision || "",
        quantity: String(editing.quantity ?? ""),
        order_date: editing.order_date || todayStr(),
      });
    } else {
      setForm(emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const { customerOptions, manufacturerOptions, modelOptions } = useCatalogOptions(
    catalog,
    form.customer,
    form.manufacturer,
    form.product_type
  );

  const submit = async () => {
    if (!form.model_name || !form.customer || !form.quantity) {
      notifyToast("error", "모델명, 고객사, 수량은 필수 입력 항목입니다.");
      return;
    }
    setSaving(true);
    const payload = {
      product_type: form.product_type,
      model_name: form.model_name,
      customer: form.customer,
      manufacturer: form.manufacturer || null,
      revision: form.product_type === "sample" ? form.revision || null : null,
      quantity: Number(form.quantity),
      order_date: form.order_date,
    };
    const { error } = editing
      ? await supabase.from("sales_orders").update(payload).eq("id", editing.id)
      : await supabase.from("sales_orders").insert(payload);
    setSaving(false);
    if (handleSupabaseError(error, editing ? "수주 내역 수정" : "수주 등록")) return;
    notifyToast("success", editing ? "수주 내역이 수정되었습니다." : "수주가 등록되었습니다.");
    onClose();
  };

  return (
    <Modal open={open} title={editing ? "수주 내역 수정" : "수주 입력"} onClose={onClose}>
      <ProductTypeToggle value={form.product_type} onChange={(v) => setForm((f) => ({ ...f, product_type: v, model_name: "" }))} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="고객사">
          <HierarchicalSelect
            value={form.customer}
            onChange={(v) => setForm((f) => ({ ...f, customer: v, manufacturer: "", model_name: "" }))}
            options={customerOptions}
            addLabel="+ 고객사 추가"
            resetKey={editing?.id || "new-sales"}
          />
        </Field>
        <Field label="제조사">
          <HierarchicalSelect
            value={form.manufacturer}
            onChange={(v) => setForm((f) => ({ ...f, manufacturer: v, model_name: "" }))}
            options={manufacturerOptions}
            addLabel="+ 제조사 추가"
            resetKey={form.customer}
          />
        </Field>
      </div>

      {form.product_type === "sample" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="모델명">
            <HierarchicalSelect
              value={form.model_name}
              onChange={(v) => setForm((f) => ({ ...f, model_name: v }))}
              options={modelOptions}
              addLabel="+ 모델명 추가"
              resetKey={`${form.customer}|${form.manufacturer}|${form.product_type}`}
            />
          </Field>
          <Field label="리비전">
            <input className={inputClass} value={form.revision} onChange={set("revision")} placeholder="예: Rev.A, v2" />
          </Field>
        </div>
      ) : (
        <Field label="모델명">
          <HierarchicalSelect
            value={form.model_name}
            onChange={(v) => setForm((f) => ({ ...f, model_name: v }))}
            options={modelOptions}
            addLabel="+ 모델명 추가"
            resetKey={`${form.customer}|${form.manufacturer}|${form.product_type}`}
          />
        </Field>
      )}

      <Field label="수량">
        <input type="number" min="0" className={inputClass} value={form.quantity} onChange={set("quantity")} />
      </Field>
      <Field label="수주일">
        <input type="date" className={inputClass} value={form.order_date} onChange={set("order_date")} />
      </Field>

      {form.product_type === "sample" && (
        <p className="mb-2 rounded-md bg-purple-500/10 p-2.5 text-xs text-purple-300">
          Sample은 리비전이 달라도 동일 프로젝트로 간주되어, 원자재 재고·누적 수주량·대시보드 통계가 모델명 기준으로 통합
          집계됩니다. 리비전은 이력 식별용으로만 사용됩니다.
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          취소
        </button>
        <PrimaryButton onClick={submit} className={saving ? "opacity-60" : ""}>
          {saving ? "저장 중..." : "저장"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/* =========================================================================
   ② 출고 입력 / 수정 모달 (매입가/판매가 자동완성 포함)
   ========================================================================= */
function ShipmentModal({ open, onClose, editing, catalog }) {
  const emptyForm = {
    product_type: "mp",
    model_name: "",
    customer: "",
    manufacturer: "",
    revision: "",
    quantity: "",
    purchase_currency: "USD",
    purchase_price: "",
    sale_currency: "USD",
    sale_price: "",
    shipment_date: todayStr(),
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        product_type: editing.product_type || "mp",
        model_name: editing.model_name || "",
        customer: editing.customer || "",
        manufacturer: editing.manufacturer || "",
        revision: editing.revision || "",
        quantity: String(editing.quantity ?? ""),
        purchase_currency: editing.purchase_currency || "USD",
        purchase_price: editing.purchase_price === null || editing.purchase_price === undefined ? "" : String(editing.purchase_price),
        sale_currency: editing.sale_currency || "KRW",
        sale_price: editing.sale_price === null || editing.sale_price === undefined ? "" : String(editing.sale_price),
        shipment_date: editing.shipment_date || todayStr(),
      });
    } else {
      setForm(emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const { customerOptions, manufacturerOptions, modelOptions } = useCatalogOptions(
    catalog,
    form.customer,
    form.manufacturer,
    form.product_type
  );

  // 신규 등록 시에만: 모델명이 정해지면 최근 매입가/판매가를 자동으로 불러옴 (수정은 자유롭게 가능)
  useEffect(() => {
    if (editing) return;
    if (!open) return;
    if (!form.customer || !form.model_name) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("purchase_price, purchase_currency, sale_price, sale_currency")
        .eq("customer", form.customer)
        .eq("model_name", form.model_name)
        .eq("product_type", form.product_type)
        .order("shipment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && !error && data) {
        setForm((f) => ({
          ...f,
          purchase_price: String(data.purchase_price),
          purchase_currency: data.purchase_currency,
          sale_price: String(data.sale_price),
          sale_currency: data.sale_currency,
        }));
        notifyToast("success", "최근 매입가/판매가를 자동으로 불러왔습니다. 필요 시 수정하세요.");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customer, form.model_name, form.product_type, editing, open]);

  const submit = async () => {
    if (!form.model_name || !form.customer || !form.quantity || form.purchase_price === "" || form.sale_price === "") {
      notifyToast("error", "모델명 · 고객사 · 수량 · 매입가 · 판매가는 필수 입력 항목입니다.");
      return;
    }
    setSaving(true);
    const payload = {
      product_type: form.product_type,
      model_name: form.model_name,
      customer: form.customer,
      manufacturer: form.manufacturer || null,
      revision: form.product_type === "sample" ? form.revision || null : null,
      quantity: Number(form.quantity),
      purchase_currency: form.purchase_currency,
      purchase_price: Number(form.purchase_price),
      sale_currency: form.sale_currency,
      sale_price: Number(form.sale_price),
      shipment_date: form.shipment_date,
    };
    const { error } = editing
      ? await supabase.from("shipments").update(payload).eq("id", editing.id)
      : await supabase.from("shipments").insert(payload);
    setSaving(false);
    if (handleSupabaseError(error, editing ? "출고 내역 수정" : "출고 등록")) return;
    notifyToast("success", editing ? "출고 내역이 수정되었습니다." : "출고가 등록되었습니다.");
    onClose();
  };

  return (
    <Modal open={open} title={editing ? "출고 내역 수정" : "출고 입력"} onClose={onClose}>
      <ProductTypeToggle value={form.product_type} onChange={(v) => setForm((f) => ({ ...f, product_type: v, model_name: "" }))} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="고객사">
          <HierarchicalSelect
            value={form.customer}
            onChange={(v) => setForm((f) => ({ ...f, customer: v, manufacturer: "", model_name: "" }))}
            options={customerOptions}
            addLabel="+ 고객사 추가"
            resetKey={editing?.id || "new-shipment"}
          />
        </Field>
        <Field label="제조사">
          <HierarchicalSelect
            value={form.manufacturer}
            onChange={(v) => setForm((f) => ({ ...f, manufacturer: v, model_name: "" }))}
            options={manufacturerOptions}
            addLabel="+ 제조사 추가"
            resetKey={form.customer}
          />
        </Field>
      </div>

      {form.product_type === "sample" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="모델명">
            <HierarchicalSelect
              value={form.model_name}
              onChange={(v) => setForm((f) => ({ ...f, model_name: v }))}
              options={modelOptions}
              addLabel="+ 모델명 추가"
              resetKey={`${form.customer}|${form.manufacturer}|${form.product_type}`}
            />
          </Field>
          <Field label="리비전">
            <input className={inputClass} value={form.revision} onChange={set("revision")} placeholder="예: Rev.A, v2" />
          </Field>
        </div>
      ) : (
        <Field label="모델명">
          <HierarchicalSelect
            value={form.model_name}
            onChange={(v) => setForm((f) => ({ ...f, model_name: v }))}
            options={modelOptions}
            addLabel="+ 모델명 추가"
            resetKey={`${form.customer}|${form.manufacturer}|${form.product_type}`}
          />
        </Field>
      )}

      <Field label="수량">
        <input type="number" min="0" className={inputClass} value={form.quantity} onChange={set("quantity")} />
      </Field>
      <Field label="매입가 (통화 3 : 금액 7)">
        <CurrencyPriceInput
          price={form.purchase_price}
          currency={form.purchase_currency}
          onPriceChange={(v) => setForm((f) => ({ ...f, purchase_price: v }))}
          onCurrencyChange={(v) => setForm((f) => ({ ...f, purchase_currency: v }))}
        />
      </Field>
      <Field label="판매가 (통화 3 : 금액 7)">
        <CurrencyPriceInput
          price={form.sale_price}
          currency={form.sale_currency}
          onPriceChange={(v) => setForm((f) => ({ ...f, sale_price: v }))}
          onCurrencyChange={(v) => setForm((f) => ({ ...f, sale_currency: v }))}
        />
      </Field>
      <Field label="출고일">
        <input type="date" className={inputClass} value={form.shipment_date} onChange={set("shipment_date")} />
      </Field>
      <p className="mb-2 rounded-md bg-slate-800/60 p-2.5 text-xs text-slate-400">
        모델명을 선택/입력하면 해당 모델의 가장 최근 매입가·판매가가 자동으로 채워집니다 (신규 등록 시에만, 자유롭게
        수정 가능). 매입가와 판매가는 서로 다른 통화로 입력할 수 있습니다. 등록/수정 시 단가 이력에도 자동 동기화됩니다.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          취소
        </button>
        <PrimaryButton onClick={submit} className={saving ? "opacity-60" : ""}>
          {saving ? "저장 중..." : "저장"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/* =========================================================================
   ③ 원자재 발주 입력 / 수정 모달
   ========================================================================= */
function MaterialOrderModal({ open, onClose, editing, catalog }) {
  const emptyForm = {
    product_type: "mp",
    model_name: "",
    material_maker: "",
    customer: "",
    manufacturer: "",
    quantity: "",
    order_date: todayStr(),
    received_qty: "0",
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        product_type: editing.product_type || "mp",
        model_name: editing.model_name || "",
        material_maker: editing.material_maker || "",
        customer: editing.customer || "",
        manufacturer: editing.manufacturer || "",
        quantity: String(editing.quantity ?? ""),
        order_date: editing.order_date || todayStr(),
        received_qty: String(editing.received_qty ?? 0),
      });
    } else {
      setForm(emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const { customerOptions, manufacturerOptions, modelOptions } = useCatalogOptions(
    catalog,
    form.customer,
    form.manufacturer,
    form.product_type
  );

  // 신규 등록 시에만: 모델명이 정해지면 가장 최근 원자재 Maker를 자동으로 불러옴
  useEffect(() => {
    if (editing) return;
    if (!open) return;
    if (!form.customer || !form.model_name) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("material_orders")
        .select("material_maker")
        .eq("customer", form.customer)
        .eq("model_name", form.model_name)
        .eq("product_type", form.product_type)
        .not("material_maker", "is", null)
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && !error && data?.material_maker) {
        setForm((f) => (f.material_maker ? f : { ...f, material_maker: data.material_maker }));
        notifyToast("success", "최근 원자재 Maker를 자동으로 불러왔습니다. 필요 시 수정하세요.");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customer, form.model_name, form.product_type, editing, open]);

  const quantityNum = Number(form.quantity) || 0;
  const receivedNum = Math.min(Math.max(0, Number(form.received_qty) || 0), quantityNum || Number(form.received_qty) || 0);
  const pendingNum = Math.max(0, quantityNum - receivedNum);

  const submit = async () => {
    if (!form.model_name || !form.customer || !form.quantity) {
      notifyToast("error", "모델명, 고객사, 발주 수량은 필수 입력 항목입니다.");
      return;
    }
    setSaving(true);
    const payload = {
      product_type: form.product_type,
      model_name: form.model_name,
      material_maker: form.material_maker || null,
      customer: form.customer,
      quantity: Number(form.quantity),
      order_date: form.order_date,
      received_qty: Math.min(Math.max(0, Number(form.received_qty) || 0), Number(form.quantity)),
    };
    const { error } = editing
      ? await supabase.from("material_orders").update(payload).eq("id", editing.id)
      : await supabase.from("material_orders").insert(payload);
    setSaving(false);
    if (handleSupabaseError(error, editing ? "원자재 발주 수정" : "원자재 발주 등록")) return;
    notifyToast("success", editing ? "원자재 발주 내역이 수정되었습니다." : "원자재 발주가 등록되었습니다.");
    onClose();
  };

  return (
    <Modal open={open} title={editing ? "원자재 발주 내역 수정" : "원자재 발주 입력"} onClose={onClose}>
      <ProductTypeToggle value={form.product_type} onChange={(v) => setForm((f) => ({ ...f, product_type: v, model_name: "" }))} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="고객사">
          <HierarchicalSelect
            value={form.customer}
            onChange={(v) => setForm((f) => ({ ...f, customer: v, manufacturer: "", model_name: "" }))}
            options={customerOptions}
            addLabel="+ 고객사 추가"
            resetKey={editing?.id || "new-material"}
          />
        </Field>
        <Field label="제조사">
          <HierarchicalSelect
            value={form.manufacturer}
            onChange={(v) => setForm((f) => ({ ...f, manufacturer: v, model_name: "" }))}
            options={manufacturerOptions}
            addLabel="+ 제조사 추가"
            resetKey={form.customer}
          />
        </Field>
      </div>

      <Field label="모델명">
        <HierarchicalSelect
          value={form.model_name}
          onChange={(v) => setForm((f) => ({ ...f, model_name: v }))}
          options={modelOptions}
          addLabel="+ 모델명 추가"
          resetKey={`${form.customer}|${form.manufacturer}|${form.product_type}`}
        />
      </Field>

      <Field label="원자재 Maker">
        <input className={inputClass} value={form.material_maker} onChange={set("material_maker")} />
      </Field>
      <Field label="발주 수량">
        <input type="number" min="0" className={inputClass} value={form.quantity} onChange={set("quantity")} />
      </Field>
      <Field label="발주일">
        <input type="date" className={inputClass} value={form.order_date} onChange={set("order_date")} />
      </Field>
      <Field label="입고(도착) 수량">
        <input
          type="number"
          min="0"
          max={form.quantity || undefined}
          className={inputClass}
          value={form.received_qty}
          onChange={set("received_qty")}
        />
      </Field>
      <p className="mb-2 rounded-md bg-slate-800/60 p-2.5 text-xs text-slate-400">
        발주 {formatQty(quantityNum)}개 중 입고 {formatQty(receivedNum)}개 → 대기(미입고) {formatQty(pendingNum)}개로 자동
        계산됩니다.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          취소
        </button>
        <PrimaryButton onClick={submit} className={saving ? "opacity-60" : ""}>
          {saving ? "저장 중..." : "저장"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/* =========================================================================
   ④ 재공 / 제품재고 수정 모달 (모델 선택 시 Sample/MP 뱃지 표시)
   ========================================================================= */
function StockEditModal({ open, onClose, products, initial }) {
  const [selectedId, setSelectedId] = useState("");
  const [wip, setWip] = useState("0");
  const [stock, setStock] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setSelectedId(initial.id);
      setWip(String(initial.wip_qty ?? 0));
      setStock(String(initial.product_stock ?? 0));
    } else {
      setSelectedId("");
      setWip("0");
      setStock("0");
    }
  }, [open, initial]);

  const onSelectProduct = (id) => {
    setSelectedId(id);
    const p = products.find((r) => r.id === id);
    if (p) {
      setWip(String(p.wip_qty ?? 0));
      setStock(String(p.product_stock ?? 0));
    }
  };

  const submit = async () => {
    if (!selectedId) return;
    setSaving(true);
    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: selectedId,
      p_new_wip: Number(wip),
      p_new_product_stock: Number(stock),
    });
    setSaving(false);
    if (handleSupabaseError(error, "재공/재고 수정")) return;
    notifyToast("success", "재공/재고가 수정되었습니다.");
    onClose();
  };

  return (
    <Modal open={open} title="재공 / 제품재고 수정" onClose={onClose}>
      <Field label="모델 선택 (고객사 - 구분 - 모델명)">
        <select className={inputClass} value={selectedId} onChange={(e) => onSelectProduct(e.target.value)}>
          <option value="">모델을 선택하세요</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.customer} - {TYPE_LABEL[p.product_type] || p.product_type} - {p.model_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="재공(생산 중) 수량">
        <input type="number" min="0" className={inputClass} value={wip} onChange={(e) => setWip(e.target.value)} />
      </Field>
      <Field label="제품 재고 수량">
        <input type="number" min="0" className={inputClass} value={stock} onChange={(e) => setStock(e.target.value)} />
      </Field>
      <p className="mb-2 flex items-start gap-1.5 rounded-md bg-slate-800/60 p-2.5 text-xs text-slate-400">
        <CalendarDays size={13} className="mt-0.5 shrink-0" />
        재공 수량이 증가하면 증가분만큼 원자재재고에서 자동으로 차감됩니다(0 미만으로는 내려가지 않음).
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          취소
        </button>
        <PrimaryButton onClick={submit} className={saving || !selectedId ? "opacity-60" : ""}>
          {saving ? "저장 중..." : "저장"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/* =========================================================================
   ⑤ 단가 이력 추가 / 수정 모달 (수동 입력)
   ========================================================================= */
function PriceHistoryModal({ open, onClose, editing, catalog }) {
  const emptyForm = {
    product_type: "mp",
    model_name: "",
    customer: "",
    manufacturer: "",
    revision: "",
    purchase_currency: "USD",
    purchase_price: "",
    sale_currency: "USD",
    sale_price: "",
    effective_date: todayStr(),
    memo: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        product_type: editing.product_type || "mp",
        model_name: editing.model_name || "",
        customer: editing.customer || "",
        manufacturer: editing.manufacturer || "",
        revision: editing.revision || "",
        purchase_currency: editing.purchase_currency || "USD",
        purchase_price: editing.purchase_price === null || editing.purchase_price === undefined ? "" : String(editing.purchase_price),
        sale_currency: editing.sale_currency || "KRW",
        sale_price: editing.sale_price === null || editing.sale_price === undefined ? "" : String(editing.sale_price),
        effective_date: editing.effective_date || todayStr(),
        memo: editing.memo || "",
      });
    } else {
      setForm(emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const { customerOptions, manufacturerOptions, modelOptions } = useCatalogOptions(
    catalog,
    form.customer,
    form.manufacturer,
    form.product_type
  );

  const submit = async () => {
    if (!form.model_name || !form.customer) {
      notifyToast("error", "모델명과 고객사는 필수 입력 항목입니다.");
      return;
    }
    setSaving(true);
    const payload = {
      product_type: form.product_type,
      model_name: form.model_name,
      customer: form.customer,
      revision: form.product_type === "sample" ? form.revision || null : null,
      purchase_currency: form.purchase_currency,
      purchase_price: form.purchase_price === "" ? null : Number(form.purchase_price),
      sale_currency: form.sale_currency,
      sale_price: form.sale_price === "" ? null : Number(form.sale_price),
      effective_date: form.effective_date,
      memo: form.memo || null,
    };
    const { error } = editing
      ? await supabase.from("price_history").update(payload).eq("id", editing.id)
      : await supabase.from("price_history").insert({ ...payload, source: "manual" });
    setSaving(false);
    if (handleSupabaseError(error, editing ? "단가 이력 수정" : "단가 이력 등록")) return;
    notifyToast("success", editing ? "단가 이력이 수정되었습니다." : "단가 이력이 등록되었습니다.");
    onClose();
  };

  return (
    <Modal open={open} title={editing ? "단가 이력 수정" : "단가 이력 추가"} onClose={onClose}>
      <ProductTypeToggle value={form.product_type} onChange={(v) => setForm((f) => ({ ...f, product_type: v, model_name: "" }))} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="고객사">
          <HierarchicalSelect
            value={form.customer}
            onChange={(v) => setForm((f) => ({ ...f, customer: v, manufacturer: "", model_name: "" }))}
            options={customerOptions}
            addLabel="+ 고객사 추가"
            resetKey={editing?.id || "new-price"}
          />
        </Field>
        <Field label="제조사">
          <HierarchicalSelect
            value={form.manufacturer}
            onChange={(v) => setForm((f) => ({ ...f, manufacturer: v, model_name: "" }))}
            options={manufacturerOptions}
            addLabel="+ 제조사 추가"
            resetKey={form.customer}
          />
        </Field>
      </div>

      {form.product_type === "sample" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="모델명">
            <HierarchicalSelect
              value={form.model_name}
              onChange={(v) => setForm((f) => ({ ...f, model_name: v }))}
              options={modelOptions}
              addLabel="+ 모델명 추가"
              resetKey={`${form.customer}|${form.manufacturer}|${form.product_type}`}
            />
          </Field>
          <Field label="리비전">
            <input className={inputClass} value={form.revision} onChange={set("revision")} placeholder="예: Rev.A, v2" />
          </Field>
        </div>
      ) : (
        <Field label="모델명">
          <HierarchicalSelect
            value={form.model_name}
            onChange={(v) => setForm((f) => ({ ...f, model_name: v }))}
            options={modelOptions}
            addLabel="+ 모델명 추가"
            resetKey={`${form.customer}|${form.manufacturer}|${form.product_type}`}
          />
        </Field>
      )}

      <Field label="매입가 (통화 3 : 금액 7)">
        <CurrencyPriceInput
          price={form.purchase_price}
          currency={form.purchase_currency}
          onPriceChange={(v) => setForm((f) => ({ ...f, purchase_price: v }))}
          onCurrencyChange={(v) => setForm((f) => ({ ...f, purchase_currency: v }))}
        />
      </Field>
      <Field label="판매가 (통화 3 : 금액 7)">
        <CurrencyPriceInput
          price={form.sale_price}
          currency={form.sale_currency}
          onPriceChange={(v) => setForm((f) => ({ ...f, sale_price: v }))}
          onCurrencyChange={(v) => setForm((f) => ({ ...f, sale_currency: v }))}
        />
      </Field>
      <Field label="적용일">
        <input type="date" className={inputClass} value={form.effective_date} onChange={set("effective_date")} />
      </Field>
      <Field label="메모 (선택)">
        <input className={inputClass} value={form.memo} onChange={set("memo")} placeholder="예: 원자재 가격 인상으로 인한 조정" />
      </Field>
      {editing && editing.source === "shipment" && (
        <p className="mb-2 rounded-md bg-cyan-500/10 p-2.5 text-xs text-cyan-300">
          이 이력은 출고 내역에서 자동 기록되었습니다. 여기서 수정하면 연결된 출고 내역의 매입가/판매가도 동일하게
          갱신되고, 삭제하면 연결된 출고 내역도 함께 삭제됩니다.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          취소
        </button>
        <PrimaryButton onClick={submit} className={saving ? "opacity-60" : ""}>
          {saving ? "저장 중..." : "저장"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/* =========================================================================
   ⑥ 업체별 거래조건 탭 + 환율 관리 (거래조건 입력으로 등록된 데이터 조회)
   ========================================================================= */
const RATE_BASIS_OPTIONS = ["당월1일~25일평균", "당월말일자", "전월말일자", "납품일자", "전월평균"];

function TradeConditionsTab({ tradeConditions, exchangeRates, onEdit, onRefreshConditions, onRefreshRates }) {
  const handleDeleteCondition = async (row) => {
    const ok = await deleteRecord("trade_conditions", row.id, `${row.subject_name} 거래조건을 삭제할까요?`);
    if (ok) onRefreshConditions();
  };

  const sortedConditions = useMemo(
    () =>
      tradeConditions
        .slice()
        .sort(
          (a, b) =>
            a.subject_type.localeCompare(b.subject_type) || a.subject_name.localeCompare(b.subject_name, "ko")
        ),
    [tradeConditions]
  );

  return (
    <div className="space-y-8">
      {/* 업체별 거래조건 목록 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-300">업체별 거래조건</h2>
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-center">구분</th>
                  <th className="px-4 py-3 text-left">업체명</th>
                  <th className="px-4 py-3 text-left">거래조건 (환율 적용 기준)</th>
                  <th className="px-4 py-3 text-left">메모</th>
                  <th className="px-4 py-3 text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {sortedConditions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      등록된 거래조건이 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedConditions.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.subject_type === "customer"
                              ? "bg-cyan-500/10 text-cyan-300"
                              : "bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {row.subject_type === "customer" ? "고객사" : "제조사"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left font-medium text-slate-100">{row.subject_name}</td>
                      <td className="px-4 py-3 text-left text-slate-300">{row.rate_basis}</td>
                      <td className="px-4 py-3 text-left text-slate-500">{row.memo || "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <RowActions onEdit={() => onEdit(row)} onDelete={() => handleDeleteCondition(row)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 rounded-md bg-slate-800/60 p-2.5 text-xs text-slate-400">
          여기 등록된 거래조건(제조사 우선, 없으면 고객사 기준)이 [이익 현황]과 대시보드 요약의 USD→KRW 환산 계산에
          자동으로 적용됩니다. 등록되지 않은 업체는 기본값으로 "납품일자(출고일 당일)" 환율이 적용됩니다.
        </p>
      </div>

      {/* 환율 관리 */}
      <ExchangeRateManager exchangeRates={exchangeRates} onRefreshRates={onRefreshRates} />
    </div>
  );
}

function ExchangeRateManager({ exchangeRates, onRefreshRates }) {
  const [manualDate, setManualDate] = useState(todayStr());
  const [manualRate, setManualRate] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  const [apiStart, setApiStart] = useState("");
  const [apiEnd, setApiEnd] = useState("");
  const [apiLoading, setApiLoading] = useState(false);

  const saveManualRate = async () => {
    if (!manualDate || !manualRate) {
      notifyToast("error", "날짜와 환율을 모두 입력하세요.");
      return;
    }
    setSavingManual(true);
    const { error } = await supabase
      .from("exchange_rates")
      .upsert([{ rate_date: manualDate, usd_krw_rate: Number(manualRate) }], { onConflict: "rate_date" });
    setSavingManual(false);
    if (handleSupabaseError(error, "환율 저장")) return;
    notifyToast("success", `${manualDate} 환율이 저장되었습니다.`);
    setManualRate("");
    onRefreshRates();
  };

  const fetchFromApi = async () => {
    if (!apiStart || !apiEnd) {
      notifyToast("error", "시작일과 종료일을 입력하세요.");
      return;
    }
    if (apiStart > apiEnd) {
      notifyToast("error", "시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }
    setApiLoading(true);
    try {
      const res = await fetch(`https://api.frankfurter.app/${apiStart}..${apiEnd}?from=USD&to=KRW`);
      if (!res.ok) throw new Error(`API 응답 오류 (${res.status})`);
      const json = await res.json();
      const entries = Object.entries(json.rates || {})
        .filter(([, v]) => v && v.KRW)
        .map(([date, v]) => ({ rate_date: date, usd_krw_rate: v.KRW }));
      if (entries.length === 0) {
        notifyToast("error", "가져온 환율 데이터가 없습니다 (주말/공휴일은 데이터가 없을 수 있습니다).");
        return;
      }
      const { error } = await supabase.from("exchange_rates").upsert(entries, { onConflict: "rate_date" });
      if (handleSupabaseError(error, "환율 저장")) return;
      notifyToast(
        "success",
        `${entries.length}일치 환율을 가져왔습니다. (참고용 근사치입니다 — 정확한 값이 필요하면 서울외국환중개 고시환율로 직접 확인 후 수동 입력으로 덮어써주세요)`
      );
      onRefreshRates();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      notifyToast("error", `환율 자동 가져오기 실패: ${e.message}`);
    } finally {
      setApiLoading(false);
    }
  };

  const handleDeleteRate = async (row) => {
    const ok = window.confirm(`${row.rate_date} 환율(₩${row.usd_krw_rate})을 삭제할까요?`);
    if (!ok) return;
    const { error } = await supabase.from("exchange_rates").delete().eq("rate_date", row.rate_date);
    if (handleSupabaseError(error, "환율 삭제")) return;
    notifyToast("success", "삭제되었습니다.");
    onRefreshRates();
  };

  const recentRates = useMemo(() => exchangeRates.slice(0, 60), [exchangeRates]);

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-300">환율 관리 (USD → KRW, 일별)</h2>
      <p className="mb-3 rounded-md bg-amber-500/10 p-2.5 text-xs text-amber-300">
        Supabase는 외부 금융 사이트 데이터를 자동으로 가져올 수 없어, 이 화면에서 환율을 직접 채워야 위 [이익
        현황]/[대시보드] 환산 계산이 동작합니다. 아래 "자동 가져오기"는 무료 공개 환율 API(Frankfurter, ECB 기준)를
        사용한 참고용 근사치이며, 서울외국환중개 고시환율과 정확히 일치하지 않을 수 있습니다. 정확한 값이 필요하면
        수동 입력으로 덮어써주세요.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 수동 입력 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">날짜 하나씩 수동 입력</h3>
          <Field label="날짜">
            <input type="date" className={inputClass} value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
          </Field>
          <Field label="환율 (1 USD = ? KRW)">
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              value={manualRate}
              onChange={(e) => setManualRate(e.target.value)}
              placeholder="예: 1380.50"
            />
          </Field>
          <PrimaryButton onClick={saveManualRate} className={savingManual ? "opacity-60" : ""}>
            {savingManual ? "저장 중..." : "저장"}
          </PrimaryButton>
        </div>

        {/* 기간 자동 가져오기 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">기간으로 한 번에 가져오기 (참고용)</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="시작일">
              <input type="date" className={inputClass} value={apiStart} onChange={(e) => setApiStart(e.target.value)} />
            </Field>
            <Field label="종료일">
              <input type="date" className={inputClass} value={apiEnd} onChange={(e) => setApiEnd(e.target.value)} />
            </Field>
          </div>
          <PrimaryButton icon={RefreshCw} onClick={fetchFromApi} className={apiLoading ? "opacity-60" : ""}>
            {apiLoading ? "가져오는 중..." : "자동 가져오기"}
          </PrimaryButton>
        </div>
      </div>

      {/* 최근 등록된 환율 목록 */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="border-b border-slate-800 bg-slate-800/90 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 text-center">날짜</th>
                <th className="px-4 py-2 text-right">환율 (₩)</th>
                <th className="px-4 py-2 text-center">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {recentRates.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                    등록된 환율이 없습니다.
                  </td>
                </tr>
              ) : (
                recentRates.map((r) => (
                  <tr key={r.rate_date} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2 text-center font-mono text-slate-300">{formatDate(r.rate_date)}</td>
                    <td className="px-4 py-2 text-right font-mono">₩ {formatQty(r.usd_krw_rate)}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => handleDeleteRate(r)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
                      >
                        <Trash2 size={11} />
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {exchangeRates.length > recentRates.length && (
        <p className="mt-1 text-right text-[11px] text-slate-600">최근 {recentRates.length}건만 표시 중 (전체 {exchangeRates.length}건 저장됨)</p>
      )}
    </div>
  );
}

/* =========================================================================
   ⑦ 거래조건 입력 / 수정 모달
   ========================================================================= */
function TradeConditionModal({ open, onClose, editing }) {
  const emptyForm = { subject_type: "manufacturer", subject_name: "", rate_basis: "", memo: "" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [customRateBasis, setCustomRateBasis] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        subject_type: editing.subject_type || "manufacturer",
        subject_name: editing.subject_name || "",
        rate_basis: editing.rate_basis || "",
        memo: editing.memo || "",
      });
      setCustomRateBasis(!RATE_BASIS_OPTIONS.includes(editing.rate_basis));
    } else {
      setForm(emptyForm);
      setCustomRateBasis(false);
    }
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.subject_name || !form.rate_basis) {
      notifyToast("error", "업체명과 거래조건은 필수 입력 항목입니다.");
      return;
    }
    setSaving(true);
    const payload = {
      subject_type: form.subject_type,
      subject_name: form.subject_name,
      rate_basis: form.rate_basis,
      memo: form.memo || null,
    };
    const { error } = editing
      ? await supabase.from("trade_conditions").update(payload).eq("id", editing.id)
      : await supabase.from("trade_conditions").upsert(payload, { onConflict: "subject_type,subject_name" });
    setSaving(false);
    if (handleSupabaseError(error, editing ? "거래조건 수정" : "거래조건 등록")) return;
    notifyToast("success", editing ? "거래조건이 수정되었습니다." : "거래조건이 등록되었습니다.");
    onClose();
  };

  return (
    <Modal open={open} title={editing ? "거래조건 수정" : "거래조건 입력"} onClose={onClose}>
      <Field label="구분">
        <select className={inputClass} value={form.subject_type} onChange={set("subject_type")}>
          <option value="customer">고객사</option>
          <option value="manufacturer">제조사</option>
        </select>
      </Field>
      <Field label="업체명">
        <input className={inputClass} value={form.subject_name} onChange={set("subject_name")} placeholder="예: 파트론" />
      </Field>
      <Field label="거래조건 (환율 적용 기준)">
        {customRateBasis ? (
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={form.rate_basis}
              onChange={set("rate_basis")}
              placeholder="예: 분기 평균 환율"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setCustomRateBasis(false)}
              className="shrink-0 rounded-md border border-slate-700 px-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              목록
            </button>
          </div>
        ) : (
          <select
            className={inputClass}
            value={RATE_BASIS_OPTIONS.includes(form.rate_basis) ? form.rate_basis : ""}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setCustomRateBasis(true);
                setForm((f) => ({ ...f, rate_basis: "" }));
              } else {
                setForm((f) => ({ ...f, rate_basis: e.target.value }));
              }
            }}
          >
            <option value="" disabled>
              선택하세요
            </option>
            <option value="__custom__">+ 직접 입력</option>
            {RATE_BASIS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="메모 (선택)">
        <input className={inputClass} value={form.memo} onChange={set("memo")} />
      </Field>
      <p className="mb-2 rounded-md bg-slate-800/60 p-2.5 text-xs text-slate-400">
        여기서 등록한 거래조건은 [이익 현황]과 대시보드 요약의 USD→KRW 환산 계산에 자동으로 반영됩니다. 같은
        구분+업체명 조합으로 다시 등록하면 기존 조건이 갱신됩니다.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          취소
        </button>
        <PrimaryButton onClick={submit} className={saving ? "opacity-60" : ""}>
          {saving ? "저장 중..." : "저장"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
