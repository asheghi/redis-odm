// @ts-nocheck
import { model } from '../src/redis-odm'
import Redis from 'ioredis'

const A_TITLE = 'awesome titiel'
const A_TEXT = 'awesome post!'
/**
 * Redis ODM
 */
describe('Reids-ODM', () => {
  const redis = new Redis()
  beforeEach(async () => {
    await redis.flushall()
    await redis.flushdb()
  })

  it('Demo basic', async () => {
    type PostType = {
      title: string
      content?: string
      views?: number
    }

    const Post = model<PostType>('post')
    const post = Post.create({
      title: A_TITLE
    })
    post.content = A_TEXT
    post.views = 1
    post.views++

    expect(post._key).toBeTruthy()
    expect(post.title).toBe(A_TITLE)
    expect(post.content).toBe(A_TEXT)
    expect(post.views).toBe(2)

    await post.save()

    //after save
    expect(post._key).toBeTruthy()
    expect(post.title).toBe(A_TITLE)
    expect(post.content).toBe(A_TEXT)
    expect(post.views).toBe(2)

    const fetched = await Post.findByKey(post._key)
    expect(fetched._key).toBeTruthy()
    expect(fetched.title).toBe(A_TITLE)
    expect(fetched.content).toBe(A_TEXT)
    expect(fetched.views).toBe(2)
    expect(fetched.toObject()).toEqual({
      _key: post._key,
      title: A_TITLE,
      content: A_TEXT,
      views: 2
    })
  })

  it('arrays works!', async () => {
    type UserType = {
      name: string
      email: string
      nested: {
        roles: string[]
      }
    }

    const User = model<UserType>('user')
    const user = User.create({
      name: 'bahman',
      email: 'aheghi.bm@gmail.com',
      nested: { roles: [] }
    })
    user.nested.roles.push('admin')
    await user.save()

    expect(user.nested.roles).toEqual(['admin'])
    user.nested.roles.splice(0, user.nested.roles.length)

    expect(user.nested.roles).toEqual([])
    user.nested.roles.push('support')
    expect(user.nested.roles).toEqual(['support'])

    await user.save()
    expect(user.nested.roles).toEqual(['support'])

    const fetched = await User.findByKey(user._key)
    expect(fetched.nested.roles).toEqual(['support'])
  })
})
