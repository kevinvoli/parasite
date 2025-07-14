import { Author } from 'src/author/entities/author.entity';
import { Comments } from 'src/comments/entities/comments.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column()
  email: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  description?: string;

  @Column()
  publishedAt: Date;

  @Column()
  isPublished: boolean;

  @ManyToOne(() => Author)
  author?: Author | null;

  @OneToMany(() => Comments, c => c.post)
  comments: Comments[];
}
