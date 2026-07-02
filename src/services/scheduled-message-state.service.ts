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
