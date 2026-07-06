import { cache } from '../utils/cache';

const PREFIX = 'ar:';

function arKey(userId: number, field: string) {
  return `${PREFIX}${userId}:${field}`;
}

export const autoReplyState = {
  setCreating(userId: number) {
    cache.setPermanent(arKey(userId, 'creating'), true);
  },
  isCreating(userId: number) {
    return cache.get<boolean>(arKey(userId, 'creating'));
  },

  setEditingField(userId: number, field: string) {
    cache.setPermanent(arKey(userId, 'editing_field'), field);
  },
  getEditingField(userId: number) {
    return cache.get<string>(arKey(userId, 'editing_field'));
  },

  setEditingMessage(userId: number, messageId: number) {
    cache.setPermanent(arKey(userId, 'editing_message'), messageId);
  },
  getEditingMessage(userId: number) {
    return cache.get<number>(arKey(userId, 'editing_message'));
  },

  setSelectedMessage(userId: number, messageId: number) {
    cache.setPermanent(arKey(userId, 'selected_message'), messageId);
  },
  getSelectedMessage(userId: number) {
    return cache.get<number>(arKey(userId, 'selected_message'));
  },

  setEditingTitle(userId: number, value: boolean) {
    cache.setPermanent(arKey(userId, 'editing_title'), value);
  },
  isEditingTitle(userId: number) {
    return cache.get<boolean>(arKey(userId, 'editing_title'));
  },

  setEditingContent(userId: number, value: boolean) {
    cache.setPermanent(arKey(userId, 'editing_content'), value);
  },
  isEditingContent(userId: number) {
    return cache.get<boolean>(arKey(userId, 'editing_content'));
  },

  setEditMode(userId: number, messageId: number) {
    cache.setPermanent(arKey(userId, 'edit_mode'), messageId);
  },
  getEditMode(userId: number) {
    return cache.get<number>(arKey(userId, 'edit_mode'));
  },

  setDeleteConfirm(userId: number, messageId: number) {
    cache.setPermanent(arKey(userId, 'delete_confirm'), messageId);
  },
  getDeleteConfirm(userId: number) {
    return cache.get<number>(arKey(userId, 'delete_confirm'));
  },

  setManagementMode(userId: number, value: boolean) {
    cache.setPermanent(arKey(userId, 'mgmt_mode'), value);
  },
  isManagementMode(userId: number) {
    return cache.get<boolean>(arKey(userId, 'mgmt_mode'));
  },

  // ─── Keyword management state ────────────────────────────

  setKeywordMode(userId: number, mode: string) {
    cache.setPermanent(arKey(userId, 'kw_mode'), mode);
  },
  getKeywordMode(userId: number) {
    return cache.get<string>(arKey(userId, 'kw_mode'));
  },

  setKeywordCreating(userId: number, value: boolean) {
    cache.setPermanent(arKey(userId, 'kw_creating'), value);
  },
  isKeywordCreating(userId: number) {
    return cache.get<boolean>(arKey(userId, 'kw_creating'));
  },

  setKeywordEditing(userId: number, keywordId: number) {
    cache.setPermanent(arKey(userId, 'kw_editing'), keywordId);
  },
  getKeywordEditing(userId: number) {
    return cache.get<number>(arKey(userId, 'kw_editing'));
  },

  // ─── Button editor state ─────────────────────────────────

  setButtonEditorMode(userId: number, mode: string) {
    cache.setPermanent(arKey(userId, 'btn_editor_mode'), mode);
  },
  getButtonEditorMode(userId: number) {
    return cache.get<string>(arKey(userId, 'btn_editor_mode'));
  },

  setButtonEditorRow(userId: number, row: number) {
    cache.setPermanent(arKey(userId, 'btn_editor_row'), row);
  },
  getButtonEditorRow(userId: number) {
    return cache.get<number>(arKey(userId, 'btn_editor_row'));
  },

  setButtonEditorCol(userId: number, col: number) {
    cache.setPermanent(arKey(userId, 'btn_editor_col'), col);
  },
  getButtonEditorCol(userId: number) {
    return cache.get<number>(arKey(userId, 'btn_editor_col'));
  },

  setButtonEditorMsgId(userId: number, msgId: number) {
    cache.setPermanent(arKey(userId, 'pbedit_editor_msg_id'), msgId);
  },
  getButtonEditorMsgId(userId: number) {
    return cache.get<number>(arKey(userId, 'pbedit_editor_msg_id'));
  },
  clearButtonEditorMsgId(userId: number) {
    cache.del(arKey(userId, 'pbedit_editor_msg_id'));
  },

  setButtonMode(userId: number, mode: string) {
    cache.setPermanent(arKey(userId, 'btn_mode'), mode);
  },
  getButtonMode(userId: number) {
    return cache.get<string>(arKey(userId, 'btn_mode'));
  },

  setButtonState(userId: number, state: string) {
    cache.setPermanent(arKey(userId, 'btn_state'), state);
  },
  getButtonState(userId: number) {
    return cache.get<string>(arKey(userId, 'btn_state'));
  },

  setButtonRow(userId: number, row: number) {
    cache.setPermanent(arKey(userId, 'btn_row'), row);
  },
  getButtonRow(userId: number) {
    return cache.get<number>(arKey(userId, 'btn_row'));
  },

  setButtonCol(userId: number, col: number) {
    cache.setPermanent(arKey(userId, 'btn_col'), col);
  },
  getButtonCol(userId: number) {
    return cache.get<number>(arKey(userId, 'btn_col'));
  },

  setButtonType(userId: number, type: string) {
    cache.setPermanent(arKey(userId, 'btn_type'), type);
  },
  getButtonType(userId: number) {
    return cache.get<string>(arKey(userId, 'btn_type'));
  },

  setButtonColor(userId: number, color: string) {
    cache.setPermanent(arKey(userId, 'btn_color'), color);
  },
  getButtonColor(userId: number) {
    return cache.get<string>(arKey(userId, 'btn_color'));
  },

  setButtonPreviousView(userId: number, view: string) {
    cache.setPermanent(arKey(userId, 'btn_previous_view'), view);
  },
  getButtonPreviousView(userId: number) {
    return cache.get<string>(arKey(userId, 'btn_previous_view'));
  },

  setButtonMoveActive(userId: number, active: boolean) {
    cache.setPermanent(arKey(userId, 'btn_move_active'), active);
  },
  isButtonMoveActive(userId: number) {
    return cache.get<boolean>(arKey(userId, 'btn_move_active'));
  },

  setButtonMoveSelected(userId: number, row: number, col: number) {
    cache.setPermanent(arKey(userId, 'btn_move_row'), row);
    cache.setPermanent(arKey(userId, 'btn_move_col'), col);
  },
  getButtonMoveSelected(userId: number) {
    return { row: cache.get<number>(arKey(userId, 'btn_move_row')), col: cache.get<number>(arKey(userId, 'btn_move_col')) };
  },

  setButtonPendingDelete(userId: number, row: number, col: number) {
    cache.setPermanent(arKey(userId, 'btn_pending_delete'), JSON.stringify({ row, col }));
  },
  getButtonPendingDelete(userId: number) {
    const raw = cache.get<string>(arKey(userId, 'btn_pending_delete'));
    return raw ? JSON.parse(raw) : null;
  },

  // ─── Button edit waiting state ─────────────────────────────

  setButtonEditWaiting(userId: number, waiting: string | null) {
    if (waiting) {
      cache.setPermanent(arKey(userId, 'btn_edit_waiting'), waiting);
    } else {
      cache.del(arKey(userId, 'btn_edit_waiting'));
    }
  },
  getButtonEditWaiting(userId: number): string | null {
    return cache.get<string>(arKey(userId, 'btn_edit_waiting')) || null;
  },

  clearButtonEditorState(userId: number) {
    const fields = [
      'pbedit_editor_msg_id', 'btn_mode', 'btn_state', 'btn_row', 'btn_col',
      'btn_type', 'btn_color', 'btn_previous_view', 'btn_move_active',
      'btn_move_row', 'btn_move_col', 'btn_pending_delete',
      'btn_edit_waiting',
    ];
    for (const field of fields) {
      cache.del(arKey(userId, field));
    }
  },

  clearAll(userId: number) {
    const fields = [
      'creating', 'editing_field', 'editing_message', 'selected_message',
      'editing_title', 'editing_content', 'edit_mode', 'delete_confirm',
      'mgmt_mode', 'kw_mode', 'kw_creating', 'kw_editing',
      'btn_editor_mode', 'btn_editor_row', 'btn_editor_col',
      'pbedit_editor_msg_id', 'btn_mode', 'btn_state', 'btn_row', 'btn_col',
      'btn_type', 'btn_color', 'btn_previous_view', 'btn_move_active',
      'btn_move_row', 'btn_move_col', 'btn_pending_delete',
      'btn_edit_waiting',
    ];
    for (const field of fields) {
      cache.del(arKey(userId, field));
    }
  },
};
