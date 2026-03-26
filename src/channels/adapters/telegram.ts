/**
 * Telegram Channel Adapter - Full Implementation
 * 
 * Features:
 * - Long polling with getUpdates
 * - Automatic reconnection with exponential backoff
 * - Typing indicators
 * - Media support (photos, documents)
 * - Reply handling
 * - Thread/Topic support
 * 
 * Setup:
 * 1. Create bot with @BotFather
 * 2. Get bot token
 * 3. Configure: pnpm foxfang wizard channels
 */

import type { ChannelAdapter, ChannelMediaPayload, ChannelMessage, ChannelResponse } from '../types';
import { loadConfig } from '../../config';
import { markdownToTelegramHtml } from '../formatters';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeInboundMedia, saveInboundMediaBuffer } from '../media-understanding';

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  chat: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
  };
  date: number;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
  message_thread_id?: number;
  photo?: TelegramPhotoSize[];
  video?: TelegramVideo;
  audio?: TelegramAudio;
  voice?: TelegramVoice;
  document?: TelegramDocument;
  entities?: TelegramEntity[];
  caption_entities?: TelegramEntity[];
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    username?: string;
  };
  message?: TelegramMessage;
  data?: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramBotInfo {
  id: number;
  username: string;
  first_name: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
}

interface TelegramFileInfo {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

// Exponential backoff config
const BACKOFF_CONFIG = {
  initialMs: 1000,
  maxMs: 30000,
  factor: 2,
  jitter: 0.25,
};
const TELEGRAM_MAX_INBOUND_BYTES = 20 * 1024 * 1024;

export class TelegramAdapter implements ChannelAdapter {
  readonly name = 'telegram';
  readonly supportsEditing = true;
  connected = false;
  private botToken: string = '';
  private baseUrl: string = '';
  private messageHandler?: (msg: ChannelMessage) => Promise<ChannelResponse | void>;
  private abortController?: AbortController;
  private lastUpdateId: number = 0;
  private pollTimeout?: NodeJS.Timeout;
  private reconnectAttempts: number = 0;
  private reconnectTimeout?: NodeJS.Timeout;
  private botInfo?: TelegramBotInfo;
  private allowedUpdates = ['message', 'edited_message', 'callback_query'];

  constructor() {}

  async connect(): Promise<void> {
    const config = await loadConfig();
    const telegramConfig = config.channels?.telegram;
    
    if (!telegramConfig?.enabled || !telegramConfig?.botToken) {
      throw new Error(
        'Telegram not configured. Run: pnpm foxfang wizard channels\n' +
        'Or get a token from @BotFather on Telegram'
      );
    }

    this.botToken = telegramConfig.botToken;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;

    // Verify token and get bot info
    try {
      const response = await this.apiCall<TelegramBotInfo>('getMe');
      this.botInfo = response;
      console.log(`[Telegram] ✅ Connected as @${response.username}`);

      const groupModeAlways =
        telegramConfig.groupActivation === 'always' ||
        telegramConfig.requireMentionInGroups === false;
      const privacyModeEnabled = response.can_read_all_group_messages !== true;
      if (groupModeAlways && privacyModeEnabled) {
        console.warn(
          '[Telegram] ⚠️ Group mode is set to "always" but Bot privacy mode is ON.\n' +
          '[Telegram]    Telegram will only deliver mentions/commands/replies from groups.\n' +
          '[Telegram]    Fix: @BotFather -> /setprivacy -> select your bot -> Disable.'
        );
      }
    } catch (error) {
      throw new Error(
        `Cannot connect to Telegram API: ${error instanceof Error ? error.message : 'Unknown error'}\n` +
        `Make sure your bot token is valid from @BotFather`
      );
    }

    // Delete webhook to ensure polling works
    try {
      await this.apiCall('deleteWebhook', { drop_pending_updates: true });
      console.log('[Telegram] 🧹 Cleared webhook');
    } catch {
      // Ignore webhook cleanup errors
    }

    this.connected = true;
    this.reconnectAttempts = 0;
    
    // Start polling
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.abortController?.abort();
    
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    console.log('[Telegram] Disconnected');
  }

