import Anthropic from "@anthropic-ai/sdk";
import type { LlmProposal, ReqSnapshot } from "./types";

export type LlmMessage = { ref: string; channel: string; sentAt: Date; role: string; text: string };
export type LlmUsage = { input_tokens: number; output_tokens: number } | null;

export const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "effort_delta", "message_roles", "changes"],
  properties: {
    summary: { type: "string", description: "1 câu tiếng Việt tóm tắt phiên" },
    effort_delta: {
      type: "integer",
      description: "Điểm khối lượng tăng (+) hoặc giảm (-). 1 điểm ≈ nửa ngày công",
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
(1) DANH SÁCH YÊU CẦU HIỆN TẠI của dự án, mỗi yêu cầu có ID cố định (REQ-xxx).
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
8. effort_delta: ước lượng thay đổi khối lượng công việc, 1 điểm ≈ nửa ngày công.
9. Viết reason, title, detail, summary bằng tiếng Việt, ngắn gọn.`;

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

/** Deterministic fallback returning the section 11 expected PR (only when LLM_MOCK=1). */
function mockProposal(messages: LlmMessage[]): LlmProposal {
  const find = (re: RegExp) => messages.find((m) => re.test(m.text))?.ref;
  const refs = (...rs: (string | undefined)[]) => rs.filter((r): r is string => !!r);
  const roles = messages.map((m) => ({
    ref: m.ref,
    role: (/^(Dạ|Em gửi)/i.test(m.text) ? "freelancer" : "client") as "client" | "freelancer",
  }));
  return {
    summary: "Đổi màu chủ đạo sang nâu cà phê, menu có ảnh từng món, thêm trang Giới thiệu, bỏ bản đồ.",
    effort_delta: 2,
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
