import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User } from './entities/user.entity';
import { Author } from '../author/entities/author.entity';
import { Comments } from '../comments/entities/comments.entity';

@Module({
    imports:[
        TypeOrmModule.forFeature([
        User,
            Author ,
            Comments ,
         ]),
      ],
  controllers: [UserController],
  providers: [UserService]
})
export class UserModule {}
