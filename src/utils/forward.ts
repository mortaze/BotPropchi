export interface ForwardMeta {
  type: string;
  originName: string;
  originChatId: number | null;
  originMessageId: number | null;
  originUserId: number | null;
  originUsername: string | null;
  forwardDate: number | null;
}

export function extractForwardMeta(message: any): {
  isForwarded: boolean;
  forwardMeta: ForwardMeta | null;
  forwardSourceChatId: bigint | null;
  forwardSourceMessageId: number | null;
} {
  const fo = message.forward_origin;
  const hasLegacy = !!(message.forward_from_chat || message.forward_from);
  const hasModern = !!fo;
  const hasDate = !!message.forward_date;
  const hasSenderName = !!message.forward_sender_name;

  if (!hasModern && !hasLegacy && !hasDate && !hasSenderName) {
    return { isForwarded: false, forwardMeta: null, forwardSourceChatId: null, forwardSourceMessageId: null };
  }

  let type = 'hidden_user';
  let originName = message.forward_sender_name || '';
  let originChatId: number | null = null;
  let originMessageId: number | null = null;
  let originUserId: number | null = null;
  let originUsername: string | null = null;
  let forwardDate: number | null = message.forward_date || null;

  if (fo) {
    if (fo.type === 'channel') {
      type = 'channel';
      originName = fo.chat?.title || '';
      originChatId = fo.chat?.id ? Number(fo.chat.id) : null;
      originMessageId = fo.message_id || null;
      forwardDate = fo.date || forwardDate;
    } else if (fo.type === 'chat') {
      type = 'user';
      originName = [fo.sender_chat?.title, fo.sender_chat?.first_name, fo.sender_chat?.last_name].filter(Boolean).join(' ');
      originChatId = fo.sender_chat?.id ? Number(fo.sender_chat.id) : null;
    } else if (fo.type === 'user') {
      type = 'user';
      originName = [fo.sender_user?.first_name, fo.sender_user?.last_name].filter(Boolean).join(' ');
      originUserId = fo.sender_user?.id ? Number(fo.sender_user.id) : null;
      originUsername = fo.sender_user?.username || null;
    } else if (fo.type === 'hidden_user') {
      type = 'hidden_user';
      originName = fo.sender_name || '';
    }
  } else if (message.forward_from_chat) {
    type = message.forward_from_chat.type || 'channel';
    originName = message.forward_from_chat.title || '';
    originChatId = message.forward_from_chat.id ? Number(message.forward_from_chat.id) : null;
    originMessageId = message.forward_from_message_id || null;
  } else if (message.forward_from) {
    type = 'user';
    originName = [message.forward_from.first_name, message.forward_from.last_name].filter(Boolean).join(' ');
    originUserId = message.forward_from.id ? Number(message.forward_from.id) : null;
    originUsername = message.forward_from.username || null;
  }

  const safeChatId = originChatId != null ? originChatId : null;
  const safeMsgId = originMessageId != null ? originMessageId : null;
  const safeUserId = originUserId != null ? originUserId : null;

  return {
    isForwarded: true,
    forwardMeta: { type, originName, originChatId: safeChatId, originMessageId: safeMsgId, originUserId: safeUserId, originUsername, forwardDate },
    forwardSourceChatId: originChatId != null ? BigInt(originChatId) : null,
    forwardSourceMessageId: originMessageId,
  };
}
