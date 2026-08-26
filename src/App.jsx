import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Cpu,
  Plus,
  X,
  LayoutDashboard,
  ClipboardList,
  Truck,
  Boxes,
  Pencil,
  RefreshCw,
  CircleDot,
  Building2,
  CalendarDays,
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
   포맷 유틸
   ========================================================================= */
const CURRENCY_SYMBOL = { KRW: "₩", USD: "$" };

function formatPrice(value, currency) {
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

/* =========================================================================
   공용 UI 조각
   ========================================================================= */
function TraceHeaderPattern() {
  // PCB 회로 기판 트레이스를 형상화한 배경 장식 (시그니처 요소)
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
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500";

function CurrencyPriceInput({ price, currency, onPriceChange, onCurrencyChange }) {
  return (
    <div className="flex gap-2">
      <select
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value)}
        className={`${inputClass} w-28 shrink-0`}
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
        className={inputClass}
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

/* =========================================================================
   메인 앱
   ========================================================================= */
export default function App() {
  const [tab, setTab] = useState("dashboard");

  const [dashboardRows, setDashboardRows] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [shipmentRows, setShipmentRows] = useState([]);
  const [materialRows, setMaterialRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  const [modal, setModal] = useState(null); // 'sales' | 'shipment' | 'material' | 'stock'
  const [editingProduct, setEditingProduct] = useState(null);

  /* ---------------- 데이터 조회 ---------------- */
  const fetchDashboard = useCallback(async () => {
    const { data, error } = await supabase
      .from("dashboard_view")
      .select("*")
      .order("customer", { ascending: true })
      .order("model_name", { ascending: true });
    if (!error) setDashboardRows(data || []);
    setLastSync(new Date());
  }, []);

  const fetchSales = useCallback(async () => {
    const { data, error } = await supabase
      .from("sales_orders")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!error) setSalesRows(data || []);
  }, []);

  const fetchShipments = useCallback(async () => {
    const { data, error } = await supabase
      .from("shipments")
      .select("*")
      .order("shipment_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!error) setShipmentRows(data || []);
  }, []);

  const fetchMaterials = useCallback(async () => {
    const { data, error } = await supabase
      .from("material_orders")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!error) setMaterialRows(data || []);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchDashboard(), fetchSales(), fetchShipments(), fetchMaterials()]);
    setLoading(false);
  }, [fetchDashboard, fetchSales, fetchShipments, fetchMaterials]);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- 고객사별 요약 ---------------- */
  const summaryByCustomer = useMemo(() => {
    const map = new Map();
    for (const row of dashboardRows) {
      const cur = map.get(row.customer) || { customer: row.customer, totalOrder: 0, delivered: 0, balance: 0 };
      cur.totalOrder += Number(row.total_order_qty || 0);
      cur.delivered += Number(row.delivered_qty || 0);
      cur.balance += Number(row.order_balance || 0);
      map.set(row.customer, cur);
    }
    return Array.from(map.values());
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
        <nav className="relative mx-auto flex max-w-7xl gap-1 px-6">
          {[
            { key: "dashboard", label: "실시간 대시보드", icon: LayoutDashboard },
            { key: "sales", label: "수주 내역", icon: ClipboardList },
            { key: "shipment", label: "출고 내역", icon: Truck },
            { key: "material", label: "원자재 발주 내역", icon: Boxes },
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
        <PrimaryButton icon={Plus} onClick={() => setModal("sales")}>
          수주 입력
        </PrimaryButton>
        <PrimaryButton icon={Plus} onClick={() => setModal("shipment")}>
          출고 입력
        </PrimaryButton>
        <PrimaryButton icon={Plus} onClick={() => setModal("material")}>
          원자재 발주 입력
        </PrimaryButton>
        <button
          onClick={() => {
            setEditingProduct(null);
            setModal("stock");
          }}
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
            onEditStock={(row) => {
              setEditingProduct(row);
              setModal("stock");
            }}
          />
        )}
        {tab === "sales" && <SalesHistoryTab rows={salesRows} />}
        {tab === "shipment" && <ShipmentHistoryTab rows={shipmentRows} />}
        {tab === "material" && <MaterialHistoryTab rows={materialRows} />}
      </main>

      {/* ---------------- 모달들 ---------------- */}
      <SalesOrderModal open={modal === "sales"} onClose={() => setModal(null)} />
      <ShipmentModal open={modal === "shipment"} onClose={() => setModal(null)} />
      <MaterialOrderModal open={modal === "material"} onClose={() => setModal(null)} />
      <StockEditModal
        open={modal === "stock"}
        onClose={() => setModal(null)}
        products={dashboardRows}
        initial={editingProduct}
      />
    </div>
  );
}

/* =========================================================================
   대시보드 탭
   ========================================================================= */
function DashboardTab({ rows, summary, onEditStock }) {
  return (
    <div className="space-y-6">
      {/* 상단 요약 카드 (고객사별) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            아직 등록된 데이터가 없습니다. 상단 버튼으로 수주/출고/원자재 발주를 입력해보세요.
          </div>
        )}
        {summary.map((s) => (
          <div
            key={s.customer}
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm"
          >
            <div className="mb-3 flex items-center gap-2 text-slate-300">
              <Building2 size={16} className="text-cyan-400" />
              <span className="text-sm font-semibold">{s.customer}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[11px] text-slate-500">총 수주량</div>
                <div className="mt-1 font-mono text-lg font-semibold text-slate-100">
                  {formatQty(s.totalOrder)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">납품 완료</div>
                <div className="mt-1 font-mono text-lg font-semibold text-emerald-400">
                  {formatQty(s.delivered)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">발주 잔량</div>
                <div className="mt-1 font-mono text-lg font-semibold text-amber-400">
                  {formatQty(s.balance)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 메인 현황 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/50 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">고객사</th>
              <th className="px-4 py-3">모델명</th>
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
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-sans text-slate-300">{r.customer}</td>
                <td className="px-4 py-3 font-sans font-medium text-slate-100">{r.model_name}</td>
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
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center font-sans text-slate-500">
                  표시할 모델 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   내역 조회 탭들
   ========================================================================= */
function HistoryTable({ columns, rows, renderRow, emptyLabel }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
      <table className="w-full min-w-[900px] text-sm">
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
            rows.map(renderRow)
          )}
        </tbody>
      </table>
    </div>
  );
}

function SalesHistoryTab({ rows }) {
  return (
    <HistoryTable
      columns={["수주일", "고객사", "모델명", "제조사", "수량", "판매단가"]}
      rows={rows}
      emptyLabel="수주 내역이 없습니다."
      renderRow={(r) => (
        <tr key={r.id} className="hover:bg-slate-800/40">
          <td className="px-4 py-3 font-mono text-slate-300">{formatDate(r.order_date)}</td>
          <td className="px-4 py-3">{r.customer}</td>
          <td className="px-4 py-3 font-medium text-slate-100">{r.model_name}</td>
          <td className="px-4 py-3 text-slate-400">{r.manufacturer || "-"}</td>
          <td className="px-4 py-3 text-right font-mono">{formatQty(r.quantity)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.unit_price, r.currency)}</td>
        </tr>
      )}
    />
  );
}

