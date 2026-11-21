import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { isMock } from "./llm";
import type { ScreenshotExtraction } from "./types";

const MAX_BYTES = 10 * 1024 * 1024;
type SupportedMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const MIME_EXT: Record<SupportedMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function normalizeImageMime(mimeType: string): SupportedMime {
  const lower = mimeType.toLowerCase().split(";")[0].trim();
  if (lower === "image/jpg") return "image/jpeg";
  if (lower === "image/png" || lower === "image/jpeg" || lower === "image/webp" || lower === "image/gif") {
    return lower;
  }
  throw new Error("Chỉ hỗ trợ ảnh định dạng PNG, JPEG, WebP hoặc GIF.");
}

export async function saveUploadedImage(buffer: Buffer, mimeType: string): Promise<string> {
  if (buffer.length === 0) throw new Error("Tệp ảnh trống.");
  if (buffer.length > MAX_BYTES) throw new Error("Ảnh vượt quá giới hạn 10MB.");
  const mime = normalizeImageMime(mimeType);
  const filename = `${randomUUID()}.${MIME_EXT[mime]}`;
  const dir = resolve(process.cwd(), "public", "uploads");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, filename), buffer);
  return `/uploads/${filename}`;
}

const SCREENSHOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["channel", "detectedContactName", "detectedContactInfo", "detectedBudget", "messages"],
  properties: {
    channel: { type: "string", enum: ["zalo", "gmail", "manual"] },
    detectedContactName: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Tên khách hoặc người đối thoại trên thanh tiêu đề ảnh chụp, hoặc null nếu không thấy",
    },
    detectedContactInfo: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Email hoặc số điện thoại hiển thị trong ảnh nếu có, ngược lại null",
    },
    detectedBudget: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description: "Ngân sách bằng VND nếu được nhắc trong đoạn chat (vd 7000000), ngược lại null",
    },
    messages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sender", "text", "timeHint"],
        properties: {
          sender: { type: "string", enum: ["client", "freelancer", "unknown"] },
          text: { type: "string" },
          timeHint: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
} as const;

const VISION_PROMPT = `Hãy đọc ảnh chụp màn hình cuộc trò chuyện (Zalo, Messenger, Email...) và trích xuất đầy đủ nội dung theo JSON schema:
1. channel: "zalo" nếu là giao diện chat Zalo/tin nhắn, "gmail" nếu là giao diện email, "manual" nếu không rõ.
2. detectedContactName: Tên người đang chat hiển thị trên thanh tiêu đề (header) của ứng dụng chat, hoặc tên người gửi email. Nếu bị cắt hoặc không thấy thì trả null.
3. detectedContactInfo: Địa chỉ email hoặc số điện thoại nếu nhìn thấy trong ảnh, ngược lại trả null.
4. detectedBudget: Nếu khách nhắc tới ngân sách/kinh phí dự kiến (vd "8 triệu", "9tr5"), quy đổi ra số nguyên VND (vd 8000000, 9500000); ngược lại trả null.
5. messages: Danh sách từng tin nhắn theo đúng thứ tự từ trên xuống dưới.
   - Bong bóng chat nằm BÊN TRÁI (hoặc người gửi là khách hàng) → sender: "client".
   - Bong bóng chat nằm BÊN PHẢI (hoặc phản hồi của bạn/freelancer) → sender: "freelancer".
   - Không rõ bên nào → sender: "unknown".
   - Giữ nguyên nội dung tiếng Việt chính xác theo ảnh, không bịa thêm tin không có trong ảnh.`;

function mockScreenshot(filenameHint?: string): ScreenshotExtraction {
  const isLan = !!filenameHint && /lan/i.test(filenameHint);
  if (isLan) {
    return {
      channel: "zalo",
      detectedContactName: "Chị Lan",
      detectedContactInfo: "lan.spa@example.com",
      detectedBudget: 9_500_000,
      messages: [
        { sender: "client", text: "Em làm giúp chị landing page Spa Sen, có bảng giá liệu trình và đặt lịch nhé.", timeHint: "09:10" },
        { sender: "freelancer", text: "Dạ vâng chị, em ghi nhận yêu cầu rồi ạ.", timeHint: "09:12" },
      ],
    };
  }
  return {
    channel: "zalo",
    detectedContactName: "Anh Minh",
    detectedContactInfo: null,
    detectedBudget: 7_500_000,
    messages: [
      { sender: "client", text: "Em ơi thêm giúp anh mục giờ mở cửa ở chân trang nhé.", timeHint: "10:15" },
      { sender: "freelancer", text: "Dạ ok anh, em bổ sung vào bản cập nhật luôn ạ.", timeHint: "10:16" },
    ],
  };
}

export async function extractFromScreenshot(
  buffer: Buffer,
  mimeType: string,
  filenameHint?: string,
): Promise<ScreenshotExtraction> {
  const mime = normalizeImageMime(mimeType);
  if (isMock()) return mockScreenshot(filenameHint);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình ANTHROPIC_API_KEY nên chưa thể đọc ảnh chụp màn hình.");
  }

  const model = process.env.LLM_MODEL || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey });

  let resp;
  try {
    resp = await client.messages.create({
      model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCREENSHOT_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mime,
                data: buffer.toString("base64"),
              },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    });
  } catch (e) {
    throw new Error(`Đọc ảnh bằng AI thất bại: ${e instanceof Error ? e.message : String(e)}`);
  }

  const text = resp.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: ScreenshotExtraction;
  try {
    parsed = JSON.parse(text) as ScreenshotExtraction;
  } catch {
    throw new Error("AI trả về dữ liệu đọc ảnh không hợp lệ (JSON lỗi).");
  }
  parsed.messages = (parsed.messages ?? []).filter((m) => m.text && m.text.trim().length > 0);
  if (parsed.messages.length === 0) {
    throw new Error("Không tìm thấy nội dung tin nhắn nào trong ảnh chụp.");
  }
  return parsed;
}
