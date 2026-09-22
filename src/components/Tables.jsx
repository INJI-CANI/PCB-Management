import React, { useEffect, useMemo, useState } from "react";
import { CircleDot, Check, Trash2, RefreshCw } from "lucide-react";
import {
  supabase,
  handleSupabaseError,
  assertRowUpdated,
  notifyToast,
  deleteRecord,
  formatPrice,
  formatMoney2,
  formatQty,
  formatDate,
  todayStr,
  groupByCustomerTypeModel,
  flattenGroupedTyped,
  exportToExcel,
  filterRowsByDateRange,
  TYPE_LABEL,
  ALIGN_CLASS,
  RATE_BASIS_OPTIONS,
  Field,
  inputClass,
  ExportButton,
  ExportRangeModal,
  PrimaryButton,
  RowActions,
  ExtraCostCell,
  TypeBadge,
  GroupHeader,
  TypeGroupHeader,
  ModelGroupHeader,
} from "./shared";

/* =========================================================================
   src/components/Tables.jsx
   수주 / 출고 / 원자재 발주 / 단가 이력 / 이익 현황 / 업체별 거래조건 + 환율
   내역 조회 테이블 모음 (고객사→모델 2단계 접기, 제조사순/날짜순 정렬,
   기간 필터 + 엑셀 내보내기, 인라인 수정 포함)
   ========================================================================= */

// 날짜순(Flat) 정렬 모드에서 그룹 헤더가 없는 대신, 행 맨 앞에 고객사/모델명을 표시
function FlatLeadCells({ row }) {
  return (
    <>
      <td className="px-4 py-3 text-left text-slate-300">{row.customer}</td>
      <td className="px-4 py-3 text-left">
        <span className="flex items-center gap-1.5">
          <TypeBadge type={row.product_type} />
          <span className="font-bold text-slate-100">{row.model_name}</span>
          {row.revision && (
            <span className="rounded bg-purple-500/10 px-1 py-0.5 text-[10px] font-medium text-purple-300">{row.revision}</span>
          )}
        </span>
      </td>
    </>
  );
}

/* =========================================================================
   내역 조회 탭 공용: 고객사(1) → 구분(2) → 모델명(3) 아코디언 + 기간필터 엑셀
   ========================================================================= */