function ShipmentHistoryTab({ rows }) {
  return (
    <HistoryTable
      columns={["출고일", "고객사", "모델명", "제조사", "수량", "구매단가"]}
      rows={rows}
      emptyLabel="출고 내역이 없습니다."
      renderRow={(r) => (
        <tr key={r.id} className="hover:bg-slate-800/40">
          <td className="px-4 py-3 font-mono text-slate-300">{formatDate(r.shipment_date)}</td>
          <td className="px-4 py-3">{r.customer}</td>
          <td className="px-4 py-3 font-medium text-slate-100">{r.model_name}</td>
          <td className="px-4 py-3 text-slate-400">{r.manufacturer || "-"}</td>
          <td className="px-4 py-3 text-right font-mono">{formatQty(r.quantity)}</td>
          <td className="px-4 py-3 text-right font-mono">{formatPrice(r.unit_price, r.currency)}</td>
        </tr>
      )}
    />
  );
}

function MaterialHistoryTab({ rows }) {
  return (
    <HistoryTable
      columns={["발주일", "모델명", "원자재 Maker", "고객사", "수량", "입고상태"]}
      rows={rows}
      emptyLabel="원자재 발주 내역이 없습니다."
      renderRow={(r) => (
        <tr key={r.id} className="hover:bg-slate-800/40">
          <td className="px-4 py-3 font-mono text-slate-300">{formatDate(r.order_date)}</td>
          <td className="px-4 py-3 font-medium text-slate-100">{r.model_name}</td>
          <td className="px-4 py-3 text-slate-400">{r.material_maker || "-"}</td>
          <td className="px-4 py-3">{r.customer}</td>
          <td className="px-4 py-3 text-right font-mono">{formatQty(r.quantity)}</td>
          <td className="px-4 py-3">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                r.status === "완료"
                  ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30"
              }`}
            >
              <CircleDot size={10} />
              {r.status}
            </span>
          </td>
        </tr>
      )}
    />
  );
}

/* =========================================================================
   ① 수주 입력 모달
   ========================================================================= */
function SalesOrderModal({ open, onClose }) {
  const empty = {
    model_name: "",
    customer: "",
    manufacturer: "",
    quantity: "",
    unit_price: "",
    currency: "KRW",
    order_date: todayStr(),
  };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.model_name || !form.customer || !form.quantity || !form.unit_price) return;
    setSaving(true);
    const { error } = await supabase.from("sales_orders").insert({
      model_name: form.model_name,
      customer: form.customer,
      manufacturer: form.manufacturer || null,
      quantity: Number(form.quantity),
      unit_price: Number(form.unit_price),
      currency: form.currency,
      order_date: form.order_date,
    });
    setSaving(false);
    if (!error) onClose();
  };

  return (
    <Modal open={open} title="수주 입력" onClose={onClose}>
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
      <Field label="판매단가 (소수점 5자리까지)">
        <CurrencyPriceInput
          price={form.unit_price}
          currency={form.currency}
          onPriceChange={(v) => setForm((f) => ({ ...f, unit_price: v }))}
          onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
        />
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
   ② 출고 입력 모달
   ========================================================================= */
function ShipmentModal({ open, onClose }) {
  const empty = {
    model_name: "",
    customer: "",
    manufacturer: "",
    quantity: "",
    unit_price: "",
    currency: "KRW",
    shipment_date: todayStr(),
  };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.model_name || !form.customer || !form.quantity || !form.unit_price) return;
    setSaving(true);
    const { error } = await supabase.from("shipments").insert({
      model_name: form.model_name,
      customer: form.customer,
      manufacturer: form.manufacturer || null,
      quantity: Number(form.quantity),
      unit_price: Number(form.unit_price),
      currency: form.currency,
      shipment_date: form.shipment_date,
    });
    setSaving(false);
    if (!error) onClose();
  };

  return (
    <Modal open={open} title="출고 입력" onClose={onClose}>
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
      <Field label="구매단가 (소수점 5자리까지)">
        <CurrencyPriceInput
          price={form.unit_price}
          currency={form.currency}
          onPriceChange={(v) => setForm((f) => ({ ...f, unit_price: v }))}
          onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
        />
      </Field>
      <Field label="출고일">
        <input type="date" className={inputClass} value={form.shipment_date} onChange={set("shipment_date")} />
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
   ③ 원자재 발주 입력 모달
   ========================================================================= */
function MaterialOrderModal({ open, onClose }) {
  const empty = {
    model_name: "",
    material_maker: "",
    customer: "",
    quantity: "",
    order_date: todayStr(),
    status: "대기",
  };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.model_name || !form.customer || !form.quantity) return;
    setSaving(true);
    const { error } = await supabase.from("material_orders").insert({
      model_name: form.model_name,
      material_maker: form.material_maker || null,
      customer: form.customer,
      quantity: Number(form.quantity),
      order_date: form.order_date,
      status: form.status,
    });
    setSaving(false);
    if (!error) onClose();
  };

  return (
    <Modal open={open} title="원자재 발주 입력" onClose={onClose}>
      <Field label="모델명">
        <input className={inputClass} value={form.model_name} onChange={set("model_name")} />
      </Field>
      <Field label="원자재 Maker">
        <input className={inputClass} value={form.material_maker} onChange={set("material_maker")} />
      </Field>
      <Field label="고객사">
        <input className={inputClass} value={form.customer} onChange={set("customer")} />
      </Field>
      <Field label="수량">
        <input type="number" min="0" className={inputClass} value={form.quantity} onChange={set("quantity")} />
      </Field>
      <Field label="발주일">
        <input type="date" className={inputClass} value={form.order_date} onChange={set("order_date")} />
      </Field>
      <Field label="입고상태">
        <select className={inputClass} value={form.status} onChange={set("status")}>
          <option value="대기">대기</option>
          <option value="완료">완료</option>
        </select>
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
   ④ 재공/재고 수정 모달
   ========================================================================= */
function StockEditModal({ open, onClose, products, initial }) {
  const [selectedId, setSelectedId] = useState("");
  const [wip, setWip] = useState("0");
  const [stock, setStock] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
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
    if (!error) onClose();
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
