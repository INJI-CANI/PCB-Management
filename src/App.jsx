import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Cpu,
  Plus,
  LayoutDashboard,
  ClipboardList,
  Truck,
  Boxes,
  History,
  Pencil,
  RefreshCw,
  TrendingUp,
  Landmark,
} from "lucide-react";

import {
  supabase,
  handleSupabaseError,
  TraceHeaderPattern,
  PrimaryButton,
  ToastHost,
} from "./components/shared";

import { DashboardTab } from "./components/Dashboard";

import {
  SalesHistoryTab,
  ShipmentHistoryTab,
  MaterialHistoryTab,
  PriceHistoryTab,
  ProfitTab,
  TradeConditionsTab,
} from "./components/Tables";

import {
  SalesOrderModal,
  ShipmentModal,
  MaterialOrderModal,
  PriceHistoryModal,
  TradeConditionModal,
  StockEditModal,
} from "./components/Modals";

/* =========================================================================
   src/App.jsx
   메인 State 관리 + Supabase 데이터 연동 + 모듈(Dashboard/Tables/Modals) 조합
   ========================================================================= */

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
  const [projectFinancials, setProjectFinancials] = useState([]);
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

  // 프로젝트(고객사+모델명)별 KRW 환산 집계 — DB 트리거가 자동으로 최신화해둔 값을 그대로 읽어옵니다.
  const fetchProjectFinancials = useCallback(async () => {
    const { data, error } = await supabase.from("project_converted_financials").select("*");
    if (handleSupabaseError(error, "원화 환산 집계 조회")) return;
    setProjectFinancials(data || []);
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
      fetchProjectFinancials(),
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
    fetchProjectFinancials,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "project_converted_financials" }, () =>
        fetchProjectFinancials()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- 고객사별 요약 (Sample+MP 통합, 모델명 breakdown) ---------------- */
  // 고객사별 'KRW 환산 총 판매가' 순위 — project_converted_financials(거래조건/환율 반영 완료)를
  // 그대로 합산해서 정렬 기준으로 사용합니다 (USD/KRW 절대값을 단순 합산하던 이전 방식의 오류를 해결).
  // 고객사별 'KRW 환산 총 판매가' 순위 — project_converted_financials(거래조건/환율 반영 완료)를
  // 그대로 합산해서 정렬 기준으로 사용합니다 (USD/KRW 절대값을 단순 합산하던 이전 방식의 오류를 해결).
  // ⚠️ project_converted_financials 테이블이 아직 비어있거나(마이그레이션 미실행) 존재하지 않는 경우를 대비해,
  //    profit_view 기반(profitRows)의 동일한 환율 환산 공식으로 임시 계산한 값을 대체 순위로 사용합니다.
  const customerRevenueRank = useMemo(() => {
    const totals = new Map();
    if (projectFinancials.length > 0) {
      for (const r of projectFinancials) {
        totals.set(r.customer, (totals.get(r.customer) || 0) + Number(r.total_sales_krw || 0));
      }
    } else {
      for (const r of profitRows) {
        const rate = Number(r.applied_fx_rate);
        const saleKrw =
          r.sale_currency === "KRW" ? Number(r.total_sale || 0) : rate ? Number(r.total_sale || 0) * rate : 0;
        totals.set(r.customer, (totals.get(r.customer) || 0) + saleKrw);
      }
    }
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    const rank = new Map();
    sorted.forEach(([customer], i) => rank.set(customer, i));
    return rank;
  }, [projectFinancials, profitRows]);

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
    return Array.from(map.values()).sort((a, b) => {
      const ra = customerRevenueRank.get(a.customer);
      const rb = customerRevenueRank.get(b.customer);
      const diff = (ra ?? Infinity) - (rb ?? Infinity);
      if (diff !== 0) return diff;
      return a.customer.localeCompare(b.customer, "ko");
    });
  }, [dashboardRows, customerRevenueRank]);

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

  // 고객사별 "가장 최근 거래에서 쓰인 제조사" — 수주/출고/원자재발주 이력을 합쳐 날짜 최신순으로 판단
  const latestManufacturerByCustomer = useMemo(() => {
    const latest = new Map();
    const consider = (r, dateField) => {
      if (!r.manufacturer) return;
      const ts = r[dateField] || r.created_at || "";
      const cur = latest.get(r.customer);
      if (!cur || ts > cur.ts) latest.set(r.customer, { manufacturer: r.manufacturer, ts });
    };
    salesRows.forEach((r) => consider(r, "order_date"));
    shipmentRows.forEach((r) => consider(r, "shipment_date"));
    materialRows.forEach((r) => consider(r, "order_date"));
    const result = new Map();
    for (const [k, v] of latest) result.set(k, v.manufacturer);
    return result;
  }, [salesRows, shipmentRows, materialRows]);

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

  // Sample 모델의 리비전별 수주량/출고량 breakdown (대시보드 상세지표 하위 행 표시용)
  const revisionBreakdownByModel = useMemo(() => {
    const map = new Map();
    const addTo = (r, field) => {
      if (r.product_type !== "sample" || !r.revision) return;
      const key = `${r.customer}::${r.product_type}::${r.model_name}`;
      if (!map.has(key)) map.set(key, new Map());
      const revMap = map.get(key);
      if (!revMap.has(r.revision)) revMap.set(r.revision, { ordered: 0, shipped: 0 });
      revMap.get(r.revision)[field] += Number(r.quantity || 0);
    };
    salesRows.forEach((r) => addTo(r, "ordered"));
    shipmentRows.forEach((r) => addTo(r, "shipped"));
    const result = new Map();
    for (const [key, revMap] of map) {
      result.set(
        key,
        Array.from(revMap.entries())
          .map(([revision, v]) => ({ revision, ...v }))
          .sort((a, b) => a.revision.localeCompare(b.revision, "ko"))
      );
    }
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
            revisionBreakdownByModel={revisionBreakdownByModel}
            customerRevenueRank={customerRevenueRank}
          />
        )}
        {tab === "sales" && (
          <SalesHistoryTab
            rows={salesRows}
            productLookup={productLookup}
            customerRankMap={customerRevenueRank}
            onEdit={(row) => openEdit("sales", row)}
            onRefresh={fetchSales}
          />
        )}
        {tab === "shipment" && (
          <ShipmentHistoryTab
            rows={shipmentRows}
            productLookup={productLookup}
            customerRankMap={customerRevenueRank}
            onEdit={(row) => openEdit("shipment", row)}
            onRefresh={fetchShipments}
          />
        )}
        {tab === "material" && (
          <MaterialHistoryTab
            rows={materialRows}
            productLookup={productLookup}
            customerRankMap={customerRevenueRank}
            onEdit={(row) => openEdit("material", row)}
            onRefresh={fetchMaterials}
          />
        )}
        {tab === "price_history" && (
          <PriceHistoryTab
            rows={priceHistoryRows}
            productLookup={productLookup}
            customerRankMap={customerRevenueRank}
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

      <SalesOrderModal
        open={modal === "sales"}
        onClose={closeModal}
        editing={editingRecord}
        catalog={catalog}
        latestManufacturerByCustomer={latestManufacturerByCustomer}
      />
      <ShipmentModal
        open={modal === "shipment"}
        onClose={closeModal}
        editing={editingRecord}
        catalog={catalog}
        latestManufacturerByCustomer={latestManufacturerByCustomer}
      />
      <MaterialOrderModal
        open={modal === "material"}
        onClose={closeModal}
        editing={editingRecord}
        catalog={catalog}
        latestManufacturerByCustomer={latestManufacturerByCustomer}
      />
      <PriceHistoryModal open={modal === "price"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <TradeConditionModal open={modal === "trade_condition"} onClose={closeModal} editing={editingRecord} catalog={catalog} />
      <StockEditModal open={modal === "stock"} onClose={closeModal} products={dashboardRows} initial={editingRecord} />

      <ToastHost />
    </div>
  );
}
