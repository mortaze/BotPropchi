import { cache } from '../utils/cache';

const PREFIX = 'sched:';

function schedKey(userId: number, field: string) {
  return `${PREFIX}${userId}:${field}`;
}

export const scheduledMessageState = {
  setCreating(userId: number) {
    cache.setPermanent(schedKey(userId, 'creating'), true);
  },
  isCreating(userId: number) {
    return cache.get<boolean>(schedKey(userId, 'creating'));
  },

  setEditingField(userId: number, field: string) {
    cache.setPermanent(schedKey(userId, 'editing_field'), field);
  },
  getEditingField(userId: number) {
    return cache.get<string>(schedKey(userId, 'editing_field'));
  },

  setEditingMessage(userId: number, messageId: number) {
    cache.setPermanent(schedKey(userId, 'editing_message'), messageId);
  },
  getEditingMessage(userId: number) {
    return cache.get<number>(schedKey(userId, 'editing_message'));
  },

  setSelectedMessage(userId: number, messageId: number) {
    cache.setPermanent(schedKey(userId, 'selected_message'), messageId);
  },
  getSelectedMessage(userId: number) {
    return cache.get<number>(schedKey(userId, 'selected_message'));
  },

  setEditingTitle(userId: number, value: boolean) {
    cache.setPermanent(schedKey(userId, 'editing_title'), value);
  },
  isEditingTitle(userId: number) {
    return cache.get<boolean>(schedKey(userId, 'editing_title'));
  },

  setEditingContent(userId: number, value: boolean) {
    cache.setPermanent(schedKey(userId, 'editing_content'), value);
  },
  isEditingContent(userId: number) {
    return cache.get<boolean>(schedKey(userId, 'editing_content'));
  },

  setSchedulingMode(userId: number, messageId: number) {
    cache.setPermanent(schedKey(userId, 'scheduling'), messageId);
  },
  getSchedulingMode(userId: number) {
    return cache.get<number>(schedKey(userId, 'scheduling'));
  },

  setScheduleStep(userId: number, step: string) {
    cache.setPermanent(schedKey(userId, 'schedule_step'), step);
  },
  getScheduleStep(userId: number) {
    return cache.get<string>(schedKey(userId, 'schedule_step'));
  },

  setIntervalHours(userId: number, hours: number) {
    cache.setPermanent(schedKey(userId, 'interval_hours'), hours);
  },
  getIntervalHours(userId: number) {
    return cache.get<number>(schedKey(userId, 'interval_hours'));
  },

  setStartTime(userId: number, time: string) {
    cache.setPermanent(schedKey(userId, 'start_time'), time);
  },
  getStartTime(userId: number) {
    return cache.get<string>(schedKey(userId, 'start_time'));
  },

  setTargetGroup(userId: number, chatId: number) {
    cache.setPermanent(schedKey(userId, 'target_group'), chatId);
  },
  getTargetGroup(userId: number) {
    return cache.get<number>(schedKey(userId, 'target_group'));
  },

  setTargetTopic(userId: number, topicId: number | null) {
    cache.setPermanent(schedKey(userId, 'target_topic'), topicId);
  },
  getTargetTopic(userId: number) {
    return cache.get<number | null>(schedKey(userId, 'target_topic'));
  },

  setEditMode(userId: number, messageId: number) {
    cache.setPermanent(schedKey(userId, 'edit_mode'), messageId);
  },
  getEditMode(userId: number) {
    return cache.get<number>(schedKey(userId, 'edit_mode'));
  },

  setDeleteConfirm(userId: number, messageId: number) {
    cache.setPermanent(schedKey(userId, 'delete_confirm'), messageId);
  },
  getDeleteConfirm(userId: number) {
    return cache.get<number>(schedKey(userId, 'delete_confirm'));
  },

  // Button editor state
  setButtonEditorMode(userId: number, mode: string) {
    cache.setPermanent(schedKey(userId, 'btn_editor_mode'), mode);
  },
  getButtonEditorMode(userId: number) {
    return cache.get<string>(schedKey(userId, 'btn_editor_mode'));
  },

  setButtonEditorRow(userId: number, row: number) {
    cache.setPermanent(schedKey(userId, 'btn_editor_row'), row);
  },
  getButtonEditorRow(userId: number) {
    return cache.get<number>(schedKey(userId, 'btn_editor_row'));
  },

  setButtonEditorCol(userId: number, col: number) {
    cache.setPermanent(schedKey(userId, 'btn_editor_col'), col);
  },
  getButtonEditorCol(userId: number) {
    return cache.get<number>(schedKey(userId, 'btn_editor_col'));
  },

  // Management mode
  setManagementMode(userId: number, value: boolean) {
    cache.setPermanent(schedKey(userId, 'mgmt_mode'), value);
  },
  isManagementMode(userId: number) {
    return cache.get<boolean>(schedKey(userId, 'mgmt_mode'));
  },

  // Button editor state (mirrors Post system pbedit: pattern)
  setButtonEditorMsgId(userId: number, msgId: number) {
    cache.setPermanent(schedKey(userId, 'pbedit_editor_msg_id'), msgId);
  },
  getButtonEditorMsgId(userId: number) {
    return cache.get<number>(schedKey(userId, 'pbedit_editor_msg_id'));
  },
  clearButtonEditorMsgId(userId: number) {
    cache.del(schedKey(userId, 'pbedit_editor_msg_id'));
  },

  setButtonMode(userId: number, mode: string) {
    cache.setPermanent(schedKey(userId, 'btn_mode'), mode);
  },
  getButtonMode(userId: number) {
    return cache.get<string>(schedKey(userId, 'btn_mode'));
  },

  setButtonState(userId: number, state: string) {
    cache.setPermanent(schedKey(userId, 'btn_state'), state);
  },
  getButtonState(userId: number) {
    return cache.get<string>(schedKey(userId, 'btn_state'));
  },

  setButtonRow(userId: number, row: number) {
    cache.setPermanent(schedKey(userId, 'btn_row'), row);
  },
  getButtonRow(userId: number) {
    return cache.get<number>(schedKey(userId, 'btn_row'));
  },

  setButtonCol(userId: number, col: number) {
    cache.setPermanent(schedKey(userId, 'btn_col'), col);
  },
  getButtonCol(userId: number) {
    return cache.get<number>(schedKey(userId, 'btn_col'));
  },

  setButtonType(userId: number, type: string) {
    cache.setPermanent(schedKey(userId, 'btn_type'), type);
  },
  getButtonType(userId: number) {
    return cache.get<string>(schedKey(userId, 'btn_type'));
  },

  setButtonColor(userId: number, color: string) {
    cache.setPermanent(schedKey(userId, 'btn_color'), color);
  },
  getButtonColor(userId: number) {
    return cache.get<string>(schedKey(userId, 'btn_color'));
  },

  setButtonPreviousView(userId: number, view: string) {
    cache.setPermanent(schedKey(userId, 'btn_previous_view'), view);
  },
  getButtonPreviousView(userId: number) {
    return cache.get<string>(schedKey(userId, 'btn_previous_view'));
  },

  setButtonMoveActive(userId: number, active: boolean) {
    cache.setPermanent(schedKey(userId, 'btn_move_active'), active);
  },
  isButtonMoveActive(userId: number) {
    return cache.get<boolean>(schedKey(userId, 'btn_move_active'));
  },

  setButtonMoveSelected(userId: number, row: number, col: number) {
    cache.setPermanent(schedKey(userId, 'btn_move_row'), row);
    cache.setPermanent(schedKey(userId, 'btn_move_col'), col);
  },
  getButtonMoveSelected(userId: number) {
    return { row: cache.get<number>(schedKey(userId, 'btn_move_row')), col: cache.get<number>(schedKey(userId, 'btn_move_col')) };
  },

  setButtonPendingDelete(userId: number, row: number, col: number) {
    cache.setPermanent(schedKey(userId, 'btn_pending_delete'), JSON.stringify({ row, col }));
  },
  getButtonPendingDelete(userId: number) {
    const raw = cache.get<string>(schedKey(userId, 'btn_pending_delete'));
    return raw ? JSON.parse(raw) : null;
  },

  clearButtonEditorState(userId: number) {
    const fields = [
      'pbedit_editor_msg_id', 'btn_mode', 'btn_state', 'btn_row', 'btn_col',
      'btn_type', 'btn_color', 'btn_previous_view', 'btn_move_active',
      'btn_move_row', 'btn_move_col', 'btn_pending_delete',
    ];
    for (const field of fields) {
      cache.del(schedKey(userId, field));
    }
  },

  // Clear all state for a user
  clearAll(userId: number) {
    const fields = [
      'creating', 'editing_field', 'editing_message', 'selected_message',
      'editing_title', 'editing_content', 'scheduling', 'schedule_step',
      'interval_hours', 'start_time', 'target_group', 'target_topic',
      'edit_mode', 'delete_confirm', 'btn_editor_mode', 'btn_editor_row',
      'btn_editor_col', 'mgmt_mode',
    ];
    for (const field of fields) {
      cache.del(schedKey(userId, field));
    }
  },
};
