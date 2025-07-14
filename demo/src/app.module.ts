import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user/entities/user.entity';
import { UserModule } from "./user/user.module";
import { AuthorModule } from './author/author.module';
import { CommentsModule } from './comments/comments.module';

@Module({
  imports: [ TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'test.db',
      entities: [User],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([User]),
        UserModule,
        AuthorModule,
        CommentsModule
    ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
