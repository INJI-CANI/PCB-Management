import React, { useMemo, useState, useEffect } from "react";
import { Check, Pencil, X, Building2 } from "lucide-react";
import {
  formatMoney2,
  formatQty,
  groupByCustomerTypeModel,
  flattenGroupedTyped,
  exportToExcel,
  filterRowsByDateRange,
  TYPE_ORDER,
  TYPE_LABEL,
  Field,
  inputClass,
  ExportButton,
  ExportRangeModal,
  TypeBadge,
  GroupHeader,
  TypeGroupHeader,
  ModelGroupHeader,
  supabase,
  handleSupabaseError,
  notifyToast,
} from "./shared";

/* =========================================================================
   src/components/Dashboard.jsx
   실시간 대시보드 탭: 고객사(KRW 환산 매출 내림차순) → 구분 → 모델명
   3단계 아코디언 Summary + [모델별 실시간 현황] 상세 테이블(Sticky Header)
   ========================================================================= */

/* =========================================================================
   대시보드 탭 (고객사 → 구분 → 모델명 3단계 아코디언 + 기간필터 엑셀)
   ========================================================================= */
export function DashboardTab({ rows, summary, shipmentRows, profitRows, revisionsByModel, revisionBreakdownByModel, customerRevenueRank }) {
  const grouped = useMemo(() => groupByCustomerTypeModel(rows, undefined, customerRevenueRank), [rows, customerRevenueRank]);
  // 고객사 단위 + 모델 단위 모두 기본 '접힘' 상태로 시작 (페이지 스크롤 압박 방지)
  const [collapsedCustomers, setCollapsedCustomers] = useState(() => new Set(grouped.map((g) => g.customer)));
  const [collapsedTypes, setCollapsedTypes] = useState(() => new Set());
  const [collapsedModels, setCollapsedModels] = useState(() => {
    const keys = new Set();
    grouped.forEach((g) => g.types.forEach((t) => t.models.forEach((m) => keys.add(`${g.customer}::${t.type}::${m.model_name}`))));
    return keys;
  });
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
    { header: "누적 수주량", accessor: (r) => r.total_order_qty },
    { header: "누적 출고량", accessor: (r) => r.delivered_qty },
    { header: "재고", accessor: (r) => r.product_stock },
    { header: "재공", accessor: (r) => r.wip_qty },
    { header: "발주잔량", accessor: (r) => r.order_balance },
    { header: "원자재 재고", accessor: (r) => r.material_stock },
    { header: "원자재 대기", accessor: (r) => r.material_waiting },
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
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-800 bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 text-left">구분</th>
                  <th className="px-4 py-3 text-right">누적 수주량</th>
                  <th className="px-4 py-3 text-right">누적 출고량</th>
                  <th className="px-4 py-3 text-right">재고</th>
                  <th className="px-4 py-3 text-right">재공</th>
                  <th className="px-4 py-3 text-right">발주잔량</th>
                  <th className="px-4 py-3 text-right">원자재 재고</th>
                  <th className="px-4 py-3 text-right">원자재 대기</th>
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
                                      {!modelCollapsed && (
                                        <DashboardDetailRow
                                          row={r}
                                          revisionBreakdown={t.type === "sample" ? revisionBreakdownByModel?.get(modelKey) : undefined}
                                        />
                                      )}
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
          <div className="mt-1 font-mono text-xs font-semibold text-slate-300">{formatMoney2(p.purchaseUSD, "USD")}</div>
          <div className="font-mono text-xs font-semibold text-slate-300">{formatMoney2(p.purchaseKRW, "KRW")}</div>
        </div>
        <div className="text-center">
          <div className="text-[11px] text-slate-500">총 판매가</div>
          <div className="mt-1 font-mono text-xs font-semibold text-cyan-300">{formatMoney2(p.saleUSD, "USD")}</div>
          <div className="font-mono text-xs font-semibold text-cyan-300">{formatMoney2(p.saleKRW, "KRW")}</div>
        </div>
        <div className="text-center">
          <div className="text-[11px] text-slate-500">총 부대비용</div>
          <div className="mt-1 font-mono text-xs font-semibold text-amber-400">{formatMoney2(p.extraUSD, "USD")}</div>
          <div className="font-mono text-xs font-semibold text-amber-400">{formatMoney2(p.extraKRW, "KRW")}</div>
        </div>
        <div className="col-span-3 flex flex-col items-center justify-center rounded-lg bg-slate-800/40 py-2 sm:col-span-1">
          <div className="text-[11px] text-slate-500">총 이익 (KRW)</div>
          <div
            className={`mt-1 font-mono text-lg font-bold ${
              (marginKrw?.marginKrw || 0) >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {formatMoney2(marginKrw?.marginKrw || 0, "KRW")}
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
function DashboardDetailRow({ row, revisionBreakdown }) {
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
    <>
    <tr className="hover:bg-slate-800/40">
      <td className="px-4 py-3 pl-16 font-sans text-xs text-slate-500">상세 지표</td>
      <td className="px-4 py-3 text-right">{formatQty(row.total_order_qty)}</td>
      <td className="px-4 py-3 text-right text-emerald-400">{formatQty(row.delivered_qty)}</td>
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
    {revisionBreakdown && revisionBreakdown.length > 0 &&
      revisionBreakdown.map((rev) => (
        <tr key={rev.revision} className="bg-purple-500/[0.03] hover:bg-purple-500/[0.06]">
          <td className="px-4 py-3 pl-16 font-sans text-xs">
            <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
              {rev.revision}
            </span>
          </td>
          <td className="px-4 py-3 text-right font-mono text-xs text-slate-400">{formatQty(rev.ordered)}</td>
          <td className="px-4 py-3 text-right font-mono text-xs text-slate-600" colSpan={2}>
            -
          </td>
          <td className="px-4 py-3 text-right font-mono text-xs text-emerald-400/80">{formatQty(rev.shipped)}</td>
          <td className="px-4 py-3 text-right font-mono text-xs text-amber-400/80">
            {formatQty(Math.max(0, rev.ordered - rev.shipped))}
          </td>
          <td className="px-4 py-3 text-right font-mono text-xs text-slate-600" colSpan={2}>
            -
          </td>
        </tr>
      ))}
    </>
  );
}
