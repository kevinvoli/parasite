export class CreateUserDto {
  username: string;
    email: string;
    isActive: boolean;
    description?: string;
    publishedAt: string;
    isPublished: boolean;
    authorId: number;
  commentsIds: number[];
}
