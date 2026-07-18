import { TicketSenderType, SystemEventType } from '@prisma/client';
import { ticketRepository } from '../repositories/ticket.repository';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { systemLogService } from './system-log.service';

export const ticketService = {
  async getOrCreateActiveTicket(userId: number) {
    const tickets = await ticketRepository.findByUserId(userId, 1, 1);
    const active = tickets.items.find((t: any) => t.status === 'OPEN');
    return active ?? null;
  },

  async hasActiveTicket(userId: number): Promise<boolean> {
    const count = await ticketRepository.countOpenByUserId(userId);
    return count > 0;
  },

  async createTicket(userId: number, categoryId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');

    const openCount = await ticketRepository.countOpenByUserId(userId);
    if (openCount >= 1) throw new Error('ACTIVE_TICKET_EXISTS');

    const ticket = await ticketRepository.create({ userId, categoryId });

    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `ticket_created userId=${userId} ticketId=${ticket.id}`,
      userId,
    });

    return ticket;
  },

  async addUserMessage(
    ticketId: number,
    userId: number,
    data: { messageType: any; text?: string; fileId?: string; fileUniqueId?: string; mimeType?: string; fileSize?: number },
  ) {
    const ticket = await ticketRepository.findById(ticketId);
    if (!ticket || ticket.userId !== userId || ticket.status !== 'OPEN') {
      throw new Error('TICKET_NOT_FOUND_OR_CLOSED');
    }

    return ticketRepository.addMessage({
      ticketId,
      senderType: 'USER' as TicketSenderType,
      messageType: data.messageType,
      text: data.text,
      fileId: data.fileId,
      fileUniqueId: data.fileUniqueId,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
    });
  },

  async addAdminMessage(
    ticketId: number,
    data: { messageType: any; text?: string; fileId?: string; fileUniqueId?: string; mimeType?: string; fileSize?: number },
  ) {
    const ticket = await ticketRepository.findById(ticketId);
    if (!ticket || ticket.status !== 'OPEN') {
      throw new Error('TICKET_NOT_FOUND_OR_CLOSED');
    }

    return ticketRepository.addMessage({
      ticketId,
      senderType: 'ADMIN' as TicketSenderType,
      messageType: data.messageType,
      text: data.text,
      fileId: data.fileId,
      fileUniqueId: data.fileUniqueId,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
    });
  },

  async closeTicket(id: number, byAdmin: boolean) {
    const ticket = await ticketRepository.updateStatus(id, 'CLOSED', { closedAt: new Date() });

    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `ticket_closed ticketId=${id} byAdmin=${byAdmin}`,
    });

    return ticket;
  },

  async softDeleteTicket(id: number) {
    return ticketRepository.updateStatus(id, 'DELETED', { deletedAt: new Date() });
  },

  async getTicketWithHistory(id: number) {
    await ticketRepository.markMessagesRead(id, 'USER' as TicketSenderType);
    return ticketRepository.findById(id);
  },

  async getUserTickets(userId: number, page: number, limit: number) {
    return ticketRepository.findByUserId(userId, page, limit);
  },

  async getAllTickets(params: { status?: any; categoryId?: number; page: number; limit: number; search?: string }) {
    return ticketRepository.findAll(params);
  },
};
