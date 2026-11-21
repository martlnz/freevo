import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ClientFormDefaults = {
  name?: string;
  projectName?: string | null;
  emails?: string;
  phone?: string | null;
  zaloId?: string | null;
  budget?: number | null;
  note?: string | null;
};

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function ClientFormFields({
  defaults = {},
  idPrefix,
  extended = false,
}: {
  defaults?: ClientFormDefaults;
  idPrefix: string;
  extended?: boolean;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Tên khách hàng *" htmlFor={id("name")}>
        <Input id={id("name")} name="name" required defaultValue={defaults.name ?? ""} placeholder="VD: Anh Minh" />
      </Field>
      <Field label="Tên dự án" htmlFor={id("projectName")}>
        <Input
          id={id("projectName")}
          name="projectName"
          defaultValue={defaults.projectName ?? ""}
          placeholder="VD: Website bán hàng"
        />
      </Field>
      <Field label="Email" htmlFor={id("emails")} hint="Nhiều email cách nhau bằng dấu phẩy.">
        <Input
          id={id("emails")}
          name="emails"
          defaultValue={defaults.emails ?? ""}
          placeholder="a@example.com, b@example.com"
        />
      </Field>
      <Field label="Số điện thoại" htmlFor={id("phone")}>
        <Input id={id("phone")} name="phone" defaultValue={defaults.phone ?? ""} />
      </Field>
      <Field
        label="Tên nick Zalo (nếu khác tên khách)"
        htmlFor={id("zaloId")}
        hint="Giúp AI tự khớp khi bạn gửi ảnh chụp màn hình chat Zalo."
      >
        <Input
          id={id("zaloId")}
          name="zaloId"
          defaultValue={defaults.zaloId ?? ""}
          placeholder="VD: Minh Mộc Coffee"
        />
      </Field>
      {extended ? (
        <Field
          label="Ngân sách khách (VND)"
          htmlFor={id("budget")}
          hint="Tự động cập nhật khi tin nhắn nhắc tới ngân sách"
        >
          <Input
            id={id("budget")}
            name="budget"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            defaultValue={defaults.budget ?? ""}
            placeholder="Chưa nêu"
            className="tabular"
          />
        </Field>
      ) : null}
      <div className="sm:col-span-2">
        <Field label="Ghi chú" htmlFor={id("note")}>
          <Textarea id={id("note")} name="note" rows={3} defaultValue={defaults.note ?? ""} />
        </Field>
      </div>
    </div>
  );
}
