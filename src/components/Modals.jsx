import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  supabase,
  handleSupabaseError,
  assertRowUpdated,
  notifyToast,
  formatQty,
  todayStr,
  TYPE_LABEL,
  RATE_BASIS_OPTIONS,
  Modal,
  Field,
  inputClass,
  CurrencyPriceInput,
  HierarchicalSelect,
  ProductTypeToggle,
  PrimaryButton,
} from "./shared";

/* =========================================================================
   src/components/Modals.jsx
   수주 / 출고 / 원자재 발주 입력 모달, 재공·재고 수정 모달,
   단가 이력 / 거래조건 입력 모달 모음
   (드롭다운 기본값 [선택하세요] + 고객사 선택 시 최근 제조사 자동 선택 적용)
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
export function SalesOrderModal({ open, onClose, editing, catalog, latestManufacturerByCustomer }) {
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
    const { data, error } = editing
      ? await supabase.from("sales_orders").update(payload).eq("id", editing.id).select()
      : await supabase.from("sales_orders").insert(payload).select();
    setSaving(false);
    if (handleSupabaseError(error, editing ? "수주 내역 수정" : "수주 등록")) return;
    if (!assertRowUpdated(data, editing ? "수주 내역 수정" : "수주 등록")) return;
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
            onChange={(v) =>
              setForm((f) => ({ ...f, customer: v, manufacturer: latestManufacturerByCustomer?.get(v) || "", model_name: "" }))
            }
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
export function ShipmentModal({ open, onClose, editing, catalog, latestManufacturerByCustomer }) {
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
    const { data, error } = editing
      ? await supabase.from("shipments").update(payload).eq("id", editing.id).select()
      : await supabase.from("shipments").insert(payload).select();
    setSaving(false);
    if (handleSupabaseError(error, editing ? "출고 내역 수정" : "출고 등록")) return;
    if (!assertRowUpdated(data, editing ? "출고 내역 수정" : "출고 등록")) return;
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
            onChange={(v) =>
              setForm((f) => ({ ...f, customer: v, manufacturer: latestManufacturerByCustomer?.get(v) || "", model_name: "" }))
            }
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
export function MaterialOrderModal({ open, onClose, editing, catalog, latestManufacturerByCustomer }) {
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
    const { data, error } = editing
      ? await supabase.from("material_orders").update(payload).eq("id", editing.id).select()
      : await supabase.from("material_orders").insert(payload).select();
    setSaving(false);
    if (handleSupabaseError(error, editing ? "원자재 발주 수정" : "원자재 발주 등록")) return;
    if (!assertRowUpdated(data, editing ? "원자재 발주 수정" : "원자재 발주 등록")) return;
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
            onChange={(v) =>
              setForm((f) => ({ ...f, customer: v, manufacturer: latestManufacturerByCustomer?.get(v) || "", model_name: "" }))
            }
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
export function StockEditModal({ open, onClose, products, initial }) {
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
export function PriceHistoryModal({ open, onClose, editing, catalog }) {
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
    const { data, error } = editing
      ? await supabase.from("price_history").update(payload).eq("id", editing.id).select()
      : await supabase.from("price_history").insert({ ...payload, source: "manual" }).select();
    setSaving(false);
    if (handleSupabaseError(error, editing ? "단가 이력 수정" : "단가 이력 등록")) return;
    if (!assertRowUpdated(data, editing ? "단가 이력 수정" : "단가 이력 등록")) return;
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
   ⑦ 거래조건 입력 / 수정 모달
   ========================================================================= */
export function TradeConditionModal({ open, onClose, editing }) {
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
    const { data, error } = editing
      ? await supabase.from("trade_conditions").update(payload).eq("id", editing.id).select()
      : await supabase.from("trade_conditions").upsert(payload, { onConflict: "subject_type,subject_name" }).select();
    setSaving(false);
    if (handleSupabaseError(error, editing ? "거래조건 수정" : "거래조건 등록")) return;
    if (!assertRowUpdated(data, editing ? "거래조건 수정" : "거래조건 등록")) return;
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
            <option value="">선택하세요</option>
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
