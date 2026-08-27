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
} from "lucide-react";

/* =========================================================================
   Supabase 클라이언트 설정
   ⚠️ URL / ANON KEY는 하드코딩하지 않고 Vite 환경변수로 주입받습니다.
   로컬 개발 시에는 프로젝트 루트에 .env 파일을 만들어 아래 두 값을 채우고,
   Vercel 배포 시에는 프로젝트 Settings > Environment Variables 에서
   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 각각 등록하세요.
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
   토스트 알림 (성공/실패 피드백) — 저장이 "조용히" 실패하지 않도록 함
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

// Supabase 응답의 error를 일관되게 처리: 콘솔 로그 + 토스트 알림
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

// 고객사 → 모델명 → (옵션) 최신 날짜순 정렬로 그룹핑
function groupByCustomerAndModel(rows, dateField) {
  const byCustomer = new Map();
  for (const r of rows) {
    if (!byCustomer.has(r.customer)) byCustomer.set(r.customer, new Map());
    const modelMap = byCustomer.get(r.customer);
    if (!modelMap.has(r.model_name)) modelMap.set(r.model_name, []);
    modelMap.get(r.model_name).push(r);
  }
  return Array.from(byCustomer.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([customer, modelMap]) => {
      const models = Array.from(modelMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "ko"))
        .map(([model_name, modelRows]) => {
          const sorted = dateField
            ? [...modelRows].sort((a, b) => (b[dateField] || "").localeCompare(a[dateField] || ""))
            : modelRows;
          return { model_name, rows: sorted };
        });
      const totalRows = models.reduce((sum, m) => sum + m.rows.length, 0);
      return { customer, models, totalRows };
    });
}

function flattenGrouped(grouped) {
  return grouped.flatMap((g) => g.models.flatMap((m) => m.rows));
}

// 엑셀(.xlsx) 내보내기
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
      <path
        d="M0 20 H120 L140 40 H300 L320 20 H500 L520 40 H700 L720 20 H800"
        stroke="#22d3ee"
        strokeWidth="1.5"
      />
      <path
        d="M0 90 H180 L200 70 H360 L380 90 H560 L580 70 H800"
        stroke="#f59e0b"
        strokeWidth="1.5"
      />
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
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
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

// 화폐 선택(3) : 금액 입력(7) 비율 고정 그리드 — 좁은 모달 폭에서도 입력칸이 사라지지 않음
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

// 1단계: 고객사 그룹 접기/펼치기 헤더
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

// 2단계: 모델명 그룹 접기/펼치기 헤더 — 모델명을 굵고 크게 강조 + 핵심 수치(발주잔량/재공/재고) 표시
function ModelGroupHeader({ label, count, stats, collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 border-t border-slate-800/60 bg-slate-900/70 px-4 py-2.5 text-left hover:bg-slate-800/60"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-base font-bold text-slate-50 sm:text-lg">{label}</span>
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

  // modal: 'sales' | 'shipment' | 'material' | 'stock' | 'price'
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

  /* ---------------- 데이터 조회 ---------------- */
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
    await Promise.all([
      fetchDashboard(),
      fetchSales(),
      fetchShipments(),
      fetchMaterials(),
      fetchPriceHistory(),
    ]);
    setLoading(false);
  }, [fetchDashboard, fetchSales, fetchShipments, fetchMaterials, fetchPriceHistory]);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("pcb-realtime-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        fetchDashboard();
      })
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
      .on("postgres_changes", { event: "*", schema: "public", table: "price_history" }, () => {
        fetchPriceHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- 고객사별 요약 (+ 모델명 breakdown) ---------------- */
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
        totalOrder: Number(row.total_order_qty || 0),
        delivered: Number(row.delivered_qty || 0),
        balance: Number(row.order_balance || 0),
      });
    }
    return Array.from(map.values()).sort((a, b) => a.customer.localeCompare(b.customer, "ko"));
  }, [dashboardRows]);

  // 고객사+모델명 → 발주잔량/재공/재고 조회용 (모든 내역 테이블에서 모델 헤더 옆에 표시)
  const productLookup = useMemo(() => {
    const map = new Map();
    for (const r of dashboardRows) {
      map.set(`${r.customer}::${r.model_name}`, {
        order_balance: r.order_balance,
        wip_qty: r.wip_qty,
        product_stock: r.product_stock,
      });
    }
    return map;
  }, [dashboardRows]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* ---------------- 헤더 ---------------- */}
      <header className="relative overflow-hidden border-b border-slate-800 bg-slate-900">
        <TraceHeaderPattern />
        <div className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30">
              <Cpu size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-50">
                PCB 제품 · 원자재 통합 현황판
              </h1>
              <p className="text-xs text-slate-400">실시간 동기화 · 담당자 2인 공용</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {lastSync ? `마지막 갱신 ${lastSync.toLocaleTimeString("ko-KR")}` : "동기화 중..."}
          </div>
        </div>

        {/* 탭 네비게이션 */}
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
                tab === t.key
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ---------------- 액션 바 ---------------- */}
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

      {/* ---------------- 본문 ---------------- */}
      <main className="mx-auto max-w-7xl px-6 py-6">
        {tab === "dashboard" && (
          <DashboardTab
            rows={dashboardRows}
            summary={summaryByCustomer}
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

      {/* ---------------- 모달들 ---------------- */}
      <SalesOrderModal open={modal === "sales"} onClose={closeModal} editing={editingRecord} />
      <ShipmentModal open={modal === "shipment"} onClose={closeModal} editing={editingRecord} />
      <MaterialOrderModal open={modal === "material"} onClose={closeModal} editing={editingRecord} />
      <PriceHistoryModal open={modal === "price"} onClose={closeModal} editing={editingRecord} />
      <StockEditModal
        open={modal === "stock"}
        onClose={closeModal}
        products={dashboardRows}
        initial={editingRecord}
      />

      <ToastHost />
    </div>
  );
}