  async send(to: string, content: string, options?: { 
    replyToMessageId?: string; 
    threadId?: string;
  }): Promise<string> {
    if (!this.connected) {
      throw new Error('Telegram not connected');
    }

    const chatId = this.parseChatId(to);

    try {
      // Convert markdown to HTML for Telegram
      const htmlContent = markdownToTelegramHtml(content);

      const params: Record<string, any> = {
        chat_id: chatId,
        text: htmlContent,
        parse_mode: 'HTML',
      };

      if (options?.replyToMessageId) {
        params.reply_to_message_id = parseInt(options.replyToMessageId, 10);
      }
      if (options?.threadId) {
        params.message_thread_id = parseInt(options.threadId, 10);
      }

      const result = await this.apiCall<{ message_id: number }>('sendMessage', params);
      return result.message_id.toString();
    } catch (error) {
      console.error('[Telegram] Failed to send message:', error);
      throw error;
    }
  }
  
  /**
   * Edit a message using Telegram's editMessageText API
   */
  async edit(messageId: string, newContent: string, to?: string): Promise<boolean> {
    if (!this.connected || !to) return false;
    
    try {
      const chatId = this.parseChatId(to);
      const htmlContent = markdownToTelegramHtml(newContent);
      
      await this.apiCall('editMessageText', {
        chat_id: chatId,
        message_id: parseInt(messageId, 10),
        text: htmlContent,
        parse_mode: 'HTML',
      });
      
      return true;
    } catch (error) {
      console.error('[Telegram] Failed to edit message:', error);
      return false;
    }
  }
  
  /**
   * Delete a message using Telegram's deleteMessage API
   */
  async delete(messageId: string, to?: string): Promise<boolean> {
    if (!this.connected || !to) return false;
    
    try {
      const chatId = this.parseChatId(to);
      
      await this.apiCall('deleteMessage', {
        chat_id: chatId,
        message_id: parseInt(messageId, 10),
      });
      
      return true;
    } catch (error) {
      console.error('[Telegram] Failed to delete message:', error);
      return false;
    }
  }

  async sendTyping(to: string, threadId?: string): Promise<void> {
    if (!this.connected) return;

    const chatId = this.parseChatId(to);

    try {
      const params: Record<string, any> = { chat_id: chatId };
      if (threadId) {
        params.message_thread_id = parseInt(threadId, 10);
      }
      await this.apiCall('sendChatAction', { ...params, action: 'typing' });
    } catch {
      // Ignore typing indicator errors
    }
  }

  async sendMedia(
    to: string,
    media: ChannelMediaPayload,
    options?: { replyToMessageId?: string; threadId?: string }
  ): Promise<string> {
    if (!this.connected) {
      throw new Error('Telegram not connected');
    }

    const chatId = this.parseChatId(to);
    const sendKind = this.resolveSendKind(media);
    const sendMethod = this.resolveSendMethod(sendKind);
    const mediaField = this.resolveMediaField(sendMethod);
    const params: Record<string, string> = {
      chat_id: String(chatId),
    };

    if (options?.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }
    if (options?.threadId) {
      params.message_thread_id = options.threadId;
    }

    const caption = media.caption?.trim();
    if (caption) {
      params.caption = markdownToTelegramHtml(caption);
      params.parse_mode = 'HTML';
    }

    if (this.isHttpUrl(media.url)) {
      const payload = {
        ...params,
        [mediaField]: media.url,
      };
      const result = await this.apiCall<{ message_id: number }>(sendMethod, payload);
      return result.message_id.toString();
    }

    const localMedia = await this.readLocalMedia(media.url, media.filename);
    return this.sendMultipartMedia(sendMethod, mediaField, params, localMedia.data, localMedia.filename);
  }

  async sendDocument(to: string, document: Buffer, filename: string, caption?: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Telegram not connected');
    }

    const chatId = this.parseChatId(to);
    const params: Record<string, string> = {
      chat_id: String(chatId),
    };

    if (caption?.trim()) {
      params.caption = markdownToTelegramHtml(caption.trim());
      params.parse_mode = 'HTML';
    }

    await this.sendMultipartMedia(
      'sendDocument',
      'document',
      params,
      document,
      path.basename(filename) || 'document'
    );
  }

  async reactToMessage(messageId: string, emoji: string, chatId?: string): Promise<void> {
    if (!this.connected || !chatId) return;

    try {
      await this.apiCall('setMessageReaction', {
        chat_id: this.parseChatId(chatId),
        message_id: parseInt(messageId, 10),
        reaction: [{ type: 'emoji', emoji }],
      });
    } catch {
      // Ignore reaction errors (API might not support it or message too old)
    }
  }

