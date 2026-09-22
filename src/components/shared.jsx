import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  X,
  Pencil,
  Trash2,
  Building2,
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
   src/components/shared.jsx
   모든 컴포넌트 파일(App.jsx, Dashboard.jsx, Tables.jsx, Modals.jsx)이
   공유하는 Supabase 클라이언트, 포맷/유틸 함수, 공용 UI 컴포넌트 모음입니다.
   ========================================================================= */

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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================================================================
   토스트 알림
   ========================================================================= */
let toastListeners = [];
export function notifyToast(type, message) {
  toastListeners.forEach((l) => l(type, message));
}
export function useToastState() {
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
export function ToastHost() {
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

export function handleSupabaseError(error, actionLabel) {
  if (!error) return false;
  // eslint-disable-next-line no-console
  console.error(`[Supabase] ${actionLabel} 실패:`, error);
  notifyToast("error", `${actionLabel} 실패: ${error.message || "알 수 없는 오류"}`);
  return true;
}

// UPDATE가 에러 없이 끝나도 조건에 맞는 행이 0개면 supabase-js는 성공처럼 보이는 응답을 줍니다.
// (RLS 또는 id 불일치로 실제로는 아무 것도 안 바뀐 경우) — .select()로 받은 data로 실제 반영 여부를 확인합니다.
export function assertRowUpdated(data, actionLabel) {
  if (!data || data.length === 0) {
    notifyToast("error", `${actionLabel} 실패: 대상 데이터를 찾지 못해 반영되지 않았습니다. 새로고침 후 다시 시도해주세요.`);
    return false;
  }
  return true;
}

/* =========================================================================
   포맷 / 공용 유틸
   ========================================================================= */
export const CURRENCY_SYMBOL = { KRW: "₩", USD: "$" };
export const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" };
export const TYPE_ORDER = { sample: 0, mp: 1 };
export const TYPE_LABEL = { sample: "Sample", mp: "MP" };
// 업체별 거래조건에서 사용하는 환율 적용 기준 5종 (TradeConditionsTab / TradeConditionModal 공용)
export const RATE_BASIS_OPTIONS = ["당월1일~25일평균", "당월말일자", "전월말일자", "납품일자", "전월평균"];

export function formatPrice(value, currency) {
  if (value === null || value === undefined || value === "") return "-";
  const symbol = CURRENCY_SYMBOL[currency] || "";
  const num = Number(value ?? 0);
  const fixed = num.toFixed(5);
  const [intPart, decPart] = fixed.split(".");
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${symbol} ${withComma}.${decPart}`;
}

// 총액/마진 등 합계성 금액 표시용 — 소수점 둘째 자리까지 반올림 (단가 자체는 formatPrice의 5자리 유지)
export function formatMoney2(value, currency) {
  if (value === null || value === undefined || value === "") return "-";
  const symbol = CURRENCY_SYMBOL[currency] || "";
  const num = Number(value ?? 0);
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${symbol} ${withComma}.${decPart}`;
}

export function formatQty(value) {
  return Number(value ?? 0).toLocaleString("ko-KR");
}

export function formatDate(d) {
  if (!d) return "-";
  return d;
}

export const todayStr = () => new Date().toISOString().slice(0, 10);

export async function deleteRecord(table, id, confirmMessage) {
  const ok = window.confirm(confirmMessage || "정말 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.");
  if (!ok) return false;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (handleSupabaseError(error, "삭제")) return false;
  notifyToast("success", "삭제되었습니다.");
  return true;
}

// 고객사 → 구분(Sample/MP) → 모델명 → (옵션) 최신 날짜순 정렬로 그룹핑 (4단계 아코디언용)
export function groupByCustomerTypeModel(rows, dateField, customerRankMap) {
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
    .sort((a, b) => {
      if (customerRankMap) {
        const ra = customerRankMap.get(a[0]);
        const rb = customerRankMap.get(b[0]);
        const diff = (ra ?? Infinity) - (rb ?? Infinity);
        if (diff !== 0) return diff;
      }
      return a[0].localeCompare(b[0], "ko");
    })
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

export function flattenGroupedTyped(grouped) {
  return grouped.flatMap((g) => g.types.flatMap((t) => t.models.flatMap((m) => m.rows)));
}

export function exportToExcel(filename, rows, columns) {
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

export function filterRowsByDateRange(rows, dateField, start, end) {
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
export function TraceHeaderPattern() {
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

export function Modal({ open, title, onClose, children }) {
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

export function Field({ label, children }) {
  return (
    <label className="mb-3 block w-full">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500";

// 화폐 선택(3) : 금액 입력(7) 비율 고정 그리드
export function CurrencyPriceInput({ price, currency, onPriceChange, onCurrencyChange }) {
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
export function HierarchicalSelect({ value, onChange, options, addLabel, resetKey }) {
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
      <option value="">선택하세요</option>
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
export function ProductTypeToggle({ value, onChange }) {
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

export function TypeBadge({ type, className = "" }) {
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

export function PrimaryButton({ children, onClick, icon: Icon, className = "" }) {
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

export function ExportButton({ onClick, label = "엑셀 내보내기" }) {
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

export function ExportRangeModal({ open, onClose, onConfirm, dateHint }) {
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

export function RowActions({ onEdit, onDelete }) {
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

// 숫자 셀 인라인 편집 — 클릭하면 입력칸으로 바뀌고, 저장 시 즉시 DB UPDATE (삭제 후 재입력 금지 원칙 준수)
export function InlineNumberCell({ value, onSave, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setInput(String(value ?? 0));
  }, [value]);

  const save = async () => {
    setSaving(true);
    await onSave(Number(input) || 0);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <input
          type="number"
          min="0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-right font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
        />
        <button onClick={save} disabled={saving} className="rounded bg-cyan-500 px-1 py-0.5 text-slate-950 hover:bg-cyan-400 disabled:opacity-60">
          <Check size={11} />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded border border-slate-700 px-1 py-0.5 text-slate-400 hover:bg-slate-800"
        >
          <X size={11} />
        </button>
      </div>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className={`inline-flex items-center gap-1 font-mono hover:text-cyan-300 ${className}`}>
      {formatQty(value)}
      <Pencil size={10} />
    </button>
  );
}

// 부대비용 셀 — 클릭하면 통화 선택 + 금액 입력 모달이 뜸
export function ExtraCostCell({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 font-mono hover:text-cyan-300">
        {formatMoney2(row.extra_cost, row.extra_cost_currency || "KRW")}
        <Pencil size={10} />
      </button>
      <ExtraCostEditModal open={open} onClose={() => setOpen(false)} row={row} />
    </>
  );
}

export function ExtraCostEditModal({ open, onClose, row }) {
  const [currency, setCurrency] = useState(row?.extra_cost_currency || "KRW");
  const [value, setValue] = useState(String(row?.extra_cost ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && row) {
      setCurrency(row.extra_cost_currency || "KRW");
      setValue(String(row.extra_cost ?? 0));
    }
  }, [open, row]);

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("shipments")
      .update({ extra_cost: Number(value) || 0, extra_cost_currency: currency })
      .eq("id", row.id)
      .select();
    setSaving(false);
    if (handleSupabaseError(error, "부대비용 수정")) return;
    if (!assertRowUpdated(data, "부대비용 수정")) return;
    notifyToast("success", "부대비용이 수정되었습니다.");
    onClose();
  };

  if (!row) return null;

  return (
    <Modal open={open} title="부대비용 수정" onClose={onClose}>
      <Field label="거래화폐">
        <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="KRW">KRW (₩)</option>
          <option value="USD">USD ($)</option>
        </select>
      </Field>
      <Field label="부대비용 금액">
        <input
          type="number"
          step="0.01"
          min="0"
          className={`${inputClass} text-right font-mono`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <p className="mb-2 rounded-md bg-slate-800/60 p-2.5 text-xs text-slate-400">
        물류비·관세 등 출고 시점에 확정되지 않는 비용을 나중에 등록/수정할 때 사용합니다. 매입가·판매가와 다른
        통화로 지출된 경우에도 정확히 표기할 수 있습니다.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          취소
        </button>
        <PrimaryButton onClick={save} className={saving ? "opacity-60" : ""}>
          {saving ? "저장 중..." : "저장"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

// 1단계: 고객사
export function GroupHeader({ label, count, collapsed, onToggle }) {
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
export function TypeGroupHeader({ type, count, collapsed, onToggle }) {
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
export function ModelGroupHeader({ label, count, stats, revisions, collapsed, onToggle }) {
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