function GroupedHistoryTable({
  columns,
  rows,
  dateField,
  renderRow,
  emptyLabel,
  exportConfig,
  productLookup,
  customerRankMap,
  enableSortToggle,
  sortDateLabel,
}) {
  const [viewMode, setViewMode] = useState("grouped"); // 'grouped' | 'flat'
  const [flatStart, setFlatStart] = useState("");
  const [flatEnd, setFlatEnd] = useState("");

  const grouped = useMemo(() => groupByCustomerTypeModel(rows, dateField, customerRankMap), [rows, dateField, customerRankMap]);

  const [collapsedCustomers, setCollapsedCustomers] = useState(() => new Set(grouped.map((g) => g.customer)));
  const [collapsedTypes, setCollapsedTypes] = useState(() => new Set());
  // 모델 단위는 기본적으로 "접힘" 상태로 시작 (스크롤 장대화 방지)
  const [collapsedModels, setCollapsedModels] = useState(() => {
    const initial = groupByCustomerTypeModel(rows, dateField, customerRankMap);
    const keys = new Set();
    initial.forEach((g) => g.types.forEach((t) => t.models.forEach((m) => keys.add(`${g.customer}::${t.type}::${m.model_name}`))));
    return keys;
  });
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

  const flatRows = useMemo(() => {
    if (viewMode !== "flat") return [];
    const filtered = filterRowsByDateRange(rows, dateField, flatStart || null, flatEnd || null);
    return [...filtered].sort((a, b) => (b[dateField] || "").localeCompare(a[dateField] || ""));
  }, [viewMode, rows, dateField, flatStart, flatEnd]);

  const handleExport = (start, end) => {
    if (viewMode === "flat") {
      const filtered = filterRowsByDateRange(rows, dateField, start, end);
      const sorted = [...filtered].sort((a, b) => (b[dateField] || "").localeCompare(a[dateField] || ""));
      exportToExcel(exportConfig.filename, sorted, exportConfig.columns);
      return;
    }
    const filtered = filterRowsByDateRange(rows, dateField, start, end);
    const filteredGrouped = groupByCustomerTypeModel(filtered, dateField, customerRankMap);
    exportToExcel(exportConfig.filename, flattenGroupedTyped(filteredGrouped), exportConfig.columns);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          {enableSortToggle && (
            <Field label="정렬">
              <select className={`${inputClass} w-40`} value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
                <option value="grouped">제조사 정렬 (기본)</option>
                <option value="flat">날짜순 정렬</option>
              </select>
            </Field>
          )}
          {enableSortToggle && viewMode === "flat" && (
            <>
              <Field label="시작일">
                <input type="date" className={inputClass} value={flatStart} onChange={(e) => setFlatStart(e.target.value)} />
              </Field>
              <Field label="종료일">
                <input type="date" className={inputClass} value={flatEnd} onChange={(e) => setFlatEnd(e.target.value)} />
              </Field>
              {(flatStart || flatEnd) && (
                <button
                  onClick={() => {
                    setFlatStart("");
                    setFlatEnd("");
                  }}
                  className="mb-3 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  필터 초기화
                </button>
              )}
            </>
          )}
        </div>
        {exportConfig && <ExportButton onClick={() => setExportModalOpen(true)} />}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-800 bg-slate-800 text-xs font-medium uppercase tracking-wide text-slate-400">
                {viewMode === "flat" && <th className="px-4 py-3 text-left">고객사</th>}
                {viewMode === "flat" && <th className="px-4 py-3 text-left">모델명</th>}
                {columns.map((c) => (
                  <th key={c.label} className={`px-4 py-3 ${ALIGN_CLASS[c.align] || "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {viewMode === "flat" ? (
                flatRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-4 py-10 text-center text-slate-500">
                      {sortDateLabel ? `${sortDateLabel} 기준으로 표시할 데이터가 없습니다.` : emptyLabel}
                    </td>
                  </tr>
                ) : (
                  flatRows.map((r) => renderRow(r, true))
                )
              ) : rows.length === 0 ? (
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
                                    {!modelCollapsed && m.rows.map((row) => renderRow(row, false))}
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
          dateHint={viewMode === "flat" ? `${sortDateLabel || "날짜"} 기준으로 필터링합니다 (현재 화면의 날짜순 필터와 별개로 동작).` : exportConfig.dateHint}
        />
      )}
    </div>
  );
}

function SalesRowCells({ row, flatMode, onSaveQuantity, onEdit, onDelete }) {
  const [qtyInput, setQtyInput] = useState(String(row.quantity ?? 0));

  useEffect(() => {
    setQtyInput(String(row.quantity ?? 0));
  }, [row.quantity]);

  const dirty = Number(qtyInput || 0) !== Number(row.quantity || 0);

  const save = async () => {
    const val = Math.max(0, Number(qtyInput) || 0);
    if (val <= 0) {
      notifyToast("error", "수량은 0보다 커야 합니다.");
      return;
    }
    await onSaveQuantity(row, val);
  };

  return (
    <tr key={row.id} className="hover:bg-slate-800/40">
      {flatMode && <FlatLeadCells row={row} />}
      <td className="px-4 py-3 text-left text-slate-400">{row.manufacturer || "-"}</td>
      <td className="px-4 py-3 text-left text-slate-400">{row.revision || "-"}</td>
      <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(row.order_date)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            min="0"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            className="w-20 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
          />
          {dirty && (
            <button
              onClick={save}
              title="수량 저장"
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

export function SalesHistoryTab({ rows, productLookup, customerRankMap, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord("sales_orders", row.id, `${row.customer} / ${row.model_name} 수주 내역을 삭제할까요?`);
    if (ok) onRefresh();
  };

  const handleSaveQuantity = async (row, quantity) => {
    const { data, error } = await supabase.from("sales_orders").update({ quantity }).eq("id", row.id).select();
    if (handleSupabaseError(error, "수주 수량 수정")) return;
    if (!assertRowUpdated(data, "수주 수량 수정")) return;
    notifyToast("success", "수주 수량이 수정되었습니다.");
    onRefresh();
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
      customerRankMap={customerRankMap}
      enableSortToggle
      sortDateLabel="수주일"
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
      renderRow={(r, flatMode) => (
        <SalesRowCells
          key={r.id}
          row={r}
          flatMode={flatMode}
          onSaveQuantity={handleSaveQuantity}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      )}
    />
  );
}

function ShipmentRowCells({ row, flatMode, onSaveQuantity, onEdit, onDelete }) {
  const [qtyInput, setQtyInput] = useState(String(row.quantity ?? 0));

  useEffect(() => {
    setQtyInput(String(row.quantity ?? 0));
  }, [row.quantity]);

  const dirty = Number(qtyInput || 0) !== Number(row.quantity || 0);

  const save = async () => {
    const val = Math.max(0, Number(qtyInput) || 0);
    if (val <= 0) {
      notifyToast("error", "수량은 0보다 커야 합니다.");
      return;
    }
    await onSaveQuantity(row, val);
  };

  return (
    <tr className="hover:bg-slate-800/40">
      {flatMode && <FlatLeadCells row={row} />}
      <td className="px-4 py-3 text-left text-slate-400">{row.manufacturer || "-"}</td>
      <td className="px-4 py-3 text-left text-slate-400">{row.revision || "-"}</td>
      <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(row.shipment_date)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            min="0"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            className="w-20 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
          />
          {dirty && (
            <button
              onClick={save}
              title="수량 저장"
              className="inline-flex items-center rounded-md bg-cyan-500 px-1.5 py-1 text-slate-950 hover:bg-cyan-400"
            >
              <Check size={12} />
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono">{formatPrice(row.purchase_price, row.purchase_currency)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatPrice(row.sale_price, row.sale_currency)}</td>
      <td className="px-4 py-3 text-right">
        <ExtraCostCell row={row} />
      </td>
      <td className="px-4 py-3 text-center">
        <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
      </td>
    </tr>
  );
}

export function ShipmentHistoryTab({ rows, productLookup, customerRankMap, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord(
      "shipments",
      row.id,
      `${row.customer} / ${row.model_name} 출고 내역을 삭제할까요?\n(이 출고에서 자동 기록된 단가 이력도 함께 삭제됩니다)`
    );
    if (ok) onRefresh();
  };

  const handleSaveQuantity = async (row, quantity) => {
    const { data, error } = await supabase.from("shipments").update({ quantity }).eq("id", row.id).select();
    if (handleSupabaseError(error, "출고 수량 수정")) return;
    if (!assertRowUpdated(data, "출고 수량 수정")) return;
    notifyToast("success", "출고 수량이 수정되었습니다.");
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
      customerRankMap={customerRankMap}
      enableSortToggle
      sortDateLabel="출고일"
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
          { header: "부대비용통화", accessor: (r) => r.extra_cost_currency || "KRW" },
          { header: "출고일", accessor: (r) => r.shipment_date },
        ],
      }}
      renderRow={(r, flatMode) => (
        <ShipmentRowCells
          key={r.id}
          row={r}
          flatMode={flatMode}
          onSaveQuantity={handleSaveQuantity}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      )}
    />
  );
}

function MaterialRowCells({ row, flatMode, onSaveReceived, onSaveQuantity, onEdit, onDelete }) {
  const [receivedInput, setReceivedInput] = useState(String(row.received_qty ?? 0));
  const [qtyInput, setQtyInput] = useState(String(row.quantity ?? 0));

  useEffect(() => {
    setReceivedInput(String(row.received_qty ?? 0));
  }, [row.received_qty]);
  useEffect(() => {
    setQtyInput(String(row.quantity ?? 0));
  }, [row.quantity]);

  const pending = Math.max(0, Number(row.quantity || 0) - Number(row.received_qty || 0));
  const receivedDirty = Number(receivedInput || 0) !== Number(row.received_qty || 0);
  const qtyDirty = Number(qtyInput || 0) !== Number(row.quantity || 0);

  const saveReceived = async () => {
    const clamped = Math.min(Math.max(0, Number(receivedInput) || 0), Number(row.quantity || 0));
    await onSaveReceived(row, clamped);
  };

  const saveQuantity = async () => {
    const val = Math.max(0, Number(qtyInput) || 0);
    if (val <= 0) {
      notifyToast("error", "발주수량은 0보다 커야 합니다.");
      return;
    }
    await onSaveQuantity(row, val);
  };

  const statusStyle =
    row.status === "완료"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : row.status === "부분입고"
      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-400";

  return (
    <tr className="hover:bg-slate-800/40">
      {flatMode && <FlatLeadCells row={row} />}
      <td className="px-4 py-3 text-left text-slate-400">{row.material_maker || "-"}</td>
      <td className="px-4 py-3 text-center font-mono text-slate-300">{formatDate(row.order_date)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            min="0"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            className="w-20 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
          />
          {qtyDirty && (
            <button
              onClick={saveQuantity}
              title="발주수량 저장"
              className="inline-flex items-center rounded-md bg-cyan-500 px-1.5 py-1 text-slate-950 hover:bg-cyan-400"
            >
              <Check size={12} />
            </button>
          )}
        </div>
      </td>
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
          {receivedDirty && (
            <button
              onClick={saveReceived}
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

export function MaterialHistoryTab({ rows, productLookup, customerRankMap, onEdit, onRefresh }) {
  const handleDelete = async (row) => {
    const ok = await deleteRecord(
      "material_orders",
      row.id,
      `${row.customer} / ${row.model_name} 원자재 발주 내역을 삭제할까요?`
    );
    if (ok) onRefresh();
  };

  const handleSaveReceived = async (row, receivedQty) => {
    const { data, error } = await supabase
      .from("material_orders")
      .update({ received_qty: receivedQty })
      .eq("id", row.id)
      .select();
    if (handleSupabaseError(error, "입고수량 저장")) return;
    if (!assertRowUpdated(data, "입고수량 저장")) return;
    notifyToast("success", "입고수량이 저장되었습니다.");
    onRefresh();
  };

  const handleSaveQuantity = async (row, quantity) => {
    const { data, error } = await supabase.from("material_orders").update({ quantity }).eq("id", row.id).select();
    if (handleSupabaseError(error, "발주수량 수정")) return;
    if (!assertRowUpdated(data, "발주수량 수정")) return;
    notifyToast("success", "발주수량이 수정되었습니다.");
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
      customerRankMap={customerRankMap}
      enableSortToggle
      sortDateLabel="발주일"
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
      renderRow={(r, flatMode) => (
        <MaterialRowCells
          key={r.id}
          row={r}
          flatMode={flatMode}
          onSaveReceived={handleSaveReceived}
          onSaveQuantity={handleSaveQuantity}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      )}
    />
  );
}

export function PriceHistoryTab({ rows, productLookup, customerRankMap, onEdit, onRefresh }) {
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
      customerRankMap={customerRankMap}
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
export function ProfitTab({ rows }) {
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
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-800 bg-slate-800 text-xs font-medium uppercase tracking-wide text-slate-400">
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
                    <td className="px-4 py-3 text-right font-mono">{formatMoney2(r.total_sale, r.sale_currency)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney2(r.total_extra_cost, r.sale_currency)}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono text-base font-bold ${
                        r.margin >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatMoney2(r.margin, r.sale_currency)}
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
                            {formatMoney2(r.margin_krw, "KRW")}
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

/* =========================================================================
   ⑥ 업체별 거래조건 탭 + 환율 관리 (거래조건 입력으로 등록된 데이터 조회)
   ========================================================================= */
export function TradeConditionsTab({ tradeConditions, exchangeRates, onEdit, onRefreshConditions, onRefreshRates }) {
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
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-800 bg-slate-800 text-xs font-medium uppercase tracking-wide text-slate-400">
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

export function ExchangeRateManager({ exchangeRates, onRefreshRates }) {
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
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-800 bg-slate-800 text-xs font-medium uppercase tracking-wide text-slate-400">
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