  async removeReaction(messageId: string, chatId?: string): Promise<void> {
    if (!this.connected || !chatId) return;

    try {
      await this.apiCall('setMessageReaction', {
        chat_id: this.parseChatId(chatId),
        message_id: parseInt(messageId, 10),
        reaction: [], // Empty array removes all reactions
      });
    } catch {
      // Ignore reaction errors
    }
  }

  onMessage(handler: (msg: ChannelMessage) => Promise<ChannelResponse | void>): void {
    this.messageHandler = handler;
  }

  getBotInfo(): TelegramBotInfo | undefined {
    return this.botInfo;
  }

  private parseChatId(to: string): number | string {
    // Handle @username format
    if (to.startsWith('@')) {
      return to;
    }
    // Handle numeric ID
    const numericId = parseInt(to, 10);
    if (!isNaN(numericId)) {
      return numericId;
    }
    return to;
  }

  private resolveSendKind(media: ChannelMediaPayload): 'photo' | 'video' | 'audio' | 'voice' | 'document' {
    if (media.type === 'photo' || media.type === 'video' || media.type === 'audio' || media.type === 'voice' || media.type === 'document') {
      return media.type;
    }

    const lower = (media.filename || media.url).toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'photo';
    if (/\.(mp4|mov|webm|mkv|avi)$/.test(lower)) return 'video';
    if (/\.(mp3|m4a|wav|flac|aac)$/.test(lower)) return 'audio';
    if (/\.(ogg|opus)$/.test(lower)) return 'voice';
    return 'document';
  }

  private resolveSendMethod(kind: 'photo' | 'video' | 'audio' | 'voice' | 'document'): 'sendPhoto' | 'sendVideo' | 'sendAudio' | 'sendVoice' | 'sendDocument' {
    if (kind === 'photo') return 'sendPhoto';
    if (kind === 'video') return 'sendVideo';
    if (kind === 'audio') return 'sendAudio';
    if (kind === 'voice') return 'sendVoice';
    return 'sendDocument';
  }

  private resolveMediaField(method: 'sendPhoto' | 'sendVideo' | 'sendAudio' | 'sendVoice' | 'sendDocument'): 'photo' | 'video' | 'audio' | 'voice' | 'document' {
    if (method === 'sendPhoto') return 'photo';
    if (method === 'sendVideo') return 'video';
    if (method === 'sendAudio') return 'audio';
    if (method === 'sendVoice') return 'voice';
    return 'document';
  }

  private isHttpUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async readLocalMedia(rawPath: string, filenameHint?: string): Promise<{ data: Buffer; filename: string }> {
    const normalizedPath = rawPath.startsWith('file://')
      ? fileURLToPath(rawPath)
      : path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(process.cwd(), rawPath);
    const data = await readFile(normalizedPath);
    return {
      data,
      filename: filenameHint || path.basename(normalizedPath) || 'media',
    };
  }

