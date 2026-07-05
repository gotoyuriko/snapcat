import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ChatMessageRecord {
  id: string;
  catId: string;
  senderId: string;
  content: string;
  photoUrl: string | null;
  createdAt: Date;
}

export class ChatService {
  /**
   * Check if a user is a Lvl1+ owner of a cat.
   * Returns true if ownership exists with level >= 1 and is not revoked
   * for inactivity (Requirement 16.2).
   */
  async isLvl1Owner(userId: string, catId: string): Promise<boolean> {
    const ownership = await prisma.ownership.findUnique({
      where: {
        userId_catId: { userId, catId },
      },
    });
    return ownership !== null && ownership.level >= 1 && ownership.revokedAt == null;
  }

  /**
   * Send a message in a cat's community chat.
   * Verifies ownership level >= 1 before persisting.
   * Requirement 8.3: persist first, then caller broadcasts.
   */
  async sendMessage(
    catId: string,
    senderId: string,
    content: string,
    photoUrl?: string,
  ): Promise<ChatMessageRecord> {
    const isOwner = await this.isLvl1Owner(senderId, catId);
    if (!isOwner) {
      throw new ForbiddenError('User is not a Lvl1+ owner of this cat');
    }

    const message = await prisma.chatMessage.create({
      data: {
        catId,
        senderId,
        content,
        photoUrl: photoUrl ?? null,
      },
    });

    return message;
  }

  /**
   * Get message history for a cat's chat with cursor-based pagination.
   * Verifies ownership level >= 1 before returning messages.
   */
  async getMessages(catId: string, userId: string, limit: number = 50, before?: Date): Promise<ChatMessageRecord[]> {
    const isOwner = await this.isLvl1Owner(userId, catId);
    if (!isOwner) {
      throw new ForbiddenError('User is not a Lvl1+ owner of this cat');
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        catId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });

    return messages;
  }
}

export class ForbiddenError extends Error {
  public statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
