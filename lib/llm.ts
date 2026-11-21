import Anthropic from "@anthropic-ai/sdk";
import type { LlmProposal, ReqSnapshot } from "./types";

export type LlmMessage = { ref: string; channel: string; sentAt: Date; role: string; text: string };
export type LlmUsage = { input_tokens: number; output_tokens: number } | null;

export const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "effort_delta", "detected_budget", "message_roles", "changes"],
  properties: {
    summary: { type: "string", description: "1 câu tiếng Việt tóm tắt phiên" },
    effort_delta: {
      type: "integer",
      description: "Điểm khối lượng tăng (+) hoặc giảm (-). 1 điểm ≈ nửa ngày công",
    },
    detected_budget: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description: "Ngân sách khách đề cập bằng VND (vd 7000000), hoặc null nếu không nhắc tới ngân sách",
    },
    message_roles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "role"],
        properties: { ref: { type: "string" }, role: { type: "string", enum: ["client", "freelancer"] } },
      },
    },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "reason", "evidence_refs"],
        properties: {
          op: { type: "string", enum: ["add", "modify", "remove"] },
          req_id: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          status: { type: "string", enum: ["agreed", "pending"] },
          reason: { type: "string" },
          evidence_refs: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Bạn là trợ lý quản lý yêu cầu cho freelancer. Bạn nhận:
(1) DANH SÁCH YÊU CẦU HIỆN TẠI của dự án, mỗi yêu cầu có ID cố định (REQ-xxx). Nếu là version 0 (chưa có yêu cầu nào), đây là phiên khởi tạo bản v1: hãy rút toàn bộ yêu cầu ban đầu từ tin nhắn bằng thao tác add và ước lượng effort_delta cho toàn bộ khối lượng của bản v1 đó.
(2) CÁC TIN NHẮN MỚI trong phiên trao đổi giữa freelancer và khách, mỗi tin có mã (m1, m2...), kênh, thời gian, và vai trò người gửi nếu đã biết.

Nhiệm vụ: xác định sau phiên này, danh sách yêu cầu cần THÊM, SỬA, XÓA gì.

Quy tắc bắt buộc:
1. Chỉ ghi nhận trạng thái ĐƯỢC THỐNG NHẤT CUỐI CÙNG. Nếu khách đổi ý nhiều lần, chỉ lấy lần cuối.
2. Mỗi thay đổi PHẢI dẫn ít nhất một mã tin nhắn làm bằng chứng (evidence_refs). Ưu tiên dẫn cả tin khách yêu cầu và tin hai bên chốt.
3. Chỉ dùng thao tác add / modify / remove. modify và remove phải dùng đúng req_id có sẵn. KHÔNG viết lại toàn bộ danh sách.
4. Với modify: title/detail là giá trị MỚI đầy đủ (không phải chỉ phần khác biệt).
5. Điều gì đang bàn nhưng chưa chốt → status "pending". Điều đã chốt → "agreed".
6. Không bịa. Không suy diễn yêu cầu không có trong tin nhắn. Bỏ qua chào hỏi, cảm ơn.
7. Nếu vai trò người gửi là unknown, suy luận từ nội dung và cách xưng hô (người nhờ làm, yêu cầu = client; người xác nhận sẽ làm = freelancer) và trả trong message_roles.
8. effort_delta: ước lượng thay đổi khối lượng công việc, 1 điểm ≈ nửa ngày công (với khởi tạo v1, ước lượng tổng điểm khối lượng cho cả dự án ban đầu).
9. Viết reason, title, detail, summary bằng tiếng Việt, ngắn gọn.
10. Nếu khách đề cập ngân sách hoặc mức chi dự kiến trong tin nhắn (ví dụ "7 triệu", "9 triệu rưỡi", "12tr"), trích xuất số nguyên VND vào detected_budget (vd 9500000); nếu không nhắc tới ngân sách thì trả null.`;

function fmtTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function buildUserMessage(snapshot: ReqSnapshot, versionNo: number, messages: LlmMessage[]) {
  const reqs = snapshot.requirements.map((r) => `${r.id} | ${r.title} | ${r.detail} | ${r.status}`).join("\n");
  const msgs = messages
    .map((m) => `[${m.ref}] (${m.channel}, ${fmtTime(m.sentAt)}, ${m.role}) ${m.text}`)
    .join("\n");
  return `YÊU CẦU HIỆN TẠI (version ${versionNo}):\n${reqs || "(chưa có yêu cầu nào)"}\n\nTIN NHẮN MỚI:\n${msgs}`;
}

export const isMock = () => process.env.LLM_MOCK === "1";

function parseBudgetHint(messages: LlmMessage[]): number | null {
  const joined = messages.map((m) => m.text).join(" ");
  const half = joined.match(/(\d+)\s*(?:triệu|tr)\s*rưỡi/i);
  if (half) return Number(half[1]) * 1_000_000 + 500_000;
  const dec = joined.match(/(\d+(?:[.,]\d+)?)\s*(?:triệu|tr)/i);
  if (dec) return Math.round(Number(dec[1].replace(",", ".")) * 1_000_000);
  return null;
}

/** Deterministic fallback for offline tests & demo fallback (only when LLM_MOCK=1). */
function mockProposal(messages: LlmMessage[]): LlmProposal {
  const find = (re: RegExp) => messages.find((m) => re.test(m.text))?.ref;
  const refs = (...rs: (string | undefined)[]) => rs.filter((r): r is string => !!r);
  const roles = messages.map((m) => ({
    ref: m.ref,
    role: (m.role === "client" || m.role === "freelancer"
      ? m.role
      : /^(Dạ|Em gửi|Bên em)/i.test(m.text)
        ? "freelancer"
        : "client") as "client" | "freelancer",
  }));
  const joined = messages.map((m) => m.text).join("\n");

  if (/nâu cà phê/i.test(joined) || /ảnh cho từng món/i.test(joined)) {
    return {
      summary: "Đổi màu chủ đạo sang nâu cà phê, menu có ảnh từng món, thêm trang Giới thiệu, bỏ bản đồ.",
      effort_delta: 2,
      detected_budget: null,
      message_roles: roles,
      changes: [
        {
          op: "modify",
          req_id: "REQ-003",
          title: "Màu chủ đạo",
          detail: "Nâu cà phê #6F4E37",
          status: "agreed",
          reason: "Khách đổi ý nhiều lần, chốt cuối là nâu #6F4E37 (không phải đỏ đô).",
          evidence_refs: refs(find(/nâu cà phê/), find(/#6F4E37\?/), find(/Ok nâu/), find(/em chốt/)),
        },
        {
          op: "modify",
          req_id: "REQ-002",
          title: "Trang menu",
          detail: "Danh sách đồ uống kèm giá và ảnh cho từng món",
          status: "agreed",
          reason: "Khách bổ sung qua email: menu có ảnh từng món.",
          evidence_refs: refs(find(/ảnh cho từng món nhé/), find(/em chốt/)),
        },
        {
          op: "add",
          title: "Trang Giới thiệu",
          detail: "Trang kể câu chuyện của quán",
          status: "agreed",
          reason: "Khách yêu cầu thêm trang Giới thiệu và freelancer đã chốt.",
          evidence_refs: refs(find(/trang Giới thiệu nữa/), find(/em chốt/)),
        },
        {
          op: "remove",
          req_id: "REQ-005",
          reason: "Khách bỏ Google Maps, chỉ để địa chỉ dạng chữ.",
          evidence_refs: refs(find(/Google Maps thì bỏ/), find(/em chốt/)),
        },
      ],
    };
  }

  if (/Spa Sen/i.test(joined) || /liệu trình/i.test(joined)) {
    const m1 = find(/Spa Sen|liệu trình/i) ?? messages[0]?.ref;
    const m2 = find(/đặt lịch|triệu/i) ?? messages[messages.length - 1]?.ref;
    return {
      summary: "Khởi tạo yêu cầu website Spa Sen gồm trang chủ, bảng giá liệu trình, đặt lịch hẹn và bản đồ.",
      effort_delta: 12,
      detected_budget: parseBudgetHint(messages) ?? 9_500_000,
      message_roles: roles,
      changes: [
        {
          op: "add",
          title: "Trang chủ Spa Sen",
          detail: "Banner giới thiệu không gian spa và dịch vụ nổi bật",
          status: "agreed",
          reason: "Khách yêu cầu landing giới thiệu tổng quan Spa Sen qua email.",
          evidence_refs: refs(m1),
        },
        {
          op: "add",
          title: "Bảng giá liệu trình",
          detail: "Danh sách các gói chăm sóc da và thư giãn kèm giá chi tiết",
          status: "agreed",
          reason: "Khách muốn hiển thị đầy đủ bảng giá liệu trình.",
          evidence_refs: refs(m1),
        },
        {
          op: "add",
          title: "Form đặt lịch hẹn",
          detail: "Khách chọn dịch vụ, ngày giờ và gửi thông tin đặt lịch",
          status: "agreed",
          reason: "Khách bổ sung yêu cầu form đặt lịch hẹn.",
          evidence_refs: refs(m2),
        },
        {
          op: "add",
          title: "Bản đồ chỉ đường",
          detail: "Nhúng bản đồ vị trí chi nhánh spa",
          status: "agreed",
          reason: "Khách yêu cầu bản đồ chỉ đường tới spa.",
          evidence_refs: refs(m2),
        },
      ],
    };
  }

  const clientMsgs = messages.filter((m) => m.role !== "freelancer");
  const picked = clientMsgs.length > 0 ? clientMsgs : messages;
  return {
    summary: `Tổng hợp ${messages.length} tin nhắn mới thành đề xuất yêu cầu.`,
    effort_delta: Math.max(1, picked.length * 2),
    detected_budget: parseBudgetHint(messages),
    message_roles: roles,
    changes: picked.map((m, idx) => ({
      op: "add" as const,
      title: `Yêu cầu #${idx + 1}`,
      detail: m.text,
      status: "agreed" as const,
      reason: "Tổng hợp từ tin nhắn khách hàng.",
      evidence_refs: [m.ref],
    })),
  };
}

export async function proposeDiff(
  snapshot: ReqSnapshot,
  versionNo: number,
  messages: LlmMessage[],
): Promise<{ proposal: LlmProposal; usage: LlmUsage }> {
  if (isMock()) return { proposal: mockProposal(messages), usage: null };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình ANTHROPIC_API_KEY trong file .env nên chưa thể tạo PR. Hãy thêm khóa API rồi thử lại.");
  }
  const model = process.env.LLM_MODEL || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey });
  let resp;
  try {
    resp = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: PROPOSAL_SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(snapshot, versionNo, messages) }],
    });
  } catch (e) {
    throw new Error(`Gọi mô hình AI thất bại: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = resp.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  let proposal: LlmProposal;
  try {
    proposal = JSON.parse(text) as LlmProposal;
  } catch {
    throw new Error("Mô hình AI trả về dữ liệu không đọc được (JSON lỗi). Hãy thử tạo lại PR.");
  }
  return { proposal, usage: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens } };
}