  private async sendMultipartMedia(
    method: 'sendPhoto' | 'sendVideo' | 'sendAudio' | 'sendVoice' | 'sendDocument',
    mediaField: 'photo' | 'video' | 'audio' | 'voice' | 'document',
    params: Record<string, string>,
    data: Buffer,
    filename: string
  ): Promise<string> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(params)) {
      formData.append(key, value);
    }
    formData.append(mediaField, new Blob([Uint8Array.from(data)]), filename);

    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      body: formData,
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const payload = await response.json() as TelegramApiResponse<{ message_id: number }>;
    if (!payload.ok || !payload.result) {
      throw new Error(payload.description || `API Error ${payload.error_code}`);
    }

    return payload.result.message_id.toString();
  }

  private async apiCall<T>(method: string, params?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as TelegramApiResponse<T>;
    
    if (!data.ok) {
      throw new Error(data.description || `API Error ${data.error_code}`);
    }

    return data.result as T;
  }

  private startPolling(): void {
    if (!this.connected) return;

    const poll = async () => {
      if (!this.connected) return;

      try {
        const updates = await this.getUpdates();
        this.reconnectAttempts = 0; // Reset on success

        for (const update of updates) {
          await this.handleUpdate(update);
        }

        // Continue polling immediately if we got updates, slight delay if not
        const delay = updates.length > 0 ? 0 : 100;
        this.pollTimeout = setTimeout(poll, delay);
      } catch (error) {
        if (!this.connected) return;

        console.error('[Telegram] Polling error:', error);
        this.handleReconnect();
      }
    };

    poll();
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const params: Record<string, any> = {
      limit: 100,
      timeout: 30, // Long polling timeout
      allowed_updates: this.allowedUpdates,
    };

    if (this.lastUpdateId > 0) {
      params.offset = this.lastUpdateId + 1;
    }

    try {
      const updates = await this.apiCall<TelegramUpdate[]>('getUpdates', params);
      return updates;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return [];
      }
      throw error;
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    // Update last seen ID
    if (update.update_id > this.lastUpdateId) {
      this.lastUpdateId = update.update_id;
    }

    const message = update.message || update.edited_message;
    if (!message) return;

    // Skip messages from the bot itself
    if (message.from?.id === this.botInfo?.id) return;

    const chatId = message.chat.id.toString();
    const senderId = message.from?.id?.toString() || '';
    const senderUsername = message.from?.username
      ? `@${message.from.username}`
      : message.from?.first_name || 'Unknown';
    const senderName = `${message.from?.first_name || ''} ${message.from?.last_name || ''}`.trim() || senderUsername;

    const inboundMedia = await this.resolveInboundMedia(message);
    // Do NOT prefix content with [GroupTitle] — send raw text/caption to the agent.
    // Group context is available in metadata for the agent to use if needed.
    const content = message.text || message.caption || this.buildMediaPlaceholder(inboundMedia);
    if (!content && inboundMedia.length === 0) return;

    const isReplyToBot = message.reply_to_message?.from?.id === this.botInfo?.id;
    const wasMentioned = this.detectBotMention(message) || isReplyToBot;
    const canDetectMention = Boolean(this.botInfo?.username) && message.chat.type !== 'private';

    const channelMsg: ChannelMessage = {
      id: message.message_id.toString(),
      channel: 'telegram',
      from: senderName,
      content,
      timestamp: new Date(message.date * 1000),
      metadata: {
        chatId,
        chatType: message.chat.type,
        chatTitle: message.chat.type !== 'private' ? (message.chat.title || '') : undefined,
        messageId: message.message_id.toString(),
        threadId: message.message_thread_id?.toString(),
        replyToMessageId: message.reply_to_message?.message_id?.toString(),
        replyTarget: chatId,
        senderId,
        senderUsername,
        senderName,
        wasMentioned,
        canDetectMention,
        media: inboundMedia,
      },
    };

    if (this.messageHandler) {
      try {
        await this.messageHandler(channelMsg);
      } catch (error) {
        console.error('[Telegram] Message handler error:', error);
      }
    }
  }

  private async resolveInboundMedia(message: TelegramMessage): Promise<Array<{
    type: 'photo' | 'video' | 'audio' | 'document' | 'voice';
    fileId?: string;
    caption?: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    url?: string;
    localPath?: string;
    extractedText?: string;
    extractionMethod?: string;
    extractionError?: string;
  }>> {
    const media: Array<{
      type: 'photo' | 'video' | 'audio' | 'document' | 'voice';
      fileId?: string;
      caption?: string;
      filename?: string;
      mimeType?: string;
      size?: number;
      url?: string;
      localPath?: string;
      extractedText?: string;
      extractionMethod?: string;
      extractionError?: string;
    }> = [];
    const caption = message.caption?.trim() || undefined;

    const largestPhoto = message.photo?.[message.photo.length - 1];
    if (largestPhoto?.file_id) {
      media.push({
        type: 'photo',
        fileId: largestPhoto.file_id,
        caption,
        filename: `photo-${largestPhoto.file_unique_id}.jpg`,
        size: largestPhoto.file_size,
      });
    }

    if (message.video?.file_id) {
      media.push({
        type: 'video',
        fileId: message.video.file_id,
        caption,
        filename: message.video.file_name,
        mimeType: message.video.mime_type,
        size: message.video.file_size,
      });
    }

    if (message.audio?.file_id) {
      media.push({
        type: 'audio',
        fileId: message.audio.file_id,
        caption,
        filename: message.audio.file_name,
        mimeType: message.audio.mime_type,
        size: message.audio.file_size,
      });
    }

    if (message.voice?.file_id) {
      media.push({
        type: 'voice',
        fileId: message.voice.file_id,
        caption,
        filename: `voice-${message.voice.file_unique_id}.ogg`,
        mimeType: message.voice.mime_type,
        size: message.voice.file_size,
      });
    }

    if (message.document?.file_id) {
      media.push({
        type: 'document',
        fileId: message.document.file_id,
        caption,
        filename: message.document.file_name,
        mimeType: message.document.mime_type,
        size: message.document.file_size,
      });
    }

    const enrichTargets = media.slice(0, 3);
    for (const item of enrichTargets) {
      if (!item.fileId) continue;
      if (typeof item.size === 'number' && item.size > TELEGRAM_MAX_INBOUND_BYTES) {
        item.extractionError = `File too large to download (${item.size} bytes)`;
        continue;
      }

      try {
        const downloaded = await this.downloadTelegramFile(item.fileId, item.filename, item.mimeType);
        item.url = downloaded.localPath;
        item.localPath = downloaded.localPath;
        item.filename = item.filename || downloaded.filename;
        item.mimeType = item.mimeType || downloaded.mimeType;
        item.size = item.size || downloaded.size;

        const understood = await analyzeInboundMedia({
          localPath: downloaded.localPath,
          type: item.type,
          filename: item.filename,
          mimeType: item.mimeType,
        });
        item.extractedText = understood.extractedText;
        item.extractionMethod = understood.extractionMethod;
        item.extractionError = understood.extractionError;
      } catch (error) {
        item.extractionError = error instanceof Error ? error.message : String(error);
      }
    }

    return media;
  }

  private async downloadTelegramFile(
    fileId: string,
    filenameHint?: string,
    mimeTypeHint?: string
  ): Promise<{ localPath: string; filename: string; mimeType?: string; size?: number }> {
    const file = await this.apiCall<TelegramFileInfo>('getFile', { file_id: fileId });
    if (!file?.file_path) {
      throw new Error('Telegram file_path not available');
    }

    const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
    const response = await fetch(downloadUrl, { signal: this.abortController?.signal });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Telegram download failed: HTTP ${response.status} ${errorText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || mimeTypeHint || undefined;
    const saved = await saveInboundMediaBuffer({
      data: buffer,
      filenameHint: filenameHint || path.basename(file.file_path),
      mimeType: contentType,
      prefix: 'foxfang-telegram-inbound',
    });

    return {
      localPath: saved.localPath,
      filename: saved.filename,
      mimeType: contentType,
      size: file.file_size || buffer.length,
    };
  }

  private buildMediaPlaceholder(
    media: Array<{ type: 'photo' | 'video' | 'audio' | 'document' | 'voice' }>
  ): string {
    if (media.length === 0) return '';
    if (media.length === 1) return `<media:${media[0].type}>`;
    return `<media:${media.map((item) => item.type).join(',')}>`;
  }

  private handleReconnect(): void {
    if (!this.connected) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      BACKOFF_CONFIG.initialMs * Math.pow(BACKOFF_CONFIG.factor, this.reconnectAttempts - 1),
      BACKOFF_CONFIG.maxMs
    );
    const jitter = delay * BACKOFF_CONFIG.jitter * (Math.random() - 0.5);
    const finalDelay = Math.max(0, delay + jitter);

    console.log(`[Telegram] 🔄 Reconnecting in ${Math.round(finalDelay / 1000)}s (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimeout = setTimeout(() => {
      this.startPolling();
    }, finalDelay);
  }

  private detectBotMention(message: TelegramMessage): boolean {
    const username = this.botInfo?.username?.trim();
    const text = message.text || message.caption || '';
    if (!username || !text) return false;

    const normalizedHandle = `@${username.toLowerCase()}`;
    const lowerText = text.toLowerCase();
    if (lowerText.includes(normalizedHandle)) return true;

    const entitySources: Array<{ text: string; entities?: TelegramEntity[] }> = [
      { text: message.text || '', entities: message.entities },
      { text: message.caption || '', entities: message.caption_entities },
    ];

    for (const source of entitySources) {
      if (!source.text || !Array.isArray(source.entities)) continue;
      for (const entity of source.entities) {
        if (entity.type !== 'mention') continue;
        const mention = source.text.slice(entity.offset, entity.offset + entity.length).toLowerCase();
        if (mention === normalizedHandle) return true;
      }
    }

    return false;
  }
}
