import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Author } from '../author/entities/author.entity';
import { Comments } from '../comments/entities/comments.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Author)
    private readonly authorRepository: Repository<Author>,
    @InjectRepository(Comments)
    private readonly commentsRepository: Repository<Comments>
  ) {}

  async create(createDto: CreateUserDto): Promise<User> {
    const {
          author,
          comments,
      ...rest
    } = createDto;

    const entity = this.userRepository.create(rest);








    if (author) {
      entity.author = await this.authorRepository.findOneBy({ id: author });
    }


    if (comments !== undefined) {
      entity.comments = comments.length > 0 ? await this.commentsRepository.findBy({ id: In(comments) }) : [];
    }

    return await this.userRepository.save(entity);
  }

  async findAll(): Promise<User[]> {
    return await this.userRepository.find({
      relations: ["author", "comments"],
    });
  }

  async findOne(id: number): Promise<User> {
    const entity = await this.userRepository.findOne({
      where: { id },
      relations: ["author", "comments"],
    });

    if (!entity) {
      throw new NotFoundException('User not found');
    }

    return entity;
  }

  async update(id: number, updateDto: UpdateUserDto): Promise<User> {
    const {
          author,
          comments,
      ...rest
    } = updateDto;

    const entity = await this.userRepository.findOne({
      where: { id },
      relations: { author: true, comments: true },
    });

    if (!entity) {
      throw new NotFoundException('User not found');
    }

    Object.assign(entity, rest);








    if (author !== undefined) {
      entity.author = author ? await this.authorRepository.findOneBy({ id: author }) : null;
    }


    if (comments !== undefined) {
      entity.comments = comments.length > 0 ? await this.commentsRepository.findBy({ id: In(comments) }) : [];
    }

    await this.userRepository.save(entity);
    return entity
  }

  async remove(id: number): Promise<void> {

     const entity = await this.userRepository.findOne({
      where: { id },
    });

    if (!entity) {
      throw new NotFoundException('User not found');
    }


    const result = await this.userRepository.delete(entity.id);
    if (result.affected === 0) {
      throw new NotFoundException('User not found');
    }
  }
}