/* =========================================================================
   대시보드 탭 (고객사 → 모델명 2단계 아코디언, 엑셀 내보내기)
   ========================================================================= */
function DashboardTab({ rows, summary, onEditStock }) {
  const grouped = useMemo(() => groupByCustomerAndModel(rows), [rows]);
  const [collapsedCustomers, setCollapsedCustomers] = useState(() => new Set());
  const [collapsedModels, setCollapsedModels] = useState(() => new Set());

  const toggleCustomer = (customer) =>
    setCollapsedCustomers((prev) => {
      const next = new Set(prev);
      next.has(customer) ? next.delete(customer) : next.add(customer);
      return next;
    });
  const toggleModel = (key) =>
    setCollapsedModels((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleExport = () => {
    exportToExcel("대시보드_현황.xlsx", flattenGrouped(grouped), [
      { header: "고객사", accessor: (r) => r.customer },
      { header: "모델명", accessor: (r) => r.model_name },
      { header: "총수주량", accessor: (r) => r.total_order_qty },
      { header: "제품재고", accessor: (r) => r.product_stock },
      { header: "재공", accessor: (r) => r.wip_qty },
      { header: "납품완료", accessor: (r) => r.delivered_qty },
      { header: "발주잔량", accessor: (r) => r.order_balance },
      { header: "원자재재고", accessor: (r) => r.material_stock },
      { header: "원자재대기", accessor: (r) => r.material_waiting },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* 상단 요약 카드 (고객사별 + 모델명 breakdown) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            아직 등록된 데이터가 없습니다. 상단 버튼으로 수주/출고/원자재 발주를 입력해보세요.
          </div>
        )}
        {summary.map((s) => (
          <div key={s.customer} className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-slate-300">
              <Building2 size={16} className="text-cyan-400" />
              <span className="text-sm font-semibold">{s.customer}</span>
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

            {/* 모델명 breakdown (볼드 강조) */}
            <div className="mt-4 space-y-1.5 border-t border-slate-800 pt-3">
              {s.models
                .slice()
                .sort((a, b) => a.model_name.localeCompare(b.model_name, "ko"))
                .map((m) => (
                  <div key={m.model_name} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-sans text-sm font-bold text-slate-100">{m.model_name}</span>
                    <span className="shrink-0 font-mono text-slate-500">
                      총 {formatQty(m.totalOrder)} · 완료 {formatQty(m.delivered)} · 잔량 {formatQty(m.balance)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* 메인 현황 테이블 : 고객사 → 모델명 2단계 아코디언 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">모델별 실시간 현황</h2>
          <ExportButton onClick={handleExport} />
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">구분</th>
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
                        g.models.map((m) => {
                          const r = m.rows[0];
                          const modelKey = `${g.customer}::${m.model_name}`;
                          const modelCollapsed = collapsedModels.has(modelKey);
                          return (
                            <React.Fragment key={modelKey}>
                              <tr>
                                <td colSpan={9} className="p-0">
                                  <ModelGroupHeader
                                    label={m.model_name}
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
                              {!modelCollapsed && (
                                <tr className="hover:bg-slate-800/40">
                                  <td className="px-4 py-3 font-sans text-xs text-slate-500">상세 지표</td>
                                  <td className="px-4 py-3 text-right">{formatQty(r.total_order_qty)}</td>
                                  <td className="px-4 py-3 text-right">{formatQty(r.product_stock)}</td>
                                  <td className="px-4 py-3 text-right text-cyan-300">{formatQty(r.wip_qty)}</td>
                                  <td className="px-4 py-3 text-right text-emerald-400">{formatQty(r.delivered_qty)}</td>
                                  <td className="px-4 py-3 text-right text-amber-400">{formatQty(r.order_balance)}</td>
                                  <td className="px-4 py-3 text-right">{formatQty(r.material_stock)}</td>
                                  <td className="px-4 py-3 text-right text-amber-400">{formatQty(r.material_waiting)}</td>
                                  <td className="px-4 py-3 text-center font-sans">
                                    <button
                                      onClick={() => onEditStock(r)}
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                                    >
                                      <Pencil size={12} />
                                      수정
                                    </button>
                                  </td>
                                </tr>
                              )}
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
    </div>
  );
}

/* =========================================================================
   내역 조회 탭 공용: 고객사(1단계) → 모델명(2단계) 아코디언 + 엑셀 내보내기
   ========================================================================= */
function GroupedHistoryTable({ columns, rows, dateField, renderRow, emptyLabel, exportConfig, productLookup }) {
  const grouped = useMemo(() => groupByCustomerAndModel(rows, dateField), [rows, dateField]);
  const [collapsedCustomers, setCollapsedCustomers] = useState(() => new Set());
  const [collapsedModels, setCollapsedModels] = useState(() => new Set());

  const toggleCustomer = (customer) =>
    setCollapsedCustomers((prev) => {
      const next = new Set(prev);
      next.has(customer) ? next.delete(customer) : next.add(customer);
      return next;
    });
  const toggleModel = (key) =>
    setCollapsedModels((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div>
      {exportConfig && (
        <div className="mb-3 flex justify-end">
          <ExportButton
            onClick={() => exportToExcel(exportConfig.filename, flattenGrouped(grouped), exportConfig.columns)}
          />
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                {columns.map((c) => (
                  <th key={c} className="px-4 py-3">
                    {c}
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
                      g.models.map((m) => {
                        const modelKey = `${g.customer}::${m.model_name}`;
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SalesHistoryTab({ rows, productLookup, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord(
      "sales_orders",
      row.id,
      `${row.customer} / ${row.model_name} 수주 내역을 삭제할까요?`
    );
    if (ok) onRefresh();
  };

  return (
    <GroupedHistoryTable
      columns={["제조사", "수주일", "수량", "작업"]}
      rows={rows}
      dateField="order_date"
      productLookup={productLookup}
      emptyLabel="수주 내역이 없습니다."
      exportConfig={{
        filename: "수주내역.xlsx",
        columns: [
          { header: "고객사", accessor: (r) => r.customer },
          { header: "모델명", accessor: (r) => r.model_name },
          { header: "제조사", accessor: (r) => r.manufacturer || "" },
          { header: "수량", accessor: (r) => r.quantity },
          { header: "수주일", accessor: (r) => r.order_date },
        ],
      }}
      renderRow={(r) => (
        <tr key={r.id} className="hover:bg-slate-800/40">
          <td className="px-4 py-3 text-slate-400">{r.manufacturer || "-"}</td>
          <td className="px-4 py-3 font-mono text-slate-300">{formatDate(r.order_date)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatQty(r.quantity)}</td>
          <td className="px-4 py-3">
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
      `${row.customer} / ${row.model_name} 출고 내역을 삭제할까요?`
    );
    if (ok) onRefresh();
  };

  return (
    <GroupedHistoryTable
      columns={["제조사", "출고일", "수량", "매입가", "판매가", "작업"]}
      rows={rows}
      dateField="shipment_date"
      productLookup={productLookup}
      emptyLabel="출고 내역이 없습니다."
      exportConfig={{
        filename: "출고내역.xlsx",
        columns: [
          { header: "고객사", accessor: (r) => r.customer },
          { header: "모델명", accessor: (r) => r.model_name },
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
          <td className="px-4 py-3 text-slate-400">{r.manufacturer || "-"}</td>
          <td className="px-4 py-3 font-mono text-slate-300">{formatDate(r.shipment_date)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatQty(r.quantity)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.purchase_price, r.purchase_currency)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.sale_price, r.sale_currency)}</td>
          <td className="px-4 py-3">
            <RowActions onEdit={() => onEdit(r)} onDelete={() => handleDelete(r)} />
          </td>
        </tr>
      )}
    />
  );
}

// 원자재 발주 행: 입고(도착) 수량을 직접 입력하는 부분입고 인라인 편집 포함
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
      <td className="px-4 py-3 text-slate-400">{row.material_maker || "-"}</td>
      <td className="px-4 py-3 font-mono text-slate-300">{formatDate(row.order_date)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatQty(row.quantity)}</td>
      <td className="px-4 py-3">
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
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
          <CircleDot size={10} />
          {row.status}
        </span>
      </td>
      <td className="px-4 py-3">
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
      columns={["원자재 Maker", "발주일", "발주수량", "입고수량", "대기수량", "상태", "작업"]}
      rows={rows}
      dateField="order_date"
      productLookup={productLookup}
      emptyLabel="원자재 발주 내역이 없습니다."
      exportConfig={{
        filename: "원자재발주내역.xlsx",
        columns: [
          { header: "고객사", accessor: (r) => r.customer },
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
        <MaterialRowCells
          key={r.id}
          row={r}
          onSaveReceived={handleSaveReceived}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      )}
    />
  );
}

function PriceHistoryTab({ rows, productLookup, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord(
      "price_history",
      row.id,
      `${row.customer} / ${row.model_name} 단가 이력을 삭제할까요?`
    );
    if (ok) onRefresh();
  };

  return (
    <GroupedHistoryTable
      columns={["적용일", "매입가", "판매가", "등록경로", "작업"]}
      rows={rows}
      dateField="effective_date"
      productLookup={productLookup}
      emptyLabel="단가 변동 이력이 없습니다."
      exportConfig={{
        filename: "단가이력.xlsx",
        columns: [
          { header: "고객사", accessor: (r) => r.customer },
          { header: "모델명", accessor: (r) => r.model_name },
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
          <td className="px-4 py-3 font-mono text-slate-300">{formatDate(r.effective_date)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.purchase_price, r.purchase_currency)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.sale_price, r.sale_currency)}</td>
          <td className="px-4 py-3">
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
          <td className="px-4 py-3">
            <RowActions onEdit={() => onEdit(r)} onDelete={() => handleDelete(r)} />
          </td>
        </tr>
      )}
    />
  );
}

/* =========================================================================
   ① 수주 입력 / 수정 모달 (단가 필드 없음)
   ========================================================================= */
function SalesOrderModal({ open, onClose, editing }) {
  const emptyForm = {
    model_name: "",
    customer: "",
    manufacturer: "",
    quantity: "",
    order_date: todayStr(),
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        model_name: editing.model_name || "",
        customer: editing.customer || "",
        manufacturer: editing.manufacturer || "",
        quantity: String(editing.quantity ?? ""),
        order_date: editing.order_date || todayStr(),
      });
    } else {
      setForm(emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.model_name || !form.customer || !form.quantity) {
      notifyToast("error", "모델명, 고객사, 수량은 필수 입력 항목입니다.");
      return;
    }
    setSaving(true);
    const payload = {
      model_name: form.model_name,
      customer: form.customer,
      manufacturer: form.manufacturer || null,
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
      <Field label="모델명">
        <input className={inputClass} value={form.model_name} onChange={set("model_name")} />
      </Field>
      <Field label="고객사">
        <input className={inputClass} value={form.customer} onChange={set("customer")} />
      </Field>
      <Field label="제조사">
        <input className={inputClass} value={form.manufacturer} onChange={set("manufacturer")} />
      </Field>
      <Field label="수량">
        <input type="number" min="0" className={inputClass} value={form.quantity} onChange={set("quantity")} />
      </Field>
      <Field label="수주일">
        <input type="date" className={inputClass} value={form.order_date} onChange={set("order_date")} />
      </Field>
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
   ② 출고 입력 / 수정 모달 (매입가/판매가 각각 별도 통화)
   ========================================================================= */
function ShipmentModal({ open, onClose, editing }) {
  const emptyForm = {
    model_name: "",
    customer: "",
    manufacturer: "",
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
        model_name: editing.model_name || "",
        customer: editing.customer || "",
        manufacturer: editing.manufacturer || "",
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

  const submit = async () => {
    if (!form.model_name || !form.customer || !form.quantity || form.purchase_price === "" || form.sale_price === "") {
      notifyToast("error", "모델명 · 고객사 · 수량 · 매입가 · 판매가는 필수 입력 항목입니다.");
      return;
    }
    setSaving(true);
    const payload = {
      model_name: form.model_name,
      customer: form.customer,
      manufacturer: form.manufacturer || null,
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
      <Field label="모델명">
        <input className={inputClass} value={form.model_name} onChange={set("model_name")} />
      </Field>
      <Field label="고객사">
        <input className={inputClass} value={form.customer} onChange={set("customer")} />
      </Field>
      <Field label="제조사">
        <input className={inputClass} value={form.manufacturer} onChange={set("manufacturer")} />
      </Field>
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
        매입가와 판매가는 서로 다른 통화로 입력할 수 있습니다 (예: 매입 USD / 판매 KRW). 저장 시 단가 이력(단가 이력 탭)에 자동으로 기록됩니다.
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
   ③ 원자재 발주 입력 / 수정 모달 (입고수량 직접 입력 — 부분입고 지원)
   ========================================================================= */
function MaterialOrderModal({ open, onClose, editing }) {
  const emptyForm = {
    model_name: "",
    material_maker: "",
    customer: "",
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
        model_name: editing.model_name || "",
        material_maker: editing.material_maker || "",
        customer: editing.customer || "",
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
      <Field label="모델명">
        <input className={inputClass} value={form.model_name} onChange={set("model_name")} />
      </Field>
      <Field label="원자재 Maker">
        <input className={inputClass} value={form.material_maker} onChange={set("material_maker")} />
      </Field>
      <Field label="고객사">
        <input className={inputClass} value={form.customer} onChange={set("customer")} />
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
        발주 {formatQty(quantityNum)}개 중 입고 {formatQty(receivedNum)}개 → 대기(미입고) {formatQty(pendingNum)}개로 자동 계산됩니다. 부분 입고 시에는 도착한 수량만큼만 입력하세요.
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
   ④ 재공 / 제품재고 수정 모달
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
      <Field label="모델 선택 (고객사 - 모델명)">
        <select className={inputClass} value={selectedId} onChange={(e) => onSelectProduct(e.target.value)}>
          <option value="">모델을 선택하세요</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.customer} - {p.model_name}
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
   ⑤ 단가 이력 추가 / 수정 모달 (수동 입력, 매입/판매 각각 별도 통화)
   ========================================================================= */
function PriceHistoryModal({ open, onClose, editing }) {
  const emptyForm = {
    model_name: "",
    customer: "",
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
        model_name: editing.model_name || "",
        customer: editing.customer || "",
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

  const submit = async () => {
    if (!form.model_name || !form.customer) {
      notifyToast("error", "모델명과 고객사는 필수 입력 항목입니다.");
      return;
    }
    setSaving(true);
    const payload = {
      model_name: form.model_name,
      customer: form.customer,
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
      <Field label="모델명">
        <input className={inputClass} value={form.model_name} onChange={set("model_name")} />
      </Field>
      <Field label="고객사">
        <input className={inputClass} value={form.customer} onChange={set("customer")} />
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
      <Field label="적용일">
        <input type="date" className={inputClass} value={form.effective_date} onChange={set("effective_date")} />
      </Field>
      <Field label="메모 (선택)">
        <input className={inputClass} value={form.memo} onChange={set("memo")} placeholder="예: 원자재 가격 인상으로 인한 조정" />
      </Field>
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
