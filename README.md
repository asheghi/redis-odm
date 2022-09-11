# Redis-odm

Redis Object Document Mapping for Node.js

**Redis-Stack** or redis json module is required.

#### Usage
```typescript
    import { model } from 'redis-odm';

    // auto completion and type checking
    type PostType = {
      title: string
      content: string
      views: number
    }
    
    // create a typed model
    const Post = model<PostType>('post')

    // create a document
    const post = Post.create({
      title: 'awesome blog post',
      content: 'content',
      views: 0
    })


    // make sure document is synced with redis
    await post.save()

    // modify document;
    post.content += 'extra content';
    post.views++

    await post.save()
```
