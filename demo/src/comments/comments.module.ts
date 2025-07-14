import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { Comments } from './entities/comments.entity';
import { Post } from '../post/entities/post.entity';

@Module({
    imports:[
        TypeOrmModule.forFeature([
        Comments,
            Post ,
         ]),
      ],
  controllers: [CommentsController],
  providers: [CommentsService]
})
export class CommentsModule {}
