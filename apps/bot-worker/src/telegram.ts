export interface TelegramMessage {
  message_id: number;
  from?: { id: number };
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramUpdate { update_id: number; message?: TelegramMessage }

export async function sendTelegramMessage(token: string, chatId: number, text: string, replyMarkup?: unknown): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed: ${response.status}`);
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function selectEfficientPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize {
  if (!photos.length) throw new Error("Telegram не передал варианты изображения");
  const ordered = [...photos].sort((a, b) => (a.width * a.height) - (b.width * b.height));
  return ordered.find((photo) => Math.max(photo.width, photo.height) >= 1000) ?? ordered[ordered.length - 1];
}

export async function downloadTelegramPhoto(token: string, fileId: string): Promise<{ data: string; mimeType: string }> {
  const metadataResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!metadataResponse.ok) throw new Error(`Telegram getFile failed: ${metadataResponse.status}`);
  const metadata = await metadataResponse.json<{ ok: boolean; result?: { file_path?: string } }>();
  const filePath = metadata.result?.file_path;
  if (!metadata.ok || !filePath) throw new Error("Telegram не вернул путь к изображению");
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileResponse.ok) throw new Error(`Telegram file download failed: ${fileResponse.status}`);
  const buffer = await fileResponse.arrayBuffer();
  if (buffer.byteLength > 8 * 1024 * 1024) throw new Error("Изображение превышает безопасный лимит 8 МБ");
  return { data: bytesToBase64(buffer), mimeType: fileResponse.headers.get("content-type") || "image/jpeg" };
}

export async function downloadTelegramVoice(token: string, fileId: string, declaredMimeType?: string): Promise<{ data: string; mimeType: string }> {
  const metadataResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!metadataResponse.ok) throw new Error(`Telegram getFile failed: ${metadataResponse.status}`);
  const metadata = await metadataResponse.json<{ ok: boolean; result?: { file_path?: string } }>();
  const filePath = metadata.result?.file_path;
  if (!metadata.ok || !filePath) throw new Error("Telegram не вернул путь к голосовому сообщению");
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileResponse.ok) throw new Error(`Telegram voice download failed: ${fileResponse.status}`);
  const buffer = await fileResponse.arrayBuffer();
  if (buffer.byteLength > 4 * 1024 * 1024) throw new Error("Голосовое сообщение превышает лимит 4 МБ");
  const receivedMime = (fileResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const sourceMime = receivedMime.startsWith("audio/") ? receivedMime : (declaredMimeType || "audio/ogg").split(";")[0].trim().toLowerCase();
  const mimeType = sourceMime === "audio/opus" || sourceMime === "audio/x-opus+ogg" ? "audio/ogg" : sourceMime;
  if (!["audio/ogg", "audio/mpeg", "audio/mp3", "audio/aac", "audio/wav", "audio/flac"].includes(mimeType)) {
    throw new Error(`Неподдерживаемый формат голоса: ${mimeType}`);
  }
  return { data: bytesToBase64(buffer), mimeType };
}

export async function downloadTelegramTextDocument(token:string,fileId:string):Promise<string>{const metadataResponse=await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);if(!metadataResponse.ok)throw new Error(`Telegram getFile failed: ${metadataResponse.status}`);const metadata=await metadataResponse.json<{ok:boolean;result?:{file_path?:string}}>();const path=metadata.result?.file_path;if(!metadata.ok||!path)throw new Error("Telegram не вернул путь к документу");const response=await fetch(`https://api.telegram.org/file/bot${token}/${path}`);if(!response.ok)throw new Error(`Telegram file download failed: ${response.status}`);const buffer=await response.arrayBuffer();if(buffer.byteLength>2*1024*1024)throw new Error("CSV превышает лимит 2 МБ");return new TextDecoder("utf-8",{fatal:true}).decode(buffer)}
