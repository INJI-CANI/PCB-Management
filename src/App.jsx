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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchDashboard(), fetchSales(), fetchShipments(), fetchMaterials(), fetchPriceHistory()]);
    setLoading(false);
  }, [fetchDashboard, fetchSales, fetchShipments, fetchMaterials, fetchPriceHistory]);

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
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "material_orders" }, () => {
        fetchDashboard();
        fetchMaterials();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "price_history" }, () => fetchPriceHistory())
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
            revisionsByModel={revisionsByModel}
            onEditStock={(row) => openEdit("stock", row)}
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
      </main>

      <SalesOrderModal open={modal === "sales"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <ShipmentModal open={modal === "shipment"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <MaterialOrderModal open={modal === "material"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <PriceHistoryModal open={modal === "price"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <StockEditModal open={modal === "stock"} onClose={closeModal} products={dashboardRows} initial={editingRecord} />

      <ToastHost />
    </div>
  );
}

/* =========================================================================
   대시보드 탭 (고객사 → 구분 → 모델명 3단계 아코디언 + 기간필터 엑셀)
   ========================================================================= */
function DashboardTab({ rows, summary, revisionsByModel, onEditStock }) {
  const grouped = useMemo(() => groupByCustomerTypeModel(rows), [rows]);
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
      {/* 상단 요약 카드 (고객사별, 2-Track 정보 전환) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {summary.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            아직 등록된 데이터가 없습니다. 상단 버튼으로 수주/출고/원자재 발주를 입력해보세요.
          </div>
        )}
        {summary.map((s) => (
          <CustomerSummaryCard key={s.customer} summary={s} revisionsByModel={revisionsByModel} />
        ))}
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
                  <th className="px-4 py-3 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono">
                {grouped.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center font-sans text-slate-500">
                      표시할 모델 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  grouped.map((g) => (
                    <React.Fragment key={g.customer}>
                      <tr>
                        <td colSpan={9} className="p-0">
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
                                <td colSpan={9} className="p-0">
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
                                        <td colSpan={9} className="p-0">
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
                                      {!modelCollapsed && <DashboardDetailRow row={r} onEditStock={onEditStock} />}
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

// 고객사 요약 카드: [원자재 현황] / [발주잔량 현황] 2-Track 전환
function CustomerSummaryCard({ summary: s, revisionsByModel }) {
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

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[11px] text-slate-500">총 수주량</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-100">{formatQty(s.totalOrder)}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">납품 완료</div>
          <div className="mt-1 font-mono text-lg font-semibold text-emerald-400">{formatQty(s.delivered)}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">발주 잔량</div>
          <div className="mt-1 font-mono text-lg font-semibold text-amber-400">{formatQty(s.balance)}</div>
        </div>
      </div>

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
function DashboardDetailRow({ row, onEditStock }) {
  const [editingStock, setEditingStock] = useState(false);
  const [stockInput, setStockInput] = useState(String(row.material_stock ?? 0));
  const [editingWaiting, setEditingWaiting] = useState(false);
  const [convertQty, setConvertQty] = useState("");

  useEffect(() => {
    setStockInput(String(row.material_stock ?? 0));
  }, [row.material_stock]);

  const saveMaterialStock = async () => {
    const { error } = await supabase.rpc("set_material_stock", {
      p_product_id: row.id,
      p_new_value: Number(stockInput) || 0,
    });
    if (handleSupabaseError(error, "원자재재고 수정")) return;
    notifyToast("success", "원자재재고가 수정되었습니다.");
    setEditingStock(false);
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
      <td className="px-4 py-3 text-right">{formatQty(row.product_stock)}</td>
      <td className="px-4 py-3 text-right text-cyan-300">{formatQty(row.wip_qty)}</td>
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
      <td className="px-4 py-3 text-center font-sans">
        <button
          onClick={() => onEditStock(row)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          <Pencil size={12} />
          수정
        </button>
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

function ShipmentHistoryTab({ rows, productLookup, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord(
      "shipments",
      row.id,
      `${row.customer} / ${row.model_name} 출고 내역을 삭제할까요?\n(이 출고에서 자동 기록된 단가 이력도 함께 삭제됩니다)`
    );
    if (ok) onRefresh();
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
          { header: "출고일", accessor: (r) => r.shipment_date },
        ],
      }}
      renderRow={(r) => (
        <tr key={r.id} className="hover:bg-slate-800/40">
          <td className="px-4 py-3 text-left text-slate-400">{r.manufacturer || "-"}</td>
          <td className="px-4 py-3 text-left text-slate-400">{r.revision || "-"}</td>
          <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(r.shipment_date)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatQty(r.quantity)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.purchase_price, r.purchase_currency)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.sale_price, r.sale_currency)}</td>
          <td className="px-4 py-3 text-center">
            <RowActions onEdit={() => onEdit(r)} onDelete={() => handleDelete(r)} />
          </td>
        </tr>
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
   계층형 카탈로그 훅 — 고객사 → 제조사 → 모델명(구분별) 옵션 계산
   ========================================================================= */
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
    sale_currency: "KRW",
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
    sale_currency: "KRW",
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
