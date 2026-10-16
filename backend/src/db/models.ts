export interface User {
  id: string;
  googleId: string | null;
  uniqueTag: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: Date;
}

export interface Friendship {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: Date;
}

export interface GameInvitation {
  id: string;
  senderId: string;
  receiverId: string;
  lobbyId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  createdAt: Date;
}
